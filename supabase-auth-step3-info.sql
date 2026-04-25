-- ═══════════════════════════════════════════════════════════
-- GAS Internal Tickets — Supabase Auth Migration
-- STEP 3 of 3: ربط public.users بـ auth.users
--
-- هذا الملف لا يُشغَّل في SQL Editor!
-- يُشغَّل عبر script خارجي (Node.js) يستخدم Supabase Admin API
-- عشان يقدر ينشئ users في auth.users مع user_metadata
--
-- بعد تشغيل الـ script:
--   - كل user عنده account في Supabase Auth
--   - الـ UUID في auth.users = نفس الـ UUID في public.users
--   - الـ JWT بيحمل role و department في user_metadata
--   - RLS تشتغل بـ auth.uid() فعلاً
-- ═══════════════════════════════════════════════════════════

-- هذا للتوثيق فقط — الـ script الفعلي في create-auth-users.mjs
SELECT
  u.id,
  u.username,
  u.email,
  u.role,
  u.department,
  CASE WHEN u.email LIKE '%@gas.internal' THEN '⚠️ Temp email' ELSE '✅ Real email' END AS email_status
FROM public.users u
ORDER BY u.role, u.username;
