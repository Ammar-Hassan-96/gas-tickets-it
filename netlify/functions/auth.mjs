// ═══════════════════════════════════════════════════════════════
//  GAS Internal Tickets — Auth & Admin Edge Function
//  v4.0 — Hardened (April 2026)
//
//  CRITICAL CHANGES vs v3.x:
//  ───────────────────────────────────────────────────────────────
//  • Every privileged action now enforces a server-side ROLE check
//    (delete_user, reset_user_password, update_auth_user,
//     create_user_profile, delete_ticket, save_theme, change_password).
//    Previously: only the JWT was verified → ANY logged-in user
//    could escalate to super_admin or wipe other users.
//
//  • CORS is fixed: every JSON response now echoes the validated
//    Origin (or 'null' if disallowed). Previously: hard-coded to
//    one production origin → broken on staging/preview deploys.
//
//  • New `login_with_username` action replaces the deprecated
//    `resolve_username`. The function performs the username→email
//    resolution AND the password grant in one round-trip, so the
//    client never receives the email (mitigates user enumeration).
//
//  • UUID + length validation on every body field that flows into
//    a Supabase URL or auth payload (defense in depth).
//
//  • Self-protection: cannot delete yourself, cannot demote
//    yourself, cannot delete the last super_admin.
//
//  • Password policy: minimum 10 characters on any password reset.
//
//  • change_password now re-verifies the current password before
//    rotating credentials (prevents stolen-token account takeover).
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_ROLE  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

// ─── Allowed Origins (add new deploy URLs here) ────────────────
const ALLOWED_ORIGINS = [
  "https://gas-portal.netlify.app",
  "https://gas-tickets.netlify.app",
  "http://localhost:8888",
  "http://localhost:3000",
  "http://127.0.0.1:8888",
];

// ─── Validation helpers ────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Username: allow letters (any unicode, incl. Arabic), digits, ._-, 1-64 chars
// Reject obvious injection chars: % & ( ) [ ] { } ; ' " < > ` whitespace
const USERNAME_RE = /^[^\s%&()\[\]{};'"<>`\\?#=]{1,64}$/u;

const isUUID    = (v) => typeof v === "string" && UUID_RE.test(v);
const isEmail   = (v) => typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v);
const isUname   = (v) => typeof v === "string" && USERNAME_RE.test(v);
const isStr     = (v, max = 256) => typeof v === "string" && v.length > 0 && v.length <= max;

// Roles
const ROLE_SUPER     = "super_admin";
const ROLE_MANAGER   = "manager";
const ROLE_SUPER_SET = new Set([ROLE_SUPER]);
const ROLE_ADMIN_SET = new Set([ROLE_SUPER, ROLE_MANAGER]);
const VALID_ROLES    = new Set([ROLE_SUPER, ROLE_MANAGER, "supervisor", "employee"]);

// Password policy
const PASSWORD_MIN = 10;
function validatePassword(pwd) {
  if (typeof pwd !== "string") return "كلمة المرور مطلوبة";
  if (pwd.length < PASSWORD_MIN) return `كلمة المرور لازم تكون ${PASSWORD_MIN} أحرف على الأقل`;
  if (pwd.length > 128) return "كلمة المرور طويلة جداً";
  // Require at least one letter and one digit
  if (!/[A-Za-z]/.test(pwd) || !/\d/.test(pwd)) return "كلمة المرور لازم تحتوي على حروف وأرقام";
  return null;
}

// ─── CORS ──────────────────────────────────────────────────────
function corsHeaders(origin) {
  const ok = origin && ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin":  ok ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age":       "86400",
    "Vary":                         "Origin",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders(origin),
    },
  });
}

const ok  = (data, origin)         => json(data, 200, origin);
const err = (msg, status, origin)  => json({ error: msg }, status, origin);

