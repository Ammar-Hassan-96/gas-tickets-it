<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GAS IT Desk — German Auto Service</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Tajawal:wght@300;400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">

<style>
/* ═══════════════════════════════════
   MERCEDES-BENZ GAS — DESIGN SYSTEM
   Dark Luxury · Silver Star Palette
   ═══════════════════════════════════ */
:root {
  --obsidian:    #0A0A0C;
  --carbon:      #111114;
  --graphite:    #1A1A1F;
  --slate:       #242429;
  --steel:       #2E2E35;
  --mist:        #3A3A43;

  --silver-dim:  #6B7280;
  --silver:      #9CA3AF;
  --silver-bright: #C8CDD5;
  --platinum:    #E5E7EB;
  --white:       #F9FAFB;

  --star-gold:   #B8975A;
  --star-gold-light: #D4AF72;
  --star-gold-dim: #7A6238;

  --accent-red:  #C0392B;
  --accent-blue: #2563EB;
  --success:     #16A34A;
  --warning:     #D97706;
  --info:        #0891B2;

  --border:      rgba(200,205,213,0.08);
  --border-gold: rgba(184,151,90,0.25);
  --glow-gold:   rgba(184,151,90,0.12);

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  --font-display: 'Playfair Display', serif;
  --font-body:    'Tajawal', sans-serif;
  --font-mono:    'IBM Plex Mono', monospace;

  --transition: 220ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 400ms cubic-bezier(0.4, 0, 0.2, 1);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html { scroll-behavior: smooth; }

body {
  font-family: var(--font-body);
  background: var(--obsidian);
  color: var(--silver-bright);
  min-height: 100vh;
  font-size: 14px;
  line-height: 1.6;
  overflow-x: hidden;
}

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: var(--carbon); }
::-webkit-scrollbar-thumb { background: var(--star-gold-dim); border-radius: 2px; }

/* ── Selection ── */
::selection { background: var(--star-gold-dim); color: var(--white); }

/* ════════════════════════════════════
   LOGIN SCREEN
   ════════════════════════════════════ */
#loginScreen {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  background: var(--obsidian);
  overflow: hidden;
}

.login-bg {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 80% 60% at 50% -10%, rgba(184,151,90,0.07) 0%, transparent 70%),
    radial-gradient(ellipse 40% 40% at 10% 80%,  rgba(184,151,90,0.04) 0%, transparent 60%),
    radial-gradient(ellipse 40% 40% at 90% 20%,  rgba(37,99,235,0.04)  0%, transparent 60%);
}

.login-grid {
  position: absolute; inset: 0; pointer-events: none;
  background-image:
    linear-gradient(rgba(184,151,90,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(184,151,90,0.04) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%);
}

.login-panel {
  position: relative; z-index: 1;
  width: 420px; max-width: calc(100vw - 32px);
  background: var(--carbon);
  border: 1px solid var(--border-gold);
  border-radius: var(--radius-xl);
  padding: 48px 40px 40px;
  box-shadow:
    0 0 0 1px rgba(184,151,90,0.05),
    0 32px 80px rgba(0,0,0,0.6),
    0 0 60px rgba(184,151,90,0.06);
  animation: panelIn 0.7s cubic-bezier(0.16,1,0.3,1) both;
}

@keyframes panelIn {
  from { opacity: 0; transform: translateY(24px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.login-brand {
  text-align: center;
  margin-bottom: 40px;
}

.mb-star {
  width: 56px; height: 56px;
  margin: 0 auto 20px;
  display: flex; align-items: center; justify-content: center;
}

.mb-star svg { width: 56px; height: 56px; }

.login-brand h1 {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  color: var(--white);
  letter-spacing: 0.02em;
  margin-bottom: 4px;
}

.login-brand p {
  font-size: 12px;
  color: var(--silver-dim);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.login-divider {
  width: 48px; height: 1px;
  background: linear-gradient(90deg, transparent, var(--star-gold), transparent);
  margin: 16px auto 0;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--silver-dim);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 8px;
}

.form-input {
  width: 100%;
  background: var(--graphite);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--white);
  outline: none;
  transition: var(--transition);
  text-align: right;
}

.form-input::placeholder { color: var(--silver-dim); }
.form-input:focus {
  border-color: var(--star-gold-dim);
  background: var(--slate);
  box-shadow: 0 0 0 3px var(--glow-gold);
}

.btn-login {
  width: 100%;
  background: linear-gradient(135deg, var(--star-gold) 0%, var(--star-gold-light) 50%, var(--star-gold) 100%);
  background-size: 200% 100%;
  border: none;
  border-radius: var(--radius-md);
  padding: 14px;
  font-family: var(--font-body);
  font-size: 15px;
  font-weight: 700;
  color: var(--obsidian);
  cursor: pointer;
  letter-spacing: 0.05em;
  transition: var(--transition);
  margin-top: 8px;
  position: relative;
  overflow: hidden;
}

.btn-login:hover {
  background-position: 100% 0;
  box-shadow: 0 4px 20px rgba(184,151,90,0.4);
  transform: translateY(-1px);
}

.btn-login:active { transform: translateY(0); }

.btn-login.loading { pointer-events: none; opacity: 0.7; }

.login-error {
  background: rgba(192,57,43,0.12);
  border: 1px solid rgba(192,57,43,0.3);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  font-size: 13px;
  color: #E57373;
  margin-bottom: 20px;
  display: none;
  text-align: center;
}

.demo-accounts {
  margin-top: 32px;
  border-top: 1px solid var(--border);
  padding-top: 24px;
}

.demo-title {
  font-size: 10px;
  color: var(--silver-dim);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  text-align: center;
  margin-bottom: 12px;
}

.demo-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.demo-btn {
  background: var(--graphite);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--silver);
  cursor: pointer;
  transition: var(--transition);
  text-align: center;
}

.demo-btn:hover {
  border-color: var(--star-gold-dim);
  color: var(--star-gold-light);
  background: var(--glow-gold);
}

.demo-btn .demo-role {
  font-size: 10px;
  color: var(--silver-dim);
  display: block;
  margin-top: 2px;
}

/* ════════════════════════════════════
   APP SHELL
   ════════════════════════════════════ */
#appShell {
  display: none;
  min-height: 100vh;
  flex-direction: column;
}
#appShell.visible { display: flex; }

/* ── Top Navigation Bar ── */
.topbar {
  height: 60px;
  background: var(--carbon);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 24px;
  position: sticky; top: 0; z-index: 100;
  gap: 16px;
}

.topbar-brand {
  display: flex; align-items: center; gap: 12px;
  flex-shrink: 0;
}

.topbar-star { width: 32px; height: 32px; }
.topbar-star svg { width: 32px; height: 32px; }

.topbar-name {
  display: flex; flex-direction: column;
  line-height: 1.2;
}

.topbar-name-main {
  font-family: var(--font-display);
  font-size: 15px; font-weight: 600;
  color: var(--white);
  letter-spacing: 0.02em;
}

.topbar-name-sub {
  font-size: 10px; color: var(--silver-dim);
  text-transform: uppercase; letter-spacing: 0.1em;
}

.topbar-divider {
  width: 1px; height: 32px;
  background: var(--border);
  flex-shrink: 0;
}

.topbar-nav {
  display: flex; align-items: center; gap: 4px;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
}
.topbar-nav::-webkit-scrollbar { display: none; }

.nav-btn {
  display: flex; align-items: center; gap: 7px;
  padding: 7px 14px;
  border-radius: var(--radius-md);
  border: none;
  background: transparent;
  color: var(--silver);
  font-family: var(--font-body);
  font-size: 13px;
  cursor: pointer;
  transition: var(--transition);
  white-space: nowrap;
  flex-shrink: 0;
}

.nav-btn:hover { background: var(--graphite); color: var(--silver-bright); }

.nav-btn.active {
  background: var(--glow-gold);
  color: var(--star-gold-light);
  border: 1px solid var(--border-gold);
}

.nav-btn svg { width: 15px; height: 15px; flex-shrink: 0; }

.topbar-actions {
  display: flex; align-items: center; gap: 8px;
  flex-shrink: 0;
  margin-right: auto;
}

.icon-btn {
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--graphite);
  color: var(--silver);
  cursor: pointer;
  transition: var(--transition);
  position: relative;
}
.icon-btn:hover { border-color: var(--star-gold-dim); color: var(--star-gold-light); }
.icon-btn svg { width: 16px; height: 16px; }

.notif-badge {
  position: absolute; top: -4px; right: -4px;
  width: 16px; height: 16px;
  background: var(--accent-red);
  border-radius: 50%;
  font-size: 9px; font-weight: 700;
  color: white;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid var(--carbon);
}

.user-chip {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px 6px 8px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--graphite);
  cursor: pointer;
  transition: var(--transition);
}
.user-chip:hover { border-color: var(--star-gold-dim); }

.user-avatar {
  width: 28px; height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--star-gold-dim), var(--star-gold));
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700;
  color: var(--obsidian);
  flex-shrink: 0;
}

.user-info-chip { display: flex; flex-direction: column; line-height: 1.2; }
.user-info-chip .uname { font-size: 13px; font-weight: 500; color: var(--white); }
.user-info-chip .urole { font-size: 10px; color: var(--silver-dim); text-transform: uppercase; letter-spacing: 0.08em; }

/* ── Main Layout ── */
.main-layout {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* ── Content Area ── */
.content-area {
  flex: 1;
  padding: 28px 32px;
  overflow-y: auto;
  min-width: 0;
}

/* ════════════════════════════════════
   PAGE SECTIONS
   ════════════════════════════════════ */
.page { display: none; }
.page.active { display: block; }

/* ── Page Header ── */
.page-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  margin-bottom: 28px;
  gap: 16px;
  flex-wrap: wrap;
}

.page-title-block { display: flex; flex-direction: column; gap: 4px; }

.page-label {
  font-size: 10px; color: var(--star-gold);
  text-transform: uppercase; letter-spacing: 0.15em; font-weight: 500;
}

.page-title {
  font-family: var(--font-display);
  font-size: 26px; font-weight: 600;
  color: var(--white); letter-spacing: 0.01em;
}

.page-sub { font-size: 13px; color: var(--silver-dim); }

