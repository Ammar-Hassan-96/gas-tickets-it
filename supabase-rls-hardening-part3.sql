-- ═══════════════════════════════════════════════════════════
-- GAS Internal Tickets — RLS Security Hardening v1 — Part 3
-- Part 1 و Part 2 لازم يتشغلوا قبل هذا الملف.
--
-- هذا الجزء: audit_logs (إذا وُجد) + storage + مفاتيح Postgres للفحص
-- ═══════════════════════════════════════════════════════════

SET search_path TO public;

-- ══════════════════════════════════════════════════════════
-- AUDIT_LOGS — إن وُجد الجدول
--
-- SELECT: super_admin فقط
-- INSERT: أي user مُصادَق (الـ Netlify function بيكتب)
-- DELETE: super_admin فقط
-- UPDATE: ممنوع (immutable)
-- ══════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
  ) THEN
    -- تأكيد RLS enabled
    EXECUTE 'ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY';

    -- شيل أي policies قديمة
    EXECUTE 'DROP POLICY IF EXISTS "allow_all_audit" ON public.audit_logs';
    EXECUTE 'DROP POLICY IF EXISTS "audit_select"    ON public.audit_logs';
    EXECUTE 'DROP POLICY IF EXISTS "audit_insert"    ON public.audit_logs';
    EXECUTE 'DROP POLICY IF EXISTS "audit_delete"    ON public.audit_logs';

    EXECUTE 'CREATE POLICY "audit_select" ON public.audit_logs FOR SELECT USING (app_is_super())';
    EXECUTE 'CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT WITH CHECK (app_current_user_id() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "audit_delete" ON public.audit_logs FOR DELETE USING (app_is_super())';

    RAISE NOTICE 'audit_logs policies applied ✅';
  ELSE
    RAISE NOTICE 'audit_logs table not found — skipping (ok if you never enabled audit)';
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════
-- STORAGE — ticket-attachments bucket
--
-- السياسات القديمة كانت public تماماً. دلوقتي:
--   SELECT: أي user مُصادَق
--   INSERT: أي user مُصادَق (عشان رفع مرفقات مع التيكت)
--   DELETE: super_admin + صاحب التيكت + قيادة الإدارة
-- ══════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "ticket_attachments_read"   ON storage.objects;
DROP POLICY IF EXISTS "ticket_attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "ticket_attachments_delete" ON storage.objects;

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
-- التحقق النهائي الشامل
-- ══════════════════════════════════════════════════════════

-- الـ policies على كل الجداول
SELECT
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━' AS divider
UNION ALL SELECT '🔐 RLS Security — Final Status'
UNION ALL SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

SELECT
  tablename,
  count(*) AS policies,
  string_agg(DISTINCT cmd, ', ' ORDER BY cmd) AS operations
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- فحص إن مفيش allow_all متبقّية
SELECT
  CASE count(*)
    WHEN 0 THEN '✅ لا توجد allow_all policies متبقية'
    ELSE '⚠️ لسه فيه ' || count(*) || ' allow_all policies — لازم تتشال'
  END AS allow_all_check
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE 'allow_all%';

-- فحص إن كل الجداول الحساسة RLS enabled
SELECT
  tablename,
  CASE rowsecurity
    WHEN true  THEN '✅ RLS Enabled'
    ELSE            '⚠️ RLS DISABLED — خطير'
  END AS rls_status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users','sessions','tickets','ticket_comments','notifications','department_requests','audit_logs')
ORDER BY tablename;

-- ══════════════════════════════════════════════════════════
-- ملاحظات مهمة بعد التشغيل:
--
-- 1. لو حاولت تفتح التطبيق قبل ما تحدث app.js، هيرجع "no rows"
--    لأن الـ client مش بيبعت session token في الـ header.
--    ده متوقع — لازم تحدث app.js في Phase 2.
--
-- 2. لاختبار الأمان (Postman Attack Test):
--    جرب: curl https://your-project.supabase.co/rest/v1/users \
--         -H "apikey: <anon-key>" \
--         -H "Authorization: Bearer <anon-key>"
--    المفروض: يرجع [] (مفيش أي بيانات)
--
-- 3. للعمل الطبيعي من التطبيق، لازم تبعت header إضافي:
--      x-session-token: <actual-session-token>
--    أو الـ client يستخدم Supabase Auth الرسمي
--    (اللي هنتعامل معاه في Phase 2)
-- ══════════════════════════════════════════════════════════
