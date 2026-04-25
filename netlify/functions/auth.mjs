import crypto from "node:crypto";

const SUPABASE_URL = Netlify.env.get("SUPABASE_URL");
const SUPABASE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SB ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// Validate Supabase JWT token and return the user from public.users
// v3.0: استخدام Supabase Auth بدل custom sessions table
async function validateToken(token) {
  if (!token) throw new Error("No token");

  // التحقق من الـ JWT عبر Supabase Auth API
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!authRes.ok) throw new Error("Invalid or expired token");
  const authUser = await authRes.json();
  if (!authUser?.id) throw new Error("Invalid token payload");

  // جلب بيانات المستخدم من public.users بالـ UUID
  const users = await sb(
    `/users?id=eq.${authUser.id}&is_active=eq.true&select=id,name,username,role,department`
  );
  if (!users?.length) throw new Error("User not found or inactive");
  return users[0];
}

// ── Role helpers ──────────────────────────────────────────
const isSuper   = (u) => u?.role === 'super_admin';
const isManager = (u) => u?.role === 'manager';

function canManageInDept(requester, targetDept) {
  if (isSuper(requester)) return true;
  if (isManager(requester) && (requester.department || '').trim() === (targetDept || '').trim()) return true;
  return false;
}

// Write to audit log
async function audit(userId, userName, userRole, action, targetType, targetId, targetName) {
  try {
    await sb("/audit_logs", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, user_name: userName, user_role: userRole, action, target_type: targetType, target_id: String(targetId), target_name: targetName }),
    });
  } catch { /* non-critical */ }
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
    });
  }
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  if (!SUPABASE_URL || !SUPABASE_KEY) return Response.json({ error: "Server not configured" }, { status: 503 });

  let body;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { action } = body;

  // ── LOGIN ────────────────────────────────────────────
  if (action === "login") {
    const { username, password } = body;
    if (!username || !password) return Response.json({ error: "يرجى إدخال اسم المستخدم وكلمة المرور" }, { status: 400 });
    // Sanitize: username must be alphanumeric + dots + underscores only
    if (!/^[a-zA-Z0-9._]{3,50}$/.test(username)) {
      return Response.json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, { status: 401 });
    }
    const hash = sha256(password);
    let users;
    try {
      users = await sb(`/users?username=eq.${encodeURIComponent(username)}&password_hash=eq.${hash}&is_active=eq.true&select=id,name,username,email,role,department,phone,theme_pref`);
    } catch (e) { return Response.json({ error: "خطأ في الاتصال بقاعدة البيانات" }, { status: 500 }); }
    if (!users?.length) return Response.json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, { status: 401 });
    const user = users[0];
    const token = generateToken();
    const expires = new Date(Date.now() + 10 * 3600 * 1000).toISOString();
    try {
      // Delete old sessions for this user (keep only latest login)
      await sb(`/sessions?user_id=eq.${user.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      // Create new session
      await sb("/sessions", { method: "POST", body: JSON.stringify({ user_id: user.id, token: sha256(token), expires_at: expires }) });
    } catch { /* optional */ }
    return Response.json({ user, token });
  }

  // ── VALIDATE SESSION ─────────────────────────────────
  if (action === "validate") {
    try {
      const user = await validateToken(body.token);
      const full = await sb(`/users?id=eq.${user.id}&is_active=eq.true&select=id,name,username,email,role,department,phone,theme_pref`);
      return Response.json({ user: full[0] });
    } catch (e) { return Response.json({ error: e.message }, { status: 401 }); }
  }

  // ── DELETE USER (secure - server validates role) ──────
  if (action === "delete_user") {
    const { token, user_id } = body;
    let requester;
    try { requester = await validateToken(token); }
    catch (e) { return Response.json({ error: "غير مصرح" }, { status: 401 }); }
    if (requester.id === user_id) return Response.json({ error: "لا يمكنك حذف حسابك الخاص" }, { status: 400 });
    // Get target user info
    let target;
    try { target = await sb(`/users?id=eq.${user_id}&select=id,name,username,role,department`); }
    catch { return Response.json({ error: "المستخدم غير موجود" }, { status: 404 }); }
    if (!target?.length) return Response.json({ error: "المستخدم غير موجود" }, { status: 404 });
    const t = target[0];
    if (t.username === "ammar.admin") return Response.json({ error: "هذا الحساب محمي" }, { status: 403 });
    // Permission: super_admin OR manager of the same department (and target is not manager/super_admin)
    const allowed = isSuper(requester) ||
      (isManager(requester) &&
       (requester.department||'').trim() === (t.department||'').trim() &&
       t.role !== 'manager' && t.role !== 'super_admin');
    if (!allowed) return Response.json({ error: "ليس لديك صلاحية حذف هذا المستخدم" }, { status: 403 });
    try {
      await sb(`/users?id=eq.${user_id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await audit(requester.id, requester.name, requester.role, "delete_user", "user", user_id, t.name);
      return Response.json({ ok: true });
    } catch (e) { return Response.json({ error: "فشل الحذف: " + e.message }, { status: 500 }); }
  }

  // ── DELETE TICKET (secure - server validates role) ────
  if (action === "delete_ticket") {
    const { token, ticket_id } = body;
    let requester;
    try { requester = await validateToken(token); }
    catch (e) { return Response.json({ error: "غير مصرح" }, { status: 401 }); }
    let ticket;
    try { ticket = await sb(`/tickets?id=eq.${ticket_id}&select=id,title,ticket_number,target_department`); }
    catch { return Response.json({ error: "التيكت غير موجود" }, { status: 404 }); }
    if (!ticket?.length) return Response.json({ error: "التيكت غير موجود" }, { status: 404 });
    const tk = ticket[0];
    // Permission: super_admin OR manager of target department (or legacy tickets: super only)
    const allowed = isSuper(requester) ||
      (tk.target_department && isManager(requester) &&
       (requester.department||'').trim() === (tk.target_department||'').trim());
    if (!allowed) return Response.json({ error: "ليس لديك صلاحية حذف هذا الطلب" }, { status: 403 });
    try {
      await sb(`/ticket_comments?ticket_id=eq.${ticket_id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await sb(`/tickets?id=eq.${ticket_id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await audit(requester.id, requester.name, requester.role, "delete_ticket", "ticket", ticket_id, `${tk.ticket_number} - ${tk.title}`);
      return Response.json({ ok: true });
    } catch (e) { return Response.json({ error: "فشل الحذف: " + e.message }, { status: 500 }); }
  }

  // ── MARK NOTIFICATIONS READ ───────────────────────────
  if (action === "mark_notif_read") {
    const { user_id, notif_id } = body;
    try {
      if (notif_id) await sb(`/notifications?id=eq.${notif_id}`, { method: "PATCH", body: JSON.stringify({ is_read: true }) });
      else if (user_id) await sb(`/notifications?user_id=eq.${user_id}`, { method: "PATCH", body: JSON.stringify({ is_read: true }) });
    } catch { /* non-critical */ }
    return Response.json({ ok: true });
  }

  // ── SAVE THEME ────────────────────────────────────────
  if (action === "save_theme") {
    const { user_id, theme } = body;
    try { await sb(`/users?id=eq.${user_id}`, { method: "PATCH", body: JSON.stringify({ theme_pref: theme }) }); }
    catch { /* non-critical */ }
    return Response.json({ ok: true });
  }


  // ── RESET AUDIT LOG (super_admin only) ──────────────
  if (action === "reset_audit_log") {
    const { token } = body;
    let requester;
    try { requester = await validateToken(token); }
    catch (e) { return Response.json({ error: "غير مصرح" }, { status: 401 }); }
    if (!isSuper(requester)) {
      return Response.json({ error: "هذه العملية لمدير النظام فقط" }, { status: 403 });
    }
    try {
      // Log the reset action BEFORE deleting (so it survives reset)
      await audit(requester.id, requester.name, requester.role, "reset_audit_log", "system", "all", "مسح سجل العمليات الكامل");
      await sb("/audit_logs?id=neq.00000000-0000-0000-0000-000000000000", {
        method: "DELETE",
        headers: { Prefer: "return=minimal" }
      });
      return Response.json({ ok: true });
    } catch (e) {
      return Response.json({ error: "فشل المسح: " + e.message }, { status: 500 });
    }
  }

  // ── CHANGE PASSWORD ───────────────────────────────────
  if (action === "change_password") {
    const { token, old_password, new_password } = body;
    if (!token || !old_password || !new_password) {
      return Response.json({ error: "بيانات ناقصة" }, { status: 400 });
    }
    if (new_password.length < 6) {
      return Response.json({ error: "كلمة المرور لازم تكون 6 أحرف على الأقل" }, { status: 400 });
    }
    let requester;
    try { requester = await validateToken(token); }
    catch (e) { return Response.json({ error: "غير مصرح" }, { status: 401 }); }
    // Verify old password
    const oldHash = sha256(old_password);
    const check = await sb(
      `/users?id=eq.${requester.id}&password_hash=eq.${oldHash}&select=id`
    ).catch(() => null);
    if (!check?.length) {
      return Response.json({ error: "كلمة المرور الحالية غير صحيحة" }, { status: 401 });
    }
    const newHash = sha256(new_password);
    try {
      await sb(`/users?id=eq.${requester.id}`, {
        method: "PATCH",
        body: JSON.stringify({ password_hash: newHash }),
        headers: { Prefer: "return=minimal" }
      });
      return Response.json({ ok: true });
    } catch (e) {
      return Response.json({ error: "فشل التغيير: " + e.message }, { status: 500 });
    }
  }

  // ── HEARTBEAT PING ────────────────────────────────────
  if (action === "ping") {
    const { token } = body;
    if (!token) return Response.json({ ok: true });
    try {
      const tokenHash = sha256(token);
      await sb(`/sessions?token=eq.${tokenHash}`, {
        method: "PATCH",
        body: JSON.stringify({ last_seen: new Date().toISOString() }),
        headers: { Prefer: "return=minimal" }
      });
    } catch { /* non-critical */ }
    return Response.json({ ok: true });
  }

  // ── LOGOUT ────────────────────────────────────────────
  if (action === "logout") {
    const { token } = body;
    if (!token) return Response.json({ ok: true });
    try {
      const tokenHash = sha256(token);
      await sb(`/sessions?token=eq.${tokenHash}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    } catch { /* non-critical */ }
    return Response.json({ ok: true });
  }

  // ── GET ACTIVE SESSIONS (super_admin + managers) ─────
  if (action === "get_sessions") {
    const { token } = body;
    let requester;
    try { requester = await validateToken(token); }
    catch (e) { return Response.json({ error: "غير مصرح" }, { status: 401 }); }
    if (!isSuper(requester) && !isManager(requester)) {
      return Response.json({ error: "ليس لديك صلاحية" }, { status: 403 });
    }
    try {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const sessions = await sb(
        `/sessions?expires_at=gt.${new Date().toISOString()}&last_seen=gt.${fiveMinAgo}&select=user_id,created_at,last_seen`
      );
      // Deduplicate by user_id (one session per user)
      const seen = new Set();
      const unique = (sessions || []).filter(s => {
        if (seen.has(s.user_id)) return false;
        seen.add(s.user_id); return true;
      });
      // Fetch user info for active sessions (including department for filtering)
      const userIds = unique.map(s => s.user_id);
      let users = [];
      if (userIds.length > 0) {
        users = await sb(`/users?id=in.(${userIds.join(',')})&select=id,name,role,username,department`) || [];
      }
      // العزل حسب الإدارة: super_admin يشوف الكل، المدير يشوف إدارته فقط
      const isSuperReq = isSuper(requester);
      const myDept     = (requester.department || '').trim();

      const activeUsers = unique
        .map(s => {
          const u = users.find(u => u.id === s.user_id);
          return {
            name: u?.name || '—',
            role: u?.role || '—',
            username: u?.username || '',
            department: (u?.department || '').trim(),
            since: s.created_at
          };
        })
        .filter(u => u.username !== 'ammar.admin')
        // لو مدير: يشوف بس موظفي إدارته (بما فيهم نفسه)
        .filter(u => isSuperReq ? true : u.department === myDept);

      return Response.json({ total: activeUsers.length, users: activeUsers });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  // ── RESET USER PASSWORD (super_admin + manager of same dept) ──
  if (action === "reset_user_password") {
    const { token, user_id, new_password } = body;
    if (!token || !user_id || !new_password) {
      return Response.json({ error: "بيانات ناقصة" }, { status: 400 });
    }
    if (new_password.length < 6) {
      return Response.json({ error: "كلمة المرور لازم تكون 6 أحرف على الأقل" }, { status: 400 });
    }
    let requester;
    try { requester = await validateToken(token); }
    catch (e) { return Response.json({ error: "غير مصرح" }, { status: 401 }); }
    // Get target user info
    let target;
    try { target = await sb(`/users?id=eq.${user_id}&select=id,name,username,role,department`); }
    catch { return Response.json({ error: "المستخدم غير موجود" }, { status: 404 }); }
    if (!target?.length) return Response.json({ error: "المستخدم غير موجود" }, { status: 404 });
    const tgt = target[0];
    // Permission check
    const allowed = isSuper(requester) ||
      (isManager(requester) && (requester.department||'').trim() === (tgt.department||'').trim() && tgt.role !== 'manager' && tgt.role !== 'super_admin');
    if (!allowed) {
      return Response.json({ error: "ليس لديك صلاحية تعيين كلمة مرور لهذا المستخدم" }, { status: 403 });
    }
    // Hash new password and update
    const newHash = sha256(new_password);
    try {
      await sb(`/users?id=eq.${user_id}`, {
        method: "PATCH",
        body: JSON.stringify({ password_hash: newHash }),
        headers: { Prefer: "return=minimal" }
      });
      // Log the action
      await audit(requester.id, requester.name, requester.role,
        "reset_password", "user", user_id,
        `${target[0].name} (${target[0].username})`);
      return Response.json({ ok: true });
    } catch (e) {
      return Response.json({ error: "فشل التعيين: " + e.message }, { status: 500 });
    }
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
};

export const config = { path: "/api/auth" };