/* ── Stats Grid ── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}

.stat-card {
  background: var(--carbon);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  transition: var(--transition);
  position: relative;
  overflow: hidden;
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0; right: 0;
  width: 3px; height: 100%;
  border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
  background: var(--star-gold);
  opacity: 0.4;
}

.stat-card:hover { border-color: var(--border-gold); transform: translateY(-2px); }

.stat-label {
  font-size: 11px; color: var(--silver-dim);
  text-transform: uppercase; letter-spacing: 0.1em;
  margin-bottom: 12px;
}

.stat-value {
  font-family: var(--font-display);
  font-size: 36px; font-weight: 700;
  color: var(--white);
  line-height: 1;
  margin-bottom: 6px;
}

.stat-delta {
  font-size: 11px; color: var(--silver-dim);
}

.stat-delta.up { color: var(--success); }
.stat-delta.down { color: var(--accent-red); }

/* ── Data Table ── */
.table-wrapper {
  background: var(--carbon);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.table-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  gap: 12px;
  flex-wrap: wrap;
}

.table-title {
  font-size: 14px; font-weight: 600; color: var(--white);
  font-family: var(--font-display);
}

.toolbar-actions { display: flex; gap: 8px; align-items: center; }

.search-input {
  background: var(--graphite);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 8px 14px;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--white);
  outline: none;
  transition: var(--transition);
  width: 220px;
  text-align: right;
}
.search-input::placeholder { color: var(--silver-dim); }
.search-input:focus { border-color: var(--star-gold-dim); box-shadow: 0 0 0 3px var(--glow-gold); }

.select-filter {
  background: var(--graphite);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--silver);
  outline: none;
  cursor: pointer;
  transition: var(--transition);
}
.select-filter:focus { border-color: var(--star-gold-dim); }

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  padding: 12px 16px;
  text-align: right;
  font-size: 10px;
  font-weight: 600;
  color: var(--silver-dim);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  border-bottom: 1px solid var(--border);
  background: var(--graphite);
  white-space: nowrap;
}

.data-table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  color: var(--silver-bright);
  vertical-align: middle;
}

.data-table tr:last-child td { border-bottom: none; }
.data-table tr:hover td { background: rgba(184,151,90,0.03); }

/* ── Badges ── */
.badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 10px;
  border-radius: 100px;
  font-size: 11px; font-weight: 500;
  white-space: nowrap;
}

