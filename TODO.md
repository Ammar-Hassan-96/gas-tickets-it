# 🔴 SECURITY INCIDENT RESPONSE — TODO
## GAS Internal Tickets — Active Breach Response

---

## ✅ Phase 0: Information Gathering (DONE)
- [x] Analyzed app.js — exposed publishable key confirmed
- [x] Analyzed RLS policies — critical vulnerability in `users_update` WITH CHECK
- [x] Reviewed all hardening SQL files — Part 1, 2, 3
- [x] Reviewed SECURITY-HARDENING-REPORT.js and INCIDENT-RESOLUTION-REPORT.js

## 🔴 Phase 1: Emergency Fixes (COMPLETED)
- [x] Create `emergency-rls-lockdown.sql` — comprehensive policy rewrite ✅
- [x] Create `emergency-session-kill.sql` — invalidate all active sessions ✅
- [x] Create `emergency-backdoor-audit.sql` — detect unauthorized accounts/role changes ✅
- [x] Fix `app.js` — add integrity checks + tamper detection + nonce ✅
- [x] Update `netlify.toml` — add additional security hardening ✅

## 🔴 PHASE 2: DEPLOY NOW (Your Action Required)
- [ ] Step 1: Run `emergency-rls-lockdown.sql` in Supabase SQL Editor
- [ ] Step 2: Run `emergency-session-kill.sql` in Supabase SQL Editor
- [ ] Step 3: Run `emergency-backdoor-audit.sql` in Supabase SQL Editor
- [ ] Step 4: Rotate Supabase API keys (anon + service_role) in Dashboard
- [ ] Step 5: Update Netlify environment variables with new keys
- [ ] Step 6: git add, commit, push all changes
- [ ] Step 7: Force all users to re-login

## 🟠 Phase 2: Verification & Testing
- [ ] Run RLS status check in Supabase SQL Editor
- [ ] Test Postman Attack — must return `[]` empty
- [ ] Test Role Escalation — employee cannot change role to manager/supervisor
- [ ] Test Cross-Department Access — blocked

## 🟡 Phase 3: Key Rotation & Deployment
- [ ] Rotate Supabase anon key (via Supabase Dashboard → Settings → API)
- [ ] Rotate Supabase service_role key (CRITICAL)
- [ ] Update Netlify environment variables with new keys
- [ ] Redeploy app with new key
- [ ] Force all users to re-login

## 🟢 Phase 4: Monitoring & Documentation
- [ ] Enable Supabase realtime logs
- [ ] Document incident timeline
- [ ] Brief team on new security posture

---

## 🚨 CRITICAL VULNERABILITIES FOUND

### Vuln #1: Role Escalation in `users_update` policy
**Location:** `supabase-rls-hardening-part1.sql` line ~115
```sql
WITH CHECK ((app_is_super()) OR (role <> 'super_admin'))
```
**Problem:** Employee can change role to `manager` or `supervisor` — full department takeover.
**Fix:** `WITH CHECK (app_is_super())` for role changes only.

### Vuln #2: Overly Permissive `users_select` policy
**Location:** `supabase-rls-hardening-part1.sql` line ~95
```sql
CREATE POLICY "users_select" ON public.users FOR SELECT USING (app_current_user_id() IS NOT NULL);
```
**Problem:** Any authenticated user sees ALL users, their roles, departments, emails.
**Fix:** Role-based SELECT: self + same-dept (for managers) + super_admin.

### Vuln #3: Exposed Publishable Key
**Location:** `app.js` line 11-12
```js
const CFG = {
  supabaseUrl: 'https://rmlkhgktwologfhphtyz.supabase.co',
  supabaseKey: 'sb_publishable_g3HM0Y7GIM2A72f63Y74UA_1eJxH7dF',
```
**Problem:** Key is public. Combined with any valid session = full data access.
**Fix:** Move to environment + rotate immediately.

---

## 📁 Files to Edit
1. `supabase-rls-hardening-part1.sql` — rewrite users policies
2. `supabase-rls-hardening-part2.sql` — review tickets policies
3. `app.js` — key isolation + token handling improvements
4. `netlify.toml` — additional headers
5. NEW: `emergency-rls-lockdown.sql` — one-file emergency deployment
6. NEW: `emergency-session-kill.sql` — session purge
7. NEW: `emergency-backdoor-audit.sql` — unauthorized account detection

