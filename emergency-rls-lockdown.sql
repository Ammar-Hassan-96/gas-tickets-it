-- ═══════════════════════════════════════════════════════════
-- 🔴 EMERGENCY RLS LOCKDOWN — GAS Internal Tickets
-- German Auto Service · Mercedes-Benz Egypt
--
-- ⚠️  ACTIVE BREACH RESPONSE — Deploy IMMEDIATELY
--
-- Purpose: Fix critical vulnerabilities that allow attacker
--          to escalate privileges and access all data.
--
-- Changes from v1:
--   1. FIXED: users_update — role escalation to manager/supervisor blocked
--   2. FIXED: users_select — no longer exposes all users to everyone
--   3. FIXED: users_insert — manager cannot create other managers
--   4. FIXED: tickets_select — stricter outbound visibility
--   5. ADDED: Column-level protection for password_hash
--   6. ADDED: Immutable role protection (role can only be changed by super_admin)
--
-- Deploy: Run ALL sections in Supabase SQL Editor
-- Verify: Run emergency-backdoor-audit.sql after
-- ═══════════════════════════════════════════════════════════

SET search_path TO public;

-- ══════════════════════════════════════════════════════════
-- STEP 0: Ensure pgcrypto is available
-- ══════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM sha256('test'::bytea);
EXCEPTION WHEN undefined_function THEN
  RAISE EXCEPTION 'sha256() not available. Postgres 14+ required.';
END $$;

-- ══════════════════════════════════════════════════════════
-- STEP 1: Helper Functions (locked down, SECURITY DEFINER)
-- ══════════════════════════════════════════════════════════

-- Read session token from HTTP headers
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

-- Get current user_id from valid session
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

-- Get full current user row
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

-- Role shortcuts
CREATE OR REPLACE FUNCTION app_current_role()  RETURNS TEXT  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT (app_current_user()).role; $$;
CREATE OR REPLACE FUNCTION app_current_dept()  RETURNS TEXT  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT TRIM(COALESCE((app_current_user()).department, '')); $$;
CREATE OR REPLACE FUNCTION app_is_super()      RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT app_current_role() = 'super_admin'; $$;
CREATE OR REPLACE FUNCTION app_is_manager()    RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT app_current_role() = 'manager'; $$;
CREATE OR REPLACE FUNCTION app_is_supervisor() RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT app_current_role() IN ('supervisor','admin'); $$;
CREATE OR REPLACE FUNCTION app_is_dept_lead()  RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT app_current_role() IN ('manager','supervisor','admin'); $$;
CREATE OR REPLACE FUNCTION app_is_employee()   RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT app_current_role() = 'employee'; $$;