.badge-open     { background: rgba(37,99,235,0.15);  color: #60A5FA; border: 1px solid rgba(37,99,235,0.3); }
.badge-progress { background: rgba(217,119,6,0.15);  color: #FCD34D; border: 1px solid rgba(217,119,6,0.3); }
.badge-resolved { background: rgba(22,163,74,0.15);  color: #4ADE80; border: 1px solid rgba(22,163,74,0.3); }
.badge-closed   { background: rgba(107,114,128,0.15);color: #9CA3AF; border: 1px solid rgba(107,114,128,0.3); }
.badge-critical { background: rgba(192,57,43,0.15);  color: #F87171; border: 1px solid rgba(192,57,43,0.3); }
.badge-high     { background: rgba(234,88,12,0.15);  color: #FB923C; border: 1px solid rgba(234,88,12,0.3); }
.badge-medium   { background: rgba(217,119,6,0.15);  color: #FCD34D; border: 1px solid rgba(217,119,6,0.3); }
.badge-low      { background: rgba(22,163,74,0.15);  color: #4ADE80; border: 1px solid rgba(22,163,74,0.3); }
.badge-assigned { background: rgba(8,145,178,0.15);  color: #22D3EE; border: 1px solid rgba(8,145,178,0.3); }

/* ── Buttons ── */
.btn {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 9px 18px;
  border-radius: var(--radius-md);
  border: none;
  font-family: var(--font-body);
  font-size: 13px; font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
  white-space: nowrap;
}

.btn-primary {
  background: linear-gradient(135deg, var(--star-gold), var(--star-gold-light));
  color: var(--obsidian);
}
.btn-primary:hover { box-shadow: 0 4px 16px rgba(184,151,90,0.35); transform: translateY(-1px); }

.btn-secondary {
  background: var(--graphite);
  border: 1px solid var(--border);
  color: var(--silver-bright);
}
.btn-secondary:hover { border-color: var(--star-gold-dim); color: var(--star-gold-light); }

.btn-danger {
  background: rgba(192,57,43,0.15);
  border: 1px solid rgba(192,57,43,0.3);
  color: #F87171;
}
.btn-danger:hover { background: rgba(192,57,43,0.25); }

.btn svg { width: 15px; height: 15px; }

/* ── Modal ── */
.modal-overlay {
  position: fixed; inset: 0; z-index: 500;
  background: rgba(0,0,0,0.75);
  backdrop-filter: blur(4px);
  display: none;
  align-items: center; justify-content: center;
  padding: 20px;
}
.modal-overlay.open { display: flex; }

.modal {
  background: var(--carbon);
  border: 1px solid var(--border-gold);
  border-radius: var(--radius-xl);
  width: 100%; max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  animation: modalIn 0.3s cubic-bezier(0.16,1,0.3,1) both;
}
@keyframes modalIn {
  from { opacity: 0; transform: scale(0.95) translateY(16px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
  position: sticky; top: 0;
  background: var(--carbon); z-index: 1;
}

.modal-title {
  font-family: var(--font-display);
  font-size: 18px; font-weight: 600;
  color: var(--white);
}

.modal-close {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--silver);
  cursor: pointer;
  font-size: 18px;
  transition: var(--transition);
}
.modal-close:hover { border-color: var(--accent-red); color: #F87171; }

.modal-body { padding: 24px; }
.modal-footer {
  display: flex; justify-content: flex-start; gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}

/* ── Form Grid ── */
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.form-grid .full { grid-column: 1 / -1; }

.field-label {
  display: block;
  font-size: 11px; font-weight: 500;
  color: var(--silver-dim);
  text-transform: uppercase; letter-spacing: 0.1em;
  margin-bottom: 6px;
}

.field-input, .field-select, .field-textarea {
  width: 100%;
  background: var(--graphite);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  font-family: var(--font-body);
  font-size: 13px; color: var(--white);
  outline: none;
  transition: var(--transition);
  text-align: right;
}
.field-input::placeholder, .field-textarea::placeholder { color: var(--silver-dim); }
.field-input:focus, .field-select:focus, .field-textarea:focus {
  border-color: var(--star-gold-dim);
  box-shadow: 0 0 0 3px var(--glow-gold);
}
.field-textarea { min-height: 100px; resize: vertical; }
.field-select option { background: var(--graphite); }

/* ── Ticket Detail Panel ── */
.ticket-detail {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 24px;
}

.detail-card {
  background: var(--carbon);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  margin-bottom: 16px;
}

.detail-card-title {
  font-size: 11px; color: var(--star-gold);
  text-transform: uppercase; letter-spacing: 0.12em; font-weight: 600;
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}

.timeline { display: flex; flex-direction: column; gap: 16px; }

.timeline-item {
  display: flex; gap: 12px;
  position: relative;
}

.timeline-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  background: var(--star-gold);
  flex-shrink: 0;
  margin-top: 5px;
}

.timeline-content { flex: 1; min-width: 0; }

.timeline-meta {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.timeline-author { font-size: 13px; font-weight: 600; color: var(--white); }
.timeline-action { font-size: 12px; color: var(--silver-dim); }
.timeline-time { font-size: 11px; color: var(--silver-dim); font-family: var(--font-mono); }

.timeline-text {
  font-size: 13px; color: var(--silver-bright);
  background: var(--graphite);
  border-radius: var(--radius-md);
  padding: 10px 14px;
}

/* ── Comment Input ── */
.comment-box {
  background: var(--carbon);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
}
.comment-input {
  width: 100%;
  background: var(--graphite);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  font-family: var(--font-body);
  font-size: 13px; color: var(--white);
  outline: none;
  transition: var(--transition);
  resize: none;
  height: 80px;
  text-align: right;
  margin-bottom: 10px;
}
.comment-input:focus { border-color: var(--star-gold-dim); box-shadow: 0 0 0 3px var(--glow-gold); }

/* ── Notification Dropdown ── */
.notif-panel {
  position: absolute; top: 56px; left: 16px;
  width: 360px;
  background: var(--carbon);
  border: 1px solid var(--border-gold);
  border-radius: var(--radius-xl);
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  display: none; z-index: 200;
  overflow: hidden;
  animation: dropIn 0.2s ease;
}
.notif-panel.open { display: block; }
@keyframes dropIn {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.notif-header {
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
}
.notif-header-title { font-size: 13px; font-weight: 600; color: var(--white); }

.notif-list { max-height: 320px; overflow-y: auto; }

.notif-item {
  padding: 12px 18px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: var(--transition);
}
.notif-item:hover { background: var(--graphite); }
.notif-item.unread { border-right: 3px solid var(--star-gold); }
.notif-item-title { font-size: 13px; color: var(--white); margin-bottom: 2px; }
.notif-item-sub { font-size: 11px; color: var(--silver-dim); }

/* ── Dashboard Charts ── */
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 20px;
}

.col-4 { grid-column: span 4; }
.col-5 { grid-column: span 5; }
.col-6 { grid-column: span 6; }
.col-7 { grid-column: span 7; }
.col-8 { grid-column: span 8; }
.col-12 { grid-column: span 12; }

@media (max-width: 1100px) {
  .col-4, .col-5, .col-6, .col-7, .col-8 { grid-column: span 12; }
}

.chart-card {
  background: var(--carbon);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
}

.chart-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px;
}

.chart-title {
  font-family: var(--font-display);
  font-size: 14px; font-weight: 600; color: var(--white);
}

.chart-sub { font-size: 11px; color: var(--silver-dim); margin-top: 2px; }

/* ── Mini Bar Chart ── */
.bar-chart { display: flex; align-items: flex-end; gap: 8px; height: 100px; }

.bar-item {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
}

.bar-fill {
  width: 100%;
  border-radius: 3px 3px 0 0;
  background: linear-gradient(to top, var(--star-gold-dim), var(--star-gold));
  transition: height 0.8s cubic-bezier(0.4,0,0.2,1);
  min-height: 4px;
}

.bar-label { font-size: 10px; color: var(--silver-dim); }
.bar-val { font-size: 11px; color: var(--silver-bright); font-family: var(--font-mono); }

/* ── Donut Chart ── */
.donut-wrap {
  display: flex; align-items: center; gap: 20px;
}

.donut-legend {
  flex: 1;
  display: flex; flex-direction: column; gap: 8px;
}

.legend-item {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: var(--silver);
}
.legend-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.legend-val { margin-right: auto; font-family: var(--font-mono); font-size: 13px; color: var(--white); }

/* ── Empty State ── */
.empty-state {
  text-align: center;
  padding: 60px 24px;
  color: var(--silver-dim);
}
.empty-state svg { width: 48px; height: 48px; opacity: 0.3; margin-bottom: 16px; }
.empty-state p { font-size: 14px; }

/* ── SLA Indicator ── */
.sla-bar {
  height: 4px; border-radius: 2px;
  background: var(--steel);
  overflow: hidden;
  margin-top: 4px;
}
.sla-fill {
  height: 100%; border-radius: 2px;
  transition: width 0.5s ease;
}
.sla-ok { background: var(--success); }
.sla-warn { background: var(--warning); }
.sla-critical { background: var(--accent-red); }

/* ── Ticket Number ── */
.ticket-num {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--star-gold);
  letter-spacing: 0.05em;
}

/* ── Action Menu ── */
.action-menu { display: flex; gap: 6px; }

.action-btn {
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--silver);
  font-family: var(--font-body);
  font-size: 11px;
  cursor: pointer;
  transition: var(--transition);
}
.action-btn:hover { border-color: var(--star-gold-dim); color: var(--star-gold-light); }
.action-btn.danger:hover { border-color: rgba(192,57,43,0.5); color: #F87171; }

/* ── Users Page ── */
.users-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.user-card {
  background: var(--carbon);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  transition: var(--transition);
}
.user-card:hover { border-color: var(--border-gold); transform: translateY(-2px); }

.user-card-top {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 16px;
}

.user-card-avatar {
  width: 44px; height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--star-gold-dim), var(--star-gold));
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 700; color: var(--obsidian);
  flex-shrink: 0;
}

.user-card-info { flex: 1; min-width: 0; }
.user-card-name { font-size: 15px; font-weight: 600; color: var(--white); }
.user-card-role { font-size: 11px; color: var(--silver-dim); text-transform: uppercase; letter-spacing: 0.08em; }

.user-card-stats {
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  gap: 8px; margin-bottom: 14px;
}

.ustat {
  text-align: center;
  background: var(--graphite);
  border-radius: var(--radius-md);
  padding: 8px 4px;
}
.ustat-val { font-size: 18px; font-weight: 700; color: var(--white); font-family: var(--font-display); }
.ustat-label { font-size: 9px; color: var(--silver-dim); text-transform: uppercase; letter-spacing: 0.08em; }

/* ── Report Card ── */
.report-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

/* ── Toast ── */
.toast {
  position: fixed; bottom: 24px; left: 24px;
  background: var(--graphite);
  border: 1px solid var(--border-gold);
  border-radius: var(--radius-lg);
  padding: 12px 20px 12px 16px;
  display: flex; align-items: center; gap: 12px;
  min-width: 280px; max-width: 400px;
  z-index: 9999;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  animation: toastIn 0.3s ease;
  cursor: pointer;
}
@keyframes toastIn {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
.toast-icon { font-size: 18px; flex-shrink: 0; }
.toast-text { flex: 1; font-size: 13px; color: var(--white); }
.toast-close { color: var(--silver-dim); font-size: 16px; }

/* ── Loading Overlay ── */
.loading-overlay {
  position: fixed; inset: 0; z-index: 9000;
  background: var(--obsidian);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 20px;
}

.loading-star svg {
  width: 64px; height: 64px;
  animation: starPulse 1.5s ease-in-out infinite;
}

@keyframes starPulse {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50%       { opacity: 1;   transform: scale(1.1); }
}

.loading-bar {
  width: 200px; height: 2px;
  background: var(--steel);
  border-radius: 1px;
  overflow: hidden;
}
.loading-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--star-gold-dim), var(--star-gold));
  border-radius: 1px;
  animation: loadFill 1.5s ease infinite;
}
@keyframes loadFill {
  0%   { width: 0; }
  50%  { width: 70%; }
  100% { width: 100%; }
}
.loading-text { font-size: 12px; color: var(--silver-dim); letter-spacing: 0.15em; text-transform: uppercase; }

/* ── Responsive ── */
@media (max-width: 768px) {
  .content-area { padding: 16px; }
  .topbar { padding: 0 16px; }
  .topbar-name-sub { display: none; }
  .ticket-detail { grid-template-columns: 1fr; }
  .form-grid { grid-template-columns: 1fr; }
  .stats-grid { grid-template-columns: 1fr 1fr; }
}
</style>
</head>
<body>

<!-- Loading Overlay -->
<div class="loading-overlay" id="loadingOverlay">
  <div class="loading-star">
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(184,151,90,0.2)" stroke-width="1"/>
      <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(184,151,90,0.15)" stroke-width="0.5"/>
      <g fill="none" stroke="#B8975A" stroke-width="1.5">
        <line x1="50" y1="8"  x2="50" y2="30"/>
        <line x1="50" y1="70" x2="50" y2="92"/>
        <line x1="8"  y1="50" x2="30" y2="50"/>
        <line x1="70" y1="50" x2="92" y2="50"/>
        <line x1="20" y1="20" x2="36" y2="36"/>
        <line x1="64" y1="64" x2="80" y2="80"/>
        <line x1="80" y1="20" x2="64" y2="36"/>
        <line x1="36" y1="64" x2="20" y2="80"/>
        <circle cx="50" cy="50" r="14" fill="rgba(184,151,90,0.1)" stroke="#B8975A" stroke-width="1.5"/>
        <circle cx="50" cy="50" r="6"  fill="#B8975A"/>
      </g>
    </svg>
  </div>
  <div class="loading-bar"><div class="loading-fill"></div></div>
  <div class="loading-text">GAS IT Desk</div>
</div>

<!-- ═══════════════════════════════════
     LOGIN SCREEN
     ═══════════════════════════════════ -->
<div id="loginScreen" style="display:none;">
  <div class="login-bg"></div>
  <div class="login-grid"></div>

  <div class="login-panel">
    <div class="login-brand">
      <div class="mb-star">
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(184,151,90,0.3)" stroke-width="1"/>
          <g fill="none" stroke="#B8975A" stroke-width="2">
            <line x1="50" y1="10" x2="50" y2="35"/>
            <line x1="50" y1="65" x2="50" y2="90"/>
            <line x1="10" y1="50" x2="35" y2="50"/>
            <line x1="65" y1="50" x2="90" y2="50"/>
            <line x1="21" y1="21" x2="39" y2="39"/>
            <line x1="61" y1="61" x2="79" y2="79"/>
            <line x1="79" y1="21" x2="61" y2="39"/>
            <line x1="39" y1="61" x2="21" y2="79"/>
            <circle cx="50" cy="50" r="15" fill="rgba(184,151,90,0.08)" stroke="#B8975A" stroke-width="2"/>
            <circle cx="50" cy="50" r="6" fill="#B8975A"/>
          </g>
        </svg>
      </div>
      <h1>GAS IT Desk</h1>
      <p>German Auto Service · Mercedes-Benz Egypt</p>
      <div class="login-divider"></div>
    </div>

    <div class="login-error" id="loginError"></div>

    <div class="form-group">
      <label class="form-label">اسم المستخدم</label>
      <input type="text" class="form-input" id="loginUser" placeholder="أدخل اسم المستخدم" autocomplete="username">
    </div>

    <div class="form-group">
      <label class="form-label">كلمة المرور</label>
      <input type="password" class="form-input" id="loginPass" placeholder="••••••••" autocomplete="current-password">
    </div>

    <button class="btn-login" id="loginBtn" onclick="doLogin()">
      تسجيل الدخول
    </button>

    <div class="demo-accounts">
      <div class="demo-title">حسابات تجريبية</div>
      <div class="demo-grid">
        <button class="demo-btn" onclick="fillDemo('mohammed','pass123')">
          محمد الأحمد
          <span class="demo-role">موظف</span>
        </button>
        <button class="demo-btn" onclick="fillDemo('ahmed.it','pass123')">
          أحمد كمال
          <span class="demo-role">IT Admin</span>
        </button>
        <button class="demo-btn" onclick="fillDemo('sara.it','pass123')">
          سارة محمود
          <span class="demo-role">IT Admin</span>
        </button>
        <button class="demo-btn" onclick="fillDemo('manager','pass123')">
          إدارة النظام
          <span class="demo-role">مدير</span>
        </button>
      </div>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════
     APP SHELL
     ═══════════════════════════════════ -->
<div id="appShell">

  <!-- Topbar -->
  <header class="topbar">
    <div class="topbar-brand">
      <div class="topbar-star">
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <g fill="none" stroke="#B8975A" stroke-width="2.5">
            <line x1="50" y1="5"  x2="50" y2="35"/>
            <line x1="50" y1="65" x2="50" y2="95"/>
            <line x1="5"  y1="50" x2="35" y2="50"/>
            <line x1="65" y1="50" x2="95" y2="50"/>
            <line x1="18" y1="18" x2="38" y2="38"/>
            <line x1="62" y1="62" x2="82" y2="82"/>
            <line x1="82" y1="18" x2="62" y2="38"/>
            <line x1="38" y1="62" x2="18" y2="82"/>
            <circle cx="50" cy="50" r="14" fill="rgba(184,151,90,0.1)" stroke="#B8975A" stroke-width="2"/>
            <circle cx="50" cy="50" r="5" fill="#B8975A"/>
          </g>
        </svg>
      </div>
      <div class="topbar-name">
        <span class="topbar-name-main">GAS IT Desk</span>
        <span class="topbar-name-sub">German Auto Service</span>
      </div>
    </div>

    <div class="topbar-divider"></div>

    <nav class="topbar-nav" id="mainNav">
      <!-- Dynamic based on role -->
    </nav>

    <div class="topbar-actions">
      <div style="position:relative;">
        <button class="icon-btn" onclick="toggleNotifications()" title="الإشعارات">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span class="notif-badge" id="notifBadge">3</span>
        </button>
        <div class="notif-panel" id="notifPanel">
          <div class="notif-header">
            <span class="notif-header-title">الإشعارات</span>
            <button onclick="markAllRead()" style="font-size:11px;color:var(--star-gold);background:none;border:none;cursor:pointer;">قراءة الكل</button>
          </div>
          <div class="notif-list" id="notifList"></div>
        </div>
      </div>

      <div class="user-chip" id="userChip" onclick="showPage('profile')">
        <div class="user-avatar" id="topbarAvatar"></div>
        <div class="user-info-chip">
          <span class="uname" id="topbarName">—</span>
          <span class="urole" id="topbarRole">—</span>
        </div>
      </div>

      <button class="icon-btn" onclick="logout()" title="تسجيل الخروج" style="color:#F87171;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
      </button>
    </div>
  </header>

  <!-- Main Content -->
  <div class="main-layout">
    <main class="content-area" id="contentArea">

      <!-- ── Dashboard Page ── -->
      <div class="page" id="page-dashboard">
        <div class="page-header">
          <div class="page-title-block">
            <span class="page-label">نظرة عامة</span>
            <h1 class="page-title">لوحة التحكم</h1>
            <p class="page-sub" id="dashboardSub">مرحباً بك</p>
          </div>
          <button class="btn btn-primary" onclick="showModal('newTicketModal')" id="btnNewTicket">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            تيكت جديد
          </button>
        </div>

        <div class="stats-grid" id="dashboardStats"></div>

        <div class="dashboard-grid" id="dashboardCharts"></div>
      </div>

      <!-- ── My Tickets Page ── -->
      <div class="page" id="page-mytickets">
        <div class="page-header">
          <div class="page-title-block">
            <span class="page-label">تيكتاتي</span>
            <h1 class="page-title">طلباتي</h1>
            <p class="page-sub">جميع طلبات الدعم الفني المقدمة</p>
          </div>
          <button class="btn btn-primary" onclick="showModal('newTicketModal')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            تيكت جديد
          </button>
        </div>
        <div class="table-wrapper">
          <div class="table-toolbar">
            <span class="table-title">قائمة التيكتات</span>
            <div class="toolbar-actions">
              <input type="text" class="search-input" placeholder="بحث..." oninput="filterTickets(this.value)">
              <select class="select-filter" onchange="filterByStatus(this.value)">
                <option value="">كل الحالات</option>
                <option value="open">مفتوح</option>
                <option value="in_progress">قيد التنفيذ</option>
                <option value="resolved">محلول</option>
                <option value="closed">مغلق</option>
              </select>
            </div>
          </div>
          <div style="overflow-x:auto;">
            <table class="data-table" id="myTicketsTable">
              <thead>
                <tr>
                  <th>رقم التيكت</th>
                  <th>العنوان</th>
                  <th>التصنيف</th>
                  <th>الأولوية</th>
                  <th>الحالة</th>
                  <th>التاريخ</th>
                  <th>إجراء</th>
                </tr>
              </thead>
              <tbody id="myTicketsTbody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ── All Tickets Page (IT/Manager) ── -->
      <div class="page" id="page-alltickets">
        <div class="page-header">
          <div class="page-title-block">
            <span class="page-label">إدارة التيكتات</span>
            <h1 class="page-title">جميع التيكتات</h1>
            <p class="page-sub">إدارة وتتبع طلبات الدعم الفني</p>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary" onclick="exportCSV()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              تصدير
            </button>
          </div>
        </div>
        <div class="table-wrapper">
          <div class="table-toolbar">
            <span class="table-title">قائمة التيكتات</span>
            <div class="toolbar-actions">
              <input type="text" class="search-input" placeholder="بحث..." oninput="filterAllTickets(this.value)">
              <select class="select-filter" onchange="filterAllByStatus(this.value)">
                <option value="">كل الحالات</option>
                <option value="open">مفتوح</option>
                <option value="assigned">معين</option>
                <option value="in_progress">قيد التنفيذ</option>
                <option value="resolved">محلول</option>
                <option value="closed">مغلق</option>
              </select>
              <select class="select-filter" onchange="filterAllByPriority(this.value)">
                <option value="">كل الأولويات</option>
                <option value="critical">حرجة</option>
                <option value="high">عالية</option>
                <option value="medium">متوسطة</option>
                <option value="low">منخفضة</option>
              </select>
            </div>
          </div>
          <div style="overflow-x:auto;">
            <table class="data-table" id="allTicketsTable">
              <thead>
                <tr>
                  <th>رقم التيكت</th>
                  <th>العنوان</th>
                  <th>مقدم الطلب</th>
                  <th>القسم</th>
                  <th>الأولوية</th>
                  <th>الحالة</th>
                  <th>المعين</th>
                  <th>SLA</th>
                  <th>إجراء</th>
                </tr>
              </thead>
              <tbody id="allTicketsTbody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ── Ticket Detail Page ── -->
      <div class="page" id="page-ticketdetail">
        <div class="page-header">
          <div style="display:flex;align-items:center;gap:12px;">
            <button class="btn btn-secondary" onclick="goBack()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              رجوع
            </button>
            <div class="page-title-block">
              <span class="page-label" id="detailTicketNum"></span>
              <h1 class="page-title" id="detailTicketTitle" style="font-size:20px;"></h1>
            </div>
          </div>
          <div id="detailActions" style="display:flex;gap:8px;"></div>
        </div>
        <div class="ticket-detail" id="ticketDetailContent"></div>
      </div>

      <!-- ── Users Page (Manager) ── -->
      <div class="page" id="page-users">
        <div class="page-header">
          <div class="page-title-block">
            <span class="page-label">إدارة الفريق</span>
            <h1 class="page-title">المستخدمون</h1>
            <p class="page-sub">إدارة حسابات الموظفين وفريق IT</p>
          </div>
          <button class="btn btn-primary" onclick="showModal('newUserModal')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            مستخدم جديد
          </button>
        </div>
        <div class="users-grid" id="usersGrid"></div>
      </div>

      <!-- ── Reports Page ── -->
      <div class="page" id="page-reports">
        <div class="page-header">
          <div class="page-title-block">
            <span class="page-label">تقارير وإحصاءات</span>
            <h1 class="page-title">لوحة التقارير</h1>
            <p class="page-sub">تحليل أداء فريق الدعم الفني</p>
          </div>
          <button class="btn btn-secondary" onclick="generateReport()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            إنشاء تقرير
          </button>
        </div>
        <div id="reportsContent"></div>
      </div>

      <!-- ── Profile Page ── -->
      <div class="page" id="page-profile">
        <div class="page-header">
          <div class="page-title-block">
            <span class="page-label">الحساب الشخصي</span>
            <h1 class="page-title">ملفي الشخصي</h1>
          </div>
        </div>
        <div id="profileContent"></div>
      </div>

    </main>
  </div>
</div>

<!-- ═══════════════════════════════════
     MODALS
     ═══════════════════════════════════ -->

<!-- New Ticket Modal -->
<div class="modal-overlay" id="newTicketModal">
  <div class="modal">
    <div class="modal-header">
      <span class="modal-title">تيكت دعم فني جديد</span>
      <button class="modal-close" onclick="hideModal('newTicketModal')">×</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="full">
          <label class="field-label">عنوان المشكلة *</label>
          <input type="text" class="field-input" id="nt_title" placeholder="وصف مختصر للمشكلة">
        </div>
        <div>
          <label class="field-label">التصنيف *</label>
          <select class="field-select" id="nt_category">
            <option value="">اختر التصنيف</option>
            <option value="hardware">أجهزة</option>
            <option value="software">برامج</option>
            <option value="network">شبكة</option>
            <option value="email">بريد إلكتروني</option>
            <option value="access">صلاحيات</option>
            <option value="printer">طابعة</option>
            <option value="security">أمن معلومات</option>
            <option value="other">أخرى</option>
          </select>
        </div>
        <div>
          <label class="field-label">الأولوية *</label>
          <select class="field-select" id="nt_priority">
            <option value="low">منخفضة</option>
            <option value="medium" selected>متوسطة</option>
            <option value="high">عالية</option>
            <option value="critical">حرجة</option>
          </select>
        </div>
        <div class="full">
          <label class="field-label">وصف تفصيلي *</label>
          <textarea class="field-textarea" id="nt_desc" placeholder="اشرح المشكلة بالتفصيل..."></textarea>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="submitTicket()">إرسال الطلب</button>
      <button class="btn btn-secondary" onclick="hideModal('newTicketModal')">إلغاء</button>
    </div>
  </div>
</div>

<!-- Assign Ticket Modal (IT) -->
<div class="modal-overlay" id="assignModal">
  <div class="modal" style="max-width:440px;">
    <div class="modal-header">
      <span class="modal-title">تعيين وتحديث التيكت</span>
      <button class="modal-close" onclick="hideModal('assignModal')">×</button>
    </div>
    <div class="modal-body">
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div>
          <label class="field-label">الحالة</label>
          <select class="field-select" id="assign_status">
            <option value="assigned">معين</option>
            <option value="in_progress">قيد التنفيذ</option>
            <option value="resolved">محلول</option>
            <option value="closed">مغلق</option>
          </select>
        </div>
        <div>
          <label class="field-label">ملاحظات</label>
          <textarea class="field-textarea" id="assign_note" placeholder="أضف ملاحظة أو تحديث..."></textarea>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="saveAssignment()">حفظ</button>
      <button class="btn btn-secondary" onclick="hideModal('assignModal')">إلغاء</button>
    </div>
  </div>
</div>

<!-- New User Modal -->
<div class="modal-overlay" id="newUserModal">
  <div class="modal">
    <div class="modal-header">
      <span class="modal-title">إضافة مستخدم جديد</span>
      <button class="modal-close" onclick="hideModal('newUserModal')">×</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div>
          <label class="field-label">الاسم الكامل *</label>
          <input type="text" class="field-input" id="nu_name" placeholder="الاسم الكامل">
        </div>
        <div>
          <label class="field-label">اسم المستخدم *</label>
          <input type="text" class="field-input" id="nu_username" placeholder="username">
        </div>
        <div>
          <label class="field-label">البريد الإلكتروني *</label>
          <input type="email" class="field-input" id="nu_email" placeholder="email@gas.com">
        </div>
        <div>
          <label class="field-label">كلمة المرور *</label>
          <input type="password" class="field-input" id="nu_pass" placeholder="••••••••">
        </div>
        <div>
          <label class="field-label">الدور *</label>
          <select class="field-select" id="nu_role">
            <option value="employee">موظف</option>
            <option value="admin">IT Admin</option>
            <option value="manager">مدير</option>
          </select>
        </div>
        <div>
          <label class="field-label">القسم</label>
          <input type="text" class="field-input" id="nu_dept" placeholder="المبيعات، الورشة...">
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="saveNewUser()">إضافة</button>
      <button class="btn btn-secondary" onclick="hideModal('newUserModal')">إلغاء</button>
    </div>
  </div>
</div>

<script>
/* ════════════════════════════════════════════════════════
   GAS IT DESK — Application Logic
   German Auto Service · Mercedes-Benz Egypt
   ════════════════════════════════════════════════════════ */

// ── Supabase Config ──────────────────────────────────────
const SUPABASE_URL = 'YOUR_SUPABASE_URL';   // ← ضع هنا
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY'; // ← ضع هنا
const AUTH_ENDPOINT = '/.netlify/functions/auth';

// ── App State ────────────────────────────────────────────
const State = {
  user: null,
  session: null,
  tickets: [],
  users: [],
  notifications: [],
  currentPage: 'dashboard',
  prevPage: null,
  selectedTicketId: null,
  filterStatus: '',
  filterPriority: '',
  searchQuery: '',
  localMode: false
};

// ── Demo Data (Local Mode) ───────────────────────────────
const DEMO_USERS = [
  { id:'u1', username:'mohammed',  password:'pass123', name:'محمد الأحمد',    role:'employee', department:'المبيعات',       email:'m.ahmed@gas.com',   is_active:true },
  { id:'u2', username:'ahmed.it',  password:'pass123', name:'أحمد كمال',      role:'admin',    department:'IT',             email:'a.kamal@gas.com',   is_active:true },
  { id:'u3', username:'sara.it',   password:'pass123', name:'سارة محمود',     role:'admin',    department:'IT',             email:'s.mahmoud@gas.com', is_active:true },
  { id:'u4', username:'manager',   password:'pass123', name:'المدير العام',   role:'manager',  department:'الإدارة',         email:'manager@gas.com',   is_active:true },
  { id:'u5', username:'khalid',    password:'pass123', name:'خالد إبراهيم',   role:'employee', department:'الورشة',          email:'k.ibrahim@gas.com', is_active:true },
  { id:'u6', username:'noura',     password:'pass123', name:'نورا سليم',      role:'employee', department:'خدمة العملاء',   email:'n.salim@gas.com',   is_active:true },
];

const DEMO_TICKETS = [
  { id:'t1', ticket_number:'GAS-2024-0001', title:'الطابعة لا تستجيب', description:'طابعة مكتب المبيعات متوقفة عن العمل منذ الصباح', category:'printer',  priority:'high',    status:'open',        created_by:'u1', assigned_to:null, created_at: new Date(Date.now()-86400000*2).toISOString(), timeline:[], comments:[] },
  { id:'t2', ticket_number:'GAS-2024-0002', title:'مشكلة في الشبكة',    description:'سرعة الإنترنت بطيئة جداً في الطابق الثاني',       category:'network',  priority:'medium',  status:'in_progress', created_by:'u5', assigned_to:'u2', created_at: new Date(Date.now()-86400000*1).toISOString(), timeline:[], comments:[] },
  { id:'t3', ticket_number:'GAS-2024-0003', title:'نسيت كلمة المرور',   description:'لا أستطيع الدخول على نظام ERP',                    category:'access',   priority:'high',    status:'resolved',    created_by:'u6', assigned_to:'u3', created_at: new Date(Date.now()-86400000*3).toISOString(), timeline:[], comments:[] },
  { id:'t4', ticket_number:'GAS-2024-0004', title:'الحاسوب بطيء',       description:'الحاسوب يأخذ 10 دقائق للتشغيل',                    category:'hardware', priority:'low',     status:'open',        created_by:'u1', assigned_to:null, created_at: new Date(Date.now()-3600000).toISOString(),   timeline:[], comments:[] },
  { id:'t5', ticket_number:'GAS-2024-0005', title:'فيروس مشتبه به',      description:'ظهرت نوافذ منبثقة غريبة على الشاشة',              category:'security', priority:'critical',status:'assigned',    created_by:'u5', assigned_to:'u2', created_at: new Date(Date.now()-7200000).toISOString(),   timeline:[], comments:[] },
  { id:'t6', ticket_number:'GAS-2024-0006', title:'إعداد بريد إلكتروني', description:'أحتاج إعداد البريد على هاتفي الجديد',              category:'email',    priority:'low',     status:'closed',      created_by:'u6', assigned_to:'u3', created_at: new Date(Date.now()-86400000*5).toISOString(), timeline:[], comments:[] },
];

// ── Helpers ──────────────────────────────────────────────
const _esc = s => String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const _el  = id => document.getElementById(id);
const _fmt = iso => { const d=new Date(iso); return d.toLocaleDateString('ar-EG',{day:'2-digit',month:'short',year:'numeric'}); };
const _time = iso => { const d=new Date(iso); return d.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}); };

function genId() { return 't'+Date.now()+Math.floor(Math.random()*1000); }
function genTicketNum() {
  const y = new Date().getFullYear();
  const n = State.tickets.length + 1;
  return `GAS-${y}-${String(n).padStart(4,'0')}`;
}

const ROLE_LABELS = { employee:'موظف', admin:'IT Admin', manager:'مدير' };
const STATUS_LABELS = { open:'مفتوح', assigned:'معين', in_progress:'قيد التنفيذ', resolved:'محلول', closed:'مغلق', escalated:'مصعد' };
const PRIORITY_LABELS = { critical:'حرجة', high:'عالية', medium:'متوسطة', low:'منخفضة' };
const CATEGORY_LABELS = { hardware:'أجهزة', software:'برامج', network:'شبكة', email:'بريد', access:'صلاحيات', printer:'طابعة', security:'أمن', other:'أخرى' };
const STATUS_BADGE = { open:'badge-open', assigned:'badge-assigned', in_progress:'badge-progress', resolved:'badge-resolved', closed:'badge-closed', escalated:'badge-critical' };
const PRIORITY_BADGE = { critical:'badge-critical', high:'badge-high', medium:'badge-medium', low:'badge-low' };

function badge(text, cls) { return `<span class="badge ${cls}">${_esc(text)}</span>`; }
function statusBadge(s)   { return badge(STATUS_LABELS[s]||s, STATUS_BADGE[s]||'badge-open'); }
function priorityBadge(p) { return badge(PRIORITY_LABELS[p]||p, PRIORITY_BADGE[p]||'badge-medium'); }

function getUserName(id) { return State.users.find(u=>u.id===id)?.name || '—'; }

// ── Toast ────────────────────────────────────────────────
function showToast(msg, type='success') {
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span class="toast-text">${_esc(msg)}</span><span class="toast-close">×</span>`;
  el.onclick = () => el.remove();
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Loading ──────────────────────────────────────────────
function showLoading() { _el('loadingOverlay').style.display = 'flex'; }
function hideLoading() {
  setTimeout(() => {
    _el('loadingOverlay').style.display = 'none';
  }, 800);
}

// ══════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════
function fillDemo(u, p) {
  _el('loginUser').value = u;
  _el('loginPass').value = p;
}

async function doLogin() {
  const username = _el('loginUser').value.trim();
  const password = _el('loginPass').value;
  const errEl = _el('loginError');

  if (!username || !password) {
    errEl.textContent = 'يرجى إدخال اسم المستخدم وكلمة المرور';
    errEl.style.display = 'block';
    return;
  }

  const btn = _el('loginBtn');
  btn.classList.add('loading');
  btn.textContent = 'جارٍ التحقق...';
  errEl.style.display = 'none';

  // Try Netlify Function first, fallback to local demo
  let success = false;
  try {
    const resp = await fetch(AUTH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ action:'login', username, password })
    });
    const data = await resp.json();
    if (data.user && data.token) {
      State.user = data.user;
      State.session = { token: data.token };
      State.localMode = false;
      success = true;
    }
  } catch(e) {
    // Auth endpoint unavailable — use local demo mode
  }

  if (!success) {
    // Local demo fallback
    const found = DEMO_USERS.find(u => u.username === username && u.password === password);
    if (found) {
      State.user = found;
      State.session = { token: 'demo-local' };
      State.localMode = true;
      success = true;
    }
  }

  btn.classList.remove('loading');
  btn.textContent = 'تسجيل الدخول';

  if (success) {
    loadApp();
  } else {
    errEl.textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة';
    errEl.style.display = 'block';
  }
}

function logout() {
  State.user = null;
  State.session = null;
  State.tickets = [];
  State.users = [];
  _el('appShell').classList.remove('visible');
  _el('loginScreen').style.display = 'flex';
  _el('loginUser').value = '';
  _el('loginPass').value = '';
}

// ── Enter key ────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && _el('loginScreen').style.display !== 'none') doLogin();
});

// ══════════════════════════════════════════════════════════
//  APP INIT
// ══════════════════════════════════════════════════════════
async function loadApp() {
  showLoading();
  _el('loginScreen').style.display = 'none';
  _el('appShell').classList.add('visible');

  // Load data
  if (State.localMode) {
    State.tickets = JSON.parse(JSON.stringify(DEMO_TICKETS));
    State.users   = JSON.parse(JSON.stringify(DEMO_USERS));
  } else {
    await fetchTickets();
    await fetchUsers();
  }

  // Load notifications
  loadNotifications();

  // Build nav
  buildNav();

  // Set topbar
  const u = State.user;
  _el('topbarName').textContent = u.name;
  _el('topbarRole').textContent = ROLE_LABELS[u.role] || u.role;
  _el('topbarAvatar').textContent = u.name.charAt(0);

  hideLoading();
  showPage('dashboard');
}

// ── Fetch from Supabase ──────────────────────────────────
async function fetchTickets() {
  if (!SUPABASE_URL || SUPABASE_URL.includes('YOUR_')) return;
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/tickets?select=*&order=created_at.desc`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${State.session?.token}` }
    });
    if (resp.ok) State.tickets = await resp.json();
  } catch(e) {}
}

async function fetchUsers() {
  if (!SUPABASE_URL || SUPABASE_URL.includes('YOUR_')) return;
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/users?select=*`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${State.session?.token}` }
    });
    if (resp.ok) State.users = await resp.json();
  } catch(e) {}
}

// ══════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════
function buildNav() {
  const role = State.user?.role;
  const navDef = {
    employee: [
      { id:'dashboard',  icon:dashIcon, label:'الرئيسية' },
      { id:'mytickets',  icon:ticketIcon, label:'طلباتي' },
      { id:'profile',    icon:userIcon, label:'حسابي' },
    ],
    admin: [
      { id:'dashboard',  icon:dashIcon, label:'الرئيسية' },
      { id:'alltickets', icon:ticketIcon, label:'التيكتات' },
      { id:'reports',    icon:reportIcon, label:'التقارير' },
      { id:'profile',    icon:userIcon, label:'حسابي' },
    ],
    manager: [
      { id:'dashboard',  icon:dashIcon, label:'الرئيسية' },
      { id:'alltickets', icon:ticketIcon, label:'التيكتات' },
      { id:'users',      icon:usersIcon, label:'المستخدمون' },
      { id:'reports',    icon:reportIcon, label:'التقارير' },
      { id:'profile',    icon:userIcon, label:'حسابي' },
    ]
  };

  const items = navDef[role] || navDef.employee;
  const nav = _el('mainNav');
  nav.innerHTML = items.map(it => `
    <button class="nav-btn" id="nav-${it.id}" onclick="showPage('${it.id}')">
      ${it.icon} ${_esc(it.label)}
    </button>
  `).join('');
}

// SVG Icons
const dashIcon   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`;
const ticketIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
const userIcon   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
const usersIcon  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
const reportIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;

function showPage(pageId) {
  State.prevPage = State.currentPage;
  State.currentPage = pageId;

  // Update nav
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const nb = _el('nav-'+pageId);
  if (nb) nb.classList.add('active');

  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = _el('page-'+pageId);
  if (page) page.classList.add('active');

  // Render page content
  switch(pageId) {
    case 'dashboard':   renderDashboard();  break;
    case 'mytickets':   renderMyTickets();  break;
    case 'alltickets':  renderAllTickets(); break;
    case 'users':       renderUsers();      break;
    case 'reports':     renderReports();    break;
    case 'profile':     renderProfile();    break;
  }

  // Scroll top
  _el('contentArea').scrollTop = 0;
}

function goBack() { showPage(State.prevPage || 'dashboard'); }

// ══════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════
function renderDashboard() {
  const u = State.user;
  _el('dashboardSub').textContent = `مرحباً ${u.name} — ${new Date().toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long'})}`;

  const tickets = getVisibleTickets();
  const open = tickets.filter(t=>t.status==='open').length;
  const inprog = tickets.filter(t=>t.status==='in_progress'||t.status==='assigned').length;
  const resolved = tickets.filter(t=>t.status==='resolved').length;
  const critical = tickets.filter(t=>t.priority==='critical'&&t.status!=='closed'&&t.status!=='resolved').length;

  _el('dashboardStats').innerHTML = [
    { label:'مفتوح',       val: open,     delta:'تيكت يحتاج إجراء',  color:'#60A5FA' },
    { label:'قيد التنفيذ', val: inprog,   delta:'جاري العمل عليها',  color:'#FCD34D' },
    { label:'محلول',       val: resolved, delta:'تم إغلاقها',        color:'#4ADE80' },
    { label:'حرجة',        val: critical, delta:'تستحق متابعة فورية',color:'#F87171' },
  ].map(s => `
    <div class="stat-card" style="--acc:${s.color}">
      <div class="stat-label">${s.label}</div>
      <div class="stat-value" style="color:${s.color}">${s.val}</div>
      <div class="stat-delta">${s.delta}</div>
    </div>
  `).join('');

  // Charts
  renderDashboardCharts(tickets);

  // Show/hide new ticket button
  _el('btnNewTicket').style.display = (u.role === 'employee') ? 'flex' : 'none';
}

function getVisibleTickets() {
  const u = State.user;
  if (u.role === 'employee') return State.tickets.filter(t=>t.created_by===u.id);
  return State.tickets;
}

function renderDashboardCharts(tickets) {
  // Last 7 days bar chart
  const days = [];
  for (let i=6; i>=0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const label = d.toLocaleDateString('ar-EG',{weekday:'short'});
    const count = tickets.filter(t => {
      const td = new Date(t.created_at);
      return td.toDateString() === d.toDateString();
    }).length;
    days.push({ label, count });
  }
  const maxCount = Math.max(...days.map(d=>d.count), 1);

  const barHtml = `
    <div class="chart-card col-7">
      <div class="chart-header">
        <div>
          <div class="chart-title">التيكتات — آخر 7 أيام</div>
          <div class="chart-sub">عدد التيكتات اليومية</div>
        </div>
      </div>
      <div class="bar-chart">
        ${days.map(d => `
          <div class="bar-item">
            <div class="bar-val">${d.count}</div>
            <div class="bar-fill" style="height:${Math.max(d.count/maxCount*80,4)}px"></div>
            <div class="bar-label">${d.label}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Donut - by category
  const cats = {};
  tickets.forEach(t => { cats[t.category] = (cats[t.category]||0)+1; });
  const total = tickets.length || 1;
  const catColors = ['#B8975A','#60A5FA','#4ADE80','#F87171','#FCD34D','#C084FC','#22D3EE','#FB923C'];
  const catList = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,6);

  let dashOffset = 0;
  const radius = 40, circ = 2 * Math.PI * radius;
  const slices = catList.map((c, i) => {
    const pct = c[1]/total;
    const dash = pct * circ;
    const gap  = circ - dash;
    const off  = dashOffset;
    dashOffset += dash;
    return { label: CATEGORY_LABELS[c[0]]||c[0], val: c[1], color: catColors[i], dash, gap, off };
  });

  const donutHtml = `
    <div class="chart-card col-5">
      <div class="chart-header">
        <div>
          <div class="chart-title">التوزيع حسب الفئة</div>
          <div class="chart-sub">${total} تيكت إجمالي</div>
        </div>
      </div>
      <div class="donut-wrap">
        <svg width="100" height="100" viewBox="0 0 100 100">
          ${slices.map(s => `
            <circle cx="50" cy="50" r="${radius}"
              fill="none" stroke="${s.color}" stroke-width="12"
              stroke-dasharray="${s.dash} ${s.gap}"
              stroke-dashoffset="${-s.off + circ/4}"
              style="transform-origin:center"/>
          `).join('')}
          <text x="50" y="46" text-anchor="middle" fill="white" font-size="14" font-weight="700" font-family="Tajawal">${total}</text>
          <text x="50" y="58" text-anchor="middle" fill="#6B7280" font-size="7" font-family="Tajawal">تيكت</text>
        </svg>
        <div class="donut-legend">
          ${slices.map(s => `
            <div class="legend-item">
              <div class="legend-dot" style="background:${s.color}"></div>
              <span>${s.label}</span>
              <span class="legend-val">${s.val}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Recent tickets
  const recent = [...getVisibleTickets()].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,5);
  const recentHtml = `
    <div class="chart-card col-12">
      <div class="chart-header">
        <div class="chart-title">آخر التيكتات</div>
        <button class="btn btn-secondary" style="padding:6px 12px;font-size:12px;" onclick="showPage('${State.user.role==='employee'?'mytickets':'alltickets'}')">عرض الكل</button>
      </div>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr>
            <th>رقم التيكت</th><th>العنوان</th><th>الأولوية</th><th>الحالة</th><th>التاريخ</th>
          </tr></thead>
          <tbody>
            ${recent.length ? recent.map(t=>`
              <tr onclick="openTicket('${t.id}')" style="cursor:pointer;">
                <td><span class="ticket-num">${_esc(t.ticket_number)}</span></td>
                <td>${_esc(t.title)}</td>
                <td>${priorityBadge(t.priority)}</td>
                <td>${statusBadge(t.status)}</td>
                <td style="font-family:var(--font-mono);font-size:12px;">${_fmt(t.created_at)}</td>
              </tr>
            `).join('') : `<tr><td colspan="5"><div class="empty-state"><p>لا توجد تيكتات بعد</p></div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  _el('dashboardCharts').innerHTML = barHtml + donutHtml + recentHtml;
}

// ══════════════════════════════════════════════════════════
//  MY TICKETS
// ══════════════════════════════════════════════════════════
function renderMyTickets() {
  const tickets = State.tickets.filter(t => t.created_by === State.user.id);
  renderTicketTable('myTicketsTbody', tickets, false);
}

function filterTickets(q) {
  State.searchQuery = q;
  const base = State.tickets.filter(t => t.created_by === State.user.id);
  const filtered = base.filter(t =>
    t.title.includes(q) ||
    t.ticket_number.includes(q) ||
    (CATEGORY_LABELS[t.category]||'').includes(q)
  );
  renderTicketTable('myTicketsTbody', filtered, false);
}

function filterByStatus(v) {
  const base = State.tickets.filter(t => t.created_by === State.user.id);
  const filtered = v ? base.filter(t=>t.status===v) : base;
  renderTicketTable('myTicketsTbody', filtered, false);
}

function renderTicketTable(tbodyId, tickets, isAdmin) {
  const tbody = _el(tbodyId);
  if (!tickets.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <p>لا توجد تيكتات</p>
    </div></td></tr>`;
    return;
  }
  tbody.innerHTML = tickets.map(t => {
    const sla = getSLAInfo(t);
    const assigneeName = t.assigned_to ? getUserName(t.assigned_to) : '—';
    if (isAdmin) {
      return `<tr onclick="openTicket('${t.id}')" style="cursor:pointer;">
        <td><span class="ticket-num">${_esc(t.ticket_number)}</span></td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(t.title)}</td>
        <td>${_esc(getUserName(t.created_by))}</td>
        <td>${_esc(State.users.find(u=>u.id===t.created_by)?.department||'—')}</td>
        <td>${priorityBadge(t.priority)}</td>
        <td>${statusBadge(t.status)}</td>
        <td>${_esc(assigneeName)}</td>
        <td><div class="sla-bar"><div class="sla-fill ${sla.class}" style="width:${sla.pct}%"></div></div><div style="font-size:10px;color:var(--silver-dim);margin-top:2px;">${sla.label}</div></td>
        <td><div class="action-menu">
          ${State.user.role!=='employee'?`<button class="action-btn" onclick="event.stopPropagation();quickAssign('${t.id}')">تحديث</button>`:''}
        </div></td>
      </tr>`;
    } else {
      return `<tr onclick="openTicket('${t.id}')" style="cursor:pointer;">
        <td><span class="ticket-num">${_esc(t.ticket_number)}</span></td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(t.title)}</td>
        <td>${_esc(CATEGORY_LABELS[t.category]||t.category)}</td>
        <td>${priorityBadge(t.priority)}</td>
        <td>${statusBadge(t.status)}</td>
        <td style="font-family:var(--font-mono);font-size:12px;">${_fmt(t.created_at)}</td>
        <td><button class="action-btn" onclick="event.stopPropagation();openTicket('${t.id}')">تفاصيل</button></td>
      </tr>`;
    }
  }).join('');
}

function getSLAInfo(t) {
  const slaHours = { critical:4, high:8, medium:24, low:72 }[t.priority] || 24;
  const elapsed = (Date.now() - new Date(t.created_at)) / 3600000;
  const pct = Math.min(elapsed/slaHours*100, 100);
  if (pct >= 100) return { pct:100, class:'sla-critical', label:'متأخر' };
  if (pct >= 70)  return { pct, class:'sla-warn', label:`${Math.round(slaHours-elapsed)}س متبقية` };
  return { pct, class:'sla-ok', label:`${Math.round(slaHours-elapsed)}س متبقية` };
}

// ══════════════════════════════════════════════════════════
//  ALL TICKETS (IT/Manager)
// ══════════════════════════════════════════════════════════
function renderAllTickets() {
  renderTicketTable('allTicketsTbody', State.tickets, true);
}

function filterAllTickets(q) {
  const base = applyFilters(State.tickets);
  const filtered = base.filter(t=>t.title.includes(q)||t.ticket_number.includes(q));
  renderTicketTable('allTicketsTbody', filtered, true);
}

function filterAllByStatus(v) {
  State.filterStatus = v;
  renderTicketTable('allTicketsTbody', applyFilters(State.tickets), true);
}

function filterAllByPriority(v) {
  State.filterPriority = v;
  renderTicketTable('allTicketsTbody', applyFilters(State.tickets), true);
}

function applyFilters(tickets) {
  let r = tickets;
  if (State.filterStatus)   r = r.filter(t=>t.status===State.filterStatus);
  if (State.filterPriority) r = r.filter(t=>t.priority===State.filterPriority);
  return r;
}

function quickAssign(ticketId) {
  State.selectedTicketId = ticketId;
  const t = State.tickets.find(t=>t.id===ticketId);
  if (t) _el('assign_status').value = t.status;
  _el('assign_note').value = '';
  showModal('assignModal');
}

function saveAssignment() {
  const t = State.tickets.find(t=>t.id===State.selectedTicketId);
  if (!t) return;
  t.status = _el('assign_status').value;
  if (!t.assigned_to) t.assigned_to = State.user.id;
  const note = _el('assign_note').value.trim();
  if (note) {
    if (!t.comments) t.comments = [];
    t.comments.push({ author: State.user.name, text: note, time: new Date().toISOString() });
  }
  hideModal('assignModal');
  renderAllTickets();
  showToast('تم تحديث التيكت بنجاح');
}

// ══════════════════════════════════════════════════════════
//  TICKET DETAIL
// ══════════════════════════════════════════════════════════
function openTicket(id) {
  const t = State.tickets.find(t=>t.id===id);
  if (!t) return;
  State.selectedTicketId = id;

  _el('detailTicketNum').textContent = t.ticket_number;
  _el('detailTicketTitle').textContent = t.title;

  // Actions
  const canUpdate = State.user.role !== 'employee';
  _el('detailActions').innerHTML = canUpdate ? `
    <button class="btn btn-secondary" onclick="quickAssign('${t.id}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/><line x1="20" y1="8" x2="20" y2="14"/></svg>
      تحديث الحالة
    </button>
  ` : '';

  // Build detail layout
  const assignee = t.assigned_to ? getUserName(t.assigned_to) : 'غير معين';
  const creator  = getUserName(t.created_by);
  const sla = getSLAInfo(t);

  const allComments = t.comments || [];

  const timelineItems = [
    { author: creator, action: 'فتح التيكت', time: t.created_at, text: t.description, dot: '#B8975A' },
    ...allComments.map(c => ({ author: c.author, action: 'إضافة تعليق', time: c.time, text: c.text, dot: '#60A5FA' }))
  ];

  _el('ticketDetailContent').innerHTML = `
    <div>
      <!-- Timeline -->
      <div class="detail-card">
        <div class="detail-card-title">سجل التيكت</div>
        <div class="timeline">
          ${timelineItems.map(item => `
            <div class="timeline-item">
              <div class="timeline-dot" style="background:${item.dot}"></div>
              <div class="timeline-content">
                <div class="timeline-meta">
                  <span class="timeline-author">${_esc(item.author)}</span>
                  <span class="timeline-action">${_esc(item.action)}</span>
                  <span class="timeline-time">${_fmt(item.time)} ${_time(item.time)}</span>
                </div>
                <div class="timeline-text">${_esc(item.text)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Add Comment -->
      <div class="comment-box">
        <div class="detail-card-title" style="margin-bottom:12px;">إضافة تعليق</div>
        <textarea class="comment-input" id="newComment" placeholder="أضف تعليقاً أو تحديثاً..."></textarea>
        <button class="btn btn-primary" onclick="addComment('${t.id}')">إرسال التعليق</button>
      </div>
    </div>

    <!-- Sidebar -->
    <div>
      <div class="detail-card">
        <div class="detail-card-title">تفاصيل التيكت</div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${[
            { l:'الحالة',    v: statusBadge(t.status) },
            { l:'الأولوية', v: priorityBadge(t.priority) },
            { l:'التصنيف', v: _esc(CATEGORY_LABELS[t.category]||t.category) },
            { l:'مقدم الطلب', v: _esc(creator) },
            { l:'المعين',   v: _esc(assignee) },
            { l:'تاريخ الفتح', v: `<span style="font-family:var(--font-mono);font-size:12px;">${_fmt(t.created_at)}</span>` },
          ].map(row => `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
              <span style="font-size:12px;color:var(--silver-dim);">${row.l}</span>
              <span style="font-size:13px;">${row.v}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="detail-card">
        <div class="detail-card-title">مؤشر SLA</div>
        <div style="margin-bottom:6px;font-size:13px;color:${sla.class==='sla-ok'?'var(--success)':sla.class==='sla-warn'?'var(--warning)':'var(--accent-red)'};">${sla.label}</div>
        <div class="sla-bar" style="height:8px;"><div class="sla-fill ${sla.class}" style="width:${sla.pct}%"></div></div>
        <div style="margin-top:6px;font-size:11px;color:var(--silver-dim);">
          SLA للأولوية ${PRIORITY_LABELS[t.priority]}: ${{ critical:4, high:8, medium:24, low:72 }[t.priority]}h
        </div>
      </div>
    </div>
  `;

  showPage('ticketdetail');
}

function addComment(ticketId) {
  const text = _el('newComment').value.trim();
  if (!text) return;
  const t = State.tickets.find(t=>t.id===ticketId);
  if (!t) return;
  if (!t.comments) t.comments = [];
  t.comments.push({ author: State.user.name, text, time: new Date().toISOString() });
  _el('newComment').value = '';
  openTicket(ticketId);
  showToast('تم إضافة التعليق');
}

// ══════════════════════════════════════════════════════════
//  NEW TICKET
// ══════════════════════════════════════════════════════════
function submitTicket() {
  const title    = _el('nt_title').value.trim();
  const category = _el('nt_category').value;
  const priority = _el('nt_priority').value;
  const desc     = _el('nt_desc').value.trim();

  if (!title || !category || !desc) {
    showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
    return;
  }

  const ticket = {
    id: genId(),
    ticket_number: genTicketNum(),
    title, category, priority, description: desc,
    status: 'open',
    created_by: State.user.id,
    assigned_to: null,
    created_at: new Date().toISOString(),
    comments: [],
    timeline: []
  };

  State.tickets.unshift(ticket);

  // Add notification for IT
  State.notifications.unshift({
    id: 'n'+Date.now(),
    title: `تيكت جديد: ${title}`,
    sub: `من ${State.user.name} — ${PRIORITY_LABELS[priority]}`,
    unread: true,
    time: new Date().toISOString()
  });
  updateNotifBadge();

  hideModal('newTicketModal');
  _el('nt_title').value = '';
  _el('nt_category').value = '';
  _el('nt_priority').value = 'medium';
  _el('nt_desc').value = '';

  showToast(`تم إرسال التيكت ${ticket.ticket_number} بنجاح`);

  if (State.user.role === 'employee') {
    showPage('mytickets');
  } else {
    renderDashboard();
  }
}

// ══════════════════════════════════════════════════════════
//  USERS
// ══════════════════════════════════════════════════════════
function renderUsers() {
  const grid = _el('usersGrid');
  if (!State.users.length) {
    grid.innerHTML = `<div class="empty-state"><p>لا يوجد مستخدمون</p></div>`;
    return;
  }
  grid.innerHTML = State.users.map(u => {
    const myTickets   = State.tickets.filter(t => t.created_by === u.id).length;
    const assigned    = State.tickets.filter(t => t.assigned_to === u.id).length;
    const resolved    = State.tickets.filter(t => t.assigned_to === u.id && t.status==='resolved').length;
    return `
      <div class="user-card">
        <div class="user-card-top">
          <div class="user-card-avatar">${u.name.charAt(0)}</div>
          <div class="user-card-info">
            <div class="user-card-name">${_esc(u.name)}</div>
            <div class="user-card-role">${ROLE_LABELS[u.role]||u.role} · ${_esc(u.department||'—')}</div>
          </div>
        </div>
        <div class="user-card-stats">
          <div class="ustat"><div class="ustat-val">${myTickets}</div><div class="ustat-label">طلباته</div></div>
          <div class="ustat"><div class="ustat-val">${assigned}</div><div class="ustat-label">معين</div></div>
          <div class="ustat"><div class="ustat-val">${resolved}</div><div class="ustat-label">محلول</div></div>
        </div>
        <div style="display:flex;gap:6px;">
          <span class="badge ${u.is_active ? 'badge-resolved':'badge-closed'}">${u.is_active?'نشط':'غير نشط'}</span>
          <span class="badge badge-assigned">${_esc(ROLE_LABELS[u.role]||u.role)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function saveNewUser() {
  const name     = _el('nu_name').value.trim();
  const username = _el('nu_username').value.trim();
  const email    = _el('nu_email').value.trim();
  const pass     = _el('nu_pass').value;
  const role     = _el('nu_role').value;
  const dept     = _el('nu_dept').value.trim();

  if (!name || !username || !email || !pass) {
    showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
    return;
  }
  if (State.users.find(u=>u.username===username)) {
    showToast('اسم المستخدم موجود بالفعل', 'error');
    return;
  }

  State.users.push({ id:'u'+Date.now(), name, username, email, password:pass, role, department:dept, is_active:true });
  hideModal('newUserModal');
  renderUsers();
  showToast(`تم إضافة ${name} بنجاح`);
  // Clear
  ['nu_name','nu_username','nu_email','nu_pass','nu_dept'].forEach(id => _el(id).value='');
}

// ══════════════════════════════════════════════════════════
//  REPORTS
// ══════════════════════════════════════════════════════════
function renderReports() {
  const tickets = State.tickets;
  const total = tickets.length;
  const open = tickets.filter(t=>t.status==='open'||t.status==='assigned').length;
  const resolved = tickets.filter(t=>t.status==='resolved'||t.status==='closed').length;
  const critical = tickets.filter(t=>t.priority==='critical').length;

  const resRate = total ? Math.round(resolved/total*100) : 0;

  // IT performance
  const itUsers = State.users.filter(u=>u.role==='admin');
  const itPerf = itUsers.map(u => {
    const assigned = tickets.filter(t=>t.assigned_to===u.id).length;
    const done     = tickets.filter(t=>t.assigned_to===u.id&&(t.status==='resolved'||t.status==='closed')).length;
    return { name:u.name, assigned, done, rate: assigned?Math.round(done/assigned*100):0 };
  });

  _el('reportsContent').innerHTML = `
    <div class="stats-grid" style="margin-bottom:24px;">
      ${[
        { label:'معدل الحل',      val: resRate+'%', sub:'من إجمالي التيكتات' },
        { label:'إجمالي التيكتات', val: total,       sub:'منذ البداية' },
        { label:'قيد الانتظار',   val: open,         sub:'تحتاج إجراء' },
        { label:'حرجة',           val: critical,     sub:'أولوية قصوى' },
      ].map(s => `
        <div class="stat-card">
          <div class="stat-label">${s.label}</div>
          <div class="stat-value">${s.val}</div>
          <div class="stat-delta">${s.sub}</div>
        </div>
      `).join('')}
    </div>

    <div class="table-wrapper" style="margin-bottom:24px;">
      <div class="table-toolbar">
        <span class="table-title">أداء فريق IT</span>
      </div>
      <table class="data-table">
        <thead><tr>
          <th>الفني</th><th>المعين له</th><th>المحلولة</th><th>معدل الحل</th><th>الأداء</th>
        </tr></thead>
        <tbody>
          ${itPerf.length ? itPerf.map(p => `
            <tr>
              <td><strong>${_esc(p.name)}</strong></td>
              <td>${p.assigned}</td>
              <td>${p.done}</td>
              <td>${p.rate}%</td>
              <td style="width:160px;">
                <div class="sla-bar" style="height:8px;">
                  <div class="sla-fill ${p.rate>=80?'sla-ok':p.rate>=50?'sla-warn':'sla-critical'}" style="width:${p.rate}%"></div>
                </div>
              </td>
            </tr>
          `).join('') : '<tr><td colspan="5"><div class="empty-state"><p>لا يوجد فريق IT</p></div></td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="table-wrapper">
      <div class="table-toolbar">
        <span class="table-title">التوزيع حسب الفئة والأولوية</span>
      </div>
      <table class="data-table">
        <thead><tr><th>الفئة</th><th>إجمالي</th><th>مفتوح</th><th>محلول</th></tr></thead>
        <tbody>
          ${Object.entries(CATEGORY_LABELS).map(([k,v]) => {
            const cat = tickets.filter(t=>t.category===k);
            if (!cat.length) return '';
            return `<tr>
              <td>${v}</td>
              <td>${cat.length}</td>
              <td>${cat.filter(t=>t.status==='open'||t.status==='assigned').length}</td>
              <td>${cat.filter(t=>t.status==='resolved'||t.status==='closed').length}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function generateReport() { showToast('جارٍ إنشاء التقرير...', 'info'); }

// ══════════════════════════════════════════════════════════
//  PROFILE
// ══════════════════════════════════════════════════════════
function renderProfile() {
  const u = State.user;
  const myTickets = State.tickets.filter(t=>t.created_by===u.id);

  _el('profileContent').innerHTML = `
    <div style="display:grid;grid-template-columns:320px 1fr;gap:24px;align-items:start;">
      <div class="detail-card">
        <div style="text-align:center;padding:16px 0 24px;">
          <div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--star-gold-dim),var(--star-gold));display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:var(--obsidian);margin:0 auto 16px;">${u.name.charAt(0)}</div>
          <div style="font-family:var(--font-display);font-size:20px;color:var(--white);margin-bottom:4px;">${_esc(u.name)}</div>
          <div style="font-size:12px;color:var(--silver-dim);text-transform:uppercase;letter-spacing:0.1em;">${ROLE_LABELS[u.role]||u.role}</div>
          <div style="margin-top:12px;">${badge(u.department||'—','badge-assigned')}</div>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:16px;display:flex;flex-direction:column;gap:10px;">
          ${[
            { l:'البريد الإلكتروني', v: u.email||'—' },
            { l:'اسم المستخدم',     v: u.username },
            { l:'القسم',            v: u.department||'—' },
          ].map(r=>`
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:12px;color:var(--silver-dim);">${r.l}</span>
              <span style="font-size:13px;color:var(--white);">${_esc(r.v)}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div>
        <div class="stats-grid" style="margin-bottom:20px;">
          <div class="stat-card"><div class="stat-label">إجمالي طلباتي</div><div class="stat-value">${myTickets.length}</div></div>
          <div class="stat-card"><div class="stat-label">مفتوحة</div><div class="stat-value" style="color:#60A5FA">${myTickets.filter(t=>t.status==='open').length}</div></div>
          <div class="stat-card"><div class="stat-label">محلولة</div><div class="stat-value" style="color:#4ADE80">${myTickets.filter(t=>t.status==='resolved'||t.status==='closed').length}</div></div>
        </div>
        ${State.localMode ? `<div style="background:rgba(184,151,90,0.08);border:1px solid var(--border-gold);border-radius:var(--radius-lg);padding:14px 18px;font-size:13px;color:var(--star-gold-light);">
          ⚡ وضع تجريبي محلي — لتفعيل Supabase أضف بياناتك في SUPABASE_URL و SUPABASE_KEY
        </div>` : ''}
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ══════════════════════════════════════════════════════════
function loadNotifications() {
  State.notifications = [
    { id:'n1', title:'تيكت جديد: الطابعة لا تستجيب', sub:'من محمد الأحمد — أولوية عالية', unread:true,  time: new Date(Date.now()-1800000).toISOString() },
    { id:'n2', title:'تيكت محلول: نسيت كلمة المرور', sub:'تم الحل بواسطة سارة محمود',      unread:true,  time: new Date(Date.now()-7200000).toISOString() },
    { id:'n3', title:'تنبيه SLA: فيروس مشتبه به',    sub:'تيكت حرج لم يُحل خلال 4 ساعات', unread:false, time: new Date(Date.now()-3600000).toISOString() },
  ];
  renderNotifications();
  updateNotifBadge();
}

function renderNotifications() {
  const list = _el('notifList');
  if (!State.notifications.length) {
    list.innerHTML = `<div class="empty-state" style="padding:24px;"><p>لا توجد إشعارات</p></div>`;
    return;
  }
  list.innerHTML = State.notifications.map(n => `
    <div class="notif-item ${n.unread?'unread':''}" onclick="markRead('${n.id}')">
      <div class="notif-item-title">${_esc(n.title)}</div>
      <div class="notif-item-sub">${_esc(n.sub)}</div>
    </div>
  `).join('');
}

function updateNotifBadge() {
  const count = State.notifications.filter(n=>n.unread).length;
  const badge = _el('notifBadge');
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function toggleNotifications() {
  const panel = _el('notifPanel');
  panel.classList.toggle('open');
}

function markRead(id) {
  const n = State.notifications.find(n=>n.id===id);
  if (n) n.unread = false;
  renderNotifications();
  updateNotifBadge();
}

function markAllRead() {
  State.notifications.forEach(n=>n.unread=false);
  renderNotifications();
  updateNotifBadge();
}

// Close notifications on outside click
document.addEventListener('click', e => {
  const panel = _el('notifPanel');
  if (panel && !panel.contains(e.target) && !e.target.closest('.icon-btn')) {
    panel.classList.remove('open');
  }
});

// ── Modals ───────────────────────────────────────────────
function showModal(id) { _el(id).classList.add('open'); }
function hideModal(id) { _el(id).classList.remove('open'); }

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ── Export CSV ───────────────────────────────────────────
function exportCSV() {
  const rows = [['رقم التيكت','العنوان','مقدم الطلب','الأولوية','الحالة','التاريخ']];
  State.tickets.forEach(t => {
    rows.push([t.ticket_number, t.title, getUserName(t.created_by), PRIORITY_LABELS[t.priority], STATUS_LABELS[t.status], _fmt(t.created_at)]);
  });
  const csv = rows.map(r => r.map(c=>`"${c}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `GAS-IT-Tickets-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ── Init ─────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    _el('loadingOverlay').style.display = 'none';
    _el('loginScreen').style.display = 'flex';
  }, 1600);
});
</script>
</body>
</html>
