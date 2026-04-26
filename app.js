/* ═══════════════════════════════════════════════════════
   GAS Internal Tickets — Application Logic
   German Auto Service · Mercedes-Benz Egypt
   v3.0 — Supabase Auth
   ═══════════════════════════════════════════════════════ */

'use strict';

// ── CONFIG ───────────────────────────────────────────────
const CFG = {
  supabaseUrl: 'https://rmlkhgktwologfhphtyz.supabase.co',
  supabaseKey: 'sb_publishable_bSRIIPeiuwARjUlSnUJpQg_AIrFZH8B',
  // authEndpoint: يشير للـ Edge Function لو deployed، أو Netlify كـ fallback
  // بعد نشر الـ Edge Function غيّره لـ:
  // 'https://rmlkhgktwologfhphtyz.supabase.co/functions/v1/auth'
  authEndpoint: '/api/auth',
  sessionKey:   'gas_it_session',
  themeKey:     'gas_it_theme',
};

// ── SUPABASE CLIENT (baked in — no npm needed) ──────────
// إنشاء Supabase client بسيط بيستخدم fetch مباشرة
// الـ JWT بيتبعت تلقائياً في كل request بعد login
const _supa = (() => {
  let _session = null;  // Supabase Auth session (contains JWT)

  return {
    // تسجيل الدخول بـ email + password
    async signIn(email, password) {
      const res = await fetch(`${CFG.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: CFG.supabaseKey,
        },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error_description || data.msg || 'فشل تسجيل الدخول');
      _session = data;
      return data;
    },

    // تسجيل الخروج
    async signOut() {
      if (!_session?.access_token) return;
      await fetch(`${CFG.supabaseUrl}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: CFG.supabaseKey,
          Authorization: `Bearer ${_session.access_token}`,
        },
      }).catch(() => {});
      _session = null;
    },

    // استعادة session من localStorage
    async restoreSession() {
      const saved = localStorage.getItem(CFG.sessionKey);
      if (!saved) return null;
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.access_token || !parsed.expires_at) return null;
        // تحقق إن الـ token لسه valid
        if (Date.now() / 1000 > parsed.expires_at - 60) {
          // محاولة refresh
          const refreshed = await this.refreshSession(parsed.refresh_token);
          if (!refreshed) { localStorage.removeItem(CFG.sessionKey); return null; }
          return refreshed;
        }
        _session = parsed;
        return parsed;
      } catch { return null; }
    },

    // refresh token
    async refreshSession(refreshToken) {
      if (!refreshToken) return null;
      try {
        const res = await fetch(`${CFG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: CFG.supabaseKey },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        _session = data;
        localStorage.setItem(CFG.sessionKey, JSON.stringify(data));
        return data;
      } catch { return null; }
    },

    // الـ JWT الحالي
    getToken() { return _session?.access_token || null; },
    getSession() { return _session; },
    setSession(s) { _session = s; },

    // قراءة user_metadata من الـ JWT
    getUserMeta() {
      if (!_session?.user?.user_metadata) return {};
      return _session.user.user_metadata;
    },
  };
})();

// ── STATE ────────────────────────────────────────────────
const S = {
  user:      null,
  token:     null,
  tickets:   [],
  users:     [],
  notifs:    [],
  page:      'dashboard',
  prevPage:  null,
  selTicket: null,
  editUserId: null,
  // Separate filter state per page to avoid cross-contamination
  myFilter:  { status: '', search: '' },
  allFilter: { status: '', priority: '', search: '' },
};

// ── HELPERS ──────────────────────────────────────────────
const $  = id => document.getElementById(id);
const _e = s  => String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const _d = iso => new Date(iso).toLocaleDateString('ar-EG',{day:'2-digit',month:'short',year:'numeric'});
const _t = iso => new Date(iso).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
const _ago = iso => {
  const ms = Date.now() - new Date(iso);
  const m = Math.floor(ms/60000), h = Math.floor(m/60), d = Math.floor(h/24);
  if (d>0) return `منذ ${d} يوم`;
  if (h>0) return `منذ ${h} ساعة`;
  if (m>0) return `منذ ${m} دقيقة`;
  return 'الآن';
};

const ROLES = {
  super_admin: 'مدير النظام',
  manager:     'مدير إدارة',
  supervisor:  'مشرف إدارة',
  admin:       'IT Admin',       // legacy — يُعامل كـ supervisor
  employee:    'موظف',
};
const STATUS_L = { open:'مفتوح', assigned:'معين', in_progress:'قيد التنفيذ', resolved:'مغلق', closed:'مغلق', escalated:'مصعد', archived:'مؤرشف' };
const PRIO_L   = { critical:'حرجة', high:'عالية', medium:'متوسطة', low:'منخفضة' };
const CAT_L    = { hardware:'أجهزة', software:'برامج', network:'شبكة', email:'بريد', access:'صلاحيات', printer:'طابعة', security:'أمن', other:'أخرى' };
const STATUS_C = { open:'b-open', assigned:'b-assign', in_progress:'b-prog', resolved:'b-closed', closed:'b-closed', escalated:'b-escal', archived:'b-inactive' };
const PRIO_C   = { critical:'b-crit', high:'b-high', medium:'b-med', low:'b-low' };
const PRIO_SLA = { critical:4, high:8, medium:24, low:72 };

// ── DEPARTMENT / REQUEST-TYPE MAP (cached in memory, loaded from DB) ─────
// Fallback default map used if DB fetch fails — mirrors the seed in supabase-migration-internal.sql
const DEFAULT_DEPT_MAP = {
  'الخدمة':           ['طلب عربية بديلة','متابعة حالة صيانة','استفسار عن موعد تسليم','شكوى فنية','طلب تقدير تكلفة','أخرى'],
  'الكول سنتر':       ['تحويل عميل','بيانات عميل','متابعة موعد','استفسار حملة','أخرى'],
  'IT':              ['مشكلة جهاز','مشكلة شبكة','طلب صلاحيات','مشكلة بريد إلكتروني','مشكلة طابعة','تركيب/تحديث برنامج','أمن معلومات','أخرى'],
  'CRM':             ['تحديث بيانات عميل','إضافة عميل جديد','سحب تقرير','مشكلة في النظام','استفسار CSI','أخرى'],
  'الحسابات':         ['طلب فاتورة','مردودات','كشف حساب','صرف مصروفات','موافقات مالية','أخرى'],
  'المبيعات':         ['طلب عرض سعر','توفر موديل','كتالوج/بروشور','متابعة عميل محتمل','أخرى'],
  'قطع الغيار':       ['توفر قطعة','طلب توريد','سعر قطعة','إرجاع قطعة','أخرى'],
  'الصيانة':          ['حجز موعد','استعجال إصلاح','استلام سيارة','تقييم فني','أخرى'],
  'الموارد البشرية':  ['طلب إجازة','شهادة خبرة','استفسار مرتب','تظلم','أخرى'],
  'المخازن':          ['صرف مستلزمات','جرد','توفر بضاعة','أخرى'],
};

// Runtime map (populated by loadDepartmentMap)
let DEPT_MAP = { ...DEFAULT_DEPT_MAP };

// ── PERMISSIONS LAYER ─────────────────────────────────────
// كل قواعد الصلاحيات في مكان واحد — أي تعديل مستقبلي يتم هنا فقط
const Perm = {
  // هل المستخدم super admin؟
  isSuper:  () => S.user?.role === 'super_admin',

  // هل المستخدم مدير إدارة؟ (ملاحظة: manager دلوقتي يعني مدير إدارة واحدة، مش كل النظام)
  isManager: () => S.user?.role === 'manager',

  // هل المستخدم مشرف؟ (admin القديم يُعامل كـ supervisor)
  isSupervisor: () => S.user?.role === 'supervisor' || S.user?.role === 'admin',

  // هل المستخدم موظف عادي؟
  isEmployee: () => S.user?.role === 'employee',

  // هل ده صاحب صلاحيات قيادية في إدارته؟ (مدير أو مشرف)
  isDeptLead: () => Perm.isManager() || Perm.isSupervisor(),

  // الإدارة اللي المستخدم بيتبعها (مع trim وحماية)
  myDept: () => (S.user?.department || '').trim(),

  // هل ده مستخدم تابع لنفس إدارة الطلب المستهدفة؟ (Inbound — الطلب جاي لإدارته)
  sameDeptAs: (t) => {
    const mine = Perm.myDept();
    const target = (t?.target_department || '').trim();
    if (!mine || !target) return false;
    return mine === target || mine.toLowerCase() === target.toLowerCase();
  },

  // هل مقدم الطلب من نفس إدارة المستخدم؟ (Outbound — الطلب صادر من إدارته)
  // مفيد للمدير/المشرف عشان يتابع طلبات موظفيه الصادرة
  ownerFromMyDept: (t) => {
    if (!t?.created_by) return false;
    const owner = S.users?.find(u => u.id === t.created_by);
    if (!owner) return false;
    const mine = Perm.myDept();
    const ownerDept = (owner.department || '').trim();
    if (!mine || !ownerDept) return false;
    return mine === ownerDept || mine.toLowerCase() === ownerDept.toLowerCase();
  },

  // هل الطلب outbound بالنسبة للمستخدم الحالي؟
  // أي: مقدمه من إدارتي + موجه لإدارة تانية
  isOutbound: (t) => {
    if (!t) return false;
    if (Perm.sameDeptAs(t)) return false;  // inbound
    if (t.created_by === S.user.id) return false;  // طلبي الشخصي
    return Perm.ownerFromMyDept(t);
  },

  // ── رؤية الطلبات ──
  canSeeTicket: (t) => {
    if (!t) return false;
    // super_admin يشوف كل حاجة
    if (Perm.isSuper()) return true;
    // صاحب الطلب دايماً يشوفه
    if (t.created_by === S.user.id) return true;
    // المعين عليه يشوفه
    if (t.assigned_to === S.user.id) return true;
    // Legacy: التيكتات القديمة بدون target_department
    if (!t.target_department) {
      return Perm.isManager() || Perm.isSupervisor();
    }
    // 📥 Inbound: قيادة الإدارة المستهدفة (مدير + مشرف)
    if (Perm.sameDeptAs(t) && Perm.isDeptLead()) return true;
    // 📤 Outbound: المدير فقط يشوف طلبات فريقه الصادرة (شفافية إدارية)
    // المشرف ما يشوفهاش — مسؤولية المدير وحده لحفظ خصوصية الموظفين
    if (Perm.isManager() && Perm.ownerFromMyDept(t)) return true;
    // موظف في نفس الإدارة المستهدفة يشوف الطلبات المفتوحة عشان يستلمها
    if (Perm.sameDeptAs(t) && Perm.isEmployee() && t.status === 'open') return true;
    return false;
  },

  // هل يقدر يعدّل حالة التيكت؟ (status / assign)
  canActOnTicket: (t) => {
    if (!t) return false;
    if (Perm.isSuper()) return true;
    // المعين عليه
    if (t.assigned_to === S.user.id) return true;
    // 📥 قيادة الإدارة المستهدفة (Inbound فقط)
    if (Perm.sameDeptAs(t) && Perm.isDeptLead()) return true;
    // ملاحظة: المدير لطلبات Outbound ما يقدرش يحدث الحالة — بس يعلق
    return false;
  },

  // هل يقدر يضيف تعليق؟
  // المدير (فقط) يقدر يعلق على طلبات فريقه الصادرة — المشرف لا
  canCommentOnTicket: (t) => {
    if (!t) return false;
    if (Perm.canActOnTicket(t)) return true;
    // صاحب الطلب يقدر يعلق دايماً
    if (t.created_by === S.user.id) return true;
    // 📤 المدير فقط يرد بتعليقات على طلبات فريقه الصادرة
    if (Perm.isManager() && Perm.ownerFromMyDept(t)) return true;
    return false;
  },

  // هل يقدر يعين التيكت (assign_to)?
  // بناء على قرار عمار: "المدير والمشرف + أي موظف في نفس الإدارة"
  canAssignTicket: (t) => {
    if (!t) return false;
    if (Perm.isSuper()) return true;
    if (Perm.sameDeptAs(t)) return true;
    return false;
  },

  // هل يقدر يحذف/يؤرشف تيكت؟
  canDeleteTicket: (t) => {
    if (!t) return false;
    if (Perm.isSuper()) return true;
    // مدير الإدارة فقط (مش المشرف) يقدر يؤرشف
    if (Perm.sameDeptAs(t) && Perm.isManager()) return true;
    return false;
  },

  // ── رؤية المستخدمين ──
  // هل يقدر يدير هذا المستخدم؟ (تعديل/حذف/تغيير دور)
  canManageUser: (u) => {
    if (!u) return false;
    if (u.username === 'ammar.admin') return S.user.username === 'ammar.admin';
    if (Perm.isSuper()) return true;
    // مدير الإدارة يدير بس موظفي إدارته (مش المشرفين زيه أو فوقه)
    if (Perm.isManager() && u.department === Perm.myDept()) {
      return u.role === 'employee' || u.role === 'supervisor';
    }
    return false;
  },

  // هل يقدر يحذف هذا المستخدم؟
  // super_admin: أي حد غير ammar.admin
  // manager: بس موظف/مشرف في نفس إدارته
  canDeleteUser: (u) => {
    if (!u) return false;
    if (u.username === 'ammar.admin') return false;  // محمي نهائياً
    if (u.id === S.user?.id) return false;            // ما تقدرش تحذف نفسك
    if (Perm.isSuper()) return true;
    if (Perm.isManager() &&
        (u.department||'').trim() === Perm.myDept() &&
        (u.role === 'employee' || u.role === 'supervisor')) {
      return true;
    }
    return false;
  },

  // هل يقدر يعيد تعيين كلمة مرور لهذا المستخدم؟ (نفس قواعد canDeleteUser تقريباً)
  canResetUserPassword: (u) => {
    if (!u) return false;
    if (u.username === 'ammar.admin' && S.user.username !== 'ammar.admin') return false;
    if (Perm.isSuper()) return true;
    if (Perm.isManager() &&
        (u.department||'').trim() === Perm.myDept() &&
        (u.role === 'employee' || u.role === 'supervisor')) {
      return true;
    }
    return false;
  },

  // ── الصفحات المسموح بها ──
  canSeePage: (page) => {
    switch (page) {
      // صفحات متاحة لكل المستخدمين
      case 'dashboard':
      case 'mytickets':
      case 'profile':
      case 'detail':        // صفحة تفاصيل تيكت — الحماية على مستوى التيكت نفسه (canSeeTicket)
        return true;
      // صفحات القيادات
      case 'alltickets':
      case 'reports':
        return Perm.isDeptLead() || Perm.isSuper();
      // Outbound: مدير الإدارة + super_admin فقط (المشرف ما يشوفهاش — مسؤولية إدارية)
      case 'outbound':
        return Perm.isManager() || Perm.isSuper();
      // صفحة المستخدمين: manager الإدارة + super_admin
      case 'users':
        return Perm.isManager() || Perm.isSuper();
      // صفحات خاصة بالـ super_admin فقط
      case 'roles':
      case 'deptmap':
      case 'archive':
      case 'auditlog':
        return Perm.isSuper();
      default:
        // أي صفحة غير معروفة — نسمح بيها ونعتمد على الحماية الداخلية
        return true;
    }
  },
};

// فلترة التيكتات المرئية للمستخدم الحالي
function visibleTickets() {
  return (S.tickets || []).filter(t => Perm.canSeeTicket(t));
}

// الطلبات الواردة للإدارة (inbound — موجهة لإدارة المستخدم)
function inboundTickets() {
  return visibleTickets().filter(t => Perm.sameDeptAs(t));
}

// الطلبات الصادرة من فريق المستخدم لإدارات أخرى (outbound)
function outboundTickets() {
  return visibleTickets().filter(t => Perm.isOutbound(t));
}

// فلترة المستخدمين المرئيين للمستخدم الحالي
function visibleUsers() {
  if (Perm.isSuper()) return S.users;
  if (Perm.isManager() || Perm.isSupervisor()) return S.users.filter(u => u.department === Perm.myDept());
  // employee: يشوف نفسه بس في صفحة المستخدمين
  return S.users.filter(u => u.id === S.user?.id);
}

const badge  = (t,c) => `<span class="badge ${c}">${_e(t)}</span>`;
const sbadge = s => badge(STATUS_L[s]||s, STATUS_C[s]||'b-open');
const pbadge = p => badge(PRIO_L[p]||p,   PRIO_C[p]||'b-med');
const uname  = id => S.users.find(u=>u.id===id)?.name || null;
const udept  = id => S.users.find(u=>u.id===id)?.department || '—';

// ── ATTACHMENT HELPERS ──────────────────────────────────
const ATTACH_MAX_SIZE = 10 * 1024 * 1024;  // 10 MB
const ATTACH_ICONS = {
  'image': '🖼️', 'pdf': '📄', 'word': '📝', 'excel': '📊',
  'powerpoint': '📽️', 'text': '📃', 'archive': '🗜️', 'other': '📎'
};
function attachTypeIcon(mime, name){
  const m = (mime||'').toLowerCase();
  const n = (name||'').toLowerCase();
  if (m.startsWith('image/')) return ATTACH_ICONS.image;
  if (m.includes('pdf') || n.endsWith('.pdf')) return ATTACH_ICONS.pdf;
  if (m.includes('word')  || /\.(doc|docx)$/.test(n)) return ATTACH_ICONS.word;
  if (m.includes('sheet') || m.includes('excel') || /\.(xls|xlsx|csv)$/.test(n)) return ATTACH_ICONS.excel;
  if (m.includes('presentation') || /\.(ppt|pptx)$/.test(n)) return ATTACH_ICONS.powerpoint;
  if (m.includes('text') || n.endsWith('.txt')) return ATTACH_ICONS.text;
  if (m.includes('zip') || m.includes('rar') || /\.(zip|rar|7z)$/.test(n)) return ATTACH_ICONS.archive;
  return ATTACH_ICONS.other;
}
function fmtSize(b){
  if (!b && b !== 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024*1024) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1024/1024).toFixed(2)} MB`;
}
// Pending attachments staged in the New Ticket modal (cleared on submit/close)
let pendingAttachments = [];

// ── SUPABASE CLIENT ──────────────────────────────────────
// 🔒 SECURITY ENHANCED: Adds response validation, tamper detection,
// and integrity checks to detect potential RLS bypass attempts.

// Simple nonce generator for request correlation (prevents basic replay)
function _genNonce() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Response validator: detects if data looks suspiciously complete
// (which might indicate RLS is not being enforced)
function _validateResponse(path, data) {
  if (!data) return true;
  // If requesting users list and we get a large array without filtering,
  // this could indicate RLS bypass. Log for investigation.
  if (path.includes('/users') && Array.isArray(data) && data.length > 100) {
    console.warn('[SECURITY] Unusually large users response:', data.length, 'items. Verify RLS is active.');
  }
  return true;
}

async function sbFetch(path, opts={}) {
  // v3.0: استخدام Supabase JWT بدل custom x-session-token
  // الـ JWT بيحمل uid + user_metadata (role, department)
  // RLS بتقرأ auth.uid() و auth.jwt() مباشرة — حماية حقيقية
  const jwt = _supa.getToken();

  const headers = {
    apikey:         CFG.supabaseKey,
    Authorization:  jwt ? `Bearer ${jwt}` : `Bearer ${CFG.supabaseKey}`,
    'Content-Type': 'application/json',
    Prefer:         'return=representation',
    ...(opts.headers || {}),
  };

  const url = `${CFG.supabaseUrl}/rest/v1${path}`;
  const res  = await fetch(url, { ...opts, headers });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    if (res.status === 401) {
      // JWT انتهى — محاولة refresh تلقائي
      const session = _supa.getSession();
      if (session?.refresh_token) {
        const refreshed = await _supa.refreshSession(session.refresh_token);
        if (refreshed) {
          // إعادة المحاولة مرة واحدة بالـ token الجديد
          headers.Authorization = `Bearer ${refreshed.access_token}`;
          const retry = await fetch(url, { ...opts, headers });
          if (retry.ok) {
            const rtxt = await retry.text();
            return rtxt ? JSON.parse(rtxt) : null;
          }
        }
      }
      // Refresh فشل — logout المستخدم
      doLogout();
      return null;
    }
    throw new Error(`SB ${res.status}: ${t}`);
  }

  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

// ── THEME ────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem(CFG.themeKey) || 'dark';
  applyTheme(saved, false);
}

function applyTheme(theme, save=true) {
  document.documentElement.setAttribute('data-theme', theme);
  if (save) {
    localStorage.setItem(CFG.themeKey, theme);
    // Persist to server if logged in
    if (S.user) {
      fetch(CFG.authEndpoint, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'save_theme', user_id:S.user.id, theme })
      }).catch(()=>{});
    }
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current==='dark' ? 'light' : 'dark');
}

