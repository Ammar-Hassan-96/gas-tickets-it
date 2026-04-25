-- ═══════════════════════════════════════════════════════════
-- GAS Internal Tickets
-- إعادة بناء جدول users بحيث auth.users هو المصدر الوحيد
--
-- ما الذي يتغير:
--   1. جدول public.users يُعاد بناؤه — الـ id يكون نفس auth.uid()
--   2. أي موظف لازم يتعمل في Authentication أولاً
--   3. password_hash تُحذف (Supabase Auth بيديرها)
--   4. Trigger يمنع INSERT في public.users بدون auth.users
--
-- ترتيب التشغيل:
--   شغّل هذا الملف كاملاً في Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

SET search_path TO public;
BEGIN;

-- ══════════════════════════════════════════════════════════
-- STEP 1: حفظ البيانات الحالية مؤقتاً
-- ══════════════════════════════════════════════════════════

CREATE TEMP TABLE users_backup AS
SELECT
  u.id          AS old_id,
  au.id         AS auth_id,   -- الـ ID الصحيح من auth.users
  u.username,
  u.name,
  u.email,
  u.role,
  u.department,
  u.phone,
  u.theme_pref,
  u.is_active,
  u.created_at
FROM public.users u
LEFT JOIN auth.users au ON LOWER(u.email) = LOWER(au.email)
ORDER BY u.created_at;

-- تحقق: كم واحد عنده auth account مطابق
SELECT
  count(*) FILTER (WHERE auth_id IS NOT NULL) AS have_auth_account,
  count(*) FILTER (WHERE auth_id IS NULL)     AS missing_auth_account,
  count(*)                                     AS total
FROM users_backup;

-- ══════════════════════════════════════════════════════════
-- STEP 2: فك الـ FK constraints المرتبطة بـ users
-- ══════════════════════════════════════════════════════════

ALTER TABLE public.tickets         DROP CONSTRAINT IF EXISTS tickets_created_by_fkey;
ALTER TABLE public.tickets         DROP CONSTRAINT IF EXISTS tickets_assigned_to_fkey;
ALTER TABLE public.ticket_comments DROP CONSTRAINT IF EXISTS ticket_comments_user_id_fkey;
ALTER TABLE public.notifications   DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE public.sessions        DROP CONSTRAINT IF EXISTS sessions_user_id_fkey;
ALTER TABLE public.audit_logs      DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;

-- ══════════════════════════════════════════════════════════
-- STEP 3: حذف جدول users القديم وإنشاء جديد
-- ══════════════════════════════════════════════════════════

DROP TABLE IF EXISTS public.users CASCADE;

CREATE TABLE public.users (
  -- الـ id هو نفس auth.uid() — يربط الجدولين
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  username     TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,

  -- لا يوجد password_hash — Supabase Auth بيدير كلمات السر
  role         TEXT NOT NULL DEFAULT 'employee'
                 CHECK (role IN ('super_admin','manager','supervisor','admin','employee')),
  department   TEXT NOT NULL DEFAULT '',
  phone        TEXT,
  theme_pref   TEXT DEFAULT 'dark',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ,
  role_updated_at TIMESTAMPTZ
);

-- ══════════════════════════════════════════════════════════
-- STEP 4: إعادة إدخال البيانات بالـ IDs الصحيحة من auth.users
-- ══════════════════════════════════════════════════════════

INSERT INTO public.users (id, username, name, email, role, department, phone, theme_pref, is_active, created_at)
SELECT
  auth_id,    -- UUID من auth.users (الصحيح)
  username,
  name,
  LOWER(email),
  role,
  COALESCE(department, ''),
  NULLIF(TRIM(phone), ''),
  COALESCE(theme_pref, 'dark'),
  COALESCE(is_active, true),
  COALESCE(created_at, now())
FROM users_backup
WHERE auth_id IS NOT NULL;  -- فقط اللي عندهم auth account

-- تقرير: مين اتضاف ومين مش عنده auth account
SELECT
  username,
  email,
  role,
  CASE WHEN auth_id IS NULL THEN '❌ ليس له auth account — لازم يتعمل من Authentication أولاً'
       ELSE '✅ تم الربط' END AS status
FROM users_backup;

-- ══════════════════════════════════════════════════════════
-- STEP 5: إعادة FK constraints على الجداول الأخرى
-- مع UUID migration لو الـ IDs اتغيرت
-- ══════════════════════════════════════════════════════════

-- تحديث tickets.created_by و assigned_to للـ IDs الجديدة
UPDATE public.tickets t
SET created_by = ub.auth_id
FROM users_backup ub
WHERE t.created_by = ub.old_id AND ub.auth_id IS NOT NULL AND ub.old_id <> ub.auth_id;

UPDATE public.tickets t
SET assigned_to = ub.auth_id
FROM users_backup ub
WHERE t.assigned_to = ub.old_id AND ub.auth_id IS NOT NULL AND ub.old_id <> ub.auth_id;

-- تحديث ticket_comments
UPDATE public.ticket_comments tc
SET user_id = ub.auth_id
FROM users_backup ub
WHERE tc.user_id = ub.old_id AND ub.auth_id IS NOT NULL AND ub.old_id <> ub.auth_id;

-- تحديث notifications
UPDATE public.notifications n
SET user_id = ub.auth_id
FROM users_backup ub
WHERE n.user_id = ub.old_id AND ub.auth_id IS NOT NULL AND ub.old_id <> ub.auth_id;