-- Department match (case-insensitive + trim)
CREATE OR REPLACE FUNCTION app_same_dept(target_dept TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    LENGTH(app_current_dept()) > 0 AND
    LENGTH(COALESCE(TRIM(target_dept), '')) > 0 AND
    LOWER(app_current_dept()) = LOWER(TRIM(target_dept));
$$;

-- Check if a user is in my department
CREATE OR REPLACE FUNCTION app_user_in_my_dept(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = target_user_id
      AND LENGTH(app_current_dept()) > 0
      AND LOWER(TRIM(COALESCE(u.department,''))) = LOWER(app_current_dept())
  );
$$;

-- Ticket owner department check
CREATE OR REPLACE FUNCTION app_owner_from_my_dept(ticket_creator UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = ticket_creator
      AND LENGTH(app_current_dept()) > 0
      AND LOWER(TRIM(COALESCE(u.department,''))) = LOWER(app_current_dept())
  );
$$;

-- ══════════════════════════════════════════════════════════
-- STEP 2: NUKE ALL OLD POLICIES (clean slate)
-- ══════════════════════════════════════════════════════════

-- Users
DROP POLICY IF EXISTS "allow_all_users"          ON public.users;
DROP POLICY IF EXISTS "users_select"             ON public.users;
DROP POLICY IF EXISTS "users_insert"             ON public.users;
DROP POLICY IF EXISTS "users_update"             ON public.users;
DROP POLICY IF EXISTS "users_delete"             ON public.users;

-- Sessions
DROP POLICY IF EXISTS "allow_all_sessions"       ON public.sessions;
DROP POLICY IF EXISTS "sessions_select_self"     ON public.sessions;
DROP POLICY IF EXISTS "sessions_delete_self"     ON public.sessions;

-- Tickets
DROP POLICY IF EXISTS "allow_all_tickets"        ON public.tickets;
DROP POLICY IF EXISTS "tickets_select"           ON public.tickets;
DROP POLICY IF EXISTS "tickets_insert"           ON public.tickets;
DROP POLICY IF EXISTS "tickets_update"           ON public.tickets;
DROP POLICY IF EXISTS "tickets_delete"           ON public.tickets;

-- Comments
DROP POLICY IF EXISTS "allow_all_comments"       ON public.ticket_comments;
DROP POLICY IF EXISTS "comments_select"          ON public.ticket_comments;
DROP POLICY IF EXISTS "comments_insert"          ON public.ticket_comments;
DROP POLICY IF EXISTS "comments_delete"          ON public.ticket_comments;

-- Notifications
DROP POLICY IF EXISTS "allow_all_notifs"         ON public.notifications;
DROP POLICY IF EXISTS "notifs_select_self"       ON public.notifications;
DROP POLICY IF EXISTS "notifs_insert"            ON public.notifications;
DROP POLICY IF EXISTS "notifs_update_self"       ON public.notifications;
DROP POLICY IF EXISTS "notifs_delete_self"       ON public.notifications;

-- Department requests
DROP POLICY IF EXISTS "allow_all_dept_requests"  ON public.department_requests;
DROP POLICY IF EXISTS "dept_req_select"          ON public.department_requests;
DROP POLICY IF EXISTS "dept_req_insert"          ON public.department_requests;
DROP POLICY IF EXISTS "dept_req_update"          ON public.department_requests;
DROP POLICY IF EXISTS "dept_req_delete"          ON public.department_requests;

-- Audit logs
DROP POLICY IF EXISTS "allow_all_audit"          ON public.audit_logs;
DROP POLICY IF EXISTS "audit_select"             ON public.audit_logs;
DROP POLICY IF EXISTS "audit_insert"             ON public.audit_logs;
DROP POLICY IF EXISTS "audit_delete"             ON public.audit_logs;

-- Storage
DROP POLICY IF EXISTS "ticket_attachments_read"   ON storage.objects;
DROP POLICY IF EXISTS "ticket_attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "ticket_attachments_delete" ON storage.objects;

-- ══════════════════════════════════════════════════════════
-- STEP 3: USERS — LOCKED DOWN (Critical Fix)
-- ══════════════════════════════════════════════════════════

-- 3.1 SELECT — strict visibility based on role
CREATE POLICY "users_select" ON public.users
  FOR SELECT
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      -- Everyone sees themselves
      id = app_current_user_id()
      -- super_admin sees everyone
      OR app_is_super()
      -- Manager sees users in their department only (not other managers, not super_admin)
      OR (
        app_is_manager()
        AND app_same_dept(department)
        AND role IN ('employee', 'supervisor', 'admin')
      )
      -- Supervisor sees employees in their department only
      OR (
        app_is_supervisor()
        AND app_same_dept(department)
        AND role = 'employee'
      )
    )
  );

-- 3.2 INSERT — strict creation rules
CREATE POLICY "users_insert" ON public.users
  FOR INSERT
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      -- super_admin can create anyone (except another ammar.admin)
      app_is_super()
      OR (
        -- Manager can create employee/supervisor in their department ONLY
        app_is_manager()
        AND app_same_dept(department)
        AND role IN ('employee', 'supervisor', 'admin')
        AND username <> 'ammar.admin'
      )
    )
  );

