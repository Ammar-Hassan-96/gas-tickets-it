-- ═══════════════════════════════════════════════════════════
-- GAS Internal Tickets — سكربت تشخيصي سريع
-- شغّله في Supabase SQL Editor لتعرف حالة النظام
-- ═══════════════════════════════════════════════════════════

-- 1) هل جدول department_requests موجود؟
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'department_requests'
  ) THEN '✅ الجدول موجود'
  ELSE '❌ الجدول غير موجود — لازم تشغل supabase-migration-internal.sql'
  END AS dept_table_status;

-- 2) كم إدارة ونوع طلب موجودين؟
SELECT
  count(DISTINCT department) AS departments_count,
  count(*)                   AS total_request_types,
  string_agg(DISTINCT department, ' · ' ORDER BY department) AS dept_names
FROM public.department_requests
WHERE is_active = true;

-- 3) هل الـ Storage Bucket موجود؟
SELECT
  id, name, public, file_size_limit
FROM storage.buckets
WHERE id = 'ticket-attachments';

-- 4) أدوار المستخدمين الحالية
SELECT role, count(*) AS count
FROM public.users
WHERE is_active = true
GROUP BY role;

-- 5) هل ammar.admin عنده دور super_admin؟
SELECT username, name, role, department
FROM public.users
WHERE username = 'ammar.admin';