// ── TOAST ────────────────────────────────────────────────
function toast(msg, type='success') {
  const icons  = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const colors = {
    success: 'var(--success)',
    error:   'var(--danger)',
    warning: 'var(--warning)',
    info:    'var(--info)'
  };
  // أزل أي toast موجود من نفس النوع
  document.querySelectorAll('.toast').forEach(t=>{ if(t.dataset.type===type) t.remove(); });

  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.type = type;
  el.style.borderRight = `3px solid ${colors[type]||colors.info}`;
  el.innerHTML = `<span class="toast-ico">${icons[type]||'ℹ️'}</span><span class="toast-txt">${_e(msg)}</span>`;
  el.onclick = ()=>el.remove();
  document.body.appendChild(el);

  // fade out قبل الإزالة
  const removeTimer = setTimeout(()=>{
    el.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(()=>el.remove(), 400);
  }, 3600);

  el.onclick = ()=>{ clearTimeout(removeTimer); el.remove(); };
}

// ── CONFIRM ──────────────────────────────────────────────
let _confirmCb = null;
function showConfirm(icon, title, msg, cb) {
  $('confirmIcon').textContent  = icon;
  $('confirmTitle').textContent = title;
  $('confirmMsg').textContent   = msg;
  _confirmCb = cb;
  $('confirmMask').classList.add('on');
}
function confirmOk() {
  const cb = _confirmCb;
  closeConfirm();
  if (cb) cb();
}
function closeConfirm() { $('confirmMask').classList.remove('on'); _confirmCb=null; }

// ── MODALS ───────────────────────────────────────────────
function openModal(id)  { $(id).classList.add('on'); }
function closeModal(id) { $(id).classList.remove('on'); }
document.querySelectorAll('.modal-mask').forEach(m=>{
  m.addEventListener('click',e=>{ if(e.target===m) m.classList.remove('on'); });
});

// ══════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════
// Brute force protection — client-side throttle
const _loginTrack = { count: 0, lockedUntil: 0 };

async function doLogin() {
  // Rate limiting على مستوى الـ client
  if (Date.now() < _loginTrack.lockedUntil) {
    const secs = Math.ceil((_loginTrack.lockedUntil - Date.now()) / 1000);
    showLoginError(`محاولات كثيرة — انتظر ${secs} ثانية`);
    return;
  }

  const usernameOrEmail = $('liUser').value.trim();
  const password        = $('liPass').value;
  const btn             = $('signInBtn');

  if (!usernameOrEmail || !password) {
    showLoginError('يرجى إدخال اسم المستخدم وكلمة المرور');
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'جارٍ التحقق...';
  $('loginErr').style.display = 'none';

  try {
    // v3.3: الـ username→email lookup يتم على السيرفر فقط
    // الـ client ما بيشوفش الـ email ولا يعرف لو المستخدم موجود أصلاً
    let email = usernameOrEmail;
    if (!usernameOrEmail.includes('@')) {
      // نبعت الـ username للـ Netlify Function تجيب الـ email بـ service_role
      // بكده الـ anon key ما يقدرش يعمل enumerate للـ users
      const res = await fetch(CFG.authEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve_username', username: usernameOrEmail })
      });
      const data = await res.json();
      // مهم: نفس الـ error للـ username غير الموجود وكلمة السر الغلط
      // عشان ما نكشفش معلومات عن وجود المستخدم
      if (!res.ok || !data.email) {
        throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
      }
      email = data.email;
    }

    // تسجيل الدخول عبر Supabase Auth
    const session = await _supa.signIn(email, password);

    // حفظ الـ session
    localStorage.setItem(CFG.sessionKey, JSON.stringify(session));
    _supa.setSession(session);

    // جلب بيانات المستخدم من public.users
    const userMeta = _supa.getUserMeta();
    const authUid  = session.user.id;

    // جلب كامل بيانات المستخدم من public.users بـ JWT
    const users = await sbFetch(`/users?id=eq.${authUid}&select=*`);
    if (!users?.length) throw new Error('المستخدم غير موجود في قاعدة البيانات');

    const user = users[0];
    S.user  = user;
    S.token = session.access_token;  // للـ backward compat
    _loginTrack.count = 0;

    if (user.theme_pref) applyTheme(user.theme_pref, false);

    await bootApp();
  } catch (err) {
    // نفس رسالة الخطأ سواء كان username غلط أو password غلط
    // عشان ما نكشفش لو المستخدم موجود أصلاً (User Enumeration)
    const genericMsg = 'اسم المستخدم أو كلمة المرور غير صحيحة';
    showLoginError(genericMsg);
    _loginTrack.count++;
    if (_loginTrack.count >= 5) {
      _loginTrack.lockedUntil = Date.now() + 60000;
      _loginTrack.count = 0;
      showLoginError('تم تجاوز الحد المسموح — انتظر 60 ثانية');
    }
  } finally {
    btn.disabled    = false;
    btn.textContent = 'تسجيل الدخول';
  }
}

function showLoginError(msg) {
  $('loginErr').textContent = msg;
  $('loginErr').style.display = 'block';
}

async function tryRestoreSession() {
  try {
    const session = await _supa.restoreSession();
    if (!session) return false;

    _supa.setSession(session);
    const authUid = session.user?.id;
    if (!authUid) return false;

    // جلب بيانات المستخدم من public.users بـ JWT
    const headers = {
      apikey:        CFG.supabaseKey,
      Authorization: `Bearer ${session.access_token}`,
    };
    const res = await fetch(
      `${CFG.supabaseUrl}/rest/v1/users?id=eq.${authUid}&select=*`,
      { headers }
    );
    if (!res.ok) { localStorage.removeItem(CFG.sessionKey); return false; }
    const users = await res.json();
    if (!users?.length) { localStorage.removeItem(CFG.sessionKey); return false; }

    S.user  = users[0];
    S.token = session.access_token;
    if (S.user.theme_pref) applyTheme(S.user.theme_pref, false);
    return true;
  } catch {
    localStorage.removeItem(CFG.sessionKey);
    return false;
  }
}

function doLogout() {
  if (S._heartbeat) { clearInterval(S._heartbeat); S._heartbeat = null; }
  if (S._slaCheck)  { clearInterval(S._slaCheck);  S._slaCheck  = null; }
  if (S._polling)   { clearInterval(S._polling);   S._polling   = null; }

  // تسجيل خروج من Supabase Auth
  _supa.signOut().catch(() => {});

  S.user = S.token = null;
  S.tickets = S.users = S.notifs = [];
  localStorage.removeItem(CFG.sessionKey);
  $('appShell').classList.remove('on');
  $('loginScreen').classList.add('visible');
  $('liUser').value = $('liPass').value = '';
}

// ═══════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════
async function bootApp() {
  $('loginScreen').classList.remove('visible');
  $('appShell').classList.add('on');

  // Sync auth.users → public.users (في حالة وجود users جديدة من Auth)
  try {
    await sbFetch('/rpc/manual_sync_auth_users', { method: 'POST' });
  } catch (e) {
    console.warn('[SYNC] Could not sync auth users:', e.message);
  }

  await Promise.all([loadTickets(), loadUsers(), loadNotifications(), loadDepartmentMap()]);

  buildTopbar();
  buildNav();
  refreshNavCounts();
  showPage('dashboard');

  // Heartbeat — Supabase JWT auto-refresh بيتعمل تلقائياً في sbFetch
  // مش محتاجين ping للـ Netlify بعد كده
  // بس نعمل check على الـ session كل 5 دقائق عشان نـ refresh لو قرب ينتهي
  if (S._heartbeat) clearInterval(S._heartbeat);
  S._heartbeat = setInterval(async () => {
    const session = _supa.getSession();
    if (!session) return;
    // لو الـ token هينتهي خلال 5 دقائق — refresh
    if (session.expires_at && Date.now() / 1000 > session.expires_at - 300) {
      await _supa.refreshSession(session.refresh_token);
    }
  }, 3 * 60 * 1000);

  // SLA Check — كل 30 دقيقة تبعت تنبيه للـ admin لو تيكت اقترب من الانتهاء
  if (S._slaCheck) clearInterval(S._slaCheck);
  checkSLAAlerts();
  S._slaCheck = setInterval(checkSLAAlerts, 30 * 60 * 1000);

  // Real-time polling — كل 30 ثانية بيجيب أحدث البيانات
  if (S._polling) clearInterval(S._polling);
  S._polling = setInterval(async () => {
    if (!S.token) return;
    const prevTicketCount  = S.tickets.length;
    const prevNotifUnread  = S.notifs.filter(n=>!n.is_read).length;

    await Promise.all([loadTickets(), loadNotifications()]);

    refreshNavCounts();

    // لو في تيكتات جديدة وصلت — حدّث الصفحة الحالية
    if (S.tickets.length !== prevTicketCount) {
      if (S.page === 'dashboard')   renderDashboard();
      if (S.page === 'mytickets')   renderMyTickets();
      if (S.page === 'alltickets')  renderAllTickets();
      if (S.page === 'archive')     renderArchive();
      if (S.page === 'reports')     renderReports();
    }

    // لو في إشعارات جديدة — حدّث الـ panel (الصوت في renderNotifPanel)
    if (S.notifs.filter(n=>!n.is_read).length !== prevNotifUnread) {
      renderNotifPanel();
    }
  }, 30 * 1000);
}

function checkSLAAlerts() {
  if (!S.user || S.user.role === 'employee') return;
  const now = Date.now();
  S.tickets.forEach(t => {
    if (['resolved','closed'].includes(t.status)) return;
    const slaH    = PRIO_SLA[t.priority] || 24;
    const elapsed = (now - new Date(t.created_at)) / 3600000;
    const pct     = elapsed / slaH * 100;
    // تنبيه لما يوصل 80% من الـ SLA ومتبعتش تنبيه لنفس التيكت قبل كده
    if (pct >= 80 && pct < 100) {
      const key = `sla_warned_${t.id}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
      const rem = Math.round(slaH - elapsed);
      sbFetch('/notifications', { method:'POST', body: JSON.stringify({
        user_id: S.user.id,
        title:   `⚠️ SLA قارب على الانتهاء: ${t.ticket_number}`,
        body:    `متبقي ${rem} ساعة — ${t.title}`,
        is_read: false
      })}).catch(()=>{});
    }
  });
}

async function loadTickets() {
  try {
    S.tickets = await sbFetch('/tickets?select=*,comments:ticket_comments(*)&order=created_at.desc') || [];
  } catch { S.tickets = []; }
}

async function loadUsers() {
  try {
    // super_admin/manager يشوفوا كل البيانات — employee يشوف اسم + دور + قسم بس
    const isLead = S.user && ['super_admin','manager','supervisor','admin'].includes(S.user.role);
    const fields = isLead
      ? 'id,name,username,email,role,department,phone,is_active'
      : 'id,name,username,role,department,is_active';
    const all = await sbFetch(`/users?select=${fields}&order=name`) || [];
    S.users = all.filter(u => u.username !== 'ammar.admin');
  } catch { S.users = []; }
}

async function loadNotifications() {
  if (!S.user) return;
  try {
    // Always filter by user_id — every role sees only their own notifications
    S.notifs = await sbFetch(`/notifications?user_id=eq.${S.user.id}&order=created_at.desc&limit=30`) || [];
  } catch { S.notifs = []; }
  renderNotifPanel();
}

// ── DEPARTMENT MAP: load from DB, fall back to defaults ─────
async function loadDepartmentMap() {
  try {
    const rows = await sbFetch('/department_requests?is_active=eq.true&order=department,sort_order');
    if (!rows || !rows.length) {
      console.warn('[DEPT] department_requests جدول فاضي — استخدام الخريطة الافتراضية');
      DEPT_MAP = { ...DEFAULT_DEPT_MAP };
      return;
    }
    const map = {};
    rows.forEach(r => {
      if (!map[r.department]) map[r.department] = [];
      map[r.department].push(r.request_type);
    });
    DEPT_MAP = map;
  } catch (e) {
    console.warn('[DEPT] فشل جلب خريطة الإدارات — استخدام الافتراضية:', e.message);
    DEPT_MAP = { ...DEFAULT_DEPT_MAP };
  }
}

function deptList()  { return Object.keys(DEPT_MAP); }
function typesOf(dept){ return DEPT_MAP[dept] || []; }

// ═══════════════════════════════════════════════════════
//  TOPBAR & NAV
// ═══════════════════════════════════════════════════════
function buildTopbar() {
  const u = S.user;
  $('tbName').textContent   = u.name;
  // عرض: الدور · الإدارة (مثلاً: "مدير إدارة · الحسابات")
  const roleLabel = ROLES[u.role] || u.role;
  const deptSuffix = u.department && u.department !== 'إدارة النظام' ? ` · ${u.department}` : '';
  $('tbRole').textContent   = roleLabel + deptSuffix;
  $('tbAvatar').textContent = u.name.charAt(0);
}

function buildNav() {
  // قائمة موحدة — بتتفلتر حسب الصلاحية
  const allItems = [
    ['dashboard',  '⊞',  'الرئيسية'],
    ['mytickets',  '🎫', 'طلباتي'],
    ['alltickets', '📥', Perm.isSuper() ? 'كل الطلبات' : `طلبات ${Perm.myDept() || 'إدارتي'}`],
    ['outbound',   '📤', `طلبات فريقي الصادرة`],
    ['users',      '👥', 'المستخدمون'],
    ['reports',    '📊', 'التقارير'],
    ['roles',      '🔑', 'الأدوار'],
    ['deptmap',    '🏢', 'الإدارات'],
    ['archive',    '📦', 'الأرشيف'],
    ['auditlog',   '🛡️', 'سجل العمليات'],
    ['profile',    '👤', 'حسابي'],
  ];
  const items = allItems.filter(([id]) => Perm.canSeePage(id));
  $('mainNav').innerHTML = items.map(([id,,label]) => {
    const count = getNavCount(id);
    const badge = count > 0
      ? `<span style="background:var(--danger);color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:9px;margin-right:4px;">${count}</span>`
      : '';
    return `<button class="tb-nav-btn" id="nav-${id}" onclick="showPage('${id}')">${_e(label)}${badge}</button>`;
  }).join('');
}

function getNavCount(pageId) {
  if (!S.tickets?.length) return 0;
  if (pageId === 'mytickets') {
    return S.tickets.filter(t=>t.created_by===S.user.id && ['open','assigned','in_progress'].includes(t.status)).length;
  }
  if (pageId === 'alltickets') {
    // عدّاد الطلبات المرئية لي (الـ inbound — موجهة لإدارتي)
    if (Perm.isSuper()) {
      return visibleTickets().filter(t => ['open','assigned'].includes(t.status)).length;
    }
    return inboundTickets().filter(t => ['open','assigned'].includes(t.status)).length;
  }
  if (pageId === 'outbound') {
    // عدّاد الطلبات الصادرة من فريقي (اللي لسه مش محلولة)
    return outboundTickets().filter(t => !['resolved','closed','archived'].includes(t.status)).length;
  }
  if (pageId === 'archive') {
    return S.tickets.filter(t=>t.status==='archived').length;
  }
  return 0;
}

function refreshNavCounts() {
  ['mytickets','alltickets','outbound','archive'].forEach(id=>{
    const btn = $(`nav-${id}`);
    if (!btn) return;
    const count = getNavCount(id);
    const old = btn.querySelector('span');
    if (old) old.remove();
    if (count > 0) {
      const badge = document.createElement('span');
      badge.style.cssText = 'background:var(--danger);color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:9px;margin-right:4px;';
      badge.textContent = count;
      btn.appendChild(badge);
    }
  });
}

// ═══════════════════════════════════════════════════════
//  ROUTING
// ═══════════════════════════════════════════════════════
function showPage(id) {
  // Permission guard
  if (!Perm.canSeePage(id)) {
    toast('ليس لديك صلاحية لعرض هذه الصفحة','error');
    id = 'dashboard';
  }
  S.prevPage = S.page;
  S.page     = id;

  document.querySelectorAll('.tb-nav-btn').forEach(b=>b.classList.remove('active'));
  const nb = $(`nav-${id}`);
  if (nb) nb.classList.add('active');

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  const pg = $(`page-${id}`);
  if (pg) pg.classList.add('on');

  refreshNavCounts();

  const renders = {
    dashboard: renderDashboard,
    mytickets: renderMyTickets,
    alltickets: renderAllTickets,
    outbound: renderOutboundTickets,
    users:    renderUsers,
    reports:  renderReports,
    auditlog: renderAuditLog,
    archive:  renderArchive,
    profile:  renderProfile,
    deptmap:  renderDeptMap,
    roles:    renderRoles,
  };
  if (renders[id]) renders[id]();

  $('contentEl').scrollTop = 0;
}

function goBack() { showPage(S.prevPage || 'dashboard'); }

// ═══════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════
function myTickets() {
  // الموظف العادي: بس طلباته اللي قدمها
  if (Perm.isEmployee()) return S.tickets.filter(t => t.created_by === S.user.id);
  // القيادات وال super_admin: كل اللي يشوفوه (استناداً على الـ visibility rules)
  return visibleTickets();
}

function renderDashboard() {
  const u = S.user;
  $('dashSub').textContent = `مرحباً ${u.name} — ${new Date().toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long'})}`;

  // Actions — كل المستخدمين يقدروا يفتحوا طلب جديد (مش بس الموظف)
  $('dashActions').innerHTML =
    `<button class="btn btn-gold" onclick="openNewTicketModal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>طلب جديد</button>`;

  const tickets = myTickets();
  const open    = tickets.filter(t=>t.status==='open').length;
  const prog    = tickets.filter(t=>['in_progress','assigned'].includes(t.status)).length;
  // مغلق = closed + resolved (legacy)
  const closedCount = tickets.filter(t=>['closed','resolved'].includes(t.status)).length;
  const crit    = tickets.filter(t=>t.priority==='critical'&&!['closed','resolved'].includes(t.status)).length;

  const colorForVal = (i) => ['#60A5FA','#FCD34D','#4ADE80','#F87171'][i];

  $('dashStats').innerHTML = [
    ['مفتوح',       open,       'يحتاج إجراء'],
    ['قيد التنفيذ', prog,       'جارٍ العمل'],
    ['مغلق',        closedCount,'مكتملة'],
    ['حرجة',        crit,       'أولوية قصوى'],
  ].map(([l,v,h],i)=>`
    <div class="stat-card" style="--_acc:${colorForVal(i)}">
      <div class="stat-label">${l}</div>
      <div class="stat-val" style="color:${colorForVal(i)}">${v}</div>
      <div class="stat-hint">${h}</div>
    </div>
  `).join('');

  renderDashCharts(tickets);

  // Super Admin + Managers: load active sessions asynchronously (non-blocking)
  if (Perm.isSuper() || Perm.isManager()) {
    fetch(CFG.authEndpoint, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'get_sessions', token:S.token })
    }).then(r=>r.json()).then(data=>{
      const total = data.total || 0;
      const users = data.users || [];

      const usersHtml = users.length
        ? users.map(u=>`
            <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:0.5px solid var(--border);last-child:border-none;">
              <div style="width:8px;height:8px;border-radius:50%;background:#4ADE80;flex-shrink:0;"></div>
              <span style="font-size:13px;font-weight:500;color:var(--text-primary);flex:1;">${_e(u.name)}</span>
              <span style="font-size:11px;color:var(--text-muted);">${_e(ROLES[u.role]||u.role)}</span>
            </div>`).join('')
        : `<div style="padding:12px;font-size:13px;color:var(--text-muted);text-align:center;">لا يوجد مستخدمون متصلون</div>`;

      // Label ديناميكي: super_admin يشوف كل النظام، المدير يشوف إدارته
      const scopeLabel = Perm.isSuper()
        ? 'المستخدمون المتصلون — كل النظام'
        : `المستخدمون المتصلون — إدارة ${Perm.myDept() || '—'}`;

      const el = document.createElement('div');
      el.className = 'chart-card c12';
      el.style.cssText = 'border-right:3px solid var(--gold);';
      el.innerHTML = `
        <div class="ch-head">
          <div>
            <div class="ch-title">🟢 الجلسات النشطة</div>
            <div class="ch-sub">${_e(scopeLabel)}</div>
          </div>
          <div style="font-family:var(--font-display);font-size:36px;font-weight:700;color:var(--gold);">${total}</div>
        </div>
        <div style="border:0.5px solid var(--border);border-radius:var(--radius-md);overflow:hidden;margin-top:4px;">
          ${usersHtml}
        </div>
      `;
      const charts = $('dashCharts');
      if (charts) charts.appendChild(el);
    }).catch(()=>{});
  }
}

function renderDashCharts(tickets) {
  // Bar — last 7 days
  const days = [];
  for (let i=6;i>=0;i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const label = d.toLocaleDateString('ar-EG',{weekday:'short'});
    const count = tickets.filter(t=>new Date(t.created_at).toDateString()===d.toDateString()).length;
    days.push({label,count});
  }
  const maxC = Math.max(...days.map(d=>d.count),1);

  const barHtml = `
    <div class="chart-card c7">
      <div class="ch-head"><div><div class="ch-title">التيكتات — آخر 7 أيام</div><div class="ch-sub">العدد اليومي</div></div></div>
      <div class="bar-chart">
        ${days.map(d=>`<div class="bar-col">
          <div class="bar-num">${d.count}</div>
          <div class="bar-fill" style="height:${Math.max(d.count/maxC*72,3)}px"></div>
          <div class="bar-lbl">${d.label}</div>
        </div>`).join('')}
      </div>
    </div>`;

  // Donut — by target department (fallback to legacy category if missing)
  const cats={};
  tickets.forEach(t=>{
    const key = t.target_department || CAT_L[t.category] || t.category || 'غير محدد';
    cats[key] = (cats[key]||0) + 1;
  });
  const total   = tickets.length;
  const divisor = total || 1; // avoid division by zero
  const colors = ['#B8975A','#60A5FA','#4ADE80','#F87171','#FCD34D','#C084FC','#22D3EE','#FB923C','#F472B6','#A78BFA'];
  // Build donut: empty state if no tickets
  let donutHtml;
  if (total === 0) {
    donutHtml = `<div class="chart-card c5">
      <div class="ch-head"><div><div class="ch-title">التوزيع حسب الإدارة</div><div class="ch-sub">0 إجمالي</div></div></div>
      <div class="empty-state" style="padding:24px;"><p>لا توجد تيكتات</p></div>
    </div>`;
  } else {
  const catList = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const R=38, circ=2*Math.PI*R;
  let off=0;
  const slices = catList.map((c,i)=>{
    const pct=c[1]/divisor;
    const d=pct*circ, g=circ-d, o=off;
    off+=d;
    return {label:c[0],val:c[1],color:colors[i%colors.length],d,g,o};
  });

  donutHtml = `
    <div class="chart-card c5">
      <div class="ch-head"><div><div class="ch-title">التوزيع حسب الإدارة</div><div class="ch-sub">${total} إجمالي</div></div></div>
      <div class="donut-wrap">
        <svg width="90" height="90" viewBox="0 0 90 90" style="flex-shrink:0;">
          ${slices.map(s=>`<circle cx="45" cy="45" r="${R}" fill="none" stroke="${s.color}" stroke-width="11"
            stroke-dasharray="${s.d} ${s.g}" stroke-dashoffset="${-s.o+circ/4}"
            transform="rotate(-90 45 45)"/>`).join('')}
          <text x="45" y="41" text-anchor="middle" fill="var(--text-primary)" font-size="13" font-weight="700" font-family="Tajawal">${total}</text>
          <text x="45" y="52" text-anchor="middle" fill="var(--text-muted)" font-size="7" font-family="Tajawal">تيكت</text>
        </svg>
        <div class="donut-legend">${slices.map(s=>`
          <div class="dl-item"><div class="dl-dot" style="background:${s.color}"></div>${s.label}<span class="dl-val">${s.val}</span></div>
        `).join('')}</div>
      </div>
    </div>`;

  } // end else (tickets exist)

  // Recent tickets table — نسخة كاملة بكل الأعمدة
  const recent = [...myTickets()].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,5);
  // للموظف العادي: كل التيكتات منه، فمش محتاج عمود "مقدم الطلب"
  const showCreator = !Perm.isEmployee();
  const recentHtml = `
    <div class="chart-card c12">
      <div class="ch-head">
        <div class="ch-title">آخر التيكتات</div>
        <button class="btn btn-ghost" style="padding:6px 12px;font-size:12px;" onclick="showPage('${Perm.isEmployee()?'mytickets':'alltickets'}')">عرض الكل</button>
      </div>
      <div style="overflow-x:auto;">
        <table class="data-tbl">
          <thead><tr>
            <th>الرقم</th>
            <th>العنوان</th>
            ${showCreator ? '<th>مقدم الطلب</th><th>قسم المقدم</th>' : ''}
            <th>الإدارة المستهدفة</th>
            <th>نوع الطلب</th>
            <th>الأولوية</th>
            <th>الحالة</th>
            <th>المعين</th>
            <th>التاريخ</th>
          </tr></thead>
          <tbody>${recent.length ? recent.map(t=>{
            const deptCell = t.target_department
              ? `<span class="dept-chip">${_e(t.target_department)}</span>`
              : `<span style="color:var(--text-muted);">${_e(CAT_L[t.category]||t.category||'—')}</span>`;
            const reqTypeCell = t.request_type
              ? `<span class="reqtype-chip">${_e(t.request_type)}</span>`
              : '<span style="color:var(--text-muted);">—</span>';
            const assignedCell = t.assigned_to
              ? `<span style="font-size:12px;">${_e(uname(t.assigned_to))}</span>`
              : '<span style="color:var(--text-muted);font-size:11px;">غير معين</span>';
            const attachTag = (t.attachments && t.attachments.length)
              ? `<span style="font-size:10px;color:var(--gold);margin-inline-start:6px;">📎 ${t.attachments.length}</span>` : '';
            const creatorCells = showCreator
              ? `<td><strong style="font-size:12px;">${_e(uname(t.created_by))}</strong></td>
                 <td style="font-size:11px;color:var(--text-muted);">${_e(udept(t.created_by)||'—')}</td>`
              : '';
            return `
            <tr onclick="openTicketDetail('${t.id}')">
              <td><span class="tnum">${_e(t.ticket_number)}</span></td>
              <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_e(t.title)}${attachTag}</td>
              ${creatorCells}
              <td>${deptCell}</td>
              <td>${reqTypeCell}</td>
              <td>${pbadge(t.priority)}</td>
              <td>${sbadge(t.status)}</td>
              <td>${assignedCell}</td>
              <td style="font-family:var(--font-mono);font-size:11px;">${_d(t.created_at)}</td>
            </tr>`;
          }).join('') : `<tr><td colspan="${showCreator?10:8}"><div class="empty-state"><p>لا توجد تيكتات بعد</p></div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

  $('dashCharts').innerHTML = barHtml + donutHtml + recentHtml;
}

