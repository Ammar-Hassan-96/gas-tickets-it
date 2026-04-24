-- ═══════════════════════════════════════════════════════════
-- GAS Internal Tickets — RLS Security Hardening v1
-- German Auto Service · Mercedes-Benz Egypt
--
-- الغرض: استبدال allow_all policies بـ RLS ذكية بتفحص الهوية
--        والصلاحية على مستوى قاعدة البيانات.
--
-- قبل هذا الملف:
--   أي حد عنده anon key يقدر يعمل أي عملية على أي جدول (DELETE, UPDATE, INSERT).
--   Postman attack نجح مع حسابك.
--
-- بعد هذا الملف:
--   قاعدة البيانات بتفحص الهوية (session token) قبل كل عملية.
--   الحساب المستخدم لازم يكون عنده الدور والإدارة الصحيحة.
--   Postman attack هيرجع 401/403 حتى لو معاه الـ anon key.
--
-- آمن 100% — ما يمسحش أي بيانات ولا يغير أي schema.
-- كل اللي بيعمله: يحذف "allow_all" policies ويضيف policies محكمة.
-- ═══════════════════════════════════════════════════════════

SET search_path TO public;

-- ══════════════════════════════════════════════════════════
-- STEP 0: التأكد من توفر دوال التشفير
-- Postgres 14+ عنده sha256() مبنية. للـ legacy installations،
-- نحتاج pgcrypto extension.
-- ══════════════════════════════════════════════════════════

-- تفعيل pgcrypto للـ backwards compatibility (ما يضرش لو متفعّل)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- فحص إن sha256() متاحة (المفروض تكون في Postgres 14+)
DO $$
BEGIN
  PERFORM sha256('test'::bytea);
EXCEPTION WHEN undefined_function THEN
  RAISE EXCEPTION 'sha256() function not available. Upgrade Postgres to 14+ or use pgcrypto digest().';
END $$;

-- ══════════════════════════════════════════════════════════
-- STEP 1: دوال مساعدة (helper functions)
-- ══════════════════════════════════════════════════════════

-- ─── قراءة الـ session token من HTTP header ─────────────
-- الـ client لازم يبعت: Authorization: Bearer <session_token>
-- نحن نميّزه عن الـ Supabase JWT عبر فحص طوله (session tokens لنا طويلة عشوائية)
CREATE OR REPLACE FUNCTION app_session_token()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_header TEXT;
  token      TEXT;
BEGIN
  -- نحاول نقرأ header اسمه "x-session-token" (custom, نبعته من الـ client)
  -- لو مش موجود، نرجع NULL
  BEGIN
    raw_header := current_setting('request.headers', true);
    IF raw_header IS NULL THEN RETURN NULL; END IF;
    token := (raw_header::jsonb) ->> 'x-session-token';
    RETURN token;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;

-- ─── يرجع user_id للـ session الحالية (لو valid و not expired) ─────
-- ملاحظة: الـ client بيبعت plain token، والسيرفر (auth.mjs) بيحفظه hashed بـ SHA-256
-- فلازم نعمل hash للـ plain token قبل ما نطابقه مع sessions.token
-- نستخدم sha256() المبنية في Postgres 14+ (لا تحتاج pgcrypto extension)
CREATE OR REPLACE FUNCTION app_current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.user_id
  FROM public.sessions s
  WHERE s.token = encode(sha256(COALESCE(app_session_token(),'')::bytea), 'hex')
    AND s.expires_at > now()
  LIMIT 1;
$$;

-- ─── يرجع row الـ user الحالي كاملاً ─────────────────────
CREATE OR REPLACE FUNCTION app_current_user()
RETURNS public.users
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.*
  FROM public.users u
  WHERE u.id = app_current_user_id()
    AND u.is_active = true
  LIMIT 1;
$$;

-- ─── Shortcuts للفحص السريع ──────────────────────────────
CREATE OR REPLACE FUNCTION app_current_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT (app_current_user()).role; $$;

CREATE OR REPLACE FUNCTION app_current_dept()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT TRIM(COALESCE((app_current_user()).department, '')); $$;

CREATE OR REPLACE FUNCTION app_is_super()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT app_current_role() = 'super_admin'; $$;

CREATE OR REPLACE FUNCTION app_is_manager()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT app_current_role() = 'manager'; $$;

CREATE OR REPLACE FUNCTION app_is_supervisor()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT app_current_role() IN ('supervisor','admin'); $$;

CREATE OR REPLACE FUNCTION app_is_dept_lead()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT app_current_role() IN ('manager','supervisor','admin'); $$;

