-- ═══════════════════════════════════════════════════════════════
-- GAS IT Desk — Final Notification System Fixes
-- Migration: notification_system_complete_fix
-- Date: 2026-04-25
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. Manual Sync Function (auth.users → public.users)
-- ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.manual_sync_auth_users()
RETURNS TABLE(
  synced_count INTEGER,
  new_users INTEGER,
  updated_users INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_synced_count INTEGER := 0;
  v_new_users INTEGER := 0;
  v_updated_users INTEGER := 0;
BEGIN
  -- Insert new users
  WITH inserted AS (
    INSERT INTO public.users (
      id,
      username,
      name,
      email,
      role,
      department,
      is_active,
      created_at
    )
    SELECT 
      au.id,
      COALESCE(au.raw_user_meta_data->>'username', split_part(au.email, '@', 1)),
      COALESCE(au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)),
      au.email,
      COALESCE(au.raw_user_meta_data->>'role', 'employee'),
      COALESCE(au.raw_user_meta_data->>'department', 'IT'),
      true,
      au.created_at
    FROM auth.users au
    WHERE NOT EXISTS (
      SELECT 1 FROM public.users pu WHERE pu.id = au.id
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING *
  )
  SELECT COUNT(*) INTO v_new_users FROM inserted;
  
  -- Update existing users
  WITH updated AS (
    UPDATE public.users pu
    SET
      username = COALESCE(au.raw_user_meta_data->>'username', pu.username),
      name = COALESCE(au.raw_user_meta_data->>'name', pu.name),
      email = au.email,
      role = COALESCE(au.raw_user_meta_data->>'role', pu.role),
      department = COALESCE(au.raw_user_meta_data->>'department', pu.department),
      updated_at = NOW()
    FROM auth.users au
    WHERE pu.id = au.id
    RETURNING pu.*
  )
  SELECT COUNT(*) INTO v_updated_users FROM updated;
  
  v_synced_count := v_new_users + v_updated_users;
  
  RETURN QUERY SELECT v_synced_count, v_new_users, v_updated_users;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.manual_sync_auth_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.manual_sync_auth_users() TO anon;

COMMENT ON FUNCTION public.manual_sync_auth_users IS 
'Manually syncs all users from auth.users to public.users. Returns count of synced users.';

-- ───────────────────────────────────────────────────────────────
-- 2. Fix RLS Policy for Notifications INSERT
-- ───────────────────────────────────────────────────────────────

-- Drop old policy
DROP POLICY IF EXISTS notifs_insert ON public.notifications;

-- Create new policy with auth.uid() instead of app_current_user_id()
CREATE POLICY notifs_insert ON public.notifications
  FOR INSERT
  WITH CHECK (
    -- أي authenticated user يقدر ينشئ notification لأي user آخر
    auth.uid() IS NOT NULL
  );

COMMENT ON POLICY notifs_insert ON public.notifications IS 
'Allows any authenticated user to create notifications for any other user';

-- ───────────────────────────────────────────────────────────────
-- 3. Initial Sync Execution (Run Once)
-- ───────────────────────────────────────────────────────────────

-- Execute the sync to populate public.users from auth.users
DO $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT * INTO v_result FROM public.manual_sync_auth_users();
  
  RAISE NOTICE 'User sync completed:';
  RAISE NOTICE '  - Total synced: %', v_result.synced_count;
  RAISE NOTICE '  - New users: %', v_result.new_users;
  RAISE NOTICE '  - Updated users: %', v_result.updated_users;
END;
$$;

-- ───────────────────────────────────────────────────────────────
-- 4. Verification Queries
-- ───────────────────────────────────────────────────────────────

-- Count users in both tables
SELECT 
  (SELECT COUNT(*) FROM auth.users) as auth_users_count,
  (SELECT COUNT(*) FROM public.users) as public_users_count,
  (SELECT COUNT(*) FROM public.notifications) as notifications_count;

-- Show RLS policies for notifications
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'notifications'
ORDER BY cmd;

-- ───────────────────────────────────────────────────────────────
-- 5. Test Notification Creation
-- ───────────────────────────────────────────────────────────────

-- Test: Create a sample notification
-- UNCOMMENT TO TEST:
/*
INSERT INTO public.notifications (user_id, title, body, is_read)
SELECT 
  id,
  '🧪 Migration Test Notification',
  'This notification was created by the migration script to verify the system is working.',
  false
FROM public.users
WHERE role IN ('manager', 'supervisor', 'super_admin')
LIMIT 1;
*/

-- ───────────────────────────────────────────────────────────────
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════

-- Migration Notes:
-- 1. This migration fixes the notification system by:
--    a) Creating a manual sync function for auth.users → public.users
--    b) Fixing the RLS policy to use auth.uid() instead of custom function
--    c) Running initial sync to populate public.users
--
-- 2. The manual_sync_auth_users() function should be called from app.js
--    during bootApp() to ensure users are always synced
--
-- 3. If notifications still don't work after this migration:
--    - Check Console logs for [NOTIF-DEBUG] messages
--    - Verify auth.uid() returns a valid UUID when logged in
--    - Ensure S.users array is populated in JavaScript
--
-- 4. To manually test the sync function:
--    SELECT * FROM public.manual_sync_auth_users();
