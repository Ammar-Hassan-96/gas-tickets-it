-- ═══════════════════════════════════════════════════════════
-- 🧪 RLS SECURITY ATTACK TEST
-- هذا السكربت بيختبر إن الـ Postman attack ما يعدّيش بعد الـ hardening
--
-- طريقة التشغيل:
--   1. شغّل الـ 3 parts من الـ RLS hardening أولاً
--   2. حدّث الـ app واختبر إن التطبيق شغال طبيعي
--   3. شغّل هذا الملف في SQL Editor عشان تتأكد من الأمان
-- ═══════════════════════════════════════════════════════════

SET search_path TO public;

-- ══ TEST 1: محاكاة طلب من anon بدون token ════════════════
-- المفروض يرجع "no rows" لأن app_current_user_id() = NULL
--
-- بنعمل الاختبار عبر تشغيل كويري من دور "anon" بدون session token
-- (Supabase SQL Editor بيستخدم service_role فـ محتاجين نجبر anon role)

-- Reset JWT claims (محاكاة anon request)
SELECT set_config('request.headers', '{}', true);

BEGIN;
SET LOCAL ROLE anon;

SELECT
  '🧪 TEST 1: Anon user trying to SELECT users (بدون session token)' AS test,
  count(*) AS rows_returned,
  CASE count(*)
    WHEN 0 THEN '✅ PASS — anon ما شاف أي user'
    ELSE         '❌ FAIL — anon شاف ' || count(*) || ' users!'
  END AS result
FROM public.users;

SELECT
  '🧪 TEST 2: Anon user trying to SELECT tickets' AS test,
  count(*) AS rows_returned,
  CASE count(*)
    WHEN 0 THEN '✅ PASS — anon ما شاف أي tickets'
    ELSE         '❌ FAIL — anon شاف ' || count(*) || ' tickets!'
  END AS result
FROM public.tickets;

SELECT
  '🧪 TEST 3: Anon user trying to SELECT sessions' AS test,
  count(*) AS rows_returned,
  CASE count(*)
    WHEN 0 THEN '✅ PASS — sessions محمية'
    ELSE         '❌ FAIL — anon شاف ' || count(*) || ' sessions!'
  END AS result
FROM public.sessions;

ROLLBACK;

-- ══ TEST 4: محاولة DELETE من anon (يجب أن تفشل أو تتجاهل) ══
BEGIN;
SET LOCAL ROLE anon;

DO $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM public.tickets WHERE status = 'open';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '🧪 TEST 4: anon tried DELETE FROM tickets → deleted % rows (expected: 0)', deleted_count;
  IF deleted_count = 0 THEN
    RAISE NOTICE '  ✅ PASS — RLS رفض الـ DELETE';
  ELSE
    RAISE NOTICE '  ❌ FAIL — anon مسح بيانات!';
  END IF;
EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
  RAISE NOTICE '  ✅ PASS — رُفض الطلب تماماً: %', SQLERRM;
END $$;

ROLLBACK;

-- ══ TEST 5: محاولة INSERT للـ users من anon ════════════════
BEGIN;
SET LOCAL ROLE anon;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.users (username, password_hash, name, role, department)
    VALUES ('hacker', 'fake', 'Hacker', 'super_admin', 'NULL');
    RAISE NOTICE '🧪 TEST 5: ❌ FAIL — anon نجح يخلق super_admin!';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '🧪 TEST 5: ✅ PASS — INSERT رُفض: %', SQLERRM;
  END;
END $$;

ROLLBACK;

-- ══ ملخص نهائي ═════════════════════════════════════════════
SELECT
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' AS divider
UNION ALL SELECT '🔐 لو كل الاختبارات PASS:'
UNION ALL SELECT '   ✅ قاعدة البيانات محمية ضد Postman attacks'
UNION ALL SELECT '   ✅ الـ anon key مش كفاية للوصول للبيانات'
UNION ALL SELECT '   ✅ ممكن تنام مرتاح 😴'
UNION ALL SELECT ''
UNION ALL SELECT 'الخطوات التالية:'
UNION ALL SELECT '   1. حدّث الـ app.js (النسخة الجديدة في الـ ZIP)'
UNION ALL SELECT '   2. اختبر الـ app طبيعياً — المفروض يشتغل زي الأول'
UNION ALL SELECT '   3. جرب Postman attack من برّه — المفروض يرجع []'
UNION ALL SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
