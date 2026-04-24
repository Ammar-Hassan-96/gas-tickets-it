-- ═══════════════════════════════════════════════════════════
-- 🔍 EMERGENCY BACKDOOR AUDIT — Detect Compromised Accounts
-- GAS Internal Tickets — Active Breach Response
--
-- Purpose: Find unauthorized accounts, role escalations,
--          and suspicious changes made by attacker.
--
-- Run: Supabase SQL Editor → New Query → Execute ALL
-- ═══════════════════════════════════════════════════════════

SET search_path TO public;

-- ══════════════════════════════════════════════════════════
-- AUDIT REPORT HEADER
-- ══════════════════════════════════════════════════════════

SELECT
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' AS divider
UNION ALL SELECT '🔍 EMERGENCY BACKDOOR AUDIT REPORT'
UNION ALL SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

SELECT now() AS audit_timestamp;

-- ══════════════════════════════════════════════════════════
-- CHECK 1: Unauthorized super_admin accounts
-- ══════════════════════════════════════════════════════════

SELECT
  '🔴 CHECK 1: Unauthorized super_admin Accounts' AS check_name,
  CASE WHEN count(*) > 0 THEN '⚠️ THREAT FOUND' ELSE '✅ CLEAN' END AS status,
  count(*) AS threat_count
FROM public.users
WHERE role = 'super_admin'
  AND username <> 'ammar.admin';

-- Show details of unauthorized super_admins
SELECT
  id,
  username,
  name,
  email,
  department,
  created_at,
  updated_at,
  is_active,
  '🔴 UNAUTHORIZED super_admin — REVIEW IMMEDIATELY' AS action_required
FROM public.users
WHERE role = 'super_admin'
  AND username <> 'ammar.admin';

-- ══════════════════════════════════════════════════════════
-- CHECK 2: Users with role = 'admin' (legacy escalation path)
-- ══════════════════════════════════════════════════════════

SELECT
  '⚠️ CHECK 2: Legacy admin Accounts' AS check_name,
  CASE WHEN count(*) > 0 THEN '⚠️ REVIEW NEEDED' ELSE '✅ CLEAN' END AS status,
  count(*) AS count
FROM public.users
WHERE role = 'admin';

SELECT
  id, username, name, role, department, created_at, updated_at,
  '⚠️ Legacy admin role — consider migrating to supervisor' AS note
FROM public.users
WHERE role = 'admin';

-- ══════════════════════════════════════════════════════════
-- CHECK 3: Recently created accounts (possible backdoors)
-- ══════════════════════════════════════════════════════════

SELECT
  '⚠️ CHECK 3: Recently Created Accounts (Last 7 Days)' AS check_name,
  CASE WHEN count(*) > 0 THEN '⚠️ REVIEW NEEDED' ELSE '✅ CLEAN' END AS status,
  count(*) AS count
FROM public.users
WHERE created_at > now() - interval '7 days';

SELECT
  id,
  username,
  name,
  role,
  department,
  created_at,
  is_active,
  CASE
    WHEN role IN ('super_admin', 'manager') THEN '🔴 HIGH PRIORITY — verify legitimacy'
    WHEN role IN ('supervisor', 'admin') THEN '⚠️ MEDIUM PRIORITY — verify legitimacy'
    ELSE 'ℹ️ Low priority — normal new employee'
  END AS priority
FROM public.users
WHERE created_at > now() - interval '7 days'
ORDER BY created_at DESC;

-- ══════════════════════════════════════════════════════════
-- CHECK 4: Recently updated accounts (possible role changes)
-- ══════════════════════════════════════════════════════════

SELECT
  '⚠️ CHECK 4: Recently Updated Accounts (Last 7 Days)' AS check_name,
  CASE WHEN count(*) > 0 THEN '⚠️ REVIEW NEEDED' ELSE '✅ CLEAN' END AS status,
  count(*) AS count
FROM public.users
WHERE updated_at > now() - interval '7 days'
  AND updated_at > created_at + interval '1 minute'; -- exclude brand new accounts

