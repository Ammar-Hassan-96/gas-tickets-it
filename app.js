/* ═══════════════════════════════════════════════════════
   GAS IT DESK — Application Logic
   German Auto Service · Mercedes-Benz Egypt
   Production Build v2.0
   ═══════════════════════════════════════════════════════ */

'use strict';

// ── CONFIG ───────────────────────────────────────────────
const CFG = {
  supabaseUrl: 'https://rmlkhgktwologfhphtyz.supabase.co',
  supabaseKey: 'sb_publishable_ZJvjXbR6yYDoj1BSOnsXVA_CHF19ojv',
  authEndpoint: '/api/auth',
  sessionKey:   'gas_it_session',
  themeKey:     'gas_it_theme',
};

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
  filterStatus:   '',
  filterPriority: '',
  filterSearch:   '',
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

const ROLES = { employee:'موظف', admin:'IT Admin', manager:'مدير' };
const STATUS_L = { open:'مفتوح', assigned:'معين', in_progress:'قيد التنفيذ', resolved:'محلول', closed:'مغلق', escalated:'مصعد' };
const PRIO_L   = { critical:'حرجة', high:'عالية', medium:'متوسطة', low:'منخفضة' };
const CAT_L    = { hardware:'أجهزة', software:'برامج', network:'شبكة', email:'بريد', access:'صلاحيات', printer:'طابعة', security:'أمن', other:'أخرى' };
const STATUS_C = { open:'b-open', assigned:'b-assign', in_progress:'b-prog', resolved:'b-resolve', closed:'b-closed', escalated:'b-escal' };
const PRIO_C   = { critical:'b-crit', high:'b-high', medium:'b-med', low:'b-low' };
const PRIO_SLA = { critical:4, high:8, medium:24, low:72 };

const badge  = (t,c) => `<span class="badge ${c}">${_e(t)}</span>`;
const sbadge = s => badge(STATUS_L[s]||s, STATUS_C[s]||'b-open');
const pbadge = p => badge(PRIO_L[p]||p,   PRIO_C[p]||'b-med');
const uname  = id => S.users.find(u=>u.id===id)?.name || '—';
const udept  = id => S.users.find(u=>u.id===id)?.department || '—';

