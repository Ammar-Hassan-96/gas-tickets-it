// ═══════════════════════════════════════════════════════════
// GAS IT Desk — Netlify Function v5.0 SECURE
// Path: netlify/functions/auth.mjs
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL  = "https://rmlkhgktwologfhphtyz.supabase.co";
const SUPABASE_ANON = "sb_publishable_bSRIIPeiuwARjUlSnUJpQg_AIrFZH8B";
const SVC_KEY       = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_ORIGINS = [
  'https://gas-portal.netlify.app',
  'http://localhost:8888',
  'http://localhost:3000',
];

// ── CORS ───────────────────────────────────────────────────
function getCORS(req) {
  const origin  = req.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}

const json = (d, s = 200, req) => new Response(JSON.stringify(d), {
  status: s,
  headers: {
    "Content-Type": "application/json",
    ...(req ? getCORS(req) : { "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0] }),
  }
});
const err = (m, s = 400, req) => json({ error: m }, s, req);

// ── DB HELPERS ─────────────────────────────────────────────
async function db(path, opts = {}) {
  const key = SVC_KEY();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey:         key,
      Authorization:  `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer:         "return=representation",
      ...(opts.headers ?? {}),
    },
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`DB ${res.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}

async function authAdmin(path, opts = {}) {
  const key = SVC_KEY();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin${path}`, {
    ...opts,
    headers: {
      apikey:         key,
      Authorization:  `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`AuthAdmin ${res.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}

// ── JWT VERIFICATION ───────────────────────────────────────
async function verifyToken(token) {
  if (!token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.id ? d : null;
  } catch { return null; }
}

// ── ROLE HELPER ────────────────────────────────────────────
async function getMyProfile(authUserId) {
  const rows = await db(`/users?id=eq.${authUserId}&select=id,role,department,is_active`);
  return rows?.[0] || null;
}

const ADMIN_ROLES = ["super_admin", "manager"];

// ══════════════════════════════════════════════════════════
export default async function handler(req) {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: getCORS(req) });

  let body;
  try { body = await req.json(); } catch { return err("Invalid JSON", 400, req); }
  const { action, token } = body;

  try {

    // ─────────────────────────────────────────────────────
    // resolve_username → email
    // ─────────────────────────────────────────────────────
    if (action === "resolve_username") {
      const { username } = body;
      if (!username || typeof username !== "string" || username.length > 100)
        return err("Invalid username", 400, req);
      const rows = await db(
        `/users?username=eq.${encodeURIComponent(username.trim())}&select=email&is_active=eq.true`
      );
      if (!rows?.length) return err("Not found", 404, req);
      return json({ email: rows[0].email }, 200, req);
    }

    // ─────────────────────────────────────────────────────
    // get_sessions — المستخدمون النشطون (last_seen خلال 15 دقيقة)
    // ─────────────────────────────────────────────────────
    if (action === "get_sessions") {
      const au = await verifyToken(token);
      if (!au) return err("Unauthorized", 401, req);
      const me = await getMyProfile(au.id);
      if (!me || !ADMIN_ROLES.includes(me.role))
        return err("Forbidden", 403, req);

      const since   = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const isSuper = me.role === "super_admin";

      const filter = isSuper
        ? `/users?last_seen=gte.${since}&is_active=eq.true&select=id,name,role,department,last_seen&order=last_seen.desc`
        : `/users?last_seen=gte.${since}&is_active=eq.true&department=eq.${encodeURIComponent(me.department || "")}&select=id,name,role,department,last_seen&order=last_seen.desc`;

      const users = await db(filter) || [];
      return json({ total: users.length, users }, 200, req);
    }

    // ─────────────────────────────────────────────────────
    // save_theme
    // ─────────────────────────────────────────────────────
    if (action === "save_theme") {
      const au = await verifyToken(token);
      if (!au) return err("Unauthorized", 401, req);
      const theme = body.theme;
      if (!["dark", "light"].includes(theme)) return err("Invalid theme", 400, req);
      await db(`/users?id=eq.${au.id}`, {
        method: "PATCH",
        body:   JSON.stringify({ theme_pref: theme }),
      });
      return json({ success: true }, 200, req);
    }

    // ─────────────────────────────────────────────────────
    // create_auth_user  (manager / super_admin)
    // ─────────────────────────────────────────────────────
    if (action === "create_auth_user") {
      const au = await verifyToken(token);
      if (!au) return err("Unauthorized", 401, req);
      const me = await getMyProfile(au.id);
      if (!me || !ADMIN_ROLES.includes(me.role))
        return err("Forbidden", 403, req);

      const { email, password, username, name, role, department } = body;
      if (!email || !password || !username)
        return err("Missing fields", 400, req);

      if (me.role === "manager") {
        if (!["employee", "supervisor"].includes(role || "employee"))
          return err("Forbidden — role not allowed", 403, req);
        if ((department || "").trim() !== (me.department || "").trim())
          return err("Forbidden — department mismatch", 403, req);
      }

      const newAuth = await authAdmin("/users", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            username,
            name:       name || username,
            role:       role || "employee",
            department: department || "",
          },
        }),
      });
      return json({ success: true, user_id: newAuth.id, auth_id: newAuth.id }, 200, req);
    }

    // ─────────────────────────────────────────────────────
    // create_user_profile  (manager / super_admin) ✅ FIX
    // ─────────────────────────────────────────────────────
    if (action === "create_user_profile") {
      const au = await verifyToken(token);
      if (!au) return err("Unauthorized", 401, req);

      // ✅ الإصلاح الرئيسي: التحقق من الصلاحية كان مفقوداً
      const me = await getMyProfile(au.id);
      if (!me || !ADMIN_ROLES.includes(me.role))
        return err("Forbidden", 403, req);

      const { user_id, username, name, email, role, department } = body;
      if (!user_id || !username) return err("Missing fields", 400, req);

      if (me.role === "manager") {
        if (!["employee", "supervisor"].includes(role || "employee"))
          return err("Forbidden — role not allowed", 403, req);
        if ((department || "").trim() !== (me.department || "").trim())
          return err("Forbidden — department mismatch", 403, req);
      }

      await db("/users", {
        method: "POST",
        body: JSON.stringify({
          id:         user_id,
          username,
          name:       name || username,
          email,
          role:       role || "employee",
          department: department || "",
          is_active:  true,
        }),
      });
      return json({ success: true }, 200, req);
    }

    // ─────────────────────────────────────────────────────
    // update_auth_user  (manager / super_admin) ✅ FIX
    // ─────────────────────────────────────────────────────
    if (action === "update_auth_user") {
      const au = await verifyToken(token);
      if (!au) return err("Unauthorized", 401, req);
      const me = await getMyProfile(au.id);
      if (!me || !ADMIN_ROLES.includes(me.role))
        return err("Forbidden", 403, req);

      const { user_id, email, role, department, name, username, is_active, new_password } = body;
      if (!user_id) return err("Missing user_id", 400, req);

      // ✅ الإصلاح: مدير الإدارة يعدّل فقط في إدارته وعلى أدوار أقل
      if (me.role === "manager") {
        const target = await getMyProfile(user_id);
        if (!target) return err("User not found", 404, req);
        if ((target.department || "").trim() !== (me.department || "").trim())
          return err("Forbidden — different department", 403, req);
        if (!["employee", "supervisor"].includes(target.role))
          return err("Forbidden — cannot edit this role", 403, req);
        if (role && !["employee", "supervisor"].includes(role))
          return err("Forbidden — cannot assign this role", 403, req);
      }

      const authUpdate = {};
      if (email) authUpdate.email = email;
      if (new_password) authUpdate.password = new_password;
      const existMeta = (await authAdmin(`/users/${user_id}`))?.user_metadata || {};
      const newMeta   = { ...existMeta };
      if (name)                     newMeta.name       = name;
      if (username)                 newMeta.username   = username;
      if (role)                     newMeta.role       = role;
      if (department !== undefined) newMeta.department = department;
      authUpdate.user_metadata = newMeta;
      await authAdmin(`/users/${user_id}`, { method: "PUT", body: JSON.stringify(authUpdate) });

      const pub = { updated_at: new Date().toISOString() };
      if (email)                    pub.email      = email;
      if (name)                     pub.name       = name;
      if (username)                 pub.username   = username;
      if (role)                     pub.role       = role;
      if (department !== undefined) pub.department = department;
      if (is_active !== undefined)  pub.is_active  = is_active;
      await db(`/users?id=eq.${user_id}`, { method: "PATCH", body: JSON.stringify(pub) });

      return json({ success: true }, 200, req);
    }

    // ─────────────────────────────────────────────────────
    // delete_user  (manager / super_admin) ✅ FIX
    // ─────────────────────────────────────────────────────
    if (action === "delete_user") {
      const au = await verifyToken(token);
      if (!au) return err("Unauthorized", 401, req);
      const me = await getMyProfile(au.id);
      if (!me || !ADMIN_ROLES.includes(me.role))
        return err("Forbidden", 403, req);

      const { user_id } = body;
      if (!user_id) return err("Missing user_id", 400, req);
      if (user_id === au.id) return err("Cannot delete yourself", 403, req);

      if (me.role === "manager") {
        const target = await getMyProfile(user_id);
        if (!target) return err("User not found", 404, req);
        if ((target.department || "").trim() !== (me.department || "").trim())
          return err("Forbidden — different department", 403, req);
        if (!["employee", "supervisor"].includes(target.role))
          return err("Forbidden — cannot delete this role", 403, req);
      }

      try { await authAdmin(`/users/${user_id}`, { method: "DELETE" }); } catch {}
      await db(`/users?id=eq.${user_id}`, { method: "DELETE" });
      return json({ success: true }, 200, req);
    }

    // ─────────────────────────────────────────────────────
    // reset_user_password  (manager / super_admin)
    // ─────────────────────────────────────────────────────
    if (action === "reset_user_password") {
      const au = await verifyToken(token);
      if (!au) return err("Unauthorized", 401, req);
      const me = await getMyProfile(au.id);
      if (!me || !ADMIN_ROLES.includes(me.role))
        return err("Forbidden", 403, req);

      const { user_id, new_password } = body;
      if (!user_id || !new_password) return err("Missing fields", 400, req);
      if (new_password.length < 8)   return err("Password too short (min 8)", 400, req);

      if (me.role === "manager") {
        const target = await getMyProfile(user_id);
        if (!target) return err("User not found", 404, req);
        if ((target.department || "").trim() !== (me.department || "").trim())
          return err("Forbidden — different department", 403, req);
        if (!["employee", "supervisor"].includes(target.role))
          return err("Forbidden — cannot reset this role", 403, req);
      }

      await authAdmin(`/users/${user_id}`, {
        method: "PUT",
        body:   JSON.stringify({ password: new_password }),
      });
      return json({ success: true }, 200, req);
    }

    // ─────────────────────────────────────────────────────
    // change_password  (أي مستخدم مسجل)
    // ─────────────────────────────────────────────────────
    if (action === "change_password") {
      const au = await verifyToken(token);
      if (!au) return err("Unauthorized", 401, req);
      const { new_password } = body;
      if (!new_password)           return err("Missing new_password", 400, req);
      if (new_password.length < 8) return err("Password too short (min 8)", 400, req);
      await authAdmin(`/users/${au.id}`, {
        method: "PUT",
        body:   JSON.stringify({ password: new_password }),
      });
      return json({ success: true }, 200, req);
    }

    // ─────────────────────────────────────────────────────
    // delete_ticket  (manager / super_admin)
    // ─────────────────────────────────────────────────────
    if (action === "delete_ticket") {
      const au = await verifyToken(token);
      if (!au) return err("Unauthorized", 401, req);
      const me = await getMyProfile(au.id);
      if (!me || !ADMIN_ROLES.includes(me.role))
        return err("Forbidden", 403, req);

      const { ticket_id } = body;
      if (!ticket_id) return err("Missing ticket_id", 400, req);

      if (me.role === "manager") {
        const ticket = await db(`/tickets?id=eq.${ticket_id}&select=target_department`);
        if (!ticket?.length) return err("Ticket not found", 404, req);
        if ((ticket[0].target_department || "").trim() !== (me.department || "").trim())
          return err("Forbidden — ticket belongs to different department", 403, req);
      }

      await db(`/ticket_comments?ticket_id=eq.${ticket_id}`, { method: "DELETE" });
      await db(`/tickets?id=eq.${ticket_id}`, { method: "DELETE" });
      return json({ success: true }, 200, req);
    }

    // ─────────────────────────────────────────────────────
    // mark_notif_read  (المستخدم يقرأ إشعاراته فقط)
    // ─────────────────────────────────────────────────────
    if (action === "mark_notif_read") {
      const au = await verifyToken(token);
      if (!au) return err("Unauthorized", 401, req);
      if (body.notif_id) {
        await db(
          `/notifications?id=eq.${body.notif_id}&user_id=eq.${au.id}`,
          { method: "PATCH", body: JSON.stringify({ is_read: true }) }
        );
      } else {
        await db(
          `/notifications?user_id=eq.${au.id}&is_read=eq.false`,
          { method: "PATCH", body: JSON.stringify({ is_read: true }) }
        );
      }
      return json({ success: true }, 200, req);
    }

    return err(`Unknown action: ${action}`, 400, req);

  } catch (e) {
    console.error(`[auth.mjs] action=${action} error:`, e.message);
    // لا نكشف تفاصيل الخطأ للمستخدم
    return json({ error: "Internal server error" }, 500, req);
  }
}

export const config = { path: "/api/auth" };