SELECT
  id,
  username,
  name,
  role,
  department,
  created_at,
  updated_at,
  CASE
    WHEN role = 'super_admin' AND username <> 'ammar.admin' THEN '🔴 UNAUTHORIZED ROLE CHANGE'
    WHEN role = 'manager' THEN '⚠️ Verify manager promotion is legitimate'
    ELSE 'ℹ️ Review for unauthorized changes'
  END AS priority
FROM public.users
WHERE updated_at > now() - interval '7 days'
  AND updated_at > created_at + interval '1 minute'
ORDER BY updated_at DESC;

-- ══════════════════════════════════════════════════════════
-- CHECK 5: Accounts without department (suspicious)
-- ══════════════════════════════════════════════════════════

SELECT
  '⚠️ CHECK 5: Accounts Without Department' AS check_name,
  CASE WHEN count(*) > 0 THEN '⚠️ REVIEW NEEDED' ELSE '✅ CLEAN' END AS status,
  count(*) AS count
FROM public.users
WHERE (department IS NULL OR TRIM(department) = '') AND role <> 'super_admin';

SELECT
  id, username, name, role, department, created_at, updated_at,
  '⚠️ No department assigned — potential ghost account' AS note
FROM public.users
WHERE (department IS NULL OR TRIM(department) = '') AND role <> 'super_admin';

-- ══════════════════════════════════════════════════════════
-- CHECK 6: Inactive users that were recently active
-- ══════════════════════════════════════════════════════════

SELECT
  '⚠️ CHECK 6: Inactive Users (Potential Disabled Backdoors)' AS check_name,
  CASE WHEN count(*) > 0 THEN '⚠️ REVIEW NEEDED' ELSE '✅ CLEAN' END AS status,
  count(*) AS count
FROM public.users
WHERE is_active = false;

SELECT
  id, username, name, role, department, created_at, updated_at, is_active,
  '⚠️ Inactive account — was it disabled due to breach?' AS note
FROM public.users
WHERE is_active = false;

-- ══════════════════════════════════════════════════════════
-- CHECK 7: Duplicate or similar usernames (impersonation)
-- ══════════════════════════════════════════════════════════

SELECT
  '⚠️ CHECK 7: Duplicate/ Similar Usernames' AS check_name,
  CASE WHEN count(*) > 0 THEN '⚠️ REVIEW NEEDED' ELSE '✅ CLEAN' END AS status,
  count(*) AS count
FROM (
  SELECT username, count(*) AS cnt
  FROM public.users
  GROUP BY username
  HAVING count(*) > 1
) dupes;

-- Show all usernames that look similar to existing ones (typosquatting)
SELECT
  u1.username AS original,
  u2.username AS suspicious_similar,
  u2.name,
  u2.role,
  u2.created_at,
  '⚠️ Possible impersonation account' AS warning
FROM public.users u1
JOIN public.users u2 ON (
  u1.username <> u2.username
  AND (
    u2.username LIKE u1.username || '%'
    OR u2.username LIKE '%' || u1.username
    OR REPLACE(u2.username, '_', '') = REPLACE(u1.username, '_', '')
    OR REPLACE(u2.username, '.', '') = REPLACE(u1.username, '.', '')
  )
)
WHERE u1.created_at < u2.created_at
ORDER BY u2.created_at DESC;

-- ══════════════════════════════════════════════════════════
-- CHECK 8: Audit log for suspicious operations (if table exists)
-- ══════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
  ) THEN
    -- Show recent audit entries
    RAISE NOTICE 'Audit logs table found — checking recent entries...';
  ELSE
    RAISE NOTICE 'No audit_logs table found — skipping audit check.';
  END IF;
END $$;

-- If audit_logs exists, show recent suspicious activity
SELECT
  '⚠️ CHECK 8: Recent Audit Log Entries' AS check_name,
  CASE WHEN count(*) > 0 THEN '⚠️ REVIEW NEEDED' ELSE '✅ NO ENTRIES' END AS status,
  count(*) AS count