// ── SUPABASE CLIENT ──────────────────────────────────────
async function sbFetch(path, opts={}) {
  const res = await fetch(`${CFG.supabaseUrl}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: CFG.supabaseKey,
      Authorization: `Bearer ${CFG.supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers||{}),
    },
  });
  if (!res.ok) {
    const t = await res.text().catch(()=>'');
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
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="toast-ico">${icons[type]||'ℹ️'}</span><span class="toast-txt">${_e(msg)}</span>`;
  el.onclick = ()=>el.remove();
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 4000);
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
  closeConfirm();
  if (_confirmCb) _confirmCb();
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
  // Check lockout
  if (Date.now() < _loginTrack.lockedUntil) {
    const secs = Math.ceil((_loginTrack.lockedUntil - Date.now()) / 1000);
    showLoginError(`محاولات كثيرة — انتظر ${secs} ثانية`);
    return;
  }

  const username = $('liUser').value.trim();
  const password = $('liPass').value;
  const errEl    = $('loginErr');
  const btn      = $('signInBtn');

  if (!username || !password) {
    showLoginError('يرجى إدخال اسم المستخدم وكلمة المرور');
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'جارٍ التحقق...';
  errEl.style.display = 'none';

  try {
    const res  = await fetch(CFG.authEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action:'login', username, password }),
    });
    const data = await res.json();

    if (!res.ok || !data.user) {
      throw new Error(data.error || 'فشل تسجيل الدخول');
    }

    S.user  = data.user;
    S.token = data.token;
    _loginTrack.count = 0; // reset on success
    localStorage.setItem(CFG.sessionKey, JSON.stringify({ user: data.user, token: data.token }));

    // Apply saved theme preference
    if (data.user.theme_pref) applyTheme(data.user.theme_pref, false);

    await bootApp();
  } catch(err) {
    showLoginError(err.message || 'خطأ في الاتصال بالخادم');
    _loginTrack.count++;
    if (_loginTrack.count >= 5) {
      _loginTrack.lockedUntil = Date.now() + 60000; // lock 60 seconds
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
  const saved = localStorage.getItem(CFG.sessionKey);
  if (!saved) return false;
  try {
    const { token } = JSON.parse(saved);
    const res  = await fetch(CFG.authEndpoint, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'validate', token }),
    });
    if (!res.ok) { localStorage.removeItem(CFG.sessionKey); return false; }
    const data = await res.json();
    S.user  = data.user;
    S.token = token;
    if (data.user.theme_pref) applyTheme(data.user.theme_pref, false);
    return true;
  } catch { localStorage.removeItem(CFG.sessionKey); return false; }
}

function doLogout() {
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

  await Promise.all([loadTickets(), loadUsers(), loadNotifications()]);

  buildTopbar();
  buildNav();
  showPage('dashboard');
}

async function loadTickets() {
  try {
    S.tickets = await sbFetch('/tickets?select=*,comments:ticket_comments(*)&order=created_at.desc') || [];
  } catch { S.tickets = []; }
}

async function loadUsers() {
  try {
    const all = await sbFetch('/users?select=id,name,username,email,role,department,phone,is_active&order=name') || [];
    // Hide developer/system accounts from all views
    S.users = all.filter(u => u.username !== 'ammar.admin');
  } catch { S.users = []; }
}

async function loadNotifications() {
  if (!S.user) return;
  try {
    const q = S.user.role === 'employee'
      ? `/notifications?user_id=eq.${S.user.id}&order=created_at.desc&limit=20`
      : `/notifications?order=created_at.desc&limit=30`;
    S.notifs = await sbFetch(q) || [];
  } catch { S.notifs = []; }
  renderNotifPanel();
}

// ═══════════════════════════════════════════════════════
//  TOPBAR & NAV
// ═══════════════════════════════════════════════════════
function buildTopbar() {
  const u = S.user;
  $('tbName').textContent   = u.name;
  $('tbRole').textContent   = ROLES[u.role] || u.role;
  $('tbAvatar').textContent = u.name.charAt(0);
}

function buildNav() {
  const role = S.user?.role;
  const defs = {
    employee: [
      ['dashboard',  '⊞', 'الرئيسية'],
      ['mytickets',  '🎫', 'طلباتي'],
      ['profile',    '👤', 'حسابي'],
    ],
    admin: [
      ['dashboard',  '⊞', 'الرئيسية'],
      ['alltickets', '🎫', 'التيكتات'],
      ['reports',    '📊', 'التقارير'],
      ['profile',    '👤', 'حسابي'],
    ],
    manager: [
      ['dashboard',  '⊞', 'الرئيسية'],
      ['alltickets', '🎫', 'التيكتات'],
      ['users',      '👥', 'المستخدمون'],
      ['reports',    '📊', 'التقارير'],
      ['auditlog',   '🛡️', 'سجل العمليات'],
      ['profile',    '👤', 'حسابي'],
    ],
  };
  const items = defs[role] || defs.employee;
  $('mainNav').innerHTML = items.map(([id,,label]) => `
    <button class="tb-nav-btn" id="nav-${id}" onclick="showPage('${id}')">
      ${_e(label)}
    </button>
  `).join('');
}

// ═══════════════════════════════════════════════════════
//  ROUTING
// ═══════════════════════════════════════════════════════
function showPage(id) {
  S.prevPage = S.page;
  S.page     = id;

  document.querySelectorAll('.tb-nav-btn').forEach(b=>b.classList.remove('active'));
  const nb = $(`nav-${id}`);
  if (nb) nb.classList.add('active');

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  const pg = $(`page-${id}`);
  if (pg) pg.classList.add('on');

  const renders = {
    dashboard: renderDashboard,
    mytickets: renderMyTickets,
    alltickets: renderAllTickets,
    users:    renderUsers,
    reports:  renderReports,
    auditlog: renderAuditLog,
    profile:  renderProfile,
  };
  if (renders[id]) renders[id]();

  $('contentEl').scrollTop = 0;
}

function goBack() { showPage(S.prevPage || 'dashboard'); }

// ═══════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════
function myTickets() {
  return S.user.role === 'employee'
    ? S.tickets.filter(t=>t.created_by===S.user.id)
    : S.tickets;
}

function renderDashboard() {
  const u = S.user;
  $('dashSub').textContent = `مرحباً ${u.name} — ${new Date().toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long'})}`;

  // Actions
  $('dashActions').innerHTML = u.role === 'employee'
    ? `<button class="btn btn-gold" onclick="openNewTicketModal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>تيكت جديد</button>`
    : '';

  const tickets = myTickets();
  const open    = tickets.filter(t=>t.status==='open').length;
  const prog    = tickets.filter(t=>['in_progress','assigned'].includes(t.status)).length;
  const res     = tickets.filter(t=>t.status==='resolved').length;
  const crit    = tickets.filter(t=>t.priority==='critical'&&!['resolved','closed'].includes(t.status)).length;

  const colorForVal = (i) => ['#60A5FA','#FCD34D','#4ADE80','#F87171'][i];

  $('dashStats').innerHTML = [
    ['مفتوح',       open, 'يحتاج إجراء'],
    ['قيد التنفيذ', prog, 'جارٍ العمل'],
    ['محلول',       res,  'مكتملة'],
    ['حرجة',        crit, 'أولوية قصوى'],
  ].map(([l,v,h],i)=>`
    <div class="stat-card" style="--_acc:${colorForVal(i)}">
      <div class="stat-label">${l}</div>
      <div class="stat-val" style="color:${colorForVal(i)}">${v}</div>
      <div class="stat-hint">${h}</div>
    </div>
  `).join('');

  renderDashCharts(tickets);

  // Manager: load active sessions asynchronously (non-blocking)
  if (S.user.role === 'manager') {
    fetch(CFG.authEndpoint, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'get_sessions', token:S.token })
    }).then(r=>r.json()).then(data=>{
      const el = document.createElement('div');
      el.className = 'chart-card c12';
      el.style.cssText = 'border-right:3px solid var(--gold);';
      el.innerHTML = `
        <div class="ch-head">
          <div><div class="ch-title">🟢 الجلسات النشطة</div><div class="ch-sub">المستخدمون المتصلون حالياً</div></div>
        </div>
        <div style="display:flex;align-items:center;gap:16px;padding:8px 0;">
          <div style="font-family:var(--font-display);font-size:52px;font-weight:700;color:var(--gold);">${data.total||0}</div>
          <div style="font-size:13px;color:var(--text-muted);">جلسة نشطة</div>
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

  // Donut — by category
  const cats={};
  tickets.forEach(t=>{cats[t.category]=(cats[t.category]||0)+1;});
  const total   = tickets.length;
  const divisor = total || 1; // avoid division by zero
  const colors = ['#B8975A','#60A5FA','#4ADE80','#F87171','#FCD34D','#C084FC','#22D3EE','#FB923C'];
  // Build donut: empty state if no tickets
  let donutHtml;
  if (total === 0) {
    donutHtml = `<div class="chart-card c5">
      <div class="ch-head"><div><div class="ch-title">التوزيع حسب الفئة</div><div class="ch-sub">0 إجمالي</div></div></div>
      <div class="empty-state" style="padding:24px;"><p>لا توجد تيكتات</p></div>
    </div>`;
  } else {
  const catList = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const R=38, circ=2*Math.PI*R;
  let off=0;
  const slices = catList.map((c,i)=>{
    const pct=c[1]/divisor;
    const d=pct*circ, g=circ-d, o=off;
    off+=d;
    return {label:CAT_L[c[0]]||c[0],val:c[1],color:colors[i],d,g,o};
  });

  donutHtml = `
    <div class="chart-card c5">
      <div class="ch-head"><div><div class="ch-title">التوزيع حسب الفئة</div><div class="ch-sub">${total} إجمالي</div></div></div>
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

  // Recent tickets table
  const recent = [...myTickets()].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,5);
  const recentHtml = `
    <div class="chart-card c12">
      <div class="ch-head">
        <div class="ch-title">آخر التيكتات</div>
        <button class="btn btn-ghost" style="padding:6px 12px;font-size:12px;" onclick="showPage('${S.user.role==='employee'?'mytickets':'alltickets'}')">عرض الكل</button>
      </div>
      <div style="overflow-x:auto;">
        <table class="data-tbl">
          <thead><tr><th>رقم التيكت</th><th>العنوان</th><th>الأولوية</th><th>الحالة</th><th>التاريخ</th></tr></thead>
          <tbody>${recent.length ? recent.map(t=>`
            <tr onclick="openTicketDetail('${t.id}')">
              <td><span class="tnum">${_e(t.ticket_number)}</span></td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_e(t.title)}</td>
              <td>${pbadge(t.priority)}</td>
              <td>${sbadge(t.status)}</td>
              <td style="font-family:var(--font-mono);font-size:11px;">${_d(t.created_at)}</td>
            </tr>`).join('') : '<tr><td colspan="5"><div class="empty-state"><p>لا توجد تيكتات بعد</p></div></td></tr>'}
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
  const base = S.tickets.filter(t=>t.created_by===S.user.id);
  renderTicketRows('myTbody', applyMyFilter(base), false);
}

function filterMyTickets(q) {
  const base = S.tickets.filter(t=>t.created_by===S.user.id);
  S.filterSearch = q;
  renderTicketRows('myTbody', applyMyFilter(base), false);
}
function filterMyByStatus(v) {
  const base = S.tickets.filter(t=>t.created_by===S.user.id);
  S.filterStatus = v;
  renderTicketRows('myTbody', applyMyFilter(base), false);
}
function applyMyFilter(list) {
  let r = list;
  if (S.filterStatus)  r = r.filter(t=>t.status===S.filterStatus);
  if (S.filterSearch)  r = r.filter(t=>t.title.includes(S.filterSearch)||t.ticket_number.includes(S.filterSearch));
  return r;
}

// ═══════════════════════════════════════════════════════
//  ALL TICKETS
// ═══════════════════════════════════════════════════════
function renderAllTickets() {
  renderTicketRows('allTbody', applyAllFilter(S.tickets), true);
}
function filterAllTickets(q) {
  S.filterSearch = q;
  renderTicketRows('allTbody', applyAllFilter(S.tickets), true);
}
function filterAll(key, val) {
  if (key==='status')   S.filterStatus   = val;
  if (key==='priority') S.filterPriority = val;
  renderTicketRows('allTbody', applyAllFilter(S.tickets), true);
}
function applyAllFilter(list) {
  let r = list;
  if (S.filterStatus)   r = r.filter(t=>t.status===S.filterStatus);
  if (S.filterPriority) r = r.filter(t=>t.priority===S.filterPriority);
  if (S.filterSearch)   r = r.filter(t=>t.title.includes(S.filterSearch)||t.ticket_number.includes(S.filterSearch)||uname(t.created_by).includes(S.filterSearch));
  return r;
}

// ═══════════════════════════════════════════════════════
//  RENDER TICKET ROWS
// ═══════════════════════════════════════════════════════
function renderTicketRows(tbodyId, tickets, isAdmin) {
  const tbody = $(tbodyId);
  if (!tickets.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8z"/></svg>
      <p>لا توجد تيكتات</p>
    </div></td></tr>`;
    return;
  }

  if (isAdmin) {
    tbody.innerHTML = tickets.map(t=>{
      const sla = getSLA(t);
      const canDel = S.user.role==='manager';
      return `<tr onclick="openTicketDetail('${t.id}')">
        <td><span class="tnum">${_e(t.ticket_number)}</span></td>
        <td style="max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_e(t.title)}</td>
        <td>${_e(uname(t.created_by))}</td>
        <td>${_e(udept(t.created_by))}</td>
        <td>${pbadge(t.priority)}</td>
        <td>${sbadge(t.status)}</td>
        <td>${_e(t.assigned_to ? uname(t.assigned_to) : '—')}</td>
        <td style="min-width:100px;">
          <div class="sla-bar"><div class="sla-fill ${sla.cls}" style="width:${sla.pct}%"></div></div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${sla.label}</div>
        </td>
        <td>
          <div style="display:flex;gap:5px;">
            <button class="btn btn-ghost" style="padding:4px 9px;font-size:11px;" onclick="event.stopPropagation();quickUpdate('${t.id}')">تحديث</button>
            ${canDel?`<button class="btn btn-danger" style="padding:4px 9px;font-size:11px;" onclick="event.stopPropagation();deleteTicket('${t.id}')">حذف</button>`:''}
          </div>
        </td>
      </tr>`;
    }).join('');
  } else {
    tbody.innerHTML = tickets.map(t=>`
      <tr onclick="openTicketDetail('${t.id}')">
        <td><span class="tnum">${_e(t.ticket_number)}</span></td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_e(t.title)}</td>
        <td>${_e(CAT_L[t.category]||t.category)}</td>
        <td>${pbadge(t.priority)}</td>
        <td>${sbadge(t.status)}</td>
        <td style="font-family:var(--font-mono);font-size:11px;">${_d(t.created_at)}</td>
        <td><button class="btn btn-ghost" style="padding:4px 9px;font-size:11px;" onclick="event.stopPropagation();openTicketDetail('${t.id}')">تفاصيل</button></td>
      </tr>`).join('');
  }
}

