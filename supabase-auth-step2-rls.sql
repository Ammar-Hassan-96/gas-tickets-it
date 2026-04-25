-- ═══════════════════════════════════════════════════════════
-- GAS Internal Tickets — Supabase Auth Migration
-- STEP 2 of 3: RLS Policies الجديدة باستخدام auth.uid()
--
-- استبدال كل app_current_user_id() بـ auth.uid()
-- استبدال كل app_is_super() بـ is_super_admin()
-- ═══════════════════════════════════════════════════════════

SET search_path TO public;

-- ══ إزالة الـ policies القديمة كلها ════════════════════════
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
  RAISE NOTICE 'All old policies dropped ✅';
END $$;

-- ══ USERS ══════════════════════════════════════════════════

-- SELECT: أي user مسجّل يقدر يقرأ (عشان dropdowns)
CREATE POLICY "users_select"
ON public.users FOR SELECT
USING (auth.uid() IS NOT NULL);

-- INSERT: super_admin أو manager لإدارته فقط
CREATE POLICY "users_insert"
ON public.users FOR INSERT
WITH CHECK (
  is_super_admin()
  OR (
    is_manager()
    AND same_dept(department)
    AND role IN ('employee', 'supervisor', 'admin')
    AND username <> 'ammar.admin'
  )
);

-- UPDATE: نفسه + super_admin + manager لموظفيه
CREATE POLICY "users_update"
ON public.users FOR UPDATE
USING (
  is_super_admin()
  OR id = auth.uid()
  OR (
    is_manager()
    AND same_dept(department)
    AND role IN ('employee', 'supervisor', 'admin')
    AND username <> 'ammar.admin'
  )
)
WITH CHECK (
  -- حماية: منع رفع أي شخص لـ super_admin إلا من super_admin
  is_super_admin() OR role <> 'super_admin'
);

-- DELETE: super_admin + manager لموظفي إدارته
CREATE POLICY "users_delete"
ON public.users FOR DELETE
USING (
  (is_super_admin() AND username <> 'ammar.admin' AND id <> auth.uid())
  OR (
    is_manager()
    AND same_dept(department)
    AND role IN ('employee', 'supervisor', 'admin')
    AND username <> 'ammar.admin'
    AND id <> auth.uid()
  )
);

-- ══ TICKETS ════════════════════════════════════════════════

-- SELECT: حسب الدور والإدارة (inbound/outbound)
CREATE POLICY "tickets_select"
ON public.tickets FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    is_super_admin()
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR (COALESCE(target_department,'') = '' AND is_dept_lead())
    OR (is_dept_lead() AND same_dept(target_department))
    OR (is_manager() AND owner_from_my_dept(created_by))
    OR (auth_get_role() = 'employee' AND same_dept(target_department) AND status = 'open')
  )
);

-- INSERT: أي user مسجّل، لكن created_by = نفسه فقط
CREATE POLICY "tickets_insert"
ON public.tickets FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND created_by = auth.uid()
);

-- UPDATE: super_admin + قيادة الإدارة المستهدفة + المعيّن
CREATE POLICY "tickets_update"
ON public.tickets FOR UPDATE
USING (
  is_super_admin()
  OR assigned_to = auth.uid()
  OR (is_dept_lead() AND same_dept(target_department))
  OR (COALESCE(target_department,'') = '' AND is_dept_lead())
);

-- DELETE: super_admin + manager الإدارة المستهدفة
CREATE POLICY "tickets_delete"
ON public.tickets FOR DELETE
USING (
  is_super_admin()
  OR (is_manager() AND same_dept(target_department))
);

-- ══ TICKET_COMMENTS ════════════════════════════════════════

CREATE POLICY "comments_select"
ON public.ticket_comments FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_comments.ticket_id
  )
);

CREATE POLICY "comments_insert"
ON public.ticket_comments FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_comments.ticket_id
      AND (
        is_super_admin()
        OR t.created_by = auth.uid()
        OR t.assigned_to = auth.uid()
        OR (is_dept_lead() AND same_dept(t.target_department))
        OR (is_manager() AND owner_from_my_dept(t.created_by))
      )
  )
);

CREATE POLICY "comments_delete"
ON public.ticket_comments FOR DELETE
USING (is_super_admin() OR user_id = auth.uid());

-- ══ NOTIFICATIONS ══════════════════════════════════════════

CREATE POLICY "notifs_select"
ON public.notifications FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "notifs_insert"
ON public.notifications FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "notifs_update"
ON public.notifications FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "notifs_delete"
ON public.notifications FOR DELETE
USING (user_id = auth.uid());

-- ══ DEPARTMENT_REQUESTS ════════════════════════════════════

CREATE POLICY "dept_req_select"
ON public.department_requests FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "dept_req_insert"
ON public.department_requests FOR INSERT
WITH CHECK (is_super_admin());

CREATE POLICY "dept_req_update"
ON public.department_requests FOR UPDATE
USING (is_super_admin());

CREATE POLICY "dept_req_delete"
ON public.department_requests FOR DELETE
USING (is_super_admin());

-- ══ AUDIT_LOGS ═════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs' AND table_schema = 'public') THEN
    EXECUTE 'CREATE POLICY "audit_select" ON public.audit_logs FOR SELECT USING (is_super_admin())';
    EXECUTE 'CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "audit_delete" ON public.audit_logs FOR DELETE USING (is_super_admin())';
    RAISE NOTICE 'audit_logs policies created ✅';
  END IF;
END $$;

-- ══ SESSIONS (لو موجود — backward compat فقط) ══════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sessions' AND table_schema = 'public') THEN
    EXECUTE 'CREATE POLICY "sessions_select" ON public.sessions FOR SELECT USING (user_id = auth.uid())';
    EXECUTE 'CREATE POLICY "sessions_delete" ON public.sessions FOR DELETE USING (user_id = auth.uid())';
    RAISE NOTICE 'sessions policies created ✅';
  END IF;
END $$;

-- ══ تحقق نهائي ═════════════════════════════════════════════
SELECT
  tablename,
  count(*) AS policy_count,
  string_agg(policyname, ', ' ORDER BY policyname) AS policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
