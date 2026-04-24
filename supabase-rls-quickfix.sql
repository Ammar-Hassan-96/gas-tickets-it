-- ═══════════════════════════════════════════════════════════
-- QUICK FIX: Error "function digest(text, unknown) does not exist"
--
-- شغّل هذا الملف قبل تشغيل Part 1 لحل المشكلة
-- (أو استخدم النسخة المحدّثة من Part 1 اللي فيها الإصلاح)
-- ═══════════════════════════════════════════════════════════

-- تفعيل pgcrypto في الـ schema الصحيحة
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- التحقق من توفر sha256() (Postgres 14+)
DO $$
BEGIN
  PERFORM sha256('test'::bytea);
  RAISE NOTICE '✅ sha256() متاحة — كل تمام';
EXCEPTION WHEN undefined_function THEN
  RAISE EXCEPTION '❌ sha256() غير متاحة — لازم Postgres 14+';
END $$;

-- اختبار إن كل الدوال بتشتغل
SELECT
  encode(sha256('admin@2024'::bytea), 'hex') AS password_hash_test,
  length(encode(sha256('test'::bytea), 'hex')) AS hash_length;
-- المتوقع: password_hash_test بـ 64 حرف (SHA-256 hex)
--         hash_length = 64