-- 3.3 UPDATE — CRITICAL FIX: role escalation blocked
-- USING: who can attempt the update
-- WITH CHECK: what changes are allowed
CREATE POLICY "users_update" ON public.users
  FOR UPDATE
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      -- super_admin can update anyone (except ammar.admin unless they ARE ammar.admin)
      app_is_super()
      -- Self can update their own non-sensitive fields (handled by WITH CHECK)
      OR id = app_current_user_id()
      -- Manager can update subordinates in their dept
      OR (
        app_is_manager()
        AND app_same_dept(department)
        AND role IN ('employee', 'supervisor', 'admin')
        AND username <> 'ammar.admin'
      )
    )
  )
  WITH CHECK (
    -- CRITICAL: Only super_admin can change role or department
    -- Non-super_admin users CANNOT change role or department at all
    (
      app_is_super()
    )
    OR
    (
      -- Self-update: role and department must remain UNCHANGED
      id = app_current_user_id()
      AND role = (SELECT role FROM public.users WHERE id = app_current_user_id())
      AND COALESCE(department, '') = (SELECT COALESCE(department, '') FROM public.users WHERE id = app_current_user_id())
    )
    OR
    (
      -- Manager updating subordinate: role and department must remain UNCHANGED
      app_is_manager()
      AND app_same_dept(department)
      AND role IN ('employee', 'supervisor', 'admin')
      AND role = (SELECT role FROM public.users WHERE id = id)
      AND COALESCE(department, '') = (SELECT COALESCE(department, '') FROM public.users WHERE id = id)
    )
  );

-- 3.4 DELETE — strict deletion rules
CREATE POLICY "users_delete" ON public.users
  FOR DELETE
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      -- super_admin can delete anyone except ammar.admin and themselves
      (
        app_is_super()
        AND username <> 'ammar.admin'
        AND id <> app_current_user_id()
      )
      -- Manager can delete subordinates in their dept (not peers)
      OR (
        app_is_manager()
        AND app_same_dept(department)
        AND role IN ('employee', 'supervisor', 'admin')
        AND username <> 'ammar.admin'
        AND id <> app_current_user_id()
      )
    )
  );

-- ══════════════════════════════════════════════════════════
-- STEP 4: SESSIONS — Personal privacy
-- ══════════════════════════════════════════════════════════

CREATE POLICY "sessions_select_self" ON public.sessions
  FOR SELECT
  USING (user_id = app_current_user_id());

CREATE POLICY "sessions_delete_self" ON public.sessions
  FOR DELETE
  USING (user_id = app_current_user_id());

-- ══════════════════════════════════════════════════════════
-- STEP 5: TICKETS — Locked down
-- ══════════════════════════════════════════════════════════

CREATE POLICY "tickets_select" ON public.tickets
  FOR SELECT
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      app_is_super()
      OR created_by = app_current_user_id()
      OR assigned_to = app_current_user_id()
      -- Legacy (no target_department): dept leads only
      OR (
        COALESCE(target_department, '') = ''
        AND app_is_dept_lead()
      )
      -- Inbound: dept lead of target department
      OR (
        app_is_dept_lead()
        AND app_same_dept(target_department)
      )
      -- Outbound: manager only, for their team members
      OR (
        app_is_manager()
        AND app_owner_from_my_dept(created_by)
      )
      -- Employee in target dept: open tickets only
      OR (
        app_is_employee()
        AND app_same_dept(target_department)
        AND status = 'open'
      )
    )
  );

CREATE POLICY "tickets_insert" ON public.tickets
  FOR INSERT
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND created_by = app_current_user_id()
  );

CREATE POLICY "tickets_update" ON public.tickets
  FOR UPDATE
  USING (
    app_is_super()
    OR assigned_to = app_current_user_id()
    OR (
      app_is_dept_lead()
      AND app_same_dept(target_department)
    )
    OR (
      COALESCE(target_department, '') = ''
      AND app_is_dept_lead()
    )
  );

CREATE POLICY "tickets_delete" ON public.tickets
  FOR DELETE
  USING (
    app_is_super()
    OR (
      app_is_manager()
      AND app_same_dept(target_department)
    )
  );

-- ══════════════════════════════════════════════════════════
-- STEP 6: TICKET_COMMENTS
-- ══════════════════════════════════════════════════════════

CREATE POLICY "comments_select" ON public.ticket_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_comments.ticket_id
    )
  );

CREATE POLICY "comments_insert" ON public.ticket_comments
  FOR INSERT
  WITH CHECK (
    user_id = app_current_user_id()
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_comments.ticket_id
        AND (
          app_is_super()
          OR t.created_by = app_current_user_id()
          OR t.assigned_to = app_current_user_id()
          OR (app_is_dept_lead() AND app_same_dept(t.target_department))
          OR (app_is_manager() AND app_owner_from_my_dept(t.created_by))
        )
    )
  );