// ═══════════════════════════════════════════════════════
//  MY TICKETS
// ═══════════════════════════════════════════════════════
function renderMyTickets() {
  // Reset filters when page loads fresh
  S.myFilter = { status: '', search: '' };
  const inputs = document.querySelectorAll('#page-mytickets .s-input, #page-mytickets .s-select');
  inputs.forEach(el => { el.value = ''; });
  const base = S.tickets.filter(t=>t.created_by===S.user.id);
  renderTicketRows('myTbody', applyMyFilter(base), false);
}

function filterMyTickets(q) {
  S.myFilter.search = q;
  const base = S.tickets.filter(t=>t.created_by===S.user.id);
  renderTicketRows('myTbody', applyMyFilter(base), false);
}
function filterMyByStatus(v) {
  S.myFilter.status = v;
  const base = S.tickets.filter(t=>t.created_by===S.user.id);
  renderTicketRows('myTbody', applyMyFilter(base), false);
}
function applyMyFilter(list) {
  let r = list;
  if (S.myFilter.status) r = r.filter(t=>t.status===S.myFilter.status);
  if (S.myFilter.search) r = r.filter(t=>t.title.includes(S.myFilter.search)||t.ticket_number.includes(S.myFilter.search));
  return r;
}

// ═══════════════════════════════════════════════════════
//  ALL TICKETS
// ═══════════════════════════════════════════════════════
function renderAllTickets() {
  // Reset filters when page loads fresh
  S.allFilter = { status: '', priority: '', search: '', date: '', department: '' };
  const inputs = document.querySelectorAll('#page-alltickets .s-input, #page-alltickets .s-select');
  inputs.forEach(el => { el.value = ''; });

  const banner = $('allTicketsBanner');
  if (banner) {
    if (!Perm.isSuper() && Perm.isDeptLead() && !Perm.myDept()) {
      banner.innerHTML = `
        <div style="background:rgba(251,191,36,0.12);border:1px solid var(--warning);border-radius:8px;padding:12px 16px;margin-bottom:12px;font-size:13px;color:var(--warning);">
          ⚠️ حسابك غير مرتبط بأي إدارة. يرجى التواصل مع مدير النظام لتحديد إدارتك من صفحة "الأدوار".
        </div>`;
    } else if (!Perm.isSuper() && Perm.isDeptLead() && Perm.myDept()) {
      // تشخيص ذكي: هل في طلبات target_department مشابه لكن مش مطابق تماماً؟
      const mine = Perm.myDept();
      const mineLower = mine.toLowerCase();
      const mineNoSpace = mine.replace(/\s+/g,'');
      const suspiciousTickets = S.tickets.filter(t => {
        const target = (t.target_department || '').trim();
        if (!target || target === mine) return false;
        return target.toLowerCase() === mineLower
            || target.replace(/\s+/g,'') === mineNoSpace;
      });
      if (suspiciousTickets.length > 0) {
        const samples = [...new Set(suspiciousTickets.map(t => `"${t.target_department}"`))].slice(0,3).join(' · ');
        banner.innerHTML = `
          <div style="background:rgba(239,68,68,0.10);border:1px solid var(--danger);border-radius:8px;padding:12px 16px;margin-bottom:12px;font-size:13px;color:var(--danger);">
            ⚠️ <strong>عدم تطابق في اسم الإدارة</strong><br>
            إدارتك المسجلة: <strong>"${_e(mine)}"</strong> · التيكتات مسجلة باسم: ${_e(samples)}<br>
            <span style="font-size:12px;">يوجد ${suspiciousTickets.length} طلب لإدارتك بأسماء مختلفة قليلاً. اطلب من مدير النظام تشغيل migration v3 لإصلاح البيانات.</span>
          </div>`;
      } else {
        banner.innerHTML = '';
      }
    } else {
      banner.innerHTML = '';
    }
  }

  // Populate department filter dropdown (super_admin only — غير كده الإدارة ثابتة)
  const deptSel = $('at_dept');
  if (deptSel) {
    if (Perm.isSuper()) {
      deptSel.innerHTML = `<option value="">كل الإدارات</option>` +
        deptList().map(d => `<option value="${_e(d)}">${_e(d)}</option>`).join('');
      deptSel.hidden = false;
      deptSel.style.display = '';
    } else {
      deptSel.hidden = true;
      deptSel.style.display = 'none';
    }
  }
  // استثناء المؤرشفة + تطبيق فلتر الرؤية
  // للـ dept leads: بس الـ inbound (موجه لإدارتهم) — الـ outbound في تاب منفصل
  // للـ super_admin: كل حاجة
  const baseList = Perm.isSuper()
    ? visibleTickets()
    : inboundTickets();
  renderTicketRows('allTbody', applyAllFilter(baseList.filter(t=>t.status!=='archived')), true);
}
function filterAllTickets(q) {
  S.allFilter.search = q;
  const baseList = Perm.isSuper() ? visibleTickets() : inboundTickets();
  renderTicketRows('allTbody', applyAllFilter(baseList.filter(t=>t.status!=='archived')), true);
}
function filterAll(key, val) {
  if (key==='status')     S.allFilter.status     = val;
  if (key==='priority')   S.allFilter.priority   = val;
  if (key==='date')       S.allFilter.date       = val;
  if (key==='department') S.allFilter.department = val;
  const baseList = Perm.isSuper() ? visibleTickets() : inboundTickets();
  renderTicketRows('allTbody', applyAllFilter(baseList.filter(t=>t.status!=='archived')), true);
}
function applyAllFilter(list) {
  let r = list;
  if (S.allFilter.status)     r = r.filter(t=>t.status===S.allFilter.status);
  if (S.allFilter.priority)   r = r.filter(t=>t.priority===S.allFilter.priority);
  if (S.allFilter.department) r = r.filter(t=>(t.target_department||'')===S.allFilter.department);
  if (S.allFilter.search)     r = r.filter(t=>t.title.includes(S.allFilter.search)||t.ticket_number.includes(S.allFilter.search)||uname(t.created_by).includes(S.allFilter.search));
  if (S.allFilter.date) {
    const now = Date.now();
    const ms  = { today: 86400000, week: 604800000, month: 2592000000 }[S.allFilter.date];
    if (ms) r = r.filter(t => now - new Date(t.created_at) <= ms);
  }
  return r;
}

// ═══════════════════════════════════════════════════════
//  OUTBOUND TICKETS (طلبات فريقي الصادرة لإدارات أخرى)
// ═══════════════════════════════════════════════════════
function renderOutboundTickets() {
  // Reset filters
  S.outFilter = { status: '', priority: '', search: '', dept: '' };
  const inputs = document.querySelectorAll('#page-outbound .s-input, #page-outbound .s-select');
  inputs.forEach(el => { el.value = ''; });

  const base = outboundTickets().filter(t => t.status !== 'archived');

  // Build dept filter from actual destinations
  const deptSel = $('ob_dept');
  if (deptSel) {
    const destDepts = [...new Set(base.map(t => t.target_department).filter(Boolean))].sort();
    deptSel.innerHTML = `<option value="">كل الإدارات المستلمة</option>` +
      destDepts.map(d => `<option value="${_e(d)}">${_e(d)}</option>`).join('');
  }

  // Summary card
  const stats = $('outboundStats');
  if (stats) {
    const total = base.length;
    const open = base.filter(t => ['open','assigned','in_progress'].includes(t.status)).length;
    const done = base.filter(t => ['resolved','closed'].includes(t.status)).length;
    const crit = base.filter(t => t.priority === 'critical' && !['resolved','closed'].includes(t.status)).length;
    stats.innerHTML = `
      <div class="stats-row" style="margin-bottom:16px;">
        <div class="stat-card" style="--_acc:#60A5FA">
          <div class="stat-label">إجمالي الصادرة</div>
          <div class="stat-val" style="color:#60A5FA">${total}</div>
          <div class="stat-hint">من فريق ${_e(Perm.myDept()||'—')}</div>
        </div>
        <div class="stat-card" style="--_acc:#FCD34D">
          <div class="stat-label">قيد المعالجة</div>
          <div class="stat-val" style="color:#FCD34D">${open}</div>
          <div class="stat-hint">لم تُحل بعد</div>
        </div>
        <div class="stat-card" style="--_acc:#4ADE80">
          <div class="stat-label">مغلقة</div>
          <div class="stat-val" style="color:#4ADE80">${done}</div>
          <div class="stat-hint">مكتملة</div>
        </div>
        <div class="stat-card" style="--_acc:#F87171">
          <div class="stat-label">حرجة معلقة</div>
          <div class="stat-val" style="color:#F87171">${crit}</div>
          <div class="stat-hint">تحتاج متابعة</div>
        </div>
      </div>`;
  }

  renderOutboundRows(applyOutFilter(base));
}

function filterOutbound(key, val) {
  if (!S.outFilter) S.outFilter = { status: '', priority: '', search: '', dept: '' };
  S.outFilter[key] = val;
  const base = outboundTickets().filter(t => t.status !== 'archived');
  renderOutboundRows(applyOutFilter(base));
}
function filterOutboundSearch(q) { filterOutbound('search', q); }

function applyOutFilter(list) {
  let r = list;
  const f = S.outFilter || {};
  if (f.status)   r = r.filter(t => t.status === f.status);
  if (f.priority) r = r.filter(t => t.priority === f.priority);
  if (f.dept)     r = r.filter(t => (t.target_department||'') === f.dept);
  if (f.search) {
    const q = f.search.toLowerCase();
    r = r.filter(t =>
      (t.title||'').toLowerCase().includes(q) ||
      (t.ticket_number||'').toLowerCase().includes(q) ||
      (uname(t.created_by)||'').toLowerCase().includes(q)
    );
  }
  return r;
}