// ─── Supabase REST helpers (service_role) ─────────────────────
async function db(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey:        SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer:        "return=representation",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`DB ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function admin(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    ...opts,
    headers: {
      apikey:        SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  if (!res.ok) {
    const m = parsed?.msg || parsed?.error_description || parsed?.error || text || `Auth ${res.status}`;
    const e = new Error(m);
    e.status = res.status;
    throw e;
  }
  return parsed;
}

// Verify a user's JWT by asking Supabase. The JWT in the Authorization
// header is what's actually validated; the apikey header just identifies
// the project. We use SERVICE_ROLE here (always present) so this works
// even when SUPABASE_ANON_KEY isn't configured as an env var.
async function verifyToken(token) {
  if (!isStr(token, 4096)) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey:        SUPABASE_ANON || SERVICE_ROLE,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Look up the requester's profile (role + department + active flag)
async function getProfile(authId) {
  if (!isUUID(authId)) return null;
  try {
    const rows = await db(`/users?id=eq.${encodeURIComponent(authId)}&select=id,name,role,department,is_active,username,email&limit=1`);
    return rows?.[0] || null;
  } catch { return null; }
}

// requireAuth: returns { au, me } or sends back an error response
async function requireAuth(token, origin) {
  const au = await verifyToken(token);
  if (!au) return { error: err("Unauthorized", 401, origin) };
  const me = await getProfile(au.id);
  if (!me)              return { error: err("Account not found", 401, origin) };
  if (me.is_active === false) return { error: err("Account disabled", 403, origin) };
  return { au, me };
}

async function requireSuperAdmin(token, origin) {
  const r = await requireAuth(token, origin);
  if (r.error) return r;
  if (!ROLE_SUPER_SET.has(r.me.role)) return { error: err("Forbidden — super admin only", 403, origin) };
  return r;
}

async function requireAdmin(token, origin) {
  const r = await requireAuth(token, origin);
  if (r.error) return r;
  if (!ROLE_ADMIN_SET.has(r.me.role)) return { error: err("Forbidden — admin only", 403, origin) };
  return r;
}

// Count remaining super_admins so we never lock the org out
async function countSuperAdmins(excludeId = null) {
  const filter = excludeId
    ? `?role=eq.super_admin&is_active=eq.true&id=neq.${encodeURIComponent(excludeId)}&select=id`
    : `?role=eq.super_admin&is_active=eq.true&select=id`;
  const rows = await db(`/users${filter}`);
  return Array.isArray(rows) ? rows.length : 0;
}

// ─── Audit log helper ──────────────────────────────────────────
// Best-effort: never fails the parent action if audit logging breaks.
// Records every sensitive admin operation in public.audit_logs.
async function logAudit(actor, action, target_type, target_id, target_name, meta = null) {
  try {
    await db("/audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id:     actor?.id || null,
        user_name:   actor?.name || actor?.username || actor?.email || "system",
        user_role:   actor?.role || "system",
        action:      String(action || "UNKNOWN"),
        target_type: String(target_type || "unknown"),
        target_id:   target_id ? String(target_id) : "unknown",
        target_name: String(target_name || "unknown"),
        metadata:    meta,
      }),
    });
  } catch (e) {
    console.error("[auth.mjs] audit log failed:", action, e?.message);
  }
}

// ─── Handler ───────────────────────────────────────────────────
export default async (request) => {
  const origin = request.headers.get("origin") || "";

  // Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return err("Method not allowed", 405, origin);
  }

  // Hard config check — only the two truly required vars.
  // SUPABASE_ANON is optional: if missing, server-side login actions
  // fall back to client-side Supabase auth (the original behaviour).
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return err("Server misconfigured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)", 500, origin);
  }

  // Parse body
  let body;
  try {
    const raw = await request.text();
    if (!raw || raw.length > 32_768) return err("Invalid request body", 400, origin);
    body = JSON.parse(raw);
  } catch {
    return err("Invalid JSON", 400, origin);
  }

  const action = body?.action;
  if (!isStr(action, 64)) return err("Missing action", 400, origin);

  try {
    // ───────────────────────────────────────────────────────────
    //  PUBLIC ACTIONS (no token) — login + session restore only
    // ───────────────────────────────────────────────────────────

    // NEW: combined username→login. Client never sees the email.
    if (action === "login_with_username") {
      const { username, password } = body;
      if (!isStr(username, 254) || !isStr(password, 128)) {
        return err("بيانات الدخول غير صحيحة", 400, origin);
      }

      // Allow either a username OR a literal email
      let email = null;
      const uname = username.trim();
      if (uname.includes("@")) {
        if (!isEmail(uname)) return err("بيانات الدخول غير صحيحة", 400, origin);
        email = uname.toLowerCase();
      } else {
        if (!isUname(uname)) return err("بيانات الدخول غير صحيحة", 400, origin);
        // Case-insensitive lookup. Don't enforce is_active here —
        // if the user is deactivated, the password grant itself
        // will fail. We also gracefully degrade if is_active column
        // doesn't exist in the schema.
        let row = null;
        try {
          const rows = await db(
            `/users?username=ilike.${encodeURIComponent(uname)}` +
            `&select=email,is_active&limit=1`
          );
          row = rows?.[0] || null;
        } catch {
          // Fallback: schema may not have is_active column
          try {
            const rows = await db(
              `/users?username=ilike.${encodeURIComponent(uname)}` +
              `&select=email&limit=1`
            );
            row = rows?.[0] || null;
          } catch { row = null; }
        }
        if (row && row.is_active !== false && isEmail(row.email)) {
          email = row.email;
        }
      }

      // Constant-ish response time to reduce timing oracle
      const minDelay = new Promise(r => setTimeout(r, 250));

      if (!email) {
        await minDelay;
        return err("اسم المستخدم أو كلمة المرور غير صحيحة", 401, origin);
      }

      // Password grant via Supabase Auth.
      // Falls back to SERVICE_ROLE for the apikey header so the call
      // succeeds even when SUPABASE_ANON_KEY isn't set as an env var.
      const tokRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          apikey:        SUPABASE_ANON || SERVICE_ROLE,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      const tok = await tokRes.json().catch(() => ({}));
      await minDelay;

      if (!tokRes.ok || !tok.access_token) {
        return err("اسم المستخدم أو كلمة المرور غير صحيحة", 401, origin);
      }

      // Best-effort: refresh last_login (don't fail the login on error)
      try {
        if (tok.user?.id) {
          await db(`/users?id=eq.${encodeURIComponent(tok.user.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ last_login: new Date().toISOString() }),
          });
        }
      } catch { /* ignore */ }

      return ok({
        access_token:  tok.access_token,
        refresh_token: tok.refresh_token,
        expires_in:    tok.expires_in,
        expires_at:    tok.expires_at,
        token_type:    tok.token_type,
        user:          tok.user,
      }, origin);
    }

    // DEPRECATED — kept only to avoid breaking older cached app.js
    // Returns email but with a constant minimum delay; new client uses
    // login_with_username instead.
    if (action === "resolve_username") {
      const { username } = body;
      const minDelay = new Promise(r => setTimeout(r, 250));
      const uname = (typeof username === "string" ? username.trim() : "");
      if (!isUname(uname)) {
        await minDelay;
        return err("اسم المستخدم غير صحيح", 400, origin);
      }
      let row = null;
      try {
        const rows = await db(
          `/users?username=ilike.${encodeURIComponent(uname)}` +
          `&select=email,is_active&limit=1`
        );
        row = rows?.[0] || null;
      } catch {
        try {
          const rows = await db(
            `/users?username=ilike.${encodeURIComponent(uname)}` +
            `&select=email&limit=1`
          );
          row = rows?.[0] || null;
        } catch { row = null; }
      }
      await minDelay;
      if (row && row.is_active !== false && isEmail(row.email)) {
        return ok({ email: row.email }, origin);
      }
      // Generic 401 — same message for "not found" and any other failure
      return err("اسم المستخدم أو كلمة المرور غير صحيحة", 401, origin);
    }

    // ───────────────────────────────────────────────────────────
    //  AUTHENTICATED ACTIONS (token required)
    // ───────────────────────────────────────────────────────────

    // heartbeat — bumps the requester's last_seen so the dashboard
    // can show them as "online". Called every ~3 minutes by the client.
    // Safe-by-default: if the users table doesn't have a last_seen
    // column, falls back to last_login.
    if (action === "heartbeat") {
      const r = await requireAuth(body.token, origin);
      if (r.error) return r.error;
      const now = new Date().toISOString();
      try {
        await db(`/users?id=eq.${encodeURIComponent(r.au.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ last_seen: now }),
        });
      } catch {
        try {
          await db(`/users?id=eq.${encodeURIComponent(r.au.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ last_login: now }),
          });
        } catch { /* ignore — column missing */ }
      }
      return ok({ success: true, ts: now }, origin);
    }

    // get_sessions — returns currently-online users
    //   - super_admin → everyone in the system
    //   - manager     → only users in their own department
    //   - others      → forbidden
    // "Online" = last_seen (or last_login) within the last 10 minutes.
    if (action === "get_sessions") {
      const r = await requireAuth(body.token, origin);
      if (r.error) return r.error;
      if (!ROLE_ADMIN_SET.has(r.me.role)) {
        return err("Forbidden", 403, origin);
      }

      const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const enc    = encodeURIComponent(cutoff);

      // Department filter for non-super admins
      const deptFilter = (r.me.role === ROLE_MANAGER && r.me.department)
        ? `&department=eq.${encodeURIComponent(r.me.department)}`
        : "";

      // Try multiple shapes — schema varies. We don't filter on
      // is_active in the query (column may not exist); we filter
      // client-side after fetching.
      const tryQuery = async (col) => {
        try {
          const rows = await db(
            `/users?${col}=gte.${enc}${deptFilter}` +
            `&select=id,name,role,department,is_active,${col}` +
            `&order=${col}.desc&limit=200`
          );
          return Array.isArray(rows) ? rows : null;
        } catch {
          // Maybe is_active column missing → retry without it
          try {
            const rows = await db(
              `/users?${col}=gte.${enc}${deptFilter}` +
              `&select=id,name,role,department,${col}` +
              `&order=${col}.desc&limit=200`
            );
            return Array.isArray(rows) ? rows : null;
          } catch { return null; }
        }
      };

      let users = (await tryQuery("last_seen"))
                ?? (await tryQuery("last_login"))
                ?? [];

      // Final fallback: Supabase auth.users always tracks last_sign_in_at.
      // If the public.users schema has neither last_seen nor last_login,
      // we still get a useful answer — anyone whose JWT was issued/refreshed
      // in the last 15 minutes counts as online.
      if (users.length === 0) {
        try {
          const adminRes = await admin(`/admin/users?per_page=1000`);
          const authUsers = Array.isArray(adminRes)
            ? adminRes
            : (adminRes?.users || []);
          const cutoffMs  = Date.now() - 15 * 60 * 1000;
          const activeIds = authUsers
            .filter(u => u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() > cutoffMs)
            .map(u => u.id)
            .filter(isUUID);

          if (activeIds.length) {
            // Fetch matching profiles in one shot
            const idList = activeIds.map(encodeURIComponent).join(",");
            try {
              const rows = await db(
                `/users?id=in.(${idList})${deptFilter}` +
                `&select=id,name,role,department,is_active`
              );
              if (Array.isArray(rows)) users = rows;
            } catch {
              try {
                const rows = await db(
                  `/users?id=in.(${idList})${deptFilter}` +
                  `&select=id,name,role,department`
                );
                if (Array.isArray(rows)) users = rows;
              } catch { /* give up */ }
            }
          }
        } catch { /* admin API not reachable */ }
      }

      // Exclude only users who are *explicitly* deactivated.
      const list = users
        .filter(u => u.is_active !== false)
        .map(u => ({
          name:       u.name,
          role:       u.role,
          department: u.department,
        }));

      return ok({ total: list.length, users: list }, origin);
    }

    // change_password — REQUIRES current password verification
    if (action === "change_password") {
      const r = await requireAuth(body.token, origin);
      if (r.error) return r.error;

      const { old_password, new_password } = body;
      if (!isStr(old_password, 128)) return err("كلمة المرور الحالية مطلوبة", 400, origin);

      const pErr = validatePassword(new_password);
      if (pErr) return err(pErr, 400, origin);
      if (old_password === new_password) return err("كلمة المرور الجديدة لازم تكون مختلفة", 400, origin);

      // Re-authenticate with the OLD password before allowing rotation.
      // Falls back to SERVICE_ROLE for the apikey header (both work).
      const reauth = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          apikey:        SUPABASE_ANON || SERVICE_ROLE,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: r.me.email, password: old_password }),
      });
      if (!reauth.ok) {
        return err("كلمة المرور الحالية غير صحيحة", 401, origin);
      }

      // Rotate via admin API
      await admin(`/admin/users/${encodeURIComponent(r.au.id)}`, {
        method: "PUT",
        body: JSON.stringify({ password: new_password }),
      });

      await logAudit(r.me, "CHANGE_PASSWORD", "user", r.au.id, r.me.username || r.me.email, { self: true });
      return ok({ success: true }, origin);
    }

    // save_theme — current user only, ignore body.user_id entirely
    if (action === "save_theme") {
      const r = await requireAuth(body.token, origin);
      if (r.error) return r.error;
      const theme = body.theme;
      if (theme !== "dark" && theme !== "light") return err("Invalid theme", 400, origin);

      await db(`/users?id=eq.${encodeURIComponent(r.au.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ theme_pref: theme }),
      });
      return ok({ success: true }, origin);
    }

    // mark_notif_read — only the owner of the notification
    if (action === "mark_notif_read") {
      const r = await requireAuth(body.token, origin);
      if (r.error) return r.error;

      if (body.notif_id) {
        if (!isUUID(body.notif_id)) return err("Invalid notif_id", 400, origin);
        await db(
          `/notifications?id=eq.${encodeURIComponent(body.notif_id)}&user_id=eq.${encodeURIComponent(r.au.id)}`,
          { method: "PATCH", body: JSON.stringify({ is_read: true, read_at: new Date().toISOString() }) },
        );
      } else {
        await db(
          `/notifications?user_id=eq.${encodeURIComponent(r.au.id)}&is_read=eq.false`,
          { method: "PATCH", body: JSON.stringify({ is_read: true, read_at: new Date().toISOString() }) },
        );
      }
      return ok({ success: true }, origin);
    }

    // ───────────────────────────────────────────────────────────
    //  ADMIN-ONLY ACTIONS  (super_admin / manager)
    // ───────────────────────────────────────────────────────────

    // create_auth_user — admin only (manager can create within own dept)
    if (action === "create_auth_user") {
      const r = await requireAdmin(body.token, origin);
      if (r.error) return r.error;

      const { email, password, user_metadata } = body;
      if (!isEmail(email)) return err("Invalid email", 400, origin);
      const pErr = validatePassword(password);
      if (pErr) return err(pErr, 400, origin);

      // A non-super manager can only create users in their own department
      // and may NOT create super_admins.
      const meta = (user_metadata && typeof user_metadata === "object") ? user_metadata : {};
      if (meta.role && !VALID_ROLES.has(meta.role)) return err("Invalid role", 400, origin);
      if (meta.role === ROLE_SUPER && r.me.role !== ROLE_SUPER) {
        return err("Forbidden — only super admins can create super admins", 403, origin);
      }
      if (r.me.role === ROLE_MANAGER) {
        if (meta.department && meta.department !== r.me.department) {
          return err("Forbidden — managers can only create users in their own department", 403, origin);
        }
      }

      const created = await admin("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: meta,
        }),
      });
      await logAudit(r.me, "CREATE_USER", "user", created?.id, meta.name || meta.username || email, {
        email,
        role: meta.role || "employee",
        department: meta.department || null,
      });
      return ok({ user: created }, origin);
    }

    // create_user_profile — admin only
    if (action === "create_user_profile") {
      const r = await requireAdmin(body.token, origin);
      if (r.error) return r.error;

      const { profile } = body;
      if (!profile || typeof profile !== "object") return err("Invalid profile", 400, origin);
      if (!isUUID(profile.id))                     return err("Invalid profile.id", 400, origin);
      if (profile.email && !isEmail(profile.email))return err("Invalid email", 400, origin);
      if (profile.role && !VALID_ROLES.has(profile.role)) return err("Invalid role", 400, origin);
      if (profile.role === ROLE_SUPER && r.me.role !== ROLE_SUPER) {
        return err("Forbidden — only super admins can create super admins", 403, origin);
      }
      if (r.me.role === ROLE_MANAGER && profile.department && profile.department !== r.me.department) {
        return err("Forbidden — managers can only create users in their own department", 403, origin);
      }

      const safe = {
        id:          profile.id,
        email:       profile.email,
        username:    profile.username,
        name:        profile.name,
        role:        profile.role || "employee",
        department:  profile.department || null,
        phone:       profile.phone || null,
        is_active:   profile.is_active !== false,
      };
      const inserted = await db("/users", { method: "POST", body: JSON.stringify(safe) });
      await logAudit(r.me, "CREATE_USER_PROFILE", "user", profile.id, safe.name || safe.username || safe.email, {
        role: safe.role,
        department: safe.department,
      });
      return ok({ profile: inserted?.[0] || inserted }, origin);
    }

    // update_auth_user — admin only, with strict guards
    if (action === "update_auth_user") {
      const r = await requireAdmin(body.token, origin);
      if (r.error) return r.error;

      const { user_id, email, password, user_metadata } = body;
      if (!isUUID(user_id)) return err("Invalid user_id", 400, origin);

      // Look up the target so we can enforce per-role rules
      const target = await getProfile(user_id);
      if (!target) return err("Target user not found", 404, origin);

      // Managers: only their own department, never edit super_admins
      if (r.me.role === ROLE_MANAGER) {
        if (target.role === ROLE_SUPER) {
          return err("Forbidden — managers cannot edit super admins", 403, origin);
        }
        if (target.department && target.department !== r.me.department) {
          return err("Forbidden — managers can only edit users in their own department", 403, origin);
        }
      }

      // Build the auth payload safely
      const payload = {};
      if (email !== undefined) {
        if (!isEmail(email)) return err("Invalid email", 400, origin);
        payload.email = email;
      }
      if (password !== undefined) {
        const pErr = validatePassword(password);
        if (pErr) return err(pErr, 400, origin);
        payload.password = password;
      }
      if (user_metadata !== undefined) {
        if (!user_metadata || typeof user_metadata !== "object") return err("Invalid user_metadata", 400, origin);
        const newRole = user_metadata.role;
        if (newRole !== undefined) {
          if (!VALID_ROLES.has(newRole)) return err("Invalid role", 400, origin);
          // Only super_admin can grant or revoke super_admin
          if ((newRole === ROLE_SUPER || target.role === ROLE_SUPER) && r.me.role !== ROLE_SUPER) {
            return err("Forbidden — only super admins can change super admin role", 403, origin);
          }
          // Self-demotion guard: never let a super_admin demote themselves
          if (user_id === r.au.id && r.me.role === ROLE_SUPER && newRole !== ROLE_SUPER) {
            return err("Forbidden — you cannot demote yourself", 403, origin);
          }
          // Don't lock the system out
          if (target.role === ROLE_SUPER && newRole !== ROLE_SUPER) {
            const remaining = await countSuperAdmins(user_id);
            if (remaining < 1) return err("Cannot demote the last super admin", 403, origin);
          }
        }
        payload.user_metadata = user_metadata;
      }

      if (Object.keys(payload).length === 0) return err("Nothing to update", 400, origin);

      const updated = await admin(`/admin/users/${encodeURIComponent(user_id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      // Mirror role/department changes into public.users
      if (user_metadata && (user_metadata.role || user_metadata.department || user_metadata.name)) {
        const mirror = {};
        if (user_metadata.role)       mirror.role = user_metadata.role;
        if (user_metadata.department) mirror.department = user_metadata.department;
        if (user_metadata.name)       mirror.name = user_metadata.name;
        if (Object.keys(mirror).length) {
          try {
            await db(`/users?id=eq.${encodeURIComponent(user_id)}`, {
              method: "PATCH",
              body: JSON.stringify(mirror),
            });
          } catch { /* mirror is best-effort */ }
        }
      }

      // Build a safe meta payload (don't log passwords)
      const auditMeta = {};
      if (payload.email)         auditMeta.email_changed    = true;
      if (payload.password)      auditMeta.password_changed = true;
      if (payload.user_metadata) auditMeta.metadata_changed = Object.keys(payload.user_metadata);
      await logAudit(r.me, "UPDATE_USER", "user", user_id, target.username || target.email, auditMeta);

      return ok({ user: updated }, origin);
    }

    // reset_user_password — admin only
    if (action === "reset_user_password") {
      const r = await requireAdmin(body.token, origin);
      if (r.error) return r.error;

      const { user_id, new_password } = body;
      if (!isUUID(user_id))         return err("Invalid user_id", 400, origin);
      const pErr = validatePassword(new_password);
      if (pErr)                     return err(pErr, 400, origin);

      const target = await getProfile(user_id);
      if (!target) return err("Target user not found", 404, origin);

      // Managers: own department only, never reset super_admin passwords
      if (r.me.role === ROLE_MANAGER) {
        if (target.role === ROLE_SUPER) {
          return err("Forbidden — managers cannot reset super admin passwords", 403, origin);
        }
        if (target.department && target.department !== r.me.department) {
          return err("Forbidden — managers can only reset users in their own department", 403, origin);
        }
      }

      await admin(`/admin/users/${encodeURIComponent(user_id)}`, {
        method: "PUT",
        body: JSON.stringify({ password: new_password }),
      });
      await logAudit(r.me, "RESET_PASSWORD", "user", user_id, target.username || target.email, {
        target_role: target.role,
        target_department: target.department,
      });
      return ok({ success: true }, origin);
    }

    // delete_user — SUPER ADMIN only, with self + last-super guards
    if (action === "delete_user") {
      const r = await requireSuperAdmin(body.token, origin);
      if (r.error) return r.error;

      const { user_id } = body;
      if (!isUUID(user_id)) return err("Invalid user_id", 400, origin);
      if (user_id === r.au.id) return err("لا يمكنك حذف حسابك الخاص", 403, origin);

      const target = await getProfile(user_id);
      if (!target) return err("Target user not found", 404, origin);

      // Never delete the last super_admin
      if (target.role === ROLE_SUPER) {
        const remaining = await countSuperAdmins(user_id);
        if (remaining < 1) return err("Cannot delete the last super admin", 403, origin);
      }

      // Soft-delete the profile first (preserves FKs / audit trail),
      // then hard-delete the auth user. We never touch tickets.
      try {
        await db(`/users?id=eq.${encodeURIComponent(user_id)}`, {
          method: "PATCH",
          body: JSON.stringify({ is_active: false, deleted_at: new Date().toISOString() }),
        });
      } catch { /* if column doesn't exist, fall through */ }

      await admin(`/admin/users/${encodeURIComponent(user_id)}`, { method: "DELETE" });

      // Finally remove the public profile row
      try {
        await db(`/users?id=eq.${encodeURIComponent(user_id)}`, { method: "DELETE" });
      } catch { /* row may already be cascaded */ }

      await logAudit(r.me, "DELETE_USER", "user", user_id, target.username || target.email, {
        target_role: target.role,
        target_department: target.department,
      });
      return ok({ success: true }, origin);
    }

    // delete_ticket — SUPER ADMIN only (destructive)
    if (action === "delete_ticket") {
      const r = await requireSuperAdmin(body.token, origin);
      if (r.error) return r.error;

      const { ticket_id } = body;
      if (!isUUID(ticket_id)) return err("Invalid ticket_id", 400, origin);

      // Children first, then ticket itself. We do NOT touch storage objects
      // here — surface a warning if there are attachments so an admin can
      // reconcile manually instead of silently orphaning files.
      let attachCount = 0;
      // Fetch ticket info BEFORE deleting (for audit trail)
      let ticketInfo = null;
      try {
        const rows = await db(`/tickets?id=eq.${encodeURIComponent(ticket_id)}&select=ticket_number,title,target_department&limit=1`);
        ticketInfo = rows?.[0] || null;
      } catch { /* ignore */ }

      try {
        const att = await db(`/ticket_attachments?ticket_id=eq.${encodeURIComponent(ticket_id)}&select=id`);
        attachCount = Array.isArray(att) ? att.length : 0;
      } catch { /* attachments table may not exist */ }

      try { await db(`/ticket_comments?ticket_id=eq.${encodeURIComponent(ticket_id)}`,    { method: "DELETE" }); } catch {}
      try { await db(`/ticket_attachments?ticket_id=eq.${encodeURIComponent(ticket_id)}`, { method: "DELETE" }); } catch {}
      try { await db(`/notifications?ticket_id=eq.${encodeURIComponent(ticket_id)}`,     { method: "DELETE" }); } catch {}
      await db(`/tickets?id=eq.${encodeURIComponent(ticket_id)}`, { method: "DELETE" });

      await logAudit(
        r.me,
        "DELETE_TICKET",
        "ticket",
        ticket_id,
        ticketInfo?.ticket_number || ticketInfo?.title || ticket_id,
        {
          ticket_number: ticketInfo?.ticket_number,
          title: ticketInfo?.title,
          target_department: ticketInfo?.target_department,
          orphan_attachments: attachCount,
        }
      );

      return ok({ success: true, orphan_attachments: attachCount }, origin);
    }

    // ───────────────────────────────────────────────────────────
    return err(`Unknown action: ${action}`, 400, origin);
  } catch (e) {
    // Never leak stack traces or DB error strings to the client
    console.error("[auth.mjs]", action, e);
    const status = e?.status && Number.isInteger(e.status) ? e.status : 500;
    const msg = status >= 500 ? "Internal error" : (e?.message || "Request failed");
    return err(msg, status, origin);
  }
};

export const config = { path: "/api/auth" };