function getSLA(t) {
  if (['resolved','closed'].includes(t.status)) return {pct:100,cls:'sla-ok',label:'منتهي'};
  const slaH = PRIO_SLA[t.priority]||24;
  const elapsedH = (Date.now()-new Date(t.created_at))/3600000;
  const pct = Math.min(elapsedH/slaH*100,100);
  const rem = Math.max(slaH-elapsedH,0);
  const label = pct>=100 ? 'متأخر!' : `${Math.round(rem)}س متبقية`;
  return { pct, cls: pct>=100?'sla-crit':pct>=70?'sla-warn':'sla-ok', label };
}

// ═══════════════════════════════════════════════════════
//  TICKET DETAIL
// ═══════════════════════════════════════════════════════
async function openTicketDetail(id) {
  S.selTicket = id;
  const t = S.tickets.find(t=>t.id===id);
  if (!t) return;

  $('detailNum').textContent   = t.ticket_number;
  $('detailTitle').textContent = t.title;

  const canUpdate = S.user.role !== 'employee';
  const canDelete = S.user.role === 'manager';
  $('detailBtns').innerHTML = `
    ${canUpdate?`<button class="btn btn-ghost" onclick="quickUpdate('${id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>تحديث الحالة</button>`:''}
    ${canDelete?`<button class="btn btn-danger" onclick="deleteTicket('${id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>حذف التيكت</button>`:''}
  `;

  const sla = getSLA(t);
  const comments = t.comments || [];

  const timelineItems = [
    { author: uname(t.created_by), action:'فتح التيكت', time:t.created_at, text:t.description, dot:'var(--gold)' },
    ...comments.map(c=>({ author:uname(c.user_id)||c.author_name||'—', action:'تعليق', time:c.created_at, text:c.content, dot:'#60A5FA' }))
  ];

  $('detailGrid').innerHTML = `
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

      <div class="comment-wrap">
        <div class="dc-title" style="margin-bottom:10px;">إضافة تعليق</div>
        <textarea class="comment-input" id="newCommentInput" placeholder="أضف تعليقاً أو تحديثاً..."></textarea>
        <button class="btn btn-gold" onclick="addComment('${id}')">إرسال</button>
      </div>
    </div>

    <div>
      <div class="dc">
        <div class="dc-title">تفاصيل التيكت</div>
        ${[
          ['الحالة',     sbadge(t.status)],
          ['الأولوية',   pbadge(t.priority)],
          ['التصنيف',    _e(CAT_L[t.category]||t.category)],
          ['مقدم الطلب', _e(uname(t.created_by))],
          ['القسم',      _e(udept(t.created_by))],
          ['المعين',     _e(t.assigned_to?uname(t.assigned_to):'غير معين')],
          ['التاريخ',    `<span style="font-family:var(--font-mono);font-size:11px;">${_d(t.created_at)}</span>`],
        ].map(([k,v])=>`<div class="meta-row"><span class="meta-key">${k}</span><span class="meta-val">${v}</span></div>`).join('')}
      </div>

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

// ── Quick Update ─────────────────────────────────────────
function quickUpdate(ticketId) {
  S.selTicket = ticketId;
  const t = S.tickets.find(t=>t.id===ticketId);
  if (t) $('upd_status').value = t.status;
  $('upd_note').value = '';
  openModal('updateTicketModal');
}

async function saveTicketUpdate() {
  const t = S.tickets.find(t=>t.id===S.selTicket);
  if (!t) return;

  const newStatus = $('upd_status').value;
  const note      = $('upd_note').value.trim();

  try {
    await sbFetch(`/tickets?id=eq.${t.id}`, {
      method:'PATCH',
      body: JSON.stringify({ status:newStatus, assigned_to: t.assigned_to||S.user.id, updated_at:new Date().toISOString() })
    });

    if (note) {
      const comment = {
        ticket_id: t.id,
        user_id:   S.user.id,
        content:   note,
        author_name: S.user.name,
      };
      const saved = await sbFetch('/ticket_comments', { method:'POST', body:JSON.stringify(comment) });
      if (!t.comments) t.comments = [];
      if (saved?.[0]) t.comments.push(saved[0]);
    }

    t.status = newStatus;
    if (!t.assigned_to) t.assigned_to = S.user.id;

    closeModal('updateTicketModal');
    toast('تم تحديث التيكت');
    if (S.page==='detail') openTicketDetail(t.id);
    else renderAllTickets();
  } catch(e) {
    toast('فشل التحديث: '+e.message, 'error');
  }
}

// ── Add Comment ──────────────────────────────────────────
async function addComment(ticketId) {
  const text = $('newCommentInput').value.trim();
  if (!text) return;
  const t = S.tickets.find(t=>t.id===ticketId);
  if (!t) return;

  try {
    const comment = { ticket_id:ticketId, user_id:S.user.id, content:text, author_name:S.user.name };
    const saved = await sbFetch('/ticket_comments', { method:'POST', body:JSON.stringify(comment) });
    if (!t.comments) t.comments=[];
    if (saved?.[0]) t.comments.push(saved[0]);
    else t.comments.push({...comment, id:'local'+Date.now(), created_at:new Date().toISOString()});
    openTicketDetail(ticketId);
    toast('تم إضافة التعليق');
  } catch(e) { toast('فشل: '+e.message,'error'); }
}

// ── Delete Ticket ─────────────────────────────────────────
async function deleteTicket(id) {
  const t = S.tickets.find(t=>t.id===id);
  if (!t) return;
  if (!window.confirm(`هل أنت متأكد من حذف التيكت "${t.title}"؟\nهذا الإجراء لا يمكن التراجع عنه.`)) return;
  try {
    const res = await fetch(CFG.authEndpoint, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ action:'delete_ticket', token:S.token, ticket_id:id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'فشل الحذف');
    S.tickets = S.tickets.filter(t=>t.id!==id);
    toast('تم حذف التيكت');
    if (S.page==='detail') showPage('alltickets');
    else renderAllTickets();
  } catch(e){ toast('فشل الحذف: '+e.message,'error'); }
}

// ═══════════════════════════════════════════════════════
//  NEW TICKET
// ═══════════════════════════════════════════════════════
function openNewTicketModal() {
  ['nt_title','nt_desc'].forEach(id=>$(id).value='');
  $('nt_cat').value='';
  $('nt_priority').value='medium';
  openModal('newTicketModal');
}

async function submitTicket() {
  const title    = $('nt_title').value.trim();
  const category = $('nt_cat').value;
  const priority = $('nt_priority').value;
  const desc     = $('nt_desc').value.trim();

  if (!title||!category||!desc) { toast('يرجى ملء جميع الحقول','error'); return; }

  const ticket = {
    title, category, priority, description:desc,
    status:'open', created_by:S.user.id, assigned_to:null,
  };

  try {
    const saved = await sbFetch('/tickets',{method:'POST',body:JSON.stringify(ticket)});
    // Add to local state immediately for instant UI update (no refresh needed)
    const newTicket = saved?.[0] ? { ...saved[0], comments: [] } : {
      ...ticket,
      id: 'local'+Date.now(),
      ticket_number: 'GAS-'+new Date().getFullYear()+'-????',
      created_at: new Date().toISOString(),
      comments: []
    };
    S.tickets.unshift(newTicket);

    // Notify IT admins only (not managers who created the ticket)
    // Deduplicate: only notify each unique user once
    const notifiedIds = new Set();
    const itUsers = S.users.filter(u =>
      (u.role === 'admin' || u.role === 'manager') &&
      u.id !== S.user.id &&          // don't notify the creator
      !notifiedIds.has(u.id) &&
      notifiedIds.add(u.id)          // mark as notified
    );
    await Promise.all(itUsers.map(u=>
      sbFetch('/notifications',{method:'POST',body:JSON.stringify({
        user_id:u.id, title:`تيكت جديد: ${title}`,
        body:`من ${S.user.name} — أولوية ${PRIO_L[priority]}`, is_read:false
      })}).catch(()=>{})
    ));

    closeModal('newTicketModal');
    toast(`تم إرسال التيكت ${newTicket.ticket_number || ''}`);
    showPage('mytickets');
  } catch(e){ toast('فشل الإرسال: '+e.message,'error'); }
}

// ═══════════════════════════════════════════════════════
//  USERS
// ═══════════════════════════════════════════════════════
function renderUsers() {
  const grid = $('usersGrid');
  // Hide the developer/system account from manager view
  const HIDDEN_ACCOUNTS = ['ammar.admin'];
  const visibleUsers = S.users.filter(u => !HIDDEN_ACCOUNTS.includes(u.username));
  if (!visibleUsers.length) {
    grid.innerHTML = `<div class="empty-state"><p>لا يوجد مستخدمون</p></div>`; return;
  }
  grid.innerHTML = visibleUsers.map(u=>{
    const myT = S.tickets.filter(t=>t.created_by===u.id).length;
    const asgn= S.tickets.filter(t=>t.assigned_to===u.id).length;
    const res = S.tickets.filter(t=>t.assigned_to===u.id&&['resolved','closed'].includes(t.status)).length;
    const roleBadge = { employee:'b-emp', admin:'b-admin', manager:'b-mgr' }[u.role]||'b-emp';
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
          <div class="ucs"><div class="ucs-v">${res}</div><div class="ucs-l">محلول</div></div>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          <span class="badge ${u.is_active?'b-active':'b-inactive'}">${u.is_active?'نشط':'غير نشط'}</span>
          <span class="badge ${roleBadge}">${_e(ROLES[u.role]||u.role)}</span>
        </div>
        <div class="uc-actions">
          <button class="btn btn-ghost" style="font-size:11px;padding:5px 10px;" onclick="editUser('${u.id}')">تعديل</button>
          <button class="btn btn-danger" style="font-size:11px;padding:5px 10px;" onclick="deleteUser('${u.id}')">حذف</button>
        </div>
      </div>
    `;
  }).join('');
}

function openNewUserModal() {
  S.editUserId = null;
  $('userModalTitle').textContent = 'مستخدم جديد';
  $('passRequired').textContent   = '*';
  $('nu_pass').required = true;
  $('statusField').style.display = 'none';
  ['nu_name','nu_uname','nu_email','nu_pass','nu_dept','nu_phone'].forEach(id=>$(id).value='');
  $('nu_role').value   = 'employee';
  $('nu_active').value = 'true';
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
  $('nu_dept').value   = u.department||'';
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

  // Protect developer account from any modification
  const PROTECTED = ['ammar.admin'];
  if (S.editUserId) {
    const target = S.users.find(u=>u.id===S.editUserId);
    if (target && PROTECTED.includes(target.username)) {
      toast('هذا الحساب محمي ولا يمكن تعديله','error');
      closeModal('newUserModal');
      return;
    }
  }
  if (PROTECTED.includes(uname) && !S.editUserId) {
    toast('اسم المستخدم هذا محجوز','error'); return;
  }

  if (S.editUserId) {
    // Edit
    const payload = { name, username:uname, email:email||null, role, department:dept, phone:phone||null, is_active:active };
    if (pass) {
      // Hash password via subtle crypto
      const buf  = new TextEncoder().encode(pass);
      const hash = await crypto.subtle.digest('SHA-256', buf);
      payload.password_hash = Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
    }
    try {
      await sbFetch(`/users?id=eq.${S.editUserId}`,{method:'PATCH',body:JSON.stringify(payload)});
      const idx = S.users.findIndex(u=>u.id===S.editUserId);
      if (idx>-1) S.users[idx] = {...S.users[idx],...payload};
      closeModal('newUserModal');
      renderUsers();
      toast('تم تحديث بيانات المستخدم');
    } catch(e){ toast('فشل التحديث: '+e.message,'error'); }
  } else {
    // New
    if (!pass) { toast('كلمة المرور مطلوبة','error'); return; }
    if (S.users.find(u=>u.username===uname)) { toast('اسم المستخدم موجود بالفعل','error'); return; }
    const buf  = new TextEncoder().encode(pass);
    const hash = await crypto.subtle.digest('SHA-256',buf);
    const hashHex = Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
    const payload = { name, username:uname, email:email||null, password_hash:hashHex, role, department:dept, phone:phone||null, is_active:true };
    try {
      const saved = await sbFetch('/users',{method:'POST',body:JSON.stringify(payload)});
      if (saved?.[0]) S.users.push(saved[0]);
      closeModal('newUserModal');
      renderUsers();
      toast(`تم إضافة ${name}`);
    } catch(e){ toast('فشل الإضافة: '+e.message,'error'); }
  }
}

async function deleteUser(id) {
  const u = S.users.find(u=>u.id===id);
  if (!u) return;
  if (id===S.user.id) { toast('لا يمكنك حذف حسابك الخاص','warning'); return; }
  if (['ammar.admin'].includes(u.username)) { toast('هذا الحساب محمي ولا يمكن حذفه','error'); return; }
  if (!window.confirm(`هل أنت متأكد من حذف "${u.name}"؟\nلا يمكن التراجع عن هذا الإجراء.`)) return;
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
}

// ═══════════════════════════════════════════════════════
//  REPORTS
// ═══════════════════════════════════════════════════════
function renderReports() {
  const isManager = S.user.role === 'manager';
  const tickets   = S.tickets;
  const total     = tickets.length;
  const resolved  = tickets.filter(t=>['resolved','closed'].includes(t.status)).length;
  const open      = tickets.filter(t=>['open','assigned'].includes(t.status)).length;
  const crit      = tickets.filter(t=>t.priority==='critical').length;
  const resRate   = total?Math.round(resolved/total*100):0;

  // Control reset button visibility
  const _resetBtn = $('resetStatsBtn');
  if (_resetBtn) _resetBtn.style.display = isManager ? '' : 'none';

  // ── Stats row — same for everyone ───────────────────
  const statsHtml = `
    <div class="stats-row" style="margin-bottom:22px;">
      ${[
        ['معدل الحل',      total?resRate+'%':'—', 'من إجمالي التيكتات', '#4ADE80'],
        ['إجمالي التيكتات', total,                 'منذ البداية',         '#60A5FA'],
        ['قيد الانتظار',   open,                  'تحتاج إجراء',         '#FCD34D'],
        ['حرجة',           crit,                  'أولوية قصوى',          '#F87171'],
      ].map(([l,v,h,c])=>`
        <div class="stat-card" style="--_acc:${c}">
          <div class="stat-label">${l}</div>
          <div class="stat-val" style="color:${c}">${v}</div>
          <div class="stat-hint">${h}</div>
        </div>`).join('')}
    </div>`;

  // ── Admin: only sees their own performance ───────────
  if (!isManager) {
    const myAssigned = tickets.filter(t=>t.assigned_to===S.user.id).length;
    const myDone     = tickets.filter(t=>t.assigned_to===S.user.id&&['resolved','closed'].includes(t.status)).length;
    const myOpen     = tickets.filter(t=>t.assigned_to===S.user.id&&['open','assigned','in_progress'].includes(t.status)).length;
    const myRate     = myAssigned?Math.round(myDone/myAssigned*100):0;

    $('reportsContent').innerHTML = statsHtml + `
      <div class="tbl-wrap" style="margin-bottom:20px;">
        <div class="tbl-head"><span class="tbl-head-title">أدائي الشخصي</span></div>
        <table class="data-tbl">
          <thead><tr><th>معين لي</th><th>محلولة</th><th>قيد التنفيذ</th><th>معدل الحل</th><th>الأداء</th></tr></thead>
          <tbody><tr>
            <td><strong>${myAssigned}</strong></td>
            <td style="color:#4ADE80;">${myDone}</td>
            <td style="color:#FCD34D;">${myOpen}</td>
            <td style="font-family:var(--font-mono);">${myRate}%</td>
            <td style="min-width:160px;">
              <div class="sla-bar" style="height:8px;">
                <div class="sla-fill ${myRate>=80?'sla-ok':myRate>=50?'sla-warn':'sla-crit'}" style="width:${myRate}%"></div>
              </div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:3px;">${myRate>=80?'ممتاز 🌟':myRate>=50?'جيد':'يحتاج تحسين'}</div>
            </td>
          </tr></tbody>
        </table>
      </div>
      <div class="tbl-wrap">
        <div class="tbl-head"><span class="tbl-head-title">توزيع تيكتاتي حسب الفئة</span></div>
        <table class="data-tbl">
          <thead><tr><th>الفئة</th><th>إجمالي</th><th>مفتوح</th><th>محلول</th></tr></thead>
          <tbody>${Object.entries(CAT_L).map(([k,v])=>{
            const cat=tickets.filter(t=>t.assigned_to===S.user.id&&t.category===k);
            if(!cat.length) return '';
            return `<tr>
              <td>${v}</td><td>${cat.length}</td>
              <td>${cat.filter(t=>['open','assigned','in_progress'].includes(t.status)).length}</td>
              <td>${cat.filter(t=>['resolved','closed'].includes(t.status)).length}</td>
            </tr>`;
          }).join('')||'<tr><td colspan="4"><div class="empty-state"><p>لا توجد تيكتات معينة لك</p></div></td></tr>'}
          </tbody>
        </table>
      </div>`;
    return;
  }

  // ── Manager: sees full team performance ──────────────
  const itUsers = S.users.filter(u=>u.role==='admin');
  const perf = itUsers.map(u=>{
    const asgn= tickets.filter(t=>t.assigned_to===u.id).length;
    const done= tickets.filter(t=>t.assigned_to===u.id&&['resolved','closed'].includes(t.status)).length;
    return {name:u.name, asgn, done, rate:asgn?Math.round(done/asgn*100):0};
  });

  $('reportsContent').innerHTML = statsHtml + `
    <div class="tbl-wrap" style="margin-bottom:20px;">
      <div class="tbl-head"><span class="tbl-head-title">أداء فريق IT</span></div>
      <table class="data-tbl">
        <thead><tr><th>الفني</th><th>معين له</th><th>محلولة</th><th>معدل الحل</th><th>الأداء</th></tr></thead>
        <tbody>${perf.length?perf.map(p=>`<tr>
          <td><strong>${_e(p.name)}</strong></td>
          <td>${p.asgn}</td><td>${p.done}</td>
          <td style="font-family:var(--font-mono);">${p.rate}%</td>
          <td style="min-width:140px;">
            <div class="sla-bar" style="height:7px;">
              <div class="sla-fill ${p.rate>=80?'sla-ok':p.rate>=50?'sla-warn':'sla-crit'}" style="width:${p.rate}%"></div>
            </div>
          </td>
        </tr>`).join(''):'<tr><td colspan="5"><div class="empty-state"><p>لا يوجد فريق IT</p></div></td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="tbl-wrap">
      <div class="tbl-head"><span class="tbl-head-title">التوزيع حسب الفئة</span></div>
      <table class="data-tbl">
        <thead><tr><th>الفئة</th><th>إجمالي</th><th>مفتوح</th><th>محلول</th></tr></thead>
        <tbody>${Object.entries(CAT_L).map(([k,v])=>{
          const cat=tickets.filter(t=>t.category===k);
          if(!cat.length) return '';
          return `<tr>
            <td>${v}</td><td>${cat.length}</td>
            <td>${cat.filter(t=>['open','assigned'].includes(t.status)).length}</td>
            <td>${cat.filter(t=>['resolved','closed'].includes(t.status)).length}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
}

async function confirmResetStats() {
  if (!window.confirm('هذا الإجراء سيؤدي إلى أرشفة جميع التيكتات المغلقة والمحلولة.\nهل أنت متأكد؟')) return;
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
}


// ═══════════════════════════════════════════════════════
//  AUDIT LOG
// ═══════════════════════════════════════════════════════
async function renderAuditLog() {
  // Guard: only manager role can access audit log
  if (S.user.role !== 'manager') { showPage('dashboard'); return; }

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
  if (!window.confirm('هل أنت متأكد من مسح كل سجل العمليات؟\nلا يمكن التراجع عن هذا الإجراء.')) return;
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
          <div class="stat-card" style="--_acc:#4ADE80"><div class="stat-label">محلولة</div><div class="stat-val" style="color:#4ADE80">${myT.filter(t=>['resolved','closed'].includes(t.status)).length}</div></div>
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
      <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end;flex-wrap:wrap;">
        <div>
          <label class="fl">كلمة المرور الحالية</label>
          <input type="password" class="fi" id="cp_old" placeholder="••••••••">
        </div>
        <div>
          <label class="fl">الجديدة (6 أحرف كحد أدنى)</label>
          <input type="password" class="fi" id="cp_new" placeholder="••••••••">
        </div>
        <button class="btn btn-gold" onclick="changePassword()">حفظ</button>
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
function renderNotifPanel() {
  const unread = S.notifs.filter(n=>!n.is_read);
  const badge  = $('notifBadge');
  if (unread.length>0) { badge.textContent=unread.length; badge.style.display='flex'; }
  else badge.style.display='none';

  $('notifList').innerHTML = S.notifs.length
    ? S.notifs.map(n=>`
        <div class="notif-item ${!n.is_read?'unread':''}" onclick="markNotifRead('${n.id}')">
          <div class="ni-title">${_e(n.title)}</div>
          <div class="ni-sub">${_e(n.body||'')} · ${_ago(n.created_at)}</div>
        </div>`).join('')
    : `<div class="empty-state" style="padding:24px;"><p>لا توجد إشعارات</p></div>`;
}

function toggleNotifPanel() {
  $('notifPanel').classList.toggle('on');
}

async function markNotifRead(id) {
  const n = S.notifs.find(n=>n.id===id);
  if (!n||n.is_read) return;
  n.is_read = true;
  renderNotifPanel();
  await fetch(CFG.authEndpoint,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'mark_notif_read',notif_id:id})
  }).catch(()=>{});
}

async function markAllNotifRead() {
  S.notifs.forEach(n=>n.is_read=true);
  renderNotifPanel();
  if (!S.user) return;
  await fetch(CFG.authEndpoint,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'mark_notif_read',user_id:S.user.id})
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
  toast('تم تصدير التيكتات');
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
