-- ═══════════════════════════════════════════════════════════
-- GAS Internal Tickets — RLS Security Hardening v1 — Part 2
-- Part 1 لازم يتشغل قبل هذا الملف.
--
-- هذا الجزء: tickets, ticket_comments, notifications, department_requests
-- ═══════════════════════════════════════════════════════════

SET search_path TO public;

-- ══════════════════════════════════════════════════════════
-- TICKETS — قلب الأمان
--
-- قواعد الرؤية (SELECT):
--   ✓ super_admin: كل التيكتات
--   ✓ صاحب الطلب (created_by): دايماً يشوفه
--   ✓ المُعيّن عليه (assigned_to): يشوفه
--   ✓ قيادة الإدارة المستهدفة (manager/supervisor للـ target_department): Inbound
--   ✓ المدير فقط: يشوف الطلبات الصادرة من موظفيه (Outbound)
--   ✓ موظف في نفس الإدارة المستهدفة: يشوف الـ open فقط
--
-- قواعد التعديل (UPDATE):
--   ✓ super_admin
--   ✓ قيادة الإدارة المستهدفة (Inbound) تحدث الحالة
--   ✓ المُعيّن عليه يحدث الحالة
--   ✗ Outbound tickets: المدير ما يقدرش يحدث الحالة
--
-- قواعد الإنشاء (INSERT):
--   ✓ أي مستخدم مُصادَق يقدر يخلق تيكت (هو بيبقى created_by)
--
-- قواعد الحذف (DELETE):
--   ✓ super_admin فقط
--   ✓ manager للـ target_department فقط (archive logic موجود في app)
-- ══════════════════════════════════════════════════════════

-- helper محلي: هل الـ user الحالي تابع لإدارة مقدم التيكت؟
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

-- ─── SELECT ────────────────────────────────────────────────
CREATE POLICY "tickets_select" ON public.tickets
  FOR SELECT
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      -- super_admin
      app_is_super()
      -- صاحب الطلب
      OR created_by = app_current_user_id()
      -- المعين عليه
      OR assigned_to = app_current_user_id()
      -- legacy (target_department فارغ) — للمدير والمشرف فقط
      OR (
        COALESCE(target_department,'') = ''
        AND app_is_dept_lead()
      )
      -- Inbound: قيادة الإدارة المستهدفة
      OR (
        app_is_dept_lead()
        AND app_same_dept(target_department)
      )
      -- Outbound: المدير فقط يشوف طلبات فريقه الصادرة
      OR (
        app_is_manager()
        AND app_owner_from_my_dept(created_by)
      )
      -- موظف في نفس الإدارة المستهدفة: الـ open فقط
      OR (
        app_current_role() = 'employee'
        AND app_same_dept(target_department)
        AND status = 'open'
      )
    )
  );

-- ─── INSERT ────────────────────────────────────────────────
CREATE POLICY "tickets_insert" ON public.tickets
  FOR INSERT
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND created_by = app_current_user_id()  -- ما تقدرش تنسب طلب لشخص تاني
  );

-- ─── UPDATE ────────────────────────────────────────────────
CREATE POLICY "tickets_update" ON public.tickets
  FOR UPDATE
  USING (
    app_is_super()
    -- المعين عليه يحدث حالة طلبه
    OR assigned_to = app_current_user_id()
    -- قيادة الإدارة المستهدفة (Inbound) تحدث
    OR (
      app_is_dept_lead()
      AND app_same_dept(target_department)
    )
    -- لو target_department فاضي (legacy): أي dept lead
    OR (
      COALESCE(target_department,'') = ''
      AND app_is_dept_lead()
    )
  );

-- ─── DELETE (archive/hard delete) ─────────────────────────
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
-- TICKET_COMMENTS
--
-- SELECT: لو تقدر تشوف التيكت، تقدر تشوف تعليقاته
-- INSERT: لو تقدر تشوف التيكت + (canActOnTicket أو صاحبه أو manager لطلب outbound)
-- DELETE: صاحب التعليق فقط أو super_admin
-- UPDATE: ما حدش (تعليقات immutable)
-- ══════════════════════════════════════════════════════════

CREATE POLICY "comments_select" ON public.ticket_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_comments.ticket_id
      -- الـ policy على tickets هتتطبق تلقائياً — subquery بيحترم RLS
    )
  );

CREATE POLICY "comments_insert" ON public.ticket_comments
  FOR INSERT
  WITH CHECK (
    user_id = app_current_user_id()  -- ما تقدرش تعلق باسم حد تاني
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_comments.ticket_id
        AND (
          app_is_super()
          OR t.created_by = app_current_user_id()                    -- صاحب الطلب
          OR t.assigned_to = app_current_user_id()                   -- المعين
          OR (app_is_dept_lead() AND app_same_dept(t.target_department))  -- Inbound lead
          OR (app_is_manager() AND app_owner_from_my_dept(t.created_by))  -- Outbound manager
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
-- NOTIFICATIONS — خصوصية كاملة
--
-- SELECT/UPDATE/DELETE: المستخدم لنفسه فقط
-- INSERT: أي مستخدم مصادَق (السيستم بيعمل إشعارات للآخرين)
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
-- DEPARTMENT_REQUESTS (خريطة الإدارات → أنواع الطلبات)
--
-- SELECT: الكل (عشان dropdowns تشتغل)
-- INSERT/UPDATE/DELETE: super_admin فقط
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
-- التحقق النهائي
-- ══════════════════════════════════════════════════════════
SELECT
  '✅ Phase 2 (tickets + comments + notifs + dept_requests) applied' AS status,
  tablename,
  count(*) AS policies_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
