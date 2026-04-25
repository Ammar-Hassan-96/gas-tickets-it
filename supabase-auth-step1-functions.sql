-- ═══════════════════════════════════════════════════════════
-- GAS Internal Tickets — Supabase Auth Migration
-- STEP 1 of 3: إنشاء users في Supabase Auth + ربط بالجدول الحالي
--
-- الفكرة:
--   1. كل user في جدول public.users هيتربط بـ auth.users
--   2. الـ ID في public.users هيبقى نفس الـ UUID في auth.users
--   3. الـ role و department هيتخزنوا في user_metadata داخل auth.users
--   4. RLS هتستخدم auth.uid() + auth.jwt() بدل app_current_user_id()
--
-- بعد تشغيل هذا الملف:
--   - كل مستخدم عنده email + password في Supabase Auth
--   - كل مستخدم لازم يعمل "Forgot Password" أو نبعتله email
--   - الـ sessions table بتبقى موجودة للـ backward compat بس مش بتستخدم
-- ═══════════════════════════════════════════════════════════

-- ══ STEP 1: إضافة emails للمستخدمين اللي مالهمش ═══════════
UPDATE public.users SET email = 'karim.ahmed@gas.internal'    WHERE username = 'Karim_Ahmed'  AND (email IS NULL OR email = '');
UPDATE public.users SET email = 'ammar.hassan@gas.internal'   WHERE username = 'Ammar_Hassan' AND (email IS NULL OR email = '');
UPDATE public.users SET email = 'fam.fayek@gas.internal'      WHERE username = 'Fam_Fayek'    AND (email IS NULL OR email = '');
UPDATE public.users SET email = 'manager@gas.internal'        WHERE username = 'Manager'      AND (email IS NULL OR email = '');
UPDATE public.users SET email = 'ahmed.sobhy@gas.internal'    WHERE username = 'Ahmed_Sobhy'  AND (email IS NULL OR email = '');
-- ammar.admin و bishoy.samir عندهم emails فعلية — مش هنغيرهم

-- تحقق
SELECT username, email, role, department FROM public.users ORDER BY role;

-- ══ STEP 2: إنشاء Trigger يحافظ على التزامن ═══════════════
-- لما يتعمل user جديد في public.users، يتعمل في auth.users تلقائياً
-- (ده هيتعمل من app الجديد، مش من هنا)

-- ══ STEP 3: Function لجلب role من JWT ════════════════════
-- الـ app الجديد هيبعت JWT، وفيه user_metadata
-- هنقرأ منه مباشرة بدون أي lookup

CREATE OR REPLACE FUNCTION auth_get_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- من JWT user_metadata (الطريقة الجديدة)
    (auth.jwt() -> 'user_metadata' ->> 'role'),
    -- fallback: من public.users (للتوافق المؤقت)
    (SELECT role FROM public.users WHERE id = auth.uid()),
    -- default
    'employee'
  );
$$;

CREATE OR REPLACE FUNCTION auth_get_dept()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT TRIM(COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'department'),
    (SELECT department FROM public.users WHERE id = auth.uid()),
    ''
  ));
$$;

-- Shortcuts
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT auth_get_role() = 'super_admin'; $$;

CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT auth_get_role() = 'manager'; $$;

CREATE OR REPLACE FUNCTION is_supervisor()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT auth_get_role() IN ('supervisor', 'admin'); $$;

CREATE OR REPLACE FUNCTION is_dept_lead()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT auth_get_role() IN ('manager', 'supervisor', 'admin'); $$;

CREATE OR REPLACE FUNCTION same_dept(target_dept TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    LENGTH(auth_get_dept()) > 0
    AND LENGTH(TRIM(COALESCE(target_dept, ''))) > 0
    AND LOWER(auth_get_dept()) = LOWER(TRIM(target_dept));
$$;

CREATE OR REPLACE FUNCTION owner_from_my_dept(creator_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = creator_id
      AND LENGTH(auth_get_dept()) > 0
      AND LOWER(TRIM(COALESCE(u.department, ''))) = LOWER(auth_get_dept())
  );
$$;

-- ══ STEP 4: تحقق ═════════════════════════════════════════
SELECT
  'Step 1 complete ✅' AS status,
  count(*) AS users_with_email
FROM public.users
WHERE email IS NOT NULL AND email <> '';