-- تحديث audit_logs (لو موجود)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='audit_logs') THEN
    UPDATE public.audit_logs al
    SET user_id = ub.auth_id
    FROM users_backup ub
    WHERE al.user_id::text = ub.old_id::text AND ub.auth_id IS NOT NULL AND ub.old_id <> ub.auth_id;
  END IF;
END $$;

-- ملاحظة مهمة عن ammar.admin:
-- ammar.admin في public.users كان ID = 55927f14-...-f983
-- ammar.admin في auth.users  كان ID = adc216bf-...-da
-- بعد الـ migration: public.users بيستخدم auth ID = adc216bf-...-da
-- يعني أي ticket كانت created_by=55927f14 هتتحول لـ adc216bf ✅

-- إعادة FK constraints
ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_created_by_fkey  FOREIGN KEY (created_by)  REFERENCES public.users(id),
  ADD CONSTRAINT tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id);

ALTER TABLE public.ticket_comments
  ADD CONSTRAINT ticket_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

-- ══════════════════════════════════════════════════════════
-- STEP 6: Trigger — يمنع إضافة user بدون auth account
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION enforce_auth_user_exists()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- التحقق إن الـ id موجود في auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.id) THEN
    RAISE EXCEPTION
      'لا يمكن إضافة موظف بدون حساب Authentication. أنشئ المستخدم من Supabase Authentication أولاً. (id: %)', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_auth_user ON public.users;
CREATE TRIGGER trg_enforce_auth_user
  BEFORE INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION enforce_auth_user_exists();

-- ══════════════════════════════════════════════════════════
-- STEP 7: Trigger — مزامنة تلقائية من auth.users إلى public.users
-- لما يتعمل user جديد في Authentication، بيتعمل صف فارغ في public.users
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION sync_auth_to_public_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- لما يتعمل user جديد في auth.users، خلق صف مقابل في public.users
  INSERT INTO public.users (id, username, name, email, role, department)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'name',     split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role',       'employee'),
    COALESCE(NEW.raw_user_meta_data->>'department', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    email      = EXCLUDED.email,
    role       = COALESCE(NEW.raw_user_meta_data->>'role',       public.users.role),
    department = COALESCE(NEW.raw_user_meta_data->>'department', public.users.department),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_auth_to_public ON auth.users;
CREATE TRIGGER trg_sync_auth_to_public
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_auth_to_public_users();

-- ══════════════════════════════════════════════════════════
-- STEP 8: RLS على الجدول الجديد
-- ══════════════════════════════════════════════════════════

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- SELECT: أي user مسجّل يقدر يقرأ (للـ dropdowns والأسماء)
CREATE POLICY "users_select" ON public.users
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- INSERT: ممنوع مباشرة — لازم عبر Authentication + Trigger
-- (الـ Trigger نفسه هو اللي بيعمل الـ INSERT)
-- لو حد حاول مباشرة، الـ Trigger بيتحقق من auth.users أولاً

-- UPDATE: نفسه + super_admin + manager لموظفيه
CREATE POLICY "users_update" ON public.users
  FOR UPDATE
  USING (
    auth.uid() = id  -- يعدل نفسه
    OR (auth.jwt()->'user_metadata'->>'role' = 'super_admin')
    OR (
      auth.jwt()->'user_metadata'->>'role' = 'manager'
      AND LOWER(TRIM(COALESCE(auth.jwt()->'user_metadata'->>'department','')))
          = LOWER(TRIM(COALESCE(department,'')))
      AND role NOT IN ('super_admin','manager')
    )
  )
  WITH CHECK (
    -- ممنوع ترقية نفسك أو غيرك لـ super_admin إلا لو أنت super_admin
    (auth.jwt()->'user_metadata'->>'role' = 'super_admin') OR role <> 'super_admin'
  );

-- DELETE: super_admin أو manager لموظفيه فقط
CREATE POLICY "users_delete" ON public.users
  FOR DELETE
  USING (
    (
      auth.jwt()->'user_metadata'->>'role' = 'super_admin'
      AND id <> auth.uid()
    )
    OR (
      auth.jwt()->'user_metadata'->>'role' = 'manager'
      AND LOWER(TRIM(COALESCE(auth.jwt()->'user_metadata'->>'department','')))
          = LOWER(TRIM(COALESCE(department,'')))
      AND role NOT IN ('super_admin','manager')
      AND id <> auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════════
-- STEP 9: تنظيف sessions القديمة (مش محتاجة بعد Supabase Auth)
-- ══════════════════════════════════════════════════════════

-- نسيب الجدول موجود للـ backward compat لكن نفضيه
TRUNCATE public.sessions;

-- ══════════════════════════════════════════════════════════
-- STEP 10: تحقق نهائي
-- ══════════════════════════════════════════════════════════

COMMIT;

-- التقرير النهائي
SELECT
  '✅ إعادة البناء اكتملت' AS status,
  count(*) AS users_in_public_users
FROM public.users;

SELECT
  u.username,
  u.email,
  u.role,
  u.department,
  '✅ مرتبط بـ auth.users' AS auth_status
FROM public.users u
ORDER BY u.role, u.username;

-- تنبيه: المستخدمين اللي ما كانوش في auth.users لم يُضافوا
SELECT
  b.username,
  b.email,
  '⚠️ لم يُضف — ليس له auth account' AS note
FROM users_backup b
WHERE b.auth_id IS NULL;