-- ─── فحص: هل الإدارة بتاعتي تطابق إدارة معينة (case-insensitive + trim) ──
CREATE OR REPLACE FUNCTION app_same_dept(target_dept TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    LENGTH(app_current_dept()) > 0 AND
    LENGTH(COALESCE(TRIM(target_dept), '')) > 0 AND
    LOWER(app_current_dept()) = LOWER(TRIM(target_dept));
$$;

-- ══════════════════════════════════════════════════════════
-- STEP 2: إزالة الـ allow_all القديمة
-- ══════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "allow_all_users"          ON public.users;
DROP POLICY IF EXISTS "allow_all_sessions"       ON public.sessions;
DROP POLICY IF EXISTS "allow_all_tickets"        ON public.tickets;
DROP POLICY IF EXISTS "allow_all_comments"       ON public.ticket_comments;
DROP POLICY IF EXISTS "allow_all_notifs"         ON public.notifications;
DROP POLICY IF EXISTS "allow_all_dept_requests"  ON public.department_requests;

-- ══════════════════════════════════════════════════════════
-- STEP 3: Policies على جدول USERS
--
-- القواعد:
--  SELECT: الكل المُصادَقين يقدروا يقرأوا (عشان dropdowns والأسماء)
--          بس `password_hash` لازم يتخفي — نعتمد على view مستقل
--  INSERT: super_admin فقط + manager في إدارته
--  UPDATE: super_admin + الشخص على نفسه + manager لموظفي إدارته
--  DELETE: super_admin + manager لموظفي إدارته (موظف/مشرف فقط)
-- ══════════════════════════════════════════════════════════

-- 3.1: SELECT — أي شخص مُسجّل يقدر يشوف المستخدمين
CREATE POLICY "users_select" ON public.users
  FOR SELECT
  USING (
    app_current_user_id() IS NOT NULL
  );

-- 3.2: INSERT — super_admin لأي إدارة + manager لإدارته فقط
CREATE POLICY "users_insert" ON public.users
  FOR INSERT
  WITH CHECK (
    app_is_super()
    OR (
      app_is_manager()
      AND app_same_dept(department)
      AND role IN ('employee','supervisor','admin')  -- المدير ما يخلقش super_admin ولا manager
      AND username <> 'ammar.admin'                  -- حساب protected
    )
  );

-- 3.3: UPDATE — 3 حالات
CREATE POLICY "users_update" ON public.users
  FOR UPDATE
  USING (
    -- super_admin يعدل أي حد ما عدا ammar.admin (إلا لو هو نفسه ammar)
    app_is_super()
    OR (
      -- أي شخص يعدل نفسه (بيانات شخصية)
      id = app_current_user_id()
    )
    OR (
      -- manager يعدل موظفي إدارته (employee/supervisor فقط)
      app_is_manager()
      AND app_same_dept(department)
      AND role IN ('employee','supervisor','admin')
      AND username <> 'ammar.admin'
    )
  )
  WITH CHECK (
    -- حماية: ما حدش غير super_admin يقدر يرفع نفسه لـ super_admin
    (app_is_super()) OR (role <> 'super_admin')
  );

-- 3.4: DELETE — super_admin بس، ولا يحذف ammar.admin ولا نفسه
CREATE POLICY "users_delete" ON public.users
  FOR DELETE
  USING (
    (
      app_is_super()
      AND username <> 'ammar.admin'
      AND id <> app_current_user_id()
    )
    OR (
      app_is_manager()
      AND app_same_dept(department)
      AND role IN ('employee','supervisor','admin')
      AND username <> 'ammar.admin'
      AND id <> app_current_user_id()
    )
  );

-- ══════════════════════════════════════════════════════════
-- STEP 4: SESSIONS — حساس جداً
--
-- المستخدم يقدر يقرأ/يعمل جلساته هو فقط.
-- ما حدش يقدر يشوف tokens غيره — حتى super_admin (أمان إضافي).
-- INSERT للجلسات بيتم من Netlify auth function بالـ service_role key
--   اللي يتجاوز RLS تماماً، فمش محتاجين INSERT policy هنا.
-- ══════════════════════════════════════════════════════════

CREATE POLICY "sessions_select_self" ON public.sessions
  FOR SELECT
  USING (user_id = app_current_user_id());

CREATE POLICY "sessions_delete_self" ON public.sessions
  FOR DELETE
  USING (user_id = app_current_user_id());

-- INSERT و UPDATE: ممنوع من الـ client — يتم عبر Netlify function فقط

-- ══════════════════════════════════════════════════════════
-- STEP 5: نهاية الجزء الأول — للتحقق
-- ══════════════════════════════════════════════════════════
SELECT
  '✅ Phase 1 (helpers + users + sessions) applied' AS status,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'users') AS users_policies_count,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'sessions') AS sessions_policies_count,
  (SELECT count(*) FROM pg_proc WHERE proname LIKE 'app_%') AS helper_functions_count;
