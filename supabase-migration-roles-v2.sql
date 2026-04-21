-- ═══════════════════════════════════════════════════════════
-- GAS INTERNAL TICKETS — Migration v2 (Role Hierarchy)
-- German Auto Service · Mercedes-Benz Egypt
-- يحول الأدوار من (employee/admin/manager) إلى نموذج هرمي:
--   super_admin → يشوف كل حاجة (إنت فقط)
--   manager     → مدير إدارة واحدة
--   supervisor  → مشرف إدارة واحدة
--   employee    → موظف عادي
-- آمن: لا يحذف أي بيانات ولا ينقص صلاحيات أحد
-- شغّل هذا الكود في Supabase SQL Editor بعد migration-internal
-- ═══════════════════════════════════════════════════════════

-- ══ 1) توسيع CHECK constraint للأدوار الجديدة ══════════════
-- نسمح بالأدوار القديمة والجديدة معاً (للتوافق أثناء الترحيل)
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin','manager','supervisor','admin','employee'));

-- ══ 2) ترقية حساب ammar.admin إلى super_admin ═════════════
UPDATE public.users
SET role = 'super_admin', department = 'إدارة النظام'
WHERE username = 'ammar.admin';

-- ══ 3) عمود للدلالة على أن المستخدم ترم من دوره الحالي لدور جديد ═
-- (اختياري — للتتبع فقط، مش بيأثر على الـ logic)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role_updated_at TIMESTAMPTZ;

-- ══ 4) العمود department يبقى مهم جداً دلوقتي ═════════════
-- لا نجعله NOT NULL عشان ما نكسرش البيانات القديمة
-- بس نضيف index للأداء
CREATE INDEX IF NOT EXISTS idx_users_department_role
  ON public.users(department, role) WHERE is_active = true;

-- ══ 5) التحقق ═══════════════════════════════════════════════
SELECT
  'Migration v2 completed ✅' AS status,
  role,
  count(*) AS count
FROM public.users
WHERE is_active = true
GROUP BY role
ORDER BY
  CASE role
    WHEN 'super_admin' THEN 1
    WHEN 'manager'     THEN 2
    WHEN 'supervisor'  THEN 3
    WHEN 'admin'       THEN 4
    WHEN 'employee'    THEN 5
    ELSE 6
  END;

-- ──────────────────────────────────────────────────────────
-- ملاحظة مهمة بعد تشغيل الـ migration:
-- المستخدمين اللي دورهم الحالي 'admin' هيفضلوا شغالين عادي،
-- وليهم نفس صلاحيات supervisor مؤقتاً.
-- إنت كـ super_admin ادخل على صفحة "إدارة الأدوار" في التطبيق
-- وحوّل كل واحد للدور والإدارة الصح.
-- ──────────────────────────────────────────────────────────