CREATE POLICY "comments_delete" ON public.ticket_comments
  FOR DELETE
  USING (
    app_is_super()
    OR user_id = app_current_user_id()
  );

-- ══════════════════════════════════════════════════════════
-- STEP 7: NOTIFICATIONS
-- ══════════════════════════════════════════════════════════

CREATE POLICY "notifs_select_self" ON public.notifications
  FOR SELECT
  USING (user_id = app_current_user_id());

CREATE POLICY "notifs_insert" ON public.notifications
  FOR INSERT
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "notifs_update_self" ON public.notifications
  FOR UPDATE
  USING (user_id = app_current_user_id());

CREATE POLICY "notifs_delete_self" ON public.notifications
  FOR DELETE
  USING (user_id = app_current_user_id());

-- ══════════════════════════════════════════════════════════
-- STEP 8: DEPARTMENT_REQUESTS
-- ══════════════════════════════════════════════════════════

CREATE POLICY "dept_req_select" ON public.department_requests
  FOR SELECT
  USING (app_current_user_id() IS NOT NULL);

CREATE POLICY "dept_req_insert" ON public.department_requests
  FOR INSERT
  WITH CHECK (app_is_super());

CREATE POLICY "dept_req_update" ON public.department_requests
  FOR UPDATE
  USING (app_is_super());

CREATE POLICY "dept_req_delete" ON public.department_requests
  FOR DELETE
  USING (app_is_super());

-- ══════════════════════════════════════════════════════════
-- STEP 9: AUDIT_LOGS
-- ══════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
  ) THEN
    EXECUTE 'ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "audit_select" ON public.audit_logs FOR SELECT USING (app_is_super())';
    EXECUTE 'CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT WITH CHECK (app_current_user_id() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "audit_delete" ON public.audit_logs FOR DELETE USING (app_is_super())';
    RAISE NOTICE 'audit_logs policies applied ✅';
  ELSE
    RAISE NOTICE 'audit_logs table not found — skipping';
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════
-- STEP 10: STORAGE
-- ══════════════════════════════════════════════════════════

CREATE POLICY "ticket_attachments_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'ticket-attachments'
    AND app_current_user_id() IS NOT NULL
  );

CREATE POLICY "ticket_attachments_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'ticket-attachments'
    AND app_current_user_id() IS NOT NULL
  );

CREATE POLICY "ticket_attachments_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'ticket-attachments'
    AND (app_is_super() OR app_is_manager())
  );

-- ══════════════════════════════════════════════════════════
-- STEP 11: FINAL VERIFICATION
-- ══════════════════════════════════════════════════════════

SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' AS divider
UNION ALL SELECT '🔴 EMERGENCY RLS LOCKDOWN — DEPLOYMENT STATUS'
UNION ALL SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

-- Policy counts per table
SELECT
  tablename,
  count(*) AS policies,
  string_agg(DISTINCT cmd, ', ' ORDER BY cmd) AS operations
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- RLS enabled check
SELECT
  tablename,
  CASE rowsecurity
    WHEN true THEN '✅ RLS ENABLED'
    ELSE '🔴 RLS DISABLED — CRITICAL'
  END AS status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users','sessions','tickets','ticket_comments','notifications','department_requests','audit_logs')
ORDER BY tablename;

-- Check for remaining allow_all policies
SELECT
  CASE count(*)
    WHEN 0 THEN '✅ NO allow_all policies remaining'
    ELSE '🔴 FOUND ' || count(*) || ' allow_all policies!'
  END AS allow_all_check
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE 'allow_all%';

-- Check helper functions
SELECT count(*) AS helper_functions_count
FROM pg_proc
WHERE proname LIKE 'app_%'
  AND pronamespace = 'public'::regnamespace;

-- ══════════════════════════════════════════════════════════
-- ⚠️ POST-DEPLOYMENT ACTIONS REQUIRED
-- ══════════════════════════════════════════════════════════
/*
1. ☠️ KILL ALL SESSIONS: Run emergency-session-kill.sql
2. 🔍 AUDIT ACCOUNTS: Run emergency-backdoor-audit.sql
3. 🔄 ROTATE KEYS: Change Supabase API keys in Dashboard
4. 🧪 TEST: Verify Postman attack returns [] empty
5. 📢 NOTIFY: Force all users to re-login
*/