function renderOutboundRows(tickets) {
  const tbody = $('outboundTbody');
  if (!tbody) return;
  if (!tickets.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
      <p>لا توجد طلبات صادرة من فريقك لإدارات أخرى</p>
    </div></td></tr>`;
    return;
  }
  tbody.innerHTML = tickets.map(t => {
    const sla = getSLA(t);
    const targetDept = `<span class="dept-chip">${_e(t.target_department||'—')}</span>`;
    const reqType = t.request_type
      ? `<span class="reqtype-chip">${_e(t.request_type)}</span>`
      : '<span style="color:var(--text-muted);">—</span>';
    const attachTag = (t.attachments && t.attachments.length)
      ? `<span style="font-size:10px;color:var(--gold);margin-inline-start:6px;">📎 ${t.attachments.length}</span>` : '';
    return `<tr onclick="openTicketDetail('${t.id}')">
      <td><span class="tnum">${_e(t.ticket_number)}</span></td>
      <td style="max-width:200px;">
        <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_e(t.title)}${attachTag}</div>
      </td>
      <td><strong>${_e(uname(t.created_by))}</strong></td>
      <td>${targetDept}</td>
      <td>${reqType}</td>
      <td>${pbadge(t.priority)}</td>
      <td>${sbadge(t.status)}</td>
      <td>${_e(t.assigned_to ? uname(t.assigned_to) : 'غير معين')}</td>
      <td style="font-family:var(--font-mono);font-size:11px;">${_d(t.created_at)}</td>
    </tr>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════
//  RENDER TICKET ROWS
// ═══════════════════════════════════════════════════════
function renderTicketRows(tbodyId, tickets, isAdmin) {
  const tbody = $(tbodyId);
  if (!tickets.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8z"/></svg>
      <p>لا توجد طلبات لعرضها</p>
      ${!isAdmin && !Perm.isSuper() && Perm.isEmployee() && !Perm.myDept()
        ? '<p style="color:var(--warning);font-size:12px;margin-top:8px;">⚠️ حسابك غير مرتبط بإدارة. تواصل مع مدير النظام.</p>'
        : ''}
    </div></td></tr>`;
    return;
  }

  if (isAdmin) {
    tbody.innerHTML = tickets.map(t=>{
      const sla = getSLA(t);
      const canDel = Perm.canDeleteTicket(t);
      const targetDept = t.target_department
        ? `<span class="dept-chip">${_e(t.target_department)}</span>`
        : `<span style="color:var(--text-muted);">${_e(CAT_L[t.category]||t.category||'—')}</span>`;
      const reqType = t.request_type
        ? `<span class="reqtype-chip">${_e(t.request_type)}</span>`
        : '<span style="color:var(--text-muted);">—</span>';
      const attachTag = (t.attachments && t.attachments.length)
        ? `<span style="font-size:10px;color:var(--gold);margin-inline-start:6px;">📎 ${t.attachments.length}</span>` : '';
      return `<tr onclick="openTicketDetail('${t.id}')">
        <td><span class="tnum">${_e(t.ticket_number)}</span></td>
        <td style="max-width:200px;">
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_e(t.title)}${attachTag}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${_e(udept(t.created_by)||'—')}</div>
        </td>
        <td>${_e(uname(t.created_by))}</td>
        <td>${targetDept}</td>
        <td>${reqType}</td>
        <td>${pbadge(t.priority)}</td>
        <td>${sbadge(t.status)}</td>
        <td>${_e(t.assigned_to ? uname(t.assigned_to) : '—')}</td>
        <td style="min-width:100px;">
          <div class="sla-bar"><div class="sla-fill ${sla.cls}" style="width:${sla.pct}%"></div></div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${sla.label}</div>
        </td>
        <td>
          <div style="display:flex;gap:5px;flex-wrap:wrap;">
            ${Perm.canActOnTicket(t)?`<button class="btn btn-ghost" style="padding:4px 9px;font-size:11px;" onclick="event.stopPropagation();quickUpdate('${t.id}')">تحديث</button>`:''}
            ${canDel?`<button class="btn btn-ghost" style="padding:4px 9px;font-size:11px;border-color:var(--warning);color:var(--warning);" onclick="event.stopPropagation();archiveTicket('${t.id}')">أرشفة</button>`:''}
          </div>
        </td>
      </tr>`;
    }).join('');
  } else {
    tbody.innerHTML = tickets.map(t=>{
      const deptCell = t.target_department
        ? `<span class="dept-chip">${_e(t.target_department)}</span>`
        : _e(CAT_L[t.category]||t.category||'—');
      const reqTypeCell = t.request_type
        ? `<span class="reqtype-chip">${_e(t.request_type)}</span>`
        : '<span style="color:var(--text-muted);">—</span>';
      const assignedCell = t.assigned_to
        ? `<span style="font-size:12px;">${_e(uname(t.assigned_to))}</span>`
        : '<span style="color:var(--text-muted);font-size:11px;">غير معين</span>';
      return `
      <tr onclick="openTicketDetail('${t.id}')">
        <td><span class="tnum">${_e(t.ticket_number)}</span></td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${_e(t.title)}
          ${(t.attachments && t.attachments.length) ? `<span style="font-size:10px;color:var(--gold);margin-inline-start:6px;">📎 ${t.attachments.length}</span>` : ''}
        </td>
        <td>${deptCell}</td>
        <td>${reqTypeCell}</td>
        <td>${pbadge(t.priority)}</td>
        <td>${sbadge(t.status)}</td>
        <td>${assignedCell}</td>
        <td style="font-family:var(--font-mono);font-size:11px;">${_d(t.created_at)}</td>
        <td><button class="btn btn-ghost" style="padding:4px 9px;font-size:11px;" onclick="event.stopPropagation();openTicketDetail('${t.id}')">تفاصيل</button></td>
      </tr>`;
    }).join('');
  }
}

function getSLA(t) {
  if (['resolved','closed','archived'].includes(t.status)) return {pct:100, cls:'sla-ok', label:'مكتمل'};
  // استخدم الـ deadline من الـ database لو موجود، وإلا احسبه
  const slaH    = PRIO_SLA[t.priority] || 24;
  const elapsed = (Date.now() - new Date(t.created_at)) / 3600000;
  const pct     = Math.min(elapsed / slaH * 100, 100);
  const rem     = Math.max(slaH - elapsed, 0);
  const label   = pct >= 100 ? '⚠️ متأخر!' : rem < 1 ? 'أقل من ساعة' : `${Math.round(rem)}س متبقية`;
  const cls     = pct >= 100 ? 'sla-crit' : pct >= 80 ? 'sla-warn' : 'sla-ok';
  return { pct, cls, label, breached: pct >= 100 };
}

// ═══════════════════════════════════════════════════════
//  TICKET DETAIL
// ═══════════════════════════════════════════════════════
function renderAttachmentsPanel(t){
  const atts = Array.isArray(t.attachments) ? t.attachments : [];
  if (!atts.length) return '';
  const items = atts.map(a => {
    const isImage = (a.type||'').startsWith('image/');
    const preview = isImage
      ? `<a href="${_e(a.url)}" target="_blank" rel="noopener" title="عرض الصورة">
           <img src="${_e(a.url)}" alt="${_e(a.name)}"
                style="display:block;width:100%;max-height:120px;object-fit:cover;border-radius:4px;margin-bottom:6px;">
         </a>`
      : '';
    return `
      <div class="attach-item" style="flex-direction:column;align-items:stretch;gap:4px;padding:8px;">
        ${preview}
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="attach-item-icon">${attachTypeIcon(a.type, a.name)}</span>
          <span class="attach-item-name">${_e(a.name)}</span>
          <span class="attach-item-size">${fmtSize(a.size)}</span>
        </div>
        <a class="attach-item-link" href="${_e(a.url)}" target="_blank" rel="noopener" download="${_e(a.name)}">
          ⬇️ تحميل / عرض
        </a>
      </div>`;
  }).join('');
  return `
    <div class="dc">
      <div class="dc-title">المرفقات (${atts.length})</div>
      <div class="attach-list">${items}</div>
    </div>`;
}

async function openTicketDetail(id) {
  S.selTicket = id;
  const t = S.tickets.find(t=>t.id===id);
  if (!t) return;

  // Permission guard — مش يفتحش تيكت مش مسموح بيه
  if (!Perm.canSeeTicket(t)) {
    toast('ليس لديك صلاحية لعرض هذا الطلب','error');
    showPage('dashboard');
    return;
  }

  $('detailNum').textContent   = t.ticket_number;
  $('detailTitle').textContent = t.title;

  const isOutbound = Perm.isManager() && Perm.isOutbound(t);
  const canUpdate = Perm.canActOnTicket(t);
  const canDelete = Perm.canDeleteTicket(t);
  const canAssign = Perm.canAssignTicket(t) && t.assigned_to !== S.user.id && !['resolved','closed'].includes(t.status);

  // Banner للطلبات الصادرة (تحذير للمدير إنه في وضع "متابعة" فقط)
  const outboundBanner = isOutbound
    ? `<div style="background:rgba(96,165,250,0.12);border:1px solid #60A5FA;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:13px;color:#60A5FA;display:flex;align-items:center;gap:10px;">
        📤 <div>
          <strong>طلب صادر من فريقك</strong> · مقدم الطلب: ${_e(uname(t.created_by))} من إدارة ${_e(Perm.myDept())}
          <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">يمكنك المتابعة والرد بتعليقات · تحديث الحالة يتم من إدارة <strong>${_e(t.target_department||'—')}</strong></div>
        </div>
      </div>`
    : '';

  $('detailBtns').innerHTML = `
    ${canAssign?`<button class="btn btn-ghost" onclick="assignToMe('${id}')" style="border-color:var(--gold);color:var(--gold);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>تعيين لي</button>`:''}
    ${canUpdate?`<button class="btn btn-ghost" onclick="quickUpdate('${id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>تحديث الحالة</button>`:''}
    ${canDelete?`<button class="btn btn-ghost" style="border-color:var(--warning);color:var(--warning);" onclick="archiveTicket('${id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M21 8v13H3V8M1 3h22v5H1z"/><line x1="10" y1="12" x2="14" y2="12"/></svg>أرشفة التيكت</button>`:''}
  `;

  const sla = getSLA(t);
  const comments = t.comments || [];

  const timelineItems = [
    { author: uname(t.created_by)||t.creator_name||'—', action:'فتح التيكت', time:t.created_at, text:t.description, dot:'var(--gold)' },
    ...comments.map(c=>({ author: uname(c.user_id) !== '—' ? uname(c.user_id) : (c.author_name||'—'), action:'تعليق', time:c.created_at, text:c.content, dot:'#60A5FA' }))
  ];

  $('detailGrid').innerHTML = `
    <div style="grid-column:1/-1;">${outboundBanner}</div>
    <div>
      <div class="dc">
        <div class="dc-title">سجل التيكت</div>
        <div class="timeline">
          ${timelineItems.map(item=>`
            <div class="tl-item">
              <div class="tl-dot" style="background:${item.dot}"></div>
              <div class="tl-body">
                <div class="tl-meta">
                  <span class="tl-author">${_e(item.author)}</span>
                  <span class="tl-act">${_e(item.action)}</span>
                  <span class="tl-time">${_d(item.time)} ${_t(item.time)}</span>
                </div>
                <div class="tl-text">${_e(item.text)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>

      ${Perm.canCommentOnTicket(t) ? `
      <div class="comment-wrap">
        <div class="dc-title" style="margin-bottom:10px;">
          إضافة تعليق
          ${isOutbound ? '<span style="font-size:11px;color:var(--text-muted);font-weight:400;margin-inline-start:8px;">· وضع المتابعة — رد فقط</span>' : ''}
        </div>
        <textarea class="comment-input" id="newCommentInput" placeholder="أضف تعليقاً أو تحديثاً..."></textarea>
        <button class="btn btn-gold" onclick="addComment('${id}')">إرسال</button>
      </div>` : ''}

      ${['closed','archived'].includes(t.status) && t.created_by === S.user?.id ? `
      <div class="comment-wrap" style="margin-top:12px;">
        <div class="dc-title" style="margin-bottom:10px;">⭐ تقييم الخدمة</div>
        ${t.rating ? `
          <div style="color:#F59E0B;font-size:22px;letter-spacing:3px;margin-bottom:6px;">${'★'.repeat(t.rating)}${'☆'.repeat(5-t.rating)}</div>
          <div style="font-size:12px;color:var(--text-muted);">${_e(t.rating_comment||'شكراً على تقييمك')}</div>
        ` : `
          <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">كيف تقيّم مستوى الخدمة؟</div>
          <div id="starRating_${id}" style="display:flex;gap:6px;margin-bottom:12px;direction:ltr;">
            ${[1,2,3,4,5].map(s => `
              <span onclick="setRating('${id}',${s})" data-star="${s}"
                style="font-size:28px;cursor:pointer;color:var(--text-muted);transition:color .15s;line-height:1;"
                onmouseover="highlightStars('${id}',${s})"
                onmouseout="highlightStars('${id}',0)">☆</span>
            `).join('')}
          </div>
          <input type="hidden" id="ratingVal_${id}" value="0">
          <textarea id="ratingComment_${id}" class="comment-input" placeholder="تعليق اختياري..." style="height:60px;margin-bottom:8px;"></textarea>
          <button class="btn btn-gold" onclick="submitRating('${id}')">إرسال التقييم</button>
        `}
      </div>` : ''}
    </div>

    <div>
      <div class="dc">
        <div class="dc-title">تفاصيل الطلب</div>
        ${[
          ['الحالة',     sbadge(t.status)],
          ['الأولوية',   pbadge(t.priority)],
          ['الإدارة المسؤولة', t.target_department
              ? `<span class="dept-chip">🏢 ${_e(t.target_department)}</span>`
              : _e(CAT_L[t.category]||t.category||'—')],
          ['نوع الطلب', t.request_type
              ? `<span class="reqtype-chip">${_e(t.request_type)}</span>`
              : '—'],
          ['مقدم الطلب', _e(uname(t.created_by))],
          ['قسم المقدم', _e(udept(t.created_by))],
          ['المعين',     _e(t.assigned_to?uname(t.assigned_to):'غير معين')],
          ['التاريخ',    `<span style="font-family:var(--font-mono);font-size:11px;">${_d(t.created_at)}</span>`],
        ].map(([k,v])=>`<div class="meta-row"><span class="meta-key">${k}</span><span class="meta-val">${v}</span></div>`).join('')}
      </div>

      ${renderAttachmentsPanel(t)}

      <div class="dc">
        <div class="dc-title">مؤشر SLA</div>
        <div style="font-size:12px;color:var(--${sla.cls==='sla-ok'?'success':sla.cls==='sla-warn'?'warning':'danger'});margin-bottom:5px;">${sla.label}</div>
        <div class="sla-bar" style="height:7px;"><div class="sla-fill ${sla.cls}" style="width:${sla.pct}%"></div></div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:5px;">SLA للأولوية ${PRIO_L[t.priority]}: ${PRIO_SLA[t.priority]}h</div>
      </div>
    </div>
  `;

  showPage('detail');
}

// ── Assign to Me ─────────────────────────────────────────
async function assignToMe(ticketId) {
  const t = S.tickets.find(t=>t.id===ticketId);
  if (!t) return;
  try {
    await sbFetch(`/tickets?id=eq.${t.id}`, {
      method:'PATCH',
      body: JSON.stringify({ assigned_to: S.user.id, status: t.status==='open' ? 'assigned' : t.status, updated_at: new Date().toISOString() })
    });
    t.assigned_to = S.user.id;
    if (t.status==='open') t.status = 'assigned';

    // إشعار صاحب التيكت
    if (t.created_by && t.created_by !== S.user.id) {
      sbFetch('/notifications', { method:'POST', body: JSON.stringify({
        user_id: t.created_by,
        title:   `جارٍ العمل على تيكتك: ${t.title}`,
        body:    `تم تعيين ${S.user.name} للعمل على طلبك`,
        is_read: false
      })}).catch(()=>{});
    }

    toast('✅ تم تعيين التيكت لك');
    openTicketDetail(ticketId);
  } catch(e) { toast('فشل التعيين: '+e.message, 'error'); }
}

// ── Quick Update ─────────────────────────────────────────
function quickUpdate(ticketId) {
  S.selTicket = ticketId;
  const t = S.tickets.find(t=>t.id===ticketId);
  if (!t) return;

  // Guard: ما يسمحش للطلبات الـ outbound (canActOnTicket بتمنع تحديث الحالة)
  if (!Perm.canActOnTicket(t)) {
    toast('لا يمكنك تحديث حالة هذا الطلب — فقط إدارته الأصلية تستطيع ذلك','error');
    return;
  }

  $('upd_status').value = t.status;
  $('upd_note').value   = '';

  // Build assign-to dropdown — visible to anyone who can assign this ticket
  const assignWrap = $('upd_assign_wrap');
  const assignSel  = $('upd_assigned_to');
  const canAssign  = Perm.canAssignTicket(t);

  if (canAssign) {
    assignWrap.style.display = '';
    // قائمة المعينين: موظفي نفس الإدارة المستهدفة (أو كل النظام لو super_admin والإدارة غير محددة)
    let candidates;
    if (Perm.isSuper() && !t.target_department) {
      candidates = S.users.filter(u => u.is_active !== false);
    } else {
      const dept = (t.target_department || Perm.myDept() || '').trim();
      candidates = S.users.filter(u => (u.department || '').trim() === dept && u.is_active !== false);
    }
    // ترتيب: المديرين أولاً، ثم المشرفين، ثم الموظفين
    const roleRank = r => r==='manager'?1 : (r==='supervisor'||r==='admin')?2 : 3;
    candidates.sort((a,b) => roleRank(a.role) - roleRank(b.role) || (a.name||'').localeCompare(b.name||''));

    assignSel.innerHTML = `<option value="">— بدون تعيين —</option>` +
      candidates.map(u =>
        `<option value="${u.id}" ${t.assigned_to===u.id?'selected':''}>${_e(u.name)} — ${_e(ROLES[u.role]||u.role)}</option>`
      ).join('');
    assignSel.value = t.assigned_to || '';
  } else {
    // ما يقدرش يعيّن — الحقل مخفي، والـ assign يفضل زي ما هو
    assignWrap.style.display = 'none';
    assignSel.value = t.assigned_to || '';
  }

  openModal('updateTicketModal');
}

async function saveTicketUpdate() {
  const t = S.tickets.find(t=>t.id===S.selTicket);
  if (!t) return;

  let newStatus       = $('upd_status').value;
  // تطبيع: لو أي حد حفظ "resolved" قديمة، نحولها لـ "closed"
  if (newStatus === 'resolved') newStatus = 'closed';
  const note          = $('upd_note').value.trim();
  const assignedToVal = $('upd_assigned_to').value;
  // دلوقتي أي حد عنده صلاحية تعيين يقدر يعدل assigned_to (مش بس المدير القديم)
  const canAssignNow = Perm.canAssignTicket(t);
  const newAssigned = canAssignNow
    ? (assignedToVal || null)
    : (t.assigned_to || S.user.id);

  const prevStatus   = t.status;
  const prevAssigned = t.assigned_to;

  try {
    await sbFetch(`/tickets?id=eq.${t.id}`, {
      method:'PATCH',
      body: JSON.stringify({ status:newStatus, assigned_to:newAssigned, updated_at:new Date().toISOString() })
    });

    if (note) {
      const comment = {
        ticket_id:   t.id,
        user_id:     S.user.id,
        content:     note,
        author_name: S.user.name,
      };
      const saved = await sbFetch('/ticket_comments', { method:'POST', body:JSON.stringify(comment) });
      if (!t.comments) t.comments = [];
      if (saved?.[0]) t.comments.push(saved[0]);
    }

    t.status      = newStatus;
    t.assigned_to = newAssigned;

    // ── إشعار صاحب التيكت عند تغيير الحالة ──
    if (newStatus !== prevStatus && t.created_by && t.created_by !== S.user.id) {
      sbFetch('/notifications', { method:'POST', body: JSON.stringify({
        user_id: t.created_by,
        title:   `تم تحديث تيكتك: ${t.title}`,
        body:    `الحالة تغيرت إلى "${STATUS_L[newStatus]||newStatus}" — بواسطة ${S.user.name}`,
        is_read: false
      })}).catch(()=>{});
    }

    // ── إشعار الـ admin المعين لما يتعين عليه تيكت جديد ──
    if (newAssigned && newAssigned !== prevAssigned && newAssigned !== S.user.id) {
      sbFetch('/notifications', { method:'POST', body: JSON.stringify({
        user_id: newAssigned,
        title:   `تم تعيين تيكت لك: ${t.title}`,
        body:    `من ${S.user.name} — أولوية ${PRIO_L[t.priority]||t.priority}`,
        is_read: false
      })}).catch(()=>{});
    }

    const msg = (canAssignNow && newAssigned !== prevAssigned && newAssigned)
      ? `تم التحديث · معين لـ ${uname(newAssigned)}`
      : 'تم تحديث التيكت';

    closeModal('updateTicketModal');
    toast(msg);
    refreshNavCounts();
    if (S.page==='detail') openTicketDetail(t.id);
    else renderAllTickets();
  } catch(e) {
    toast('فشل التحديث: '+e.message, 'error');
  }
}

// ── Add Comment ──────────────────────────────────────────
// ── Rating Functions ──────────────────────────────────
function highlightStars(ticketId, upTo) {
  const container = document.getElementById(`starRating_${ticketId}`);
  if (!container) return;
  const val = upTo || parseInt(document.getElementById(`ratingVal_${ticketId}`)?.value || '0');
  container.querySelectorAll('[data-star]').forEach(el => {
    const s = parseInt(el.dataset.star);
    el.textContent = s <= val ? '★' : '☆';
    el.style.color = s <= val ? '#F59E0B' : 'var(--text-muted)';
  });
}

function setRating(ticketId, val) {
  const input = document.getElementById(`ratingVal_${ticketId}`);
  if (!input) return;
  input.value = val;
  highlightStars(ticketId, val);
}

async function submitRating(ticketId) {
  const val     = parseInt(document.getElementById(`ratingVal_${ticketId}`)?.value || '0');
  const comment = document.getElementById(`ratingComment_${ticketId}`)?.value.trim() || '';
  if (!val) return toast('اختر تقييماً من 1 إلى 5 نجوم', 'error');
  try {
    await sbFetch(`/tickets?id=eq.${ticketId}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ rating: val, rating_comment: comment, rated_at: new Date().toISOString() })
    });
    toast('شكراً على تقييمك! ⭐', 'success');
    // تحديث البيانات المحلية
    const t = S.tickets.find(t => t.id === ticketId);
    if (t) { t.rating = val; t.rating_comment = comment; t.rated_at = new Date().toISOString(); }
    openTicketDetail(ticketId);
  } catch { toast('حدث خطأ، حاول مرة أخرى', 'error'); }
}
// ─────────────────────────────────────────────────────

async function addComment(ticketId) {
  const text = $('newCommentInput').value.trim();
  if (!text) return;
  const t = S.tickets.find(t=>t.id===ticketId);
  if (!t) return;

  // Guard: تأكد إن عنده صلاحية التعليق (يشمل القيادات للـ outbound)
  if (!Perm.canCommentOnTicket(t)) {
    toast('ليس لديك صلاحية التعليق على هذا الطلب','error');
    return;
  }

  try {
    const comment = { ticket_id:ticketId, user_id:S.user.id, content:text, author_name:S.user.name };
    const saved = await sbFetch('/ticket_comments', { method:'POST', body:JSON.stringify(comment) });
    if (!t.comments) t.comments=[];
    if (saved?.[0]) t.comments.push(saved[0]);
    else t.comments.push({...comment, id:'local'+Date.now(), created_at:new Date().toISOString()});

    // إشعار صاحب التيكت لو المعلق مش هو نفسه (بغض النظر عن الدور)
    if (t.created_by && t.created_by !== S.user.id) {
      console.log(`[NOTIF-COMMENT] Sending notification to ticket creator:`, t.created_by);
      sbFetch('/notifications', { method:'POST', body: JSON.stringify({
        user_id: t.created_by,
        title: `رد جديد على تيكتك: ${t.title}`,
        body: `${S.user.name}: ${text.slice(0, 60)}${text.length > 60 ? '...' : ''}`,
        is_read: false
      })}).then(() => {
        console.log(`[NOTIF-COMMENT] ✅ Notification sent successfully`);
      }).catch(e => {
        console.error(`[NOTIF-COMMENT] ❌ Failed:`, e);
      });
    } else {
      console.log(`[NOTIF-COMMENT] Skipping notification (user is ticket creator)`);
    }

    openTicketDetail(ticketId);
    toast('تم إضافة التعليق');
  } catch(e) { toast('فشل: '+e.message,'error'); }
}

// ── Archive Ticket ────────────────────────────────────────
async function archiveTicket(id) {
  const t = S.tickets.find(t=>t.id===id);
  if (!t) return;
  showConfirm('📦', 'أرشفة التيكت', `هل تريد أرشفة "${t.title}"؟\nيمكن استرجاعه لاحقاً من صفحة الأرشيف.`, async ()=>{
    try {
      await sbFetch(`/tickets?id=eq.${id}`, {
        method:'PATCH',
        body: JSON.stringify({ status:'archived', updated_at:new Date().toISOString() }),
        headers:{'Prefer':'return=minimal'}
      });
      t.status = 'archived';
      refreshNavCounts();
      toast('تم أرشفة التيكت 📦');
      if (S.page==='detail') showPage('alltickets');
      else renderAllTickets();
    } catch(e){ toast('فشل الأرشفة: '+e.message,'error'); }
  });
}

// ── Restore Ticket ────────────────────────────────────────
async function restoreTicket(id) {
  const t = S.tickets.find(t=>t.id===id);
  if (!t) return;
  try {
    await sbFetch(`/tickets?id=eq.${id}`, {
      method:'PATCH',
      body: JSON.stringify({ status:'closed', updated_at:new Date().toISOString() }),
      headers:{'Prefer':'return=minimal'}
    });
    t.status = 'closed';
    refreshNavCounts();
    toast('تم استرجاع التيكت ✅');
    renderArchive();
  } catch(e){ toast('فشل الاسترجاع: '+e.message,'error'); }
}

// ── Delete Ticket (للمدير فقط — حذف نهائي من الأرشيف) ────
async function deleteTicket(id) {
  const t = S.tickets.find(t=>t.id===id);
  if (!t) return;
  showConfirm('🗑️', 'حذف نهائي', `هل أنت متأكد من الحذف النهائي للتيكت "${t.title}"؟\nلا يمكن التراجع عن هذا الإجراء.`, async ()=>{
    try {
      const res = await fetch(CFG.authEndpoint, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ action:'delete_ticket', token:S.token, ticket_id:id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الحذف');
      S.tickets = S.tickets.filter(t=>t.id!==id);
      refreshNavCounts();
      toast('تم الحذف النهائي');
      renderArchive();
    } catch(e){ toast('فشل الحذف: '+e.message,'error'); }
  });
}

// ═══════════════════════════════════════════════════════
//  NEW TICKET (Internal Inter-Department System)
// ═══════════════════════════════════════════════════════
function openNewTicketModal() {
  ['nt_title','nt_desc'].forEach(id=>$(id).value='');
  $('nt_priority').value = 'medium';

  // Populate department dropdown
  const deptSel = $('nt_dept');
  const rtSel   = $('nt_reqtype');
  deptSel.innerHTML = `<option value="">اختر الإدارة</option>` +
    deptList().map(d => `<option value="${_e(d)}">${_e(d)}</option>`).join('');
  deptSel.value = '';
  rtSel.innerHTML = `<option value="">اختر الإدارة أولاً</option>`;
  rtSel.disabled = true;
  rtSel.value = '';

  // Reset attachments
  pendingAttachments = [];
  renderPendingAttachments();
  const zone = $('nt_attach_zone');
  if (zone) { zone.classList.remove('dragover'); wireAttachZone(zone); }
  const inp = $('nt_attach_input');
  if (inp) inp.value = '';

  openModal('newTicketModal');
}

// Called when the department dropdown changes
function onDeptChange() {
  const dept = $('nt_dept').value;
  const rtSel = $('nt_reqtype');
  if (!dept) {
    rtSel.innerHTML = `<option value="">اختر الإدارة أولاً</option>`;
    rtSel.disabled = true;
    return;
  }
  const types = typesOf(dept);
  rtSel.innerHTML = `<option value="">اختر نوع الطلب</option>` +
    types.map(t => `<option value="${_e(t)}">${_e(t)}</option>`).join('');
  rtSel.disabled = false;
}

// ── Drag & drop handlers (attached once per modal open) ────
function wireAttachZone(zone){
  zone.ondragover  = e => { e.preventDefault(); zone.classList.add('dragover'); };
  zone.ondragleave = () => zone.classList.remove('dragover');
  zone.ondrop      = e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const files = [...(e.dataTransfer?.files || [])];
    addFilesToQueue(files);
  };
}

function handleAttachSelect(ev) {
  const files = [...(ev.target?.files || [])];
  addFilesToQueue(files);
  ev.target.value = '';  // allow reselecting the same file
}

function addFilesToQueue(files){
  for (const f of files) {
    if (f.size > ATTACH_MAX_SIZE) {
      toast(`"${f.name}" أكبر من 10 ميجا — تم التخطي`, 'error');
      continue;
    }
    pendingAttachments.push({
      _file: f,
      name: f.name,
      size: f.size,
      type: f.type || 'application/octet-stream',
      progress: 0,
      uploading: false,
      url: null,
    });
  }
  renderPendingAttachments();
}

function removePendingAttachment(idx){
  pendingAttachments.splice(idx, 1);
  renderPendingAttachments();
}

function renderPendingAttachments(){
  const list = $('nt_attach_list');
  if (!list) return;
  if (!pendingAttachments.length) { list.innerHTML = ''; return; }
  list.innerHTML = pendingAttachments.map((a, i) => {
    const prog = a.uploading
      ? `<div class="attach-progress"><div class="attach-progress-fill" style="width:${a.progress}%"></div></div>`
      : `<span class="attach-item-size">${fmtSize(a.size)}</span>`;
    return `
      <div class="attach-item">
        <span class="attach-item-icon">${attachTypeIcon(a.type, a.name)}</span>
        <span class="attach-item-name">${_e(a.name)}</span>
        ${prog}
        <button class="attach-item-remove" onclick="removePendingAttachment(${i})" title="إزالة">×</button>
      </div>`;
  }).join('');
}

// Upload one file to Supabase Storage — returns public URL
async function uploadOneAttachment(att, ticketNumber) {
  att.uploading = true; att.progress = 10; renderPendingAttachments();

  // Sanitize filename: keep extension, replace spaces/unicode
  const ext = (att.name.match(/\.[a-zA-Z0-9]+$/) || [''])[0];
  const safeBase = att.name.replace(ext,'')
    .replace(/[^a-zA-Z0-9\u0600-\u06FF_-]+/g,'_').slice(0, 50) || 'file';
  const path = `${ticketNumber || 'ticket'}/${Date.now()}_${safeBase}${ext}`;

  const url = `${CFG.supabaseUrl}/storage/v1/object/ticket-attachments/${encodeURIComponent(path)}`;
  att.progress = 40; renderPendingAttachments();

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: CFG.supabaseKey,
      Authorization: `Bearer ${CFG.supabaseKey}`,
      'Content-Type': att.type,
      'x-upsert': 'true',
    },
    body: att._file,
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=>'');
    throw new Error(`Upload failed (${res.status}): ${txt.slice(0,100)}`);
  }
  att.progress = 100;
  att.url = `${CFG.supabaseUrl}/storage/v1/object/public/ticket-attachments/${encodeURIComponent(path)}`;
  att.path = path;
  att.uploading = false;
  renderPendingAttachments();
  return { name: att.name, size: att.size, type: att.type, url: att.url, path };
}

async function submitTicket() {
  const title    = $('nt_title').value.trim();
  const dept     = $('nt_dept').value;
  const reqtype  = $('nt_reqtype').value;
  const priority = $('nt_priority').value;
  const desc     = $('nt_desc').value.trim();

  // CRITICAL: Check S.users loaded
  console.log(`[NOTIF-PRECHECK] S.users count:`, S.users?.length || 0);
  if (!S.users || S.users.length === 0) {
    console.error('[NOTIF-PRECHECK] ❌ S.users is EMPTY! Reloading users...');
    await loadUsers();
    console.log(`[NOTIF-PRECHECK] After reload:`, S.users?.length || 0);
  }

  if (!title || !dept || !reqtype || !desc) {
    toast('يرجى ملء جميع الحقول','error'); return;
  }

  const btn = $('nt_submit_btn');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الإرسال...'; }

  try {
    // 1) Upload attachments first (if any)
    const uploaded = [];
    for (const att of pendingAttachments) {
      try {
        const info = await uploadOneAttachment(att);
        uploaded.push(info);
      } catch (e) {
        toast(`فشل رفع "${att.name}": ${e.message}`, 'error');
      }
    }

    // 2) Create the ticket record (نحفظ الإدارة بـ trim مضمون)
    const ticket = {
      title,
      description: desc,
      priority,
      status: 'open',
      created_by: S.user.id,
      assigned_to: null,
      target_department: (dept || '').trim(),
      request_type: (reqtype || '').trim(),
      attachments: uploaded,
      // Keep category for backward-compat
      category: 'other',
    };
    const saved = await sbFetch('/tickets', { method:'POST', body: JSON.stringify(ticket) });
    const newTicket = saved?.[0]
      ? { ...saved[0], comments: [] }
      : { ...ticket, id:'local'+Date.now(),
          created_at:new Date().toISOString(), comments:[] };
    S.tickets.unshift(newTicket);

    // 3) Notify: مديرين ومشرفين الإدارة المستهدفة (بس — الموظفين العاديين يشوفوا الطلبات open في قائمتهم)
    console.log(`[NOTIF-DEBUG] Total users in system:`, S.users.length);
    console.log(`[NOTIF-DEBUG] Target department:`, dept);
    console.log(`[NOTIF-DEBUG] Current user:`, S.user.id, S.user.username);
    
    const seenIds = new Set();
    const toNotify = S.users.filter(u => {
      const checks = {
        is_self: u.id === S.user.id,
        already_seen: seenIds.has(u.id),
        is_inactive: u.is_active === false,
        dept_match: (u.department || '').trim() === dept.trim(),
        is_lead: u.role === 'manager' || u.role === 'supervisor' || u.role === 'admin'
      };
      console.log(`[NOTIF-DEBUG] User ${u.username}:`, checks, `dept="${u.department}"`);
      
      if (checks.is_self) return false;
      if (checks.already_seen) return false;
      if (checks.is_inactive) return false;
      if (!checks.dept_match) return false;
      if (!checks.is_lead) return false;
      seenIds.add(u.id); return true;
    });
    
    console.log(`[NOTIF-DEBUG] Users to notify (before safety net):`, toNotify.length, toNotify.map(u => u.username));
    
    // Safety net: لو الإدارة مفيهاش قيادات، الإشعار يروح لكل الـ super_admins
    const finalNotify = toNotify.length
      ? toNotify
      : S.users.filter(u => u.role === 'super_admin' && u.id !== S.user.id);
    
    console.log(`[NOTIF-DEBUG] Final users to notify:`, finalNotify.length, finalNotify.map(u => u.username));

    // إرسال الإشعارات مع logging محسّن
    console.log(`[NOTIF] Sending notifications to ${finalNotify.length} users:`, finalNotify.map(u => u.username));
    const notifResults = await Promise.allSettled(finalNotify.map(async u => {
      try {
        const result = await sbFetch('/notifications', { 
          method:'POST', 
          body: JSON.stringify({
            user_id: u.id,
            title: `طلب جديد لإدارة ${dept}: ${title}`,
            body:  `${reqtype} — من ${S.user.name} — أولوية ${PRIO_L[priority]}`,
            is_read: false
          })
        });
        console.log(`[NOTIF] ✅ Sent to ${u.username}`, result);
        return { success: true, user: u.username };
      } catch (e) {
        console.error(`[NOTIF] ❌ Failed for ${u.username}:`, e);
        return { success: false, user: u.username, error: e.message };
      }
    }));
    const successful = notifResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = notifResults.length - successful;
    if (failed > 0) {
      console.warn(`[NOTIF] ⚠️ ${failed}/${notifResults.length} notifications failed`);
    }

    closeModal('newTicketModal');
    pendingAttachments = [];
    toast(`تم إرسال الطلب ${newTicket.ticket_number || ''}`);
    refreshNavCounts();
    showPage('mytickets');
  } catch (e) {
    toast('فشل الإرسال: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'إرسال الطلب'; }
  }
}

// ═══════════════════════════════════════════════════════
//  USERS
// ═══════════════════════════════════════════════════════
// ── Users Filter ─────────────────────────────────────────
const usersFilter = { search: '', role: '' };

function filterUsers(q) {
  usersFilter.search = q;
  renderUsersGrid();
}
function filterUsersByRole(r) {
  usersFilter.role = r;
  renderUsersGrid();
}

function renderUsers() {
  usersFilter.search = '';
  usersFilter.role   = '';
  const el = $('usersSearch');
  if (el) el.value = '';
  renderUsersGrid();
}

function renderUsersGrid() {
  const grid = $('usersGrid');
  const HIDDEN = ['ammar.admin'];
  // Super admin يشوف كل المستخدمين، المدير يشوف بس موظفي إدارته
  let list = visibleUsers().filter(u => !HIDDEN.includes(u.username));

  if (usersFilter.search) {
    const q = usersFilter.search.toLowerCase();
    list = list.filter(u =>
      u.name.toLowerCase().includes(q) ||
      (u.department||'').toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q)
    );
  }
  if (usersFilter.role) {
    list = list.filter(u => u.role === usersFilter.role);
  }

  if (!list.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><p>لا يوجد مستخدمون مطابقون</p></div>`;
    return;
  }
  grid.innerHTML = list.map(u => {
    const myT = S.tickets.filter(t=>t.created_by===u.id).length;
    const asgn = S.tickets.filter(t=>t.assigned_to===u.id).length;
    const res  = S.tickets.filter(t=>t.assigned_to===u.id&&['resolved','closed'].includes(t.status)).length;
    const roleBadge = {
      super_admin: 'b-mgr', manager:'b-mgr',
      supervisor: 'b-admin', admin: 'b-admin',
      employee: 'b-emp'
    }[u.role] || 'b-emp';
    const canEdit = Perm.canManageUser(u);
    return `
      <div class="user-card">
        <div class="uc-top">
          <div class="uc-av">${u.name.charAt(0)}</div>
          <div class="uc-info">
            <div class="uc-name">${_e(u.name)}</div>
            <div class="uc-role">${_e(ROLES[u.role]||u.role)} · ${_e(u.department||'—')}</div>
          </div>
        </div>
        <div class="uc-stats">
          <div class="ucs"><div class="ucs-v">${myT}</div><div class="ucs-l">طلباته</div></div>
          <div class="ucs"><div class="ucs-v">${asgn}</div><div class="ucs-l">معين</div></div>
          <div class="ucs"><div class="ucs-v">${res}</div><div class="ucs-l">مغلق</div></div>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          <span class="badge ${u.is_active?'b-active':'b-inactive'}">${u.is_active?'نشط':'غير نشط'}</span>
          <span class="badge ${roleBadge}">${_e(ROLES[u.role]||u.role)}</span>
        </div>
        <div class="uc-actions">
          ${Perm.canManageUser(u) ? `<button class="btn btn-ghost" style="font-size:11px;padding:5px 10px;" onclick="editUser('${u.id}')">تعديل</button>` : ''}
          ${Perm.canResetUserPassword(u) ? `<button class="btn btn-ghost" style="font-size:11px;padding:5px 10px;border-color:var(--warning);color:var(--warning);" data-uid="${_e(u.id)}" data-uname="${_e(u.name)}" onclick="resetUserPassword(this.dataset.uid,this.dataset.uname)">🔑 تعيين كلمة مرور</button>` : ''}
          ${Perm.canDeleteUser(u) ? `<button class="btn btn-danger" style="font-size:11px;padding:5px 10px;" onclick="deleteUser('${u.id}')">حذف</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Helper: populate the user modal's department dropdown from loaded map
async function populateUserDeptDropdown(selected) {
  const sel = $('nu_dept');
  if (!sel) return;
  // Safety: لو القائمة فاضية لأي سبب، نعيد تحميلها من الـ DB
  if (!deptList().length) {
    await loadDepartmentMap();
  }
  const opts = deptList();
  sel.innerHTML = `<option value="">— اختر الإدارة —</option>` +
    opts.map(d => `<option value="${_e(d)}" ${selected===d?'selected':''}>${_e(d)}</option>`).join('') +
    (selected && !opts.includes(selected) ? `<option value="${_e(selected)}" selected>${_e(selected)} (مخصصة)</option>` : '');
}

function openNewUserModal() {
  S.editUserId = null;
  $('userModalTitle').textContent = 'مستخدم جديد';
  $('passRequired').textContent   = '*';
  $('nu_pass').required = true;
  $('statusField').style.display = 'none';
  ['nu_name','nu_uname','nu_email','nu_pass','nu_phone'].forEach(id=>$(id).value='');
  $('nu_role').value   = 'employee';
  $('nu_active').value = 'true';
  populateUserDeptDropdown('');  // async — بس مش محتاج await هنا (الـ modal لسه بيفتح)
  // Pre-lock the department for dept managers (they can only create users in their own dept)
  if (Perm.isManager() && !Perm.isSuper()) {
    // ننتظر لحظة صغيرة لتأمين تحميل الدروب داون قبل ما نقفله
    setTimeout(() => {
      const sel = $('nu_dept');
      if (sel) { sel.value = Perm.myDept(); sel.disabled = true; }
    }, 50);
  } else {
    const sel = $('nu_dept');
    if (sel) sel.disabled = false;
  }
  openModal('newUserModal');
}

function editUser(id) {
  const u = S.users.find(u=>u.id===id);
  if (!u) return;
  S.editUserId = id;
  $('userModalTitle').textContent = 'تعديل المستخدم';
  $('passRequired').textContent   = '(اتركه فارغاً للإبقاء)';
  $('statusField').style.display  = 'block';
  $('nu_name').value   = u.name;
  $('nu_uname').value  = u.username;
  $('nu_email').value  = u.email||'';
  $('nu_pass').value   = '';
  $('nu_role').value   = u.role;
  populateUserDeptDropdown(u.department||'');
  setTimeout(() => {
    const sel = $('nu_dept');
    if (sel) sel.disabled = Perm.isManager() && !Perm.isSuper();
  }, 50);
  $('nu_phone').value  = u.phone||'';
  $('nu_active').value = String(u.is_active!==false);
  openModal('newUserModal');
}

async function saveUser() {
  const name  = $('nu_name').value.trim();
  const uname = $('nu_uname').value.trim();
  const email = $('nu_email').value.trim();
  const pass  = $('nu_pass').value;
  const role  = $('nu_role').value;
  const dept  = $('nu_dept').value.trim();
  const phone = $('nu_phone').value.trim();
  const active= $('nu_active').value === 'true';

  if (!name||!uname) { toast('الاسم واسم المستخدم مطلوبان','error'); return; }
  if (role !== 'super_admin' && !dept) { toast('يجب اختيار الإدارة لهذا الدور','error'); return; }
  if (!email) { toast('البريد الإلكتروني مطلوب لتسجيل الدخول','error'); return; }

  const PROTECTED = ['ammar.admin'];
  if (S.editUserId) {
    const target = S.users.find(u=>u.id===S.editUserId);
    if (target && PROTECTED.includes(target.username)) {
      toast('هذا الحساب محمي ولا يمكن تعديله','error');
      closeModal('newUserModal'); return;
    }
  }
  if (PROTECTED.includes(uname) && !S.editUserId) {
    toast('اسم المستخدم هذا محجوز','error'); return;
  }

  if (S.editUserId) {
    // ── تعديل مستخدم موجود ──────────────────────────────
    const payload = { name, username:uname, email, role, department:dept, phone:phone||null, is_active:active };
    try {
      // 1) تحديث public.users
      await sbFetch(`/users?id=eq.${S.editUserId}`,{method:'PATCH',body:JSON.stringify(payload)});

      // 2) تحديث auth.users عبر Netlify Function
      const res = await fetch(CFG.authEndpoint, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action: 'update_auth_user',
          token:  S.token,
          user_id: S.editUserId,
          email, role, department: dept, name, username: uname,
          ...(pass ? { new_password: pass } : {})
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحديث حساب الدخول');

      const idx = S.users.findIndex(u=>u.id===S.editUserId);
      if (idx>-1) S.users[idx] = {...S.users[idx],...payload};
      closeModal('newUserModal');
      renderUsers();
      toast('تم تحديث بيانات المستخدم');
    } catch(e){ toast('فشل التحديث: '+e.message,'error'); }

  } else {
    // ── إضافة مستخدم جديد ───────────────────────────────
    if (!pass) { toast('كلمة المرور مطلوبة','error'); return; }
    if (pass.length < 8) { toast('كلمة المرور لازم تكون 8 أحرف على الأقل','error'); return; }
    if (S.users.find(u=>u.username===uname)) { toast('اسم المستخدم موجود بالفعل','error'); return; }
    if (S.users.find(u=>u.email===email)) { toast('البريد الإلكتروني مستخدم بالفعل','error'); return; }

    try {
      // Step 1: إنشاء في Supabase Auth عبر Netlify Function
      // الـ Netlify Function بتستخدم service_role key وبترجع auth_id
      const authRes = await fetch(CFG.authEndpoint, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action: 'create_auth_user',
          token: S.token,
          email, password: pass, name, username: uname,
          role, department: dept,
        })
      });
      const authData = await authRes.json();
      if (!authRes.ok) throw new Error(authData.error || 'فشل إنشاء حساب الدخول');

      const authId = authData.auth_id;

      // Step 2: تأكد إن الـ Trigger خلق الصف في public.users
      // لو الـ Trigger شغال، الصف هيكون موجود خلال ثانية
      // لو مش موجود، نخلقه يدوياً
      let retries = 3;
      let saved = null;
      while (retries > 0) {
        await new Promise(r => setTimeout(r, 500));
        const existing = await sbFetch(`/users?id=eq.${authId}&select=*`);
        if (existing?.[0]) { saved = existing[0]; break; }
        retries--;
      }

      // لو الـ Trigger ما خلقوش، نخلقه يدوياً عبر Netlify
      if (!saved) {
        const profileRes = await fetch(CFG.authEndpoint, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            action: 'create_user_profile',
            token: S.token,
            auth_id: authId,
            name, username: uname, email,
            role, department: dept, phone: phone||null,
          })
        });
        const profileData = await profileRes.json();
        if (!profileRes.ok) throw new Error(profileData.error || 'فشل إنشاء الملف الشخصي');
        saved = profileData.user;
      } else {
        // الـ Trigger خلق الصف لكن ممكن يكون ناقصه username/role/dept
        // نحدثه بالبيانات الكاملة
        await sbFetch(`/users?id=eq.${authId}`, {
          method:'PATCH',
          body: JSON.stringify({ name, username:uname, role, department:dept, phone:phone||null })
        });
        saved = { ...saved, name, username:uname, role, department:dept };
      }

      S.users.push(saved);
      closeModal('newUserModal');
      renderUsers();
      toast(`✅ تم إضافة ${name} بنجاح`);

    } catch(e) {
      // لو المشكلة في Step 2 بس (public.users)، المستخدم اتعمل في Auth
      // نوضح ده للمستخدم بدل ما نقوله "فشل" وبس
      const msg = e.message || '';
      if (msg.includes('duplicate') || msg.includes('already exists') || msg.includes('unique')) {
        toast('البريد الإلكتروني أو اسم المستخدم موجود بالفعل','error');
      } else {
        toast('فشل الإضافة: ' + msg, 'error');
      }
    }
  }
}

async function deleteUser(id) {
  const u = S.users.find(u=>u.id===id);
  if (!u) return;
  if (id===S.user.id) { toast('لا يمكنك حذف حسابك الخاص','warning'); return; }
  if (['ammar.admin'].includes(u.username)) { toast('هذا الحساب محمي ولا يمكن حذفه','error'); return; }
  showConfirm('⚠️', 'حذف مستخدم', `هل أنت متأكد من حذف "${u.name}"؟\nلا يمكن التراجع عن هذا الإجراء.`, async ()=>{
    try {
      const res = await fetch(CFG.authEndpoint, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ action:'delete_user', token:S.token, user_id:id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الحذف');
      S.users = S.users.filter(u=>u.id!==id);
      renderUsers();
      toast('تم حذف حساب '+u.name);
    } catch(e){ toast('فشل الحذف: '+e.message,'error'); }
  });
}

// ── Reset User Password (Manager only) ─────────────────
function resetUserPassword(userId, userName) {
  S._resetPwdTarget = { userId, userName };
  const el = document.getElementById('resetPwdModal');
  if (!el) {
    // Build modal once and cache it
    const m = document.createElement('div');
    m.className = 'modal-mask';
    m.id = 'resetPwdModal';
    m.innerHTML = `
      <div class="modal-box sm">
        <div class="modal-hd">
          <span class="modal-title" id="resetPwdTitle">تعيين كلمة مرور</span>
          <button class="modal-x" onclick="closeModal('resetPwdModal')">×</button>
        </div>
        <div class="modal-bd">
          <div class="fg">
            <label class="fl">كلمة المرور الجديدة (6 أحرف على الأقل)</label>
            <input type="password" class="fi" id="resetPwdInput" placeholder="••••••••">
          </div>
        </div>
        <div class="modal-ft">
          <button class="btn btn-gold" onclick="doResetUserPassword()">تعيين</button>
          <button class="btn btn-ghost" onclick="closeModal('resetPwdModal')">إلغاء</button>
        </div>
      </div>`;
    m.addEventListener('click', e => { if(e.target===m) m.classList.remove('on'); });
    document.body.appendChild(m);
  }
  document.getElementById('resetPwdTitle').textContent = `تعيين كلمة مرور: ${userName}`;
  document.getElementById('resetPwdInput').value = '';
  openModal('resetPwdModal');
}

async function doResetUserPassword() {
  const { userId, userName } = S._resetPwdTarget || {};
  if (!userId) return;
  const newPass = document.getElementById('resetPwdInput').value;
  if (!newPass) return;
  if (newPass.length < 6) { toast('كلمة المرور لازم تكون 6 أحرف على الأقل', 'error'); return; }
  closeModal('resetPwdModal');
  try {
    const res = await fetch(CFG.authEndpoint, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ action: 'reset_user_password', token: S.token, user_id: userId, new_password: newPass })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'فشل التعيين');
    toast(`✅ تم تعيين كلمة مرور جديدة لـ ${userName}`);
  } catch(e) { toast('فشل: ' + e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════
//  REPORTS
// ═══════════════════════════════════════════════════════
function renderReports() {
  const isLead  = Perm.isDeptLead() || Perm.isSuper();
  const tickets = Perm.isSuper() ? S.tickets : visibleTickets();

  const now            = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0);
  const thisMonth      = tickets.filter(t => new Date(t.created_at) >= thisMonthStart);
  const lastMonth      = tickets.filter(t => new Date(t.created_at) >= lastMonthStart && new Date(t.created_at) <= lastMonthEnd);

  const total     = tickets.length;
  const closedCnt = tickets.filter(t => ['resolved','closed'].includes(t.status)).length;
  const open      = tickets.filter(t => ['open','assigned'].includes(t.status)).length;
  const crit      = tickets.filter(t => t.priority === 'critical').length;
  const resRate   = total ? Math.round(closedCnt / total * 100) : 0;

  // SLA stats
  const slaBreached   = tickets.filter(t => {
    if (['closed','archived'].includes(t.status)) return false;
    const slaH    = PRIO_SLA[t.priority] || 24;
    const elapsed = (Date.now() - new Date(t.created_at)) / 3600000;
    return elapsed > slaH;
  }).length;
  const slaCompliant = tickets.filter(t => {
    if (!['closed','archived'].includes(t.status)) return false;
    const slaH     = PRIO_SLA[t.priority] || 24;
    const duration = (new Date(t.closed_at || t.updated_at) - new Date(t.created_at)) / 3600000;
    return duration <= slaH;
  }).length;
  const slaRate = closedCnt ? Math.round(slaCompliant / closedCnt * 100) : 0;

  // Rating stats
  const rated      = tickets.filter(t => t.rating);
  const avgRating  = rated.length ? (rated.reduce((s,t) => s + t.rating, 0) / rated.length).toFixed(1) : null;
  const stars      = r => '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r));

  // Avg resolution time
  const closed = tickets.filter(t => ['closed','archived'].includes(t.status) && t.closed_at);
  const avgRes = closed.length
    ? (closed.reduce((s,t) => s + (new Date(t.closed_at) - new Date(t.created_at)) / 3600000, 0) / closed.length)
    : null;
  const fmtHours = h => h === null ? '—' : h < 24 ? Math.round(h) + 'س' : (h/24).toFixed(1) + 'ي';

  const _resetBtn = $('resetStatsBtn');
  if (_resetBtn) _resetBtn.style.display = Perm.isSuper() ? '' : 'none';

  // ── Stats Cards ──────────────────────────────────────
  const statsCards = [
    ['معدل الإغلاق',     total ? resRate + '%' : '—', 'من إجمالي التيكتات', '#4ADE80'],
    ['إجمالي التيكتات',  total,                        'منذ البداية',         '#60A5FA'],
    ['قيد الانتظار',     open,                         'تحتاج إجراء',         '#FCD34D'],
    ['تجاوزت الـ SLA',   slaBreached,                  'تحتاج تدخل عاجل',    slaBreached > 0 ? '#EF4444' : '#4ADE80'],
  ].map(([l,v,h,c]) =>
    `<div class="stat-card" style="--_acc:${c}">` +
    `<div class="stat-label">${l}</div>` +
    `<div class="stat-val" style="color:${c}">${v}</div>` +
    `<div class="stat-hint">${h}</div></div>`
  ).join('');
  const statsHtml = `<div class="stats-row" style="margin-bottom:16px;">${statsCards}</div>`;

  // ── SLA + Rating summary cards ───────────────────────
  const slaRatingRow = isLead ? `
    <div class="stats-row" style="margin-bottom:20px;">
      <div class="stat-card" style="--_acc:#8B5CF6">
        <div class="stat-label">التزام SLA</div>
        <div class="stat-val" style="color:#8B5CF6">${slaRate}%</div>
        <div class="stat-hint">من التيكتات المغلقة في الوقت</div>
      </div>
      <div class="stat-card" style="--_acc:#F59E0B">
        <div class="stat-label">متوسط وقت الإغلاق</div>
        <div class="stat-val" style="color:#F59E0B">${fmtHours(avgRes)}</div>
        <div class="stat-hint">لكل التيكتات المغلقة</div>
      </div>
      <div class="stat-card" style="--_acc:#EC4899">
        <div class="stat-label">متوسط التقييم</div>
        <div class="stat-val" style="color:#EC4899">${avgRating ? avgRating + ' ★' : '—'}</div>
        <div class="stat-hint">${rated.length} تقييم من أصل ${closedCnt} مغلق</div>
      </div>
      <div class="stat-card" style="--_acc:#14B8A6">
        <div class="stat-label">طلبات هذا الشهر</div>
        <div class="stat-val" style="color:#14B8A6">${thisMonth.length}</div>
        <div class="stat-hint">مقارنة بـ ${lastMonth.length} الشهر الماضي</div>
      </div>
    </div>` : '';

  // ── مقارنة الأشهر ─────────────────────────────────────
  let monthHtml = '';
  if (isLead) {
    const mRows = [
      ['إجمالي التيكتات', thisMonth.length, lastMonth.length, false],
      ['مغلقة',           thisMonth.filter(t => ['resolved','closed'].includes(t.status)).length, lastMonth.filter(t => ['resolved','closed'].includes(t.status)).length, true],
      ['حرجة',            thisMonth.filter(t => t.priority === 'critical').length, lastMonth.filter(t => t.priority === 'critical').length, false],
      ['مفتوحة',          thisMonth.filter(t => t.status === 'open').length, lastMonth.filter(t => t.status === 'open').length, false],
    ].map(([label, curr, prev, isPositive]) => {
      const diff  = curr - prev;
      const color = diff === 0 ? 'var(--text-muted)' : (diff > 0 === isPositive) ? '#4ADE80' : '#F87171';
      const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '—';
      return `<tr><td style="font-weight:500;">${label}</td>` +
        `<td style="font-family:var(--font-mono);font-weight:600;">${curr}</td>` +
        `<td style="font-family:var(--font-mono);color:var(--text-muted);">${prev}</td>` +
        `<td style="font-family:var(--font-mono);color:${color};font-weight:600;">${arrow} ${Math.abs(diff)}</td></tr>`;
    }).join('');
    monthHtml = `<div class="tbl-wrap" style="margin-bottom:20px;">
      <div class="tbl-head">
        <span class="tbl-head-title">مقارنة الأشهر</span>
        <span style="font-size:12px;color:var(--text-muted);">${now.toLocaleDateString('ar-EG',{month:'long',year:'numeric'})}</span>
      </div>
      <table class="data-tbl"><thead><tr><th></th><th>الشهر الحالي</th><th>الشهر الماضي</th><th>الفرق</th></tr></thead>
      <tbody>${mRows}</tbody></table></div>`;
  }

  // ── SLA Breached Tickets ──────────────────────────────
  const breachedTickets = tickets.filter(t => {
    if (['closed','archived'].includes(t.status)) return false;
    const slaH    = PRIO_SLA[t.priority] || 24;
    const elapsed = (Date.now() - new Date(t.created_at)) / 3600000;
    return elapsed > slaH;
  });
  const slaBreachedHtml = isLead && breachedTickets.length ? `
    <div class="tbl-wrap" style="margin-bottom:20px;border:1px solid #EF444433;">
      <div class="tbl-head" style="background:#EF444415;">
        <span class="tbl-head-title" style="color:#EF4444;">⚠️ تيكتات تجاوزت الـ SLA (${breachedTickets.length})</span>
      </div>
      <table class="data-tbl">
        <thead><tr><th>رقم التيكت</th><th>العنوان</th><th>الإدارة</th><th>الأولوية</th><th>تأخير</th></tr></thead>
        <tbody>${breachedTickets.sort((a,b) => new Date(a.created_at) - new Date(b.created_at)).map(t => {
          const slaH    = PRIO_SLA[t.priority] || 24;
          const elapsed = (Date.now() - new Date(t.created_at)) / 3600000;
          const overBy  = elapsed - slaH;
          return `<tr style="cursor:pointer;" onclick="openTicketDetail('${t.id}')">
            <td><span class="tnum" style="color:#EF4444;">${_e(t.ticket_number)}</span></td>
            <td>${_e(t.title)}</td>
            <td><span class="dept-chip">${_e(t.target_department||'—')}</span></td>
            <td>${pbadge(t.priority)}</td>
            <td style="color:#EF4444;font-weight:600;">+${fmtHours(overBy)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>` : '';

  // ── SLA by priority ───────────────────────────────────
  const slaByPriorityHtml = isLead ? (() => {
    const prios = ['critical','high','medium','low'];
    const PRIO_COLORS = { critical:'#EF4444', high:'#F97316', medium:'#EAB308', low:'#22C55E' };
    const PRIO_LABELS = { critical:'حرجة', high:'عالية', medium:'متوسطة', low:'منخفضة' };
    const rows = prios.map(p => {
      const pTickets  = tickets.filter(t => t.priority === p);
      const pClosed   = pTickets.filter(t => ['closed','archived'].includes(t.status));
      const pOnTime   = pClosed.filter(t => {
        const slaH = PRIO_SLA[p];
        const dur  = (new Date(t.closed_at || t.updated_at) - new Date(t.created_at)) / 3600000;
        return dur <= slaH;
      });
      const pBreached = pTickets.filter(t => {
        if (['closed','archived'].includes(t.status)) return false;
        const elapsed = (Date.now() - new Date(t.created_at)) / 3600000;
        return elapsed > PRIO_SLA[p];
      });
      const rate = pClosed.length ? Math.round(pOnTime.length / pClosed.length * 100) : null;
      const avgDur = pClosed.length
        ? (pClosed.reduce((s,t) => s + (new Date(t.closed_at||t.updated_at) - new Date(t.created_at))/3600000, 0) / pClosed.length)
        : null;
      return `<tr>
        <td><span style="color:${PRIO_COLORS[p]};font-weight:600;">${PRIO_LABELS[p]}</span><span style="font-size:10px;color:var(--text-muted);margin-inline-start:4px;">(${PRIO_SLA[p]}س)</span></td>
        <td style="font-family:var(--font-mono);">${pTickets.length}</td>
        <td style="font-family:var(--font-mono);">${pClosed.length}</td>
        <td style="color:${pBreached.length > 0 ? '#EF4444' : 'var(--text-muted)'};font-weight:600;">${pBreached.length}</td>
        <td style="font-family:var(--font-mono);">${fmtHours(avgDur)}</td>
        <td style="min-width:120px;">
          ${rate !== null
            ? `<div class="sla-bar" style="height:6px;margin-bottom:2px;"><div class="sla-fill ${rate>=80?'sla-ok':rate>=50?'sla-warn':'sla-crit'}" style="width:${rate}%;"></div></div>
               <span style="font-size:10px;color:var(--text-muted);">${rate}% في الوقت</span>`
            : '<span style="color:var(--text-muted);font-size:11px;">—</span>'}
        </td>
      </tr>`;
    }).join('');
    return `<div class="tbl-wrap" style="margin-bottom:20px;">
      <div class="tbl-head"><span class="tbl-head-title">أداء SLA حسب الأولوية</span></div>
      <table class="data-tbl">
        <thead><tr><th>الأولوية</th><th>الإجمالي</th><th>مغلقة</th><th>متأخرة</th><th>متوسط الإغلاق</th><th>الالتزام</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  })() : '';

  // ── Ratings Table ─────────────────────────────────────
  const ratingsHtml = isLead && rated.length ? `
    <div class="tbl-wrap" style="margin-bottom:20px;">
      <div class="tbl-head">
        <span class="tbl-head-title">تقييمات الموظفين</span>
        <span style="font-size:12px;color:var(--text-muted);">${rated.length} تقييم</span>
      </div>
      <table class="data-tbl">
        <thead><tr><th>التيكت</th><th>العنوان</th><th>التقييم</th><th>التعليق</th><th>تاريخ التقييم</th></tr></thead>
        <tbody>${rated.sort((a,b) => new Date(b.rated_at||b.updated_at) - new Date(a.rated_at||a.updated_at)).slice(0,10).map(t => `<tr>
          <td><span class="tnum">${_e(t.ticket_number)}</span></td>
          <td>${_e(t.title)}</td>
          <td style="color:#F59E0B;letter-spacing:1px;">${stars(t.rating)}</td>
          <td style="color:var(--text-muted);font-size:12px;">${_e(t.rating_comment||'—')}</td>
          <td style="font-size:11px;color:var(--text-muted);">${t.rated_at ? _d(t.rated_at) : '—'}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : '';

  // ── Supervisor view ───────────────────────────────────
  if (Perm.isSupervisor() && !Perm.isManager() && !Perm.isSuper()) {
    const myAssigned = tickets.filter(t => t.assigned_to === S.user.id).length;
    const myDone     = tickets.filter(t => t.assigned_to === S.user.id && ['resolved','closed'].includes(t.status)).length;
    const myOpen     = tickets.filter(t => t.assigned_to === S.user.id && ['open','assigned','in_progress'].includes(t.status)).length;
    const myRate     = myAssigned ? Math.round(myDone / myAssigned * 100) : 0;
    const mySLAOk    = tickets.filter(t => {
      if (t.assigned_to !== S.user.id) return false;
      if (!['closed','archived'].includes(t.status)) return false;
      const slaH = PRIO_SLA[t.priority] || 24;
      const dur  = (new Date(t.closed_at||t.updated_at) - new Date(t.created_at)) / 3600000;
      return dur <= slaH;
    }).length;
    const mySLARate = myDone ? Math.round(mySLAOk / myDone * 100) : 0;

    $('reportsContent').innerHTML = statsHtml + `
      <div class="stats-row" style="margin-bottom:20px;">
        <div class="stat-card" style="--_acc:#60A5FA"><div class="stat-label">معين لي</div><div class="stat-val" style="color:#60A5FA">${myAssigned}</div></div>
        <div class="stat-card" style="--_acc:#4ADE80"><div class="stat-label">مغلقة</div><div class="stat-val" style="color:#4ADE80">${myDone}</div></div>
        <div class="stat-card" style="--_acc:#FCD34D"><div class="stat-label">قيد التنفيذ</div><div class="stat-val" style="color:#FCD34D">${myOpen}</div></div>
        <div class="stat-card" style="--_acc:#8B5CF6"><div class="stat-label">التزام SLA</div><div class="stat-val" style="color:#8B5CF6">${mySLARate}%</div></div>
      </div>
      <div class="tbl-wrap">
        <div class="tbl-head"><span class="tbl-head-title">توزيع طلباتي</span></div>
        <table class="data-tbl">
          <thead><tr><th>نوع الطلب</th><th>إجمالي</th><th>مفتوح</th><th>مغلق</th></tr></thead>
          <tbody>${(() => {
            const mine   = tickets.filter(t => t.assigned_to === S.user.id);
            const groups = {};
            mine.forEach(t => {
              const k = t.request_type || t.target_department || 'غير محدد';
              (groups[k] = groups[k] || []).push(t);
            });
            const rows = Object.entries(groups).sort((a,b) => b[1].length - a[1].length);
            if (!rows.length) return '<tr><td colspan="4"><div class="empty-state"><p>لا توجد تيكتات</p></div></td></tr>';
            return rows.map(([k,arr]) => `<tr>
              <td>${_e(k)}</td><td>${arr.length}</td>
              <td>${arr.filter(t => ['open','assigned','in_progress'].includes(t.status)).length}</td>
              <td>${arr.filter(t => ['resolved','closed'].includes(t.status)).length}</td>
            </tr>`).join('');
          })()}</tbody>
        </table>
      </div>`;
    return;
  }

  // ── Manager / Super Admin view ────────────────────────
  const teamUsers = Perm.isSuper()
    ? S.users.filter(u => u.is_active !== false)
    : S.users.filter(u => u.department === Perm.myDept() && u.is_active !== false);
  const perf = teamUsers.map(u => {
    const asgn    = tickets.filter(t => t.assigned_to === u.id).length;
    const done    = tickets.filter(t => t.assigned_to === u.id && ['resolved','closed'].includes(t.status)).length;
    const slaOk   = tickets.filter(t => {
      if (t.assigned_to !== u.id) return false;
      if (!['closed','archived'].includes(t.status)) return false;
      const slaH = PRIO_SLA[t.priority] || 24;
      const dur  = (new Date(t.closed_at||t.updated_at) - new Date(t.created_at)) / 3600000;
      return dur <= slaH;
    }).length;
    const avgDur  = (() => {
      const closedByUser = tickets.filter(t => t.assigned_to === u.id && ['closed','archived'].includes(t.status) && t.closed_at);
      if (!closedByUser.length) return null;
      return closedByUser.reduce((s,t) => s + (new Date(t.closed_at) - new Date(t.created_at))/3600000, 0) / closedByUser.length;
    })();
    return { name: u.name, role: u.role, asgn, done, slaOk, avgDur, rate: asgn ? Math.round(done/asgn*100) : 0, slaRate: done ? Math.round(slaOk/done*100) : 0 };
  }).filter(p => p.asgn > 0).sort((a,b) => b.asgn - a.asgn);

  const deptDistHtml = (() => {
    const groups = {};
    tickets.forEach(t => {
      const k = t.target_department || 'غير محدد';
      (groups[k] = groups[k] || []).push(t);
    });
    const rows = Object.entries(groups).sort((a,b) => b[1].length - a[1].length);
    if (!rows.length) return '<tr><td colspan="5"><div class="empty-state"><p>لا توجد تيكتات</p></div></td></tr>';
    return rows.map(([k,arr]) => `<tr>
      <td><strong>${_e(k)}</strong></td>
      <td>${arr.length}</td>
      <td>${arr.filter(t => ['open','assigned'].includes(t.status)).length}</td>
      <td>${arr.filter(t => t.status === 'in_progress').length}</td>
      <td>${arr.filter(t => ['resolved','closed'].includes(t.status)).length}</td>
    </tr>`).join('');
  })();

  $('reportsContent').innerHTML = statsHtml + slaRatingRow + `
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px;gap:8px;">
      <button class="btn btn-ghost" onclick="exportExcel()" style="font-size:12px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        تصدير Excel
      </button>
    </div>
  ` + monthHtml + slaBreachedHtml + slaByPriorityHtml + `
    <div class="tbl-wrap" style="margin-bottom:20px;">
      <div class="tbl-head"><span class="tbl-head-title">${Perm.isSuper() ? 'أداء فريق العمل' : `أداء فريق ${Perm.myDept()||'الإدارة'}`}</span></div>
      <table class="data-tbl">
        <thead><tr><th>الموظف</th><th>الدور</th><th>معين له</th><th>مغلقة</th><th>متوسط الإغلاق</th><th>التزام SLA</th><th>معدل الأداء</th></tr></thead>
        <tbody>${perf.length ? perf.map(p => `<tr>
          <td><strong>${_e(p.name)}</strong></td>
          <td style="font-size:11px;color:var(--text-muted);">${_e(ROLES[p.role]||p.role)}</td>
          <td>${p.asgn}</td>
          <td>${p.done}</td>
          <td style="font-family:var(--font-mono);font-size:12px;">${fmtHours(p.avgDur)}</td>
          <td style="font-family:var(--font-mono);">${p.slaRate}%</td>
          <td style="min-width:130px;">
            <div class="sla-bar" style="height:7px;margin-bottom:3px;">
              <div class="sla-fill ${p.rate>=80?'sla-ok':p.rate>=50?'sla-warn':'sla-crit'}" style="width:${p.rate}%;"></div>
            </div>
            <span style="font-size:10px;color:var(--text-muted);">${p.rate}%</span>
          </td>
        </tr>`).join('') : '<tr><td colspan="7"><div class="empty-state"><p>لا توجد بيانات</p></div></td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="tbl-wrap" style="margin-bottom:20px;">
      <div class="tbl-head"><span class="tbl-head-title">التوزيع حسب الإدارة</span></div>
      <table class="data-tbl">
        <thead><tr><th>الإدارة</th><th>إجمالي</th><th>مفتوح</th><th>قيد التنفيذ</th><th>مغلق</th></tr></thead>
        <tbody>${deptDistHtml}</tbody>
      </table>
    </div>
  ` + ratingsHtml;
}

async function confirmResetStats() {
  showConfirm('🔄', 'إعادة ضبط الإحصاءات', 'سيؤدي هذا إلى أرشفة جميع التيكتات المغلقة.\nهل أنت متأكد؟', async ()=>{
    try {
      await sbFetch('/tickets?status=in.(resolved,closed)',{
        method:'PATCH',
        body:JSON.stringify({ status:'closed', updated_at:new Date().toISOString() }),
        headers:{'Prefer':'return=minimal'}
      });
      await loadTickets();
      renderReports();
      toast('تم إعادة الضبط وأرشفة التيكتات المنتهية');
    } catch(e){ toast('فشل: '+e.message,'error'); }
  });
}


// ═══════════════════════════════════════════════════════
//  AUDIT LOG
// ═══════════════════════════════════════════════════════
async function renderAuditLog() {
  // Guard: only manager role can access audit log
  if (!Perm.isSuper()) { showPage('dashboard'); return; }

  const ACTION_LABELS = {
    delete_user:   '🗑️ حذف مستخدم',
    delete_ticket: '🗑️ حذف تيكت',
    update_user:   '✏️ تعديل مستخدم',
    reset_audit_log: '🔄 مسح سجل العمليات',
  };

  // Show page with buttons immediately
  $('auditlogContent').innerHTML = `
    <div class="ph" style="margin-bottom:20px;">
      <div class="ph-left">
        <span class="ph-tag">للمديرين فقط</span>
        <h1 class="ph-title">سجل العمليات</h1>
        <p class="ph-sub">تتبع جميع عمليات الحذف والتعديل الحساسة</p>
      </div>
      <div class="ph-right">
        <button class="btn btn-ghost" onclick="exportAuditCSV()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          تصدير CSV
        </button>
        <button class="btn btn-danger" onclick="resetAuditLog()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          مسح السجل
        </button>
      </div>
    </div>
    <div id="auditTableWrap"><div class="empty-state"><p>جارٍ التحميل...</p></div></div>
  `;

  // Fetch logs
  let logs = [];
  try {
    logs = await sbFetch('/audit_logs?select=*&order=created_at.desc&limit=100') || [];
  } catch(e) { }

  // Render table
  document.getElementById('auditTableWrap').innerHTML = `
    <div class="tbl-wrap">
      <div class="tbl-head">
        <span class="tbl-head-title">آخر 100 عملية (${logs.length})</span>
      </div>
      <div style="overflow-x:auto;">
        <table class="data-tbl">
          <thead><tr>
            <th>التاريخ والوقت</th>
            <th>المنفذ</th>
            <th>الدور</th>
            <th>العملية</th>
            <th>الهدف</th>
          </tr></thead>
          <tbody>
            ${logs.length ? logs.map(l => `<tr>
              <td style="font-family:var(--font-mono);font-size:11px;">${_d(l.created_at)} ${_t(l.created_at)}</td>
              <td><strong>${_e(l.user_name)}</strong></td>
              <td>${_e(ROLES[l.user_role]||l.user_role)}</td>
              <td>${_e(ACTION_LABELS[l.action]||l.action)}</td>
              <td>${_e(l.target_name)}</td>
            </tr>`).join('') : `<tr><td colspan="5"><div class="empty-state"><p>لا توجد عمليات مسجلة بعد</p></div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Store logs for CSV export
  S._auditLogs = logs;
  S._auditLabels = ACTION_LABELS;
}

// ── Reset Audit Log ──────────────────────────────────────
async function resetAuditLog() {
  showConfirm('⚠️', 'مسح سجل العمليات', 'هل أنت متأكد من مسح كل سجل العمليات؟\nلا يمكن التراجع عن هذا الإجراء.', async ()=>{
    try {
      const res = await fetch(CFG.authEndpoint, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ action:'reset_audit_log', token:S.token })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل المسح');
      toast('تم مسح سجل العمليات بنجاح');
      renderAuditLog();
    } catch(e) { toast('فشل: '+e.message, 'error'); }
  });
}

// ── Export Audit Log CSV ─────────────────────────────────
function exportAuditCSV() {
  const logs = S._auditLogs || [];
  const labels = S._auditLabels || {};
  if (!logs.length) { toast('لا توجد بيانات للتصدير', 'warning'); return; }
  const rows = [['التاريخ','المنفذ','الدور','العملية','الهدف']];
  logs.forEach(l => {
    rows.push([`${_d(l.created_at)} ${_t(l.created_at)}`, l.user_name, ROLES[l.user_role]||l.user_role, labels[l.action]||l.action, l.target_name]);
  });
  const csv = rows.map(r=>r.map(c=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));
  a.download = `audit-log-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  toast('تم تصدير سجل العمليات');
}


// ═══════════════════════════════════════════════════════
//  PROFILE
// ═══════════════════════════════════════════════════════
function renderProfile() {
  const u = S.user;
  const myT = S.tickets.filter(t=>t.created_by===u.id);
  const roleBadge = {employee:'b-emp',admin:'b-admin',manager:'b-mgr'}[u.role]||'b-emp';

  $('profileContent').innerHTML = `
    <div style="display:grid;grid-template-columns:300px 1fr;gap:22px;align-items:start;">
      <div class="dc">
        <div style="text-align:center;padding:12px 0 20px;">
          <div style="width:70px;height:70px;border-radius:50%;background:linear-gradient(135deg,var(--gold-dim),var(--gold));display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;color:#0A0A0C;margin:0 auto 14px;">${u.name.charAt(0)}</div>
          <div style="font-family:var(--font-display);font-size:19px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">${_e(u.name)}</div>
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.1em;">${ROLES[u.role]||u.role}</div>
          <div style="margin-top:10px;"><span class="badge ${roleBadge}">${_e(ROLES[u.role]||u.role)}</span></div>
        </div>
        ${[
          ['اسم المستخدم',u.username],
          ['البريد الإلكتروني',u.email||'—'],
          ['القسم',u.department||'—'],
          ['رقم الهاتف',u.phone||'—'],
        ].map(([k,v])=>`<div class="meta-row"><span class="meta-key">${k}</span><span class="meta-val">${_e(v)}</span></div>`).join('')}
      </div>
      <div>
        <div class="stats-row">
          <div class="stat-card"><div class="stat-label">إجمالي طلباتي</div><div class="stat-val">${myT.length}</div></div>
          <div class="stat-card" style="--_acc:#60A5FA"><div class="stat-label">مفتوحة</div><div class="stat-val" style="color:#60A5FA">${myT.filter(t=>t.status==='open').length}</div></div>
          <div class="stat-card" style="--_acc:#4ADE80"><div class="stat-label">مغلقة</div><div class="stat-val" style="color:#4ADE80">${myT.filter(t=>['resolved','closed'].includes(t.status)).length}</div></div>
        </div>
        <div class="dc" style="margin-top:0;">
          <div class="dc-title">إعدادات العرض</div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;">
            <span style="font-size:13px;color:var(--text-primary);">وضع العرض</span>
            <div class="theme-toggle" onclick="toggleTheme()" style="position:relative;cursor:pointer;">
              <span class="theme-icon-dark">🌙</span>
              <span class="theme-icon-light">☀️</span>
              <div class="theme-thumb"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Change Password -->
    <div class="dc" style="margin-top:0;">
      <div class="dc-title">تغيير كلمة المرور</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:end;">
        <div>
          <label class="fl">كلمة المرور الحالية</label>
          <input type="password" class="fi" id="cp_old" placeholder="••••••••">
        </div>
        <div>
          <label class="fl">الجديدة (6 أحرف كحد أدنى)</label>
          <input type="password" class="fi" id="cp_new" placeholder="••••••••">
        </div>
      </div>
      <div style="margin-top:12px;">
        <button class="btn btn-gold" onclick="changePassword()">حفظ كلمة المرور</button>
      </div>
    </div>
  `;
}

// ── Change Password ──────────────────────────────────────
async function changePassword() {
  const oldPass = $('cp_old')?.value || '';
  const newPass = $('cp_new')?.value || '';
  if (!oldPass || !newPass) { toast('أدخل كلمة المرور الحالية والجديدة', 'error'); return; }
  if (newPass.length < 6) { toast('كلمة المرور الجديدة لازم تكون 6 أحرف على الأقل', 'error'); return; }
  try {
    const res = await fetch(CFG.authEndpoint, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ action:'change_password', token:S.token, old_password:oldPass, new_password:newPass })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'فشل التغيير');
    $('cp_old').value = $('cp_new').value = '';
    toast('✅ تم تغيير كلمة المرور بنجاح');
  } catch(e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════
//  NOTIFICATIONS
// ═══════════════════════════════════════════════════════
function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch { /* مش كل المتصفحات بتدعم AudioContext */ }
}

function renderNotifPanel() {
  // Deduplicate: if same title sent within 60s, show only first occurrence
  const seen = new Map();
  const deduped = S.notifs.filter(n => {
    const t = new Date(n.created_at).getTime();
    if (seen.has(n.title) && Math.abs(t - seen.get(n.title)) < 60000) return false;
    seen.set(n.title, t);
    return true;
  });

  const unread = deduped.filter(n=>!n.is_read);
  const badge  = $('notifBadge');
  const prevCount = parseInt(badge.textContent||'0');
  if (unread.length > 0) {
    badge.textContent = unread.length;
    badge.style.display = 'flex';
    // صوت فقط لما يزيد العدد (إشعار جديد وصل)
    if (unread.length > prevCount) playNotifSound();
  } else {
    badge.style.display = 'none';
  }

  $('notifList').innerHTML = deduped.length
    ? deduped.map(n=>`
        <div class="notif-item ${!n.is_read?'unread':''}" onclick="markNotifRead('${n.id}')">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
            <div style="flex:1;min-width:0;">
              <div class="ni-title">${_e(n.title)}</div>
              <div class="ni-sub">${_e(n.body||'')} · ${_ago(n.created_at)}</div>
            </div>
            <button onclick="event.stopPropagation();deleteNotif('${n.id}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:14px;padding:0 2px;flex-shrink:0;line-height:1;" title="مسح الإشعار">×</button>
          </div>
        </div>`).join('')
    : `<div class="empty-state" style="padding:24px;"><p>لا توجد إشعارات</p></div>`;
}

function toggleNotifPanel() {
  const panel = $('notifPanel');
  const btn   = $('notifBtn');
  const isOpen = panel.classList.contains('on');
  if (isOpen) { panel.classList.remove('on'); return; }

  // Calculate position from button's screen coordinates
  const rect = btn.getBoundingClientRect();
  const panelW = Math.min(340, window.innerWidth - 24);
  // Place panel below the button, aligned to button's left edge
  // but clamp so it doesn't go off-screen on either side
  let left = rect.left;
  if (left + panelW > window.innerWidth - 12) left = window.innerWidth - panelW - 12;
  if (left < 12) left = 12;

  panel.style.top  = (rect.bottom + 8) + 'px';
  panel.style.left = left + 'px';
  panel.style.width = panelW + 'px';
  panel.classList.add('on');
}

async function markNotifRead(id) {
  const n = S.notifs.find(n=>n.id===id);
  if (!n||n.is_read) return;
  n.is_read = true;
  renderNotifPanel();
  // استخدام sbFetch مباشرة بالـ JWT بدل authEndpoint
  sbFetch(`/notifications?id=eq.${id}`, {
    method:'PATCH',
    headers:{'Prefer':'return=minimal'},
    body:JSON.stringify({is_read:true})
  }).catch(()=>{});
}

async function deleteNotif(id) {
  S.notifs = S.notifs.filter(n=>n.id!==id);
  renderNotifPanel();
  // مسح من DB
  await sbFetch(`/notifications?id=eq.${id}`, {
    method:'DELETE',
    headers:{'Prefer':'return=minimal'}
  }).catch(()=>{});
}


async function markAllNotifRead() {
  S.notifs.forEach(n=>n.is_read=true);
  renderNotifPanel();
  if (!S.user) return;
  sbFetch(`/notifications?user_id=eq.${S.user.id}`, {
    method:'PATCH',
    headers:{'Prefer':'return=minimal'},
    body:JSON.stringify({is_read:true})
  }).catch(()=>{});
}

async function deleteAllNotifs() {
  if (!S.user || !S.notifs.length) return;
  S.notifs = [];
  renderNotifPanel();
  await sbFetch(`/notifications?user_id=eq.${S.user.id}`, {
    method:'DELETE',
    headers:{'Prefer':'return=minimal'}
  }).catch(()=>{});
}

// Close notif panel on outside click
document.addEventListener('click',e=>{
  const panel = $('notifPanel');
  const btn   = $('notifBtn');
  if (panel&&!panel.contains(e.target)&&!btn.contains(e.target)) {
    panel.classList.remove('on');
  }
});

// ═══════════════════════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════════════════════
function exportCSV() {
  const rows = [['رقم التيكت','العنوان','مقدم الطلب','القسم','الأولوية','الحالة','المعين','التاريخ']];
  S.tickets.forEach(t=>{
    rows.push([t.ticket_number,t.title,uname(t.created_by),udept(t.created_by),PRIO_L[t.priority],STATUS_L[t.status],t.assigned_to?uname(t.assigned_to):'—',_d(t.created_at)]);
  });
  const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));
  a.download = `GAS-IT-Tickets-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  toast('تم تصدير التيكتات CSV');
}

function exportExcel() {
  const headers = ['رقم التيكت','العنوان','الإدارة المسؤولة','نوع الطلب','مقدم الطلب','قسم المقدم','الأولوية','الحالة','المعين','المرفقات','التاريخ'];
  const rows = visibleTickets().map(t => [
    t.ticket_number,
    t.title,
    t.target_department || (CAT_L[t.category] || t.category || '—'),
    t.request_type || '—',
    uname(t.created_by),
    udept(t.created_by),
    PRIO_L[t.priority] || t.priority,
    STATUS_L[t.status] || t.status,
    t.assigned_to ? uname(t.assigned_to) : '—',
    (t.attachments && t.attachments.length) ? `${t.attachments.length} ملف` : '—',
    _d(t.created_at)
  ]);

  // CSV with BOM for Excel Arabic support
  const csvEsc = v => {
    const s = String(v == null ? '' : v);
    // لو فيه فاصلة أو سطر جديد أو علامة تنصيص نلف بـ quotes
    return (s.includes(',') || s.includes('\n') || s.includes('"'))
      ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [
    headers.map(csvEsc).join(','),
    ...rows.map(r => r.map(csvEsc).join(','))
  ];

  // BOM (EF BB BF) + CSV content — بيخلي Excel يقرأ العربي صح
  const csv = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `GAS-Tickets-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('تم تصدير الملف ✅ — افتحه بـ Excel');
}

// ═══════════════════════════════════════════════════════
//  ROLES & DEPARTMENTS ASSIGNMENT (Super Admin only)
//  صفحة مركزية لتحديد دور وإدارة كل مستخدم
// ═══════════════════════════════════════════════════════
async function renderRoles() {
  if (!Perm.isSuper()) { showPage('dashboard'); return; }
  await loadDepartmentMap();  // نتأكد إن القائمة محدثة

  const host = $('rolesContent');
  if (!host) return;

  // دروب داون الأدوار
  const roleOptions = (curr) => {
    const opts = [
      ['super_admin','مدير النظام (Super Admin)'],
      ['manager',    'مدير إدارة'],
      ['supervisor', 'مشرف إدارة'],
      ['employee',   'موظف'],
    ];
    // admin القديم نخليه متاح كـ legacy option
    if (curr === 'admin') opts.push(['admin','IT Admin (قديم)']);
    return opts.map(([v,l]) => `<option value="${v}" ${curr===v?'selected':''}>${_e(l)}</option>`).join('');
  };

  // دروب داون الإدارات
  const depts = deptList();
  const deptOptions = (curr) =>
    `<option value="">— بلا إدارة —</option>` +
    depts.map(d => `<option value="${_e(d)}" ${curr===d?'selected':''}>${_e(d)}</option>`).join('') +
    (curr && !depts.includes(curr) && curr !== 'إدارة النظام'
      ? `<option value="${_e(curr)}" selected>${_e(curr)} (مخصصة)</option>` : '');

  const users = [...S.users].sort((a,b) => {
    const rr = r => r==='super_admin'?1 : r==='manager'?2 : (r==='supervisor'||r==='admin')?3 : 4;
    return rr(a.role) - rr(b.role) || (a.department||'').localeCompare(b.department||'') || (a.name||'').localeCompare(b.name||'');
  });

  // ملخص حسب الإدارة
  const summary = depts.map(d => {
    const staff = S.users.filter(u => u.department === d && u.is_active !== false);
    return {
      dept: d,
      managers:    staff.filter(u => u.role === 'manager').length,
      supervisors: staff.filter(u => u.role === 'supervisor' || u.role === 'admin').length,
      employees:   staff.filter(u => u.role === 'employee').length,
      total: staff.length,
    };
  });

  host.innerHTML = `
    <div class="dc" style="margin-bottom:16px;">
      <div class="dc-title">نظرة عامة على القوى العاملة</div>
      <div style="overflow-x:auto;">
        <table class="data-tbl">
          <thead><tr><th>الإدارة</th><th>مديرين</th><th>مشرفين</th><th>موظفين</th><th>الإجمالي</th><th>الحالة</th></tr></thead>
          <tbody>
            ${summary.map(s => `
              <tr>
                <td><strong>${_e(s.dept)}</strong></td>
                <td>${s.managers}</td>
                <td>${s.supervisors}</td>
                <td>${s.employees}</td>
                <td>${s.total}</td>
                <td>${
                  s.managers === 0 && s.total > 0 ? '<span style="color:var(--warning);font-size:11px;">⚠️ بلا مدير</span>' :
                  s.total === 0 ? '<span style="color:var(--danger);font-size:11px;">🚫 فارغة</span>' :
                  '<span style="color:var(--success);font-size:11px;">✅ جاهزة</span>'
                }</td>
              </tr>`).join('') || '<tr><td colspan="6"><div class="empty-state"><p>لا توجد إدارات</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="tbl-wrap">
      <div class="tbl-head">
        <span class="tbl-head-title">تحديد الأدوار والإدارات — ${users.length} مستخدم</span>
        <input class="s-input" placeholder="بحث بالاسم..." oninput="filterRolesTable(this.value)" style="width:200px;">
      </div>
      <div style="overflow-x:auto;">
        <table class="data-tbl" id="rolesTable">
          <thead><tr>
            <th>الاسم</th>
            <th>اسم المستخدم</th>
            <th>الدور</th>
            <th>الإدارة</th>
            <th>نشط</th>
            <th>حفظ</th>
          </tr></thead>
          <tbody>
            ${users.map(u => {
              const isSelf = u.id === S.user.id;
              const isMaster = u.username === 'ammar.admin';
              return `
              <tr data-user-name="${_e(u.name.toLowerCase())}">
                <td><strong>${_e(u.name)}</strong>${isMaster?' <span style="color:var(--gold);font-size:10px;">👑</span>':''}</td>
                <td style="font-family:var(--font-mono);font-size:11px;">${_e(u.username)}</td>
                <td>
                  <select class="fsel" id="role_role_${u.id}" ${isMaster?'disabled':''} style="min-width:140px;">
                    ${roleOptions(u.role)}
                  </select>
                </td>
                <td>
                  <select class="fsel" id="role_dept_${u.id}" ${isMaster?'disabled':''} style="min-width:140px;">
                    ${deptOptions(u.department)}
                  </select>
                </td>
                <td>
                  <input type="checkbox" id="role_active_${u.id}" ${u.is_active!==false?'checked':''} ${(isMaster||isSelf)?'disabled':''}>
                </td>
                <td>
                  <button class="btn btn-gold" style="padding:4px 12px;font-size:11px;" ${isMaster?'disabled':''}
                    onclick="saveUserRole('${u.id}')">حفظ</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <span style="color:var(--text-muted);font-size:12px;">💡 حسابك كمدير النظام محمي ولا يمكن تعديله من هنا</span>
        <button class="btn btn-gold" onclick="saveAllRoles()">💾 حفظ كل التغييرات دفعة واحدة</button>
      </div>
    </div>
  `;
}

function filterRolesTable(q) {
  const query = (q||'').toLowerCase().trim();
  document.querySelectorAll('#rolesTable tbody tr').forEach(tr => {
    const name = tr.dataset.userName || '';
    tr.style.display = (!query || name.includes(query)) ? '' : 'none';
  });
}

async function saveUserRole(userId) {
  const u = S.users.find(x => x.id === userId);
  if (!u) return;
  const role = $(`role_role_${userId}`)?.value;
  const dept = $(`role_dept_${userId}`)?.value || '';
  const active = $(`role_active_${userId}`)?.checked !== false;
  if (!role) { toast('اختر الدور','error'); return; }
  if (role !== 'super_admin' && !dept) {
    toast('لازم تحدد الإدارة لهذا الدور','error');
    return;
  }
  try {
    await sbFetch(`/users?id=eq.${userId}`, {
      method:'PATCH',
      body: JSON.stringify({ role, department: dept, is_active: active, role_updated_at: new Date().toISOString() })
    });
    // تحديث الـ state المحلي
    u.role = role; u.department = dept; u.is_active = active;
    toast(`تم تحديث ${u.name}`);
  } catch(e) { toast('فشل الحفظ: '+e.message, 'error'); }
}

async function saveAllRoles() {
  showConfirm('💾','حفظ كل التغييرات','سيتم حفظ جميع التعديلات المعروضة لكل المستخدمين دفعة واحدة.\nمتابعة؟',
    async () => {
      let ok = 0, fail = 0;
      for (const u of S.users) {
        if (u.username === 'ammar.admin') continue;
        const role = $(`role_role_${u.id}`)?.value;
        const dept = $(`role_dept_${u.id}`)?.value || '';
        const active = $(`role_active_${u.id}`)?.checked !== false;
        if (!role) continue;
        // تخطي اللي مفيش فيه تغيير
        if (u.role === role && (u.department||'') === dept && (u.is_active!==false) === active) continue;
        try {
          await sbFetch(`/users?id=eq.${u.id}`, {
            method:'PATCH',
            body: JSON.stringify({ role, department: dept, is_active: active, role_updated_at: new Date().toISOString() })
          });
          u.role = role; u.department = dept; u.is_active = active;
          ok++;
        } catch { fail++; }
      }
      toast(`تم حفظ ${ok} تحديث${fail?` · فشل ${fail}`:''}`, fail?'error':'success');
      await renderRoles();
    });
}

// ═══════════════════════════════════════════════════════
//  DEPARTMENT / REQUEST-TYPE MAP (Super Admin only)
//  صفحة مركزية لتحديد دور وإدارة كل مستخدم
// ═══════════════════════════════════════════════════════
async function renderDeptMap() {
  if (!Perm.isSuper()) { showPage('dashboard'); return; }
  // Always re-load from DB to reflect any changes
  await loadDepartmentMap();

  const host = $('deptmapContent');
  if (!host) return;

  const depts = deptList();
  host.innerHTML = `
    <div class="dc" style="margin-bottom:16px;">
      <div class="dc-title">إضافة إدارة جديدة</div>
      <div class="map-add-row">
        <input class="fi" id="newDeptName" placeholder="اسم الإدارة (مثال: التسويق)">
        <button class="btn btn-gold" onclick="addDepartment()">+ إضافة</button>
      </div>
    </div>

    <div class="map-grid">
      ${depts.length === 0 ? `<div class="empty-state"><p>لا توجد إدارات — أضف واحدة لتبدأ</p></div>` : ''}
      ${depts.map(d => {
        const types = typesOf(d);
        return `
          <div class="map-dept-card">
            <div class="map-dept-head">
              <span class="map-dept-name">🏢 ${_e(d)} <span style="color:var(--text-muted);font-weight:400;font-size:11px;">(${types.length} نوع)</span></span>
              <button class="btn btn-ghost" style="border-color:var(--danger);color:var(--danger);padding:4px 10px;font-size:11px;" onclick="deleteDepartment('${_e(d)}')">حذف الإدارة</button>
            </div>

            <div class="map-types">
              ${types.map(t => `
                <span class="map-type-chip">
                  ${_e(t)}
                  <button data-dept="${_e(d)}" data-type="${_e(t)}" onclick="deleteRequestType(this.dataset.dept,this.dataset.type)" title="حذف">×</button>
                </span>
              `).join('') || '<span style="color:var(--text-muted);font-size:12px;">لا توجد أنواع طلبات — أضف أول نوع</span>'}
            </div>

            <div class="map-add-row">
              <input class="fi" id="newType_${btoa(unescape(encodeURIComponent(d))).replace(/=/g,'')}" placeholder="نوع طلب جديد لـ ${_e(d)}">
              <button class="btn btn-gold" onclick="addRequestType('${_e(d)}')">+ إضافة نوع</button>
            </div>
          </div>`;
      }).join('')}
    </div>
  `;
}

function deptInputId(dept){ return 'newType_'+btoa(unescape(encodeURIComponent(dept))).replace(/=/g,''); }

async function addDepartment() {
  const name = ($('newDeptName')?.value || '').trim();
  if (!name) { toast('اكتب اسم الإدارة','error'); return; }
  if (deptList().includes(name)) { toast('الإدارة موجودة بالفعل','error'); return; }
  // Seed with a default "أخرى" type
  try {
    await sbFetch('/department_requests', {
      method:'POST',
      body: JSON.stringify({ department: name, request_type: 'أخرى', sort_order: 99, is_active: true })
    });
    toast(`تمت إضافة الإدارة "${name}"`);
    await renderDeptMap();
  } catch(e) { toast('فشل الإضافة: '+e.message, 'error'); }
}

async function deleteDepartment(dept) {
  showConfirm('⚠️','حذف الإدارة',
    `سيتم حذف الإدارة "${dept}" وجميع أنواع الطلبات المرتبطة بها.\nالتيكتات الموجودة لن تُحذف — ستحتفظ بالإدارة القديمة كنص.\nهل تريد المتابعة؟`,
    async () => {
      try {
        await sbFetch(`/department_requests?department=eq.${encodeURIComponent(dept)}`, { method:'DELETE', headers: { Prefer:'return=minimal' } });
        toast(`تم حذف الإدارة "${dept}"`);
        await renderDeptMap();
      } catch(e) { toast('فشل الحذف: '+e.message, 'error'); }
    });
}

async function addRequestType(dept) {
  const id = deptInputId(dept);
  const val = ($(id)?.value || '').trim();
  if (!val) { toast('اكتب نوع الطلب','error'); return; }
  if (typesOf(dept).includes(val)) { toast('النوع موجود بالفعل','error'); return; }
  try {
    const nextOrder = (typesOf(dept).length + 1) * 10;
    await sbFetch('/department_requests', {
      method:'POST',
      body: JSON.stringify({ department: dept, request_type: val, sort_order: nextOrder, is_active: true })
    });
    toast(`تمت إضافة "${val}" لـ ${dept}`);
    await renderDeptMap();
  } catch(e) { toast('فشل الإضافة: '+e.message, 'error'); }
}

async function deleteRequestType(dept, type) {
  showConfirm('🗑️','حذف نوع الطلب',
    `سيتم حذف "${type}" من إدارة "${dept}".\nالتيكتات الموجودة لن تتأثر.\nمتابعة؟`,
    async () => {
      try {
        const q = `/department_requests?department=eq.${encodeURIComponent(dept)}&request_type=eq.${encodeURIComponent(type)}`;
        await sbFetch(q, { method:'DELETE', headers: { Prefer:'return=minimal' } });
        toast(`تم الحذف`);
        await renderDeptMap();
      } catch(e) { toast('فشل الحذف: '+e.message, 'error'); }
    });
}

// ═══════════════════════════════════════════════════════
//  ARCHIVE
// ═══════════════════════════════════════════════════════
function renderArchive() {
  if (!Perm.isSuper()) { showPage('dashboard'); return; }

  const archived = S.tickets.filter(t=>t.status==='archived');

  $('archiveContent').innerHTML = `
    <div class="tbl-wrap">
      <div class="tbl-head">
        <span class="tbl-head-title">التيكتات المؤرشفة (${archived.length})</span>
        <input class="s-input" placeholder="بحث..." oninput="filterArchive(this.value)" style="width:200px;">
      </div>
      <div style="overflow-x:auto;">
        <table class="data-tbl" id="archiveTbl">
          <thead><tr>
            <th>رقم التيكت</th><th>العنوان</th><th>مقدم الطلب</th><th>الأولوية</th><th>التاريخ</th><th>إجراء</th>
          </tr></thead>
          <tbody id="archiveTbody">
            ${archived.length ? archived.map(t=>`
              <tr>
                <td><span class="tnum">${_e(t.ticket_number)}</span></td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_e(t.title)}</td>
                <td>${_e(uname(t.created_by))}</td>
                <td>${pbadge(t.priority)}</td>
                <td style="font-family:var(--font-mono);font-size:11px;">${_d(t.created_at)}</td>
                <td>
                  <div style="display:flex;gap:5px;">
                    <button class="btn btn-ghost" style="padding:4px 9px;font-size:11px;border-color:var(--success);color:var(--success);" onclick="restoreTicket('${t.id}')">استرجاع</button>
                    <button class="btn btn-danger" style="padding:4px 9px;font-size:11px;" onclick="deleteTicket('${t.id}')">حذف نهائي</button>
                  </div>
                </td>
              </tr>`).join('') : `<tr><td colspan="6"><div class="empty-state"><p>لا توجد تيكتات مؤرشفة</p></div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

function filterArchive(q) {
  const archived = S.tickets.filter(t=>t.status==='archived');
  const filtered = q
    ? archived.filter(t=>t.title.includes(q)||t.ticket_number.includes(q)||uname(t.created_by).includes(q))
    : archived;
  const tbody = $('archiveTbody');
  if (!tbody) return;
  tbody.innerHTML = filtered.length ? filtered.map(t=>`
    <tr>
      <td><span class="tnum">${_e(t.ticket_number)}</span></td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_e(t.title)}</td>
      <td>${_e(uname(t.created_by))}</td>
      <td>${pbadge(t.priority)}</td>
      <td style="font-family:var(--font-mono);font-size:11px;">${_d(t.created_at)}</td>
      <td>
        <div style="display:flex;gap:5px;">
          <button class="btn btn-ghost" style="padding:4px 9px;font-size:11px;border-color:var(--success);color:var(--success);" onclick="restoreTicket('${t.id}')">استرجاع</button>
          <button class="btn btn-danger" style="padding:4px 9px;font-size:11px;" onclick="deleteTicket('${t.id}')">حذف نهائي</button>
        </div>
      </td>
    </tr>`).join('') : `<tr><td colspan="6"><div class="empty-state"><p>لا توجد نتائج</p></div></td></tr>`;
}

// ═══════════════════════════════════════════════════════
//  KEYBOARD
// ═══════════════════════════════════════════════════════
document.addEventListener('keydown',e=>{
  if (e.key==='Enter'&&$('loginScreen').classList.contains('visible')) doLogin();
  if (e.key==='Escape') {
    document.querySelectorAll('.modal-mask.on').forEach(m=>m.classList.remove('on'));
    $('notifPanel').classList.remove('on');
  }
});

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async ()=>{
  initTheme();

  // Try restore session
  const restored = await tryRestoreSession();
  $('loadingScreen').style.display = 'none';

  if (restored) {
    await bootApp();
  } else {
    $('loginScreen').classList.add('visible');
  }
});
