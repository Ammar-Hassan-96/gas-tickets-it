// ═══════════════════════════════════════════════════════════
// GAS IT Desk — Netlify Function v4.0 COMPLETE
// Path: netlify/functions/auth.mjs
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = "https://rmlkhgktwologfhphtyz.supabase.co";
const SUPABASE_ANON = "sb_publishable_bSRIIPeiuwARjUlSnUJpQg_AIrFZH8B";
const SVC_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const err  = (m, s = 400) => json({ error: m }, s);

// DB via service_role (bypasses RLS)
async function db(path, opts = {}) {
  const key = SVC_KEY();
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation", ...(opts.headers ?? {}) },
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`DB ${res.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}

// Auth Admin
async function authAdmin(path, opts = {}) {
  const key = SVC_KEY();
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin${path}`, {
    ...opts,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`AuthAdmin ${res.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}

// Verify Supabase JWT token → returns auth user or null
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

// SHA-256 helper
async function sha256(msg) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ═══════════════════════════════════════════════════════════
export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  let body;
  try { body = await req.json(); } catch { return err("Invalid JSON"); }
  const { action, token } = body;

  try {
    // ─────────────────────────────────────────────────────
    // resolve_username: يحوّل username → email (للـ login)
    // ─────────────────────────────────────────────────────
    if (action === "resolve_username") {
      const { username } = body;
      if (!username) return err("Missing username");
      const rows = await db(`/users?username=eq.${encodeURIComponent(username)}&select=email&is_active=eq.true`);
      if (!rows?.length) return err("Not found", 404);
      return json({ email: rows[0].email });
    }

    // ─────────────────────────────────────────────────────
    // get_sessions
    // ─────────────────────────────────────────────────────
    if (action === "get_sessions") {
      const au = await verifyToken(token);
      if (!au) return err("Unauthorized", 401);
      const rows = await db(`/sessions?user_id=eq.${au.id}&select=id,created_at,last_seen,expires_at`);
      return json({ sessions: rows || [] });
    }

    // ─────────────────────────────────────────────────────
    // save_theme
    // ─────────────────────────────────────────────────────
    if (action === "save_theme") {
      const au = await verifyToken(token);
      const uid = au?.id || body.user_id;
      if (!uid) return err("Unauthorized", 401);
      await db(`/users?id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ theme_pref: body.theme }) });
      return json({ success: true });
    }

    // ─────────────────────────────────────────────────────
    // create_auth_user
    // ─────────────────────────────────────────────────────
    if (action === "create_auth_user") {
      const au = await verifyToken(token);
      if (!au) return err("Unauthorized", 401);
      const me = await db(`/users?id=eq.${au.id}&select=role,department`);
      if (!me?.length || !["super_admin","manager"].includes(me[0].role)) return err("Forbidden", 403);

      const { email, password, username, name, role, department } = body;
      if (!email || !password || !username) return err("Missing fields");

      const newAuth = await authAdmin("/users", {
        method: "POST",
        body: JSON.stringify({
          email, password, email_confirm: true,
          user_metadata: { username, name: name || username, role: role || "employee", department: department || "" },
        }),
      });
      return json({ success: true, user_id: newAuth.id });
    }

    // ─────────────────────────────────────────────────────
    // create_user_profile
    // ─────────────────────────────────────────────────────
    if (action === "create_user_profile") {
      const au = await verifyToken(token);
      if (!au) return err("Unauthorized", 401);
      const { user_id, username, name, email, role, department } = body;
      if (!user_id || !username) return err("Missing fields");
      await db("/users", {
        method: "POST",
        body: JSON.stringify({ id: user_id, username, name: name || username, email, role: role || "employee", department: department || "", is_active: true }),
      });
      return json({ success: true });
    }

    // ─────────────────────────────────────────────────────
    // update_auth_user
    // ─────────────────────────────────────────────────────
    if (action === "update_auth_user") {
      const au = await verifyToken(token);
      if (!au) return err("Unauthorized", 401);
      const { user_id, email, role, department, name, username, is_active } = body;
      if (!user_id) return err("Missing user_id");

      // تحديث auth.users
      const authUpdate = {};
      if (email) authUpdate.email = email;
      const existMeta = (await authAdmin(`/users/${user_id}`))?.user_metadata || {};
      const newMeta = { ...existMeta };
      if (name)       newMeta.name = name;
      if (username)   newMeta.username = username;
      if (role)       newMeta.role = role;
      if (department !== undefined) newMeta.department = department;
      authUpdate.user_metadata = newMeta;
      await authAdmin(`/users/${user_id}`, { method: "PUT", body: JSON.stringify(authUpdate) });

      // تحديث public.users
      const pub = { updated_at: new Date().toISOString() };
      if (email)     pub.email = email;
      if (name)      pub.name = name;
      if (username)  pub.username = username;
      if (role)      pub.role = role;
      if (department !== undefined) pub.department = department;
      if (is_active !== undefined)  pub.is_active  = is_active;
      await db(`/users?id=eq.${user_id}`, { method: "PATCH", body: JSON.stringify(pub) });

      return json({ success: true });
    }

    // ─────────────────────────────────────────────────────
    // delete_user
    // ─────────────────────────────────────────────────────
    if (action === "delete_user") {
      const au = await verifyToken(token);
      if (!au) return err("Unauthorized", 401);
      const { user_id } = body;
      if (!user_id) return err("Missing user_id");
      try { await authAdmin(`/users/${user_id}`, { method: "DELETE" }); } catch {}
      await db(`/users?id=eq.${user_id}`, { method: "DELETE" });
      return json({ success: true });
    }

    // ─────────────────────────────────────────────────────
    // reset_user_password
    // ─────────────────────────────────────────────────────
    if (action === "reset_user_password") {
      const au = await verifyToken(token);
      if (!au) return err("Unauthorized", 401);
      const { user_id, new_password } = body;
      if (!user_id || !new_password) return err("Missing fields");
      await authAdmin(`/users/${user_id}`, { method: "PUT", body: JSON.stringify({ password: new_password }) });
      return json({ success: true });
    }

    // ─────────────────────────────────────────────────────
    // change_password
    // ─────────────────────────────────────────────────────
    if (action === "change_password") {
      const au = await verifyToken(token);
      if (!au) return err("Unauthorized", 401);
      const { new_password } = body;
      if (!new_password) return err("Missing new_password");
      await authAdmin(`/users/${au.id}`, { method: "PUT", body: JSON.stringify({ password: new_password }) });
      return json({ success: true });
    }

    // ─────────────────────────────────────────────────────
    // delete_ticket
    // ─────────────────────────────────────────────────────
    if (action === "delete_ticket") {
      const au = await verifyToken(token);
      if (!au) return err("Unauthorized", 401);
      const { ticket_id } = body;
      if (!ticket_id) return err("Missing ticket_id");
      await db(`/ticket_comments?ticket_id=eq.${ticket_id}`, { method: "DELETE" });
      await db(`/tickets?id=eq.${ticket_id}`, { method: "DELETE" });
      return json({ success: true });
    }

    // ─────────────────────────────────────────────────────
    // mark_notif_read
    // ─────────────────────────────────────────────────────
    if (action === "mark_notif_read") {
      const au = await verifyToken(token);
      if (!au) return err("Unauthorized", 401);
      if (body.notif_id) {
        await db(`/notifications?id=eq.${body.notif_id}&user_id=eq.${au.id}`, { method: "PATCH", body: JSON.stringify({ is_read: true }) });
      } else {
        await db(`/notifications?user_id=eq.${au.id}&is_read=eq.false`, { method: "PATCH", body: JSON.stringify({ is_read: true }) });
      }
      return json({ success: true });
    }

    return err(`Unknown action: ${action}`);

  } catch (e) {
    console.error(`[auth.mjs] action=${action} error:`, e.message);
    return json({ error: e.message || "Internal server error" }, 500);
  }
}

export const config = { path: "/api/auth" };
