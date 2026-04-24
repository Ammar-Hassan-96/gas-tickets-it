-- ═══════════════════════════════════════════════════════════
-- ☠️ EMERGENCY SESSION KILL — Force Complete Logout
-- GAS Internal Tickets — Active Breach Response
--
-- Purpose: Immediately invalidate ALL active sessions.
--          Forces every user (including attacker) to re-login.
--
-- ⚠️  WARNING: This will log out ALL users immediately.
--     Everyone must re-authenticate after this.
--
-- Run: Supabase SQL Editor → New Query → Execute
-- ═══════════════════════════════════════════════════════════

SET search_path TO public;

-- ══════════════════════════════════════════════════════════
-- STEP 1: Show current active sessions (before kill)
-- ══════════════════════════════════════════════════════════

SELECT
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' AS divider
UNION ALL SELECT '☠️  EMERGENCY SESSION KILL'
UNION ALL SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

-- Count sessions before
SELECT
  count(*) AS total_sessions,
  count(DISTINCT user_id) AS unique_users,
  count(*) FILTER (WHERE expires_at > now() + interval '8 hours') AS suspicious_long_sessions,
  min(created_at) AS oldest_session,
  max(created_at) AS newest_session
FROM public.sessions;

-- Show suspicious sessions (unusually long, or from unknown patterns)
SELECT
  s.id AS session_id,
  s.user_id,
  u.username,
  u.name,
  u.role,
  u.department,
  s.created_at,
  s.expires_at,
  CASE
    WHEN s.expires_at > now() + interval '12 hours' THEN '⚠️ SUSPICIOUS LONG'
    WHEN u.role = 'super_admin' AND u.username <> 'ammar.admin' THEN '🔴 UNAUTHORIZED SUPER_ADMIN'
    WHEN u.is_active = false THEN '🔴 INACTIVE USER HAS SESSION'
    ELSE 'ℹ️ Normal'
  END AS flag
FROM public.sessions s
JOIN public.users u ON u.id = s.user_id
WHERE s.expires_at > now()
ORDER BY s.created_at DESC
LIMIT 50;

-- ══════════════════════════════════════════════════════════
-- STEP 2: KILL ALL SESSIONS (The Nuclear Option)
-- ══════════════════════════════════════════════════════════

-- Save a backup record of what we're deleting (for forensics)
CREATE TABLE IF NOT EXISTS sessions_killed_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  killed_at TIMESTAMP DEFAULT now(),
  original_count INT,
  original_users INT,
  reason TEXT DEFAULT 'Emergency breach response'
);

INSERT INTO sessions_killed_log (original_count, original_users, reason)
SELECT count(*), count(DISTINCT user_id), 'Active breach — emergency session purge'
FROM public.sessions;

-- ☠️ DELETE ALL SESSIONS ☠️
DELETE FROM public.sessions;

-- ══════════════════════════════════════════════════════════
-- STEP 3: Verify all sessions are dead
-- ══════════════════════════════════════════════════════════

SELECT
  count(*) AS remaining_sessions,
  CASE WHEN count(*) = 0 THEN '✅ ALL SESSIONS KILLED' ELSE '🔴 SESSIONS STILL EXIST!' END AS status
FROM public.sessions;

-- ══════════════════════════════════════════════════════════
-- STEP 4: Clear any cached/related data (safety net)
-- ══════════════════════════════════════════════════════════

-- If you have any other session-related tables, add them here
-- DELETE FROM public.active_sessions; -- if exists
-- DELETE FROM public.login_attempts; -- if exists

-- ══════════════════════════════════════════════════════════
-- STEP 5: Post-kill status report
-- ══════════════════════════════════════════════════════════

SELECT
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' AS divider
UNION ALL SELECT '✅ SESSION KILL COMPLETE'
UNION ALL SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

SELECT
  skl.killed_at,
  skl.original_count AS sessions_killed,
  skl.original_users AS users_affected,
  skl.reason
FROM sessions_killed_log skl
ORDER BY skl.killed_at DESC
LIMIT 1;

-- ══════════════════════════════════════════════════════════
-- ⚠️ NEXT STEPS (MUST DO)
-- ══════════════════════════════════════════════════════════
/*
✅ Done: All sessions killed. Attacker (if using stolen token) is logged out.

📋 IMMEDIATE:
1. Run emergency-backdoor-audit.sql to find compromised accounts
2. Change passwords for ammar.admin and all super_admin accounts
3. Rotate Supabase API keys (anon + service_role)

📋 WITHIN 1 HOUR:
4. Deploy updated app.js with new key
5. Notify all users they must re-login
6. Monitor for failed login attempts (brute force)

📋 ONGOING:
7. Review sessions_killed_log for forensic analysis
8. Check for any new suspicious accounts created
9. Enable Supabase realtime logs if not already active
*/