FROM public.audit_logs
WHERE created_at > now() - interval '7 days'
  AND action IN ('delete_user', 'delete_ticket', 'update_user', 'reset_audit_log');

-- Show audit entries if table exists
SELECT
  created_at,
  user_name,
  user_role,
  action,
  target_name,
  '⚠️ REVIEW THIS ACTION' AS note
FROM public.audit_logs
WHERE created_at > now() - interval '7 days'
  AND action IN ('delete_user', 'delete_ticket', 'update_user', 'reset_audit_log')
ORDER BY created_at DESC
LIMIT 20;

-- ══════════════════════════════════════════════════════════
-- CHECK 9: User count by role (baseline check)
-- ══════════════════════════════════════════════════════════

SELECT
  'ℹ️ CHECK 9: User Role Distribution' AS check_name,
  role,
  count(*) AS count,
  string_agg(username, ', ' ORDER BY username) AS usernames
FROM public.users
WHERE is_active = true
GROUP BY role
ORDER BY count(*) DESC;

-- ══════════════════════════════════════════════════════════
-- CHECK 10: ammar.admin integrity check
-- ══════════════════════════════════════════════════════════

SELECT
  '🔑 CHECK 10: ammar.admin Account Integrity' AS check_name,
  CASE
    WHEN count(*) = 0 THEN '🔴 ammar.admin NOT FOUND!'
    WHEN count(*) > 1 THEN '🔴 DUPLICATE ammar.admin ACCOUNTS!'
    ELSE '✅ OK'
  END AS status
FROM public.users
WHERE username = 'ammar.admin';

SELECT
  id,
  username,
  name,
  role,
  department,
  is_active,
  created_at,
  updated_at,
  CASE
    WHEN role <> 'super_admin' THEN '🔴 ROLE CHANGED FROM super_admin!'
    WHEN is_active = false THEN '🔴 ACCOUNT DISABLED!'
    ELSE '✅ Account appears normal'
  END AS status
FROM public.users
WHERE username = 'ammar.admin';

-- ══════════════════════════════════════════════════════════
-- SUMMARY & ACTION ITEMS
-- ══════════════════════════════════════════════════════════

SELECT
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' AS divider
UNION ALL SELECT '📋 AUDIT SUMMARY & REQUIRED ACTIONS'
UNION ALL SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

SELECT
  'TOTAL USERS' AS metric,
  count(*)::text AS value
FROM public.users
UNION ALL
SELECT
  'ACTIVE USERS',
  count(*)::text
FROM public.users WHERE is_active = true
UNION ALL
SELECT
  'super_admin ACCOUNTS',
  count(*)::text
FROM public.users WHERE role = 'super_admin'
UNION ALL
SELECT
  'RECENTLY CREATED (7d)',
  count(*)::text
FROM public.users WHERE created_at > now() - interval '7 days'
UNION ALL
SELECT
  'RECENTLY UPDATED (7d)',
  count(*)::text
FROM public.users WHERE updated_at > now() - interval '7 days';

-- ══════════════════════════════════════════════════════════
-- 🚨 REMEDIATION QUERIES (Use with EXTREME CAUTION)
-- ══════════════════════════════════════════════════════════
/*
⚠️ ONLY run these if you CONFIRMED an account is compromised.
   Uncomment and modify the WHERE clause before running.

-- Disable a compromised account:
-- UPDATE public.users SET is_active = false, updated_at = now()
-- WHERE username = 'COMPROMISED_USERNAME';

-- Downgrade unauthorized super_admin:
-- UPDATE public.users SET role = 'employee', updated_at = now()
-- WHERE username = 'UNAUTHORIZED_USER' AND role = 'super_admin';

-- Delete a confirmed backdoor account:
-- DELETE FROM public.users
-- WHERE username = 'CONFIRMED_BACKDOOR';

-- Force password reset for ammar.admin:
-- UPDATE public.users SET password_hash = 'FORCE_RESET', updated_at = now()
-- WHERE username = 'ammar.admin';
*/

