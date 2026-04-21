-- ═══════════════════════════════════════════════════════════
-- GAS Internal Tickets — Migration v3 (Data Integrity Fixes)
-- يصلح المشاكل الشائعة بعد تفعيل النظام الهرمي:
-- 1. مستخدمين بدون department
-- 2. عدم تطابق أسماء الإدارات (trim spaces)
-- 3. تحديث ammar.admin لـ super_admin (لو مش اتعمل)
-- 4. تقرير تشخيصي كامل في الآخر
--
-- آمن 100% — ما يمسحش أي بيانات
-- ═══════════════════════════════════════════════════════════

-- ══ 1) إزالة المسافات الزائدة من أسماء الإدارات ══════════
UPDATE public.users
   SET department = TRIM(department)
 WHERE department IS NOT NULL AND department <> TRIM(department);

UPDATE public.tickets
   SET target_department = TRIM(target_department)
 WHERE target_department IS NOT NULL AND target_department <> TRIM(target_department);

-- ══ 2) توحيد الإدارات الفاضية (NULL → '') ══════════════════
UPDATE public.users SET department = '' WHERE department IS NULL;

-- ══ 3) تأكيد ترقية ammar.admin ═══════════════════════════
UPDATE public.users
   SET role = 'super_admin',
       department = COALESCE(NULLIF(TRIM(department),''), 'إدارة النظام')
 WHERE username = 'ammar.admin'
   AND role <> 'super_admin';

-- ══ 4) إصلاح المستخدمين القدامى بدور 'admin' → 'supervisor' ═
-- (اختياري — يمكن تعليقه لو عايز تحتفظ بالـ admin القديم)
-- UPDATE public.users SET role = 'supervisor' WHERE role = 'admin';

-- ══ 5) تقرير تشخيصي شامل ════════════════════════════════════

-- (أ) توزيع الأدوار
SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━' AS divider
UNION ALL
SELECT '📊 توزيع الأدوار:'
UNION ALL
SELECT format('   %s: %s مستخدم', role, count(*)::text)
FROM public.users
WHERE is_active = true
GROUP BY role
ORDER BY 1;

-- (ب) الإدارات في users (مع تنبيه للفاضي)
SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━' AS divider
UNION ALL
SELECT '👥 توزيع الموظفين على الإدارات:'
UNION ALL
SELECT format('   %s: %s موظف',
  CASE WHEN department = '' THEN '⚠️ (بدون إدارة)' ELSE department END,
  count(*)::text)
FROM public.users
WHERE is_active = true
GROUP BY department
ORDER BY 1;

-- (ج) الإدارات في التيكتات vs الموظفين
SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━' AS divider
UNION ALL
SELECT '🔗 مطابقة إدارات الطلبات مع إدارات الموظفين:';

-- الإدارات اللي لها طلبات لكن مفيش موظفين فيها
SELECT
  format('❌ إدارة "%s": فيها %s طلب لكن مفيش موظفين',
    t.target_department, count(*)::text) AS mismatch_warning
FROM public.tickets t
WHERE t.target_department IS NOT NULL
  AND t.target_department <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.department = t.target_department
      AND u.is_active = true
  )
GROUP BY t.target_department;

-- ══ 6) ملخص نهائي ═══════════════════════════════════════════
SELECT
  (SELECT count(*) FROM public.users WHERE is_active = true AND role = 'super_admin')                  AS super_admins,
  (SELECT count(*) FROM public.users WHERE is_active = true AND role = 'manager')                      AS managers,
  (SELECT count(*) FROM public.users WHERE is_active = true AND role = 'supervisor')                   AS supervisors,
  (SELECT count(*) FROM public.users WHERE is_active = true AND role = 'employee')                     AS employees,
  (SELECT count(*) FROM public.users WHERE is_active = true AND (department IS NULL OR department='')) AS no_department_users,
  (SELECT count(*) FROM public.tickets WHERE target_department IS NULL OR target_department = '')      AS legacy_tickets,
  (SELECT count(*) FROM public.tickets WHERE status NOT IN ('archived','closed'))                      AS active_tickets;

-- ──────────────────────────────────────────────────────────
-- ⚡ الخطوة التالية بعد التشغيل:
-- لو لقيت موظفين بدون إدارة (no_department_users > 0):
--   1. ادخل النظام كـ ammar.admin
--   2. روح لصفحة "🔑 الأدوار"
--   3. لكل موظف، حدد الإدارة من الـ dropdown
--   4. اضغط "حفظ كل التغييرات"
-- ──────────────────────────────────────────────────────────
