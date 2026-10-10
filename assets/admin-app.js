/* =========================================================
   StudyMart - Admin Panel Application
   Sections: Dashboard, Courses, Batches, Categories,
             Platforms, Coupons, Users, Orders, Settings
   ========================================================= */
(function () {
  'use strict';

  const API = '';
  const state = {
    token: sessionStorage.getItem('sm_admin_token') || '',
    admin: null,
    meta: { batches: [], ebookBatches: [], categories: [], platforms: [], groups: [], subjects: [] },
    lists: {},
    pendingOrders: 0
  };

  /* ---------------- helpers ---------------- */
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const cur = n => '৳' + Number(n || 0).toLocaleString('en-IN');
  const dt = v => {
    if (!v) return '-';
    const d = new Date(v);
    if (isNaN(d.getTime())) return esc(v);
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  let toastTimer = null;
  function toast(msg, ok) {
    const t = $('toast');
    t.textContent = msg;
    t.style.background = ok === false ? '#DC2626' : '#0F2043';
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
  }

  function fallbackCopy(txt, done) {
    const ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed', false); }
    document.body.removeChild(ta);
  }
  function copyText(txt, msg) {
    const done = () => toast(msg || 'Copied');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done).catch(() => fallbackCopy(txt, done));
    else fallbackCopy(txt, done);
  }

  function inviteExpiryText(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.max(1, Math.round((ms % 3600000) / 60000));
    if (h >= 1) return 'Expires in ' + h + 'h ' + m + 'm';
    return 'Expires in ' + m + 'm';
  }

  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({}, opts.headers || {});
    if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    const res = await fetch(API + path, Object.assign({}, opts, { headers }));
    let json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    if (res.status === 401) {
      logout(true);
      throw new Error((json && json.message) || 'Session expired, please login again');
    }
    if (!res.ok || !json || json.success === false) {
      throw new Error((json && json.message) || ('Request failed (HTTP ' + res.status + ')'));
    }
    return json;
  }

  /* ---------------- modal ---------------- */
  function openModal(html) {
    $('modalBox').innerHTML = html;
    $('modalWrap').classList.remove('hidden');
  }
  function closeModal() {
    $('modalWrap').classList.add('hidden');
    $('modalBox').innerHTML = '';
  }
  window.closeModal = closeModal;
  $('modalWrap').addEventListener('click', e => { if (e.target === $('modalWrap')) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  function confirmDialog(title, text, onYes, yesLabel) {
    openModal(`
      <div class="p-6">
        <div class="flex items-start gap-3">
          <div class="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <i class="fa-solid fa-triangle-exclamation text-red-600 text-[18px]"></i>
          </div>
          <div>
            <h3 class="text-[16px] font-extrabold text-[#0F2043]">${esc(title)}</h3>
            <p class="text-[13px] text-slate-600 mt-1">${esc(text)}</p>
          </div>
        </div>
        <div class="flex justify-end gap-2 mt-6">
          <button onclick="closeModal()" class="px-4 py-2 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-700">Cancel</button>
          <button id="confirmYes" class="px-4 py-2 rounded-[10px] bg-red-600 hover:bg-red-700 font-bold text-[13px] text-white">${esc(yesLabel || 'Yes, Delete')}</button>
        </div>
      </div>`);
    $('confirmYes').addEventListener('click', function () {
      closeModal();
      onYes();
    });
  }

  /* Pretty input box (native prompt-er bodle) — modalWrap-er upore separate overlay, tai form-er uporeo open kora jay */
  function inputDialog(opts) {
    return new Promise(function (resolve) {
      opts = opts || {};
      var title = opts.title || 'Enter value';
      var sub = opts.subtitle || '';
      var placeholder = opts.placeholder || '';
      var value = opts.value || '';
      var okLabel = opts.okLabel || 'Add';
      var icon = opts.icon || 'fa-plus';
      var iconBg = opts.iconBg || 'bg-[#EEF2FF] text-[#1A56FF]';
      var ov = document.createElement('div');
      ov.className = 'fixed inset-0 z-[120] flex items-center justify-center p-4';
      ov.style.background = 'rgba(15,32,67,.5)';
      ov.innerHTML = '<div class="bg-white rounded-[16px] shadow-2xl w-full max-w-[400px] p-5 sm:p-6" style="animation:fade .2s ease">'
        + '<div class="flex items-center gap-3">'
        + '<span class="w-10 h-10 rounded-[12px] ' + iconBg + ' flex items-center justify-center flex-shrink-0"><i class="fa-solid ' + icon + ' text-[15px]"></i></span>'
        + '<div class="min-w-0"><h3 class="text-[15px] font-extrabold text-[#0F2043]">' + esc(title) + '</h3>'
        + (sub ? '<p class="text-[12px] text-slate-500 mt-0.5">' + esc(sub) + '</p>' : '')
        + '</div></div>'
        + '<input class="mt-4 w-full border border-slate-200 rounded-[10px] px-3.5 py-2.5 text-[13.5px] outline-none focus:border-[#1A56FF]" placeholder="' + esc(placeholder) + '" value="' + esc(value) + '">'
        + '<p class="hidden mt-2 text-[12px] font-semibold text-red-600"></p>'
        + '<div class="flex justify-end gap-2 mt-5">'
        + '<button class="px-4 py-2 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-700" data-x>Cancel</button>'
        + '<button class="px-5 py-2 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] font-bold text-[13px] text-white" data-ok>' + esc(okLabel) + '</button>'
        + '</div></div>';
      var done = false;
      function close(val) { if (done) return; done = true; try { ov.remove(); } catch (e) {} resolve(val); }
      var inp = ov.querySelector('input'), err = ov.querySelector('p');
      function submit() {
        var v = inp.value.trim();
        if (!v) { inp.focus(); inp.classList.add('border-red-400'); if (err) { err.textContent = 'Please type a name'; err.classList.remove('hidden'); } return; }
        close(v);
      }
      ov.querySelector('[data-x]').addEventListener('click', function () { close(null); });
      ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(null); });
      ov.querySelector('[data-ok]').addEventListener('click', submit);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
      ov.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(null); } }, true);
      document.body.appendChild(ov);
      setTimeout(function () { inp.focus(); inp.select(); }, 30);
    });
  }

  /* ---------------- auth ---------------- */
  function showLogin() {
    $('loginScreen').classList.remove('hidden');
    $('appShell').classList.add('hidden');
  }
  function showApp() {
    $('loginScreen').classList.add('hidden');
    $('appShell').classList.remove('hidden');
    if (state.admin) {
      $('adminName').textContent = state.admin.name || 'Admin';
      $('adminAvatar').textContent = (state.admin.name || 'A').charAt(0).toUpperCase();
    }
  }
  async function logout(silent) {
    if (state.token) {
      try {
        await fetch(API + '/api/admin/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + state.token } });
      } catch (e) {}
    }
    sessionStorage.removeItem('sm_admin_token');
    state.token = '';
    state.admin = null;
    showLogin();
    if (!silent) toast('Logged out');
  }

  $('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const errBox = $('loginError');
    errBox.classList.add('hidden');
    try {
      const json = await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username: $('loginUser').value.trim(), password: $('loginPass').value })
      });
      state.token = json.token;
      state.admin = json.data;
      sessionStorage.setItem('sm_admin_token', json.token);
      showApp();
      await boot();
      toast('Welcome back, ' + (json.data.name || 'Admin'));
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    }
  });

  $('logoutBtn').addEventListener('click', function () { logout(false); });
  $('menuBtn').addEventListener('click', function () {
    $('sidebar').classList.toggle('-translate-x-full');
    $('backdrop').classList.toggle('hidden');
  });
  $('backdrop').addEventListener('click', function () {
    $('sidebar').classList.add('-translate-x-full');
    $('backdrop').classList.add('hidden');
  });

  /* ---------------- navigation ---------------- */
  const NAV = [
    { key: 'dashboard', label: 'Dashboard', icon: 'fa-chart-line', sub: 'Overview of your platform', perm: 'dashboard' },
    { key: 'orders', label: 'Orders', icon: 'fa-cart-shopping', sub: 'All orders & payments', perm: 'orders' },
    { key: 'homepage', label: 'Home Page', icon: 'fa-house-chimney', sub: 'Edit / Modify hero & sections', perm: 'homepage' },
    { key: 'courses', label: 'Course List', icon: 'fa-book-open', sub: 'Add / edit / delete courses', perm: 'courses' },
    { key: 'lessons', label: 'Class Update', icon: 'fa-circle-play', sub: '', perm: 'courses' },
    { key: 'batches', label: 'Batch Manage', icon: 'fa-layer-group', sub: 'HSC, SSC & Admission batches', perm: 'batches' },
    { key: 'ebookBatches', label: 'E-Book Batch', icon: 'fa-book-open', sub: 'Alada E-Book batch create korun', perm: 'ebookBatches' },
    { key: 'categories', label: 'Category Manage', icon: 'fa-tags', sub: 'Course categories', perm: 'categories' },
    { key: 'platforms', label: 'Platform Manage', icon: 'fa-share-nodes', sub: 'Where courses are delivered', perm: 'platforms' },
    { key: 'groups', label: 'Group Manage', icon: 'fa-users', sub: 'Science / Arts / Commerce groups', perm: 'groups' },
    { key: 'subjects', label: 'Subject Manage', icon: 'fa-book-open', sub: 'Physics, Chemistry, Math etc.', perm: 'subjects' },
    { key: 'ebooks', label: 'E-Book Manage', icon: 'fa-book', sub: 'PDF books students can download', perm: 'ebooks' },
    { key: 'coupons', label: 'Coupon Manage', icon: 'fa-ticket', sub: 'Discount coupons', perm: 'coupons' },
    { key: 'referrals', label: 'Referral Manage', icon: 'fa-gift', sub: 'Referral on/off, commission, withdrawals', perm: 'orders' },
    { key: 'users', label: 'User List', icon: 'fa-users', sub: 'All registered students', perm: 'users' },
    { key: 'admins', label: 'Admins', icon: 'fa-user-shield', sub: 'Add / invite admin team', perm: 'admins' },
    { key: 'notify', label: 'Notifications', icon: 'fa-envelope', sub: 'Brevo diye student ke mail pathan', perm: 'notify' },
    { key: 'notice', label: 'Notice', icon: 'fa-bullhorn', sub: 'Order mail alert + template setup', perm: 'notify' },
    { key: 'settings', label: 'Settings', icon: 'fa-gear', sub: 'Site settings & admin password', perm: 'settings' }
  ];

  // Logged-in admin-er permission check (superadmin / purono admin = sob access)
  function hasPerm(perm) {
    if (!perm || perm === 'dashboard') return true;
    const a = state.admin;
    if (!a) return false;
    if (a.role === 'superadmin') return true;
    if (!Array.isArray(a.permissions)) return true; // legacy full access
    return a.permissions.includes(perm);
  }

  const PERM_LABELS = {
    dashboard: 'Dashboard', homepage: 'Home Page', courses: 'Courses', batches: 'Batches',
    ebookBatches: 'E-Book Batch', categories: 'Categories', platforms: 'Platforms', groups: 'Groups', subjects: 'Subjects',
    ebooks: 'E-Books', coupons: 'Coupons', orders: 'Orders', users: 'Users',
    admins: 'Admin Manage', notify: 'Notifications + Notice', settings: 'Settings'
  };

  function renderNav(active) {
    const pagesHeader = '<div class="px-3 pt-3 pb-1 text-[10px] font-black tracking-[0.14em] text-white/40 uppercase">Pages</div>';
    let html = '';
    NAV.filter(n => hasPerm(n.perm)).forEach(n => {
      if (n.key === 'homepage') html += pagesHeader;
      const badge = (n.key === 'orders' && state.pendingOrders > 0)
        ? `<span id="navOrdersBadge" class="ml-auto min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-extrabold flex items-center justify-center">${state.pendingOrders > 99 ? '99+' : state.pendingOrders}</span>`
        : (n.key === 'orders' ? '<span id="navOrdersBadge" class="ml-auto hidden"></span>' : '');
      html += `<a href="#/${n.key}" class="nav-item flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-slate-300 hover:bg-white/10 transition ${n.key === active ? 'active' : ''}"><i class="fa-solid ${n.icon} w-5 text-center text-[14px]"></i> <span>${esc(n.label)}</span>${badge}</a>`;
    });
    $('sideNav').innerHTML = html;
  }

  // Sidebar Orders badge-e pending count update (na thakle hide)
  function paintOrdersBadge() {
    const el = $('navOrdersBadge');
    if (!el) return;
    if (state.pendingOrders > 0) {
      el.textContent = state.pendingOrders > 99 ? '99+' : state.pendingOrders;
      el.className = 'ml-auto min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-extrabold flex items-center justify-center';
    } else {
      el.textContent = '';
      el.className = 'ml-auto hidden';
    }
  }

  // Stats theke pending order count ene badge refresh kore
  async function refreshOrdersBadge() {
    if (!hasPerm('orders')) return;
    try {
      const json = await api('/api/admin/stats');
      const n = Number(json.data && json.data.totals && json.data.totals.pendingOrders) || 0;
      state.pendingOrders = n;
      paintOrdersBadge();
    } catch (e) {}
  }

  function route() {
    const key = (location.hash.replace('#/', '') || 'dashboard').split('?')[0];
    const page = NAV.find(n => n.key === key) || NAV[0];
    renderNav(page.key);
    refreshOrdersBadge();
    // permission nai — direct link diyeo dhukte parbe na
    if (!hasPerm(page.perm)) {
      $('pageTitle').textContent = page.label;
      $('pageSub').textContent = page.sub;
      $('view').innerHTML = errorBox('Access denied — "' + page.label + '" section-er permission nai. Super Admin-er sathe contact koro.');
      return;
    }
    $('pageTitle').textContent = page.label;
    $('pageSub').textContent = page.sub;
    $('view').classList.remove('fade');
    void $('view').offsetWidth;
    $('view').classList.add('fade');
    $('backdrop').classList.add('hidden');
    if (window.innerWidth < 1024) $('sidebar').classList.add('-translate-x-full');
    if (page.key === 'dashboard') return renderDashboard();
    if (page.key === 'homepage') return renderHomePage();
    if (page.key === 'lessons') return renderClassUpdate();
    if (page.key === 'users') return renderUsers();
    if (page.key === 'orders') return renderOrders();
    if (page.key === 'referrals') return renderReferrals();
    if (page.key === 'admins') return renderAdmins();
    if (page.key === 'notify') return renderNotify();
    if (page.key === 'notice') return renderNotice();
    if (page.key === 'settings') return renderSettings();
    return renderResource(page.key);
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('load', function () {
    if (window.innerWidth >= 1024) $('sidebar').classList.remove('-translate-x-full');
  });

  /* ---------------- Referral Manage ---------------- */
  async function renderReferrals() {
    const view = $('view');
    view.innerHTML = '<div class="p-8 text-center text-slate-400 text-[13px]"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Loading referral data...</div>';
    let ov = null;
    try {
      const j = await api('/api/admin/referrals/overview');
      ov = j.data;
    } catch (e) { view.innerHTML = errorBox(e.message); return; }
    const cfg = ov.config || {};
    const cur0 = (n) => '৳' + Number(n || 0).toLocaleString('en-IN');
    view.innerHTML = `
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        ${statCard('fa-sack-dollar', 'Commission Paid Out', cur0(ov.paidOut), '#16A34A', '#E6F4EA')}
        ${statCard('fa-hourglass-half', 'Pending Withdrawals', (ov.pendingWithdrawals || 0) + ' (' + cur0(ov.pendingAmount) + ')', '#F59E0B', '#FFF7ED')}
        ${statCard('fa-circle-check', 'Approved Withdrawals', ov.approvedWithdrawals || 0, '#1A56FF', '#E6F0FF')}
        ${statCard('fa-users', 'Commissions', (ov.approvedCommissions || 0) + '/' + (ov.totalCommissions || 0), '#7C3AED', '#EDE9FF')}
      </div>
      <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm overflow-hidden mb-4">
        <div class="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
          <span class="w-8 h-8 rounded-[10px] bg-[#EDE9FF] text-[#7C3AED] flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-gear text-[13px]"></i></span>
          <div><h3 class="font-extrabold text-[14px] text-[#0F2043]">Referral Settings</h3>
          <p class="text-[11px] text-slate-500">On/off + friend discount + commission % + minimum withdraw</p></div>
        </div>
        <div class="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <label class="flex items-center gap-2.5 border border-slate-200 rounded-[10px] px-3 py-2.5 cursor-pointer">
            <input id="refEnabled" type="checkbox" ${cfg.enabled ? 'checked' : ''} class="w-4 h-4 accent-[#16A34A]">
            <span class="text-[13px] font-bold text-[#0F2043]">Referral ON</span>
          </label>
          <div><label class="text-[11px] font-bold text-slate-600 uppercase">Friend Discount %</label>
            <input id="refFriendOff" type="number" min="0" max="90" value="${Number(cfg.friendOff) || 0}" class="mt-1 w-full border border-slate-200 rounded-[10px] px-3 py-2.5 text-[13px] outline-none focus:border-[#1A56FF]"></div>
          <div><label class="text-[11px] font-bold text-slate-600 uppercase">Commission %</label>
            <input id="refCommission" type="number" min="0" max="90" value="${Number(cfg.commissionPct) || 0}" class="mt-1 w-full border border-slate-200 rounded-[10px] px-3 py-2.5 text-[13px] outline-none focus:border-[#1A56FF]"></div>
          <div><label class="text-[11px] font-bold text-slate-600 uppercase">Min Withdraw (৳)</label>
            <input id="refMinWd" type="number" min="0" value="${Number(cfg.minWithdraw) || 0}" class="mt-1 w-full border border-slate-200 rounded-[10px] px-3 py-2.5 text-[13px] outline-none focus:border-[#1A56FF]"></div>
          <div class="flex items-end"><button id="refSave" class="w-full px-4 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]">Save</button></div>
        </div>
      </div>
      <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm overflow-hidden mb-4">
        <div class="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2">
            <span class="w-8 h-8 rounded-[10px] bg-[#FFF7ED] text-[#C2410C] flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-money-bill-transfer text-[13px]"></i></span>
            <div><h3 class="font-extrabold text-[14px] text-[#0F2043]">Withdraw Requests</h3>
            <p class="text-[11px] text-slate-500">Approve korle status seal, Reject korle wallet-e refund</p></div>
          </div>
          <div class="flex gap-1.5">
            <button data-wdf="pending" class="wdf-btn px-3 py-1.5 rounded-full text-[11px] font-bold bg-[#0F2043] text-white">Pending</button>
            <button data-wdf="" class="wdf-btn px-3 py-1.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">All</button>
          </div>
        </div>
        <div class="overflow-x-auto"><table class="w-full text-left min-w-[640px]">
          <thead><tr class="text-[10.5px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
            <th class="px-4 sm:px-5 py-2.5">User</th><th class="px-4 py-2.5">Amount</th><th class="px-4 py-2.5">Method</th><th class="px-4 py-2.5">Date</th><th class="px-4 py-2.5">Status</th><th class="px-4 py-2.5 text-right">Action</th>
          </tr></thead>
          <tbody id="wdRows"><tr><td colspan="6" class="px-5 py-8 text-center text-slate-400 text-[12px]"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Loading...</td></tr></tbody>
        </table></div>
      </div>
      <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm overflow-hidden">
        <div class="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
          <span class="w-8 h-8 rounded-[10px] bg-[#E6F4EA] text-[#16A34A] flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-list text-[13px]"></i></span>
          <div><h3 class="font-extrabold text-[14px] text-[#0F2043]">Recent Commissions</h3>
          <p class="text-[11px] text-slate-500">Order confirm hole auto-credit hoy</p></div>
        </div>
        <div class="overflow-x-auto"><table class="w-full text-left min-w-[640px]">
          <thead><tr class="text-[10.5px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
            <th class="px-4 sm:px-5 py-2.5">Earner</th><th class="px-4 py-2.5">Buyer</th><th class="px-4 py-2.5">Order</th><th class="px-4 py-2.5">Amount</th><th class="px-4 py-2.5">Date</th><th class="px-4 py-2.5">Status</th>
          </tr></thead>
          <tbody id="comRows"><tr><td colspan="6" class="px-5 py-8 text-center text-slate-400 text-[12px]"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Loading...</td></tr></tbody>
        </table></div>
      </div>`;
    $('refSave').addEventListener('click', async () => {
      const btn = $('refSave'); btn.disabled = true;
      try {
        await api('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({
            referralEnabled: $('refEnabled').checked,
            referralFriendOff: Math.min(90, Math.max(0, Number($('refFriendOff').value) || 0)),
            referralCommission: Math.min(90, Math.max(0, Number($('refCommission').value) || 0)),
            referralMinWithdraw: Math.max(0, Number($('refMinWd').value) || 0)
          })
        });
        toast('Referral settings saved');
        renderReferrals();
      } catch (e) { toast(e.message, false); btn.disabled = false; }
    });
    async function loadWds(filter) {
      const tb = $('wdRows');
      try {
        const j = await api('/api/admin/withdrawals' + (filter ? '?status=' + encodeURIComponent(filter) : ''));
        if (!j.data.length) { tb.innerHTML = emptyRow(6, 'No withdraw requests'); return; }
        tb.innerHTML = j.data.map(w => `
          <tr class="border-b border-slate-50 hover:bg-slate-50/60">
            <td class="px-4 sm:px-5 py-3"><div class="text-[12.5px] font-bold text-[#0F2043]">${esc(w.userName || ('User #' + w.userId))}</div><div class="text-[10.5px] text-slate-400">#${esc(String(w.userId))}</div></td>
            <td class="px-4 py-3 text-[13px] font-extrabold text-[#0F2043]">৳${Number(w.amount || 0).toLocaleString('en-IN')}</td>
            <td class="px-4 py-3 text-[12px] font-bold text-slate-600">${esc((w.method || '').toUpperCase())}<div class="text-[10.5px] text-slate-400 font-semibold">${esc(w.account || '')}</div></td>
            <td class="px-4 py-3 text-[11.5px] text-slate-500">${esc((w.createdAt || '').slice(0, 10))}</td>
            <td class="px-4 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${statusClass(w.status === 'approved' ? 'completed' : w.status === 'rejected' ? 'cancelled' : 'pending')}">${esc(w.status)}</span></td>
            <td class="px-4 py-3 text-right whitespace-nowrap">${w.status === 'pending'
              ? `<button data-wd-ok="${w.id}" class="px-3 py-1.5 rounded-[8px] bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-[11px]">Approve</button>
                 <button data-wd-no="${w.id}" class="px-3 py-1.5 rounded-[8px] bg-red-50 hover:bg-red-100 text-red-600 font-bold text-[11px] ml-1">Reject</button>`
              : '<span class="text-[11px] text-slate-400">—</span>'}</td>
          </tr>`).join('');
        tb.querySelectorAll('[data-wd-ok]').forEach(b => b.addEventListener('click', () => wdAct(b.getAttribute('data-wd-ok'), 'approve')));
        tb.querySelectorAll('[data-wd-no]').forEach(b => b.addEventListener('click', () => confirmDialog('Reject withdrawal?', 'টাকা user-er wallet-e refund jabe.', async () => { await wdAct(b.getAttribute('data-wd-no'), 'reject'); }, 'Yes, Reject')));
      } catch (e) { tb.innerHTML = `<tr><td colspan="6" class="px-5 py-8 text-center text-red-600 text-[12px]">${esc(e.message)}</td></tr>`; }
    }
    async function wdAct(id, action) {
      try {
        const j = await api('/api/admin/withdrawals/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify({ action }) });
        toast(j.message || 'Done');
        renderReferrals();
      } catch (e) { toast(e.message, false); }
    }
    async function loadComs() {
      const tb = $('comRows');
      try {
        const j = await api('/api/admin/referrals/commissions');
        if (!j.data.length) { tb.innerHTML = emptyRow(6, 'No commissions yet'); return; }
        tb.innerHTML = j.data.map(c => `
          <tr class="border-b border-slate-50 hover:bg-slate-50/60">
            <td class="px-4 sm:px-5 py-3 text-[12.5px] font-bold text-[#0F2043]">${esc(c.earnerName || ('#' + c.userId))}</td>
            <td class="px-4 py-3 text-[12px] text-slate-600">${esc(c.buyerName || ('#' + (c.buyerId || '')))}</td>
            <td class="px-4 py-3 text-[11.5px] font-bold text-slate-500">${esc(c.orderNo || ('#' + c.orderId))}</td>
            <td class="px-4 py-3 text-[13px] font-extrabold text-[#16A34A]">+৳${Number(c.amount || 0).toLocaleString('en-IN')}</td>
            <td class="px-4 py-3 text-[11.5px] text-slate-500">${esc((c.createdAt || '').slice(0, 10))}</td>
            <td class="px-4 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${statusClass(c.status === 'approved' ? 'completed' : 'cancelled')}">${esc(c.status)}</span></td>
          </tr>`).join('');
      } catch (e) { tb.innerHTML = `<tr><td colspan="6" class="px-5 py-8 text-center text-red-600 text-[12px]">${esc(e.message)}</td></tr>`; }
    }
    document.querySelectorAll('.wdf-btn').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('.wdf-btn').forEach(x => { x.className = 'wdf-btn px-3 py-1.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600'; });
      b.className = 'wdf-btn px-3 py-1.5 rounded-full text-[11px] font-bold bg-[#0F2043] text-white';
      loadWds(b.getAttribute('data-wdf'));
    }));
    loadWds('pending');
    loadComs();
  }

  /* ---------------- Dashboard ---------------- */
  function statCard(icon, label, value, color, bg, extra) {
    return `
      <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-4">
        <div class="flex items-start justify-between">
          <div class="w-11 h-11 rounded-[12px] flex items-center justify-center" style="background:${bg}">
            <i class="fa-solid ${icon}" style="color:${color}"></i>
          </div>
          ${extra ? `<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500">${esc(extra)}</span>` : ''}
        </div>
        <div class="text-[22px] font-extrabold text-[#0F2043] mt-3">${value}</div>
        <div class="text-[11.5px] font-semibold text-slate-500">${esc(label)}</div>
      </div>`;
  }

  function statusClass(status) {
    return {
      pending: 'bg-[#FFF2E6] text-[#F59E0B]',
      confirmed: 'bg-[#E6F0FF] text-[#1A56FF]',
      completed: 'bg-[#E6F4EA] text-[#16A34A]',
      cancelled: 'bg-red-50 text-red-600',
      active: 'bg-[#E6F4EA] text-[#16A34A]',
      inactive: 'bg-slate-100 text-slate-500',
      blocked: 'bg-red-50 text-red-600',
      banned: 'bg-red-50 text-red-600'
    }[status] || 'bg-slate-100 text-slate-500';
  }

  function errorBox(msg) {
    return `<div class="bg-red-50 border border-red-100 rounded-[14px] p-6 text-center">
      <i class="fa-solid fa-circle-exclamation text-red-500 text-[22px]"></i>
      <p class="text-[13px] font-semibold text-red-700 mt-2">${esc(msg)}</p>
      <button onclick="location.reload()" class="mt-3 px-4 py-2 rounded-[10px] bg-red-600 text-white font-bold text-[12px]">Reload</button>
    </div>`;
  }

  function emptyRow(cols, text) {
    return `<tr><td colspan="${cols}" class="px-5 py-10 text-center text-slate-400 text-[13px]">
      <i class="fa-regular fa-folder-open text-[20px] block mb-1"></i>${esc(text || 'No data found')}</td></tr>`;
  }

  async function renderDashboard() {
    const view = $('view');
    view.innerHTML = `<div class="text-center py-20 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-[22px]"></i><p class="text-[13px] mt-2">Loading dashboard...</p></div>`;
    try {
      const json = await api('/api/admin/stats');
      let maintOn = false;
      try {
        const sj = await api('/api/admin/settings');
        maintOn = !!(sj.data && sj.data.maintenanceEnabled);
      } catch (e) {}
      const d = json.data;
      const t = d.totals;
      const v = d.todayVisitors || { total: 0, pc: 0, phone: 0, pcPercent: 0, phonePercent: 0, views: 0, pcViews: 0, phoneViews: 0 };
      const maxRev = Math.max(1, ...d.last7Days.map(x => x.revenue));
      const maxOrders = Math.max(1, ...d.last7Days.map(x => x.orders));

      view.innerHTML = `
        ${maintOn ? `<a href="#/settings" class="mb-4 flex items-center gap-3 bg-[#FFF7ED] border border-[#FED7AA] rounded-[14px] px-4 py-3 hover:bg-[#FFEDD5] transition">
          <span class="w-9 h-9 rounded-full bg-[#EA580C] text-white flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-screwdriver-wrench text-[14px]"></i></span>
          <span><b class="text-[13px] text-[#9A3412]">Maintenance Mode ON</b><span class="block text-[11.5px] text-[#C2410C]">Public site ekhon maintenance page dekhacche — off korte Settings-e jan</span></span>
        </a>` : ''}
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          ${statCard('fa-sack-dollar', 'Total Revenue', cur(t.revenue), '#16A34A', '#E6F4EA', 'paid orders')}
          ${statCard('fa-cart-shopping', 'Total Orders', t.orders, '#1A56FF', '#E6F0FF', t.pendingOrders + ' pending')}
          ${statCard('fa-users', 'Total Students', t.users, '#7C3AED', '#EDE9FF', '')}
          ${statCard('fa-book-open', 'Total Courses', t.courses, '#F59E0B', '#FFF2E6', t.activeCourses + ' active')}
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-4">
          ${statCard('fa-layer-group', 'Batches', t.batches, '#4F46E5', '#EDE9FF', '')}
          ${statCard('fa-tags', 'Categories', t.categories, '#0EA5E9', '#E0F2FE', '')}
          ${statCard('fa-share-nodes', 'Platforms', t.platforms, '#DB2777', '#FCE7F3', '')}
          ${statCard('fa-ticket', 'Coupons', t.coupons, '#CA8A04', '#FEF9C3', 'unpaid ' + cur(t.pendingRevenue))}
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-4">
          ${statCard('fa-users', 'Groups', t.groups || 0, '#16A34A', '#DCFCE7', '')}
          ${statCard('fa-book-open', 'Subjects', t.subjects || 0, '#9333EA', '#F3E8FF', '')}
          ${statCard('fa-book', 'E-Books', (t.ebooks || '-'), '#0F766E', '#CCFBF1', '')}
          <div></div>
        </div>

        <!-- ================= TODAYS VISITOR SECTION ================= -->
        <div class="bg-white rounded-[16px] border border-slate-100 shadow-sm p-5 sm:p-6 mt-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-[12px] bg-gradient-to-br from-[#1A56FF] to-[#4F46E5] text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                <i class="fa-solid fa-users-viewfinder text-[17px]"></i>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-[16px] font-extrabold text-[#0F2043]">Todays Visitor</h3>
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Live Today
                  </span>
                </div>
                <p class="text-[11.5px] text-slate-500 mt-0.5">Real-time visitor breakdown by device (PC vs Phone)</p>
              </div>
            </div>
            <div class="flex items-center gap-2 text-[12px] font-bold text-slate-500">
              <span class="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                <i class="fa-regular fa-calendar text-slate-400"></i> ${esc(v.date || 'Today')}
              </span>
              <button onclick="window.location.reload()" class="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 transition" title="Refresh">
                <i class="fa-solid fa-arrows-rotate"></i>
              </button>
            </div>
          </div>

          <!-- 3 Device Cards -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-4">
            <!-- Total Visitors -->
            <div class="bg-slate-50/80 border border-slate-200/70 rounded-[14px] p-4 flex items-center justify-between">
              <div>
                <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Visitors</div>
                <div class="text-[26px] font-black text-[#0F2043] mt-1">${v.total}</div>
                <div class="text-[11px] font-medium text-slate-500 mt-0.5"><i class="fa-regular fa-eye mr-1 text-slate-400"></i>${v.views} Page Views</div>
              </div>
              <div class="w-12 h-12 rounded-[12px] bg-white border border-slate-200 text-[#0F2043] flex items-center justify-center text-[20px] shadow-sm">
                <i class="fa-solid fa-chart-pie text-[#1A56FF]"></i>
              </div>
            </div>

            <!-- PC Users -->
            <div class="bg-gradient-to-br from-blue-50/60 to-white border border-blue-100 rounded-[14px] p-4 flex items-center justify-between">
              <div>
                <div class="flex items-center gap-1.5">
                  <span class="text-[11px] font-bold text-blue-900 uppercase tracking-wider">PC Users</span>
                  <span class="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">${v.pcPercent}%</span>
                </div>
                <div class="text-[26px] font-black text-blue-900 mt-1">${v.pc}</div>
                <div class="text-[11px] font-medium text-blue-600/80 mt-0.5"><i class="fa-solid fa-desktop mr-1 text-blue-400"></i>${v.pcViews} Desktop Views</div>
              </div>
              <div class="w-12 h-12 rounded-[12px] bg-[#1A56FF] text-white flex items-center justify-center text-[20px] shadow-md shadow-blue-500/25">
                <i class="fa-solid fa-desktop"></i>
              </div>
            </div>

            <!-- Phone Users -->
            <div class="bg-gradient-to-br from-purple-50/60 to-white border border-purple-100 rounded-[14px] p-4 flex items-center justify-between">
              <div>
                <div class="flex items-center gap-1.5">
                  <span class="text-[11px] font-bold text-purple-900 uppercase tracking-wider">Phone Users</span>
                  <span class="text-[10px] font-black px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">${v.phonePercent}%</span>
                </div>
                <div class="text-[26px] font-black text-purple-900 mt-1">${v.phone}</div>
                <div class="text-[11px] font-medium text-purple-600/80 mt-0.5"><i class="fa-solid fa-mobile-screen-button mr-1 text-purple-400"></i>${v.phoneViews} Mobile Views</div>
              </div>
              <div class="w-12 h-12 rounded-[12px] bg-[#7C3AED] text-white flex items-center justify-center text-[20px] shadow-md shadow-purple-500/25">
                <i class="fa-solid fa-mobile-screen-button"></i>
              </div>
            </div>
          </div>

          <!-- Ratio Progress Bar -->
          <div class="mt-4 pt-3.5 border-t border-slate-100">
            <div class="flex items-center justify-between text-[12px] font-bold mb-2">
              <span class="flex items-center gap-1.5 text-blue-700">
                <i class="fa-solid fa-desktop text-[12px]"></i> PC Users: <span class="text-[#0F2043]">${v.pc}</span> (${v.pcPercent}%)
              </span>
              <span class="flex items-center gap-1.5 text-purple-700">
                Phone Users: <span class="text-[#0F2043]">${v.phone}</span> (${v.phonePercent}%) <i class="fa-solid fa-mobile-screen-button text-[12px]"></i>
              </span>
            </div>
            <div class="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex p-0.5 gap-0.5">
              <div class="h-full bg-[#1A56FF] rounded-full transition-all duration-500" style="width:${v.total ? Math.max(5, v.pcPercent) : 50}%" title="PC Users: ${v.pcPercent}%"></div>
              <div class="h-full bg-[#7C3AED] rounded-full transition-all duration-500" style="width:${v.total ? Math.max(5, v.phonePercent) : 50}%" title="Phone Users: ${v.phonePercent}%"></div>
            </div>
            <div class="flex items-center justify-between text-[10.5px] text-slate-400 mt-1.5">
              <span><i class="fa-solid fa-circle text-[7px] text-[#1A56FF] mr-1"></i>Computer / Laptop / Windows / macOS</span>
              <span>Android / iPhone / Smartphone<i class="fa-solid fa-circle text-[7px] text-[#7C3AED] ml-1"></i></span>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr] gap-4 mt-4">
          <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
            <div class="flex items-center justify-between mb-5">
              <div>
                <h3 class="text-[15px] font-extrabold text-[#0F2043]">Last 7 Days Performance</h3>
                <p class="text-[11px] text-slate-500">Orders &amp; revenue trend</p>
              </div>
              <div class="flex items-center gap-3 text-[11px] font-semibold text-slate-500">
                <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-[#1A56FF] inline-block"></span>Revenue</span>
                <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-[#C7D9FF] inline-block"></span>Orders</span>
              </div>
            </div>
            <div class="flex items-end justify-between gap-2 sm:gap-4 h-[190px]">
              ${d.last7Days.map(day => `
                <div class="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                  <div class="text-[10px] font-bold text-[#16A34A]">${day.revenue ? cur(day.revenue) : ''}</div>
                  <div class="w-full flex items-end justify-center gap-1 h-full">
                    <div class="w-[45%] bg-[#1A56FF] rounded-t-[6px]" style="height:${Math.max(3, (day.revenue / maxRev) * 100)}%"></div>
                    <div class="w-[45%] bg-[#C7D9FF] rounded-t-[6px]" style="height:${Math.max(3, (day.orders / maxOrders) * 100)}%"></div>
                  </div>
                  <div class="text-[10px] font-semibold text-slate-500">${day.date.slice(5)}</div>
                </div>`).join('')}
            </div>
          </div>

          <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
            <h3 class="text-[15px] font-extrabold text-[#0F2043] mb-1">Order Status</h3>
            <p class="text-[11px] text-slate-500 mb-4">Distribution of all orders</p>
            <div class="space-y-3">
              ${d.byStatus.map(s => {
                const pct = t.orders ? Math.round((s.count / t.orders) * 100) : 0;
                const color = { pending: '#F59E0B', confirmed: '#1A56FF', completed: '#16A34A', cancelled: '#DC2626' }[s.status] || '#64748B';
                return `
                <div>
                  <div class="flex items-center justify-between text-[12px] font-semibold text-slate-600 mb-1">
                    <span class="capitalize">${esc(s.status)}</span><span>${s.count} (${pct}%)</span>
                  </div>
                  <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div class="h-full rounded-full" style="width:${pct}%;background:${color}"></div>
                  </div>
                </div>`;
              }).join('')}
            </div>
            <div class="mt-5 pt-4 border-t border-slate-100">
              <h4 class="text-[12px] font-extrabold text-[#0F2043] mb-2">Courses per Batch</h4>
              <div class="space-y-2">
                ${d.byBatch.map(b => `
                  <div class="flex items-center justify-between text-[12px]">
                    <span class="flex items-center gap-2 font-semibold text-slate-600">
                      <span class="w-2.5 h-2.5 rounded-full" style="background:${b.color || '#1A56FF'}"></span>${esc(b.batch)}
                    </span>
                    <span class="font-bold text-[#0F2043]">${b.courses}</span>
                  </div>`).join('') || '<p class="text-[12px] text-slate-400">No batches yet</p>'}
              </div>
            </div>
          </div>
        </div>
        ${dashboardBottom(d)}
      `;
    } catch (err) {
      view.innerHTML = errorBox(err.message);
    }
  }

  function dashboardBottom(d) {
    return `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 class="text-[14px] font-extrabold text-[#0F2043]"><i class="fa-solid fa-clock-rotate-left text-[#1A56FF] mr-1"></i> Recent Orders</h3>
              <a href="#/orders" class="text-[12px] font-bold text-[#1A56FF]">View all</a>
            </div>
            <div class="divide-y divide-slate-100">
              ${d.recentOrders.length ? d.recentOrders.map(o => `
                <div class="px-5 py-3 flex items-center justify-between gap-3 hover:bg-[#F8F9FD]">
                  <div class="min-w-0">
                    <div class="text-[13px] font-bold text-[#0F2043] truncate">${esc(o.orderNo)} <span class="font-medium text-slate-500">- ${esc((o.customer && o.customer.name) || 'Guest')}</span></div>
                    <div class="text-[11px] text-slate-500">${o.items.length} course(s) - ${dt(o.createdAt)}</div>
                  </div>
                  <div class="text-right">
                    <div class="text-[13px] font-extrabold text-[#0F2043]">${cur(o.total)}</div>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${statusClass(o.status)}">${esc(o.status)}</span>
                  </div>
                </div>`).join('') : '<p class="px-5 py-8 text-center text-[13px] text-slate-400">No orders yet</p>'}
            </div>
          </div>

          <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 class="text-[14px] font-extrabold text-[#0F2043]"><i class="fa-solid fa-user-plus text-[#1A56FF] mr-1"></i> New Students</h3>
              <a href="#/users" class="text-[12px] font-bold text-[#1A56FF]">View all</a>
            </div>
            <div class="divide-y divide-slate-100">
              ${d.recentUsers.length ? d.recentUsers.map(u => `
                <div class="px-5 py-3 flex items-center gap-3 hover:bg-[#F8F9FD]">
                  <div class="w-9 h-9 rounded-full bg-[#EDE9FF] text-[#4F46E5] font-extrabold text-[13px] flex items-center justify-center">${esc((u.name || 'U').charAt(0).toUpperCase())}</div>
                  <div class="min-w-0 flex-1">
                    <div class="text-[13px] font-bold text-[#0F2043] truncate">${esc(u.name)}</div>
                    <div class="text-[11px] text-slate-500 truncate">${esc(u.email)}</div>
                  </div>
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${statusClass(u.status)}">${esc(u.status || 'active')}</span>
                </div>`).join('') : '<p class="px-5 py-8 text-center text-[13px] text-slate-400">No students registered yet</p>'}
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <a href="#/courses" class="bg-[#0F2043] text-white rounded-[14px] p-5 hover:bg-[#16294F] transition">
            <i class="fa-solid fa-plus-circle text-[22px] text-[#4D8BFF]"></i>
            <div class="text-[14px] font-extrabold mt-3">Add New Course</div>
            <p class="text-[11.5px] text-slate-300">Create a course under any batch</p>
          </a>
          <a href="#/coupons" class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5 hover:shadow-md transition">
            <i class="fa-solid fa-ticket text-[22px] text-[#CA8A04]"></i>
            <div class="text-[14px] font-extrabold mt-3 text-[#0F2043]">Create Coupon</div>
            <p class="text-[11.5px] text-slate-500">Percent or flat discount codes</p>
          </a>
          <a href="#/settings" class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5 hover:shadow-md transition">
            <i class="fa-solid fa-sliders text-[22px] text-[#7C3AED]"></i>
            <div class="text-[14px] font-extrabold mt-3 text-[#0F2043]">Site Settings</div>
            <p class="text-[11.5px] text-slate-500">Telegram, phone, currency &amp; more</p>
          </a>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <a href="#/admins" class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5 hover:shadow-md transition">
            <i class="fa-solid fa-user-shield text-[22px] text-[#1A56FF]"></i>
            <div class="text-[14px] font-extrabold mt-3 text-[#0F2043]">Admin Team</div>
            <p class="text-[11.5px] text-slate-500">Notun admin add / remove korun</p>
          </a>
          <a href="#/notify" class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5 hover:shadow-md transition">
            <i class="fa-solid fa-envelope text-[22px] text-[#16A34A]"></i>
            <div class="text-[14px] font-extrabold mt-3 text-[#0F2043]">Send Notification</div>
            <p class="text-[11.5px] text-slate-500">Gmail diye student ke mail pathan</p>
          </a>
        </div>`;
  }

  /* ---------------- Resource definitions ---------------- */
  const REL = {
    batch: () => state.meta.batches.map(b => ({ value: b.id, label: b.name })),
    ebookBatch: () => (state.meta.ebookBatches || []).map(b => ({ value: b.id, label: b.name })),
    category: () => state.meta.categories.map(c => ({ value: c.id, label: c.name })),
    courseCategory: () => state.meta.categories.filter(c => !c.for || c.for === 'both' || c.for === 'course').map(c => ({ value: c.id, label: c.name })),
    ebookCategory: () => state.meta.categories.filter(c => !c.for || c.for === 'both' || c.for === 'ebook').map(c => ({ value: c.id, label: c.name })),
    platform: () => state.meta.platforms.map(p => ({ value: p.id, label: p.name })),
    group: () => (state.meta.groups || []).map(g => ({ value: g.id, label: g.name })),
    subject: () => (state.meta.subjects || []).map(s => ({ value: s.id, label: s.name })),
    status: () => [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]
  };

  function relName(kind, id) {
    const map = { batch: 'batches', category: 'categories', platform: 'platforms', group: 'groups', subject: 'subjects' };
    const key = map[kind] || kind;
    const list = state.meta[key] || [];
    const found = list.find(i => String(i.id) === String(id));
    return found ? found.name : '-';
  }

  function badge(text) {
    return `<span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${statusClass(text)}">${esc(text)}</span>`;
  }

  function fmtSize(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + 'MB';
    if (n >= 1024) return Math.round(n / 1024) + 'KB';
    return n + 'B';
  }

  const RESOURCES = {
    courses: {
      endpoint: '/api/admin/courses',
      singular: 'Course',
      addLabel: 'Add New Course',
      columns: [
        { key: 'id', label: '#', cell: r => `<span class="text-slate-400 font-bold">${r.id}</span>` },
        { key: 'title', label: 'Course', cell: r => `
            <div class="font-bold text-[#0F2043] leading-snug min-w-[150px] max-w-[260px]">${r.pinned ? '📌 ' : ''}${esc(r.title)}</div>
            <div class="text-[11px] text-slate-500">${esc(r.teacher || 'No teacher')}${r.featured ? ' - <span class="text-[#F59E0B] font-bold">Featured</span>' : ''}${r.pinned ? ' - <span class="text-[#B45309] font-bold">Pinned</span>' : ''}</div>` },
        { key: 'batchId', label: 'Batch', cell: r => `<span class="px-2 py-0.5 rounded-full bg-[#EDE9FF] text-[#4F46E5] text-[11px] font-bold whitespace-nowrap">${esc(relName('batch', r.batchId))}</span>` },
        { key: 'categoryId', cls: 'hidden xl:table-cell', label: 'Category', cell: r => esc(relName('category', r.categoryId)) },
        { key: 'platformId', cls: 'hidden xl:table-cell', label: 'Platform', cell: r => esc(relName('platform', r.platformId)) },
        { key: 'price', label: 'Price', cell: r => `<span class="font-bold text-[#0F2043]">${cur(r.price)}</span>${r.oldPrice ? ` <span class="text-[11px] text-slate-400 line-through">${cur(r.oldPrice)}</span>` : ''}` },
        { key: 'status', label: 'Status', cell: r => badge(r.status || 'active') }
      ],
      filters: [
        { field: 'batchId', allLabel: 'All Batches', options: () => REL.batch() },
        { field: 'categoryId', allLabel: 'All Categories', options: () => REL.category() },
        { field: 'platformId', allLabel: 'All Platforms', options: () => REL.platform() },
        { field: 'groupId', allLabel: 'All Groups', options: () => REL.group() },
        { field: 'subjectId', allLabel: 'All Sections', options: () => REL.subject() }
      ],
      fields: [
        { name: 'title', label: 'Course Title', type: 'text', required: true, span: 2 },
        { name: 'teacher', label: 'Teacher Name', type: 'text' },
        { name: 'batchId', label: 'Batch', type: 'select', options: REL.batch, required: true },
        { name: 'categoryId', label: 'Category (optional)', type: 'select', options: REL.category },
        { name: 'platformId', label: 'Platform', type: 'select', options: REL.platform },
        { name: 'groupId', label: 'Group', type: 'select', options: REL.group },
        { name: 'subjectId', label: 'Subject', type: 'select', options: REL.subject },
        { name: 'price', label: 'Price (৳)', type: 'number' },
        { name: 'oldPrice', label: 'Old Price (৳)', type: 'number' },
        { name: 'duration', label: 'Duration', type: 'text', placeholder: '3 Months' },
        { name: 'totalClass', label: 'Total Class', type: 'number' },
        { name: 'thumbnail', label: 'Thumbnail URL', type: 'text', span: 2 },
        { name: 'description', label: 'Description', type: 'textarea', span: 3 },
        { name: 'featured', label: 'Show as Featured on homepage', type: 'checkbox' },
        { name: 'status', label: 'Status', type: 'select', options: REL.status }
      ]
    },
    batches: {
      endpoint: '/api/admin/batches',
      singular: 'Batch',
      addLabel: 'Add New Batch',
      columns: [
        { key: 'order', label: '#', cell: r => `<span class="px-2 py-1 rounded bg-slate-100 text-[#0F2043] text-[11px] font-bold">${r.order || '-'}</span>` },
        { key: 'name', label: 'Batch', cell: r => `
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0" style="background:${esc(r.color||'#EEF2FF')};border:1px solid #E2E8F0">
              ${r.iconUrl ? `<img src="${esc(r.iconUrl)}" class="w-full h-full object-contain p-1">` : `<i class="fa-solid ${esc(r.icon||'fa-layer-group')} text-[13px]" style="color:${esc(r.color||'#6366F1')}"></i>`}
            </div>
            <div>
              <div class="font-bold text-[#0F2043] text-[13px]">${esc(r.name)}</div>
              <div class="text-[11px] text-slate-500">slug: ${esc(r.slug || '-')}</div>
            </div>
          </div>` },
        { key: 'color', label: 'Theme', cell: r => `<span class="inline-flex items-center gap-2"><span class="w-4 h-4 rounded" style="background:${esc(r.color||'#6366F1')};border:1px solid #E2E8F0"></span>${esc(r.color||'-')}</span>` },
        { key: 'status', label: 'Status', cell: r => badge(r.status || 'active') }
      ],
      fields: [
        { name: 'name', label: 'Batch Name', type: 'text', required: true, placeholder: 'HSC 26' },
        { name: 'slug', label: 'Slug (auto)', type: 'text', placeholder: 'hsc26' },
        { name: 'order', label: 'Serial (show order)', type: 'number', placeholder: '1' },
        { name: 'icon', label: 'Icon (FontAwesome)', type: 'text', placeholder: 'fa-graduation-cap' },
        { name: 'iconUrl', label: 'Icon Image (Upload)', type: 'image', placeholder: 'Upload or paste URL' },
        { name: 'color', label: 'Theme Color', type: 'color' },
        { name: 'status', label: 'Status', type: 'select', options: REL.status }
      ]
    },
    ebookBatches: {
      endpoint: '/api/admin/ebookBatches',
      singular: 'E-Book Batch',
      addLabel: 'Add New E-Book Batch',
      columns: [
        { key: 'order', label: '#', cell: r => `<span class="px-2 py-1 rounded bg-slate-100 text-[#0F2043] text-[11px] font-bold">${r.order || '-'}</span>` },
        { key: 'name', label: 'E-Book Batch', cell: r => `
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0" style="background:${esc(r.color||'#E0F2FE')};border:1px solid #E2E8F0">
              ${r.iconUrl ? `<img src="${esc(r.iconUrl)}" class="w-full h-full object-contain p-1">` : `<i class="fa-solid ${esc(r.icon||'fa-book-open')} text-[13px]" style="color:${esc(r.color||'#0EA5E9')}"></i>`}
            </div>
            <div>
              <div class="font-bold text-[#0F2043] text-[13px]">${esc(r.name)}</div>
              <div class="text-[11px] text-slate-500">slug: ${esc(r.slug || '-')}</div>
            </div>
          </div>` },
        { key: 'color', label: 'Theme', cell: r => `<span class="inline-flex items-center gap-2"><span class="w-4 h-4 rounded" style="background:${esc(r.color||'#0EA5E9')};border:1px solid #E2E8F0"></span>${esc(r.color||'-')}</span>` },
        { key: 'status', label: 'Status', cell: r => badge(r.status || 'active') }
      ],
      fields: [
        { name: 'name', label: 'E-Book Batch Name', type: 'text', required: true, placeholder: 'HSC 26 E-Book' },
        { name: 'slug', label: 'Slug (auto)', type: 'text', placeholder: 'hsc26-ebook' },
        { name: 'order', label: 'Serial (show order)', type: 'number', placeholder: '1' },
        { name: 'icon', label: 'Icon (FontAwesome)', type: 'text', placeholder: 'fa-book-open' },
        { name: 'iconUrl', label: 'Icon Image (Upload)', type: 'image', placeholder: 'Upload or paste URL' },
        { name: 'color', label: 'Theme Color', type: 'color' },
        { name: 'status', label: 'Status', type: 'select', options: REL.status }
      ]
    },
    categories: {
      endpoint: '/api/admin/categories',
      singular: 'Category',
      addLabel: 'Add New Category',
      columns: [
        { key: 'id', label: '#', cell: r => `<span class="text-slate-400 font-bold">${r.id}</span>` },
        { key: 'name', label: 'Category', cell: r => `<div class="font-bold text-[#0F2043]"><i class="fa-solid ${esc(r.icon || 'fa-tag')} mr-1 text-[#1A56FF]"></i>${esc(r.name)}</div><div class="text-[11px] text-slate-500">slug: ${esc(r.slug || '-')}</div>` },
        { key: 'for', label: 'Used For', cell: r => {
          const v = r.for || 'both';
          const map = { both: ['Both', 'bg-[#EDE9FF] text-[#4F46E5]'], course: ['Course', 'bg-[#E6F0FF] text-[#1A56FF]'], ebook: ['E-Book', 'bg-[#E0F2FE] text-[#0284C7]'] };
          const m = map[v] || map.both;
          return `<span class="px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${m[1]}">${m[0]}</span>`;
        } },
        { key: 'color', label: 'Color', cell: r => `<span class="inline-flex items-center gap-2"><span class="w-4 h-4 rounded" style="background:${esc(r.color || '#EDE9FF')};border:1px solid #E2E8F0"></span>${esc(r.color || '-')}</span>` },
        { key: 'status', label: 'Status', cell: r => badge(r.status || 'active') }
      ],
      fields: [
        { name: 'name', label: 'Category Name', type: 'text', required: true, placeholder: 'Academic' },
        { name: 'for', label: 'Used For (Course / E-Book)', type: 'select', options: () => [{ value: 'both', label: 'Both (Course + E-Book)' }, { value: 'course', label: 'Course only' }, { value: 'ebook', label: 'E-Book only' }] },
        { name: 'icon', label: 'FontAwesome Icon', type: 'text', placeholder: 'fa-graduation-cap' },
        { name: 'slug', label: 'Slug (auto)', type: 'text', placeholder: 'academic' },
        { name: 'color', label: 'Background Color', type: 'color' },
        { name: 'status', label: 'Status', type: 'select', options: REL.status }
      ]
    },
    platforms: {
      endpoint: '/api/admin/platforms',
      singular: 'Platform',
      addLabel: 'Add New Platform',
      columns: [
        { key: 'id', label: '#', cell: r => `<span class="text-slate-400 font-bold">${r.id}</span>` },
        { key: 'name', label: 'Platform', cell: r => `<div class="font-bold text-[#0F2043]">${esc(r.name)}</div>` },
        { key: 'status', label: 'Status', cell: r => badge(r.status || 'active') }
      ],
      fields: [
        { name: 'name', label: 'Platform Name', type: 'text', required: true, span: 2, placeholder: 'ACS' },
        { name: 'status', label: 'Status', type: 'select', options: REL.status }
      ]
    },
    groups: {
      endpoint: '/api/admin/groups',
      singular: 'Group',
      addLabel: 'Add New Group',
      columns: [
        { key: 'id', label: '#', cell: r => `<span class="text-slate-400 font-bold">${r.id}</span>` },
        { key: 'name', label: 'Group', cell: r => `<div class="font-bold text-[#0F2043]">${esc(r.name)}</div>` },
        { key: 'status', label: 'Status', cell: r => badge(r.status || 'active') }
      ],
      fields: [
        { name: 'name', label: 'Group Name', type: 'text', required: true, span: 2, placeholder: 'Science' },
        { name: 'status', label: 'Status', type: 'select', options: REL.status }
      ]
    },
    subjects: {
      endpoint: '/api/admin/subjects',
      singular: 'Subject',
      addLabel: 'Add New Section',
      columns: [
        { key: 'id', label: '#', cell: r => `<span class="text-slate-400 font-bold">${r.id}</span>` },
        { key: 'name', label: 'Subject', cell: r => `<div class="font-bold text-[#0F2043]">${esc(r.name)}</div>` },
        { key: 'status', label: 'Status', cell: r => badge(r.status || 'active') }
      ],
      fields: [
        { name: 'name', label: 'Subject Name', type: 'text', required: true, span: 2, placeholder: 'Physics' },
        { name: 'status', label: 'Status', type: 'select', options: REL.status }
      ]
    },
    ebooks: {
      endpoint: '/api/admin/ebooks',
      singular: 'E-Book',
      addLabel: 'Add New E-Book',
      columns: [
        { key: 'id', label: '#', cell: r => `<span class="text-slate-400 font-bold">${r.id}</span>` },
        { key: 'ebookBatchId', label: 'E-Book Batch', cell: r => {
          const eb = (state.meta.ebookBatches || []).find(x => String(x.id) === String(r.ebookBatchId));
          if (eb) return `<span class="px-2 py-0.5 rounded-full bg-[#E0F2FE] text-[#0284C7] text-[11px] font-bold whitespace-nowrap">${esc(eb.name)}</span>`;
          if (r.batchId) return `<span class="px-2 py-0.5 rounded-full bg-[#EDE9FF] text-[#4F46E5] text-[11px] font-bold whitespace-nowrap">${esc(relName('batch', r.batchId))}</span>`;
          return '<span class="text-slate-400 text-[11px]">—</span>';
        } },
        { key: 'categoryId', label: 'Category', cell: r => esc(relName('category', r.categoryId)) },
        { key: 'title', label: 'E-Book', cell: r => `
          <div class="flex items-center gap-2.5">
            <div class="w-10 h-12 rounded-[6px] bg-[#F8F9FD] border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
              ${r.cover ? `<img src="${esc(r.cover)}" class="w-full h-full object-contain">` : `<i class="fa-solid fa-book text-slate-300"></i>`}
            </div>
            <div class="min-w-0">
              <div class="font-bold text-[#0F2043] truncate max-w-[220px]">${esc(r.title)}</div>
              <div class="text-[11px] text-slate-500 truncate max-w-[220px]">${esc(r.details || 'No details')}</div>
            </div>
          </div>` },
        { key: 'fileUrl', label: 'File', cell: r => (r.fileUrl
            ? `<a href="${esc(r.fileUrl)}" target="_blank" class="px-2 py-0.5 rounded-full bg-[#E6F4EA] text-[#16A34A] text-[11px] font-bold"><i class="fa-solid fa-file-pdf mr-0.5"></i> PDF${r.fileSize ? ' • ' + fmtSize(r.fileSize) : ''}</a>`
            : r.linkUrl
              ? `<span class="px-2 py-0.5 rounded-full bg-[#E0F2FE] text-[#0EA5E9] text-[11px] font-bold"><i class="fa-solid fa-link mr-0.5"></i> Link</span>`
              : '<span class="text-slate-400 text-[11px]">—</span>') },
        { key: 'price', label: 'Price', cell: r => (Number(r.price) > 0
            ? `<span class="font-bold text-[#0F2043]">৳${esc(r.price)}</span>${Number(r.oldPrice) > Number(r.price) ? ` <span class="text-[11px] text-slate-400 line-through">৳${esc(r.oldPrice)}</span>` : ''}`
            : `<span class="px-2 py-0.5 rounded-full bg-[#E6F4EA] text-[#16A34A] text-[11px] font-bold">FREE</span>`) },
        { key: 'downloads', label: 'Downloads', cell: r => `<span class="font-bold text-[#0F2043]">${Number(r.downloads || 0)}</span>` },
        { key: 'status', label: 'Status', cell: r => badge(r.status || 'active') }
      ],
      filters: [
        { field: 'ebookBatchId', allLabel: 'All E-Book Batches', options: () => REL.ebookBatch() },
        { field: 'categoryId', allLabel: 'All Categories', options: () => REL.category() }
      ],
      fields: []
    },
    coupons: {
      endpoint: '/api/admin/coupons',
      singular: 'Coupon',
      addLabel: 'Create Coupon',
      columns: [
        { key: 'code', label: 'Code', cell: r => `<span class="px-2 py-1 rounded-[6px] bg-[#0F2043] text-white text-[12px] font-extrabold tracking-wider">${esc(r.code)}</span>` },
        { key: 'type', label: 'Discount', cell: r => `<span class="font-bold text-[#0F2043]">${r.type === 'percent' ? esc(r.value) + '%' : cur(r.value)}</span> <span class="text-slate-500 text-[11px]">off</span>` },
        { key: 'courseIds', label: 'Applies To', cell: r => {
          const nc = Array.isArray(r.courseIds) ? r.courseIds.length : 0;
          const nb = Array.isArray(r.batchIds) ? r.batchIds.length : 0;
          const ng = Array.isArray(r.categoryIds) ? r.categoryIds.length : 0;
          if (!nc && !nb && !ng) return '<span class="px-2 py-0.5 rounded-full bg-[#EDE9FF] text-[#4F46E5] text-[11px] font-bold">All Courses</span>';
          const parts = [];
          if (nb) parts.push(nb === 1 ? '1 Batch' : nb + ' Batches');
          if (ng) parts.push(ng === 1 ? '1 Category' : ng + ' Categories');
          if (nc) parts.push(nc === 1 ? '1 Course' : nc + ' Courses');
          return `<span class="px-2 py-0.5 rounded-full bg-[#E6F4EA] text-[#16A34A] text-[11px] font-bold">${esc(parts.join(' • '))}</span>`;
        } },
        { key: 'userIds', label: 'Users', cell: r => {
          const nu = Array.isArray(r.userIds) ? r.userIds.length : 0;
          const ne = Array.isArray(r.allowedEmails) ? r.allowedEmails.length : 0;
          const np = Array.isArray(r.allowedPhones) ? r.allowedPhones.length : 0;
          const total = nu + ne + np;
          if (!total) return '<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold">All Users</span>';
          return `<span class="px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#B45309] text-[11px] font-bold"><i class="fa-solid fa-user-lock mr-0.5"></i>${total} User${total > 1 ? 's' : ''}</span>`;
        } },
        { key: 'minOrder', label: 'Min Order', cell: r => cur(r.minOrder) },
        { key: 'maxDiscount', label: 'Max Discount', cell: r => cur(r.maxDiscount) },
        { key: 'used', label: 'Used', cell: r => `<span class="font-bold text-[#0F2043]">${Number(r.used || 0)}</span><span class="text-slate-400"> / ${Number(r.usageLimit || 0)}</span>` },
        { key: 'expiresAt', label: 'Expires', cell: r => esc(r.expiresAt || '-') },
        { key: 'status', label: 'Status', cell: r => badge(r.status || 'active') }
      ],
      fields: [
        { name: 'code', label: 'Coupon Code', type: 'text', required: true, placeholder: 'SAVE10' },
        { name: 'type', label: 'Discount Type', type: 'select', options: () => [{ value: 'percent', label: 'Percent (%)' }, { value: 'fixed', label: 'Fixed Amount' }] },
        { name: 'value', label: 'Discount Value', type: 'number', required: true },
        { name: 'minOrder', label: 'Minimum Order', type: 'number' },
        { name: 'maxDiscount', label: 'Maximum Discount', type: 'number' },
        { name: 'usageLimit', label: 'Usage Limit', type: 'number' },
        { name: 'expiresAt', label: 'Expiry Date', type: 'date' },
        { name: 'status', label: 'Status', type: 'select', options: REL.status },
        { name: 'batchIds', label: 'Batches (empty = all)', type: 'batches' },
        { name: 'categoryIds', label: 'Categories (empty = all)', type: 'categories' },
        { name: 'courseIds', label: 'Courses (empty = all)', type: 'courses' }
      ]
    }
  };


  /* ---------------- Class Update: Batch → Category → Course → Section → Sub-Section → Chapter → Class ---------------- */
  let cuState = { courseId: '', batchId: '', categoryId: '', courseQ: '', subject: '', subsection: '', chapter: '', topic: '', subtopic: '', lessons: [], subjects: [], subsections: [], chapters: [], topics: [], subtopics: [], allCourses: [], extraSections: [], extraSubSections: [], extraChapters: [], extraTopics: [], extraSubTopics: [] };
  async function renderClassUpdate(){
    const view = $('view');
    view.innerHTML = `<div class="text-center py-20 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-[22px]"></i><p class="text-[13px] mt-2">Loading classes...</p></div>`;
    // ensure meta loaded
    try{ await refreshMeta(); }catch(e){}
    // fetch courses for dropdown
    let courses = [];
    try{
      const j = await api('/api/admin/courses?limit=200');
      courses = j.data || [];
      courses.sort((a,b)=> String(a.title).localeCompare(String(b.title)));
    }catch(e){ courses = state.lists.courses || []; }
    // keep previous selection if any — Course List er "Classes" button theke ele oi course auto-select
    try {
      const hm = String(location.hash || '').match(/courseId=([^&]+)/);
      if (hm && hm[1]) cuState.courseId = decodeURIComponent(hm[1]);
    } catch (e) {}
    cuState.allCourses = courses.slice();
    // Batch/Category filter-ke current course-er sathe sync rakho (hash/previous selection)
    (function cuSyncFilters(){
      const cur = courses.find(c=> String(c.id)===String(cuState.courseId));
      if(cur){
        if(cur.batchId !== undefined && cur.batchId !== null && String(cur.batchId) !== '') cuState.batchId = String(cur.batchId);
        if(cur.categoryId !== undefined && cur.categoryId !== null && String(cur.categoryId) !== '') cuState.categoryId = String(cur.categoryId);
      }
      // stale filter clean: ei batch-e category na thakle reset
      if(cuState.batchId && !courses.some(c=> String(c.batchId)===String(cuState.batchId))) cuState.batchId = '';
      if(cuState.categoryId){
        const pool = cuState.batchId ? courses.filter(c=> String(c.batchId)===String(cuState.batchId)) : courses;
        if(!pool.some(c=> String(c.categoryId)===String(cuState.categoryId))) cuState.categoryId = '';
      }
    })();
    if(!cuState.courseId && courses.length) cuState.courseId = String(courses[0].id);
    const batchOpts = `<option value="">-- All Batches --</option>` + REL.batch().map(b=> `<option value="${esc(b.value)}" ${String(b.value)===String(cuState.batchId)?'selected':''}>${esc(b.label)}</option>`).join('');
    const catOpts = `<option value="">-- All Categories --</option>` + REL.courseCategory().map(c=> `<option value="${esc(c.value)}" ${String(c.value)===String(cuState.categoryId)?'selected':''}>${esc(c.label)}</option>`).join('');
    view.innerHTML = `
      <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-4 mb-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="w-8 h-8 rounded-[8px] bg-[#1A56FF] text-white flex items-center justify-center"><i class="fa-solid fa-circle-play text-[14px]"></i></span>
          <div>
            <h3 class="text-[14px] font-extrabold text-[#0F2043]">Class Update</h3>
          </div>
          <span class="ml-auto text-[10px] font-bold px-2 py-1 rounded-full bg-[#E6F4EA] text-[#16A34A]">Live</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label class="text-[11px] font-bold text-slate-600 uppercase">Batch</label><select id="cuBatch" class="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] bg-white outline-none focus:border-[#1A56FF] mt-1">${batchOpts}</select></div>
          <div><label class="text-[11px] font-bold text-slate-600 uppercase">Category</label><select id="cuCategory" class="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] bg-white outline-none focus:border-[#1A56FF] mt-1">${catOpts}</select></div>
          <div><label class="text-[11px] font-bold text-slate-600 uppercase">Search Course</label><div class="relative mt-1"><input id="cuCourseSearch" value="${esc(cuState.courseQ||'')}" placeholder="Type to filter courses... (name / #id)" autocomplete="off" class="w-full border border-slate-200 rounded-[8px] pl-3 pr-8 py-2 text-[13px] bg-white outline-none focus:border-[#1A56FF]"><button id="cuCourseClear" type="button" title="Clear search" class="${cuState.courseQ ? '' : 'hidden'} absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center"><i class="fa-solid fa-xmark text-[11px]"></i></button></div></div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-5 gap-3 mt-3">
          <div><label class="text-[11px] font-bold text-slate-600 uppercase">Course <span class="text-red-500">*</span> <span id="cuCourseCount" class="text-slate-400 normal-case font-semibold"></span></label><select id="cuCourse" class="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] bg-white outline-none focus:border-[#1A56FF] mt-1"></select></div>
          <div><label class="text-[11px] font-bold text-slate-600 uppercase"><span id="cuLblSection">Section</span></label><select id="cuSubject" class="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] bg-white outline-none focus:border-[#1A56FF] mt-1"><option value="">-- All --</option></select></div>
          <div><label class="text-[11px] font-bold text-slate-600 uppercase"><span id="cuLblSub">Sub-Section</span></label><select id="cuSubSection" class="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] bg-white outline-none focus:border-[#1A56FF] mt-1"><option value="">-- All --</option></select></div>
          <div><label class="text-[11px] font-bold text-slate-600 uppercase"><span id="cuLblChap">Chapter</span></label><select id="cuChapter" class="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] bg-white outline-none focus:border-[#1A56FF] mt-1"><option value="">-- All --</option></select></div>
          <div class="flex items-end gap-2">
            <button id="cuAdd" class="flex-1 px-4 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]"><i class="fa-solid fa-plus mr-1"></i> Add Class</button>
            <button id="cuStepNames" class="w-10 h-10 rounded-[10px] bg-[#F5F3FF] text-[#7C3AED] hover:bg-[#EDE9FF] flex items-center justify-center flex-shrink-0" title="Steps"><i class="fa-solid fa-layer-group text-[12px]"></i></button>
          </div>
        </div>
        <div id="cuExtraRow" class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 p-3 rounded-[10px] bg-[#F8F9FD] border border-dashed border-[#1A56FF]/30">
          <div><label class="text-[11px] font-bold text-slate-600 uppercase"><span id="cuLblTopic">Topic</span></label><select id="cuTopic" class="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] bg-white outline-none focus:border-[#1A56FF] mt-1"><option value="">-- All --</option></select></div>
          <div><label class="text-[11px] font-bold text-slate-600 uppercase"><span id="cuLblSubTopic">Sub-Topic</span></label><select id="cuSubTopic" class="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] bg-white outline-none focus:border-[#1A56FF] mt-1"><option value="">-- All --</option></select></div>
        </div>
        <div id="cuFiltersRow" class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3"></div>
        <div class="flex items-center gap-2 mt-3 text-[11px] text-slate-500">
          <span id="cuStats" class="font-semibold"></span>
        </div>
      </div>
      <div id="cuBatchCourses" class="bg-white rounded-[14px] border border-slate-100 shadow-sm overflow-hidden mb-4">
        <div class="p-8 text-center text-slate-400 text-[13px]"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Loading courses...</div>
      </div>
      <div id="cuList" class="bg-white rounded-[14px] border border-slate-100 shadow-sm overflow-hidden">
        <div class="p-8 text-center text-slate-400 text-[13px]"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Loading...</div>
      </div>`;
    const batchSel = view.querySelector('#cuBatch');
    const catSel = view.querySelector('#cuCategory');
    const courseSel = view.querySelector('#cuCourse');
    const subjSel = view.querySelector('#cuSubject');
    const subSecSel = view.querySelector('#cuSubSection');
    const chapSel = view.querySelector('#cuChapter');
    const topicSel = view.querySelector('#cuTopic');
    const subTopicSel = view.querySelector('#cuSubTopic');
    const addBtn = view.querySelector('#cuAdd');
    const extraRow = view.querySelector('#cuExtraRow');
    const courseSearch = view.querySelector('#cuCourseSearch');
    const courseCount = view.querySelector('#cuCourseCount');
    // Generic filter state: keyed by stepId
    cuState.filters = {};
    cuState.stepDefs = []; // [{id, name}] from course.steps
    
    // Get lesson value for a step (lesson.steps fallback to legacy)
    function cuLessonStepVal(l, stepId){
      const steps = (l.steps && typeof l.steps === 'object' && !Array.isArray(l.steps)) ? l.steps : {};
      if(stepId === 'section') return (l.subject && String(l.subject).trim()) ? String(l.subject).trim() : (steps.section || 'General');
      if(stepId === 'subsection') return (l.subsection && String(l.subsection).trim()) ? String(l.subsection).trim() : (steps.subsection || '');
      if(stepId === 'chapter') return String(l.section || l.chapter || steps.chapter || '').trim() || 'Chapter 1';
      return steps[stepId] || '';
    }
    
    const LEGACY_STEP_IDS = ['section','subsection','chapter','topic','subtopic'];
    // Build filter dropdown options for a step
    async function buildFilterOpts(stepId){
      const lessons = cuState.lessons || [];
      const vals = new Set();
      lessons.forEach(l => {
        const v = cuLessonStepVal(l, stepId);
        if(!v) return;
        if(stepId === 'section' && !cuHasSubj(l)) return;
        if(stepId === 'chapter' && !cuHasChap(l)) return;
        vals.add(v);
      });
      // Also include empty nodes
      (cuState.emptyNodes || []).forEach(n => {
        const p = n.path;
        if(p && p[stepId]) vals.add(p[stepId]);
      });
      const arr = Array.from(vals).sort();
      cuState[stepId + 'Options'] = arr;
      const sel = view.querySelector('#cuFilter_' + stepId);
      if(sel){
        const prev = cuState.filters[stepId] || '';
        // stale filter auto-clear (legacy change-er por custom value thakle)
        if(prev && !arr.includes(prev)) cuState.filters[stepId] = '';
        const cur = cuState.filters[stepId] || '';
        const name = (cuState.stepDefs.find(d=>d.id===stepId)||{}).name || stepId;
        sel.innerHTML = '<option value="">-- All ' + esc(name) + ' --</option>' + arr.map(v=> `<option value="${esc(v)}" ${v===cur?'selected':''}>${esc(v)}</option>`).join('') + '<option value="__new" style="color:#7C3AED">+ New ' + esc(name) + '...</option>';
        sel.value = cur;
      }
    }
    
    // Build all custom-step filter dropdowns for current course (legacy 5-ta dedicated dropdown-e ache)
    async function buildAllFilterOpts(){
      const wrap = view.querySelector('#cuFiltersRow');
      if(!wrap) return;
      const customs = (cuState.stepDefs||[]).filter(d=> !LEGACY_STEP_IDS.includes(d.id));
      // step delete hole dropdown o muse jabe
      wrap.querySelectorAll('[data-step-filter]').forEach(box=>{
        if(!customs.some(d=> d.id === box.getAttribute('data-step-filter'))) box.remove();
      });
      // notun step-er dropdown add
      customs.forEach(def=>{
        if(view.querySelector('#cuFilter_' + def.id)) return;
        const div = document.createElement('div');
        div.setAttribute('data-step-filter', def.id);
        div.innerHTML = `<label class="text-[11px] font-bold text-slate-600 uppercase">${esc(def.name)}</label><select id="cuFilter_${esc(def.id)}" data-step-select="${esc(def.id)}" class="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] bg-white outline-none focus:border-[#1A56FF] mt-1"><option value="">-- All ${esc(def.name)} --</option></select>`;
        wrap.appendChild(div);
      });
      // listeners (bind ekbar)
      wrap.querySelectorAll('[data-step-select]').forEach(sel=>{
        if(sel._cuBound) return;
      sel._cuBound = true;
      sel.addEventListener('change', ()=>{
        const sid = sel.getAttribute('data-step-select');
        // "+ New <Step>..." — legacy dropdown-er motoi empty node add (path form)
        if(sel.value === '__new'){
          sel.value = cuState.filters[sid] || '';
          const def = (cuState.stepDefs||[]).find(d=>d.id===sid) || { id: sid, name: sid };
          (async ()=>{
            // Parent charao step add kora jabe — display neutral thakbe, General banabe na
            const n = await inputDialog({ title: 'New ' + def.name, subtitle: def.name + ' name (e.g. ' + def.name + ' 1)', placeholder: 'e.g. ' + def.name + ' 1', okLabel: 'Add ' + def.name, icon: 'fa-folder', iconBg: 'bg-[#F5F3FF] text-[#7C3AED]' });
            if(!n) return;
            const ids = (cuState.stepDefs||[]).map(d=>d.id);
            const idx = Math.max(0, ids.indexOf(sid));
            const legacy = { section: cuState.subject||'', subsection: cuState.subsection||'', chapter: cuState.chapter||'', topic: cuState.topic||'', subtopic: cuState.subtopic||'' };
            const path = {};
            ids.slice(0, idx).forEach(id=>{
              const v = LEGACY_STEP_IDS.includes(id) ? legacy[id] : (cuState.filters[id]||'');
              if(v) path[id] = v;
            });
            path[sid] = n;
            try{
              await api('/api/admin/courses/'+encodeURIComponent(cuState.courseId)+'/structure-nodes', { method:'POST', body: JSON.stringify({ path }) });
              cuState.filters[sid] = n;
              toast(def.name + ' saved');
            }catch(e){ toast(e.message, false); return; }
            await loadLessons();
          })();
          return;
        }
        cuState.filters[sid] = sel.value || '';
        if(sel.value){
            // niche-jef custom filter gulo clear (order onujayi)
            const ids = (cuState.stepDefs||[]).map(d=> d.id);
            const idx = ids.indexOf(sid);
            ids.slice(idx+1).forEach(id=>{
              if(LEGACY_STEP_IDS.includes(id)) return;
              cuState.filters[id] = '';
              const s2 = view.querySelector('#cuFilter_'+id);
              if(s2) s2.value = '';
            });
          }
          renderLessonList();
        });
      });
      // options fill
      for(const def of customs){ await buildFilterOpts(def.id); }
    }

    // Batch → Category → Search onujayi course dropdown repaint (selection preserve + auto-pick)
    // Dropdown: pinned age, tarpor title A-Z. Nicher panel: pinned age, tarpor ID serial.
    // Class Update-er pin alada (pinnedLessons) — Course List-er pinned-err sathe link nai.
    function cuIsPinned(c){ const v = c && c.pinnedLessons; return !!(v === true || v === 1 || v === 'true'); }
    // Search haystack: title + #id + batch/category name — jate ID ba batch nam likheo course paoa jay
    function cuCourseHay(c){
      try{
        const parts = [c.title || '', '#' + (c.id ?? ''), String(c.id ?? '')];
        try{ parts.push(relName('batch', c.batchId)); }catch(e){}
        try{ parts.push(relName('category', c.categoryId)); }catch(e){}
        return parts.join(' ').toLowerCase();
      }catch(e){ return String((c && c.title) || '').toLowerCase(); }
    }
    function cuFilteredCourses(){
      let list = (cuState.allCourses || []).slice();
      const q = String(cuState.courseQ || '').toLowerCase().trim();
      if(q){
        // Search dile GLOBAL search: batch/category filter ignore — sob batch theke match dekhao
        // multi-word query: prottek word haystack-e thakte hobe
        const words = q.split(/\s+/).filter(Boolean);
        list = list.filter(c=>{
          const hay = cuCourseHay(c);
          return words.every(w=> hay.includes(w));
        });
      } else {
        if(cuState.batchId) list = list.filter(c=> String(c.batchId)===String(cuState.batchId));
        if(cuState.categoryId) list = list.filter(c=> String(c.categoryId)===String(cuState.categoryId));
      }
      list.sort((a,b)=> {
        const pa = cuIsPinned(a) ? 0 : 1, pb = cuIsPinned(b) ? 0 : 1;
        if(pa !== pb) return pa - pb;
        if(q){
          const score = (c)=>{
            const t = String(c.title || '').toLowerCase();
            const idS = String(c.id ?? '');
            if(idS && (q === idS || q === '#' + idS)) return 0;
            if(t.startsWith(q)) return 1;
            if(t.includes(q)) return 2;
            return 3;
          };
          const sa = score(a), sb = score(b);
          if(sa !== sb) return sa - sb;
        }
        return String(a.title||'').localeCompare(String(b.title||''));
      });
      return list;
    }
    // Batch panel-er jonno: search thakle global result (sob batch), na thakle ager moto batch-wise serial
    function cuBatchPanelCourses(){
      let list = (cuState.allCourses || []).slice();
      const q = String(cuState.courseQ || '').toLowerCase().trim();
      if(q){
        const words = q.split(/\s+/).filter(Boolean);
        list = list.filter(c=> words.every(w=> cuCourseHay(c).includes(w)));
        list.sort((a,b)=> {
          const pa = cuIsPinned(a) ? 0 : 1, pb = cuIsPinned(b) ? 0 : 1;
          if(pa !== pb) return pa - pb;
          return (Number(a.id)||0) - (Number(b.id)||0);
        });
        return { list, noBatch: false, searching: true };
      }
      if(cuState.batchId) list = list.filter(c=> String(c.batchId)===String(cuState.batchId));
      else return { list: [], noBatch: true };
      if(cuState.categoryId) list = list.filter(c=> String(c.categoryId)===String(cuState.categoryId));
      list.sort((a,b)=> {
        const pa = cuIsPinned(a) ? 0 : 1, pb = cuIsPinned(b) ? 0 : 1;
        if(pa !== pb) return pa - pb;
        return (Number(a.id)||0) - (Number(b.id)||0);
      });
      return { list, noBatch: false };
    }
    function paintCourseOpts(){
      const list = cuFilteredCourses();
      const keep = list.some(c=> String(c.id)===String(cuState.courseId)) ? String(cuState.courseId) : (list.length ? String(list[0].id) : '');
      cuState.courseId = keep;
      const searching = String(cuState.courseQ || '').trim().length > 0;
      courseSel.innerHTML = `<option value="">-- Select Course --</option>` + list.map(c=>{
        let batchNm = '';
        try{ batchNm = relName('batch', c.batchId); }catch(e){ batchNm = ''; }
        const extra = (searching && batchNm && batchNm !== '-') ? ` • ${esc(batchNm)}` : '';
        return `<option value="${esc(c.id)}" ${String(c.id)===keep?'selected':''}>${cuIsPinned(c) ? '📌 ' : ''}${esc(c.title)} (#${c.id}${extra})</option>`;
      }).join('');
      if(courseCount) courseCount.textContent = list.length ? `(${list.length})` : '';
      paintBatchCourses();
    }
    // Batch select korle oi batch-er sob course niche serial-e + pin button
    function paintBatchCourses(){
      const wrap = view.querySelector('#cuBatchCourses');
      if(!wrap) return;
      const batchLabel = (REL.batch().find(b=> String(b.value)===String(cuState.batchId)) || {}).label || '';
      const { list, noBatch, searching } = cuBatchPanelCourses();
      const pinnedCount = list.filter(cuIsPinned).length;
      let body = '';
      if(noBatch){
        body = `<div class="p-8 text-center">
          <i class="fa-solid fa-layer-group text-slate-300 text-[22px]"></i>
          <p class="text-[13px] font-bold text-slate-600 mt-2">Select Batch</p>
        </div>`;
      } else if(!list.length){
        body = `<div class="p-8 text-center">
          <i class="fa-regular fa-folder-open text-slate-300 text-[22px]"></i>
          <p class="text-[13px] font-bold text-slate-600 mt-2">এই batch-এ কোনো course নেই</p>
          <p class="text-[11.5px] text-slate-400 mt-0.5">Category / Search filter বদলে দেখো</p>
        </div>`;
      } else {
        body = `<div class="max-h-[340px] overflow-y-auto divide-y divide-slate-100">` + list.map((c, i)=>{
          const pinned = cuIsPinned(c);
          const selected = String(c.id) === String(cuState.courseId);
          const cat = esc(relName('category', c.categoryId));
          let batchNm = '';
          try{ batchNm = relName('batch', c.batchId); }catch(e){ batchNm = ''; }
          const batchPart = (searching && batchNm && batchNm !== '-') ? ` • ${esc(batchNm)}` : '';
          return `<div data-cu-row="${esc(c.id)}" class="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition hover:bg-[#F8F9FD] ${selected ? 'bg-[#EEF2FF] border-l-[3px] border-l-[#1A56FF]' : 'border-l-[3px] border-l-transparent'} ${pinned && !selected ? 'bg-amber-50/40' : ''}">
            <span class="w-7 h-7 rounded-full font-extrabold text-[11px] flex items-center justify-center flex-shrink-0 ${pinned ? 'bg-[#FEF3C7] text-[#B45309]' : 'bg-[#EEF2FF] text-[#1A56FF]'}">${i+1}</span>
            <div class="min-w-0 flex-1">
              <div class="font-bold text-[13px] text-[#0F2043] truncate">${pinned ? '📌 ' : ''}${esc(c.title||'Untitled')}</div>
              <div class="text-[11px] text-slate-500 truncate">#${esc(c.id)} • ${cat}${batchPart}${c.teacher ? ' • ' + esc(c.teacher) : ''}${c.status && c.status !== 'active' ? ' • ' + esc(c.status) : ''}${pinned ? ' • <span class="text-[#B45309] font-bold">Pinned</span>' : ''}${selected ? ' • <span class="text-[#1A56FF] font-bold">Selected</span>' : ''}</div>
            </div>
            <button data-cu-pin="${esc(c.id)}" title="${pinned ? 'Unpin (নিচে নামাও)' : 'Pin (উপরে রাখো)'}" class="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0 transition ${pinned ? 'bg-[#FEF3C7] text-[#B45309] hover:bg-[#FDE68A]' : 'bg-slate-100 text-slate-400 hover:bg-[#FEF3C7] hover:text-[#B45309]'}">
              <i class="fa-solid fa-thumbtack text-[12px] ${pinned ? '' : '-rotate-45'}"></i>
            </button>
            <span class="w-7 h-7 rounded-full ${selected ? 'bg-[#1A56FF] text-white' : 'bg-slate-100 text-slate-400'} flex items-center justify-center flex-shrink-0">
              <i class="fa-solid ${selected ? 'fa-check' : 'fa-chevron-right'} text-[10px]"></i>
            </span>
          </div>`;
        }).join('') + `</div>`;
      }
      wrap.innerHTML = `
        <div class="px-4 py-3 border-b border-slate-100 flex items-center gap-2 bg-[#F8F9FD]/60">
          <span class="w-8 h-8 rounded-[8px] bg-[#0F2043] text-white flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-list-ol text-[13px]"></i></span>
          <div class="min-w-0">
            <h4 class="text-[13.5px] font-extrabold text-[#0F2043]">${searching ? 'Search Results' : 'Batch Courses'} ${!noBatch ? `<span class="text-slate-400 font-bold">(${list.length})</span>` : ''} ${searching ? '' : (batchLabel ? `<span class="ml-1 px-2 py-0.5 rounded-full bg-[#EDE9FF] text-[#4F46E5] text-[11px] font-bold">${esc(batchLabel)}</span>` : '')} ${pinnedCount ? `<span class="ml-1 px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#B45309] text-[11px] font-bold">📌 ${pinnedCount} pinned</span>` : ''}</h4>
          </div>
        </div>
        ${body}`;
      // row click → course select
      wrap.querySelectorAll('[data-cu-row]').forEach(row=>{
        row.addEventListener('click', (e)=>{
          if(e.target.closest('[data-cu-pin]')) return;
          selectCuCourse(row.getAttribute('data-cu-row'));
        });
      });
      // pin toggle
      wrap.querySelectorAll('[data-cu-pin]').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
          e.stopPropagation();
          toggleCuPin(btn.getAttribute('data-cu-pin'), btn);
        });
      });
    }
    async function selectCuCourse(id){
      if(!id || String(id) === String(cuState.courseId)){ paintBatchCourses(); return; }
      cuState.courseId = String(id);
      if(courseSel) courseSel.value = String(id);
      // reset filters
      cuState.filters = {};
      cuState.subject = ''; cuState.subsection = ''; cuState.chapter = ''; cuState.topic = ''; cuState.subtopic = '';
      if(subjSel) subjSel.value='';
      if(subSecSel) subSecSel.value='';
      if(chapSel) chapSel.value='';
      if(topicSel) topicSel.value='';
      if(subTopicSel) subTopicSel.value='';
      paintBatchCourses();
      // fetch course steps
      try{
        const j = await api('/api/admin/courses/'+encodeURIComponent(cuState.courseId)+'/steps');
        if(j.data && Array.isArray(j.data)){
          cuState.stepDefs = j.data;
        }
      }catch(e){ console.error('[cu] steps fetch failed', e); cuState.stepDefs = []; }
      await loadLessons();
      paintBatchCourses();
    }
    async function toggleCuPin(id, btn){
      const c = (cuState.allCourses||[]).find(x=> String(x.id)===String(id));
      const nowPinned = c ? cuIsPinned(c) : false;
      if(btn){ btn.disabled = true; }
      try{
        const j = await api('/api/admin/courses/'+encodeURIComponent(id), { method:'PUT', body: JSON.stringify({ pinnedLessons: !nowPinned }) });
        const updated = (j && j.data) ? j.data : { id, pinnedLessons: !nowPinned };
        [cuState.allCourses, courses].forEach(arr=>{
          if(!Array.isArray(arr)) return;
          const f = arr.find(x=> String(x.id)===String(id));
          if(f) f.pinnedLessons = !!(updated.pinnedLessons !== undefined ? updated.pinnedLessons : !nowPinned);
        });
        paintCourseOpts();
        toast(!nowPinned ? '📌 Pinned — উপরে থাকবে' : 'Unpinned');
      }catch(e){ toast(e.message, false); }
      finally { if(btn){ btn.disabled = false; } }
    }
    paintCourseOpts();
    // Search: type korlei dropdown + nicher list instant filter; course bodlale lessons reload (debounced)
    // Global search — batch/category select kora thakleo sob batch theke match dekhabo
    let cuSearchT = null;
    function cuSyncClearBtn(){
      const clr = view.querySelector('#cuCourseClear');
      if(clr) clr.classList.toggle('hidden', !String(cuState.courseQ || '').length);
    }
    function cuApplySearch(v){
      cuState.courseQ = v || '';
      const before = courseSel.value;
      paintCourseOpts();
      cuSyncClearBtn();
      // auto-selected course onno batch-er hole Batch/Category dropdown-o sync koro
      try{
        const sel = (cuState.allCourses || []).find(c=> String(c.id)===String(cuState.courseId));
        if(sel && cuState.courseId){
          if(sel.batchId !== undefined && sel.batchId !== null && String(sel.batchId) !== '' && String(sel.batchId) !== String(cuState.batchId)){
            cuState.batchId = String(sel.batchId);
            if(batchSel) batchSel.value = String(sel.batchId);
          }
          if(sel.categoryId !== undefined && sel.categoryId !== null && String(sel.categoryId) !== '' && String(sel.categoryId) !== String(cuState.categoryId)){
            cuState.categoryId = String(sel.categoryId);
            if(catSel) catSel.value = String(sel.categoryId);
          }
        }
      }catch(e){}
      if(courseSel.value !== before){
        if(cuSearchT) clearTimeout(cuSearchT);
        cuSearchT = setTimeout(()=>{
          cuState.subject=''; cuState.subsection=''; cuState.chapter=''; cuState.topic=''; cuState.subtopic='';
          loadLessons();
        }, 250);
      }
      // search clear korle sathe sathe ager batch-er list-e firo
      if(!String(cuState.courseQ || '').trim() && courseSel.value === before){
        try{ paintBatchCourses(); }catch(e){}
      }
    }
    if (courseSearch){
      courseSearch.addEventListener('input', () => cuApplySearch(courseSearch.value || ''));
      // IME / autocomplete edge-case: change + Escape-to-clear
      courseSearch.addEventListener('change', () => { if((courseSearch.value||'') !== (cuState.courseQ||'')) cuApplySearch(courseSearch.value || ''); });
      courseSearch.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && courseSearch.value){ courseSearch.value=''; cuApplySearch(''); } });
      const clrBtn = view.querySelector('#cuCourseClear');
      if(clrBtn) clrBtn.addEventListener('click', ()=>{ courseSearch.value=''; courseSearch.focus(); cuApplySearch(''); });
    }

    function cuSubSecVal(l){ return (l.subsection && String(l.subsection).trim()) ? String(l.subsection).trim() : ''; }
    function cuChapVal(l){ return l.section || l.chapter || 'Chapter 1'; }
    function cuSubjVal(l){ return (l.subject && String(l.subject).trim()) ? String(l.subject).trim() : 'General'; }
    // Real value ache kina (khali class-e General/Chapter 1 fallback banano jabe na)
    function cuHasSubj(l){ return !!((l.subject && String(l.subject).trim())); }
    function cuHasChap(l){ return !!(String(l.section || l.chapter || '').trim()); }
    function cuTopicVal(l){ return (l.topic && String(l.topic).trim()) ? String(l.topic).trim() : ''; }
    function cuSubTopicVal(l){ return (l.subtopic && String(l.subtopic).trim()) ? String(l.subtopic).trim() : ''; }
    // Per-course step names: course.steps (generic) > legacy stepLabels > default
    function cuLabels(){
      try{
        const c = (cuState.allCourses || []).find(x=> String(x.id)===String(cuState.courseId)) || {};
        const d = { section:'Section', subsection:'Sub-Section', chapter:'Chapter', topic:'Topic', subtopic:'Sub-Topic' };
        const o = {};
        Object.keys(d).forEach(k=>{ o[k] = d[k]; });
        const s = (c.stepLabels && typeof c.stepLabels === 'object') ? c.stepLabels : {};
        Object.keys(d).forEach(k=>{ const v = String(s[k] !== undefined ? s[k] : '').trim(); if(v) o[k] = v; });
        (cuState.stepDefs || []).forEach(sd=>{ if(d[sd.id] !== undefined && sd.name) o[sd.id] = sd.name; });
        return o;
      }catch(e){ return { section:'Section', subsection:'Sub-Section', chapter:'Chapter', topic:'Topic', subtopic:'Sub-Topic' }; }
    }
    function cuL(k){ try{ return cuLabels()[k] || k; }catch(e){ return k; } }
    // Filter header static labels repaint (rename-er por)
    function paintCuLabels(){
      const L = cuLabels();
      const map = { cuLblSection:'section', cuLblSub:'subsection', cuLblChap:'chapter', cuLblTopic:'topic', cuLblSubTopic:'subtopic' };
      Object.keys(map).forEach(id=>{ const el = view.querySelector('#'+id); if(el) el.textContent = L[map[id]]; });
    }

    async function cuFetchEmptyNodes(cid){
      try{
        const cj = await api('/api/admin/courses/'+encodeURIComponent(cid));
        const arr = (cj.data && Array.isArray(cj.data.emptyStructure)) ? cj.data.emptyStructure : [];
        // canonical: {path:{stepId:val}} — legacy {s,ss,c,t,st} o support (UI legacy code + generic path duitai rakhi)
        cuState.emptyNodes = arr.filter(n=> n && typeof n === 'object').map(n=>{
          const p = (n.path && typeof n.path === 'object') ? n.path : {};
          const s = String(n.s || p.section || '');
          const ss = String(n.ss !== undefined ? n.ss : (p.subsection || ''));
          const c = String(n.c !== undefined ? n.c : (p.chapter || ''));
          const t = String(n.t !== undefined ? n.t : (p.topic || ''));
          const st = String(n.st !== undefined ? n.st : (p.subtopic || ''));
          const path = (n.path && typeof n.path === 'object') ? n.path : Object.assign({}, s?{section:s}:{}, ss?{subsection:ss}:{}, c?{chapter:c}:{}, t?{topic:t}:{}, st?{subtopic:st}:{});
          return { s, ss, c, t, st, path };
        }).filter(n=> n.s || Object.keys(n.path).length);
      }catch(e){ cuState.emptyNodes = cuState.emptyNodes || []; }
    }
    async function cuSaveEmptyNode(s, ss, c, t, st){
      const cid = cuState.courseId;
      // Direct add: Section charai Chapter/Topic save hobe — sudhu ekta level thaklei hobe
      if(!cid) return;
      if(!s && !ss && !c && !t && !st) return;
      try{
        await api('/api/admin/courses/'+encodeURIComponent(cid)+'/structure-nodes', { method:'POST', body: JSON.stringify({ s, ss:ss||'', c:c||'', t:t||'', st:st||'' }) });
        await cuFetchEmptyNodes(cid);
      }catch(e){ toast(e.message, false); throw e; }
    }
    // ---------- Chapter / Section-level node resources ----------
    async function cuFetchNodeResources(cid){
      try{
        const nj = await api('/api/admin/courses/'+encodeURIComponent(cid)+'/node-resources');
        cuState.nodeResources = Array.isArray(nj.data) ? nj.data : [];
      }catch(e){ cuState.nodeResources = cuState.nodeResources || []; }
    }
    // order-independent path match (backend key order-er upor nirvor na kore)
    function cuSamePath(a, b){
      a = a || {}; b = b || {};
      const ka = Object.keys(a).filter(k=> String(a[k]||'').trim() !== '');
      const kb = Object.keys(b).filter(k=> String(b[k]||'').trim() !== '');
      if(ka.length !== kb.length) return false;
      return ka.every(k=> String(a[k]||'') === String(b[k]||''));
    }
    function cuNodeResList(path){
      const n = (cuState.nodeResources || []).find(x=> x && cuSamePath(x.path, path));
      return (n && Array.isArray(n.resources)) ? n.resources : [];
    }
    function cuNodeResBadge(path){
      const n = cuNodeResList(path).length;
      if(!n) return '';
      return `<span class="px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] text-[10px] font-bold whitespace-nowrap"><i class="fa-solid fa-file-lines mr-0.5"></i>${n} sheet${n>1?'s':''}</span>`;
    }
    async function cuDeleteEmptyNode(s, ss, c, t, st, level){
      const cid = cuState.courseId;
      if(!cid) return;
      if(!s && !ss && !c && !t && !st) return;
      try{
        const body = { s, ss:ss||'' };
        if(level === 'section') { /* only s */ }
        else if(level === 'subsection') { /* s+ss */ }
        else if(level === 'chapter') { body.c = c||''; }
        else if(level === 'topic') { body.c = c||''; body.t = t||''; }
        else if(level === 'subtopic') { body.c = c||''; body.t = t||''; body.st = st||''; }
        else {
          // legacy boolean hasC compat
          if(c) body.c = c;
          if(t) body.t = t;
          if(st) body.st = st;
        }
        await api('/api/admin/courses/'+encodeURIComponent(cid)+'/structure-nodes', { method:'DELETE', body: JSON.stringify(body) });
        await cuFetchEmptyNodes(cid);
      }catch(e){ toast(e.message, false); }
    }
    // Path-based delete for generic steps (grouped view)
    async function cuDeleteEmptyNodeByPath(path, level){
      const cid = cuState.courseId;
      if(!cid || !path || !Object.keys(path).some(k=> String(path[k]||'').trim() !== '')) return;
      try{
        const body = { s: path.s, ss: path.ss||'' };
        if(level === 'chapter') { body.c = path.c||''; }
        else if(level === 'topic') { body.c = path.c||''; body.t = path.t||''; }
        else if(level === 'subtopic') { body.c = path.c||''; body.t = path.t||''; body.st = path.st||''; }
        await api('/api/admin/courses/'+encodeURIComponent(cid)+'/structure-nodes', { method:'DELETE', body: JSON.stringify(body) });
        await cuFetchEmptyNodes(cid);
      }catch(e){ toast(e.message, false); }
    }

    async function loadLessons(){
      const cid = courseSel.value;
      cuState.courseId = cid;
      if(!cid){
        cuState.lessons=[]; cuState.filters={}; cuState.stepDefs=[]; cuState.emptyNodes=[]; cuState.nodeResources=[];
        renderLessonList();
        try{ paintBatchCourses(); }catch(e){}
        return;
      }
      try{
        const j = await api('/api/admin/courses/'+encodeURIComponent(cid)+'/lessons');
        const list = (j.data||[]).slice().sort((a,b)=> (Number(a.order)||0)-(Number(b.order)||0));
        cuState.lessons = list;
        await cuFetchEmptyNodes(cid);
        await cuFetchNodeResources(cid);
        
        // fetch course steps for dynamic filters
        try{
          const sj = await api('/api/admin/courses/'+encodeURIComponent(cid)+'/steps');
          if(sj.data && Array.isArray(sj.data)){
            cuState.stepDefs = sj.data;
          }
        }catch(e){ console.error('[cu] steps fetch failed', e); cuState.stepDefs = []; }
        
        // legacy section → sub-section → chapter cascade populate (dropdown faka thakto)
        updateSubjectOpts();
        updateSubSectionOpts();
        // custom step filters build (stale value clear hoy) — tarpor list render
        await buildAllFilterOpts();
        renderLessonList();
        try{ syncCuExtra(); }catch(e){}
        try{ paintBatchCourses(); }catch(e){}
      }catch(e){
        view.querySelector('#cuList').innerHTML = errorBox(e.message);
      }
    }

    // Section dropdown populate (lessons + saved empty nodes + pending)
    function updateSubjectOpts(){
      const subjSet = new Set();
      (cuState.lessons||[]).forEach(l=>{ if(!cuHasSubj(l)) return; const s = cuSubjVal(l); if(s) subjSet.add(s); });
      (cuState.emptyNodes||[]).forEach(n=>{ if(n.s) subjSet.add(n.s); });
      (cuState.extraSections||[]).forEach(x=>{ if(x && x.s) subjSet.add(x.s); });
      const arr = Array.from(subjSet).sort();
      cuState.subjects = arr;
      const prev = cuState.subject;
      if(subjSel) subjSel.innerHTML = '<option value="">-- All ' + esc(cuL('section')) + ' --</option>' + arr.map(s=> `<option value="${esc(s)}" ${s===prev?'selected':''}>${esc(s)}</option>`).join('') + '<option value="__new" style="color:#1A56FF">+ New ' + esc(cuL('section')) + '...</option>';
      if(prev && !arr.includes(prev)) cuState.subject = '';
    }

    function updateSubSectionOpts(){
      const subj = subjSel.value;
      cuState.subject = (subj==='__new' ? (cuState.subject || '') : subj);
      let list = cuState.lessons;
      if(cuState.subject) list = list.filter(l=> cuSubjVal(l)===cuState.subject);
      const subMap={}; list.forEach(l=>{
        const ss = cuSubSecVal(l);
        if(ss && !subMap[ss]) subMap[ss]=true;
      });
      // saved empty nodes (refresh-eo thake)
      (cuState.emptyNodes||[]).forEach(n=>{
        if(!n.ss) return;
        if(cuState.subject && n.s !== cuState.subject) return;
        // je sub-section-e real class ache seta alada kore dekhanor dorkar nai (lessons thekei asche)
        if(!subMap[n.ss]) subMap[n.ss]=true;
      });
      (cuState.extraSubSections || []).forEach(x=>{
        if(!x || !x.ss) return;
        if(cuState.subject && x.s && x.s !== cuState.subject) return;
        if(!subMap[x.ss]) subMap[x.ss]=true;
      });
      const subArr = Object.keys(subMap).sort();
      cuState.subsections = subArr;
      const prevSub = cuState.subsection;
      if(subSecSel) subSecSel.innerHTML = '<option value="">-- All ' + esc(cuL('subsection')) + ' --</option>' + subArr.map(s=> `<option value="${esc(s)}" ${s===prevSub?'selected':''}>${esc(s)}</option>`).join('') + '<option value="__new" style="color:#1A56FF">+ New ' + esc(cuL('subsection')) + '...</option>';
      if(prevSub && !subArr.includes(prevSub)) cuState.subsection='';
      updateChapterOpts();
    }

    function updateChapterOpts(){
      const ss = subSecSel ? subSecSel.value : '';
      if(ss === '__new'){ /* handled in change listener */ }
      else cuState.subsection = ss || '';
      let list = cuState.lessons;
      if(cuState.subject) list = list.filter(l=> cuSubjVal(l)===cuState.subject);
      if(cuState.subsection) list = list.filter(l=> cuSubSecVal(l)===cuState.subsection);
      const chapMap={}; list.forEach(l=>{
        if(!cuHasChap(l)) return;
        const ch = cuChapVal(l);
        chapMap[ch]=true;
      });
      // saved empty chapters (refresh-eo thake)
      (cuState.emptyNodes||[]).forEach(n=>{
        if(!n.c) return;
        if(cuState.subject && n.s !== cuState.subject) return;
        if((n.ss||'') !== (cuState.subsection||'')) return;
        if(!chapMap[n.c]) chapMap[n.c]=true;
      });
      // pending new chapters (class ekhono add hoyni) — current section/sub-section-er sathe linked gulo
      (cuState.extraChapters || []).forEach(x=>{
        if(!x || !x.c) return;
        if(cuState.subject && x.s && x.s !== cuState.subject) return;
        if(cuState.subsection && x.ss !== undefined && x.ss !== cuState.subsection) return;
        if(!chapMap[x.c]) chapMap[x.c]=true;
      });
      const chapArr = Object.keys(chapMap).sort();
      cuState.chapters = chapArr;
      const prevChap = cuState.chapter;
      chapSel.innerHTML = '<option value="">-- All ' + esc(cuL('chapter')) + ' --</option>' + chapArr.map(c=> `<option value="${esc(c)}" ${c===prevChap?'selected':''}>${esc(c)}</option>`).join('') + '<option value="__new" style="color:#1A56FF">+ New ' + esc(cuL('chapter')) + '...</option>';
      if(prevChap && !chapArr.includes(prevChap)) cuState.chapter='';
      updateTopicOpts();
    }

    function updateTopicOpts(){
      const ch = chapSel ? chapSel.value : '';
      if(ch === '__new'){ /* handled in change listener */ }
      else if(ch !== undefined) cuState.chapter = ch || '';
      let list = cuState.lessons;
      if(cuState.subject) list = list.filter(l=> cuSubjVal(l)===cuState.subject);
      if(cuState.subsection) list = list.filter(l=> cuSubSecVal(l)===cuState.subsection);
      if(cuState.chapter) list = list.filter(l=> cuChapVal(l)===cuState.chapter);
      const tMap={}; list.forEach(l=>{ const t = cuTopicVal(l); if(t && !tMap[t]) tMap[t]=true; });
      (cuState.emptyNodes||[]).forEach(n=>{
        if(!n.t) return;
        if(cuState.subject && n.s !== cuState.subject) return;
        if((n.ss||'') !== (cuState.subsection||'')) return;
        if(cuState.chapter && (n.c||'') !== cuState.chapter) return;
        if(!tMap[n.t]) tMap[n.t]=true;
      });
      (cuState.extraTopics || []).forEach(x=>{
        if(!x || !x.t) return;
        if(cuState.subject && x.s && x.s !== cuState.subject) return;
        if(cuState.subsection && x.ss !== undefined && x.ss !== cuState.subsection) return;
        if(cuState.chapter && x.c !== undefined && x.c !== cuState.chapter) return;
        if(!tMap[x.t]) tMap[x.t]=true;
      });
      const tArr = Object.keys(tMap).sort();
      cuState.topics = tArr;
      const prevT = cuState.topic;
      if(topicSel) topicSel.innerHTML = '<option value="">-- All ' + esc(cuL('topic')) + ' --</option>' + tArr.map(t=> `<option value="${esc(t)}" ${t===prevT?'selected':''}>${esc(t)}</option>`).join('') + '<option value="__new" style="color:#1A56FF">+ New ' + esc(cuL('topic')) + '...</option>';
      if(prevT && !tArr.includes(prevT)) cuState.topic='';
      updateSubTopicOpts();
    }

    function updateSubTopicOpts(){
      const tp = topicSel ? topicSel.value : '';
      if(tp === '__new'){ /* handled in change listener */ }
      else if(tp !== undefined) cuState.topic = tp || '';
      let list = cuState.lessons;
      if(cuState.subject) list = list.filter(l=> cuSubjVal(l)===cuState.subject);
      if(cuState.subsection) list = list.filter(l=> cuSubSecVal(l)===cuState.subsection);
      if(cuState.chapter) list = list.filter(l=> cuChapVal(l)===cuState.chapter);
      if(cuState.topic) list = list.filter(l=> cuTopicVal(l)===cuState.topic);
      const stMap={}; list.forEach(l=>{ const st = cuSubTopicVal(l); if(st && !stMap[st]) stMap[st]=true; });
      (cuState.emptyNodes||[]).forEach(n=>{
        if(!n.st) return;
        if(cuState.subject && n.s !== cuState.subject) return;
        if((n.ss||'') !== (cuState.subsection||'')) return;
        if(cuState.chapter && (n.c||'') !== cuState.chapter) return;
        if(cuState.topic && (n.t||'') !== cuState.topic) return;
        if(!stMap[n.st]) stMap[n.st]=true;
      });
      (cuState.extraSubTopics || []).forEach(x=>{
        if(!x || !x.st) return;
        if(cuState.subject && x.s && x.s !== cuState.subject) return;
        if(cuState.subsection && x.ss !== undefined && x.ss !== cuState.subsection) return;
        if(cuState.chapter && x.c !== undefined && x.c !== cuState.chapter) return;
        if(cuState.topic && x.t !== undefined && x.t !== cuState.topic) return;
        if(!stMap[x.st]) stMap[x.st]=true;
      });
      const stArr = Object.keys(stMap).sort();
      cuState.subtopics = stArr;
      const prevSt = cuState.subtopic;
      if(subTopicSel) subTopicSel.innerHTML = '<option value="">-- All ' + esc(cuL('subtopic')) + ' --</option>' + stArr.map(t=> `<option value="${esc(t)}" ${t===prevSt?'selected':''}>${esc(t)}</option>`).join('') + '<option value="__new" style="color:#1A56FF">+ New ' + esc(cuL('subtopic')) + '...</option>';
      if(prevSt && !stArr.includes(prevSt)) cuState.subtopic='';
    }

    function renderLessonList(){
      const listEl = view.querySelector('#cuList');
      const statsEl = view.querySelector('#cuStats');
      let list = cuState.lessons.slice();
      if(cuState.subject) list = list.filter(l=> cuSubjVal(l)===cuState.subject);
      if(cuState.subsection) list = list.filter(l=> cuSubSecVal(l)===cuState.subsection);
      if(cuState.chapter) list = list.filter(l=> cuChapVal(l)===cuState.chapter);
      if(cuState.topic) list = list.filter(l=> cuTopicVal(l)===cuState.topic);
      if(cuState.subtopic) list = list.filter(l=> cuSubTopicVal(l)===cuState.subtopic);
      // custom (course-specific) step filters — keyed by stepId, no limit
      const cFilts = cuState.filters || {};
      Object.keys(cFilts).forEach(sid=>{
        const fv = cFilts[sid];
        if(fv) list = list.filter(l=> cuLessonStepVal(l, sid) === fv);
      });
      // stats (khali class-er fallback General/Chapter 1 count hobe na)
      const total = cuState.lessons.length;
      const subjCnt = new Set((cuState.lessons||[]).filter(cuHasSubj).map(cuSubjVal)).size;
      const subCnt = cuState.subsections.length;
      const chapCnt = new Set((cuState.lessons||[]).filter(cuHasChap).map(cuChapVal)).size;
      const topicCnt = (cuState.topics || []).length;
      const subTopicCnt = (cuState.subtopics || []).length;
      if(statsEl){
        let statsTxt = total ? (`${total} lectures`+(subjCnt?` • ${subjCnt} ${cuL('section')}`:'')+(subCnt? ' • '+subCnt+' '+cuL('subsection'):'')+(chapCnt?` • ${chapCnt} ${cuL('chapter')}`:'')+(topicCnt? ' • '+topicCnt+' '+cuL('topic'):'')+(subTopicCnt? ' • '+subTopicCnt+' '+cuL('subtopic'):'')+`${cuState.subject? ' • '+cuL('section')+': '+cuState.subject:''}${cuState.subsection? ' • '+cuL('subsection')+': '+cuState.subsection:''}${cuState.chapter? ' • '+cuL('chapter')+': '+cuState.chapter:''}${cuState.topic? ' • '+cuL('topic')+': '+cuState.topic:''}${cuState.subtopic? ' • '+cuL('subtopic')+': '+cuState.subtopic:''}`) : 'No lectures yet';
        Object.keys(cFilts).forEach(sid=>{
          const fv = cFilts[sid];
          if(fv){ const def = (cuState.stepDefs||[]).find(d=> d.id===sid); statsTxt += ' • ' + (def?def.name:sid) + ': ' + fv; }
        });
        statsEl.textContent = statsTxt;
      }
      if(!cuState.courseId){
        listEl.innerHTML = `<div class="p-10 text-center text-slate-400"><i class="fa-solid fa-book-open text-[22px]"></i><p class="text-[13px] font-semibold mt-2">Course select koro</p></div>`;
        return;
      }
      // saved empty nodes for current filter (class charai save — refresh-eo thake)
      const emptyForFilter = (cuState.emptyNodes||[]).filter(n=>{
        if(cuState.subject && n.s !== cuState.subject) return false;
        if(cuState.subsection && (n.ss||'') !== cuState.subsection) return false;
        if(cuState.chapter && (n.c||'') !== cuState.chapter) return false;
        if(cuState.topic && (n.t||'') !== cuState.topic) return false;
        if(cuState.subtopic && (n.st||'') !== cuState.subtopic) return false;
        // custom step filters onujayi empty node scope check
        for(const sid of Object.keys(cFilts)){
          const fv = cFilts[sid];
          if(fv && ((n.path||{})[sid]||'') !== fv) return false;
        }
        // real class ache emon node bad (real hoye geche)
        const hasReal = cuState.lessons.some(l=>{
          if(cuSubjVal(l) !== n.s) return false;
          if((n.ss||'') && cuSubSecVal(l) !== (n.ss||'')) return false;
          if((n.c||'') && cuChapVal(l) !== (n.c||'')) return false;
          if((n.t||'') && cuTopicVal(l) !== (n.t||'')) return false;
          if((n.st||'') && cuSubTopicVal(l) !== (n.st||'')) return false;
          if(!n.ss && !n.c && !n.t && !n.st) return true;
          if(n.ss && !n.c && !n.t && !n.st) return true;
          return true;
        });
        return !hasReal;
      });
      if(!list.length && !emptyForFilter.length){
        listEl.innerHTML = `<div class="p-10 text-center">
          <i class="fa-solid fa-layer-group text-slate-300 text-[22px]"></i>
          <p class="text-[13px] font-semibold text-slate-600 mt-2">No classes in this filter</p>
          <p class="text-[11px] text-slate-400"></p>
          <button id="cuEmptyAdd" class="mt-3 px-4 py-2 rounded-[8px] bg-[#1A56FF] text-white font-bold text-[12px]">+ Add Class</button>
        </div>`;
        const eb = listEl.querySelector('#cuEmptyAdd');
        if(eb) eb.addEventListener('click', ()=> openCuForm(null));
        return;
      }
      if(!list.length && emptyForFilter.length){
        // sudhu empty nodes ache (class ekhono add hoyni) — saved dekhaw + delete + Add Class
        let ehtml = `<div class="divide-y divide-slate-100">`;
        emptyForFilter.forEach((n, i)=>{
          const label = [n.s, n.ss, n.c, n.t, n.st].filter(Boolean).join(' → ');
          const kind = n.st ? cuL('subtopic') : (n.t ? cuL('topic') : (n.c ? cuL('chapter') : (n.ss ? cuL('subsection') : cuL('section'))));
          ehtml += `<div class="flex items-center gap-3 px-4 py-3">
            <span class="w-7 h-7 rounded-[7px] ${n.c ? 'bg-[#F59E0B]' : (n.ss ? 'bg-[#7C3AED]' : 'bg-[#1A56FF]')} text-white flex items-center justify-center flex-shrink-0"><i class="fa-solid ${n.c ? 'fa-book-open' : (n.ss ? 'fa-folder-open' : 'fa-folder')} text-[11px]"></i></span>
            <div class="min-w-0 flex-1">
              <div class="font-bold text-[13px] text-[#0F2043] truncate">${esc(label)}</div>
              <div class="text-[11px] text-slate-500">${kind}</div>
            </div>
            <button data-empty-del="${i}" class="w-7 h-7 rounded-[7px] bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center flex-shrink-0" title="Delete ${kind}"><i class="fa-solid fa-trash text-[10px]"></i></button>
          </div>`;
        });
        ehtml += `<div class="p-4 text-center border-t border-slate-100">
          <button id="cuEmptyAdd" class="mt-2 px-4 py-2 rounded-[8px] bg-[#1A56FF] text-white font-bold text-[12px]">+ Add Class</button>
        </div></div>`;
        listEl.innerHTML = ehtml;
        const eb2 = listEl.querySelector('#cuEmptyAdd');
        if(eb2) eb2.addEventListener('click', ()=> openCuForm(null));
        listEl.querySelectorAll('[data-empty-del]').forEach(b=> b.addEventListener('click', async ()=>{
          const n = emptyForFilter[Number(b.getAttribute('data-empty-del'))];
          if(!n) return;
          const kindLbl = (n.st ? cuL('subtopic') : (n.t ? cuL('topic') : (n.c ? cuL('chapter') : (n.ss ? cuL('subsection') : cuL('section'))))).toLowerCase();
          const lvl = n.st ? 'subtopic' : (n.t ? 'topic' : (n.c ? 'chapter' : (n.ss ? 'subsection' : 'section')));
          confirmDialog('Delete ' + kindLbl + '?', '"' + [n.s,n.ss,n.c,n.t,n.st].filter(Boolean).join(' → ') + '" empty node delete hobe (class nai).', async ()=>{
            await cuDeleteEmptyNode(n.s, n.ss||'', n.c||'', n.t||'', n.st||'', lvl);
            // section delete hole subsection/chapter filter reset
            if(!n.ss && !n.c && !n.t && !n.st){ cuState.subject=''; subjSel.value=''; }
            await loadLessons();
          });
        }));
        return;
      }
      // group by Section → Sub-Section → Chapter → Topic → Sub-Topic
      let html = `<div class="divide-y divide-slate-100">`;
      if(!cuState.subtopic && !cuState.topic && !cuState.chapter && !cuState.subsection && !cuState.subject){
        // show grouped by subject → sub-section → chapter (real + saved empty)
        const struct = {};
        const subjOrder=[];
        const ensureSubj = (s)=>{ if(!struct[s]){ struct[s]={ subs:{}, sOrder:[], chapters:{}, cOrder:[], isEmptyOnly:false }; subjOrder.push(s); } };
        list.slice().sort((a,b)=> (Number(a.order)||0)-(Number(b.order)||0)).forEach(l=>{
          const s = cuHasSubj(l) ? cuSubjVal(l) : '', ss = cuSubSecVal(l), ch = cuHasChap(l) ? cuChapVal(l) : '';
          ensureSubj(s);
          const ssKey = ss || '(No Sub-Section)';
          if(!struct[s].subs[ssKey]){ struct[s].subs[ssKey]={ name: ss, chapters:{}, cOrder:[], emptyChapters:{} }; struct[s].sOrder.push(ssKey); }
          if(!struct[s].subs[ssKey].chapters[ch]){ struct[s].subs[ssKey].chapters[ch]=[]; struct[s].subs[ssKey].cOrder.push(ch); }
          struct[s].subs[ssKey].chapters[ch].push(l);
          if(!struct[s].chapters[ch]){ struct[s].chapters[ch]=[]; struct[s].cOrder.push(ch); }
          struct[s].chapters[ch].push(l);
        });
        // saved empty nodes merge (class nai — tao dropdown/list-e thakbe)
        // Section chara node (s khali) kono General-e jabe na — neutral bucket-e thakbe (notun parent-less node ar toiri hoy na)
        (cuState.emptyNodes||[]).forEach(n=>{
          if(!n.s){
            if(!(n.path||{}).chapter && !(n.path||{}).subsection && !(n.path||{}).topic && !(n.path||{}).subtopic) return;
          }
          // custom step filters onujayi empty node scope check
          for(const sid of Object.keys(cFilts)){
            const fv = cFilts[sid];
            if(fv && ((n.path||{})[sid]||'') !== fv) return;
          }
          // real class ache kina check — thakle empty hisebe dekhanor dorkar nai
          const hasReal = cuState.lessons.some(l=>{
            if((n.s||'') && cuSubjVal(l) !== n.s) return false;
            if((n.ss||'') && cuSubSecVal(l) !== (n.ss||'')) return false;
            if((n.c||'') && cuChapVal(l) !== (n.c||'')) return false;
            if(!n.ss && !n.c) return true;
            if(n.ss && !n.c) return true;
            return true;
          });
          if(hasReal && ((n.ss && !n.c) ? cuState.lessons.some(l=> cuSubjVal(l)===n.s && cuSubSecVal(l)===n.ss) : true) && (n.c ? cuState.lessons.some(l=> cuSubjVal(l)===n.s && cuSubSecVal(l)===(n.ss||'') && cuChapVal(l)===n.c) : true)) {
            // exact node real hoye geche — skip (prune backend-eo hobe)
            if((!n.ss && !n.c) || (n.ss && cuState.lessons.some(l=> cuSubjVal(l)===n.s && cuSubSecVal(l)===n.ss && (!n.c || cuChapVal(l)===n.c)))) return;
          }
          ensureSubj(n.s);
          const ssKey = (n.ss||'') || '(No Sub-Section)';
          if(!struct[n.s].subs[ssKey]){ struct[n.s].subs[ssKey]={ name: (n.ss||''), chapters:{}, cOrder:[], emptyChapters:{} }; struct[n.s].sOrder.push(ssKey); }
          if(n.c){
            if(!struct[n.s].subs[ssKey].chapters[n.c]){
              struct[n.s].subs[ssKey].chapters[n.c]=[];
              struct[n.s].subs[ssKey].cOrder.push(n.c);
              struct[n.s].subs[ssKey].emptyChapters[n.c]=true;
            }
            if(!struct[n.s].chapters[n.c]){ struct[n.s].chapters[n.c]=[]; struct[n.s].cOrder.push(n.c); }
          } else if(n.ss){
            // empty sub-section (chapter charai) — subs entry-e jothesto
          } else {
            struct[n.s].isEmptyOnly = struct[n.s].isEmptyOnly && true;
          }
        });
        subjOrder.forEach((s, si)=>{
          const subjLessons = Object.values(struct[s].subs).flatMap(x=> Object.values(x.chapters).flat());
          const isSecEmpty = subjLessons.length===0;
          // Section dey nai (khali class) — General header banano jabe na, lectures direct
          if(s!==''){
          html += `<div class="bg-[#F8F9FD]/60 px-4 py-2.5 flex items-center gap-2 border-b border-slate-100">
            <span class="w-7 h-7 rounded-[7px] bg-[#1A56FF] text-white flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-folder text-[11px]"></i></span>
            <span class="font-extrabold text-[13px] text-[#0F2043]">${esc(s)}</span>
            <span class="text-[11px] text-slate-500">${struct[s].sOrder.filter(x=> x!=='(No Sub-Section)').length} ${esc(cuL('subsection'))} • ${struct[s].cOrder.length} ${esc(cuL('chapter'))} • ${subjLessons.length} lectures</span>
            ${cuNodeResBadge({section:s})}
            <span class="ml-auto flex items-center gap-1">
              <button data-node-res="section" data-nr-s="${esc(s)}" class="h-7 px-2 rounded-[7px] bg-[#FEF3C7]/60 border border-[#FDE68A] text-[#92400E] hover:bg-[#FEF3C7] flex items-center gap-1 text-[10px] font-bold flex-shrink-0" title="${esc(cuL('section'))}-e PDF / Sheet attach"><i class="fa-solid fa-file-circle-plus text-[11px]"></i><span class="hidden sm:inline">Sheet</span></button>
              <button data-subj-up="${si}" class="w-7 h-7 rounded-[7px] bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 ${si===0?'opacity-30 pointer-events-none':''}" title="Move ${esc(cuL('section'))} up"><i class="fa-solid fa-chevron-up text-[10px]"></i></button>
              <button data-subj-down="${si}" class="w-7 h-7 rounded-[7px] bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 ${si===subjOrder.length-1?'opacity-30 pointer-events-none':''}" title="Move ${esc(cuL('section'))} down"><i class="fa-solid fa-chevron-down text-[10px]"></i></button>
              ${isSecEmpty?`<button data-empty-sec-del="${esc(s)}" class="w-7 h-7 rounded-[7px] bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center" title="Delete empty ${esc(cuL('section'))}"><i class="fa-solid fa-trash text-[10px]"></i></button>`:''}
            </span>
          </div>`;
          }
          struct[s].sOrder.forEach((ssKey, ssi)=>{
            const ssObj = struct[s].subs[ssKey];
            const isEmpty = ssKey === '(No Sub-Section)';
            if(!isEmpty){
              const ssLessons = Object.values(ssObj.chapters).flat();
              const chCount = ssObj.cOrder.length;
              const isSsEmpty = ssLessons.length===0;
              html += `<div class="bg-[#EEF2FF]/60 px-4 py-2 flex items-center gap-2 border-y border-slate-100 ml-4">
                <span class="w-6 h-6 rounded-[6px] bg-[#7C3AED] text-white flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-folder-open text-[10px]"></i></span>
                <span class="font-bold text-[12.5px] text-[#0F2043]">${esc(ssObj.name)}</span>
                <span class="text-[11px] text-slate-500">${chCount} ${esc(cuL('chapter'))} • ${ssLessons.length} lectures</span>
                ${cuNodeResBadge({section:s, subsection:ssObj.name})}
                <span class="ml-auto flex items-center gap-1">
                <button data-node-res="subsection" data-nr-s="${esc(s)}" data-nr-ss="${esc(ssObj.name)}" class="h-6 px-2 rounded-[6px] bg-[#FEF3C7]/60 border border-[#FDE68A] text-[#92400E] hover:bg-[#FEF3C7] flex items-center gap-1 text-[10px] font-bold flex-shrink-0" title="${esc(cuL('subsection'))}-e PDF / Sheet attach"><i class="fa-solid fa-file-circle-plus text-[10px]"></i><span class="hidden sm:inline">Sheet</span></button>
                ${isSsEmpty?`<button data-empty-ss-del="${esc(s)}||${esc(ssObj.name)}" class="w-6 h-6 rounded-[6px] bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center" title="Delete empty ${esc(cuL('subsection'))}"><i class="fa-solid fa-trash text-[9px]"></i></button>`:''}
                </span>
              </div>`;
            }
            ssObj.cOrder.forEach((ch, ci)=>{
              const chLessons = ssObj.chapters[ch];
              // Chapter dey nai (khali class) — Chapter 1 header banano jabe na, lectures direct
              if(!ch){ chLessons.forEach((l, li)=>{ html += lectureRowHtml(l, li, chLessons.length, si, ci); }); return; }
              const isChEmpty = chLessons.length===0;
              const __chSs = isEmpty ? '' : (ssObj.name || '');
              html += `<div class="bg-[#FFFBEB]/40 px-4 py-2 flex items-center gap-2 border-y border-slate-100 ${isEmpty ? 'ml-4' : 'ml-8'}">
                <span class="w-6 h-6 rounded-[6px] bg-[#F59E0B] text-white flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-book-open text-[10px]"></i></span>
                <span class="font-bold text-[12.5px] text-[#0F2043]">${esc(ch)}</span>
                <span class="text-[11px] text-slate-500">${chLessons.length} lectures</span>
                ${cuNodeResBadge(Object.assign({section:(s||'General')}, __chSs?{subsection:__chSs}:{}, {chapter:ch}))}
                <span class="ml-auto flex items-center gap-1">
                  <button data-node-res="chapter" data-nr-s="${esc(s || 'General')}" data-nr-ss="${esc(__chSs)}" data-nr-c="${esc(ch)}" class="h-6 px-2 rounded-[6px] bg-[#FEF3C7]/60 border border-[#FDE68A] text-[#92400E] hover:bg-[#FEF3C7] flex items-center gap-1 text-[10px] font-bold flex-shrink-0" title="${esc(cuL('chapter'))}-e PDF / Sheet attach"><i class="fa-solid fa-file-circle-plus text-[10px]"></i><span class="hidden sm:inline">Sheet</span></button>
                  <button data-chap-up="${si}-${ssi}-${ci}" class="w-6 h-6 rounded-[6px] bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 ${ci===0?'opacity-30 pointer-events-none':''}"><i class="fa-solid fa-chevron-up text-[9px]"></i></button>
                  <button data-chap-down="${si}-${ssi}-${ci}" class="w-6 h-6 rounded-[6px] bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 ${ci===ssObj.cOrder.length-1?'opacity-30 pointer-events-none':''}"><i class="fa-solid fa-chevron-down text-[9px]"></i></button>
                  ${isChEmpty?`<button data-empty-ch-del="${esc(s)}||${esc(ssObj.name)}||${esc(ch)}" class="w-6 h-6 rounded-[6px] bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center" title="Delete empty ${esc(cuL('chapter'))}"><i class="fa-solid fa-trash text-[9px]"></i></button>`:''}
                </span>
              </div>`;
              chLessons.forEach((l, li)=>{
                html += lectureRowHtml(l, li, chLessons.length, si, ci);
              });
            });
          });
        });
      } else {
        // flat filtered list (subject / sub-section / chapter filter active)
        list.slice().sort((a,b)=> (Number(a.order)||0)-(Number(b.order)||0)).forEach((l, idx)=>{
          html += lectureRowHtml(l, idx, list.length, -1, -1);
        });
      }
      html += `</div>`;
      listEl.innerHTML = html;
      bindLessonActions();
    }

    function lectureRowHtml(l, idx, total, si, ci){
      const isFree = !!l.isFree;
      const badge = l.videoUrl ? `<span class="px-2 py-0.5 rounded-full bg-[#E6F4EA] text-[#16A34A] text-[10px] font-bold">Upload • ${fmtSize(l.videoSize||0)}</span>` : (l.videoId ? `<span class="px-2 py-0.5 rounded-full bg-[#E6F0FF] text-[#1A56FF] text-[10px] font-bold">YouTube</span>` : `<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">No video</span>`);
      const resCount = Array.isArray(l.resources) ? l.resources.length : 0;
      const resBadge = resCount ? `<span class="px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] text-[10px] font-bold whitespace-nowrap"><i class="fa-solid fa-file-lines mr-0.5"></i>${resCount} sheet${resCount>1?'s':''}</span>` : '';
      const tgCount = (()=> {
        let n = (Array.isArray(l.telegramLinks) ? l.telegramLinks.length : 0) + (Array.isArray(l.telegramChatIds) ? l.telegramChatIds.length : 0);
        try{
          const cc = (courses || []).find(c=> String(c.id) === String(cuState.courseId)) || {};
          const sn = cuSubjVal(l), cn = cuChapVal(l);
          const se = ((cc.sectionTg || {})[sn]) || {};
          const ce = ((cc.chapterTg || {})[sn + '||' + cn]) || {};
          n += (se.links || []).length + (se.ids || []).length + (ce.links || []).length + (ce.ids || []).length;
        }catch(e){}
        return n;
      })();
      const tgBadge = tgCount ? `<span class="px-2 py-0.5 rounded-full bg-[#E0F2FE] text-[#0284C7] text-[10px] font-bold whitespace-nowrap"><i class="fa-brands fa-telegram mr-0.5"></i>${tgCount}</span>` : '';
      const pathBits = [];
      if(cuHasSubj(l)) pathBits.push(esc(cuSubjVal(l)));
      if(cuSubSecVal(l)) pathBits.push(esc(cuSubSecVal(l)));
      if(cuHasChap(l)) pathBits.push(esc(cuChapVal(l)));
      if(cuTopicVal(l)) pathBits.push(esc(cuTopicVal(l)));
      if(cuSubTopicVal(l)) pathBits.push(esc(cuSubTopicVal(l)));
      const pathTxt = pathBits.length ? pathBits.join(' • ') : 'No Section';
      return `<div class="flex items-center gap-3 px-4 py-3 hover:bg-[#F8F9FD] group">
        <span class="w-7 h-7 rounded-full bg-[#EEF2FF] text-[#1A56FF] font-extrabold text-[11px] flex items-center justify-center flex-shrink-0">${idx+1}</span>
        <div class="min-w-0 flex-1">
          <div class="font-bold text-[13px] text-[#0F2043] truncate">${esc(l.title||'Untitled')}</div>
          <div class="text-[11px] text-slate-500 truncate">${pathTxt} ${l.duration? ' • '+esc(l.duration):''} ${isFree?' • <span class="text-[#16A34A] font-bold">FREE</span>':''}</div>
        </div>
        ${badge}
        ${resBadge}
        ${tgBadge}
        <span class="flex items-center gap-1 flex-shrink-0">
          <button data-lect-up="${l.id}" class="w-7 h-7 rounded-[7px] bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 ${idx===0?'opacity-30 pointer-events-none':''}" title="Up"><i class="fa-solid fa-chevron-up text-[10px]"></i></button>
          <button data-lect-down="${l.id}" class="w-7 h-7 rounded-[7px] bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 ${idx===total-1?'opacity-30 pointer-events-none':''}" title="Down"><i class="fa-solid fa-chevron-down text-[10px]"></i></button>
          <button data-edit="${l.id}" class="w-7 h-7 rounded-[7px] bg-white border border-slate-200 flex items-center justify-center hover:bg-[#EEF2FF] hover:text-[#1A56FF] hover:border-[#1A56FF]" title="Edit"><i class="fa-solid fa-pen text-[10px]"></i></button>
          <button data-del="${l.id}" class="w-7 h-7 rounded-[7px] bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center" title="Delete"><i class="fa-solid fa-trash text-[10px]"></i></button>
        </span>
      </div>`;
    }

    function bindLessonActions(){
      const listEl = view.querySelector('#cuList');
      listEl.querySelectorAll('[data-edit]').forEach(b=> b.addEventListener('click', ()=> openCuForm(b.getAttribute('data-edit'))));
      listEl.querySelectorAll('[data-del]').forEach(b=> b.addEventListener('click', ()=> doDelete(b.getAttribute('data-del'))));
      listEl.querySelectorAll('[data-empty-sec-del]').forEach(b=> b.addEventListener('click', ()=>{
        const s = b.getAttribute('data-empty-sec-del');
        confirmDialog('Delete ' + cuL('section').toLowerCase() + '?', '"' + s + '" empty ' + cuL('section').toLowerCase() + ' delete hobe.', async ()=>{ await cuDeleteEmptyNode(s, '', '', '', '', 'section'); await loadLessons(); });
      }));
      listEl.querySelectorAll('[data-empty-ss-del]').forEach(b=> b.addEventListener('click', ()=>{
        const parts = String(b.getAttribute('data-empty-ss-del')||'').split('||');
        confirmDialog('Delete ' + cuL('subsection').toLowerCase() + '?', '"' + parts.join(' → ') + '" empty ' + cuL('subsection').toLowerCase() + ' delete hobe.', async ()=>{ await cuDeleteEmptyNode(parts[0]||'', parts[1]||'', '', '', '', 'subsection'); await loadLessons(); });
      }));
      listEl.querySelectorAll('[data-empty-ch-del]').forEach(b=> b.addEventListener('click', ()=>{
        const parts = String(b.getAttribute('data-empty-ch-del')||'').split('||');
        confirmDialog('Delete ' + cuL('chapter').toLowerCase() + '?', '"' + parts.join(' → ') + '" empty ' + cuL('chapter').toLowerCase() + ' delete hobe.', async ()=>{ await cuDeleteEmptyNode(parts[0]||'', parts[1]||'', parts[2]||'', '', '', 'chapter'); await loadLessons(); });
      }));
      listEl.querySelectorAll('[data-lect-up]').forEach(b=> b.addEventListener('click', ()=> doMove(b.getAttribute('data-lect-up'), -1)));
      listEl.querySelectorAll('[data-lect-down]').forEach(b=> b.addEventListener('click', ()=> doMove(b.getAttribute('data-lect-down'), 1)));
      listEl.querySelectorAll('[data-subj-up],[data-subj-down]').forEach(b=>{
        b.addEventListener('click', ()=>{
          const isUp=b.hasAttribute('data-subj-up');
          const si=Number(b.getAttribute(isUp?'data-subj-up':'data-subj-down'));
          doMoveSubject(si, isUp?-1:1);
        });
      });
      listEl.querySelectorAll('[data-chap-up],[data-chap-down]').forEach(b=>{
        b.addEventListener('click', ()=>{
          const isUp=b.hasAttribute('data-chap-up');
          const key=b.getAttribute(isUp?'data-chap-up':'data-chap-down');
          const parts=key.split('-').map(Number);
          // new 3-part key (si-ssi-ci) or old 2-part fallback
          if(parts.length >= 3) doMoveChapter3(parts[0], parts[1], parts[2], isUp?-1:1);
          else doMoveChapter(parts[0], parts[1], isUp?-1:1);
        });
      });
      // Section / Sub-Section / Chapter header-e Sheet attach button
      listEl.querySelectorAll('[data-node-res]').forEach(b=> b.addEventListener('click', (e)=>{
        e.stopPropagation();
        const level = b.getAttribute('data-node-res') || 'chapter';
        const s = b.getAttribute('data-nr-s') || '';
        const ss = b.getAttribute('data-nr-ss') || '';
        const ch = b.getAttribute('data-nr-c') || '';
        const path = { section: s };
        if(level !== 'section' && ss) path.subsection = ss;
        if(level === 'chapter' && ch) path.chapter = ch;
        openNodeResModal(level, path);
      }));
    }

    /* ---------- Node resources modal: Section/Sub-Section/Chapter-e PDF attach ----------
     * Class-er under-e charao ekhon node level-e Lecture/Practice Sheet, Drive link
     * deya jabe. Upload ager /api/admin/resources/upload endpoint-ei hoy. */
    function openNodeResModal(level, path){
      const cid = cuState.courseId;
      if(!cid || (!path.section && !path.subsection && !path.chapter)){ toast('Age course select koro', false); return; }
      const levelName = level === 'section' ? cuL('section') : (level === 'subsection' ? cuL('subsection') : cuL('chapter'));
      // 'General' sudhu internal bucket — admin nije General name-e Section na banale crumb-e dekhabe na
      const courseHasRealG = (cuState.lessons||[]).some(l=> String(l.subject||'').trim() === 'General');
      const crumbParts = [path.section, path.subsection, path.chapter].filter(Boolean).filter(p=> courseHasRealG || p !== 'General');
      const crumb = crumbParts.length ? crumbParts.join(' → ') : 'Sheets';
      const RES_LABELS = ['Lecture Sheet', 'Practice Sheet', 'Solution Sheet', 'Exam Sheet', 'Class Note'];
      let rows = cuNodeResList(path).map(r=> ({ label: String(r.label||''), url: String(r.url||'') }));
      const newFiles = new Set();
      const baseCls = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white';
      openModal(`
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
          <h3 class="text-[15px] font-extrabold text-[#0F2043] min-w-0"><i class="fa-solid fa-file-circle-plus text-[#D97706] mr-1"></i> ${esc(levelName)} Sheets</h3>
          <button onclick="closeModal()" class="w-8 h-8 rounded-full hover:bg-slate-100 flex-shrink-0"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="p-5 space-y-2.5 max-h-[70vh] overflow-y-auto">
          <div class="px-3 py-2 rounded-[8px] bg-[#FFFBEB] border border-[#FDE68A] text-[12px] font-bold text-[#92400E] truncate">${esc(crumb)}</div>
          <div id="nrResList" class="space-y-2"></div>
          <button type="button" id="nrResAdd" class="w-full py-2 rounded-[8px] border-2 border-dashed border-slate-200 text-slate-500 hover:border-[#1A56FF] hover:text-[#1A56FF] font-bold text-[12px] transition"><i class="fa-solid fa-plus mr-1"></i> Add Sheet</button>
          <p id="nrErr" class="hidden text-[12px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"></p>
        </div>
        <div class="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onclick="closeModal()" class="px-4 py-2 rounded-[10px] bg-slate-100 font-bold text-[13px]">Cancel</button>
          <button id="nrSave" class="px-5 py-2 rounded-[10px] bg-[#1A56FF] text-white font-bold text-[13px]">Save Sheets</button>
        </div>`);
      function paintNr(){
        const box = document.getElementById('nrResList');
        if(!box) return;
        if(!rows.length){
          box.innerHTML = '';
          return;
        }
        box.innerHTML = rows.map((r, i)=> `
          <div class="bg-white border border-slate-200 rounded-[8px] p-2">
            <div class="flex items-center gap-1.5">
              <span class="w-6 h-6 rounded-[6px] ${/practice/i.test(r.label||'')?'bg-[#FEF3C7] text-[#D97706]':'bg-[#E6F0FF] text-[#1A56FF]'} flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-file-lines text-[11px]"></i></span>
              <select data-nr-label="${i}" class="flex-1 min-w-0 border border-slate-200 rounded-[7px] px-2 py-1.5 text-[12px] font-bold outline-none focus:border-[#1A56FF] bg-white">
                ${RES_LABELS.map(x=> `<option value="${x}" ${String(r.label)===x?'selected':''}>${x}</option>`).join('')}
                ${r.label && !RES_LABELS.includes(r.label) ? `<option value="${esc(r.label)}" selected>${esc(r.label)}</option>` : ''}
                <option value="__custom">Custom...</option>
              </select>
              <button type="button" data-nr-del="${i}" class="w-7 h-7 rounded-[7px] bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center flex-shrink-0" title="Remove"><i class="fa-solid fa-trash text-[10px]"></i></button>
            </div>
            <div class="flex gap-1.5 mt-1.5">
              <input data-nr-url="${i}" value="${esc(r.url||'')}" placeholder="PDF link (https://... / drive) ba Upload koro" class="flex-1 min-w-0 border border-slate-200 rounded-[7px] px-2 py-1.5 text-[11.5px] outline-none focus:border-[#1A56FF] bg-white">
              <label class="px-2.5 py-1.5 rounded-[7px] bg-[#0F2043] text-white text-[11px] font-bold cursor-pointer hover:bg-[#1A56FF] whitespace-nowrap flex items-center gap-1 flex-shrink-0"><i class="fa-solid fa-upload text-[10px]"></i>PDF<input type="file" accept="application/pdf,.pdf,image/*" class="hidden" data-nr-file="${i}"></label>
            </div>
            <p class="text-[10px] mt-1 ${r.url?'text-[#16A34A] font-bold':'text-slate-400'}" data-nr-status="${i}">${r.url ? '✓ Attached: ' + esc(String(r.url).length>60 ? String(r.url).slice(0,60)+'…' : r.url) : 'Link paste koro ba PDF upload koro'}</p>
          </div>`).join('');
        box.querySelectorAll('[data-nr-label]').forEach(sel=>{
          sel.addEventListener('change', ()=>{
            const i = Number(sel.dataset.nrLabel);
            if(sel.value === '__custom'){
              inputDialog({ title: 'Custom Sheet Name', subtitle: 'e.g. Board Question Bank', placeholder: 'Sheet name', value: rows[i].label || '', okLabel: 'Save', icon: 'fa-file-lines' }).then(function(n){
                if(n) rows[i].label = String(n).slice(0, 80);
                paintNr();
              });
              return;
            }
            rows[i].label = sel.value; paintNr();
          });
        });
        box.querySelectorAll('[data-nr-url]').forEach(inp=>{
          inp.addEventListener('input', ()=>{ rows[Number(inp.dataset.nrUrl)].url = inp.value.trim(); });
        });
        box.querySelectorAll('[data-nr-del]').forEach(btn=>{
          btn.addEventListener('click', async ()=>{
            const i = Number(btn.dataset.nrDel);
            const gone = rows.splice(i, 1)[0];
            if(gone && gone.url && newFiles.has(gone.url)){
              newFiles.delete(gone.url);
              try{ await api('/api/admin/resources', { method: 'DELETE', body: JSON.stringify({ fileUrl: gone.url }) }); }catch(e){}
            }
            paintNr();
          });
        });
        box.querySelectorAll('[data-nr-file]').forEach(inp=>{
          inp.addEventListener('change', async ()=>{
            const i = Number(inp.dataset.nrFile);
            const f = inp.files && inp.files[0]; if(!f) return;
            const st = document.querySelector('[data-nr-status="'+i+'"]');
            try{
              if(st){ st.textContent = 'Uploading ' + f.name + '...'; st.className = 'text-[10px] mt-1 text-[#1A56FF] font-bold'; }
              const res = await fetch('/api/admin/resources/upload', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + state.token, 'Content-Type': f.type || 'application/pdf', 'x-file-name': encodeURIComponent(f.name) },
                body: f
              });
              const j = await res.json();
              if(!res.ok || j.success === false) throw new Error(j.message || 'Upload failed');
              rows[i].url = j.data.fileUrl;
              newFiles.add(j.data.fileUrl);
              toast('Sheet attached');
            }catch(e){ toast(e.message, false); }
            paintNr();
          });
        });
      }
      document.getElementById('nrResAdd').addEventListener('click', ()=>{
        if(rows.length >= 10){ toast('Max 10 sheets', false); return; }
        rows.push({ label: rows.some(r=> /practice/i.test(r.label||'')) ? 'Lecture Sheet' : (rows.length ? 'Practice Sheet' : 'Lecture Sheet'), url: '' });
        paintNr();
      });
      paintNr();
      document.getElementById('nrSave').addEventListener('click', async ()=>{
        const err = document.getElementById('nrErr');
        err.classList.add('hidden');
        const btn = document.getElementById('nrSave');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Saving...';
        try{
          const payload = rows
            .map(r=> ({ label: String(r.label || '').trim().slice(0, 80), url: String(r.url || '').trim().slice(0, 2000) }))
            .filter(r=> r.label && (/^https?:\/\//i.test(r.url) || r.url.startsWith('/uploads/resources/')));
          await api('/api/admin/courses/' + encodeURIComponent(cid) + '/node-resources', { method: 'PUT', body: JSON.stringify({ path, resources: payload }) });
          newFiles.clear();
          closeModal();
          toast(payload.length ? 'Sheets saved' : 'Sheets removed');
          await cuFetchNodeResources(cid);
          renderLessonList();
        }catch(e){
          err.textContent = e.message;
          err.classList.remove('hidden');
          btn.disabled = false;
          btn.textContent = 'Save Sheets';
        }
      });
    }

    async function doMove(lessonId, dir){
      const cid = cuState.courseId;
      if(!cid) return;
      const sorted = cuState.lessons.slice().sort((a,b)=> (Number(a.order)||0)-(Number(b.order)||0));
      // restrict to filtered view if filter active, else global
      let pool = sorted;
      if(cuState.subject || cuState.subsection || cuState.chapter || cuState.topic || cuState.subtopic){
        pool = sorted.filter(l=>{
          if(cuState.subject && cuSubjVal(l)!==cuState.subject) return false;
          if(cuState.subsection && cuSubSecVal(l)!==cuState.subsection) return false;
          if(cuState.chapter && cuChapVal(l)!==cuState.chapter) return false;
          if(cuState.topic && cuTopicVal(l)!==cuState.topic) return false;
          if(cuState.subtopic && cuSubTopicVal(l)!==cuState.subtopic) return false;
          return true;
        });
      }
      const idx = pool.findIndex(l=> String(l.id)===String(lessonId));
      if(idx<0) return;
      const ni = idx + dir;
      if(ni<0 || ni>=pool.length) return;
      // swap in global sorted array
      const a = pool[idx], b = pool[ni];
      const ai = sorted.findIndex(x=> String(x.id)===String(a.id));
      const bi = sorted.findIndex(x=> String(x.id)===String(b.id));
      sorted[ai]=b; sorted[bi]=a;
      const order = sorted.map(x=> x.id);
      try{
        await api('/api/admin/courses/'+encodeURIComponent(cid)+'/reorder', { method:'PUT', body: JSON.stringify({ order }) });
        await loadLessons();
        toast('Order updated');
      }catch(e){ toast(e.message,false); }
    }
    async function doMoveSubject(si, dir){
      const cid = cuState.courseId;
      const sorted = cuState.lessons.slice().sort((a,b)=> (Number(a.order)||0)-(Number(b.order)||0));
      const subjOrder=[]; const map={};
      sorted.forEach(l=>{ const s=cuSubjVal(l); if(!map[s]){ map[s]=[]; subjOrder.push(s);} map[s].push(l); });
      const ni = si + dir;
      if(ni<0||ni>=subjOrder.length) return;
      const tmp=subjOrder[si]; subjOrder[si]=subjOrder[ni]; subjOrder[ni]=tmp;
      const newSorted=[]; subjOrder.forEach(s=> newSorted.push(...map[s]));
      const order=newSorted.map(x=>x.id);
      try{ await api('/api/admin/courses/'+encodeURIComponent(cid)+'/reorder',{method:'PUT',body:JSON.stringify({order})}); await loadLessons(); toast(cuL('section')+' order updated'); }catch(e){ toast(e.message,false); }
    }
    async function doMoveChapter(si, ci, dir){
      // old 2-part fallback — delegate to 3-part with ssi=0 scan
      const cid = cuState.courseId;
      const sorted = cuState.lessons.slice().sort((a,b)=> (Number(a.order)||0)-(Number(b.order)||0));
      const subjOrder=[]; const subjMap={};
      sorted.forEach(l=>{ const s=cuSubjVal(l); if(!subjMap[s]){ subjMap[s]={}; subjOrder.push(s);} const ch=cuChapVal(l); if(!subjMap[s][ch]) subjMap[s][ch]=[]; subjMap[s][ch].push(l); });
      const subjName = subjOrder[si];
      if(!subjName) return;
      const chapOrder=[]; sorted.forEach(l=>{ if(cuSubjVal(l)!==subjName) return; const ch=cuChapVal(l); if(!chapOrder.includes(ch)) chapOrder.push(ch); });
      const ni=ci+dir; if(ni<0||ni>=chapOrder.length) return;
      const tmp=chapOrder[ci]; chapOrder[ci]=chapOrder[ni]; chapOrder[ni]=tmp;
      const newSorted=[];
      subjOrder.forEach(s=>{
        if(s!==subjName){
          sorted.forEach(l=>{ if(cuSubjVal(l)===s) newSorted.push(l); });
        } else {
          chapOrder.forEach(ch=>{
            const arr=subjMap[s][ch]||[];
            arr.slice().sort((a,b)=> (Number(a.order)||0)-(Number(b.order)||0)).forEach(l=> newSorted.push(l));
          });
        }
      });
      const seen=new Set(); const final=[];
      newSorted.forEach(l=>{ if(!seen.has(String(l.id))){ seen.add(String(l.id)); final.push(l); } });
      sorted.forEach(l=>{ if(!seen.has(String(l.id))) final.push(l); });
      const order=final.map(x=>x.id);
      try{ await api('/api/admin/courses/'+encodeURIComponent(cid)+'/reorder',{method:'PUT',body:JSON.stringify({order})}); await loadLessons(); toast(cuL('chapter')+' order updated'); }catch(e){ toast(e.message,false); }
    }
    async function doMoveChapter3(si, ssi, ci, dir){
      // Section(si) → Sub-Section(ssi) er ভেতরে chapter ci move
      const cid = cuState.courseId;
      const sorted = cuState.lessons.slice().sort((a,b)=> (Number(a.order)||0)-(Number(b.order)||0));
      const subjOrder=[];
      const tree={};
      sorted.forEach(l=>{
        const s=cuSubjVal(l), ss=cuSubSecVal(l)||'(No Sub-Section)', ch=cuChapVal(l);
        if(!tree[s]){ tree[s]={ subs:{}, sOrder:[] }; subjOrder.push(s); }
        if(!tree[s].subs[ss]){ tree[s].subs[ss]={ chapters:{}, cOrder:[] }; tree[s].sOrder.push(ss); }
        if(!tree[s].subs[ss].chapters[ch]){ tree[s].subs[ss].chapters[ch]=[]; tree[s].subs[ss].cOrder.push(ch); }
        tree[s].subs[ss].chapters[ch].push(l);
      });
      const sName = subjOrder[si];
      if(!sName || !tree[sName]) return;
      const ssKey = tree[sName].sOrder[ssi];
      if(ssKey === undefined) return;
      const cOrder = tree[sName].subs[ssKey].cOrder;
      const ni = ci + dir;
      if(ni<0 || ni>=cOrder.length) return;
      const tmp=cOrder[ci]; cOrder[ci]=cOrder[ni]; cOrder[ni]=tmp;
      const newSorted=[];
      subjOrder.forEach(s=>{
        tree[s].sOrder.forEach(ssk=>{
          tree[s].subs[ssk].cOrder.forEach(ch=>{
            (tree[s].subs[ssk].chapters[ch]||[]).slice().sort((a,b)=> (Number(a.order)||0)-(Number(b.order)||0)).forEach(l=> newSorted.push(l));
          });
        });
      });
      const seen=new Set(); const final=[];
      newSorted.forEach(l=>{ if(!seen.has(String(l.id))){ seen.add(String(l.id)); final.push(l); } });
      sorted.forEach(l=>{ if(!seen.has(String(l.id))) final.push(l); });
      const order=final.map(x=>x.id);
      try{ await api('/api/admin/courses/'+encodeURIComponent(cid)+'/reorder',{method:'PUT',body:JSON.stringify({order})}); await loadLessons(); toast(cuL('chapter')+' order updated'); }catch(e){ toast(e.message,false); }
    }
    async function doDelete(id){
      confirmDialog('Delete class?', 'Ei class delete korle video file-o remove hobe (onno class use na korle).', async ()=>{
        try{ await api('/api/admin/lessons/'+encodeURIComponent(id),{method:'DELETE'}); toast('Deleted'); await loadLessons(); }catch(e){ toast(e.message,false); }
      });
    }

    function openCuForm(editId){
      const isEdit = !!editId;
      const cur = isEdit ? cuState.lessons.find(x=> String(x.id)===String(editId)) : null;
      const d = Object.assign({ title:'', subject: cuState.subject||'', subsection: cuState.subsection||'', subjectId:'', section:'', chapter:'', topic: cuState.topic||'', subtopic: cuState.subtopic||'', duration:'', isFree:false, youtube:'', videoUrl:'', videoName:'', videoSize:0, resources:[] }, cur||{});
      // EDIT: lesson-e YouTube ID videoId-te thake (youtube field-e na) — input-e ager link dekhao
      if(!d.youtube){
        const vid = String((cur && (cur.videoId || cur.youtubeUrl || cur.youtube)) || d.videoId || '').trim();
        if(vid){
          const m = vid.match(/[?&]v=([A-Za-z0-9_-]{11})/) || vid.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
          const id = m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(vid) ? vid : '');
          d.youtube = id ? ('https://www.youtube.com/watch?v=' + id) : vid;
        }
      }
      if(d.subsection === undefined || d.subsection === null) d.subsection = cuState.subsection || '';
      if(d.topic === undefined || d.topic === null) d.topic = cuState.topic || '';
      if(d.subtopic === undefined || d.subtopic === null) d.subtopic = cuState.subtopic || '';
      if(!Array.isArray(d.resources)) d.resources = [];
      // resources working copy: [{label, url}] — save-er age filter hobe
      let cuRes = d.resources.filter(r=> r && (r.label || r.url)).map(r=> ({ label: String(r.label||''), url: String(r.url||'') }));
      // Section / Chapter telegram working copy (course maps theke load — save-er somoy tg-maps endpoint-e jabe)
      const cuCourseDoc = (courses.find(c=>String(c.id)===String(cuState.courseId))||{});
      const cuInitSec = d.subject || '';
      const cuInitChapKey = (d.subject || '') + '||' + (d.section || d.chapter || '');
      const cuSecEntry = ((cuCourseDoc.sectionTg || {})[cuInitSec]) || {};
      const cuChapEntry = ((cuCourseDoc.chapterTg || {})[cuInitChapKey]) || {};
      const cloneLinks = (arr) => (Array.isArray(arr) ? arr : []).filter(x=> x && (x.url || x.link)).map((x, i)=> ({ label: String((x && x.label) || ('Channel ' + (i + 1))), url: String((x && (x.url || x.link)) || '') }));
      const cloneIds = (arr) => (Array.isArray(arr) ? arr : []).filter(x=> x && String((x && (x.chatId || x.id)) || '').trim() !== '').map((x, i)=> ({ label: String((x && x.label) || ('Group ' + (i + 1))), chatId: String((x && (x.chatId || x.id)) || '').trim() }));
      let cuSecLinks = cloneLinks(cuSecEntry.links), cuSecIds = cloneIds(cuSecEntry.ids);
      let cuChapLinks = cloneLinks(cuChapEntry.links), cuChapIds = cloneIds(cuChapEntry.ids);
      const cuSecLoaded = JSON.stringify({ l: cuSecLinks, i: cuSecIds });
      const cuChapLoaded = JSON.stringify({ l: cuChapLinks, i: cuChapIds });
      // ei modal session-e upload kora file (row remove korle songe songe musbe;
      // age theke saved sheet cancel-safe — save-er somoy backend cleanup kore)
      const cuNewFiles = new Set();
      // ensure section/sub-section/chapter/topic defaults (Section charai direct add hobe)
      if(!d.section && d.chapter) d.section=d.chapter;
      if(!d.chapter && d.section) d.chapter=d.section;
      if(!d.section) d.section = cuState.chapter || '';
      if(!d.subject) d.subject = cuState.subject || '';
      if(d.subsection === undefined) d.subsection = cuState.subsection || '';
      const baseCls='w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white';
      const subjOpts = REL.subject().map(s=> `<option value="${esc(s.value)}" ${String(s.value)===String(d.subjectId)?'selected':''}>${esc(s.label)}</option>`).join('');
      // sub-section + chapter + topic options for current subject
      const subSecSet=new Set(); cuState.lessons.forEach(l=>{ if(cuSubjVal(l)===(d.subject||cuState.subject||'General')){ const ss=cuSubSecVal(l); if(ss) subSecSet.add(ss); } });
      const subSecOpts = Array.from(subSecSet).sort().map(c=> `<option value="${esc(c)}" ${c===(d.subsection||'')?'selected':''}>${esc(c)}</option>`).join('');
      const chapSet=new Set(); cuState.lessons.forEach(l=>{ if(cuSubjVal(l)===(d.subject||cuState.subject||'General')){ if((d.subsection||cuState.subsection||'') && cuSubSecVal(l)!==(d.subsection||cuState.subsection||'')) return; chapSet.add(cuChapVal(l)); } });
      const chapOpts = Array.from(chapSet).sort().map(c=> `<option value="${esc(c)}" ${c===(d.section||'')?'selected':''}>${esc(c)}</option>`).join('');
      const topicSet=new Set(); cuState.lessons.forEach(l=>{ const t=cuTopicVal(l); if(t) topicSet.add(t); });
      const topicOpts = Array.from(topicSet).sort().map(c=> `<option value="${esc(c)}" ${c===(d.topic||'')?'selected':''}>${esc(c)}</option>`).join('');
      openModal(`
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="text-[15px] font-extrabold text-[#0F2043]"><i class="fa-solid fa-circle-play text-[#1A56FF] mr-1"></i> ${isEdit?'Edit Class #'+editId:'Add New Class'}</h3>
          <button onclick="closeModal()" class="w-8 h-8 rounded-full hover:bg-slate-100"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="sm:col-span-2"><label class="text-[11px] font-bold text-slate-600 uppercase">Course</label><input value="${esc((courses.find(c=>String(c.id)===String(cuState.courseId))||{}).title||'')}" disabled class="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] bg-slate-50 text-slate-500 mt-1"></div>
            <div><label class="text-[11px] font-bold text-slate-600 uppercase">${esc(cuL('section'))}</label>
              <select id="cuFSubjId" class="${baseCls} mt-1"><option value="">-- Select subject --</option>${subjOpts}</select>
              <input id="cuFSubj" value="${esc(d.subject||'')}" placeholder="Or type new subject (e.g. Physics)" class="${baseCls} mt-1">
              <p class="text-[10px] text-slate-400 mt-1">Dropdown theke select ba niche custom likho</p>
              <div class="mt-2 rounded-[8px] border border-slate-200 bg-[#F8F9FD] p-2">
                <div class="flex items-center gap-1.5">
                  <i class="fa-brands fa-telegram text-[#229ED9] text-[12px]"></i>
                  <p class="text-[10.5px] font-extrabold text-[#0F2043]">${esc(cuL('section'))} Telegram</p>
                  <span class="ml-auto flex gap-1">
                    <button type="button" id="cuSecLinkAdd" class="px-2 py-1 rounded-[6px] bg-[#E6F0FF] text-[#1A56FF] text-[10px] font-bold hover:bg-[#DDE8FF]">+ Link</button>
                    <button type="button" id="cuSecIdAdd" class="px-2 py-1 rounded-[6px] bg-[#E6F4EA] text-[#16A34A] text-[10px] font-bold hover:bg-[#D3EBD8]">+ ID</button>
                  </span>
                </div>
                <div id="cuSecLinkList"></div>
                <div id="cuSecIdList"></div>
              </div>
            </div>
            <div><label class="text-[11px] font-bold text-slate-600 uppercase">${esc(cuL('subsection'))} <span class="text-slate-400 normal-case">(optional)</span></label>
              <select id="cuFSubSecSel" class="${baseCls} mt-1"><option value="">-- Select / None --</option>${subSecOpts}<option value="__new">+ New ${esc(cuL('subsection'))}</option></select>
              <input id="cuFSubSec" value="${esc(d.subsection||'')}" placeholder="${esc(cuL('subsection'))} name (e.g. Part A)" class="${baseCls} mt-1">
            </div>
            <div><label class="text-[11px] font-bold text-slate-600 uppercase">${esc(cuL('chapter'))}</label>
              <select id="cuFChapSel" class="${baseCls} mt-1"><option value="">-- Select --</option>${chapOpts}<option value="__new">+ New ${esc(cuL('chapter'))}</option></select>
              <input id="cuFChap" value="${esc(d.section||d.chapter||'')}" placeholder="${esc(cuL('chapter'))} name (e.g. ভৌতজগত)" class="${baseCls} mt-1">
              <div class="mt-2 rounded-[8px] border border-slate-200 bg-[#F8F9FD] p-2">
                <div class="flex items-center gap-1.5">
                  <i class="fa-brands fa-telegram text-[#229ED9] text-[12px]"></i>
                  <p class="text-[10.5px] font-extrabold text-[#0F2043]">${esc(cuL('chapter'))} Telegram</p>
                  <span class="ml-auto flex gap-1">
                    <button type="button" id="cuChapLinkAdd" class="px-2 py-1 rounded-[6px] bg-[#E6F0FF] text-[#1A56FF] text-[10px] font-bold hover:bg-[#DDE8FF]">+ Link</button>
                    <button type="button" id="cuChapIdAdd" class="px-2 py-1 rounded-[6px] bg-[#E6F4EA] text-[#16A34A] text-[10px] font-bold hover:bg-[#D3EBD8]">+ ID</button>
                  </span>
                </div>
                <div id="cuChapLinkList"></div>
                <div id="cuChapIdList"></div>
              </div>
            </div>
            <div><label class="text-[11px] font-bold text-slate-600 uppercase">${esc(cuL('topic'))} <span class="text-slate-400 normal-case">(optional)</span></label>
              <select id="cuFTopicSel" class="${baseCls} mt-1"><option value="">-- Select / None --</option>${topicOpts}<option value="__new">+ New ${esc(cuL('topic'))}</option></select>
              <input id="cuFTopic" value="${esc(d.topic||'')}" placeholder="${esc(cuL('topic'))} name (e.g. Part A / Module 1)" class="${baseCls} mt-1">
            </div>
            <div><label class="text-[11px] font-bold text-slate-600 uppercase">${esc(cuL('subtopic'))} <span class="text-slate-400 normal-case">(optional)</span></label>
              <input id="cuFSubTopic" value="${esc(d.subtopic||'')}" placeholder="${esc(cuL('subtopic'))} name (e.g. Type 1)" class="${baseCls} mt-1">
            </div>
            ${(cuState.stepDefs||[]).filter(sd=> ['section','subsection','chapter','topic','subtopic'].indexOf(sd.id)===-1).map(sd=>`
            <div><label class="text-[11px] font-bold text-slate-600 uppercase">${esc(sd.name)} <span class="text-slate-400 normal-case">(optional)</span></label>
              <input id="cuFStep_${esc(sd.id)}" value="${esc(((d.steps&&typeof d.steps==='object')?d.steps[sd.id]:'')||'')}" placeholder="${esc(sd.name)} name" class="${baseCls} mt-1">
            </div>`).join('')}
            <div class="sm:col-span-2"><label class="text-[11px] font-bold text-slate-600 uppercase">Lecture Title *</label><input id="cuFTitle" value="${esc(d.title)}" placeholder="Physics 01" class="${baseCls} mt-1"></div>
            <div><label class="text-[11px] font-bold text-slate-600 uppercase">Duration</label><input id="cuFDur" value="${esc(d.duration)}" placeholder="45 min" class="${baseCls} mt-1"></div>
            <div class="flex items-center gap-2 pt-6"><input id="cuFFree" type="checkbox" class="w-4 h-4 accent-[#16A34A]" ${d.isFree?'checked':''}><span class="text-[12px] font-semibold text-slate-700">Free preview</span></div>
            <div class="sm:col-span-2">
              <div class="flex gap-1 bg-slate-100 rounded-[8px] p-1" id="cuFTypeWrap">
                <button type="button" data-cu-type="youtube" class="flex-1 py-1.5 rounded-[6px] text-[12px] font-bold ${!d.videoUrl?'bg-white text-[#1A56FF] shadow':'text-slate-500'}"><i class="fa-brands fa-youtube mr-1"></i>YouTube</button>
                <button type="button" data-cu-type="upload" class="flex-1 py-1.5 rounded-[6px] text-[12px] font-bold ${d.videoUrl?'bg-white text-[#1A56FF] shadow':'text-slate-500'}"><i class="fa-solid fa-upload mr-1"></i>Upload</button>
              </div>
              <div id="cuFVideoBox" class="mt-2">
                ${d.videoUrl? `<div class="flex items-center gap-2 bg-[#E6F4EA] border border-[#C8E9D5] rounded-[8px] px-3 py-2"><i class="fa-solid fa-file-video text-[#16A34A]"></i><span class="text-[12px] font-bold truncate flex-1">${esc(d.videoName||'Uploaded')}${d.videoSize?' • '+fmtSize(d.videoSize):''}</span><button type="button" id="cuFClearVideo" class="text-[11px] font-bold text-red-600">Remove</button></div>` : `<input id="cuFYT" value="${esc(d.youtube||'')}" placeholder="YouTube link * (watch/share link)" class="${baseCls}">`}
              </div>
              <label id="cuFUploadWrap" class="${d.videoUrl?'hidden':''} mt-2 flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-[8px] px-3 py-3 cursor-pointer hover:border-[#1A56FF] bg-white"><i class="fa-solid fa-cloud-arrow-up text-[#1A56FF]"></i><span class="text-[11px] font-semibold text-slate-500">MP4 / WebM — any size</span><input id="cuFFile" type="file" accept="video/mp4,video/webm,.mp4,.webm,.mov" class="hidden"></label>
              <div id="cuFProg" class="hidden mt-2"><div class="h-2 rounded-full bg-slate-200 overflow-hidden"><div id="cuFProgBar" class="h-full bg-[#1A56FF] rounded-full" style="width:0%"></div></div><p id="cuFProgTxt" class="text-[11px] text-slate-500 mt-1">Uploading...</p></div>
            </div>
            <div class="sm:col-span-2">
              <div class="rounded-[10px] border border-slate-200 bg-[#F8F9FD] p-3">
                <div class="flex items-center gap-2">
                  <span class="w-7 h-7 rounded-[7px] bg-[#0F2043] text-white flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-book-open text-[11px]"></i></span>
                  <div class="min-w-0">
                    <p class="text-[12.5px] font-extrabold text-[#0F2043]">Resources <span class="text-slate-400 font-bold">(Lecture Sheet / Practice Sheet)</span></p>
                    <p class="text-[10.5px] text-slate-500">PDF upload ba Drive/Telegram link — max 10 ta</p>
                  </div>
                  <button type="button" id="cuFResAdd" class="ml-auto px-3 py-1.5 rounded-[8px] bg-[#0F2043] text-white text-[11px] font-bold hover:bg-[#1A56FF] whitespace-nowrap flex-shrink-0"><i class="fa-solid fa-plus mr-1"></i>Add Sheet</button>
                </div>
                <div id="cuFResList" class="space-y-2 mt-2.5"></div>
              </div>
            </div>
          </div>
          <p id="cuFErr" class="hidden text-[12px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"></p>
        </div>
        <div class="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onclick="closeModal()" class="px-4 py-2 rounded-[10px] bg-slate-100 font-bold text-[13px]">Cancel</button>
          <button id="cuFSave" class="px-5 py-2 rounded-[10px] bg-[#1A56FF] text-white font-bold text-[13px]">${isEdit?'Update':'Add'} Class</button>
        </div>`);
      const fSubjId=$('cuFSubjId'), fSubj=$('cuFSubj'), fSubSecSel=$('cuFSubSecSel'), fSubSec=$('cuFSubSec'), fChapSel=$('cuFChapSel'), fChap=$('cuFChap'), fTopicSel=$('cuFTopicSel'), fTopic=$('cuFTopic');
      fSubjId.addEventListener('change', ()=>{ if(fSubjId.value){ const opt = REL.subject().find(s=> String(s.value)===String(fSubjId.value)); if(opt) fSubj.value=opt.label; } });
      if(fSubSecSel) fSubSecSel.addEventListener('change', ()=>{ if(fSubSecSel.value && fSubSecSel.value!=='__new') fSubSec.value=fSubSecSel.value; else if(fSubSecSel.value==='__new') fSubSec.value=''; });
      fChapSel.addEventListener('change', ()=>{ if(fChapSel.value && fChapSel.value!=='__new') fChap.value=fChapSel.value; else if(fChapSel.value==='__new') fChap.value=''; });
      if(fTopicSel) fTopicSel.addEventListener('change', ()=>{ if(fTopicSel.value && fTopicSel.value!=='__new') fTopic.value=fTopicSel.value; else if(fTopicSel.value==='__new') fTopic.value=''; });
      let cuFType = d.videoUrl ? 'upload' : 'youtube';
      const typeWrap=document.getElementById('cuFTypeWrap');
      function paintCuType(){
        // tab switch-e ager typed YouTube link hariyo na — d.youtube-te sync rakho
        try{ const __yt = document.getElementById('cuFYT'); if(__yt && __yt.value !== undefined) d.youtube = __yt.value; }catch(e){}
        typeWrap.querySelectorAll('[data-cu-type]').forEach(b=>{ const t=b.getAttribute('data-cu-type'); b.className = 'flex-1 py-1.5 rounded-[6px] text-[12px] font-bold ' + (t===cuFType?'bg-white text-[#1A56FF] shadow':'text-slate-500'); });
        const box=document.getElementById('cuFVideoBox');
        const upWrap=document.getElementById('cuFUploadWrap');
        if(cuFType==='youtube'){
          box.innerHTML = `<input id="cuFYT" value="${esc(d.youtube||'')}" placeholder="YouTube link * (watch/share link)" class="${baseCls}">`;
          const __ni = document.getElementById('cuFYT');
          if(__ni) __ni.addEventListener('input', ()=>{ d.youtube = __ni.value; });
          if(upWrap) upWrap.classList.add('hidden');
        } else {
          if(d.videoUrl){
            box.innerHTML = `<div class="flex items-center gap-2 bg-[#E6F4EA] border border-[#C8E9D5] rounded-[8px] px-3 py-2"><i class="fa-solid fa-file-video text-[#16A34A]"></i><span class="text-[12px] font-bold truncate flex-1">${esc(d.videoName||'Uploaded')}${d.videoSize?' • '+fmtSize(d.videoSize):''}</span><button type="button" id="cuFClearVideo" class="text-[11px] font-bold text-red-600">Remove</button></div>`;
          } else {
            box.innerHTML = `<div class="text-[11px] text-slate-500 border border-dashed rounded-[8px] px-3 py-2 text-center">Upload MP4/WebM below • YouTube not needed</div>`;
          }
          if(upWrap) upWrap.classList.remove('hidden');
        }
        const clearBtn=document.getElementById('cuFClearVideo');
        if(clearBtn) clearBtn.addEventListener('click', ()=>{ d.videoUrl=''; d.videoName=''; d.videoSize=0; cuFType='upload'; paintCuType(); });
      }
      typeWrap.querySelectorAll('[data-cu-type]').forEach(b=> b.addEventListener('click', ()=>{ cuFType=b.getAttribute('data-cu-type'); paintCuType(); }));
      /* ---------- Resources editor (Lecture Sheet / Practice Sheet) ---------- */
      const RES_LABELS = ['Lecture Sheet', 'Practice Sheet', 'Solution Sheet', 'Exam Sheet', 'Class Note'];
      function paintCuRes(){
        const box = document.getElementById('cuFResList');
        if(!box) return;
        if(!cuRes.length){
          box.innerHTML = '<p class="text-[11px] text-slate-400 text-center py-2 border border-dashed border-slate-200 rounded-[8px] bg-white">No sheet yet — <b>Add Sheet</b> chap diye Lecture / Practice Sheet add koro</p>';
          return;
        }
        box.innerHTML = cuRes.map((r, i)=> `
          <div class="bg-white border border-slate-200 rounded-[8px] p-2" data-cu-res="${i}">
            <div class="flex items-center gap-1.5">
              <span class="w-6 h-6 rounded-[6px] ${/practice/i.test(r.label||'')?'bg-[#FEF3C7] text-[#D97706]':'bg-[#E6F0FF] text-[#1A56FF]'} flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-file-lines text-[11px]"></i></span>
              <select data-cu-res-label="${i}" class="flex-1 min-w-0 border border-slate-200 rounded-[7px] px-2 py-1.5 text-[12px] font-bold outline-none focus:border-[#1A56FF] bg-white">
                ${RES_LABELS.map(x=> `<option value="${x}" ${String(r.label)===x?'selected':''}>${x}</option>`).join('')}
                ${r.label && !RES_LABELS.includes(r.label) ? `<option value="${esc(r.label)}" selected>${esc(r.label)}</option>` : ''}
                <option value="__custom" ${r.label && !RES_LABELS.includes(r.label)?'selected':''}>Custom...</option>
              </select>
              <button type="button" data-cu-res-del="${i}" class="w-7 h-7 rounded-[7px] bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center flex-shrink-0" title="Remove"><i class="fa-solid fa-trash text-[10px]"></i></button>
            </div>
            <div class="flex gap-1.5 mt-1.5">
              <input data-cu-res-url="${i}" value="${esc(r.url||'')}" placeholder="PDF link (https://... / drive) ba Upload koro" class="flex-1 min-w-0 border border-slate-200 rounded-[7px] px-2 py-1.5 text-[11.5px] outline-none focus:border-[#1A56FF] bg-white">
              <label class="px-2.5 py-1.5 rounded-[7px] bg-[#0F2043] text-white text-[11px] font-bold cursor-pointer hover:bg-[#1A56FF] whitespace-nowrap flex items-center gap-1 flex-shrink-0"><i class="fa-solid fa-upload text-[10px]"></i>PDF<input type="file" accept="application/pdf,.pdf,image/*" class="hidden" data-cu-res-file="${i}"></label>
            </div>
            <p class="text-[10px] mt-1 ${r.url?'text-[#16A34A] font-bold':'text-slate-400'}" data-cu-res-status="${i}">${r.url ? '✓ Attached: ' + esc(String(r.url).length>60 ? String(r.url).slice(0,60)+'…' : r.url) : 'Link paste koro ba PDF upload koro'}</p>
          </div>`).join('');
        box.querySelectorAll('[data-cu-res-label]').forEach(sel=>{
          sel.addEventListener('change', ()=>{
            const i = Number(sel.dataset.cuResLabel);
            if(sel.value==='__custom'){
              inputDialog({ title: 'Custom Sheet Name', subtitle: 'e.g. Board Question Bank', placeholder: 'Sheet name', value: cuRes[i].label || '', okLabel: 'Save', icon: 'fa-file-lines' }).then(function(n){
                if(n) cuRes[i].label = String(n).slice(0, 80);
                paintCuRes();
              });
              return;
            }
            cuRes[i].label = sel.value; paintCuRes();
          });
        });
        box.querySelectorAll('[data-cu-res-url]').forEach(inp=>{
          inp.addEventListener('input', ()=>{ cuRes[Number(inp.dataset.cuResUrl)].url = inp.value.trim(); });
        });
        box.querySelectorAll('[data-cu-res-del]').forEach(btn=>{
          btn.addEventListener('click', async ()=>{
            const i = Number(btn.dataset.cuResDel);
            const gone = cuRes.splice(i,1)[0];
            // sudhu ei session-e upload kora orphan file muso (saved sheet cancel-safe)
            if(gone && gone.url && cuNewFiles.has(gone.url)){
              cuNewFiles.delete(gone.url);
              try{ await api('/api/admin/resources',{method:'DELETE',body:JSON.stringify({fileUrl:gone.url})}); }catch(e){}
            }
            paintCuRes();
          });
        });
        box.querySelectorAll('[data-cu-res-file]').forEach(inp=>{
          inp.addEventListener('change', async ()=>{
            const i = Number(inp.dataset.cuResFile);
            const f = inp.files && inp.files[0]; if(!f) return;
            const st = document.querySelector('[data-cu-res-status="'+i+'"]');
            try{
              if(st){ st.textContent = 'Uploading '+f.name+'...'; st.className='text-[10px] mt-1 text-[#1A56FF] font-bold'; }
              const res = await fetch('/api/admin/resources/upload', {
                method:'POST',
                headers:{ 'Authorization':'Bearer '+state.token, 'Content-Type': f.type||'application/pdf', 'x-file-name': encodeURIComponent(f.name) },
                body: f
              });
              const j = await res.json();
              if(!res.ok || j.success===false) throw new Error(j.message||'Upload failed');
              cuRes[i].url = j.data.fileUrl;
              cuNewFiles.add(j.data.fileUrl);
              const urlInp = document.querySelector('[data-cu-res-url="'+i+'"]');
              if(urlInp) urlInp.value = j.data.fileUrl;
              toast('Sheet attached');
            }catch(e){ toast(e.message, false); }
            paintCuRes();
          });
        });
      }
      const resAddBtn = document.getElementById('cuFResAdd');
      if(resAddBtn) resAddBtn.addEventListener('click', ()=>{
        if(cuRes.length>=10){ toast('Max 10 sheets per class', false); return; }
        cuRes.push({ label: cuRes.some(r=> /practice/i.test(r.label||'')) ? 'Lecture Sheet' : (cuRes.length ? 'Practice Sheet' : 'Lecture Sheet'), url: '' });
        paintCuRes();
      });
      paintCuRes();
      /* ---------- Section / Chapter telegram editors (link + ID, per column) ---------- */
      function tgLinkRow(x, i, pfx){
        return `<div class="flex gap-1 mt-1.5">
          <input data-${pfx}-label="${i}" value="${esc(x.label||'')}" placeholder="Label" class="border border-slate-200 rounded-[6px] px-1.5 py-1.5 text-[11px] font-bold outline-none focus:border-[#1A56FF] bg-white w-[32%] min-w-0">
          <input data-${pfx}-url="${i}" value="${esc(x.url||'')}" placeholder="https://t.me/+xxxx" class="flex-1 min-w-0 border border-slate-200 rounded-[6px] px-1.5 py-1.5 text-[11px] outline-none focus:border-[#1A56FF] bg-white">
          <button type="button" data-${pfx}-del="${i}" class="w-6 h-6 rounded-[6px] bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center flex-shrink-0 self-center" title="Remove"><i class="fa-solid fa-trash text-[9px]"></i></button>
        </div>`;
      }
      function tgIdRow(x, i, pfx){
        return `<div class="flex gap-1 mt-1.5">
          <input data-${pfx}-label="${i}" value="${esc(x.label||'')}" placeholder="Label" class="border border-slate-200 rounded-[6px] px-1.5 py-1.5 text-[11px] font-bold outline-none focus:border-[#1A56FF] bg-white w-[32%] min-w-0">
          <input data-${pfx}-val="${i}" value="${esc(x.chatId||'')}" placeholder="-100xxx (ID)" class="flex-1 min-w-0 border border-slate-200 rounded-[6px] px-1.5 py-1.5 text-[11px] outline-none focus:border-[#1A56FF] bg-white">
          <button type="button" data-${pfx}-del="${i}" class="w-6 h-6 rounded-[6px] bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center flex-shrink-0 self-center" title="Remove"><i class="fa-solid fa-trash text-[9px]"></i></button>
        </div>`;
      }
      function bindTgList(boxId, arr, pfx, isId, repaint){
        const box = document.getElementById(boxId);
        if(!box) return;
        box.querySelectorAll('[data-' + pfx + '-label]').forEach(inp=> inp.addEventListener('input', ()=>{ arr[Number(inp.dataset[pfx + 'Label'])].label = inp.value; }));
        const urlKey = isId ? 'val' : 'url', field = isId ? 'chatId' : 'url';
        box.querySelectorAll('[data-' + pfx + '-' + urlKey + ']').forEach(inp=> {
          const idx = Number(inp.dataset[pfx + (isId ? 'Val' : 'Url')]);
          inp.addEventListener('input', ()=>{ arr[idx][field] = inp.value.trim(); });
        });
        box.querySelectorAll('[data-' + pfx + '-del]').forEach(btn=> btn.addEventListener('click', ()=>{ arr.splice(Number(btn.dataset[pfx + 'Del']), 1); repaint(); }));
      }
      function paintCuSecLinks(){
        const box = document.getElementById('cuSecLinkList');
        if(!box) return;
        box.innerHTML = cuSecLinks.length ? cuSecLinks.map((x, i)=> tgLinkRow(x, i, 'seclink')).join('') : '<p class="text-[10px] text-slate-400 mt-1.5">No link — + Link chap daw</p>';
        bindTgList('cuSecLinkList', cuSecLinks, 'seclink', false, paintCuSecLinks);
      }
      function paintCuSecIds(){
        const box = document.getElementById('cuSecIdList');
        if(!box) return;
        box.innerHTML = cuSecIds.length ? cuSecIds.map((x, i)=> tgIdRow(x, i, 'secid')).join('') : '<p class="text-[10px] text-slate-400 mt-1.5">No ID — + ID dile auto invite banbe</p>';
        bindTgList('cuSecIdList', cuSecIds, 'secid', true, paintCuSecIds);
      }
      function paintCuChapLinks(){
        const box = document.getElementById('cuChapLinkList');
        if(!box) return;
        box.innerHTML = cuChapLinks.length ? cuChapLinks.map((x, i)=> tgLinkRow(x, i, 'chaplink')).join('') : '<p class="text-[10px] text-slate-400 mt-1.5">No link — + Link chap daw</p>';
        bindTgList('cuChapLinkList', cuChapLinks, 'chaplink', false, paintCuChapLinks);
      }
      function paintCuChapIds(){
        const box = document.getElementById('cuChapIdList');
        if(!box) return;
        box.innerHTML = cuChapIds.length ? cuChapIds.map((x, i)=> tgIdRow(x, i, 'chapid')).join('') : '<p class="text-[10px] text-slate-400 mt-1.5">No ID — + ID dile auto invite banbe</p>';
        bindTgList('cuChapIdList', cuChapIds, 'chapid', true, paintCuChapIds);
      }
      const secLinkAdd = document.getElementById('cuSecLinkAdd');
      if(secLinkAdd) secLinkAdd.addEventListener('click', ()=>{ if(cuSecLinks.length >= 20){ toast('Max 20 links', false); return; } cuSecLinks.push({ label: 'Channel ' + (cuSecLinks.length + 1), url: '' }); paintCuSecLinks(); });
      const secIdAdd = document.getElementById('cuSecIdAdd');
      if(secIdAdd) secIdAdd.addEventListener('click', ()=>{ if(cuSecIds.length >= 20){ toast('Max 20 IDs', false); return; } cuSecIds.push({ label: 'Group ' + (cuSecIds.length + 1), chatId: '' }); paintCuSecIds(); });
      const chapLinkAdd = document.getElementById('cuChapLinkAdd');
      if(chapLinkAdd) chapLinkAdd.addEventListener('click', ()=>{ if(cuChapLinks.length >= 20){ toast('Max 20 links', false); return; } cuChapLinks.push({ label: 'Channel ' + (cuChapLinks.length + 1), url: '' }); paintCuChapLinks(); });
      const chapIdAdd = document.getElementById('cuChapIdAdd');
      if(chapIdAdd) chapIdAdd.addEventListener('click', ()=>{ if(cuChapIds.length >= 20){ toast('Max 20 IDs', false); return; } cuChapIds.push({ label: 'Group ' + (cuChapIds.length + 1), chatId: '' }); paintCuChapIds(); });
      paintCuSecLinks(); paintCuSecIds(); paintCuChapLinks(); paintCuChapIds();
      let pickedFile=null;
      const fileInp=$('cuFFile');
      if(fileInp) fileInp.addEventListener('change', ()=>{
        const f=fileInp.files[0]; if(!f) return;
        if(!/video\/(mp4|webm|quicktime)/i.test(f.type) && !/\.(mp4|webm|mov)$/i.test(f.name)){ toast('Only MP4/WebM allowed',false); fileInp.value=''; return; }
        pickedFile=f; toast('Ready: '+f.name);
        document.getElementById('cuFVideoBox').innerHTML = `<div class="flex items-center gap-2 bg-[#E6F0FF] border border-[#BFDBFE] rounded-[8px] px-3 py-2"><i class="fa-solid fa-circle-check text-[#1A56FF]"></i><span class="text-[12px] font-bold flex-1 truncate">Ready: ${esc(f.name)} • ${fmtSize(f.size)}</span></div>`;
      });
      $('cuFSave').addEventListener('click', async ()=>{
        const err=$('cuFErr'); err.classList.add('hidden');
        const title=$('cuFTitle').value.trim();
        if(!title){ err.textContent='Title is required'; err.classList.remove('hidden'); return; }
        // Direct add: Section/Chapter khali rakhle course-er under-e direct save hobe
        const subj = $('cuFSubj').value.trim() || '';
        const subjIdVal = $('cuFSubjId').value || '';
        const subsecEl = $('cuFSubSec');
        const subsection = subsecEl ? subsecEl.value.trim() : '';
        const chapter = $('cuFChap').value.trim() || '';
        const topicEl = $('cuFTopic');
        const topic = topicEl ? topicEl.value.trim().slice(0, 120) : '';
        const subTopicEl = $('cuFSubTopic');
        const subtopic = subTopicEl ? subTopicEl.value.trim().slice(0, 120) : '';
        const duration = $('cuFDur').value.trim();
        const isFree = $('cuFFree').checked;
        const ytEl = document.getElementById('cuFYT');
        const yt = ytEl ? ytEl.value.trim() : (d.youtube||'');
        function ytId(s){ s=String(s||'').trim(); if(!s) return ''; if(/^[A-Za-z0-9_-]{11}$/.test(s)) return s; let m=s.match(/[?&]v=([A-Za-z0-9_-]{11})/); if(m) return m[1]; m=s.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/); return m?m[1]:''; }
        const hasYT = !!ytId(yt);
        if(cuFType==='youtube' && !hasYT && !d.videoUrl && !pickedFile){ err.textContent='YouTube link is required (or switch to Upload)'; err.classList.remove('hidden'); return; }
        if(yt && !hasYT && cuFType==='youtube'){ err.textContent='Invalid YouTube link'; err.classList.remove('hidden'); return; }
        const btn=$('cuFSave'); btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin mr-1"></i> Saving...';
        try{
          let videoUrl=d.videoUrl||'', videoName=d.videoName||'', videoSize=d.videoSize||0;
          if(cuFType==='upload' && pickedFile){
            // upload
            const prog=document.getElementById('cuFProg'), bar=document.getElementById('cuFProgBar'), txt=document.getElementById('cuFProgTxt');
            if(prog) prog.classList.remove('hidden');
            videoUrl = await new Promise((res, rej)=>{
              const xhr=new XMLHttpRequest();
              xhr.open('POST','/api/admin/videos/upload',true);
              xhr.setRequestHeader('Authorization','Bearer '+state.token);
              xhr.setRequestHeader('Content-Type', pickedFile.type||'video/mp4');
              xhr.setRequestHeader('x-file-name', encodeURIComponent(pickedFile.name));
              xhr.upload.onprogress = e=>{
                if(!e.lengthComputable) return;
                const pct=Math.round(e.loaded/e.total*100);
                if(bar) bar.style.width=pct+'%';
                if(txt) txt.textContent='Uploading '+pickedFile.name+'... '+pct+'%';
              };
              xhr.onload=()=>{
                let j=null; try{ j=JSON.parse(xhr.responseText);}catch(e){}
                if(xhr.status>=200&&xhr.status<300&&j&&j.success) res(j.data.videoUrl);
                else rej(new Error((j&&j.message)||('Upload failed '+xhr.status)));
              };
              xhr.onerror=()=> rej(new Error('Network error'));
              xhr.send(pickedFile);
            });
            videoName=pickedFile.name; videoSize=pickedFile.size;
          }
          const payload={ subject: subj, subjectId: subjIdVal? Number(subjIdVal):0, subsection: subsection, section: chapter, chapter: chapter, topic, subtopic, title, duration, isFree, order: isEdit ? undefined : (cuState.lessons.length+1) };
          // generic steps: core + custom (custom input gulo) — server dual-write legacy + steps
          const stepsPayload = { section: subj, subsection: subsection, chapter: chapter, topic: topic, subtopic: subtopic };
          (cuState.stepDefs||[]).forEach(sd=>{
            if(['section','subsection','chapter','topic','subtopic'].indexOf(sd.id) !== -1) return;
            const el = document.getElementById('cuFStep_' + sd.id);
            stepsPayload[sd.id] = el ? String(el.value||'').trim().slice(0,120) : ((d.steps&&d.steps[sd.id])||'');
          });
          payload.steps = stepsPayload;
          // resources: khali row bad, vul URL bad (backend-eo normalize hoy)
          payload.resources = cuRes
            .map(r=> ({ label: String(r.label||'').trim().slice(0,80), url: String(r.url||'').trim().slice(0,2000) }))
            .filter(r=> r.label && (/^https?:\/\//i.test(r.url) || r.url.startsWith('/uploads/resources/')));
          if(cuFType==='youtube'){
            if(yt) payload.youtubeUrl=yt;
            if(isEdit && d.videoUrl) payload.videoUrl='';
          } else {
            if(videoUrl){ payload.videoUrl=videoUrl; payload.videoName=videoName; payload.videoSize=videoSize; }
          }
          if(isEdit){
            await api('/api/admin/lessons/'+encodeURIComponent(editId),{method:'PUT', body: JSON.stringify(payload)});
          } else {
            await api('/api/admin/courses/'+encodeURIComponent(cuState.courseId)+'/lessons',{method:'POST', body: JSON.stringify(payload)});
          }
          // Section / Chapter telegram maps save (sudhu change hole — final name diye)
          try{
            const cleanLinks = (arr) => (arr || []).map((x, i)=> ({ label: String(x.label || ('Channel ' + (i + 1))).trim().slice(0, 80), url: String(x.url || '').trim().slice(0, 2000) })).filter(x=> x.url);
            const cleanIds = (arr) => (arr || []).map((x, i)=> ({ label: String(x.label || ('Group ' + (i + 1))).trim().slice(0, 80), chatId: String(x.chatId || '').trim().replace(/\s+/g, '') })).filter(x=> x.chatId);
            const secNow = { l: cleanLinks(cuSecLinks), i: cleanIds(cuSecIds) };
            const chapNow = { l: cleanLinks(cuChapLinks), i: cleanIds(cuChapIds) };
            const mapsBody = { sectionTg: {}, chapterTg: {} };
            let needMaps = false;
            if(subj && JSON.stringify(secNow) !== cuSecLoaded){ mapsBody.sectionTg[subj] = { links: secNow.l, ids: secNow.i }; needMaps = true; }
            if(subj && chapter){ if(JSON.stringify(chapNow) !== cuChapLoaded){ mapsBody.chapterTg[subj + '||' + chapter] = { links: chapNow.l, ids: chapNow.i }; needMaps = true; } }
            if(needMaps){
              const tj = await api('/api/admin/courses/' + encodeURIComponent(cuState.courseId) + '/tg-maps', { method: 'PUT', body: JSON.stringify(mapsBody) });
              if(tj && tj.data){
                const coz = courses.find(c=> String(c.id) === String(cuState.courseId));
                if(coz){ coz.sectionTg = tj.data.sectionTg || {}; coz.chapterTg = tj.data.chapterTg || {}; }
              }
            }
          }catch(e){ /* telegram maps fail holeo class save success */ }
          closeModal(); toast(isEdit?'Class updated':'Class added'); await loadLessons();
        }catch(e){
          err.textContent=e.message; err.classList.remove('hidden');
          btn.disabled=false; btn.textContent=isEdit?'Update':'Add Class';
        }
      });
    }

    // wiring
    batchSel.addEventListener('change', async ()=>{
      cuState.batchId = batchSel.value || '';
      // category batch-e na thakle reset (stale filter hobe na)
      if(cuState.categoryId){
        const pool = cuState.batchId ? cuState.allCourses.filter(c=> String(c.batchId)===String(cuState.batchId)) : cuState.allCourses;
        if(!pool.some(c=> String(c.categoryId)===String(cuState.categoryId))){
          cuState.categoryId = '';
          catSel.value = '';
        }
      }
      cuState.subject=''; cuState.subsection=''; cuState.chapter=''; cuState.topic=''; cuState.subtopic='';
      paintCourseOpts(); await loadLessons();
    });
    catSel.addEventListener('change', async ()=>{
      cuState.categoryId = catSel.value || '';
      cuState.subject=''; cuState.subsection=''; cuState.chapter=''; cuState.topic=''; cuState.subtopic='';
      paintCourseOpts(); await loadLessons();
    });
    courseSel.addEventListener('change', async ()=>{ cuState.subject=''; cuState.subsection=''; cuState.chapter=''; cuState.topic=''; cuState.subtopic=''; cuState.filters = {}; await loadLessons(); });
    subjSel.addEventListener('change', async ()=>{
      if(subjSel.value === '__new'){
        subjSel.value = cuState.subject || '';
        const name = await inputDialog({ title: 'New ' + cuL('section'), subtitle: cuL('section') + ' name (e.g. Physics, Chemistry)', placeholder: 'e.g. Physics', okLabel: 'Add ' + cuL('section'), icon: 'fa-folder' });
        if(name){
          try{
            await cuSaveEmptyNode(name, '', '');
            cuState.subject = name;
            toast(cuL('section')+' saved');
          }catch(e){ /* error already toasted */ }
          await loadLessons();
          subjSel.value = cuState.subject;
        }
      }
      cuState.subsection=''; cuState.topic=''; cuState.subtopic='';
      if(subSecSel) subSecSel.value='';
      if(topicSel) topicSel.value='';
      if(subTopicSel) subTopicSel.value='';
      updateSubSectionOpts(); renderLessonList();
    });
    if(subSecSel) subSecSel.addEventListener('change', async ()=>{
      if(subSecSel.value === '__new'){
        subSecSel.value = cuState.subsection || '';
        // DIRECT ADD: Section charai Sub-Section add — Course select thaklei hobe (neutral display, General banabe na)
        const n = await inputDialog({ title: 'New ' + cuL('subsection'), subtitle: cuL('subsection') + ' name (e.g. Part A, MCQ, CQ)', placeholder: 'e.g. Part A', okLabel: 'Add ' + cuL('subsection'), icon: 'fa-folder-open', iconBg: 'bg-[#EDE9FF] text-[#7C3AED]' });
        if(n){
          try{
            await cuSaveEmptyNode(cuState.subject, n, '');
            cuState.subsection = n;
            toast(cuL('subsection')+' saved');
          }catch(e){}
          await loadLessons();
          subjSel.value = cuState.subject;
          if(subSecSel) subSecSel.value = cuState.subsection;
          updateChapterOpts(); renderLessonList();
          return;
        } else {
          cuState.subsection = '';
        }
      } else {
        cuState.subsection = subSecSel.value || '';
      }
      updateChapterOpts(); renderLessonList();
    });
    chapSel.addEventListener('change', async ()=>{
      if(chapSel.value === '__new'){
        chapSel.value = '';
        // DIRECT ADD: Section charai Chapter add — Course select thaklei hobe (neutral display, General banabe na)
        const n = await inputDialog({ title: 'New ' + cuL('chapter'), subtitle: cuL('chapter') + ' name (e.g. ভৌতজগত ও পরিমাপ)' + (cuState.subsection ? ' — ' + cuL('subsection') + ': ' + cuState.subsection : ''), placeholder: 'e.g. ' + cuL('chapter') + ' 1', okLabel: 'Add ' + cuL('chapter'), icon: 'fa-book-open', iconBg: 'bg-[#FEF3C7] text-[#D97706]' });
        if(n){
          try{
            await cuSaveEmptyNode(cuState.subject, cuState.subsection||'', n, '', '');
            cuState.chapter = n;
            toast(cuL('chapter') + ' saved');
          }catch(e){}
          await loadLessons();
          subjSel.value = cuState.subject;
          if(subSecSel) subSecSel.value = cuState.subsection || '';
          updateSubSectionOpts();
          chapSel.value = cuState.chapter;
          renderLessonList();
          return;
        } else {
          cuState.chapter = '';
        }
      } else {
        cuState.chapter = chapSel.value;
      }
      cuState.topic='';
      if(topicSel) topicSel.value='';
      cuState.subtopic='';
      if(subTopicSel) subTopicSel.value='';
      updateTopicOpts(); renderLessonList();
    });
    if(topicSel) topicSel.addEventListener('change', async ()=>{
      if(topicSel.value === '__new'){
        topicSel.value = cuState.topic || '';
        // DIRECT ADD: Section/Chapter charai Topic add — ja select ache setar under-e save hobe
        const n = await inputDialog({ title: 'New ' + cuL('topic'), subtitle: cuL('topic') + ' name', placeholder: 'e.g. ' + cuL('topic') + ' 1', okLabel: 'Add ' + cuL('topic'), icon: 'fa-list', iconBg: 'bg-[#E0F2FE] text-[#0284C7]' });
        if(n){
          try{
            await cuSaveEmptyNode(cuState.subject, cuState.subsection||'', cuState.chapter||'', n, '');
            cuState.topic = n;
            toast(cuL('topic') + ' saved');
          }catch(e){}
          await loadLessons();
          subjSel.value = cuState.subject;
          if(subSecSel) subSecSel.value = cuState.subsection || '';
          if(chapSel) chapSel.value = cuState.chapter || '';
          updateTopicOpts();
          if(topicSel) topicSel.value = cuState.topic;
          renderLessonList();
          return;
        } else {
          cuState.topic = '';
        }
      } else {
        cuState.topic = topicSel.value || '';
      }
      cuState.subtopic='';
      if(subTopicSel) subTopicSel.value='';
      updateSubTopicOpts(); renderLessonList();
    });
    if(subTopicSel) subTopicSel.addEventListener('change', async ()=>{
      if(subTopicSel.value === '__new'){
        subTopicSel.value = cuState.subtopic || '';
        // DIRECT ADD: parent charai Sub-Topic add — ja select ache setar under-e save hobe
        const n = await inputDialog({ title: 'New ' + cuL('subtopic'), subtitle: cuL('subtopic') + ' name', placeholder: 'e.g. ' + cuL('subtopic') + ' 1', okLabel: 'Add ' + cuL('subtopic'), icon: 'fa-list-ul', iconBg: 'bg-[#FEF3C7] text-[#92400E]' });
        if(n){
          try{
            await cuSaveEmptyNode(cuState.subject, cuState.subsection||'', cuState.chapter||'', cuState.topic||'', n);
            cuState.subtopic = n;
            toast(cuL('subtopic') + ' saved');
          }catch(e){}
          await loadLessons();
          subjSel.value = cuState.subject;
          if(subSecSel) subSecSel.value = cuState.subsection || '';
          if(chapSel) chapSel.value = cuState.chapter || '';
          if(topicSel) topicSel.value = cuState.topic || '';
          updateSubTopicOpts();
          subTopicSel.value = cuState.subtopic;
          renderLessonList();
          return;
        } else {
          cuState.subtopic = '';
        }
      } else {
        cuState.subtopic = subTopicSel.value || '';
      }
      renderLessonList();
    });
    addBtn.addEventListener('click', ()=> openCuForm(null));
    // Step-er naam bodlao (per-course): Chapter → Module, Topic → Part ... ja khushi
    const stepNamesBtn = view.querySelector('#cuStepNames');
    if(stepNamesBtn) stepNamesBtn.addEventListener('click', ()=> openStepLabelsModal());
    // Extra step (topic/subtopic) row — always visible (toggle button removed)
    function syncCuExtra(){
      if(!extraRow) return;
      extraRow.classList.remove('hidden');
    }
    // ===== Steps manager (generic, unlimited): Add / Rename / Reorder / Delete =====
    const CU_CORE_STEPS = ['section','subsection','chapter'];
    const cuExpandedSteps = {}; // stepId -> true (items list khola)
    const stepValsCache = {}; // stepId -> [{value, parents, lessons, empty}]
    // Step-er ভেতরের item gulo: class value + khali (empty/node-sheet) value, parent crumb soho
    function cuStepValues(stepId){
      const defs = (cuState.stepDefs && cuState.stepDefs.length) ? cuState.stepDefs : [{ id:'section' }, { id:'subsection' }, { id:'chapter' }];
      const ids = defs.map(d=> d.id);
      const idx = ids.indexOf(stepId);
      const parentIds = idx > 0 ? ids.slice(0, idx) : [];
      const map = {};
      const push = (val, parents, isLesson)=>{
        val = String(val == null ? '' : val);
        if(!val) return;
        const p = {};
        parentIds.forEach(pid=>{ const v = String((parents||{})[pid] || ''); if(v) p[pid] = v; });
        const key = JSON.stringify([p, val]);
        if(!map[key]) map[key] = { value: val, parents: p, lessons: 0, empty: true };
        if(isLesson){ map[key].lessons++; map[key].empty = false; }
      };
      (cuState.lessons || []).forEach(l=>{
        // Khali class-er fallback (General/Chapter 1) item hisebe uthbe na
        if(stepId === 'section' && !cuHasSubj(l)) return;
        if(stepId === 'chapter' && !cuHasChap(l)) return;
        const parents = {};
        parentIds.forEach(pid=>{
          let pv = cuLessonStepVal(l, pid);
          if(pid === 'section' && !cuHasSubj(l)) pv = '';
          if(pid === 'chapter' && !cuHasChap(l)) pv = '';
          parents[pid] = pv;
        });
        push(cuLessonStepVal(l, stepId), parents, true);
      });
      [cuState.emptyNodes, cuState.nodeResources].forEach(arr=>{
        (arr || []).forEach(n=>{
          const p = (n && n.path && typeof n.path === 'object') ? n.path : {};
          const parents = {};
          parentIds.forEach(pid=>{ parents[pid] = String(p[pid] || ''); });
          push(String(p[stepId] || ''), parents, false);
        });
      });
      return Object.values(map).sort((a, b)=> String(a.value).localeCompare(String(b.value)));
    }
    function cuDefaultCoreSteps(){ return [{ id:'section', name:'Section' }, { id:'subsection', name:'Sub-Section' }, { id:'chapter', name:'Chapter' }]; }
    async function cuFetchSteps(){
      try{
        const j = await api('/api/admin/courses/'+encodeURIComponent(cuState.courseId)+'/steps');
        if(j.data && Array.isArray(j.data)){ cuState.stepDefs = j.data; return j.data; }
      }catch(e){ console.error('[cu] steps fetch failed', e); }
      return cuState.stepDefs || [];
    }
    async function cuPutSteps(defs, okMsg){
      const j = await api('/api/admin/courses/'+encodeURIComponent(cuState.courseId)+'/steps', { method:'PUT', body: JSON.stringify({ steps: defs }) });
      if(j && Array.isArray(j.steps)) cuState.stepDefs = j.steps;
      await loadLessons();
      paintCuLabels();
      toast(okMsg);
      openStepLabelsModal();
    }
    function cuStepUsage(stepId){
      try{
        return (cuState.lessons||[]).filter(l=>{
          const v = cuLessonStepVal(l, stepId);
          if(!v) return false;
          if(stepId === 'section' && !cuHasSubj(l)) return false;
          if(stepId === 'chapter' && !cuHasChap(l)) return false;
          return true;
        }).length;
      }catch(e){ return 0; }
    }
    // Steps manager: Add button-e chap → naam likho → notun dhap toiri (kono limit nai)
    function openStepLabelsModal(){
      if(!cuState.courseId){ toast('Age course select koro', false); return; }
      const steps = (cuState.stepDefs && cuState.stepDefs.length) ? cuState.stepDefs : cuDefaultCoreSteps();
      const courseTitle = ((courses||[]).find(c=>String(c.id)===String(cuState.courseId))||{}).title || '';
      const isCore = (id)=> CU_CORE_STEPS.indexOf(id) !== -1;
      openModal(`
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="text-[15px] font-extrabold text-[#0F2043]"><i class="fa-solid fa-layer-group text-[#7C3AED] mr-1"></i> Steps <span class="text-slate-400 font-bold text-[12px] normal-case"></span></h3>
          <button onclick="closeModal()" class="w-8 h-8 rounded-full hover:bg-slate-100"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="p-5 space-y-2.5 max-h-[70vh] overflow-y-auto">
          <div class="px-3 py-2 rounded-[8px] bg-[#F8F9FD] border border-slate-200 text-[12px] font-bold text-slate-600">Course: ${esc(courseTitle)} • ${steps.length} steps</div>
          ${steps.map((s, i)=>{
            const core = isCore(s.id);
            const use = cuStepUsage(s.id);
            const prevCore = i > 0 && isCore(steps[i-1].id);
            const nextCore = i < steps.length-1 && isCore(steps[i+1].id);
            const canUp = !core && i > 0 && !prevCore;
            const canDown = !core && i < steps.length-1 && !nextCore;
            const vals = cuStepValues(s.id);
            stepValsCache[s.id] = vals;
            const open = !!cuExpandedSteps[s.id];
            const valsHtml = !vals.length
              ? `<p class="text-[11px] text-slate-400 text-center py-2">No items yet — class add korle ekhane asbe</p>`
              : vals.map((v, vi)=>{
                const crumb = Object.values(v.parents || {}).filter(Boolean).join(' → ');
                return `<div class="flex items-center gap-2 bg-white border border-slate-200 rounded-[8px] px-2.5 py-1.5">
                  <span class="w-6 h-6 rounded-[6px] bg-[#EDE9FF] text-[#7C3AED] flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-tag text-[9px]"></i></span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-[12.5px] font-bold text-[#0F2043] truncate">${esc(v.value)}</span>
                    <span class="block text-[10px] text-slate-400 truncate">${crumb ? esc(crumb) + ' • ' : ''}${v.lessons ? v.lessons + ' class' : 'khali (no class)'}</span>
                  </span>
                  <button data-val-edit="${esc(s.id)}:${vi}" class="w-7 h-7 rounded-[7px] bg-slate-100 hover:bg-[#EDE9FF] hover:text-[#7C3AED] text-slate-500 flex items-center justify-center flex-shrink-0" title="Edit item"><i class="fa-solid fa-pen text-[10px]"></i></button>
                  <button data-val-del="${esc(s.id)}:${vi}" class="w-7 h-7 rounded-[7px] bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center flex-shrink-0" title="Delete item"><i class="fa-solid fa-trash text-[10px]"></i></button>
                </div>`;
              }).join('');
            return `
            <div class="rounded-[10px] border border-slate-200 bg-white overflow-hidden">
              <div class="flex items-center gap-2.5 px-3 py-2.5">
                <span class="w-7 h-7 rounded-full bg-[#EDE9FF] text-[#7C3AED] font-extrabold text-[11px] flex items-center justify-center flex-shrink-0">${i+1}</span>
                <div class="min-w-0 flex-1">
                  <div class="font-bold text-[13.5px] text-[#0F2043] truncate">${esc(s.name)}</div>
                  <div class="text-[10.5px] text-slate-400">${core ? 'core step' : 'custom step'}${use ? ' • ' + use + ' class-e use hocche' : ''}</div>
                </div>
                <button data-step-items="${esc(s.id)}" class="h-8 px-2.5 rounded-[8px] ${open ? 'bg-[#EDE9FF] text-[#7C3AED]' : 'bg-slate-100 text-slate-500 hover:bg-[#EDE9FF] hover:text-[#7C3AED]'} flex items-center gap-1.5 flex-shrink-0 text-[11px] font-bold" title="Items dekho"><i class="fa-solid fa-list text-[10px]"></i>${vals.length} items<i class="fa-solid fa-chevron-${open ? 'up' : 'down'} text-[9px]"></i></button>
                <button data-step-up="${esc(s.id)}" class="w-8 h-8 rounded-[8px] ${canUp ? 'bg-slate-100 hover:bg-[#EDE9FF] hover:text-[#7C3AED] text-slate-500' : 'bg-slate-50 text-slate-300 pointer-events-none'} flex items-center justify-center flex-shrink-0" title="Up"><i class="fa-solid fa-chevron-up text-[11px]"></i></button>
                <button data-step-down="${esc(s.id)}" class="w-8 h-8 rounded-[8px] ${canDown ? 'bg-slate-100 hover:bg-[#EDE9FF] hover:text-[#7C3AED] text-slate-500' : 'bg-slate-50 text-slate-300 pointer-events-none'} flex items-center justify-center flex-shrink-0" title="Down"><i class="fa-solid fa-chevron-down text-[11px]"></i></button>
                <button data-step-rename="${esc(s.id)}" class="w-8 h-8 rounded-[8px] bg-slate-100 hover:bg-[#EDE9FF] hover:text-[#7C3AED] text-slate-500 flex items-center justify-center flex-shrink-0" title="Naam bodlao"><i class="fa-solid fa-pen text-[11px]"></i></button>
                ${core
                  ? `<span class="w-8 h-8 rounded-[8px] bg-slate-50 text-slate-300 flex items-center justify-center flex-shrink-0" title="Core step — delete kora jabe na (rename koro)"><i class="fa-solid fa-lock text-[10px]"></i></span>`
                  : `<button data-step-del="${esc(s.id)}" class="w-8 h-8 rounded-[8px] bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center flex-shrink-0" title="Dhap muso"><i class="fa-solid fa-trash text-[11px]"></i></button>`}
              </div>
              <div data-step-vals="${esc(s.id)}" class="${open ? '' : 'hidden'} border-t border-slate-100 bg-[#F8F9FD]/70 px-3 py-2 space-y-1.5">${valsHtml}</div>
            </div>`;
          }).join('')}
          <button id="cuSLAdd" class="w-full py-2.5 rounded-[10px] border border-dashed border-[#7C3AED]/40 bg-[#F5F3FF] text-[#7C3AED] font-bold text-[13px] hover:bg-[#EDE9FF]"><i class="fa-solid fa-plus mr-1"></i> Add Step</button>
          <p class="text-[10.5px] text-slate-400 text-center"></p>
        </div>
        <div class="flex justify-between gap-2 px-5 py-4 border-t border-slate-100">
          <button id="cuSLReset" class="px-4 py-2 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-600">Reset (default)</button>
          <button onclick="closeModal()" class="px-5 py-2 rounded-[10px] bg-[#0F2043] text-white font-bold text-[13px]">Done</button>
        </div>`);
      // Rename: naam likho → save
      document.querySelectorAll('[data-step-rename]').forEach(b=> b.addEventListener('click', async ()=>{
        const id = b.getAttribute('data-step-rename');
        const cur = (cuState.stepDefs||[]).find(s=> s.id === id);
        if(!cur) return;
        const n = await inputDialog({ title: 'Step naam bodlao', placeholder: cur.name, value: cur.name, okLabel: 'Save', icon: 'fa-pen', iconBg: 'bg-[#EDE9FF] text-[#7C3AED]' });
        if(n === null || n === undefined) return;
        const v = String(n).trim().slice(0, 40);
        if(!v || v === cur.name) return;
        try{
          const defs = (cuState.stepDefs||[]).map(s=> s.id === id ? { id: s.id, name: v } : { id: s.id, name: s.name });
          await cuPutSteps(defs, 'Naam updated');
        }catch(e){ toast(e.message, false); }
      }));
      // Delete: sudhu custom step (core lock)
      document.querySelectorAll('[data-step-del]').forEach(b=> b.addEventListener('click', ()=>{
        const id = b.getAttribute('data-step-del');
        const cur = (cuState.stepDefs||[]).find(s=> s.id === id);
        if(!cur) return;
        const use = cuStepUsage(id);
        confirmDialog('Dhap muso?', '"' + cur.name + '" list theke jabe.' + (use ? ' Ei step-e ' + use + ' ta class-er value ache — delete korle oi value gulo dekha jabe na.' : ''), async ()=>{
          try{
            const defs = (cuState.stepDefs||[]).filter(s=> s.id !== id).map(s=> ({ id: s.id, name: s.name }));
            await cuPutSteps(defs, 'Dhap deleted');
          }catch(e){ toast(e.message, false); }
        });
      }));
      // Items toggle (per-step value list kholo/bondho)
      document.querySelectorAll('[data-step-items]').forEach(b=> b.addEventListener('click', ()=>{
        const id = b.getAttribute('data-step-items');
        cuExpandedSteps[id] = !cuExpandedSteps[id];
        openStepLabelsModal();
      }));
      // Item edit (rename value everywhere — class + sheet + telegram soho)
      document.querySelectorAll('[data-val-edit]').forEach(b=> b.addEventListener('click', async ()=>{
        const parts = String(b.getAttribute('data-val-edit') || '').split(':');
        const sid = parts[0], vi = Number(parts[1]);
        const entry = (stepValsCache[sid] || [])[vi];
        if(!entry) return;
        const stepName = ((cuState.stepDefs || []).find(s=> s.id === sid) || {}).name || sid;
        const n = await inputDialog({ title: stepName + ' item rename', subtitle: '"' + entry.value + '"' + (entry.lessons ? ' — ' + entry.lessons + ' ta class-e use hocche, sob update hobe' : ''), placeholder: entry.value, value: entry.value, okLabel: 'Rename', icon: 'fa-pen', iconBg: 'bg-[#EDE9FF] text-[#7C3AED]' });
        if(n === null || n === undefined) return;
        const v = String(n).trim().slice(0, 120);
        if(!v || v === entry.value) return;
        try{
          const j = await api('/api/admin/courses/' + encodeURIComponent(cuState.courseId) + '/step-values/rename', { method: 'PUT', body: JSON.stringify({ stepId: sid, from: entry.value, to: v, parents: entry.parents || {} }) });
          const d = (j && j.data) || {};
          toast('Renamed' + (d.lessons ? ' • ' + d.lessons + ' class' : ''));
          await loadLessons();
          openStepLabelsModal();
        }catch(e){ toast(e.message, false); }
      }));
      // Item delete (sudhu khali value — class thakle server block korbe)
      document.querySelectorAll('[data-val-del]').forEach(b=> b.addEventListener('click', ()=>{
        const parts = String(b.getAttribute('data-val-del') || '').split(':');
        const sid = parts[0], vi = Number(parts[1]);
        const entry = (stepValsCache[sid] || [])[vi];
        if(!entry) return;
        const stepName = ((cuState.stepDefs || []).find(s=> s.id === sid) || {}).name || sid;
        const fullPath = Object.assign({}, entry.parents || {});
        fullPath[sid] = entry.value;
        const crumb = Object.values(fullPath).filter(Boolean).join(' → ');
        confirmDialog(stepName + ' item muso?', '"' + crumb + '"' + (entry.lessons ? ' — ' + entry.lessons + ' ta class use korche!' : ' (khali — class nai)') + ' Delete korbo?', async ()=>{
          try{
            await api('/api/admin/courses/' + encodeURIComponent(cuState.courseId) + '/step-values', { method: 'DELETE', body: JSON.stringify({ path: fullPath }) });
            toast('Deleted');
            await loadLessons();
            openStepLabelsModal();
          }catch(e){ toast(e.message, false); }
        }, 'Yes, Delete');
      }));
      // Reorder (custom steps only — core sobsomoy first)
      document.querySelectorAll('[data-step-up],[data-step-down]').forEach(b=>{
        b.addEventListener('click', ()=>{
          const isUp = b.hasAttribute('data-step-up');
          const id = b.getAttribute(isUp ? 'data-step-up' : 'data-step-down');
          const defs = (cuState.stepDefs||[]).map(s=> ({ id: s.id, name: s.name }));
          const i = defs.findIndex(s=> s.id === id);
          if(i < 0) return;
          const ni = i + (isUp ? -1 : 1);
          if(ni < 0 || ni >= defs.length) return;
          if(isCore(defs[i].id) || isCore(defs[ni].id)) return;
          const tmp = defs[i]; defs[i] = defs[ni]; defs[ni] = tmp;
          cuPutSteps(defs, 'Order updated').catch(e=> toast(e.message, false));
        });
      });
      // Add: naam likho → notun dhap (no max)
      const addBtn2 = $('cuSLAdd');
      if(addBtn2) addBtn2.addEventListener('click', async ()=>{
        const n = await inputDialog({ title: 'Notun Step-er Naam', placeholder: 'e.g. Part / Module / Type', okLabel: 'Add Step', icon: 'fa-plus', iconBg: 'bg-[#EDE9FF] text-[#7C3AED]' });
        if(!n || !String(n).trim()) return;
        try{
          const j = await api('/api/admin/courses/'+encodeURIComponent(cuState.courseId)+'/steps', { method:'POST', body: JSON.stringify({ name: String(n).trim().slice(0, 40) }) });
          if(j && Array.isArray(j.steps)) cuState.stepDefs = j.steps;
          await loadLessons();
          paintCuLabels();
          toast('Notun dhap "' + String(n).trim() + '" toiri!');
          openStepLabelsModal();
        }catch(e){ toast(e.message, false); }
      });
      $('cuSLReset').addEventListener('click', ()=>{
        const customCnt = (cuState.stepDefs||[]).filter(s=> CU_CORE_STEPS.indexOf(s.id) === -1).length;
        confirmDialog('Reset steps?', customCnt ? (customCnt + ' ta custom step muse jabe, core 3 ta default naam-e fire jabe. Class-er saved value thakbe kintu dekha jabe na.') : 'Core 3 ta default naam-e fire jabe.', async ()=>{
          try{ await cuPutSteps(cuDefaultCoreSteps(), 'Steps reset'); }
          catch(e){ toast(e.message, false); }
        });
      });
    }
    await loadLessons();
  }

  /* ---------------- Generic resource page ---------------- */
  async function renderResource(key) {
    const cfg = RESOURCES[key];
    const view = $('view');
    if (!cfg) { view.innerHTML = errorBox('Unknown section: ' + esc(key)); return; }
    view.innerHTML = `<div class="text-center py-20 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-[22px]"></i><p class="text-[13px] mt-2">Loading ${esc(cfg.singular)}s...</p></div>`;

    const json = await api(cfg.endpoint);
    state.lists[key] = json.data || [];
    const isPinnedRow = r => !!(r && (r.pinned === true || r.pinned === 1 || r.pinned === 'true'));
    if (key === 'courses') {
      state.lists[key].sort((a,b)=> {
        const pa = isPinnedRow(a) ? 0 : 1, pb = isPinnedRow(b) ? 0 : 1;
        if(pa !== pb) return pa - pb;
        return (Number(b.id)||0) - (Number(a.id)||0);
      });
    }
    if (key === 'batches') {
      state.lists[key].sort((a,b)=> ((Number(a.order)||999) - (Number(b.order)||999)) || (Number(a.id) - Number(b.id)));
    }

    view.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div class="relative flex-1 max-w-[320px]">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[13px] pointer-events-none"></i>
          <input id="resSearch" placeholder="Search ${esc(cfg.singular.toLowerCase())}..." autocomplete="off"
            class="w-full bg-white border border-slate-200 rounded-[10px] pl-9 pr-8 py-2.5 text-[13px] outline-none focus:border-[#1A56FF]">
          <button id="resSearchClear" class="hidden absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full hover:bg-slate-100 text-slate-400" title="Clear"><i class="fa-solid fa-xmark text-[11px]"></i></button>
          <div id="resSuggest" class="hidden absolute left-0 right-0 top-[calc(100%+6px)] bg-white border border-slate-200 rounded-[12px] shadow-[0_16px_40px_rgba(15,32,67,0.16)] overflow-hidden z-40 max-h-[280px] overflow-y-auto"></div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[12px] font-bold text-slate-500 px-3 py-2.5 rounded-[10px] bg-white border border-slate-200">
            Total: <span id="resCount">${state.lists[key].length}</span>
          </span>
          <button id="resAdd" class="px-4 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px] transition">
            <i class="fa-solid fa-plus mr-1"></i> ${esc(cfg.addLabel)}
          </button>
        </div>
      </div>
      ${cfg.filters ? `
      <div class="flex flex-wrap items-center gap-2 mb-4">
        ${cfg.filters.map(f => `
          <select data-filter="${esc(f.field)}"
            class="bg-white border border-slate-200 rounded-[10px] px-3 py-2 text-[12.5px] font-semibold text-slate-700 outline-none focus:border-[#1A56FF] cursor-pointer max-w-[200px]">
            <option value="">${esc(f.allLabel)}</option>
            ${(f.options ? f.options() : []).map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}
          </select>`).join('')}
        <button id="resClearFilters" class="hidden px-3 py-2 rounded-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[12px] transition">
          <i class="fa-solid fa-xmark mr-1"></i> Clear
        </button>
      </div>` : ''}

      <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-[13px]">
            <thead class="bg-[#F8F9FD] text-slate-500 text-[11px] uppercase">
              <tr>
                ${cfg.columns.map(c => `<th class="px-3 xl:px-5 py-3 text-left font-bold whitespace-nowrap ${c.cls || ''}">${esc(c.label)}</th>`).join('')}
                <th class="px-3 xl:px-5 py-3 text-right font-bold sticky right-0 bg-[#F8F9FD] shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.15)]">Actions</th>
              </tr>
            </thead>
            <tbody id="resBody"></tbody>
          </table>
        </div>
      </div>`;

    function paint(list) {
      const sorted = (key === 'courses')
        ? list.slice().sort((a,b)=> {
            const pa = isPinnedRow(a) ? 0 : 1, pb = isPinnedRow(b) ? 0 : 1;
            if(pa !== pb) return pa - pb;
            return (Number(b.id)||0) - (Number(a.id)||0);
          })
        : list;
      $('resCount').textContent = list.length;
      $('resBody').innerHTML = sorted.length ? sorted.map((r, idx) => `
        <tr data-rowid="${esc(r.id)}" class="border-t border-slate-100 hover:bg-[#F8F9FD] ${key === 'courses' && isPinnedRow(r) ? 'bg-amber-50/40' : ''}">
          ${cfg.columns.map(c => `<td class="px-3 xl:px-5 py-3 align-middle ${c.cls || ''}">${c.cell(r)}</td>`).join('')}
          <td class="px-3 xl:px-5 py-3 text-right whitespace-nowrap sticky right-0 bg-white shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.15)]">
            ${key === 'courses' ? `<button data-classes="${r.id}" class="w-9 h-9 rounded-full bg-[#EDE9FF] text-[#4F46E5] hover:bg-[#DDD6FF] transition" title="Add / manage classes"><i class="fa-solid fa-circle-play text-[12px]"></i></button>` : ''}
            ${key === 'courses' ? `<button data-pin="${r.id}" class="w-9 h-9 rounded-full transition ${isPinnedRow(r) ? 'bg-[#FEF3C7] text-[#B45309] hover:bg-[#FDE68A]' : 'bg-slate-100 text-slate-400 hover:bg-[#FEF3C7] hover:text-[#B45309]'}" title="${isPinnedRow(r) ? 'Unpin' : 'Pin to top'}"><i class="fa-solid fa-thumbtack text-[12px]"></i></button>` : ''}
            <button data-edit="${r.id}" class="w-9 h-9 rounded-full bg-[#E6F0FF] text-[#1A56FF] hover:bg-[#DDE8FF] transition" title="Edit"><i class="fa-solid fa-pen text-[12px]"></i></button>
            ${key === 'courses' ? `<button data-dup="${r.id}" class="w-9 h-9 rounded-full bg-[#E6F4EA] text-[#16A34A] hover:bg-[#D3EBD8] transition" title="Duplicate (copy with classes)"><i class="fa-solid fa-copy text-[12px]"></i></button>` : ''}
            <button data-del="${r.id}" class="w-9 h-9 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition" title="Delete"><i class="fa-solid fa-trash text-[12px]"></i></button>
          </td>
        </tr>`).join('') : emptyRow(cfg.columns.length + 1, 'No ' + cfg.singular.toLowerCase() + ' found');
    }

    $('resBody').addEventListener('click', function (e) {
      const classesBtn = e.target.closest('[data-classes]');
      if (classesBtn && key === 'courses') { location.hash = '#/lessons?courseId=' + encodeURIComponent(classesBtn.dataset.classes); return; }
      const pinBtn = e.target.closest('[data-pin]');
      if (pinBtn && key === 'courses') {
        const id = pinBtn.dataset.pin;
        const item = state.lists[key].find(x => String(x.id) === String(id));
        const nowPinned = item ? isPinnedRow(item) : false;
        pinBtn.disabled = true;
        api(cfg.endpoint + '/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify({ pinned: !nowPinned }) })
          .then(j => {
            const upd = (j && j.data) ? j.data : { pinned: !nowPinned };
            if (item) item.pinned = !!(upd.pinned !== undefined ? upd.pinned : !nowPinned);
            state.lists[key].sort((a,b)=> {
              const pa = isPinnedRow(a) ? 0 : 1, pb = isPinnedRow(b) ? 0 : 1;
              if(pa !== pb) return pa - pb;
              return (Number(b.id)||0) - (Number(a.id)||0);
            });
            applyFilters();
            toast(!nowPinned ? '📌 Pinned — উপরে থাকবে' : 'Unpinned');
          })
          .catch(err => toast(err.message, false))
          .finally(() => { pinBtn.disabled = false; });
        return;
      }
      const editBtn = e.target.closest('[data-edit]');
      const delBtn = e.target.closest('[data-del]');
      const dupBtn = e.target.closest('[data-dup]');
      if (editBtn) { if (key === 'courses') openCourseWizard(editBtn.dataset.edit); else if (key === 'ebooks') openEbookForm(editBtn.dataset.edit); else if (key === 'coupons') openCouponForm(editBtn.dataset.edit); else openForm(key, editBtn.dataset.edit); return; }
      if (dupBtn && key === 'courses') { openCourseDuplicate(dupBtn.dataset.dup); return; }
      if (delBtn) {
        const item = state.lists[key].find(x => String(x.id) === String(delBtn.dataset.del));
        const label = (item && (item.title || item.name || item.code)) || '';
        confirmDialog('Delete ' + cfg.singular + '?',
          'This will permanently remove "' + label + '".',
          async function () {
            try {
              await api(cfg.endpoint + '/' + delBtn.dataset.del, { method: 'DELETE' });
              toast(cfg.singular + ' deleted');
              refreshMeta().then(() => renderResource(key));
            } catch (err) { toast(err.message, false); }
          });
        return;
      }
    });

    function resLabel(r) { return String(r.title || r.name || r.code || ('#' + r.id)); }
    function resSub(r) {
      const parts = [];
      if (r.teacher) parts.push(r.teacher);
      if (r.batchId) parts.push(relName('batch', r.batchId));
      if (r.ebookBatchId) { const eb = (state.meta.ebookBatches || []).find(x => String(x.id) === String(r.ebookBatchId)); if (eb) parts.push(eb.name); }
      if (r.price != null && r.price !== '') parts.push('৳' + r.price);
      if (!parts.length && r.id != null) parts.push('#' + r.id);
      return parts.join(' • ');
    }
    function resMatch(r, term) {
      if (!term) return true;
      const hay = (resLabel(r) + ' ' + resSub(r) + ' ' + (r.id || '') + ' ' + JSON.stringify(r)).toLowerCase();
      return term.split(/\s+/).filter(Boolean).every(w => hay.includes(w));
    }
    function applyFilters() {
      const term = (($('resSearch').value || '').trim()).toLowerCase();
      const fvals = {};
      document.querySelectorAll('[data-filter]').forEach(s => { fvals[s.dataset.filter] = s.value; });
      const anyFilter = term || Object.keys(fvals).some(k => fvals[k]);
      const clearBtn = $('resClearFilters');
      if (clearBtn) clearBtn.classList.toggle('hidden', !anyFilter);
      const xBtn = $('resSearchClear');
      if (xBtn) xBtn.classList.toggle('hidden', !term);
      paint(state.lists[key].filter(r => {
        if (!resMatch(r, term)) return false;
        for (const k in fvals) {
          if (fvals[k] && String(r[k]) !== String(fvals[k])) return false;
        }
        return true;
      }));
    }
    function paintSuggest() {
      const box = $('resSuggest');
      const inp = $('resSearch');
      if (!box || !inp) return;
      const term = (inp.value || '').trim().toLowerCase();
      if (!term) { box.classList.add('hidden'); box.innerHTML = ''; return; }
      const hits = state.lists[key].filter(r => resMatch(r, term)).slice(0, 6);
      if (!hits.length) {
        box.innerHTML = '<div class="px-4 py-3 text-[12px] text-slate-400 text-center">No match found</div>';
      } else {
        box.innerHTML = hits.map(r => `
          <button type="button" data-sug="${esc(r.id)}" class="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#F1F5FF] text-left">
            <span class="w-7 h-7 rounded-[7px] bg-[#EEF2FF] text-[#1A56FF] flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-magnifying-glass text-[11px]"></i></span>
            <span class="min-w-0 flex-1">
              <span class="block text-[12.5px] font-bold text-[#0F2043] truncate">${esc(resLabel(r))}</span>
              <span class="block text-[10.5px] text-slate-500 truncate">${esc(resSub(r))}</span>
            </span>
          </button>`).join('');
      }
      box.classList.remove('hidden');
      box.querySelectorAll('[data-sug]').forEach(b => b.addEventListener('mousedown', e => {
        e.preventDefault();
        pickSuggest(b.getAttribute('data-sug'));
      }));
    }
    function pickSuggest(id) {
      const item = state.lists[key].find(x => String(x.id) === String(id));
      const inp = $('resSearch'), box = $('resSuggest');
      if (item && inp) inp.value = resLabel(item);
      if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
      applyFilters();
      if (item) {
        const row = document.querySelector('tr[data-rowid="' + String(id).replace(/"/g, '') + '"]');
        if (row) {
          row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          row.classList.add('bg-[#EEF2FF]');
          setTimeout(() => row.classList.remove('bg-[#EEF2FF]'), 1600);
        }
      }
      if (inp) inp.focus();
    }
    $('resSearch').addEventListener('input', () => { applyFilters(); paintSuggest(); });
    $('resSearch').addEventListener('focus', paintSuggest);
    $('resSearch').addEventListener('blur', () => { setTimeout(() => { const b = $('resSuggest'); if (b) b.classList.add('hidden'); }, 150); });
    $('resSearch').addEventListener('keydown', e => {
      if (e.key === 'Escape') { $('resSuggest').classList.add('hidden'); $('resSearch').blur(); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = $('resSuggest').querySelector('[data-sug]');
        if (first && !$('resSuggest').classList.contains('hidden')) pickSuggest(first.getAttribute('data-sug'));
        else $('resSuggest').classList.add('hidden');
      }
    });
    $('resSearchClear').addEventListener('click', () => { $('resSearch').value = ''; $('resSuggest').classList.add('hidden'); applyFilters(); $('resSearch').focus(); });
    document.querySelectorAll('[data-filter]').forEach(s => s.addEventListener('change', applyFilters));
    const resClear = $('resClearFilters');
    if (resClear) resClear.addEventListener('click', function () {
      $('resSearch').value = '';
      const sg = $('resSuggest'); if (sg) { sg.classList.add('hidden'); sg.innerHTML = ''; }
      document.querySelectorAll('[data-filter]').forEach(s => { s.value = ''; });
      applyFilters();
    });

    $('resAdd').addEventListener('click', function () { if (key === 'courses') openCourseWizard(null); else if (key === 'ebooks') openEbookForm(null); else if (key === 'coupons') openCouponForm(null); else openForm(key, null); });
    paint(state.lists[key]);
  }

  /* ---------------- Add / Edit form ---------------- */
  function fieldHtml(f, value) {
    const base = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white';
    const lbl = `<label class="text-[11px] font-bold text-slate-600 uppercase">${esc(f.label)}${f.required ? ' <span class="text-red-500">*</span>' : ''}</label>`;
    const span = f.span ? `sm:col-span-${f.span}` : '';

    if (f.type === 'textarea') {
      return `<div class="${span}">${lbl}<textarea data-field="${f.name}" rows="3" class="${base} mt-1" placeholder="${esc(f.placeholder || '')}">${esc(value || '')}</textarea></div>`;
    }
    if (f.type === 'select') {
      const opts = (f.options ? f.options() : []).map(o =>
        `<option value="${esc(o.value)}" ${String(o.value) === String(value == null ? '' : value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
      return `<div class="${span}">${lbl}<select data-field="${f.name}" class="${base} mt-1" ${f.required ? 'required' : ''}><option value="">-- Select --</option>${opts}</select></div>`;
    }
    if (f.type === 'checkbox') {
      return `<div class="${span} flex items-center gap-2 pt-5">
          <input data-field="${f.name}" type="checkbox" class="w-4 h-4 accent-[#1A56FF]" ${value ? 'checked' : ''}>
          <span class="text-[12.5px] font-semibold text-slate-700">${esc(f.label)}</span>
        </div>`;
    }
    if (f.type === 'batches') {
      // batch target — checkbox list from meta (see openForm fillBatchBox)
      return `<div class="sm:col-span-3">${lbl}<div data-batchbox class="mt-1 bg-[#F8F9FD] rounded-[8px] border border-slate-200 p-3 space-y-1.5 max-h-[180px] overflow-y-auto">
          <p class="text-[12px] text-slate-400 py-2 text-center"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Loading batches...</p>
        </div><p class="text-[10px] text-slate-400 mt-1">Empty = all batches</p></div>`;
    }
    if (f.type === 'categories') {
      // category target — checkbox list from meta (see openForm fillCategoryBox)
      return `<div class="sm:col-span-3">${lbl}<div data-categorybox class="mt-1 bg-[#F8F9FD] rounded-[8px] border border-slate-200 p-3 space-y-1.5 max-h-[180px] overflow-y-auto">
          <p class="text-[12px] text-slate-400 py-2 text-center"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Loading categories...</p>
        </div><p class="text-[10px] text-slate-400 mt-1">Empty = all categories</p></div>`;
    }
    if (f.type === 'courses') {
      // single/multi course target — checkbox list, async load (see openForm)
      return `<div class="sm:col-span-3">${lbl}<div data-coursebox class="mt-1 bg-[#F8F9FD] rounded-[8px] border border-slate-200 p-3 space-y-1.5 max-h-[220px] overflow-y-auto">
          <p class="text-[12px] text-slate-400 py-2 text-center"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Loading courses...</p>
        </div><p class="text-[10px] text-slate-400 mt-1">Empty = all courses</p></div>`;
    }
    if (f.type === 'color') {
      return `<div class="${span}">${lbl}<div class="flex items-center gap-2 mt-1">
          <input data-field="${f.name}" type="color" value="${esc(value || '#1A56FF')}" class="w-10 h-9 rounded border border-slate-200">
          <input data-field="${f.name}_text" type="text" value="${esc(value || '')}" class="${base}" placeholder="#1A56FF">
        </div></div>`;
    }
    if (f.type === 'image') {
      return `<div class="${span}">${lbl}<div class="mt-1 bg-[#F8F9FD] rounded-[8px] border border-slate-200 p-2">
        <div class="flex items-center gap-2">
          <div class="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0">
            ${value ? `<img src="${esc(value)}" class="w-full h-full object-contain p-1">` : `<i class="fa-solid fa-image text-slate-400"></i>`}
          </div>
          <input data-field="${f.name}" type="text" value="${esc(value||'')}" placeholder="${esc(f.placeholder||'Paste URL or upload')}" class="${base} flex-1">
        </div>
        <label class="mt-2 flex items-center justify-center gap-1 px-3 py-1.5 rounded-[8px] bg-[#0F2043] text-white text-[11px] font-bold cursor-pointer hover:bg-[#16294F]">
          <i class="fa-solid fa-upload text-[10px]"></i> Upload Icon
          <input type="file" data-upload="${f.name}" accept="image/*" class="hidden">
        </label>
        <p class="text-[10px] text-slate-400 mt-1">Properly fit - object-contain</p>
      </div></div>`;
    }
    return `<div class="${span}">${lbl}<input data-field="${f.name}" type="${f.type}" value="${esc(value == null ? '' : value)}" ${f.required ? 'required' : ''} placeholder="${esc(f.placeholder || '')}" class="${base} mt-1"></div>`;
  }

  function openForm(key, id) {
    const cfg = RESOURCES[key];
    const item = id ? state.lists[key].find(x => String(x.id) === String(id)) : null;
    const defaults = {
      status: 'active', featured: false, type: key === 'coupons' ? 'percent' : 'web',
      color: key === 'batches' ? '#4F46E5' : '#EDE9FF', for: 'both'
    };
    const data = Object.assign({}, defaults, item || {});

    openModal(`
      <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-[16px] z-10">
        <div>
          <h3 class="text-[16px] font-extrabold text-[#0F2043]">
            <i class="fa-solid ${item ? 'fa-pen' : 'fa-plus'} text-[#1A56FF] mr-1"></i>
            ${item ? 'Edit ' + cfg.singular + ' #' + item.id : cfg.addLabel}
          </h3>
          <p class="text-[11px] text-slate-500">${item ? 'Update the details below' : 'Fill in the details to create a new ' + cfg.singular.toLowerCase()}</p>
        </div>
        <button onclick="closeModal()" class="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="resForm" class="p-6">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          ${cfg.fields.map(f => fieldHtml(f, data[f.name])).join('')}
        </div>
        <p id="formError" class="hidden mt-4 text-[12px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"></p>
        <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
          <button type="button" onclick="closeModal()" class="px-4 py-2.5 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-700">Cancel</button>
          <button type="submit" class="px-5 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]">
            <i class="fa-solid fa-floppy-disk mr-1"></i> ${item ? 'Update' : 'Create'}
          </button>
        </div>
      </form>`);
    // image upload handlers (Batch Icon)
    $('resForm').querySelectorAll('[data-upload]').forEach(inp=>{
      inp.addEventListener('change', function(e){
        const file=e.target.files[0];
        if(!file) return;
        const reader=new FileReader();
        reader.onload=function(ev){
          const dataUrl=ev.target.result;
          const fieldName=inp.dataset.upload;
          const textEl=$('resForm').querySelector('[data-field="'+fieldName+'"]');
          if(textEl) textEl.value=dataUrl;
          const preview=inp.closest('div').previousElementSibling?.querySelector('img') || inp.parentElement.previousElementSibling?.querySelector('img');
          if(preview) preview.src=dataUrl;
          // update preview container
          const container=inp.closest('.bg-\\[\\#F8F9FD\\]');
          if(container){ const imgEl=container.querySelector('img'); if(imgEl) imgEl.src=dataUrl; else { const div=container.querySelector('.rounded-full'); if(div) div.innerHTML='<img src="'+dataUrl+'" class="w-full h-full object-contain p-1">'; } }
          toast('Icon loaded');
        };
        reader.readAsDataURL(file);
      });
    });

    // coupon targeting checkboxes (batch / category / course) — async fill
    (function fillBatchBox() {
      const box = $('resForm').querySelector('[data-batchbox]');
      if (!box) return;
      const sel = (Array.isArray(data.batchIds) ? data.batchIds : []).map(String);
      const list = (state.meta.batches || []).filter(b => (b.status || 'active') === 'active');
      if (!list.length) { box.innerHTML = '<p class="text-[12px] text-slate-400 py-2 text-center">No batches yet</p>'; return; }
      box.innerHTML = list.map(b =>
        `<label class="flex items-center gap-2 bg-white rounded-[8px] border border-slate-100 px-3 py-2 hover:border-[#1A56FF] cursor-pointer">
          <input type="checkbox" data-batch-pick="${esc(b.id)}" ${sel.includes(String(b.id)) ? 'checked' : ''} class="w-4 h-4 accent-[#1A56FF] flex-shrink-0">
          <span class="w-3 h-3 rounded-full flex-shrink-0" style="background:${esc(b.color || '#4F46E5')}"></span>
          <span class="text-[12.5px] font-bold text-[#0F2043] truncate">${esc(b.name)}</span>
        </label>`).join('');
    })();
    (function fillCategoryBox() {
      const box = $('resForm').querySelector('[data-categorybox]');
      if (!box) return;
      const sel = (Array.isArray(data.categoryIds) ? data.categoryIds : []).map(String);
      const list = (state.meta.categories || []).filter(c => (c.status || 'active') === 'active');
      if (!list.length) { box.innerHTML = '<p class="text-[12px] text-slate-400 py-2 text-center">No categories yet</p>'; return; }
      box.innerHTML = list.map(c =>
        `<label class="flex items-center gap-2 bg-white rounded-[8px] border border-slate-100 px-3 py-2 hover:border-[#1A56FF] cursor-pointer">
          <input type="checkbox" data-category-pick="${esc(c.id)}" ${sel.includes(String(c.id)) ? 'checked' : ''} class="w-4 h-4 accent-[#1A56FF] flex-shrink-0">
          <span class="text-[12.5px] font-bold text-[#0F2043] truncate">${esc(c.name)}</span>
        </label>`).join('');
    })();
    (function fillCourseBox() {
      const box = $('resForm').querySelector('[data-coursebox]');
      if (!box) return;
      const sel = (Array.isArray(data.courseIds) ? data.courseIds : []).map(String);
      api('/api/admin/courses?limit=200').then(json => {
        const list = (json.data || []).filter(c => (c.status || 'active') === 'active');
        if (!list.length) { box.innerHTML = '<p class="text-[12px] text-slate-400 py-2 text-center">No courses yet</p>'; return; }
        box.innerHTML = list.map(c =>
          `<label class="flex items-center gap-2 bg-white rounded-[8px] border border-slate-100 px-3 py-2 hover:border-[#1A56FF] cursor-pointer">
            <input type="checkbox" data-course-pick="${esc(c.id)}" ${sel.includes(String(c.id)) ? 'checked' : ''} class="w-4 h-4 accent-[#1A56FF] flex-shrink-0">
            <span class="text-[12.5px] font-bold text-[#0F2043] truncate">${esc(c.title)}</span>
            <span class="ml-auto text-[11px] font-bold text-[#1A56FF] flex-shrink-0">৳${esc(c.price)}</span>
          </label>`).join('');
      }).catch(() => { box.innerHTML = '<p class="text-[12px] text-red-500 py-2 text-center">Could not load courses</p>'; });
    })();

    $('resForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      const payload = {};
      cfg.fields.forEach(f => {
        if (f.type === 'courses' || f.type === 'batches' || f.type === 'categories') return; // alada kore collect hobe
        const el = $('resForm').querySelector('[data-field="' + f.name + '"]');
        if (!el) return;
        if (f.type === 'checkbox') payload[f.name] = el.checked;
        else payload[f.name] = el.value;
      });
      if ($('resForm').querySelector('[data-batchbox]')) {
        payload.batchIds = Array.from($('resForm').querySelectorAll('[data-batch-pick]:checked')).map(el => el.dataset.batchPick);
      }
      if ($('resForm').querySelector('[data-categorybox]')) {
        payload.categoryIds = Array.from($('resForm').querySelectorAll('[data-category-pick]:checked')).map(el => el.dataset.categoryPick);
      }
      if ($('resForm').querySelector('[data-coursebox]')) {
        payload.courseIds = Array.from($('resForm').querySelectorAll('[data-course-pick]:checked')).map(el => el.dataset.coursePick);
      }
      const missing = cfg.fields.filter(f => f.required && !payload[f.name]);
      if (missing.length) {
        const box = $('formError');
        box.textContent = 'Please fill: ' + missing.map(f => f.label).join(', ');
        box.classList.remove('hidden');
        return;
      }
      try {
        await api(item ? cfg.endpoint + '/' + item.id : cfg.endpoint, {
          method: item ? 'PUT' : 'POST',
          body: JSON.stringify(payload)
        });
        closeModal();
        toast(cfg.singular + (item ? ' updated' : ' created'));
        await refreshMeta();
        renderResource(key);
      } catch (err) {
        const box = $('formError');
        box.textContent = err.message;
        box.classList.remove('hidden');
      }
    });
  }

  /* ---------------- Coupon form ----------------
   * Cascading dropdowns: Batch -> Category (filtered by batch courses) -> Courses (filtered).
   * User targeting: multi-select users by search + manual email/phone. Empty = all users. */
  async function openCouponForm(id) {
    const item = id ? ((state.lists.coupons || []).find(x => String(x.id) === String(id)) || null) : null;
    const data = Object.assign({ status: 'active', type: 'percent', code: '', value: '', minOrder: '', maxDiscount: '', usageLimit: '', expiresAt: '' }, item || {});
    const selBatches = new Set((data.batchIds || []).map(String));
    const selCats = new Set((data.categoryIds || []).map(String));
    const selCourses = new Set((data.courseIds || []).map(String));
    const selUsers = new Map();
    const selEmails = new Set((data.allowedEmails || []).map(e => String(e).toLowerCase()));
    const selPhones = new Set((data.allowedPhones || []).map(String));
    const preUserIds = (data.userIds || []).map(String);

    const ddRow = (key, title, icon) => `
      <div class="border border-slate-200 rounded-[10px] overflow-hidden bg-white">
        <button type="button" data-dd-btn="${key}" class="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-left">
          <i class="fa-solid ${icon} text-[#1A56FF] text-[13px]"></i>
          <span class="flex-1 min-w-0">
            <span class="block text-[10px] font-bold text-slate-400 uppercase">${title}</span>
            <span class="block text-[12.5px] font-bold text-[#0F2043] truncate" data-dd-label="${key}">All</span>
          </span>
          <i class="fa-solid fa-chevron-down text-slate-400 text-[11px]"></i>
        </button>
        <div data-dd-panel="${key}" class="hidden border-t border-slate-100">
          <div class="p-2 flex items-center gap-2">
            <input data-dd-search="${key}" placeholder="Search..." class="flex-1 min-w-0 border border-slate-200 rounded-[8px] px-2.5 py-1.5 text-[12px] outline-none focus:border-[#1A56FF]">
            <button type="button" data-dd-clear="${key}" class="text-[11px] font-bold text-slate-400 hover:text-red-600 px-1 flex-shrink-0">Clear</button>
          </div>
          <div data-dd-list="${key}" class="max-h-[190px] overflow-y-auto p-2 pt-0 space-y-1.5">
            <p class="text-[12px] text-slate-400 py-3 text-center"><i class="fa-solid fa-spinner fa-spin mr-1"></i>Loading...</p>
          </div>
        </div>
      </div>`;

    const base = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white';
    const lbl = t => `<label class="text-[11px] font-bold text-slate-600 uppercase">${t}</label>`;

    openModal(`
      <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-[16px] z-10">
        <div>
          <h3 class="text-[16px] font-extrabold text-[#0F2043]">
            <i class="fa-solid ${item ? 'fa-pen' : 'fa-ticket'} text-[#1A56FF] mr-1"></i>
            ${item ? 'Edit Coupon' : 'Create Coupon'}
          </h3>
          <p class="text-[11px] text-slate-500">${item ? 'Update coupon settings' : 'Discount code for students'}</p>
        </div>
        <button onclick="closeModal()" class="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="cpForm" class="p-6 space-y-5">
        <div class="bg-[#F8F9FD] border border-slate-200 rounded-[12px] p-4">
          <h4 class="text-[12px] font-extrabold text-[#0F2043] uppercase tracking-wide mb-3"><i class="fa-solid fa-circle-info text-[#1A56FF] mr-1"></i>Coupon Details</h4>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="col-span-2">${lbl('Coupon Code *')}<input data-cp="code" value="${esc(data.code || '')}" placeholder="SAVE10" class="${base} mt-1 uppercase font-extrabold tracking-wider"></div>
            <div>${lbl('Type')}<select data-cp="type" class="${base} mt-1">
              <option value="percent" ${data.type === 'percent' ? 'selected' : ''}>Percent (%)</option>
              <option value="fixed" ${data.type === 'fixed' ? 'selected' : ''}>Fixed Amount</option>
            </select></div>
            <div>${lbl('Value *')}<input data-cp="value" type="number" min="0" value="${esc(data.value)}" placeholder="10" class="${base} mt-1"></div>
            <div>${lbl('Min Order')}<input data-cp="minOrder" type="number" min="0" value="${esc(data.minOrder)}" placeholder="0" class="${base} mt-1"></div>
            <div>${lbl('Max Discount')}<input data-cp="maxDiscount" type="number" min="0" value="${esc(data.maxDiscount)}" placeholder="0" class="${base} mt-1"></div>
            <div>${lbl('Usage Limit')}<input data-cp="usageLimit" type="number" min="0" value="${esc(data.usageLimit)}" placeholder="0 = unlimited" class="${base} mt-1"></div>
            <div>${lbl('Expiry Date')}<input data-cp="expiresAt" type="date" value="${esc(data.expiresAt || '')}" class="${base} mt-1"></div>
            <div class="col-span-2 sm:col-span-4">${lbl('Status')}<select data-cp="status" class="${base} mt-1 max-w-[220px]">
              <option value="active" ${(data.status || 'active') === 'active' ? 'selected' : ''}>Active</option>
              <option value="inactive" ${data.status === 'inactive' ? 'selected' : ''}>Inactive</option>
            </select></div>
          </div>
        </div>

        <div class="bg-[#F8F9FD] border border-slate-200 rounded-[12px] p-4">
          <h4 class="text-[12px] font-extrabold text-[#0F2043] uppercase tracking-wide"><i class="fa-solid fa-filter text-[#1A56FF] mr-1"></i>Applies To</h4>
          <div id="cpScopeSummary" class="flex flex-wrap gap-1.5 mt-2 mb-3"></div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            ${ddRow('batch', 'Batch', 'fa-layer-group')}
            ${ddRow('category', 'Category', 'fa-tags')}
            ${ddRow('course', 'Course', 'fa-book-open')}
          </div>
          <div id="cpCourseChips" class="flex flex-wrap gap-1.5 mt-3"></div>
        </div>

        <div class="bg-[#FFFBEB] border border-[#FDE68A] rounded-[12px] p-4">
          <div class="flex items-center justify-between">
            <h4 class="text-[12px] font-extrabold text-[#0F2043] uppercase tracking-wide"><i class="fa-solid fa-user-lock text-[#B45309] mr-1"></i>Specific Users <span id="cpUserCount" class="ml-1 px-1.5 py-0.5 rounded-full bg-[#B45309] text-white text-[10px] font-extrabold hidden"></span></h4>
            <button type="button" id="cpUserReset" class="text-[11px] font-bold text-slate-400 hover:text-red-600">Reset</button>
          </div>
          <p class="text-[11px] text-slate-500 mt-1">Empty = all users can use this coupon.</p>
          <div class="relative mt-3">
            <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[12px]"></i>
            <input id="cpUserSearch" placeholder="Search by name, email or phone..." class="w-full bg-white border border-slate-200 rounded-[10px] pl-9 pr-3 py-2.5 text-[13px] outline-none focus:border-[#1A56FF]">
          </div>
          <div id="cpUserResults" class="mt-2 space-y-1.5 max-h-[180px] overflow-y-auto"></div>
          <div id="cpUserChips" class="flex flex-wrap gap-1.5 mt-3"></div>
          <p id="cpUserNote" class="hidden mt-2 text-[11px] font-semibold text-amber-700"></p>
        </div>

        <p id="cpError" class="hidden text-[12px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"></p>
        <div class="flex justify-end gap-2">
          <button type="button" onclick="closeModal()" class="px-4 py-2.5 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-700">Cancel</button>
          <button type="submit" class="px-5 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]">
            <i class="fa-solid fa-floppy-disk mr-1"></i> ${item ? 'Update' : 'Create'}
          </button>
        </div>
      </form>`);

    const form = $('cpForm');
    const inp = n => form.querySelector('[data-cp="' + n + '"]');
    const fail = msg => { const b = $('cpError'); b.textContent = msg; b.classList.remove('hidden'); };

    form.querySelectorAll('[data-dd-btn]').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.ddBtn;
        const panel = form.querySelector('[data-dd-panel="' + k + '"]');
        const willOpen = panel.classList.contains('hidden');
        form.querySelectorAll('[data-dd-panel]').forEach(p => p.classList.add('hidden'));
        if (willOpen) panel.classList.remove('hidden');
      });
    });

    let allCourses = [];
    let allUsers = [];
    let userSearchOK = true;
    try {
      const cj = await api('/api/admin/courses?limit=200');
      allCourses = cj.data || [];
    } catch (e) { allCourses = []; }
    try {
      const uj = await api('/api/admin/users?limit=200');
      allUsers = uj.data || [];
    } catch (e) { userSearchOK = false; }

    const userById = new Map(allUsers.map(u => [String(u.id), u]));
    preUserIds.forEach(uid => {
      const u = userById.get(String(uid));
      selUsers.set(String(uid), u
        ? { id: String(u.id), name: u.name || '', email: u.email || '', phone: u.phone || '' }
        : { id: String(uid), name: 'User #' + uid, email: '', phone: '' });
    });

    const batchList = () => (state.meta.batches || []).slice().sort((a, b) => ((Number(a.order) || 999) - (Number(b.order) || 999)));
    const catList = () => (state.meta.categories || []).slice();
    const batchMap = new Map(batchList().map(b => [String(b.id), b]));
    const catMap = new Map(catList().map(c => [String(c.id), c]));
    const courseMap = new Map(allCourses.map(c => [String(c.id), c]));

    // Categories that have at least one course inside the selected batches
    const catsAvailable = () => {
      if (!selBatches.size) return catList();
      const ids = new Set();
      allCourses.forEach(c => { if (selBatches.has(String(c.batchId))) ids.add(String(c.categoryId)); });
      return catList().filter(c => ids.has(String(c.id)));
    };
    const coursesAvailable = () => allCourses.filter(c =>
      (!selBatches.size || selBatches.has(String(c.batchId))) &&
      (!selCats.size || selCats.has(String(c.categoryId))));

    const checkRow = (pickKey, val, checked, main, sub, color) => `
      <label class="flex items-center gap-2 bg-white rounded-[8px] border border-slate-100 px-3 py-2 hover:border-[#1A56FF] cursor-pointer">
        <input type="checkbox" data-pick="${pickKey}" value="${esc(val)}" ${checked ? 'checked' : ''} class="w-4 h-4 accent-[#1A56FF] flex-shrink-0">
        ${color ? `<span class="w-3 h-3 rounded-full flex-shrink-0" style="background:${esc(color)}"></span>` : ''}
        <span class="min-w-0 flex-1">
          <span class="block text-[12.5px] font-bold text-[#0F2043] truncate">${esc(main)}</span>
          ${sub ? `<span class="block text-[10.5px] text-slate-400 truncate">${esc(sub)}</span>` : ''}
        </span>
      </label>`;

    function paintBatchList(term) {
      const box = form.querySelector('[data-dd-list="batch"]');
      const t = (term || '').toLowerCase();
      const list = batchList().filter(b => !t || (b.name || '').toLowerCase().includes(t));
      box.innerHTML = list.length ? list.map(b =>
        checkRow('batch', b.id, selBatches.has(String(b.id)), b.name, null, b.color || '#4F46E5')).join('')
        : '<p class="text-[12px] text-slate-400 py-3 text-center">No batches found</p>';
    }
    function paintCatList(term) {
      const box = form.querySelector('[data-dd-list="category"]');
      const t = (term || '').toLowerCase();
      const avail = catsAvailable();
      const availIds = new Set(avail.map(c => String(c.id)));
      const list = avail.filter(c => !t || (c.name || '').toLowerCase().includes(t));
      let html = '';
      if (selBatches.size) html += `<p class="text-[10.5px] font-bold text-[#4F46E5] px-1">${avail.length} categor${avail.length === 1 ? 'y' : 'ies'} in selected batches</p>`;
      html += list.length ? list.map(c => {
        const n = allCourses.filter(x => String(x.categoryId) === String(c.id) && (!selBatches.size || selBatches.has(String(x.batchId)))).length;
        return checkRow('category', c.id, selCats.has(String(c.id)), c.name, n + (n === 1 ? ' course' : ' courses'), null);
      }).join('') : '<p class="text-[12px] text-slate-400 py-3 text-center">No categories found</p>';
      // keep selected-but-unavailable visible so nothing is lost silently
      const missing = [...selCats].filter(id => !availIds.has(id) && catMap.has(id));
      if (missing.length) html += '<p class="text-[10.5px] font-bold text-slate-400 px-1 pt-1">Selected elsewhere</p>' +
        missing.map(id => checkRow('category', id, true, catMap.get(id).name, 'Outside selected batches', null)).join('');
      box.innerHTML = html;
    }
    function paintCourseList(term) {
      const box = form.querySelector('[data-dd-list="course"]');
      const t = (term || '').toLowerCase();
      const avail = coursesAvailable();
      const list = avail.filter(c => !t || (c.title || '').toLowerCase().includes(t)).slice(0, 100);
      let html = `<p class="text-[10.5px] font-bold text-[#4F46E5] px-1">${avail.length} course${avail.length === 1 ? '' : 's'} match filters</p>`;
      html += list.length ? list.map(c => {
        const b = batchMap.get(String(c.batchId));
        return checkRow('course', c.id, selCourses.has(String(c.id)), c.title,
          (b ? b.name + ' • ' : '') + cur(c.price), null);
      }).join('') : '<p class="text-[12px] text-slate-400 py-3 text-center">No courses found</p>';
      const missing = [...selCourses].filter(id => !avail.some(c => String(c.id) === id) && courseMap.has(id));
      if (missing.length) html += '<p class="text-[10.5px] font-bold text-slate-400 px-1 pt-1">Selected elsewhere</p>' +
        missing.map(id => checkRow('course', id, true, courseMap.get(id).title, 'Outside current filters', null)).join('');
      box.innerHTML = html;
    }

    function paintLabels() {
      const set = (k, txt) => { form.querySelector('[data-dd-label="' + k + '"]').textContent = txt; };
      set('batch', selBatches.size ? selBatches.size + (selBatches.size > 1 ? ' Batches' : ' Batch') : 'All Batches');
      set('category', selCats.size ? selCats.size + (selCats.size > 1 ? ' Categories' : ' Category') : 'All Categories');
      set('course', selCourses.size ? selCourses.size + (selCourses.size > 1 ? ' Courses' : ' Course') : 'All Courses');
    }
    function paintSummary() {
      const box = $('cpScopeSummary');
      if (!selBatches.size && !selCats.size && !selCourses.size) {
        box.innerHTML = '<span class="px-2 py-0.5 rounded-full bg-[#EDE9FF] text-[#4F46E5] text-[11px] font-bold">All Courses</span>';
        return;
      }
      const pills = [];
      if (selBatches.size) pills.push(selBatches.size + (selBatches.size > 1 ? ' Batches' : ' Batch'));
      if (selCats.size) pills.push(selCats.size + (selCats.size > 1 ? ' Categories' : ' Category'));
      if (selCourses.size) pills.push(selCourses.size + (selCourses.size > 1 ? ' Courses' : ' Course'));
      const cover = selCourses.size ? selCourses.size : coursesAvailable().length;
      box.innerHTML = pills.map(p => `<span class="px-2 py-0.5 rounded-full bg-[#E6F4EA] text-[#16A34A] text-[11px] font-bold">${esc(p)}</span>`).join('') +
        `<span class="px-2 py-0.5 rounded-full bg-[#E6F0FF] text-[#1A56FF] text-[11px] font-bold">Covers ~${cover} course${cover === 1 ? '' : 's'}</span>`;
    }
    function paintCourseChips() {
      const box = $('cpCourseChips');
      if (!selCourses.size) { box.innerHTML = ''; return; }
      box.innerHTML = [...selCourses].map(id => {
        const c = courseMap.get(id);
        return `<span class="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-full bg-white border border-slate-200 text-[11px] font-bold text-[#0F2043] max-w-[220px]">
          <span class="truncate">${esc(c ? c.title : 'Course #' + id)}</span>
          <button type="button" data-unchip-course="${esc(id)}" class="w-4 h-4 rounded-full bg-slate-100 hover:bg-red-100 hover:text-red-600 flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-xmark text-[8px]"></i></button>
        </span>`;
      }).join('');
    }
    function paintAll() {
      paintBatchList(form.querySelector('[data-dd-search="batch"]').value);
      paintCatList(form.querySelector('[data-dd-search="category"]').value);
      paintCourseList(form.querySelector('[data-dd-search="course"]').value);
      paintLabels(); paintSummary(); paintCourseChips();
    }

    form.addEventListener('change', e => {
      const pick = e.target.closest('[data-pick]');
      if (!pick) return;
      const id = String(pick.value);
      if (pick.dataset.pick === 'batch') {
        pick.checked ? selBatches.add(id) : selBatches.delete(id);
        const availCatIds = new Set(catsAvailable().map(c => String(c.id)));
        [...selCats].forEach(cid => { if (!availCatIds.has(cid)) selCats.delete(cid); });
        const availCourseIds = new Set(coursesAvailable().map(c => String(c.id)));
        [...selCourses].forEach(cid => { if (!availCourseIds.has(cid)) selCourses.delete(cid); });
      } else if (pick.dataset.pick === 'category') {
        pick.checked ? selCats.add(id) : selCats.delete(id);
        const availCourseIds = new Set(coursesAvailable().map(c => String(c.id)));
        [...selCourses].forEach(cid => { if (!availCourseIds.has(cid)) selCourses.delete(cid); });
      } else if (pick.dataset.pick === 'course') {
        pick.checked ? selCourses.add(id) : selCourses.delete(id);
      }
      paintAll();
    });
    // search inside dropdowns
    ['batch', 'category', 'course'].forEach(k => {
      form.querySelector('[data-dd-search="' + k + '"]').addEventListener('input', e => {
        const v = e.target.value;
        if (k === 'batch') paintBatchList(v);
        else if (k === 'category') paintCatList(v);
        else paintCourseList(v);
      });
      form.querySelector('[data-dd-clear="' + k + '"]').addEventListener('click', () => {
        if (k === 'batch') selBatches.clear();
        else if (k === 'category') selCats.clear();
        else selCourses.clear();
        form.querySelector('[data-dd-search="' + k + '"]').value = '';
        paintAll();
      });
    });
    form.addEventListener('click', e => {
      const un = e.target.closest('[data-unchip-course]');
      if (un) { selCourses.delete(String(un.dataset.unchipCourse)); paintAll(); }
    });

    /* ---------- users ---------- */
    const userLine = u => [u.name, u.email, u.phone].filter(Boolean).join(' • ');
    function paintUserChips() {
      const box = $('cpUserChips');
      const total = selUsers.size + selEmails.size + selPhones.size;
      const cnt = $('cpUserCount');
      cnt.textContent = total + (total > 1 ? ' selected' : ' selected');
      cnt.classList.toggle('hidden', !total);
      let html = '';
      selUsers.forEach(u => {
        html += `<span class="inline-flex items-center gap-1.5 pl-1 pr-1 py-0.5 rounded-full bg-white border border-[#FDE68A] text-[11px] font-bold text-[#0F2043] max-w-[240px]">
          <span class="w-5 h-5 rounded-full bg-[#EDE9FF] text-[#4F46E5] text-[10px] font-extrabold flex items-center justify-center flex-shrink-0">${esc((u.name || 'U').charAt(0).toUpperCase())}</span>
          <span class="truncate">${esc(u.name || u.email || u.phone || ('User #' + u.id))}</span>
          <button type="button" data-unuser="${esc(u.id)}" class="w-4 h-4 rounded-full bg-slate-100 hover:bg-red-100 hover:text-red-600 flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-xmark text-[8px]"></i></button>
        </span>`;
      });
      selEmails.forEach(em => {
        html += `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#E6F0FF] text-[#1A56FF] text-[11px] font-bold max-w-[240px]">
          <i class="fa-solid fa-envelope text-[10px]"></i><span class="truncate">${esc(em)}</span>
          <button type="button" data-unemail="${esc(em)}" class="w-4 h-4 rounded-full bg-white/60 hover:bg-red-100 hover:text-red-600 flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-xmark text-[8px]"></i></button>
        </span>`;
      });
      selPhones.forEach(ph => {
        html += `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#E6F4EA] text-[#16A34A] text-[11px] font-bold">
          <i class="fa-solid fa-phone text-[10px]"></i>${esc(ph)}
          <button type="button" data-unphone="${esc(ph)}" class="w-4 h-4 rounded-full bg-white/60 hover:bg-red-100 hover:text-red-600 flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-xmark text-[8px]"></i></button>
        </span>`;
      });
      box.innerHTML = html || '<p class="text-[11px] text-slate-400">All users can use this coupon.</p>';
    }
    function paintUserResults(term) {
      const box = $('cpUserResults');
      const t = (term || '').trim().toLowerCase();
      if (!t) { box.innerHTML = ''; return; }
      const hits = allUsers.filter(u => !selUsers.has(String(u.id)) &&
        ((u.name || '') + ' ' + (u.email || '') + ' ' + (u.phone || '')).toLowerCase().includes(t)).slice(0, 8);
      box.innerHTML = hits.length ? hits.map(u => `
        <div class="flex items-center gap-2 bg-white border border-slate-200 rounded-[10px] px-3 py-2">
          <span class="w-7 h-7 rounded-full bg-[#EDE9FF] text-[#4F46E5] text-[11px] font-extrabold flex items-center justify-center flex-shrink-0">${esc((u.name || 'U').charAt(0).toUpperCase())}</span>
          <span class="flex-1 min-w-0">
            <span class="block text-[12.5px] font-bold text-[#0F2043] truncate">${esc(u.name || 'No name')}</span>
            <span class="block text-[10.5px] text-slate-400 truncate">${esc([u.email, u.phone].filter(Boolean).join(' • ') || 'No contact')}</span>
          </span>
          <button type="button" data-adduser="${esc(u.id)}" class="px-3 py-1.5 rounded-[8px] bg-[#1A56FF] text-white text-[11px] font-bold flex-shrink-0">Add</button>
        </div>`).join('')
        : '<p class="text-[11.5px] text-slate-400 py-2 text-center">No users found.</p>';
    }
    if (!userSearchOK) {
      $('cpUserSearch').disabled = true;
      $('cpUserSearch').placeholder = 'User search unavailable';
      const note = $('cpUserNote');
      note.textContent = 'User search needs Users permission.';
      note.classList.remove('hidden');
    }
    $('cpUserSearch').addEventListener('input', e => paintUserResults(e.target.value));
    form.addEventListener('click', e => {
      const add = e.target.closest('[data-adduser]');
      if (add) {
        const u = userById.get(String(add.dataset.adduser));
        if (u) selUsers.set(String(u.id), { id: String(u.id), name: u.name || '', email: u.email || '', phone: u.phone || '' });
        $('cpUserSearch').value = '';
        paintUserResults(''); paintUserChips();
        return;
      }
      const un = e.target.closest('[data-unuser]');
      if (un) { selUsers.delete(String(un.dataset.unuser)); paintUserChips(); return; }
      const ue = e.target.closest('[data-unemail]');
      if (ue) { selEmails.delete(String(ue.dataset.unemail)); paintUserChips(); return; }
      const up = e.target.closest('[data-unphone]');
      if (up) { selPhones.delete(String(up.dataset.unphone)); paintUserChips(); return; }
    });
    $('cpUserReset').addEventListener('click', () => {
      selUsers.clear(); selEmails.clear(); selPhones.clear();
      $('cpUserSearch').value = ''; paintUserResults(''); paintUserChips();
    });

    paintAll();
    paintUserChips();

    form.addEventListener('submit', async e => {
      e.preventDefault();
      $('cpError').classList.add('hidden');
      const code = inp('code').value.trim().toUpperCase();
      const value = Number(inp('value').value);
      if (!code) { fail('Coupon code is required'); return; }
      if (!(value > 0)) { fail('Discount value must be greater than 0'); return; }
      const payload = {
        code, type: inp('type').value, value,
        minOrder: Number(inp('minOrder').value) || 0,
        maxDiscount: Number(inp('maxDiscount').value) || 0,
        usageLimit: Number(inp('usageLimit').value) || 0,
        expiresAt: inp('expiresAt').value || '',
        status: inp('status').value,
        batchIds: [...selBatches], categoryIds: [...selCats], courseIds: [...selCourses],
        userIds: [...selUsers.keys()], allowedEmails: [...selEmails], allowedPhones: [...selPhones]
      };
      try {
        await api(item ? '/api/admin/coupons/' + item.id : '/api/admin/coupons', {
          method: item ? 'PUT' : 'POST',
          body: JSON.stringify(payload)
        });
        closeModal();
        toast('Coupon ' + (item ? 'updated' : 'created'));
        renderResource('coupons');
      } catch (err) { fail(err.message); }
    });
  }

  /* ---------------- Course wizard (3 steps) ----------------
   * Step 1: Basic Info | Step 2: Thumbnail + Description + Links | Step 3: Classes
   * YouTube links are converted to videoIds; raw links never leave this panel. */
  function wizYtId(s) {
    s = String(s || '').trim();
    if (!s) return '';
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    let m = s.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
  }

  /* ---------- Duplicate course (Copy-Paste with classes) ----------
   * Akei course onno batch/category-te nite chaile notun kore class upload
   * korte hobe na — sob class copy hoye jabe. */
  function openCourseDuplicate(id) {
    const src = state.lists.courses.find(x => String(x.id) === String(id));
    if (!src) { toast('Course not found', false); return; }
    const base = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white';
    const lbl = t => `<label class="text-[11px] font-bold text-slate-600 uppercase">${t}</label>`;
    const opts = (list, val) => `<option value="">-- Same as original --</option>` + list.map(o =>
      `<option value="${esc(o.value)}" ${String(o.value) === String(val) ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
    openModal(`
      <div class="px-5 sm:px-6 py-4 border-b border-slate-100">
        <h3 class="text-[15px] sm:text-[16px] font-extrabold text-[#0F2043]">
          <i class="fa-solid fa-copy text-[#16A34A] mr-1"></i> Duplicate Course
        </h3>
      </div>
      <div class="p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="sm:col-span-2">${lbl('New Course Title')}<input id="dTitle" value="${esc(src.title)}" class="${base} mt-1"></div>
        <div>${lbl('Target Batch')}<select id="dBatch" class="${base} mt-1">${opts(REL.batch(), src.batchId)}</select></div>
        <div>${lbl('Target Category')}<select id="dCategory" class="${base} mt-1">${opts(REL.courseCategory(), src.categoryId)}</select></div>
        <p id="dupError" class="hidden sm:col-span-2 text-[12px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"></p>
      </div>
      <div class="flex justify-end gap-2 px-5 sm:px-6 py-4 border-t border-slate-100">
        <button id="dupCancel" class="px-4 py-2.5 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-700">Cancel</button>
        <button id="dupGo" class="px-5 py-2.5 rounded-[10px] bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-[13px]"><i class="fa-solid fa-copy mr-1"></i> Duplicate</button>
      </div>`);
    $('dupCancel').addEventListener('click', closeModal);
    $('dupGo').addEventListener('click', async function () {
      const errBox = $('dupError');
      const btn = $('dupGo');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Copying...';
      try {
        const json = await api('/api/admin/courses/' + id + '/duplicate', {
          method: 'POST',
          body: JSON.stringify({
            title: $('dTitle').value.trim(),
            batchId: $('dBatch').value,
            categoryId: $('dCategory').value
          })
        });
        closeModal();
        toast(json.message || 'Course duplicated');
        await refreshMeta();
        renderResource('courses');
      } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-copy mr-1"></i> Duplicate';
      }
    });
  }

  async function openCourseWizard(id) {
    const existing = id ? state.lists.courses.find(x => String(x.id) === String(id)) : null;
    const wiz = {
      id: existing ? existing.id : null,
      step: 1,
      saving: false,
      course: Object.assign({
        title: '', teacher: '', batchId: '', categoryId: '', platformId: '', groupId: '', subjectId: '',
        price: '', oldPrice: '', duration: '', totalClass: '',
        thumbnail: '', description: '', telegramLink: '', telegramLinks: [], telegramChatIds: [], previewYoutube: '',
        features: '', tags: '', bannerColor: '#5745f7',
        featured: false, status: 'active'
      }, existing || {}),
      lessons: [],
      removedLessonIds: []
    };
    // map stored previewVideoId back to a watch url for editing
    if (wiz.course.previewVideoId && !wiz.course.previewYoutube) {
      wiz.course.previewYoutube = 'https://www.youtube.com/watch?v=' + wiz.course.previewVideoId;
    }
    // backward compat: purono single telegramLink thakle multi list-e naw (error-proof)
    if (!Array.isArray(wiz.course.telegramLinks)) wiz.course.telegramLinks = [];
    if (!Array.isArray(wiz.course.telegramChatIds)) wiz.course.telegramChatIds = [];
    if (!wiz.course.telegramLinks.length && wiz.course.telegramLink) {
      wiz.course.telegramLinks = [{ label: 'Main Channel', url: wiz.course.telegramLink }];
    }
    if (wiz.id) {
      try {
        const json = await api('/api/admin/courses/' + wiz.id + '/lessons');
        wiz.lessons = (json.data || []).map(l => ({
          lid: l.id, subject: l.subject || '', subjectId: l.subjectId || '', subsection: l.subsection || '', section: l.section || l.chapter || '', chapter: l.chapter || l.section || '', title: l.title || '',
          youtube: '', hasVideo: !!(l.videoId || l.videoUrl),
          src: l.videoUrl ? 'upload' : 'youtube',
          videoUrl: l.videoUrl || '', videoName: l.videoName || '', videoSize: Number(l.videoSize) || 0,
          _file: null, _fileName: '', _fileSize: 0,
          duration: l.duration || '', isFree: !!l.isFree,
          resources: Array.isArray(l.resources) ? l.resources.filter(r=> r && (r.label || r.url)).map(r=> ({ label: String(r.label||''), url: String(r.url||'') })) : []
        }));
      } catch (e) { wiz.lessons = []; }
    }
    paintWiz();

    function stepPills() {
      const steps = [
        { n: 1, label: 'Basic Info', icon: 'fa-circle-info' },
        { n: 2, label: 'Media & Details', icon: 'fa-photo-film' },
        { n: 3, label: 'Classes', icon: 'fa-circle-play' }
      ];
      return `<div class="flex items-center gap-1 sm:gap-2">` + steps.map((s, i) => `
        ${i ? '<div class="flex-1 h-[2px] rounded ' + (wiz.step > s.n - 1 ? 'bg-[#1A56FF]' : 'bg-slate-200') + '"></div>' : ''}
        <div class="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] sm:text-[12px] font-bold whitespace-nowrap
          ${wiz.step === s.n ? 'bg-[#1A56FF] text-white shadow' : wiz.step > s.n ? 'bg-[#E6F4EA] text-[#16A34A]' : 'bg-slate-100 text-slate-500'}">
          <i class="fa-solid ${wiz.step > s.n ? 'fa-check' : s.icon}"></i><span class="hidden sm:inline">${s.label}</span><span class="sm:hidden">${s.n}</span>
        </div>`).join('') + `</div>`;
    }

    function selOpts(list, val) {
      return `<option value="">-- Select --</option>` + list.map(o =>
        `<option value="${esc(o.value)}" ${String(o.value) === String(val == null ? '' : val) ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
    }

    function stepBody() {
      const c = wiz.course;
      const base = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white';
      const lbl = t => `<label class="text-[11px] font-bold text-slate-600 uppercase">${t}</label>`;
      if (wiz.step === 1) {
        return `<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="sm:col-span-2">${lbl('Course Title <span class="text-red-500">*</span>')}<input id="wTitle" value="${esc(c.title)}" placeholder="HSC 27 Physics Academic Cycle 01" class="${base} mt-1"></div>
          <div>${lbl('Teacher Name')}<input id="wTeacher" value="${esc(c.teacher)}" placeholder="Apurbo Sir" class="${base} mt-1"></div>
          <div>${lbl('Duration')}<input id="wDuration" value="${esc(c.duration)}" placeholder="3 Months" class="${base} mt-1"></div>
          <div>${lbl('Batch <span class="text-red-500">*</span>')}<select id="wBatch" class="${base} mt-1">${selOpts(REL.batch(), c.batchId)}</select></div>
          <div>${lbl('Category <span class="text-slate-400 normal-case font-semibold">(optional)</span>')}<select id="wCategory" class="${base} mt-1">${selOpts(REL.courseCategory(), c.categoryId)}</select></div>
          <div>${lbl('Platform')}<select id="wPlatform" class="${base} mt-1">${selOpts(REL.platform(), c.platformId)}</select></div>
          <div>${lbl('Group')}<select id="wGroup" class="${base} mt-1">${selOpts(REL.group(), c.groupId)}</select></div>
          <div>${lbl('Section (Subject)')}<select id="wSubject" class="${base} mt-1">${selOpts(REL.subject(), c.subjectId)}</select></div>
          <div>${lbl('Status')}<select id="wStatus" class="${base} mt-1">${selOpts(REL.status(), c.status)}</select></div>
          <div>${lbl('Price (৳)')}<input id="wPrice" type="number" min="0" value="${esc(c.price)}" placeholder="500" class="${base} mt-1"></div>
          <div>${lbl('Old Price (৳)')}<input id="wOldPrice" type="number" min="0" value="${esc(c.oldPrice)}" placeholder="1000" class="${base} mt-1"></div>
          <div>${lbl('Total Class')}<input id="wTotalClass" type="number" min="0" value="${esc(c.totalClass)}" placeholder="36" class="${base} mt-1"></div>
          <div class="flex items-center gap-2 pt-5">
            <input id="wFeatured" type="checkbox" class="w-4 h-4 accent-[#1A56FF]" ${c.featured ? 'checked' : ''}>
            <span class="text-[12.5px] font-semibold text-slate-700">Show as Featured on homepage</span>
          </div>
        </div>`;
      }
      if (wiz.step === 2) {
        return `<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="sm:col-span-2">${lbl('Course Thumbnail / Image')}
            <div class="mt-1 bg-[#F8F9FD] rounded-[10px] border border-slate-200 p-3">
              <div class="aspect-[16/9] rounded-[8px] bg-white border border-slate-200 overflow-hidden flex items-center justify-center">
                ${c.thumbnail ? `<img id="wThumbPrev" src="${esc(c.thumbnail)}" class="w-full h-full object-contain">` : `<div id="wThumbPrev" class="text-center text-slate-400"><i class="fa-solid fa-image text-[26px]"></i><p class="text-[11px] font-semibold mt-1">No image yet</p></div>`}
              </div>
              <div class="flex gap-2 mt-2">
                <input id="wThumb" value="${esc(c.thumbnail)}" placeholder="Paste image URL or upload" class="${base} flex-1">
                <label class="px-3 py-2 rounded-[8px] bg-[#0F2043] text-white text-[12px] font-bold cursor-pointer hover:bg-[#16294F] flex items-center gap-1 whitespace-nowrap">
                  <i class="fa-solid fa-upload text-[11px]"></i> Upload
                  <input id="wThumbFile" type="file" accept="image/*" class="hidden">
                </label>
              </div>
              <p class="text-[10px] text-slate-400 mt-1">JPG/PNG — any size. Saved inside the course.</p>
            </div>
          </div>
          <div class="sm:col-span-2">${lbl('Description (কোর্সের বিবরণ)')}<textarea id="wDesc" rows="4" placeholder="What will students learn in this course?" class="${base} mt-1">${esc(c.description)}</textarea></div>
          <div class="sm:col-span-2">${lbl('এই কোর্সে আপনি পাচ্ছেন (one per line)')}<textarea id="wFeatures" rows="4" placeholder="অভিজ্ঞ শিক্ষক দ্বারা ৪০ টি তথ্যবহুল ক্লাস&#10;নিয়মিত পরীক্ষা ও মডেল টেস্ট&#10;সার্বক্ষণিক Q&A সার্ভিস" class="${base} mt-1">${esc(c.features || '')}</textarea></div>
          <div class="sm:col-span-2">${lbl('Tags (comma separated)')}<input id="wTags" value="${esc(c.tags || '')}" placeholder="Offline & Online, Bangla" class="${base} mt-1"></div>
          <div class="sm:col-span-2">${lbl('Title Banner Color')}
            <div class="flex items-center gap-2 mt-1">
              <input id="wBannerColor" type="color" value="${esc(c.bannerColor || '#5745f7')}" class="w-10 h-9 rounded border border-slate-200">
              <input id="wBannerColorText" type="text" value="${esc(c.bannerColor || '#5745f7')}" class="${base}" placeholder="#5745f7">
            </div>
          </div>
          <div class="sm:col-span-2">
            ${lbl('Telegram Channels')}
            <div id="tgLinksBox" class="space-y-2 mt-1">
              ${(Array.isArray(c.telegramLinks) && c.telegramLinks.length ? c.telegramLinks : [{ label: '', url: '' }]).map((x, i) => `
                <div class="flex gap-2" data-tg-link-row="${i}">
                  <input data-tg-link-label value="${esc(x.label || '')}" placeholder="Label (e.g. Main Channel)" class="${base} w-[38%]">
                  <input data-tg-link-url value="${esc(x.url || '')}" placeholder="https://t.me/+xxxx" class="${base} flex-1">
                  <button type="button" data-tg-link-rm="${i}" class="w-9 rounded-[8px] bg-red-50 text-red-600 hover:bg-red-100 flex-shrink-0" title="Remove"><i class="fa-solid fa-trash text-[11px]"></i></button>
                </div>`).join('')}
            </div>
            <button type="button" id="wAddTgLink" class="mt-2 px-3 py-1.5 rounded-[8px] bg-[#E6F0FF] text-[#1A56FF] font-bold text-[12px] hover:bg-[#DDE8FF]"><i class="fa-solid fa-plus mr-1"></i> Add Channel Link</button>
          </div>
          <div class="sm:col-span-2">
            ${lbl('Telegram Group / Channel ID')}
            <div id="tgIdsBox" class="space-y-2 mt-1">
              ${(Array.isArray(c.telegramChatIds) && c.telegramChatIds.length ? c.telegramChatIds : []).map((x, i) => `
                <div class="flex gap-2" data-tg-id-row="${i}">
                  <input data-tg-id-label value="${esc(x.label || '')}" placeholder="Label (e.g. Batch Group)" class="${base} w-[38%]">
                  <input data-tg-id-val value="${esc(x.chatId || '')}" placeholder="-100xxxxxxxxxx" class="${base} flex-1">
                  <button type="button" data-tg-id-rm="${i}" class="w-9 rounded-[8px] bg-red-50 text-red-600 hover:bg-red-100 flex-shrink-0" title="Remove"><i class="fa-solid fa-trash text-[11px]"></i></button>
                </div>`).join('')}
            </div>
            <button type="button" id="wAddTgId" class="mt-2 px-3 py-1.5 rounded-[8px] bg-[#E6F4EA] text-[#16A34A] font-bold text-[12px] hover:bg-[#D3EBD8]"><i class="fa-solid fa-plus mr-1"></i> Add Group / Channel ID</button>
          </div>
        </div>`;
      }
      // step 3: hierarchical Section -> Chapter -> Lecture
      function esc2(s){ return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
      function treeFromLessons(list){
        const map={}; const order=[];
        (list||[]).forEach(l=>{
          const subj = (l.subject && String(l.subject).trim()) ? String(l.subject).trim() : ((l.subjectId && REL.subject().find(x=>String(x.value)===String(l.subjectId)))? REL.subject().find(x=>String(x.value)===String(l.subjectId)).label : 'General');
          const sid = l.subjectId || (REL.subject().find(x=>x.label===subj)? REL.subject().find(x=>x.label===subj).value : '');
          const chap = l.section || l.chapter || 'Chapter 1';
          if(!map[subj]){ map[subj]={ name: subj, subjectId: sid, chapters:{} , cOrder:[] }; order.push(subj); }
          if(!map[subj].chapters[chap]){ map[subj].chapters[chap]={ name: chap, lessons:[] }; map[subj].cOrder.push(chap); }
          map[subj].chapters[chap].lessons.push(l);
        });
        return order.map(sname=>{
          const s=map[sname];
          return { name:s.name, subjectId:s.subjectId, chapters: s.cOrder.map(cname=>({ name:cname, lessons: s.chapters[cname].lessons }) ) };
        });
      }
      const tree = treeFromLessons(wiz.lessons);
      function subjectBlock(s, si){
        return `<div class="border-2 border-slate-200 rounded-[12px] bg-white overflow-hidden" data-subj="${si}">
          <div class="flex items-center gap-2 px-3 py-2.5 bg-[#F8F9FD] border-b border-slate-200">
            <span class="w-8 h-8 rounded-[8px] bg-[#1A56FF] text-white flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-folder text-[14px]"></i></span>
            <input data-subj-name="${si}" value="${esc2(s.name)}" placeholder="Section name (e.g. Physics)" class="flex-1 border border-slate-200 rounded-[8px] px-2.5 py-1.5 text-[13px] font-bold outline-none focus:border-[#1A56FF] bg-white">
            <button type="button" data-subj-up="${si}" class="w-8 h-8 rounded-[8px] bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 ${si===0?'opacity-30 pointer-events-none':''}" title="Up"><i class="fa-solid fa-chevron-up text-[11px]"></i></button>
            <button type="button" data-subj-down="${si}" class="w-8 h-8 rounded-[8px] bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 ${si===tree.length-1?'opacity-30 pointer-events-none':''}" title="Down"><i class="fa-solid fa-chevron-down text-[11px]"></i></button>
            <button type="button" data-subj-del="${si}" class="w-8 h-8 rounded-[8px] bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center" title="Delete section"><i class="fa-solid fa-trash text-[11px]"></i></button>
          </div>
          <div class="p-3 space-y-3 bg-[#FBFCFE]">
            ${s.chapters.map((c, ci)=> chapterBlock(c, si, ci, s)).join('') || '<p class="text-[11px] text-slate-400 text-center py-3 border border-dashed rounded-[8px]">No chapters yet — Add Chapter</p>'}
            <button type="button" data-add-chap="${si}" class="w-full py-2 rounded-[8px] border border-dashed border-[#1A56FF]/30 bg-[#EEF2FF] text-[#1A56FF] font-bold text-[12px] hover:bg-[#E0E8FF]"><i class="fa-solid fa-plus mr-1"></i> Add Chapter</button>
          </div>
          <div class="px-3 py-2 bg-white border-t border-slate-100 text-[11px] text-slate-500"><span class="font-bold text-[#0F2043]">${s.chapters.reduce((a,c)=>a+c.lessons.length,0)}</span> lectures • <span class="font-bold text-[#0F2043]">${s.chapters.length}</span> chapters</div>
        </div>`;
      }
      function chapterBlock(c, si, ci, s){
        return `<div class="border border-slate-200 rounded-[10px] bg-white overflow-hidden" data-chap="${si}-${ci}">
          <div class="flex items-center gap-2 px-3 py-2 bg-[#FFFBEB] border-b border-slate-200">
            <span class="w-7 h-7 rounded-[7px] bg-[#F59E0B] text-white flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-book-open text-[12px]"></i></span>
            <input data-chap-name="${si}-${ci}" value="${esc2(c.name)}" placeholder="Chapter name (e.g. ভৌতজগত)" class="flex-1 border border-slate-200 rounded-[7px] px-2.5 py-1.5 text-[12.5px] font-semibold outline-none focus:border-[#1A56FF] bg-white">
            <button type="button" data-chap-up="${si}-${ci}" class="w-7 h-7 rounded-[7px] bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 ${ci===0?'opacity-30 pointer-events-none':''}" title="Up"><i class="fa-solid fa-chevron-up text-[10px]"></i></button>
            <button type="button" data-chap-down="${si}-${ci}" class="w-7 h-7 rounded-[7px] bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 ${ci===s.chapters.length-1?'opacity-30 pointer-events-none':''}" title="Down"><i class="fa-solid fa-chevron-down text-[10px]"></i></button>
            <button type="button" data-chap-del="${si}-${ci}" class="w-7 h-7 rounded-[7px] bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center" title="Delete chapter"><i class="fa-solid fa-trash text-[10px]"></i></button>
          </div>
          <div class="p-2.5 space-y-2.5">
            ${c.lessons.map((l, li)=> lectureCard(l, si, ci, li, c)).join('') || '<p class="text-[11px] text-slate-400 text-center py-2">No lectures</p>'}
            <button type="button" data-add-lect="${si}-${ci}" class="w-full py-1.5 rounded-[7px] border border-dashed border-slate-300 bg-slate-50 text-slate-600 font-semibold text-[11px] hover:bg-slate-100"><i class="fa-solid fa-plus mr-1"></i> Add Lecture</button>
          </div>
          <div class="px-3 py-1.5 bg-[#F8F9FD] text-[10px] text-slate-500">${c.lessons.length} lectures</div>
        </div>`;
      }
      function lectureCard(l, si, ci, li, c){
        const src = l.src || 'youtube';
        const tIdx = l._treeIdx!=null?l._treeIdx:'';
        const videoBadge = l.videoUrl
          ? `<div class="sm:col-span-2 flex items-center gap-2 bg-[#E6F4EA] border border-[#C8E9D5] rounded-[8px] px-3 py-2"><i class="fa-solid fa-file-video text-[#16A34A]"></i><span class="text-[12px] font-bold text-[#0F2043] truncate flex-1">${esc2(l.videoName || 'Uploaded video')}${l.videoSize ? ' • ' + fmtMB(l.videoSize) : ''}</span><button type="button" data-up-rm="${tIdx}" class="text-[11px] font-bold text-red-600 hover:underline flex-shrink-0">Remove</button></div>`
          : (l._file ? `<div class="sm:col-span-2 flex items-center gap-2 bg-[#E6F0FF] border border-[#BFDBFE] rounded-[8px] px-3 py-2"><i class="fa-solid fa-circle-check text-[#1A56FF]"></i><span class="text-[12px] font-bold text-[#0F2043] truncate flex-1">Ready: ${esc2(l._fileName)}${l._fileSize ? ' • ' + fmtMB(l._fileSize) : ''}</span><button type="button" data-up-rm="${tIdx}" class="text-[11px] font-bold text-red-600 hover:underline flex-shrink-0">Remove</button></div>` : `<label class="sm:col-span-2 flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-[8px] px-3 py-2.5 cursor-pointer hover:border-[#1A56FF] hover:bg-[#F8FAFF] transition bg-white"><i class="fa-solid fa-cloud-arrow-up text-[#1A56FF] text-[13px]"></i><span class="text-[11px] font-semibold text-slate-500">MP4 / WebM — any size</span><input type="file" accept="video/mp4,video/webm,.mp4,.webm,.mov" class="hidden" data-up-file="${tIdx}"></label>`);
        return `<div class="border border-slate-200 rounded-[8px] p-2.5 bg-[#F8F9FD]" data-lect="${si}-${ci}-${li}">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-[10px] font-extrabold text-[#1A56FF] tracking-widest">LECTURE ${li+1}</span>
            <span class="flex items-center gap-1">
              <button type="button" data-lect-up="${si}-${ci}-${li}" class="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 ${li===0?'opacity-30 pointer-events-none':''}" title="Up"><i class="fa-solid fa-chevron-up text-[9px]"></i></button>
              <button type="button" data-lect-down="${si}-${ci}-${li}" class="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 ${li===c.lessons.length-1?'opacity-30 pointer-events-none':''}" title="Down"><i class="fa-solid fa-chevron-down text-[9px]"></i></button>
              <button type="button" data-lect-del="${si}-${ci}-${li}" class="w-6 h-6 rounded-full bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center" title="Delete"><i class="fa-solid fa-trash text-[9px]"></i></button>
            </span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <input data-lect-title="${si}-${ci}-${li}" value="${esc2(l.title)}" placeholder="Lecture title * (e.g. Physics 01)" class="sm:col-span-2 border border-slate-200 rounded-[7px] px-2.5 py-1.5 text-[12px] font-semibold outline-none focus:border-[#1A56FF] bg-white">
            <input data-lect-dur="${si}-${ci}-${li}" value="${esc2(l.duration)}" placeholder="Duration (e.g. 45 min)" class="border border-slate-200 rounded-[7px] px-2.5 py-1.5 text-[12px] outline-none focus:border-[#1A56FF] bg-white">
            <label class="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-[7px] px-2.5 py-1.5"><input data-lect-free="${si}-${ci}-${li}" type="checkbox" class="w-3.5 h-3.5 accent-[#16A34A]" ${l.isFree?'checked':''}> Free</label>
            <div class="sm:col-span-2 flex gap-1 bg-slate-100 rounded-[7px] p-1">
              <button type="button" data-src-tab-tree="${tIdx}:youtube" class="flex-1 py-1 rounded-[5px] text-[11px] font-bold transition ${src==='youtube'?'bg-white text-[#1A56FF] shadow':'text-slate-500'}"><i class="fa-brands fa-youtube mr-1"></i>YouTube</button>
              <button type="button" data-src-tab-tree="${tIdx}:upload" class="flex-1 py-1 rounded-[5px] text-[11px] font-bold transition ${src==='upload'?'bg-white text-[#1A56FF] shadow':'text-slate-500'}"><i class="fa-solid fa-upload mr-1"></i>Upload</button>
            </div>
            ${src==='youtube' ? `<input data-lect-yt="${si}-${ci}-${li}" value="${esc2(l.youtube)}" placeholder="${l.hasVideo?'✓ saved — new link to replace':'YouTube link *'}" class="sm:col-span-2 border border-slate-200 rounded-[7px] px-2.5 py-1.5 text-[12px] outline-none focus:border-[#1A56FF] bg-white">` : videoBadge}
            <div class="sm:col-span-2" data-up-prog-wrap="${tIdx}" style="display:none"><div class="h-1.5 rounded-full bg-slate-200 overflow-hidden"><div class="h-full bg-[#1A56FF] rounded-full transition-all" data-up-prog="${tIdx}" style="width:0%"></div></div><p class="text-[10px] text-slate-500 mt-1" data-up-prog-txt="${tIdx}">Uploading...</p></div>
            <div class="sm:col-span-2 rounded-[7px] border border-slate-200 bg-white p-1.5">
              <div class="flex items-center gap-1.5 px-1">
                <i class="fa-solid fa-book-open text-[#0F2043] text-[10px]"></i>
                <span class="text-[10px] font-extrabold text-[#0F2043] tracking-wide">RESOURCES</span>
                <span class="text-[9px] text-slate-400 font-semibold">Lecture / Practice Sheet (link)</span>
                <button type="button" data-res-add-tree="${tIdx}" class="ml-auto px-2 py-1 rounded-[6px] bg-[#0F2043] text-white text-[10px] font-bold hover:bg-[#1A56FF]"><i class="fa-solid fa-plus mr-0.5"></i>Sheet</button>
              </div>
              <div class="space-y-1.5 mt-1.5" data-res-list-tree="${tIdx}">
                ${(Array.isArray(l.resources) ? l.resources : []).map((r, ri)=> `
                  <div class="flex gap-1">
                    <select data-res-label-tree="${tIdx}-${ri}" class="w-[118px] flex-shrink-0 border border-slate-200 rounded-[6px] px-1.5 py-1.5 text-[11px] font-bold outline-none focus:border-[#1A56FF] bg-[#F8F9FD]">
                      ${['Lecture Sheet','Practice Sheet','Solution Sheet','Exam Sheet','Class Note'].map(x=> `<option value="${x}" ${String(r.label)===x?'selected':''}>${x}</option>`).join('')}
                    </select>
                    <input data-res-url-tree="${tIdx}-${ri}" value="${esc2(r.url||'')}" placeholder="PDF / Drive link" class="flex-1 min-w-0 border border-slate-200 rounded-[6px] px-2 py-1.5 text-[11px] outline-none focus:border-[#1A56FF] bg-white">
                    <button type="button" data-res-del-tree="${tIdx}-${ri}" class="w-7 rounded-[6px] bg-red-50 text-red-600 hover:bg-red-100 flex-shrink-0" title="Remove"><i class="fa-solid fa-trash text-[9px]"></i></button>
                  </div>`).join('') || '<p class="text-[10px] text-slate-400 text-center py-1">No sheet — Sheet button-e add koro</p>'}
              </div>
            </div>
          </div>
        </div>`;
      }
      let tIdx=0; tree.forEach(s=> s.chapters.forEach(c=> c.lessons.forEach(l=>{ l._treeIdx=tIdx++; l._subjName=s.name; l._chapName=c.name; })));
      wiz._tree = tree;
      return `<div class="space-y-4">
        <div class="flex items-center justify-between">
          <p class="text-[12px] text-slate-500"><b class="text-[#0F2043]">${wiz.lessons.length}</b> lectures • <b class="text-[#0F2043]">${tree.length}</b> sections • <b class="text-[#0F2043]">${tree.reduce((a,s)=>a+s.chapters.length,0)}</b> chapters</p>
          <button type="button" id="wAddSubject" class="px-3 py-2 rounded-[8px] bg-[#1A56FF] text-white font-bold text-[12px] hover:bg-[#1445D6]"><i class="fa-solid fa-plus mr-1"></i> Add Section</button>
        </div>
        <div id="wTree" class="space-y-4">${tree.map((s,i)=> subjectBlock(s,i)).join('') || '<div class="text-center py-8 border-2 border-dashed border-slate-200 rounded-[12px] bg-[#F8F9FD]"><i class="fa-solid fa-layer-group text-slate-300 text-[22px]"></i><p class="text-[12px] text-slate-500 font-semibold mt-2">No sections yet — Add Section to start</p><p class="text-[11px] text-slate-400">Example: Physics • Chemistry • Biology — Section wise</p></div>'}</div>
      </div>`;
    }

    function fmtMB(n) {
      n = Number(n) || 0;
      if (!n) return '';
      if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
      return Math.max(1, Math.round(n / 1024)) + ' KB';
    }

    function lessonRow(l, i) {
      const src = l.src || 'youtube';
      const videoBadge = l.videoUrl
        ? `<div class="sm:col-span-2 flex items-center gap-2 bg-[#E6F4EA] border border-[#C8E9D5] rounded-[8px] px-3 py-2">
             <i class="fa-solid fa-file-video text-[#16A34A]"></i>
             <span class="text-[12px] font-bold text-[#0F2043] truncate flex-1">${esc(l.videoName || 'Uploaded video')}${l.videoSize ? ' • ' + fmtMB(l.videoSize) : ''}</span>
             <button type="button" data-up-rm="${i}" class="text-[11px] font-bold text-red-600 hover:underline flex-shrink-0">Remove</button>
           </div>`
        : (l._file
          ? `<div class="sm:col-span-2 flex items-center gap-2 bg-[#E6F0FF] border border-[#BFDBFE] rounded-[8px] px-3 py-2">
               <i class="fa-solid fa-circle-check text-[#1A56FF]"></i>
               <span class="text-[12px] font-bold text-[#0F2043] truncate flex-1">Ready: ${esc(l._fileName)}${l._fileSize ? ' • ' + fmtMB(l._fileSize) : ''}</span>
               <button type="button" data-up-rm="${i}" class="text-[11px] font-bold text-red-600 hover:underline flex-shrink-0">Remove</button>
             </div>`
          : `<label class="sm:col-span-2 flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-[8px] px-3 py-3 cursor-pointer hover:border-[#1A56FF] hover:bg-[#F8FAFF] transition bg-white">
               <i class="fa-solid fa-cloud-arrow-up text-[#1A56FF] text-[16px]"></i>
               <span class="text-[12px] font-semibold text-slate-500">MP4 / WebM video select korun — any size</span>
               <input type="file" accept="video/mp4,video/webm,.mp4,.webm,.mov" class="hidden" data-up-file="${i}">
             </label>`);
      return `<div class="border border-slate-200 rounded-[10px] p-3 bg-[#F8F9FD]" data-row="${i}">
        <div class="flex items-center justify-between mb-2">
          <span class="text-[11px] font-extrabold text-[#1A56FF]">CLASS ${i + 1}</span>
          <button class="w-7 h-7 rounded-full bg-red-50 text-red-600 hover:bg-red-100" data-rm="${i}" title="Remove"><i class="fa-solid fa-trash text-[11px]"></i></button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input data-l="section" value="${esc(l.section)}" placeholder="Section (e.g. ভৌতজগত ও পরিমাপ)" class="border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white">
          <input data-l="duration" value="${esc(l.duration)}" placeholder="Duration (e.g. 45 min)" class="border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white">
          <input data-l="title" value="${esc(l.title)}" placeholder="Class title *" class="sm:col-span-2 border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white font-semibold">
          <div class="sm:col-span-2 flex gap-1.5 bg-slate-100 rounded-[8px] p-1">
            <button type="button" data-src-tab="${i}:youtube" class="flex-1 py-1.5 rounded-[6px] text-[12px] font-bold transition ${src === 'youtube' ? 'bg-white text-[#1A56FF] shadow' : 'text-slate-500'}"><i class="fa-brands fa-youtube mr-1"></i>YouTube Link</button>
            <button type="button" data-src-tab="${i}:upload" class="flex-1 py-1.5 rounded-[6px] text-[12px] font-bold transition ${src === 'upload' ? 'bg-white text-[#1A56FF] shadow' : 'text-slate-500'}"><i class="fa-solid fa-upload mr-1"></i>Upload Video</button>
          </div>
          ${src === 'youtube'
            ? `<input data-l="youtube" value="${esc(l.youtube)}" placeholder="${l.hasVideo ? '✓ Video saved — paste new link only to replace' : 'YouTube link * (paste watch / share link)'}" class="sm:col-span-2 border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white">`
            : videoBadge}
          <div class="sm:col-span-2" data-up-prog-wrap="${i}" style="display:none">
            <div class="h-2 rounded-full bg-slate-200 overflow-hidden"><div class="h-full bg-[#1A56FF] rounded-full transition-all" data-up-prog="${i}" style="width:0%"></div></div>
            <p class="text-[11px] text-slate-500 mt-1" data-up-prog-txt="${i}">Uploading...</p>
          </div>
          <label class="sm:col-span-2 flex items-center gap-2 text-[12px] font-semibold text-slate-600">
            <input data-l="isFree" type="checkbox" class="w-4 h-4 accent-[#16A34A]" ${l.isFree ? 'checked' : ''}> Free preview (anyone can watch this class)
          </label>
        </div>
      </div>`;
    }

    function paintWiz() {
      openModal(`
        <div class="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-[16px] z-10">
          <div>
            <h3 class="text-[15px] sm:text-[16px] font-extrabold text-[#0F2043]">
              <i class="fa-solid ${wiz.id ? 'fa-pen' : 'fa-plus'} text-[#1A56FF] mr-1"></i>
              ${wiz.id ? 'Edit Course #' + wiz.id : 'Add New Course'}
            </h3>
            <p class="text-[11px] text-slate-500">Step ${wiz.step} of 3</p>
          </div>
          <button id="wizClose" class="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500 flex-shrink-0"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="px-5 sm:px-6 pt-4">${stepPills()}</div>
        <div id="wizBody" class="p-5 sm:p-6">${stepBody()}</div>
        <p id="wizError" class="hidden mx-5 sm:mx-6 -mt-2 mb-2 text-[12px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"></p>
        <div class="flex justify-between gap-2 px-5 sm:px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-[16px]">
          <button id="wizBack" class="${wiz.step === 1 ? 'invisible' : ''} px-4 py-2.5 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-700"><i class="fa-solid fa-arrow-left mr-1"></i> Back</button>
          ${wiz.step < 3
            ? `<button id="wizNext" class="px-5 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]">Next <i class="fa-solid fa-arrow-right ml-1"></i></button>`
            : `<button id="wizSave" class="px-5 py-2.5 rounded-[10px] bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-[13px]"><i class="fa-solid fa-floppy-disk mr-1"></i> ${wiz.id ? 'Update Course' : 'Publish Course'}</button>`}
        </div>`);
      wireWiz();
    }

    function wizErr(msg) {
      const box = $('wizError');
      if (!msg) { box.classList.add('hidden'); return; }
      box.textContent = msg;
      box.classList.remove('hidden');
    }

    function collectStep() {
      const v = id => { const el = $(id); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
      if (wiz.step === 1) {
        Object.assign(wiz.course, {
          title: v('wTitle'), teacher: v('wTeacher'), duration: v('wDuration'),
          batchId: v('wBatch'), categoryId: v('wCategory'), platformId: v('wPlatform'), groupId: v('wGroup'), subjectId: v('wSubject'),
          status: v('wStatus') || 'active', price: v('wPrice'), oldPrice: v('wOldPrice'),
          totalClass: v('wTotalClass'), featured: !!v('wFeatured')
        });
        if (!wiz.course.title) return 'Course Title is required';
        if (!wiz.course.batchId) return 'Please select a Batch';
      }
      if (wiz.step === 2) {
        // multi telegram collect (khali row auto bad, vul format bad, error khabe na)
        const tgLinks = Array.from(document.querySelectorAll('[data-tg-link-row]')).map(row => ({
          label: (row.querySelector('[data-tg-link-label]') || {}).value || '',
          url: (row.querySelector('[data-tg-link-url]') || {}).value || ''
        })).filter(x => String(x.url || '').trim());
        const tgIds = Array.from(document.querySelectorAll('[data-tg-id-row]')).map(row => ({
          label: (row.querySelector('[data-tg-id-label]') || {}).value || '',
          chatId: (row.querySelector('[data-tg-id-val]') || {}).value || ''
        })).filter(x => String(x.chatId || '').trim());
        Object.assign(wiz.course, {
          thumbnail: v('wThumb'), description: v('wDesc'),
          telegramLinks: tgLinks,
          telegramChatIds: tgIds,
          telegramLink: tgLinks.length ? String(tgLinks[0].url || '').trim() : '',
          features: $('wFeatures').value, tags: v('wTags'),
          bannerColor: ($('wBannerColorText').value.trim() || $('wBannerColor').value || '#5745f7')
        });
      }
      if (wiz.step === 3) collectLessons();
      return '';
    }

    function collectTreeLessons(){
      if(!wiz._tree || !wiz._tree.length){ wiz.lessons = []; return; }
      const newFlat=[];
      wiz._tree.forEach((s, si)=>{
        const sNameEl = document.querySelector('[data-subj-name="'+si+'"]');
        const sIdEl = document.querySelector('[data-subj-id="'+si+'"]');
        const sName = sNameEl ? sNameEl.value.trim() : s.name;
        const sId = sIdEl ? sIdEl.value : (s.subjectId||'');
        s.name = sName; s.subjectId = sId;
        s.chapters.forEach((c, ci)=>{
          const cNameEl = document.querySelector('[data-chap-name="'+si+'-'+ci+'"]');
          const cName = cNameEl ? cNameEl.value.trim() : c.name;
          c.name = cName || 'Chapter '+(ci+1);
          c.lessons.forEach((l, li)=>{
            const titleEl = document.querySelector('[data-lect-title="'+si+'-'+ci+'-'+li+'"]');
            const durEl = document.querySelector('[data-lect-dur="'+si+'-'+ci+'-'+li+'"]');
            const freeEl = document.querySelector('[data-lect-free="'+si+'-'+ci+'-'+li+'"]');
            const ytEl = document.querySelector('[data-lect-yt="'+si+'-'+ci+'-'+li+'"]');
            if(titleEl) l.title = titleEl.value.trim();
            if(durEl) l.duration = durEl.value.trim();
            if(freeEl) l.isFree = freeEl.checked;
            if(ytEl) l.youtube = ytEl.value.trim();
            // resources: treeIdx onujayi label+url collect (khali row bad)
            try{
              const tIdx = (l._treeIdx!=null ? l._treeIdx : null);
              if(tIdx!==null && tIdx!==undefined && tIdx!==''){
                const labels = Array.from(document.querySelectorAll('[data-res-label-tree^="'+tIdx+'-"]'));
                const res = labels.map(sel=>{
                  const key = String(sel.dataset.resLabelTree||'').split('-').slice(1).join('-');
                  const urlEl = document.querySelector('[data-res-url-tree="'+tIdx+'-'+key+'"]');
                  return { label: String(sel.value||'').trim().slice(0,80), url: String(urlEl?urlEl.value:'').trim().slice(0,2000) };
                }).filter(r=> r.label && (/^https?:\/\//i.test(r.url) || String(r.url).startsWith('/uploads/resources/')));
                l.resources = res.slice(0,10);
              }
            }catch(e){}
            // sync subject/sub-section/section (subsection preserve — wizard tree-e edit na holeo harabe na)
            l.subject = sName;
            l.subjectId = sId ? Number(sId) : 0;
            if(l.subsection === undefined || l.subsection === null) l.subsection = '';
            l.section = c.name;
            l.chapter = c.name;
            newFlat.push(l);
          });
        });
      });
      wiz.lessons = newFlat;
    }
    function collectLessons() {
      // if hierarchical tree exists, collect from tree; else fallback to flat rows
      if(wiz._tree){
        collectTreeLessons();
        return;
      }
      const rows = Array.from(document.querySelectorAll('#wLessonRows [data-row]'));
      wiz.lessons = rows.map((row, idx) => {
        const g = n => row.querySelector('[data-l="' + n + '"]');
        const prev = wiz.lessons[idx] || {};
        const ytEl = g('youtube');
        return {
          lid: prev.lid || null,
          hasVideo: prev.hasVideo || false,
          src: prev.src || 'youtube',
          videoUrl: prev.videoUrl || '',
          videoName: prev.videoName || '',
          videoSize: prev.videoSize || 0,
          _file: prev._file || null,
          _fileName: prev._fileName || '',
          _fileSize: prev._fileSize || 0,
          section: g('section').value.trim(),
          title: g('title').value.trim(),
          youtube: ytEl ? ytEl.value.trim() : '',
          duration: g('duration').value.trim(),
          isFree: g('isFree').checked
        };
      });
    }

    function wireWiz() {
      $('wizClose').addEventListener('click', closeModal);
      const back = $('wizBack');
      if (back) back.addEventListener('click', () => { collectStep(); wiz.step = Math.max(1, wiz.step - 1); wizErr(''); paintWiz(); });
      const next = $('wizNext');
      if (next) next.addEventListener('click', () => {
        const err = collectStep();
        if (err) { wizErr(err); return; }
        wizErr('');
        wiz.step++;
        paintWiz();
      });
      // thumbnail upload (base64, no size limit)
      const fileInp = $('wThumbFile');
      if (fileInp) fileInp.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          $('wThumb').value = ev.target.result;
          const prev = $('wThumbPrev');
          if (prev) {
            if (prev.tagName === 'IMG') prev.src = ev.target.result;
            else prev.outerHTML = `<img id="wThumbPrev" src="${ev.target.result}" class="w-full h-full object-contain">`;
          }
          toast('Thumbnail loaded');
        };
        reader.readAsDataURL(file);
      });
      // banner color picker <-> text sync
      const bcPick = $('wBannerColor'), bcText = $('wBannerColorText');
      if (bcPick && bcText) {
        bcPick.addEventListener('input', () => { bcText.value = bcPick.value; });
        bcText.addEventListener('input', () => { if (/^#[0-9a-fA-F]{6}$/.test(bcText.value)) bcPick.value = bcText.value; });
      }
      // multi telegram add/remove (collect kore repaint, data harabe na)
      const addTgLink = $('wAddTgLink');
      if (addTgLink) addTgLink.addEventListener('click', () => {
        collectStep();
        if (!Array.isArray(wiz.course.telegramLinks)) wiz.course.telegramLinks = [];
        if (!wiz.course.telegramLinks.length) wiz.course.telegramLinks = [{ label: '', url: '' }];
        else wiz.course.telegramLinks.push({ label: '', url: '' });
        paintWiz();
      });
      document.querySelectorAll('[data-tg-link-rm]').forEach(btn => {
        btn.addEventListener('click', () => {
          collectStep();
          wiz.course.telegramLinks.splice(Number(btn.dataset.tgLinkRm), 1);
          if (!wiz.course.telegramLinks.length) wiz.course.telegramLinks = [{ label: '', url: '' }];
          wiz.course.telegramLink = wiz.course.telegramLinks[0].url || '';
          paintWiz();
        });
      });
      const addTgId = $('wAddTgId');
      if (addTgId) addTgId.addEventListener('click', () => {
        collectStep();
        if (!Array.isArray(wiz.course.telegramChatIds)) wiz.course.telegramChatIds = [];
        wiz.course.telegramChatIds.push({ label: '', chatId: '' });
        paintWiz();
      });
      document.querySelectorAll('[data-tg-id-rm]').forEach(btn => {
        btn.addEventListener('click', () => {
          collectStep();
          wiz.course.telegramChatIds.splice(Number(btn.dataset.tgIdRm), 1);
          paintWiz();
        });
      });
      // ---- Hierarchical: Section / Chapter / Lecture ----
      const wAddSubjectBtn = document.getElementById('wAddSubject');
      if(wAddSubjectBtn) wAddSubjectBtn.addEventListener('click', ()=>{
        collectLessons();
        // push new subject to tree
        if(!wiz._tree) wiz._tree=[];
        wiz._tree.push({ name: 'New Section', subjectId: '', chapters: [{ name: 'Chapter 1', lessons: [] }] });
        // rebuild flat to reflect
        const flat=[]; wiz._tree.forEach(s=> s.chapters.forEach(c=> c.lessons.forEach(l=> flat.push(l))));
        // if flat empty add one lecture
        if(flat.length===wiz.lessons.length){
          wiz.lessons.push({ lid:null, subject:'New Section', subjectId:'', section:'Chapter 1', chapter:'Chapter 1', title:'', youtube:'', hasVideo:false, src:'youtube', videoUrl:'', videoName:'', videoSize:0, _file:null, _fileName:'', _fileSize:0, duration:'', isFree:false, resources:[] });
        }
        // easiest: add empty lecture to new subject
        wiz._tree[wiz._tree.length-1].chapters[0].lessons.push({ lid:null, subject:'New Section', subjectId:'', section:'Chapter 1', chapter:'Chapter 1', title:'', youtube:'', hasVideo:false, src:'youtube', videoUrl:'', videoName:'', videoSize:0, _file:null, _fileName:'', _fileSize:0, duration:'', isFree:false, resources:[] });
        collectTreeLessons(); paintWiz();
      });
      document.querySelectorAll('[data-subj-up],[data-subj-down]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          collectLessons();
          const isUp = btn.hasAttribute('data-subj-up');
          const si = Number((btn.getAttribute('data-subj-up')||btn.getAttribute('data-subj-down')));
          const tree = wiz._tree||[];
          const ni = isUp ? si-1 : si+1;
          if(ni<0||ni>=tree.length) return;
          const tmp=tree[si]; tree[si]=tree[ni]; tree[ni]=tmp;
          collectTreeLessons(); paintWiz();
        });
      });
      document.querySelectorAll('[data-subj-del]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const si=Number(btn.getAttribute('data-subj-del'));
          collectLessons();
          const tree=wiz._tree||[];
          const subj=tree[si];
          if(!subj) return;
          // collect removed lids
          subj.chapters.forEach(c=> c.lessons.forEach(l=>{ if(l.lid) wiz.removedLessonIds.push(l.lid); if(l.videoUrl && !l.lid){ try{ api('/api/admin/videos',{method:'DELETE',body:JSON.stringify({videoUrl:l.videoUrl})}); }catch(e){} } }));
          tree.splice(si,1);
          collectTreeLessons(); paintWiz();
        });
      });
      document.querySelectorAll('[data-add-chap]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          collectLessons();
          const si=Number(btn.getAttribute('data-add-chap'));
          const tree=wiz._tree||[];
          if(!tree[si]) return;
          tree[si].chapters.push({ name: 'Chapter '+(tree[si].chapters.length+1), lessons: [{ lid:null, subject:tree[si].name, subjectId:tree[si].subjectId||'', section:'Chapter '+(tree[si].chapters.length+1), chapter:'Chapter '+(tree[si].chapters.length+1), title:'', youtube:'', hasVideo:false, src:'youtube', videoUrl:'', videoName:'', videoSize:0, _file:null, _fileName:'', _fileSize:0, duration:'', isFree:false, resources:[] }] });
          collectTreeLessons(); paintWiz();
        });
      });
      document.querySelectorAll('[data-chap-up],[data-chap-down]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          collectLessons();
          const p=(btn.getAttribute('data-chap-up')||btn.getAttribute('data-chap-down')).split('-');
          const si=Number(p[0]), ci=Number(p[1]);
          const isUp=btn.hasAttribute('data-chap-up');
          const tree=wiz._tree||[];
          if(!tree[si]) return;
          const ni=isUp?ci-1:ci+1;
          if(ni<0||ni>=tree[si].chapters.length) return;
          const tmp=tree[si].chapters[ci]; tree[si].chapters[ci]=tree[si].chapters[ni]; tree[si].chapters[ni]=tmp;
          collectTreeLessons(); paintWiz();
        });
      });
      document.querySelectorAll('[data-chap-del]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const p=btn.getAttribute('data-chap-del').split('-');
          const si=Number(p[0]), ci=Number(p[1]);
          collectLessons();
          const tree=wiz._tree||[];
          if(!tree[si]||!tree[si].chapters[ci]) return;
          tree[si].chapters[ci].lessons.forEach(l=>{ if(l.lid) wiz.removedLessonIds.push(l.lid); if(l.videoUrl && !l.lid){ try{ api('/api/admin/videos',{method:'DELETE',body:JSON.stringify({videoUrl:l.videoUrl})}); }catch(e){} } });
          tree[si].chapters.splice(ci,1);
          if(!tree[si].chapters.length) tree[si].chapters.push({ name:'Chapter 1', lessons:[] });
          collectTreeLessons(); paintWiz();
        });
      });
      document.querySelectorAll('[data-add-lect]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          collectLessons();
          const p=btn.getAttribute('data-add-lect').split('-');
          const si=Number(p[0]), ci=Number(p[1]);
          const tree=wiz._tree||[];
          if(!tree[si]||!tree[si].chapters[ci]) return;
          const sName=tree[si].name, sId=tree[si].subjectId||'', cName=tree[si].chapters[ci].name;
          tree[si].chapters[ci].lessons.push({ lid:null, subject:sName, subjectId:sId, section:cName, chapter:cName, title:'', youtube:'', hasVideo:false, src:'youtube', videoUrl:'', videoName:'', videoSize:0, _file:null, _fileName:'', _fileSize:0, duration:'', isFree:false, resources:[] });
          collectTreeLessons(); paintWiz();
        });
      });
      document.querySelectorAll('[data-lect-up],[data-lect-down]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          collectLessons();
          const p=(btn.getAttribute('data-lect-up')||btn.getAttribute('data-lect-down')).split('-');
          const si=Number(p[0]), ci=Number(p[1]), li=Number(p[2]);
          const isUp=btn.hasAttribute('data-lect-up');
          const tree=wiz._tree||[];
          if(!tree[si]||!tree[si].chapters[ci]) return;
          const arr=tree[si].chapters[ci].lessons;
          const ni=isUp?li-1:li+1;
          if(ni<0||ni>=arr.length) return;
          const tmp=arr[li]; arr[li]=arr[ni]; arr[ni]=tmp;
          collectTreeLessons(); paintWiz();
        });
      });
      document.querySelectorAll('[data-lect-del]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const p=btn.getAttribute('data-lect-del').split('-');
          const si=Number(p[0]), ci=Number(p[1]), li=Number(p[2]);
          collectLessons();
          const tree=wiz._tree||[];
          if(!tree[si]||!tree[si].chapters[ci]) return;
          const arr=tree[si].chapters[ci].lessons;
          const rem=arr.splice(li,1)[0];
          if(rem && rem.lid) wiz.removedLessonIds.push(rem.lid);
          if(rem && rem.videoUrl && !rem.lid){ try{ api('/api/admin/videos',{method:'DELETE',body:JSON.stringify({videoUrl:rem.videoUrl})}); }catch(e){} }
          collectTreeLessons(); paintWiz();
        });
      });
      // lecture YouTube/tab & file handlers for tree (also keep flat fallback)
      document.querySelectorAll('[data-src-tab-tree]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          collectLessons();
          const parts=String(btn.dataset.srcTabTree).split(':');
          const idx=Number(parts[0]);
          const flat=wiz.lessons;
          if(flat[idx]) flat[idx].src = parts[1]==='upload' ? 'upload' : 'youtube';
          paintWiz();
        });
      });
      // wizard lecture resources: add / delete sheet row (link-based; PDF upload Class Update theke)
      document.querySelectorAll('[data-res-add-tree]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          collectLessons();
          const idx=Number(btn.dataset.resAddTree);
          const l=wiz.lessons[idx];
          if(!l) return;
          if(!Array.isArray(l.resources)) l.resources=[];
          if(l.resources.length>=10){ toast('Max 10 sheets per class', false); return; }
          l.resources.push({ label: l.resources.length ? 'Practice Sheet' : 'Lecture Sheet', url: '' });
          paintWiz();
        });
      });
      document.querySelectorAll('[data-res-del-tree]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          collectLessons();
          const p=String(btn.dataset.resDelTree).split('-');
          const idx=Number(p[0]), ri=Number(p.slice(1).join('-'));
          const l=wiz.lessons[idx];
          if(!l || !Array.isArray(l.resources)) return;
          l.resources.splice(ri,1);
          paintWiz();
        });
      });
      // flat fallback still need for old flat UI (if any)
      const addBtn = document.getElementById('wAddLesson');
      if (addBtn) addBtn.addEventListener('click', () => {
        collectLessons();
        wiz.lessons.push({ lid: null, subject:'General', subjectId:'', section: 'Chapter 1', chapter:'Chapter 1', title: '', youtube: '', hasVideo: false, src: 'youtube', videoUrl: '', videoName: '', videoSize: 0, _file: null, _fileName: '', _fileSize: 0, duration: '', isFree: false });
        paintWiz();
      });
      document.querySelectorAll('#wLessonRows [data-src-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
          collectLessons();
          const parts = String(btn.dataset.srcTab).split(':');
          const idx = Number(parts[0]);
          if (wiz.lessons[idx]) wiz.lessons[idx].src = parts[1] === 'upload' ? 'upload' : 'youtube';
          paintWiz();
        });
      });
      document.querySelectorAll('#wLessonRows [data-up-file], [data-up-file]').forEach(inp => {
        inp.addEventListener('change', () => {
          const idx = Number(inp.dataset.upFile);
          const file = inp.files && inp.files[0];
          if (!file) return;
          // find flat index via _treeIdx or direct idx
          let target = wiz.lessons[idx];
          if(!target && wiz.lessons.length){
            // fallback find by treeIdx
            flatSearch: for(let s of (wiz._tree||[])) for(let c of s.chapters) for(let l of c.lessons) if(String(l._treeIdx)===String(idx)){ target=l; break flatSearch; }
          }
          if (!target) return;
          if (!/video\/(mp4|webm|quicktime)/i.test(file.type) && !/\.(mp4|webm|mov)$/i.test(file.name)) {
            toast('Only MP4 / WebM video allowed', false);
            inp.value = '';
            return;
          }
          collectLessons();
          // re-find after collect
          let t2 = wiz.lessons[idx];
          if(!t2){
            for(let s of (wiz._tree||[])) for(let c of s.chapters) for(let l of c.lessons) if(String(l._treeIdx)===String(idx)){ t2=l; break; }
          }
          if(t2){
            t2._file = file; t2._fileName = file.name; t2._fileSize = file.size; t2.src='upload';
          } else {
            wiz.lessons[idx]._file = file; wiz.lessons[idx]._fileName=file.name; wiz.lessons[idx]._fileSize=file.size; wiz.lessons[idx].src='upload';
          }
          paintWiz();
          toast('Video ready: ' + file.name);
        });
      });
      document.querySelectorAll('[data-up-rm]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idxStr = btn.dataset.upRm;
          const idx = Number(idxStr);
          // tree mode: idx is _treeIdx
          collectLessons();
          let l = wiz.lessons[idx];
          if(l===undefined){
            // find in tree
            outer: for(let s of (wiz._tree||[])) for(let c of s.chapters) for(let ll of c.lessons) if(String(ll._treeIdx)===String(idxStr)){ l=ll; break outer; }
          }
          if (!l) return;
          if (!l.lid && l.videoUrl) {
            try { await api('/api/admin/videos', { method: 'DELETE', body: JSON.stringify({ videoUrl: l.videoUrl }) }); } catch (e) {}
          }
          l.videoUrl = ''; l.videoName = ''; l.videoSize = 0;
          l._file = null; l._fileName = ''; l._fileSize = 0;
          l.hasVideo = !!(l.youtube && wizYtId(l.youtube));
          l.src = 'upload';
          paintWiz();
        });
      });
      document.querySelectorAll('#wLessonRows [data-rm]').forEach(btn => {
        btn.addEventListener('click', () => {
          collectLessons();
          const idx = Number(btn.dataset.rm);
          const removed = wiz.lessons.splice(idx, 1)[0];
          if (removed && removed.lid) wiz.removedLessonIds.push(removed.lid);
          paintWiz();
        });
      });
      // FIX: dropdowns not opening — ensure selects are enabled and on top
      document.querySelectorAll('#modalBox select').forEach(s => { s.disabled = false; s.style.pointerEvents = 'auto'; s.style.opacity = '1'; });
      const save = $('wizSave');
      if (save) save.addEventListener('click', saveWiz);
    }

    // raw video file -> /api/admin/videos/upload (progress bar soho)
    function uploadVideoFile(file, idx) {
      return new Promise((resolve, reject) => {
        const wrap = document.querySelector('[data-up-prog-wrap="' + idx + '"]');
        const bar = document.querySelector('[data-up-prog="' + idx + '"]');
        const txt = document.querySelector('[data-up-prog-txt="' + idx + '"]');
        if (wrap) wrap.style.display = '';
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/admin/videos/upload', true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + state.token);
        xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
        xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
        xhr.upload.onprogress = e => {
          if (!e.lengthComputable) return;
          const pct = Math.round((e.loaded / e.total) * 100);
          if (bar) bar.style.width = pct + '%';
          if (txt) txt.textContent = 'Uploading ' + file.name + '... ' + pct + '%';
        };
        xhr.onload = () => {
          let j = null;
          try { j = JSON.parse(xhr.responseText); } catch (e) {}
          if (xhr.status >= 200 && xhr.status < 300 && j && j.success) resolve(j.data);
          else reject(new Error((j && j.message) || ('Upload failed (HTTP ' + xhr.status + ')')));
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });
    }

    async function saveWiz() {
      if (wiz.saving) return;
      collectLessons();
      // validate lessons (YouTube link BA uploaded video — jekono ekta lagbei)
      for (let i = 0; i < wiz.lessons.length; i++) {
        const l = wiz.lessons[i];
        if (!l.title) { wizErr('Class ' + (i + 1) + ': title is required'); return; }
        const hasYt = !!wizYtId(l.youtube);
        const hasUp = !!(l.videoUrl || l._file);
        if (l.youtube && !hasYt) { wizErr('Class ' + (i + 1) + ': YouTube link is not valid'); return; }
        if (!l.lid && !hasYt && !hasUp) { wizErr('Class ' + (i + 1) + ': YouTube link BA video upload din'); return; }
        if (l.lid && !hasYt && !hasUp && !l.hasVideo) { wizErr('Class ' + (i + 1) + ': YouTube link BA video upload din'); return; }
      }
      wiz.saving = true;
      const saveBtn = $('wizSave');
      if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Saving...'; }
      try {
        const c = wiz.course;
        const payload = {
          title: c.title, teacher: c.teacher, duration: c.duration,
          batchId: c.batchId, categoryId: c.categoryId, platformId: c.platformId || '', groupId: c.groupId || '', subjectId: c.subjectId || '',
          status: c.status || 'active', price: c.price === '' ? 0 : c.price,
          oldPrice: c.oldPrice === '' ? 0 : c.oldPrice,
          totalClass: c.totalClass === '' ? 0 : c.totalClass,
          thumbnail: c.thumbnail, description: c.description,
          telegramLink: c.telegramLink || (Array.isArray(c.telegramLinks) && c.telegramLinks[0] ? c.telegramLinks[0].url : ''),
          telegramLinks: Array.isArray(c.telegramLinks) ? c.telegramLinks : [],
          telegramChatIds: Array.isArray(c.telegramChatIds) ? c.telegramChatIds : [],
          previewVideoId: c.previewYoutube ? wizYtId(c.previewYoutube) : '',
          features: c.features || '', tags: c.tags || '',
          bannerColor: c.bannerColor || '#5745f7',
          featured: !!c.featured
        };
        let courseId = wiz.id;
        if (courseId) {
          await api('/api/admin/courses/' + courseId, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
          const created = await api('/api/admin/courses', { method: 'POST', body: JSON.stringify(payload) });
          courseId = created.data.id;
        }
        // sync lessons (order = row sequence) — pending video age upload, tarpor attach
        for (let i = 0; i < wiz.lessons.length; i++) {
          const l = wiz.lessons[i];
          if (saveBtn) saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Saving class ' + (i + 1) + '/' + wiz.lessons.length + '...';
          let upUrl = '', upName = '', upSize = 0;
          if (l._file) {
            try {
              const up = await uploadVideoFile(l._file, i);
              upUrl = up.videoUrl; upName = up.videoName || l._fileName; upSize = up.videoSize || l._fileSize;
              l.videoUrl = upUrl; l.videoName = upName; l.videoSize = upSize; l._file = null;
            } catch (err) { throw new Error('Class ' + (i + 1) + ': ' + err.message); }
          }
          const body = { subject: l.subject||'', subjectId: l.subjectId? Number(l.subjectId):0, subsection: l.subsection||'', section: l.section||l.chapter||'', chapter: l.chapter||l.section||'', title: l.title, duration: l.duration, isFree: l.isFree, order: i + 1 };
          if (Array.isArray(l.resources) && l.resources.length) {
            body.resources = l.resources
              .map(r=> ({ label: String((r&&r.label)||'').trim().slice(0,80), url: String((r&&r.url)||'').trim().slice(0,2000) }))
              .filter(r=> r.label && (/^https?:\/\//i.test(r.url) || r.url.startsWith('/uploads/resources/')))
              .slice(0, 10);
          } else if (l.lid) {
            body.resources = [];
          }
          if ((l.src || 'youtube') === 'upload') {
            if (upUrl) { body.videoUrl = upUrl; body.videoName = upName; body.videoSize = upSize; }
            else if (l.videoUrl) { body.videoUrl = l.videoUrl; body.videoName = l.videoName || ''; body.videoSize = l.videoSize || 0; }
          } else {
            if (l.youtube) body.youtubeUrl = l.youtube;
            if (l.lid && l.videoUrl) body.videoUrl = '';
          }
          if (l.lid) await api('/api/admin/lessons/' + l.lid, { method: 'PUT', body: JSON.stringify(body) });
          else await api('/api/admin/courses/' + courseId + '/lessons', { method: 'POST', body: JSON.stringify(body) });
        }
        for (const lid of wiz.removedLessonIds) {
          try { await api('/api/admin/lessons/' + lid, { method: 'DELETE' }); } catch (e) { /* already gone */ }
        }
        closeModal();
        toast(wiz.id ? 'Course updated' : 'Course published with ' + wiz.lessons.length + ' class(es)');
        await refreshMeta();
        renderResource('courses');
      } catch (err) {
        wizErr(err.message);
        wiz.saving = false;
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> ' + (wiz.id ? 'Update Course' : 'Publish Course'); }
      }
    }
  }

  /* ---------------- E-Book form (cover + PDF upload / link) ---------------- */
  function openEbookForm(id) {
    const item = id ? state.lists.ebooks.find(x => String(x.id) === String(id)) : null;
    const d = Object.assign({ title: '', cover: '', details: '', author: '', price: '', oldPrice: '', linkUrl: '', status: 'active', batchId: '', ebookBatchId: '', categoryId: '' }, item || {});
    const base = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white';
    const lbl = t => `<label class="text-[11px] font-bold text-slate-600 uppercase">${t}</label>`;
    const ebOpts = (list, val) => `<option value="">-- Select --</option>` + list.map(o =>
      `<option value="${esc(o.value)}" ${String(o.value) === String(val == null ? '' : val) ? 'selected' : ''}>${esc(o.label)}</option>`).join('');

    openModal(`
      <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-[16px] z-10">
        <div>
          <h3 class="text-[16px] font-extrabold text-[#0F2043]">
            <i class="fa-solid ${item ? 'fa-pen' : 'fa-plus'} text-[#1A56FF] mr-1"></i>
            ${item ? 'Edit E-Book #' + item.id : 'Add New E-Book'}
          </h3>
          <p class="text-[11px] text-slate-500">Cover image, details ar PDF file / link</p>
        </div>
        <button onclick="closeModal()" class="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="p-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="sm:col-span-2">${lbl('E-Book Name <span class="text-red-500">*</span>')}<input id="ebTitle" value="${esc(d.title)}" placeholder="Higher Mathematics E-Book" class="${base} mt-1"></div>
          <div class="sm:col-span-2">${lbl('Cover Image')}
            <div class="mt-1 bg-[#F8F9FD] rounded-[10px] border border-slate-200 p-3 flex items-center gap-3">
              <div class="w-14 h-[72px] rounded-[6px] bg-white border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                ${d.cover ? `<img id="ebCoverPrev" src="${esc(d.cover)}" class="w-full h-full object-contain">` : `<span id="ebCoverPrev"><i class="fa-solid fa-book text-slate-300 text-[20px]"></i></span>`}
              </div>
              <div class="flex-1 min-w-0">
                <input id="ebCover" value="${esc(d.cover)}" placeholder="Paste image URL or upload" class="${base}">
                <label class="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-[8px] bg-[#0F2043] text-white text-[11px] font-bold cursor-pointer hover:bg-[#16294F]">
                  <i class="fa-solid fa-upload text-[10px]"></i> Upload Cover
                  <input id="ebCoverFile" type="file" accept="image/*" class="hidden">
                </label>
                <p class="text-[10px] text-slate-400 mt-1">JPG/PNG — any size</p>
              </div>
            </div>
          </div>
          <div class="sm:col-span-2">${lbl('Details')}<textarea id="ebDetails" rows="3" placeholder="What's inside this book?" class="${base} mt-1">${esc(d.details)}</textarea></div>
          <div>${lbl('Author')}<input id="ebAuthor" value="${esc(d.author)}" placeholder="Author name" class="${base} mt-1"></div>
          <div>${lbl('E-Book Batch (alada — E-Book Batch menu theke create korun)')}<select id="ebBatch" class="${base} mt-1">${ebOpts(REL.ebookBatch(), d.ebookBatchId)}</select></div>
          <div>${lbl('Category')}<select id="ebCategory" class="${base} mt-1">${ebOpts(REL.ebookCategory(), d.categoryId)}</select></div>
          <div class="grid grid-cols-2 gap-3">
            <div>${lbl('Price (৳) — 0 = Free')}<input id="ebPrice" type="number" min="0" value="${esc(d.price)}" placeholder="0" class="${base} mt-1"></div>
            <div>${lbl('Old Price (৳)')}<input id="ebOldPrice" type="number" min="0" value="${esc(d.oldPrice)}" placeholder="" class="${base} mt-1"></div>
          </div>
          <div class="sm:col-span-2">${lbl('PDF File — any size')}
            <div class="mt-1 bg-[#F8F9FD] rounded-[10px] border border-slate-200 p-3">
              <div id="ebFileNow" class="text-[12px] font-semibold text-slate-600 mb-2">
                ${d.fileUrl ? `<i class="fa-solid fa-file-pdf text-[#16A34A] mr-1"></i> Current: <a href="${esc(d.fileUrl)}" target="_blank" class="text-[#1A56FF]">View PDF</a>${d.fileSize ? ' (' + fmtSize(d.fileSize) + ')' : ''}` : 'No PDF uploaded yet'}
              </div>
              <label class="inline-flex items-center gap-1 px-3 py-2 rounded-[8px] bg-[#1A56FF] text-white text-[12px] font-bold cursor-pointer hover:bg-[#1445D6]">
                <i class="fa-solid fa-upload text-[11px]"></i> ${d.fileUrl ? 'Replace PDF' : 'Upload PDF'}
                <input id="ebFile" type="file" accept="application/pdf,.pdf" class="hidden">
              </label>
              <span id="ebFileName" class="text-[11px] text-slate-500 ml-2"></span>
            </div>
          </div>
          <div class="sm:col-span-2">${lbl('Or External Link (Drive / Telegram)')}<input id="ebLink" value="${esc(d.linkUrl)}" placeholder="https://drive.google.com/..." class="${base} mt-1">
            <p class="text-[10px] text-slate-400 mt-1">PDF upload thakle link lagbe na — file tai use hobe</p>
          </div>
          <div>${lbl('Status')}<select id="ebStatus" class="${base} mt-1">
            <option value="active" ${d.status !== 'inactive' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${d.status === 'inactive' ? 'selected' : ''}>Inactive</option>
          </select></div>
        </div>
        <p id="ebError" class="hidden mt-4 text-[12px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"></p>
        <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
          <button type="button" onclick="closeModal()" class="px-4 py-2.5 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-700">Cancel</button>
          <button id="ebSave" class="px-5 py-2.5 rounded-[10px] bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-[13px]">
            <i class="fa-solid fa-floppy-disk mr-1"></i> ${item ? 'Update' : 'Publish'}
          </button>
        </div>
      </div>`);

    // cover upload (base64, no size limit)
    $('ebCoverFile').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        $('ebCover').value = ev.target.result;
        const prev = $('ebCoverPrev');
        if (prev) {
          if (prev.tagName === 'IMG') prev.src = ev.target.result;
          else prev.outerHTML = `<img id="ebCoverPrev" src="${ev.target.result}" class="w-full h-full object-contain">`;
        }
        toast('Cover loaded');
      };
      reader.readAsDataURL(file);
    });
    // pdf picker label
    $('ebFile').addEventListener('change', e => {
      const file = e.target.files[0];
      $('ebFileName').textContent = file ? file.name + ' (' + fmtSize(file.size) + ')' : '';
    });

    $('ebSave').addEventListener('click', async () => {
      const box = $('ebError');
      box.classList.add('hidden');
      const title = $('ebTitle').value.trim();
      if (!title) { box.textContent = 'E-Book Name is required'; box.classList.remove('hidden'); return; }
      const pdf = $('ebFile').files[0];
      const btn = $('ebSave');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Saving...';
      try {
        const payload = {
          title, cover: $('ebCover').value.trim(), details: $('ebDetails').value.trim(),
          author: $('ebAuthor').value.trim(),
          batchId: '', ebookBatchId: $('ebBatch').value, categoryId: $('ebCategory').value,
          price: $('ebPrice').value === '' ? 0 : $('ebPrice').value,
          oldPrice: $('ebOldPrice').value === '' ? 0 : $('ebOldPrice').value,
          linkUrl: $('ebLink').value.trim(), status: $('ebStatus').value
        };
        let eid = item ? item.id : null;
        if (eid) {
          await api('/api/admin/ebooks/' + eid, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
          const created = await api('/api/admin/ebooks', { method: 'POST', body: JSON.stringify(payload) });
          eid = created.data.id;
        }
        if (pdf) {
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Uploading PDF...';
          const up = await fetch(API + '/api/admin/ebooks/' + eid + '/file', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + state.token, 'Content-Type': 'application/pdf', 'x-file-name': encodeURIComponent(pdf.name) },
            body: pdf
          });
          const uj = await up.json();
          if (!up.ok || uj.success === false) throw new Error(uj.message || 'PDF upload failed');
        }
        closeModal();
        toast(item ? 'E-Book updated' : 'E-Book published');
        await refreshMeta();
        renderResource('ebooks');
      } catch (err) {
        box.textContent = err.message;
        box.classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> ' + (item ? 'Update' : 'Publish');
      }
    });
  }

  /* ---------------- Users ---------------- */
  async function renderUsers() {
    const view = $('view');
    view.innerHTML = `<div class="text-center py-20 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-[22px]"></i><p class="text-[13px] mt-2">Loading users...</p></div>`;
    try {
      const json = await api('/api/admin/users');
      state.lists.users = json.data || [];
    } catch (err) {
      view.innerHTML = errorBox(err.message);
      return;
    }

    view.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div class="relative flex-1 max-w-[320px]">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[13px]"></i>
          <input id="userSearch" placeholder="Search name, email or phone..."
            class="w-full bg-white border border-slate-200 rounded-[10px] pl-9 pr-3 py-2.5 text-[13px] outline-none focus:border-[#1A56FF]">
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[12px] font-bold text-slate-500 px-3 py-2.5 rounded-[10px] bg-white border border-slate-200">Total: <span id="userCount">${state.lists.users.length}</span></span>
          <button id="userAdd" class="px-4 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]">
            <i class="fa-solid fa-user-plus mr-1"></i> Add User
          </button>
        </div>
      </div>
      <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-[13px]">
            <thead class="bg-[#F8F9FD] text-slate-500 text-[11px] uppercase">
              <tr>
                <th class="px-4 py-3 text-left font-bold">#</th>
                <th class="px-4 py-3 text-left font-bold">Student</th>
                <th class="px-4 py-3 text-left font-bold">Phone</th>
                <th class="px-4 py-3 text-left font-bold">Enrolled</th>
                <th class="px-4 py-3 text-left font-bold">Orders</th>
                <th class="px-4 py-3 text-left font-bold">Spent</th>
                <th class="px-4 py-3 text-left font-bold">Wallet</th>
                <th class="px-4 py-3 text-left font-bold">Joined</th>
                <th class="px-4 py-3 text-left font-bold">Status</th>
                <th class="px-4 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody id="userBody"></tbody>
          </table>
        </div>
      </div>`;

    function paint(list) {
      $('userCount').textContent = list.length;
      $('userBody').innerHTML = list.length ? list.map(u => {
        const isBanned = u.status === 'banned' || u.status === 'blocked';
        const enrolledCount = Number(u.enrolledCount || 0);
        return `
        <tr class="border-t border-slate-100 hover:bg-[#F8F9FD]">
          <td class="px-4 py-3 text-slate-400 font-bold">${u.id}</td>
          <td class="px-4 py-3">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-full bg-[#EDE9FF] text-[#4F46E5] font-extrabold text-[13px] flex items-center justify-center flex-shrink-0">${esc((u.name || 'U').charAt(0).toUpperCase())}</div>
              <div class="min-w-0">
                <div class="font-bold text-[#0F2043] truncate">${esc(u.name)}</div>
                <div class="text-[11px] text-slate-500 truncate">${esc(u.email)}</div>
              </div>
            </div>
          </td>
          <td class="px-4 py-3 text-slate-600">${esc(u.phone || '-')}</td>
          <td class="px-4 py-3">
            <button data-profile="${u.id}" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${enrolledCount > 0 ? 'bg-[#EEF2FF] text-[#1A56FF] hover:bg-[#E0E7FF]' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'} transition" title="Click to view and manage enrolled courses">
              <i class="fa-solid fa-graduation-cap text-[11px] ${enrolledCount > 0 ? 'text-[#1A56FF]' : 'text-slate-400'}"></i>
              <span>${enrolledCount} Course${enrolledCount !== 1 ? 's' : ''}</span>
            </button>
          </td>
          <td class="px-4 py-3"><span class="font-bold text-[#0F2043]">${Number(u.orderCount || 0)}</span></td>
          <td class="px-4 py-3 font-bold text-[#16A34A]">${cur(u.totalSpent)}</td>
          <td class="px-4 py-3"><span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold ${Number(u.walletBalance || 0) > 0 ? 'bg-[#E6F4EA] text-[#16A34A]' : 'bg-slate-100 text-slate-500'}"><i class="fa-solid fa-wallet text-[9px]"></i>৳${Number(u.walletBalance || 0).toLocaleString('en-IN')}</span>${u.referralCode ? `<div class="text-[10px] text-slate-400 font-bold mt-0.5">${esc(u.referralCode)}</div>` : ''}</td>
          <td class="px-4 py-3 text-slate-500 text-[11.5px]">${dt(u.createdAt)}</td>
          <td class="px-4 py-3">
            ${isBanned ? `<span class="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-red-100 text-red-700 border border-red-200 inline-flex items-center gap-1"><i class="fa-solid fa-ban text-[9px]"></i> ${esc(u.status)}</span>` : badge(u.status || 'active')}
          </td>
          <td class="px-4 py-3 text-right whitespace-nowrap">
            <button data-profile="${u.id}" class="w-8 h-8 rounded-full bg-[#E0F2FE] text-[#0EA5E9] hover:bg-[#BAE6FD] transition inline-flex items-center justify-center mr-1" title="View Profile & Manage Course Access"><i class="fa-solid fa-eye text-[12px]"></i></button>
            <button data-user-edit="${u.id}" class="w-8 h-8 rounded-full bg-[#E6F0FF] text-[#1A56FF] hover:bg-[#DDE8FF] transition inline-flex items-center justify-center mr-1" title="Edit"><i class="fa-solid fa-pen text-[12px]"></i></button>
            <button data-user-del="${u.id}" class="w-8 h-8 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition inline-flex items-center justify-center" title="Delete"><i class="fa-solid fa-trash text-[12px]"></i></button>
          </td>
        </tr>`;
      }).join('') : emptyRow(10, 'No students registered yet');
    }

    $('userBody').addEventListener('click', function (e) {
      const profileBtn = e.target.closest('[data-profile]');
      const editBtn = e.target.closest('[data-user-edit]');
      const delBtn = e.target.closest('[data-user-del]');
      if (profileBtn) { openUserProfile(profileBtn.dataset.profile); return; }
      if (editBtn) { openUserForm(editBtn.dataset.userEdit); return; }
      if (delBtn) {
        const u = state.lists.users.find(x => String(x.id) === String(delBtn.dataset.userDel));
        confirmDialog('Delete user?', 'Remove "' + ((u && u.name) || '') + '" permanently?', async function () {
          try {
            await api('/api/admin/users/' + delBtn.dataset.userDel, { method: 'DELETE' });
            toast('User deleted');
            renderUsers();
          } catch (err) { toast(err.message, false); }
        });
      }
    });

    $('userSearch').addEventListener('input', function (e) {
      const term = e.target.value.toLowerCase();
      paint(state.lists.users.filter(u => (u.name + ' ' + u.email + ' ' + (u.phone || '')).toLowerCase().includes(term)));
    });
    $('userAdd').addEventListener('click', function () { openUserForm(null); });
    paint(state.lists.users);
  }

  function openUserForm(id) {
    const u = id ? state.lists.users.find(x => String(x.id) === String(id)) : null;
    const base = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF]';
    openModal(`
      <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h3 class="text-[16px] font-extrabold text-[#0F2043]"><i class="fa-solid fa-user-pen text-[#1A56FF] mr-1"></i>${u ? 'Edit User #' + u.id : 'Add New User'}</h3>
        <button onclick="closeModal()" class="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="userForm" class="p-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label class="text-[11px] font-bold text-slate-600 uppercase">Full Name *</label>
            <input id="uName" required value="${esc(u ? u.name : '')}" class="${base} mt-1"></div>
          <div><label class="text-[11px] font-bold text-slate-600 uppercase">Email *</label>
            <input id="uEmail" type="email" required value="${esc(u ? u.email : '')}" class="${base} mt-1"></div>
          <div><label class="text-[11px] font-bold text-slate-600 uppercase">Phone</label>
            <input id="uPhone" value="${esc(u ? (u.phone || '') : '')}" class="${base} mt-1"></div>
          <div><label class="text-[11px] font-bold text-slate-600 uppercase">Status</label>
            <select id="uStatus" class="${base} mt-1">
              <option value="active" ${!u || u.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="banned" ${u && u.status === 'banned' ? 'selected' : ''}>Banned</option>
              <option value="blocked" ${u && u.status === 'blocked' ? 'selected' : ''}>Blocked</option>
            </select></div>
          <div class="sm:col-span-2"><label class="text-[11px] font-bold text-slate-600 uppercase">Password ${u ? '(empty = keep current)' : '*'}</label>
            <input id="uPass" type="text" ${u ? '' : 'required'} placeholder="At least 6 characters" class="${base} mt-1"></div>
        </div>
        <p id="userFormError" class="hidden mt-4 text-[12px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"></p>
        <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
          <button type="button" onclick="closeModal()" class="px-4 py-2.5 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-700">Cancel</button>
          <button type="submit" class="px-5 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]"><i class="fa-solid fa-floppy-disk mr-1"></i>${u ? 'Update' : 'Create'}</button>
        </div>
      </form>`);

    $('userForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      const payload = {
        name: $('uName').value.trim(),
        email: $('uEmail').value.trim(),
        phone: $('uPhone').value.trim(),
        status: $('uStatus').value
      };
      if ($('uPass').value) payload.password = $('uPass').value;
      try {
        await api(u ? '/api/admin/users/' + u.id : '/api/admin/users', {
          method: u ? 'PUT' : 'POST',
          body: JSON.stringify(payload)
        });
        closeModal();
        toast(u ? 'User updated' : 'User created');
        renderUsers();
      } catch (err) {
        const box = $('userFormError');
        box.textContent = err.message;
        box.classList.remove('hidden');
      }
    });
  }

  async function openUserProfile(id) {
    try {
      const json = await api('/api/admin/users/' + id);
      const u = json.data;
      const enrolled = u.enrolledCourses || [];

      // Make sure courses list is loaded
      let allCourses = [];
      try {
        const cJson = await api('/api/admin/courses?limit=200');
        allCourses = cJson.data || [];
        state.lists.courses = allCourses;
      } catch (e) {
        allCourses = state.lists.courses || [];
      }

      const enrolledIds = enrolled.map(c => String(c.id));
      const availableCourses = allCourses.filter(c => !enrolledIds.includes(String(c.id)));
      const isBanned = u.status === 'banned' || u.status === 'blocked';

      openModal(`
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div class="flex items-center gap-2">
            <h3 class="text-[16px] font-extrabold text-[#0F2043]"><i class="fa-solid fa-id-card text-[#1A56FF] mr-1.5"></i>Student Details &amp; Course Access</h3>
          </div>
          <button onclick="closeModal()" class="w-9 h-9 rounded-full hover:bg-slate-200/70 text-slate-500 flex items-center justify-center"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div class="p-6 max-h-[82vh] overflow-y-auto space-y-5">
          <!-- Student Header Card -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-[14px] bg-[#F8FAFD] border border-slate-100">
            <div class="flex items-center gap-3.5">
              <div class="w-[52px] h-[52px] rounded-full bg-[#EDE9FF] text-[#4F46E5] font-black text-[20px] flex items-center justify-center border-2 border-[#DDD6FE] flex-shrink-0">
                ${esc((u.name || 'U').charAt(0).toUpperCase())}
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h4 class="text-[16px] font-extrabold text-[#0F2043]">${esc(u.name)}</h4>
                  ${isBanned ? `<span class="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-red-100 text-red-700 border border-red-200 inline-flex items-center gap-1"><i class="fa-solid fa-ban text-[9px]"></i> ${esc(u.status)}</span>` : badge(u.status || 'active')}
                </div>
                <div class="text-[12px] text-slate-500 mt-0.5">
                  <span class="mr-2"><i class="fa-regular fa-envelope mr-1 text-slate-400"></i>${esc(u.email)}</span>
                  ${u.phone ? `<span><i class="fa-solid fa-phone mr-1 text-slate-400"></i>${esc(u.phone)}</span>` : ''}
                </div>
              </div>
            </div>

            <!-- Quick Ban/Unban Button -->
            <div class="flex-shrink-0">
              <button id="modalBanBtn" class="px-3.5 py-2 rounded-[9px] font-bold text-[12px] transition flex items-center gap-1.5 ${isBanned ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'}">
                <i class="fa-solid ${isBanned ? 'fa-user-check' : 'fa-ban'}"></i>
                ${isBanned ? 'Unban Student' : 'Ban Student'}
              </button>
            </div>
          </div>

          <!-- Quick Stats -->
          <div class="grid grid-cols-3 gap-3">
            <div class="bg-white border border-slate-200/80 rounded-[12px] p-3 text-center">
              <div class="text-[11px] font-bold text-slate-500 uppercase">Enrolled Courses</div>
              <div class="text-[20px] font-black text-[#1A56FF] mt-0.5">${enrolled.length}</div>
            </div>
            <div class="bg-white border border-slate-200/80 rounded-[12px] p-3 text-center">
              <div class="text-[11px] font-bold text-slate-500 uppercase">Total Orders</div>
              <div class="text-[20px] font-black text-[#0F2043] mt-0.5">${u.orders.length}</div>
            </div>
            <div class="bg-white border border-slate-200/80 rounded-[12px] p-3 text-center">
              <div class="text-[11px] font-bold text-slate-500 uppercase">Joined Date</div>
              <div class="text-[12px] font-bold text-slate-700 mt-1.5 truncate">${dt(u.createdAt)}</div>
            </div>
          </div>

          <!-- ================= WALLET & REFERRAL (Balance Add/Minus + customize) ================= -->
          <div class="border border-slate-200 rounded-[14px] p-4 sm:p-5 bg-white shadow-sm">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h4 class="text-[14px] font-extrabold text-[#0F2043] flex items-center gap-2">
                  <i class="fa-solid fa-wallet text-[#16A34A]"></i> Wallet & Referral
                </h4>
                <p class="text-[11px] text-slate-500 mt-0.5">Balance Add/Minus + per-user commission customize</p>
              </div>
              <span class="px-3 py-1.5 rounded-full text-[13px] font-black ${Number((u.wallet && u.wallet.balance) ?? u.walletBalance ?? 0) > 0 ? 'bg-[#E6F4EA] text-[#16A34A]' : 'bg-slate-100 text-slate-500'}">৳${Number((u.wallet && u.wallet.balance) ?? u.walletBalance ?? 0).toLocaleString('en-IN')}</span>
            </div>

            <!-- Balance Add / Minus -->
            <div class="p-3.5 bg-[#F6F9FF] rounded-[11px] border border-[#D5E2FF] mb-3">
              <label class="block text-[11px] font-extrabold text-[#1A56FF] uppercase mb-1.5">
                <i class="fa-solid fa-money-bill-transfer mr-1"></i> Balance Add / Minus
              </label>
              <div class="flex flex-col sm:flex-row gap-2">
                <input id="wBalAmt" type="number" min="1" placeholder="Amount ৳ (e.g. 500)" class="flex-1 bg-white border border-slate-300 rounded-[8px] px-3 py-2 text-[12.5px] outline-none focus:border-[#1A56FF]">
                <input id="wNote" placeholder="Note (e.g. Bonus)" class="flex-1 bg-white border border-slate-300 rounded-[8px] px-3 py-2 text-[12.5px] outline-none focus:border-[#1A56FF]">
                <div class="flex gap-2">
                  <button id="wAddBtn" class="bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-[12.5px] px-4 py-2 rounded-[8px] transition whitespace-nowrap"><i class="fa-solid fa-plus text-[11px]"></i> Add</button>
                  <button id="wMinusBtn" class="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold text-[12.5px] px-4 py-2 rounded-[8px] transition whitespace-nowrap"><i class="fa-solid fa-minus text-[11px]"></i> Minus</button>
                </div>
              </div>
              <p id="wMsg" class="hidden mt-2 text-[12px] font-semibold rounded-[8px] px-3 py-2"></p>
              ${u.wallet && u.wallet.stats ? `<p class="text-[11px] text-slate-500 mt-2">Earned ৳${Number(u.wallet.stats.earned || 0).toLocaleString('en-IN')} • Withdrawn ৳${Number(u.wallet.stats.withdrawn || 0).toLocaleString('en-IN')} • Spent ৳${Number(u.wallet.stats.spent || 0).toLocaleString('en-IN')} • Pending ৳${Number(u.wallet.stats.pendingWithdraw || 0).toLocaleString('en-IN')}</p>` : ''}
            </div>

            <!-- Per-user referral customize -->
            <div class="p-3.5 bg-[#FFFBEB] rounded-[11px] border border-[#FDE68A] mb-3">
              <label class="block text-[11px] font-extrabold text-[#92400E] uppercase mb-1.5">
                <i class="fa-solid fa-gift mr-1"></i> Referral Customize (khali = global default)
              </label>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div><label class="text-[10.5px] font-bold text-slate-500 uppercase">Referral Code</label>
                  <input id="wRefCode" value="${esc((u.wallet && u.wallet.referralCode) || u.referralCode || '')}" placeholder="e.g. ABC123" class="mt-1 w-full bg-white border border-slate-300 rounded-[8px] px-3 py-2 text-[12.5px] outline-none focus:border-[#1A56FF] uppercase"></div>
                <div><label class="text-[10.5px] font-bold text-slate-500 uppercase">Commission % ${u.wallet && u.wallet.effectiveCommission !== undefined ? '(now ' + esc(String(u.wallet.effectiveCommission)) + '%)' : ''}</label>
                  <input id="wCustCom" type="number" min="0" max="90" value="${esc((u.wallet && u.wallet.customCommission !== undefined && u.wallet.customCommission !== null) ? String(u.wallet.customCommission) : (u.customCommission !== undefined && u.customCommission !== null ? String(u.customCommission) : ''))}" placeholder="Global" class="mt-1 w-full bg-white border border-slate-300 rounded-[8px] px-3 py-2 text-[12.5px] outline-none focus:border-[#1A56FF]"></div>
                <div><label class="text-[10.5px] font-bold text-slate-500 uppercase">Friend Off % ${u.wallet && u.wallet.effectiveFriendOff !== undefined ? '(now ' + esc(String(u.wallet.effectiveFriendOff)) + '%)' : ''}</label>
                  <input id="wCustOff" type="number" min="0" max="90" value="${esc((u.wallet && u.wallet.customFriendOff !== undefined && u.wallet.customFriendOff !== null) ? String(u.wallet.customFriendOff) : (u.customFriendOff !== undefined && u.customFriendOff !== null ? String(u.customFriendOff) : ''))}" placeholder="Global" class="mt-1 w-full bg-white border border-slate-300 rounded-[8px] px-3 py-2 text-[12.5px] outline-none focus:border-[#1A56FF]"></div>
              </div>
              <div class="flex justify-end mt-2.5"><button id="wCustSave" class="bg-[#0F2043] hover:bg-[#16294F] text-white font-bold text-[12.5px] px-4 py-2 rounded-[8px] transition"><i class="fa-solid fa-floppy-disk text-[11px] mr-1"></i> Save Referral Settings</button></div>
            </div>

            <!-- Recent wallet transactions -->
            <div>
              <h5 class="text-[12px] font-extrabold text-[#0F2043] mb-2"><i class="fa-solid fa-clock-rotate-left text-slate-400 mr-1"></i> Recent Wallet Activity</h5>
              <div class="divide-y divide-slate-100 max-h-[160px] overflow-y-auto border border-slate-100 rounded-[10px]">
                ${(u.wallet && u.wallet.txns && u.wallet.txns.length) ? u.wallet.txns.filter(function(t){ return String(t.type || '') !== 'withdraw_approved'; }).slice(0, 8).map(t => `
                  <div class="py-2 px-3 flex items-center justify-between gap-3 text-[12px]">
                    <div class="min-w-0"><span class="font-bold text-[#0F2043]">${esc(t.type || '')}</span>
                      <span class="text-slate-400 ml-1 truncate">${esc(t.note || '')} &middot; ${dt(t.createdAt)}</span>
                    </div>
                    <span class="font-black ${Number(t.amount) > 0 ? 'text-[#16A34A]' : (Number(t.amount) < 0 ? 'text-red-600' : 'text-slate-400')} whitespace-nowrap">${Number(t.amount) > 0 ? '+' : ''}৳${Number(t.amount || 0).toLocaleString('en-IN')}</span>
                  </div>`).join('') : '<p class="py-4 text-center text-[12px] text-slate-400">No wallet activity yet</p>'}
              </div>
            </div>
          </div>

          <!-- ================= COURSE ACCESS MANAGEMENT SECTION ================= -->
          <div class="border border-slate-200 rounded-[14px] p-4 sm:p-5 bg-white shadow-sm">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h4 class="text-[14px] font-extrabold text-[#0F2043] flex items-center gap-2">
                  <i class="fa-solid fa-graduation-cap text-[#1A56FF]"></i> Enrolled Courses (${enrolled.length})
                </h4>
                <p class="text-[11px] text-slate-500 mt-0.5">Courses currently accessible by this student</p>
              </div>
            </div>

            <!-- Grant New Access Box -->
            <div class="p-3.5 bg-[#F0F4FF] rounded-[11px] border border-[#D5E2FF] mb-4">
              <label class="block text-[11px] font-extrabold text-[#1A56FF] uppercase mb-1.5">
                <i class="fa-solid fa-plus-circle mr-1"></i> Give Course Access to Student
              </label>
              <div class="flex flex-col sm:flex-row gap-2">
                <select id="modalCourseSelect" class="flex-1 bg-white border border-slate-300 rounded-[8px] px-3 py-2 text-[12.5px] outline-none focus:border-[#1A56FF]">
                  <option value="">-- Select a course to grant access --</option>
                  ${availableCourses.map(c => `
                    <option value="${c.id}">${esc(c.title)} ${c.batchName ? '(' + esc(c.batchName) + ')' : ''} - ৳${c.price || 0}</option>
                  `).join('')}
                </select>
                <button id="modalGrantBtn" class="bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[12.5px] px-4 py-2 rounded-[8px] transition flex items-center justify-center gap-1.5 whitespace-nowrap">
                  <i class="fa-solid fa-user-plus text-[11px]"></i> Grant Access
                </button>
              </div>
            </div>

            <!-- List of Enrolled Courses -->
            <div class="space-y-2.5" id="modalEnrolledList">
              ${enrolled.length ? enrolled.map(c => `
                <div class="flex items-center justify-between gap-3 p-3 rounded-[10px] border border-slate-100 bg-[#FAFBFD] hover:bg-white transition">
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="w-10 h-10 rounded-[8px] bg-[#0F2043] flex items-center justify-center text-white flex-shrink-0 text-[14px] overflow-hidden">
                      ${c.thumbnail ? `<img src="${esc(c.thumbnail)}" class="w-full h-full object-contain">` : `<i class="fa-solid fa-book-open"></i>`}
                    </div>
                    <div class="min-w-0">
                      <div class="text-[13px] font-bold text-[#0F2043] truncate">${esc(c.title)}</div>
                      <div class="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                        ${c.batchName ? `<span class="font-semibold text-indigo-600">${esc(c.batchName)}</span><span>&bull;</span>` : ''}
                        <span class="inline-flex items-center gap-1 text-emerald-600 font-bold"><i class="fa-solid fa-circle-check text-[9px]"></i> Active Access</span>
                        ${c.isManual ? `<span class="px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 text-[9.5px] font-bold">Admin Granted</span>` : `<span class="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 text-[9.5px] font-bold">Order</span>`}
                      </div>
                    </div>
                  </div>
                  <button data-revoke-cid="${c.id}" data-course-title="${esc(c.title)}" class="flex-shrink-0 px-3 py-1.5 rounded-[8px] bg-red-50 hover:bg-red-100 text-red-600 font-bold text-[11.5px] transition flex items-center gap-1">
                    <i class="fa-solid fa-trash-can text-[11px]"></i> Remove Access
                  </button>
                </div>
              `).join('') : `
                <div class="text-center py-6 text-slate-400 bg-slate-50/50 rounded-[10px] border border-dashed border-slate-200">
                  <i class="fa-solid fa-graduation-cap text-[24px] block mb-1 text-slate-300"></i>
                  <p class="text-[12.5px] font-semibold text-slate-600">No courses enrolled yet</p>
                  <p class="text-[11px] text-slate-400 mt-0.5">Select a course above to grant access</p>
                </div>
              `}
            </div>
          </div>

          <!-- Order History -->
          <div class="border border-slate-200 rounded-[14px] p-4 bg-white shadow-xs">
            <h4 class="text-[13px] font-extrabold text-[#0F2043] mb-2.5 flex items-center gap-1.5">
              <i class="fa-solid fa-receipt text-slate-400"></i> Order History (${u.orders.length})
            </h4>
            <div class="divide-y divide-slate-100 max-h-[180px] overflow-y-auto">
              ${u.orders.length ? u.orders.map(o => `
                <div class="py-2.5 flex items-center justify-between gap-3 text-[12px]">
                  <div>
                    <span class="font-bold text-[#0F2043]">${esc(o.orderNo)}</span>
                    <span class="text-slate-400 ml-1">(${o.items.length} item(s)) &middot; ${dt(o.createdAt)}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-[#0F2043]">${cur(o.total)}</span>
                    ${badge(o.status)}
                  </div>
                </div>
              `).join('') : '<p class="py-4 text-center text-[12px] text-slate-400">No orders found</p>'}
            </div>
          </div>
        </div>
      `);

      // Event: Grant Course Access
      $('modalGrantBtn').addEventListener('click', async function () {
        const sel = $('modalCourseSelect');
        const courseId = sel.value;
        if (!courseId) { toast('Please select a course to grant access', false); return; }
        try {
          const res = await api('/api/admin/users/' + u.id + '/access', {
            method: 'POST',
            body: JSON.stringify({ courseId })
          });
          toast(res.message || 'Course access granted');
          openUserProfile(u.id); // re-render modal
          renderUsers(); // refresh table
        } catch (err) { toast(err.message, false); }
      });

      // Event: Wallet Add / Minus
      function wShowMsg(text, ok){
        const box = $('wMsg'); if(!box) return;
        box.textContent = text;
        box.className = 'mt-2 text-[12px] font-semibold rounded-[8px] px-3 py-2 ' + (ok ? 'bg-[#E6F4EA] text-[#16A34A] border border-[#C8E9D5]' : 'bg-red-50 text-red-600 border border-red-100');
        box.classList.remove('hidden');
      }
      async function walletAdjust(signed){
        let amt = Math.floor(Number(($('wBalAmt') || {}).value) || 0);
        if(!(amt > 0)){ wShowMsg('Amount daw (e.g. 500)', false); return; }
        if(signed < 0) amt = -amt;
        const note = (($('wNote') || {}).value || '').trim();
        try {
          const j = await api('/api/admin/users/' + u.id + '/wallet', { method: 'POST', body: JSON.stringify({ amount: amt, note }) });
          toast(j.message || 'Wallet updated');
          openUserProfile(u.id);
          renderUsers();
        } catch (err) { wShowMsg(err.message, false); }
      }
      if($('wAddBtn')) $('wAddBtn').addEventListener('click', function(){ walletAdjust(1); });
      if($('wMinusBtn')) $('wMinusBtn').addEventListener('click', function(){ walletAdjust(-1); });

      // Event: Save per-user referral customize
      if($('wCustSave')) $('wCustSave').addEventListener('click', async function(){
        try {
          const j = await api('/api/admin/users/' + u.id, {
            method: 'PUT',
            body: JSON.stringify({
              referralCode: (($('wRefCode') || {}).value || '').trim().toUpperCase(),
              customCommission: (($('wCustCom') || {}).value || '').trim(),
              customFriendOff: (($('wCustOff') || {}).value || '').trim()
            })
          });
          toast(j.message || 'Referral settings saved');
          openUserProfile(u.id);
          renderUsers();
        } catch (err) { wShowMsg(err.message, false); }
      });

      // Event: Revoke Course Access
      $('modalEnrolledList').addEventListener('click', function (e) {
        const btn = e.target.closest('[data-revoke-cid]');
        if (!btn) return;
        const cId = btn.dataset.revokeCid;
        const cTitle = btn.dataset.courseTitle || 'this course';
        confirmDialog('Remove Course Access?', `Are you sure you want to revoke access to "${cTitle}" for ${u.name}? The student will immediately lose access.`, async function () {
          try {
            await api('/api/admin/users/' + u.id + '/access/' + cId, { method: 'DELETE' });
            toast('Course access removed');
            openUserProfile(u.id);
            renderUsers();
          } catch (err) { toast(err.message, false); }
        }, 'Yes, Remove Access');
      });

      // Event: Toggle Ban in Modal
      $('modalBanBtn').addEventListener('click', function () {
        const nextStatus = isBanned ? 'active' : 'banned';
        const title = isBanned ? 'Unban Student?' : 'Ban Student?';
        const msg = isBanned ? `Activate and unban ${u.name}? They will be able to log in and access courses again.` : `Are you sure you want to ban ${u.name}? They will be locked out and cannot log in or access courses.`;
        confirmDialog(title, msg, async function () {
          try {
            const res = await api('/api/admin/users/' + u.id + '/ban', {
              method: 'POST',
              body: JSON.stringify({ status: nextStatus })
            });
            toast(res.message);
            openUserProfile(u.id);
            renderUsers();
          } catch (err) { toast(err.message, false); }
        }, isBanned ? 'Yes, Unban' : 'Yes, Ban Student');
      });

    } catch (err) {
      toast(err.message, false);
    }
  }

  /* ---------------- Orders ---------------- */
  const ORDER_STATUS = ['pending', 'confirmed', 'completed', 'cancelled'];

  async function renderOrders() {
    const view = $('view');
    view.innerHTML = `<div class="text-center py-20 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-[22px]"></i><p class="text-[13px] mt-2">Loading orders...</p></div>`;
    try {
      const json = await api('/api/admin/orders');
      state.lists.orders = json.data || [];
    } catch (err) {
      view.innerHTML = errorBox(err.message);
      return;
    }

    const counts = ORDER_STATUS.reduce((acc, s) => {
      acc[s] = state.lists.orders.filter(o => o.status === s).length;
      return acc;
    }, {});

    // Sidebar badge sathe sathe update
    state.pendingOrders = counts.pending || 0;
    paintOrdersBadge();

    view.innerHTML = `
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        ${ORDER_STATUS.map(s => `
          <button data-filter="${s}" class="text-left bg-white rounded-[14px] border border-slate-100 shadow-sm p-4 hover:shadow-md transition">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-bold uppercase text-slate-500">${s}</span>
              <span class="w-2.5 h-2.5 rounded-full" style="background:${{ pending: '#F59E0B', confirmed: '#1A56FF', completed: '#16A34A', cancelled: '#DC2626' }[s]}"></span>
            </div>
            <div class="text-[20px] font-extrabold text-[#0F2043] mt-2">${counts[s]}</div>
          </button>`).join('')}
      </div>

      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div class="relative flex-1 max-w-[320px]">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[13px]"></i>
          <input id="orderSearch" placeholder="Search order no, name, email..."
            class="w-full bg-white border border-slate-200 rounded-[10px] pl-9 pr-3 py-2.5 text-[13px] outline-none focus:border-[#1A56FF]">
        </div>
        <div class="flex items-center gap-2">
          <button id="orderAll" class="px-3 py-2.5 rounded-[10px] bg-white border border-slate-200 font-bold text-[12.5px] text-slate-600">Show All</button>
          <span class="text-[12px] font-bold text-slate-500 px-3 py-2.5 rounded-[10px] bg-white border border-slate-200">Total: <span id="orderCount">${state.lists.orders.length}</span></span>
        </div>
      </div>

      <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-[13px]">
            <thead class="bg-[#F8F9FD] text-slate-500 text-[11px] uppercase">
              <tr>
                <th class="px-5 py-3 text-left font-bold">Order</th>
                <th class="px-5 py-3 text-left font-bold">Customer</th>
                <th class="px-5 py-3 text-left font-bold">Courses</th>
                <th class="px-5 py-3 text-left font-bold">Total</th>
                <th class="px-5 py-3 text-left font-bold">Coupon</th>
                <th class="px-5 py-3 text-left font-bold">Date</th>
                <th class="px-5 py-3 text-left font-bold">Status</th>
                <th class="px-5 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody id="orderBody"></tbody>
          </table>
        </div>
      </div>`;

    function paint(list) {
      $('orderCount').textContent = list.length;
      $('orderBody').innerHTML = list.length ? list.map(o => `
        <tr class="border-t border-slate-100 hover:bg-[#F8F9FD]">
          <td class="px-5 py-3">
            <div class="font-extrabold text-[#0F2043]">${esc(o.orderNo)}</div>
            <div class="text-[11px] text-slate-500">#${o.id}</div>
          </td>
          <td class="px-5 py-3">
            <div class="font-bold text-[#0F2043]">${esc((o.customer && o.customer.name) || 'Guest')}</div>
            <div class="text-[11px] text-slate-500">${esc((o.customer && o.customer.email) || '-')}</div>
          </td>
          <td class="px-5 py-3">
            <div class="text-slate-700 max-w-[230px] truncate" title="${esc(o.items.map(i => i.title).join(', '))}">
              ${esc(o.items[0] ? o.items[0].title : '')}${o.items.length > 1 ? ' <span class="text-[#1A56FF] font-bold">+' + (o.items.length - 1) + '</span>' : ''}
            </div>
          </td>
          <td class="px-5 py-3">
            <div class="font-extrabold text-[#0F2043]">${cur(o.total)}</div>
            ${o.discount ? `<div class="text-[11px] text-[#16A34A]">-${cur(o.discount)}</div>` : ''}
          </td>
          <td class="px-5 py-3">${o.couponCode ? `<span class="px-2 py-0.5 rounded-[6px] bg-[#FEF9C3] text-[#CA8A04] text-[11px] font-bold">${esc(o.couponCode)}</span>` : '-'}</td>
          <td class="px-5 py-3 text-slate-500 text-[11.5px]">${dt(o.createdAt)}</td>
          <td class="px-5 py-3">
            <select data-status="${o.id}" class="border border-slate-200 rounded-[8px] px-2 py-1 text-[12px] font-bold outline-none focus:border-[#1A56FF]">
              ${ORDER_STATUS.map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </td>
          <td class="px-5 py-3 text-right whitespace-nowrap">
            <button data-order-view="${o.id}" class="w-9 h-9 rounded-full bg-[#E0F2FE] text-[#0EA5E9] hover:bg-[#BAE6FD] transition" title="View"><i class="fa-solid fa-eye text-[12px]"></i></button>
            <button data-order-del="${o.id}" class="w-9 h-9 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition" title="Delete"><i class="fa-solid fa-trash text-[12px]"></i></button>
          </td>
        </tr>`).join('') : emptyRow(8, 'No orders found');
    }

    $('orderBody').addEventListener('change', async function (e) {
      const sel = e.target.closest('[data-status]');
      if (!sel) return;
      try {
        await api('/api/admin/orders/' + sel.dataset.status, { method: 'PUT', body: JSON.stringify({ status: sel.value }) });
        toast('Order status changed to ' + sel.value);
        renderOrders();
      } catch (err) { toast(err.message, false); }
    });

    $('orderBody').addEventListener('click', function (e) {
      const viewBtn = e.target.closest('[data-order-view]');
      const delBtn = e.target.closest('[data-order-del]');
      if (viewBtn) { openOrderDetail(viewBtn.dataset.orderView); return; }
      if (delBtn) {
        confirmDialog('Delete order?', 'This order will be permanently removed.', async function () {
          try {
            await api('/api/admin/orders/' + delBtn.dataset.orderDel, { method: 'DELETE' });
            toast('Order deleted');
            renderOrders();
          } catch (err) { toast(err.message, false); }
        });
      }
    });

    $('orderSearch').addEventListener('input', function (e) {
      const term = e.target.value.toLowerCase();
      paint(state.lists.orders.filter(o => JSON.stringify(o).toLowerCase().includes(term)));
    });
    $('orderAll').addEventListener('click', function () {
      $('orderSearch').value = '';
      paint(state.lists.orders);
    });
    view.querySelectorAll('[data-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        paint(state.lists.orders.filter(o => o.status === btn.dataset.filter));
      });
    });
    paint(state.lists.orders);
  }

  function openOrderDetail(id) {
    const o = state.lists.orders.find(x => String(x.id) === String(id));
    if (!o) { toast('Order not found', false); return; }
    openModal(`
      <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h3 class="text-[16px] font-extrabold text-[#0F2043]"><i class="fa-solid fa-receipt text-[#1A56FF] mr-1"></i>Order ${esc(o.orderNo)}</h3>
          <p class="text-[11px] text-slate-500">${dt(o.createdAt)}</p>
        </div>
        <button onclick="closeModal()" class="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="p-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="bg-[#F8F9FD] rounded-[12px] p-4">
            <div class="text-[11px] font-bold uppercase text-slate-500 mb-2">Customer</div>
            <div class="text-[14px] font-extrabold text-[#0F2043]">${esc((o.customer && o.customer.name) || 'Guest')}</div>
            <div class="text-[12px] text-slate-600">${esc((o.customer && o.customer.email) || '-')}</div>
            <div class="text-[12px] text-slate-600">${esc((o.customer && o.customer.phone) || '-')}</div>
          </div>
          <div class="bg-[#F8F9FD] rounded-[12px] p-4">
            <div class="text-[11px] font-bold uppercase text-slate-500 mb-2">Payment</div>
            <div class="flex items-center justify-between text-[12.5px] mb-1"><span class="text-slate-600">Method</span><b class="text-[#0F2043]">${esc(o.paymentMethod || 'manual')}</b></div>
            <div class="flex items-center justify-between text-[12.5px] mb-1"><span class="text-slate-600">Status</span>${badge(o.status)}</div>
            <div class="flex items-center justify-between text-[12.5px]"><span class="text-slate-600">Coupon</span><b class="text-[#0F2043]">${esc(o.couponCode || 'none')}</b></div>
          </div>
        </div>

        <h4 class="text-[13px] font-extrabold text-[#0F2043] mt-5 mb-2">Courses in this order</h4>
        <div class="border border-slate-100 rounded-[10px] divide-y divide-slate-100">
          ${o.items.map(i => `
            <div class="px-4 py-3 flex items-center justify-between gap-3">
              <span class="text-[12.5px] font-semibold text-slate-700">${esc(i.title)}</span>
              <b class="text-[12.5px] text-[#0F2043]">${cur(i.price)}</b>
            </div>`).join('')}
        </div>

        <div class="mt-4 ml-auto max-w-[300px] space-y-1.5">
          <div class="flex justify-between text-[12.5px]"><span class="text-slate-600">Subtotal</span><b>${cur(o.subtotal)}</b></div>
          <div class="flex justify-between text-[12.5px]"><span class="text-slate-600">Discount</span><b class="text-[#16A34A]">-${cur(o.discount)}</b></div>
          <div class="flex justify-between text-[15px] pt-2 border-t border-slate-200"><span class="font-extrabold text-[#0F2043]">Total</span><span class="font-extrabold text-[#1A56FF]">${cur(o.total)}</span></div>
        </div>

        ${o.note ? `<p class="mt-4 text-[12px] text-slate-600 bg-[#FEF9C3] border border-[#FDE68A] rounded-[10px] px-3 py-2"><b>Note:</b> ${esc(o.note)}</p>` : ''}

        <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
          <button onclick="closeModal()" class="px-4 py-2.5 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-700">Close</button>
        </div>
      </div>`);
  }

  /* ---------------- Admins (multi-admin team, full access) ---------------- */
  async function renderAdmins() {
    const view = $('view');
    view.innerHTML = `<div class="text-center py-20 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-[22px]"></i><p class="text-[13px] mt-2">Loading admins...</p></div>`;
    try {
      // Admins list required; invites best-effort (ekta fail korle puro page blank hobe na)
      const aj = await api('/api/admin/admins');
      const list = aj.data || [];
      let invites = [], invitesError = '';
      try {
        const ij = await api('/api/admin/admins/invites');
        invites = (ij.data || []).filter(i => !i.used);
      } catch (e) { invitesError = e.message || 'Could not load invitations'; }
      const permBadge = p => `<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">${esc(PERM_LABELS[p] || p)}</span>`;
      view.innerHTML = `
        ${invitesError ? `<div class="bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] text-[12px] font-semibold rounded-[12px] px-4 py-2.5 mb-4"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Invitations could not load (${esc(invitesError)}) — server restart diye abar try koro.</div>` : ''}
        ${invites.length ? `
        <div class="bg-white rounded-[14px] border border-[#FDE68A] shadow-sm overflow-hidden mb-4">
          <div class="px-5 py-3.5 bg-[#FFFBEB] border-b border-[#FEF3C7] flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-[14px] font-extrabold text-[#0F2043]"><i class="fa-solid fa-envelope-open-text text-[#B45309] mr-1"></i>Pending Invitations (${invites.length})</h3>
            <span class="text-[11px] font-bold text-slate-400">Links expire in 24 hours</span>
          </div>
          <div class="divide-y divide-slate-100">
            ${invites.map(inv => {
              const left = Number(inv.expiresAt || 0) - Date.now();
              const expired = left <= 0;
              return `
              <div class="px-5 py-3 flex flex-wrap items-center gap-3">
                <div class="w-10 h-10 rounded-full ${expired ? 'bg-slate-100 text-slate-400' : 'bg-[#FFFBEB] text-[#B45309]'} font-extrabold flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-paper-plane text-[14px]"></i></div>
                <div class="min-w-0 flex-1">
                  <div class="text-[13.5px] font-extrabold text-[#0F2043] truncate">${esc(inv.email)}
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ml-1 ${inv.role === 'superadmin' ? 'bg-[#0F2043] text-white' : 'bg-[#E6F0FF] text-[#1A56FF]'}">${esc(inv.role === 'superadmin' ? 'SUPER ADMIN' : 'Admin')}</span>
                  </div>
                  <div class="text-[11.5px] font-bold ${expired ? 'text-red-500' : 'text-[#B45309]'}"><i class="fa-regular fa-clock mr-1"></i>${expired ? 'Expired — resend for a new link' : esc(inviteExpiryText(left))}</div>
                </div>
                <div class="flex items-center gap-2">
                  ${inv.acceptUrl && !expired ? `<button data-inv-copy="${esc(inv.acceptUrl)}" class="px-3 py-2 rounded-[10px] bg-[#E6F0FF] hover:bg-[#DDE8FF] font-bold text-[12px] text-[#1A56FF]"><i class="fa-solid fa-link mr-1"></i>Copy Link</button>` : ''}
                  <button data-inv-resend="${inv.id}" class="px-3 py-2 rounded-[10px] bg-[#E6F4EA] hover:bg-[#D3EBD8] font-bold text-[12px] text-[#16A34A]"><i class="fa-solid fa-rotate-right mr-1"></i>Resend</button>
                  <button data-inv-revoke="${inv.id}" data-inv-email="${esc(inv.email)}" class="px-3 py-2 rounded-[10px] bg-red-50 hover:bg-red-100 font-bold text-[12px] text-red-600"><i class="fa-solid fa-ban mr-1"></i>Revoke</button>
                </div>
              </div>`; }).join('')}
          </div>
        </div>` : ''}
        <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-[15px] font-extrabold text-[#0F2043]"><i class="fa-solid fa-user-shield text-[#1A56FF] mr-1"></i>Admin Team (${list.length})</h3>
              <p class="text-[11.5px] text-slate-500">Invite by email — new admins join with an accept link. You cannot delete your own account.</p>
            </div>
            <button id="addAdminBtn" class="px-4 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[12.5px]"><i class="fa-solid fa-paper-plane mr-1"></i> Invite Admin</button>
          </div>
          <div class="divide-y divide-slate-100">
            ${list.map(a => {
              const perms = Array.isArray(a.permissions) ? a.permissions : null;
              return `
              <div class="px-5 py-3.5 flex flex-wrap items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-[#EDE9FF] text-[#4F46E5] font-extrabold flex items-center justify-center">${esc((a.name || a.username || 'A').charAt(0).toUpperCase())}</div>
                <div class="min-w-0 flex-1">
                  <div class="text-[13.5px] font-extrabold text-[#0F2043]">${esc(a.name || '')}
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ml-1 ${a.role === 'superadmin' ? 'bg-[#0F2043] text-white' : 'bg-[#E6F0FF] text-[#1A56FF]'}">${esc(a.role === 'superadmin' ? 'SUPER ADMIN' : 'Admin')}</span>
                  </div>
                  <div class="text-[11.5px] text-slate-500">@${esc(a.username || '')}${a.email ? ' • ' + esc(a.email) : ''}</div>
                  <div class="flex flex-wrap gap-1 mt-1.5">${perms === null ? '<span class="px-2 py-0.5 rounded-full bg-[#E6F4EA] text-[#16A34A] text-[10px] font-bold">Full access (legacy)</span>' : (perms.length ? perms.map(permBadge).join('') : '<span class="text-[10px] text-slate-400 font-bold">Dashboard only</span>')}</div>
                </div>
                <div class="flex items-center gap-2">
                  <button data-admin-edit="${a.id}" class="px-3 py-2 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[12px] text-slate-700"><i class="fa-solid fa-pen mr-1"></i>Edit</button>
                  <button data-admin-del="${a.id}" data-admin-name="${esc(a.name || a.username)}" class="px-3 py-2 rounded-[10px] bg-red-50 hover:bg-red-100 font-bold text-[12px] text-red-600"><i class="fa-solid fa-trash mr-1"></i>Remove</button>
                </div>
              </div>`; }).join('') || '<p class="px-5 py-8 text-center text-[13px] text-slate-400">No admins found</p>'}
          </div>
        </div>`;
      $('addAdminBtn').addEventListener('click', function () { inviteAdminForm(); });
      view.querySelectorAll('[data-admin-edit]').forEach(b => b.addEventListener('click', async function () {
        const j = await api('/api/admin/admins');
        const found = (j.data || []).find(x => String(x.id) === String(b.dataset.adminEdit));
        adminForm(found);
      }));
      view.querySelectorAll('[data-inv-copy]').forEach(b => b.addEventListener('click', function () {
        copyText(b.dataset.invCopy, 'Invitation link copied');
      }));
      view.querySelectorAll('[data-inv-resend]').forEach(b => b.addEventListener('click', async function () {
        try {
          const j = await api('/api/admin/admins/invites/' + b.dataset.invResend + '/resend', { method: 'POST' });
          toast(j.message); renderAdmins();
        } catch (err) { toast(err.message, false); }
      }));
      view.querySelectorAll('[data-inv-revoke]').forEach(b => b.addEventListener('click', function () {
        confirmDialog('Revoke invitation?', 'The invitation for "' + b.dataset.invEmail + '" will be cancelled.', async function () {
          try { await api('/api/admin/admins/invites/' + b.dataset.invRevoke, { method: 'DELETE' }); toast('Invitation revoked'); renderAdmins(); }
          catch (err) { toast(err.message, false); }
        }, 'Yes, Revoke');
      }));
      view.querySelectorAll('[data-admin-del]').forEach(b => b.addEventListener('click', function () {
        confirmDialog('Remove admin?', '"' + b.dataset.adminName + '" will no longer be able to log in.', async function () {
          try { await api('/api/admin/admins/' + b.dataset.adminDel, { method: 'DELETE' }); toast('Admin removed'); renderAdmins(); }
          catch (err) { toast(err.message, false); }
        }, 'Yes, Remove');
      }));
    } catch (err) { view.innerHTML = errorBox(err.message); }
  }

  /* Invitation email preview — same content as the mailed template (live values) */
  function invitePreviewHtml(siteUrl, email, role) {
    const roleLabel = role === 'superadmin' ? 'Super Administrator' : 'Administrator';
    const host = String(siteUrl || '').replace(/^https?:\/\//, '') || 'website';
    return `
    <div class="rounded-[12px] overflow-hidden border border-slate-200">
      <div class="text-center text-white px-4 py-4" style="background:linear-gradient(90deg,#1A56FF,#7C3AED)">
        <div class="text-[24px] leading-none">🔐</div>
        <div class="text-[15px] font-extrabold mt-1">Admin Invitation</div>
      </div>
      <div class="bg-white px-4 py-4 text-[12.5px] text-slate-700 leading-relaxed">
        <p>You've been invited to join <a href="${esc(siteUrl)}" target="_blank" class="text-[#1A56FF] font-bold hover:underline">${esc(host)}</a> as an Administrator.</p>
        <div class="bg-[#F8F9FD] border border-slate-200 rounded-[8px] px-3 py-2.5 mt-2 leading-loose">
          <div>👤 Role: <b>${esc(roleLabel)}</b></div>
          <div>📧 Email: <b>${esc(email || 'name@example.com')}</b></div>
        </div>
        <div class="text-center my-3">
          <span class="inline-block text-white font-extrabold text-[13px] px-6 py-2.5 rounded-[10px]" style="background:#1A56FF">🔗 Accept Invitation</span>
        </div>
        <p class="text-[11.5px] text-[#B45309]">⏳ This invitation will expire in <b>24 hours</b>.</p>
        <p class="text-[11px] text-slate-400 mt-1">If you did not expect this invitation, you can safely ignore this message.</p>
      </div>
    </div>`;
  }

  /* Invite Admin — email + role + permissions, accept link mailed */
  async function inviteAdminForm() {
    const base = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white';
    const siteUrl = location.origin;
    const isSuper = state.admin && state.admin.role === 'superadmin';
    const defaultPerms = ['dashboard', 'courses', 'orders', 'users'];
    openModal(`
      <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-[16px] z-10">
        <div>
          <h3 class="text-[16px] font-extrabold text-[#0F2043]"><i class="fa-solid fa-paper-plane text-[#1A56FF] mr-1"></i>Invite Admin</h3>
          <p class="text-[11px] text-slate-500">An accept link (valid 24 hours) will be emailed.</p>
        </div>
        <button onclick="closeModal()" class="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label class="text-[11px] font-bold text-slate-600 uppercase">Email Address *</label>
          <input id="invEmail" type="email" value="" class="${base} mt-1" placeholder="name@example.com">
          <div class="mt-3"><label class="text-[11px] font-bold text-slate-600 uppercase">Role</label>
            <select id="invRole" class="${base} mt-1">
              <option value="admin">Administrator</option>
              ${isSuper ? '<option value="superadmin">Super Admin (full access)</option>' : ''}
            </select></div>
          <div class="mt-3">
            <label class="text-[11px] font-bold text-slate-600 uppercase">Permissions — which sections they can use</label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2">
              ${Object.keys(PERM_LABELS).filter(p => p !== 'dashboard').map(p => `
                <label class="flex items-center gap-2 bg-[#F8F9FD] rounded-[8px] border border-slate-200 px-2.5 py-2 cursor-pointer text-[12px] font-semibold text-slate-700">
                  <input type="checkbox" data-inv-perm="${p}" ${defaultPerms.includes(p) ? 'checked' : ''} class="w-4 h-4 accent-[#1A56FF] flex-shrink-0"> ${esc(PERM_LABELS[p])}
                </label>`).join('')}
            </div>
            <p class="text-[10.5px] text-slate-400 mt-1">Super Admins get full access automatically. Dashboard is visible to everyone.</p>
          </div>
          <p id="invMsg" class="hidden mt-3 text-[12px] font-semibold rounded-lg px-3 py-2"></p>
        </div>
        <div>
          <label class="text-[11px] font-bold text-slate-600 uppercase">Email Preview <span class="text-slate-400 normal-case font-semibold">(live)</span></label>
          <div id="invPreview" class="mt-1"></div>
        </div>
      </div>
      <div class="flex justify-end gap-2 px-6 pb-6">
        <button onclick="closeModal()" class="px-4 py-2.5 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-700">Cancel</button>
        <button id="invSend" class="px-5 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]"><i class="fa-solid fa-paper-plane mr-1"></i> Send Invitation</button>
      </div>`);
    const paintPreview = () => {
      $('invPreview').innerHTML = invitePreviewHtml(siteUrl, $('invEmail').value.trim(), $('invRole').value);
    };
    $('invEmail').addEventListener('input', paintPreview);
    $('invRole').addEventListener('change', paintPreview);
    paintPreview();
    $('invSend').addEventListener('click', async function () {
      const box = $('invMsg');
      box.classList.add('hidden');
      const email = $('invEmail').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        box.textContent = 'Please enter a valid email address';
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        box.classList.remove('hidden');
        return;
      }
      const perms = Array.from(document.querySelectorAll('[data-inv-perm]:checked')).map(el => el.dataset.invPerm);
      const btn = $('invSend');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Sending...';
      try {
        const j = await api('/api/admin/admins/invite', { method: 'POST', body: JSON.stringify({ email, role: $('invRole').value, permissions: perms }) });
        inviteSuccess(email, j.acceptUrl, j.message, !!(j.mail && j.mail.ok));
      } catch (err) {
        box.textContent = err.message;
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        box.classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane mr-1"></i> Send Invitation';
      }
    });
  }

  function inviteSuccess(email, acceptUrl, message, mailOk) {
    openModal(`
      <div class="p-6 text-center max-w-[480px] mx-auto">
        <div class="w-14 h-14 rounded-full ${mailOk ? 'bg-[#E6F4EA]' : 'bg-[#FEF3C7]'} flex items-center justify-center mx-auto">
          <i class="fa-solid ${mailOk ? 'fa-check text-[#16A34A]' : 'fa-triangle-exclamation text-[#B45309]'} text-[24px]"></i>
        </div>
        <h3 class="text-[17px] font-extrabold text-[#0F2043] mt-3">${mailOk ? 'Invitation Sent' : 'Invite Created'}</h3>
        <p class="text-[12.5px] text-slate-500 mt-1">${esc(message || ('Invitation for ' + email + ' is ready.'))}</p>
        ${acceptUrl ? `
        <div class="mt-4 text-left">
          <label class="text-[11px] font-bold text-slate-600 uppercase">Invitation Link <span class="text-slate-400 normal-case font-semibold">(expires in 24 hours)</span></label>
          <div class="flex gap-2 mt-1">
            <input id="invLink" readonly value="${esc(acceptUrl)}" class="flex-1 min-w-0 border border-slate-200 rounded-[8px] px-3 py-2 font-mono text-[11px] text-slate-600 bg-[#F8F9FD] outline-none">
            <button id="invCopy" class="px-4 py-2 rounded-[8px] bg-[#0F2043] text-white text-[12px] font-bold flex-shrink-0"><i class="fa-solid fa-copy mr-1"></i>Copy</button>
          </div>
        </div>` : ''}
        <button id="invDone" class="mt-5 px-6 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]">Done</button>
      </div>`);
    const cp = $('invCopy');
    if (cp) cp.addEventListener('click', () => copyText($('invLink').value, 'Invitation link copied'));
    $('invDone').addEventListener('click', () => { closeModal(); renderAdmins(); });
  }

  function adminForm(a) {
    if (!a) { toast('Admin not found', false); return; }
    const base = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF]';
    const isSelf = state.admin && String(a.id) === String(state.admin.id);
    const curPerms = Array.isArray(a.permissions) ? a.permissions : null;
    const checked = p => (!curPerms || curPerms.includes(p)) ? 'checked' : '';
    openModal(`
      <div class="p-6 max-h-[85vh] overflow-y-auto">
        <h3 class="text-[16px] font-extrabold text-[#0F2043]">Edit Admin</h3>
        <p class="text-[12px] text-slate-500 mt-0.5">Update info, email, role or permissions</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          <div><label class="text-[11px] font-bold text-slate-600 uppercase">Username</label>
            <input value="${esc(a.username || '')}" disabled class="${base} mt-1 bg-slate-50 text-slate-500"></div>
          <div><label class="text-[11px] font-bold text-slate-600 uppercase">Display Name</label>
            <input id="aName" value="${esc(a.name || '')}" class="${base} mt-1 bg-white" placeholder="Full name"></div>
          <div class="sm:col-span-2"><label class="text-[11px] font-bold text-slate-600 uppercase">Email (login)</label>
            <input id="aEmail" type="email" value="${esc(a.email || '')}" class="${base} mt-1 bg-white" placeholder="name@example.com"></div>
          <div><label class="text-[11px] font-bold text-slate-600 uppercase">Role</label>
            <select id="aRole" class="${base} mt-1 bg-white" ${isSelf ? 'disabled' : ''}>
              <option value="admin" ${a.role !== 'superadmin' ? 'selected' : ''}>Administrator</option>
              <option value="superadmin" ${a.role === 'superadmin' ? 'selected' : ''}>Super Admin (full access)</option>
            </select></div>
          <div><label class="text-[11px] font-bold text-slate-600 uppercase">New Password <span class="text-slate-400 normal-case font-semibold">(empty = unchanged)</span></label>
            <input id="aPass" type="text" class="${base} mt-1 bg-white" placeholder="••••••••"></div>
        </div>
        <div class="mt-4">
          <label class="text-[11px] font-bold text-slate-600 uppercase">Permissions — which sections they can use</label>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-2">
            ${Object.keys(PERM_LABELS).filter(p => p !== 'dashboard').map(p => `
              <label class="flex items-center gap-2 bg-[#F8F9FD] rounded-[8px] border border-slate-200 px-2.5 py-2 cursor-pointer text-[12px] font-semibold text-slate-700">
                <input type="checkbox" data-perm-pick="${p}" ${checked(p)} class="w-4 h-4 accent-[#1A56FF] flex-shrink-0"> ${esc(PERM_LABELS[p])}
              </label>`).join('')}
          </div>
          <p class="text-[10.5px] text-slate-400 mt-1">Super Admins get full access automatically. Dashboard is visible to everyone.</p>
        </div>
        <p id="aMsg" class="hidden mt-3 text-[12px] font-semibold rounded-lg px-3 py-2"></p>
        <div class="flex justify-end gap-2 mt-5">
          <button onclick="closeModal()" class="px-4 py-2.5 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-700">Cancel</button>
          <button id="aSave" class="px-5 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]">Update</button>
        </div>
      </div>`);
    $('aSave').addEventListener('click', async function () {
      const box = $('aMsg');
      box.classList.add('hidden');
      try {
        const perms = Array.from(document.querySelectorAll('[data-perm-pick]:checked')).map(el => el.dataset.permPick);
        const payload = { name: $('aName').value.trim(), email: $('aEmail').value.trim(), password: $('aPass').value };
        if (!isSelf) { payload.role = $('aRole').value; payload.permissions = perms; }
        await api('/api/admin/admins/' + a.id, { method: 'PUT', body: JSON.stringify(payload) });
        toast('Admin updated');
        closeModal(); renderAdmins();
      } catch (err) {
        box.textContent = err.message;
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        box.classList.remove('hidden');
      }
    });
  }

  /* ---------------- Notifications (Gmail / email pathano) ---------------- */
  async function renderNotify() {
    const view = $('view');
    const base = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF]';
    view.innerHTML = `<div class="text-center py-20 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-[22px]"></i><p class="text-[13px] mt-2">Loading...</p></div>`;
    try {
      const [sj, uj] = await Promise.all([api('/api/admin/settings'), api('/api/admin/users?limit=200')]);
      const s = sj.data || {};
      const users = (uj.data || []).filter(u => u.email && !String(u.email).includes('@mobile.studymart'));
      const providerLabel = (s.emailProvider === 'sendgrid') ? 'SendGrid API' : (s.emailProvider === 'brevo') ? 'Brevo API (free 300/day)' : 'Gmail / SMTP';
      view.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
            <h3 class="text-[15px] font-extrabold text-[#0F2043] mb-1"><i class="fa-solid fa-paper-plane text-[#16A34A] mr-1"></i>Send Notification</h3>
            <p class="text-[11px] text-slate-500 mb-4">Status: ${s.emailEnabled ? '<b class="text-[#16A34A]">ON (' + esc(providerLabel) + ')</b>' : '<b class="text-red-600">OFF</b> — Settings > Email theke ON korun'}</p>
            <div class="space-y-3">
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">To (email, comma diye onekgula)</label>
                <textarea id="nTo" rows="2" class="${base} mt-1" placeholder="student@gmail.com, arekjon@gmail.com"></textarea></div>
              <div class="grid grid-cols-2 gap-3">
                <div><label class="text-[11px] font-bold text-slate-600 uppercase">Registered student</label>
                  <select id="nUser" class="${base} mt-1"><option value="">-- select --</option>
                  ${users.map(u => `<option value="${u.id}">${esc(u.name)} (${esc(u.email)})</option>`).join('')}</select></div>
                <div class="flex items-end"><label class="flex items-center gap-2 text-[12px] font-bold text-slate-700 pb-2">
                  <input id="nAll" type="checkbox" class="w-4 h-4 accent-[#1A56FF]"> Sob student ke</label></div>
              </div>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Subject *</label>
                <input id="nSub" class="${base} mt-1" placeholder="e.g. Eid offer: 20% discount!"></div>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Message * ({{name}} likhle student er nam bosbe)</label>
                <textarea id="nMsg" rows="5" class="${base} mt-1" placeholder="Hi {{name}}, ..."></textarea></div>
            </div>
            <p id="nOut" class="hidden mt-3 text-[12px] font-semibold rounded-lg px-3 py-2"></p>
            <button id="nSend" class="mt-4 px-5 py-2.5 rounded-[10px] bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-[13px]"><i class="fa-solid fa-paper-plane mr-1"></i> Send Email</button>
          </div>
          <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5 h-fit">
            <h3 class="text-[15px] font-extrabold text-[#0F2043] mb-1"><i class="fa-solid fa-vial text-[#1A56FF] mr-1"></i>Test Email</h3>
            <p class="text-[11px] text-slate-500 mb-3">Age nijer Gmail-e test pathiye dekho setup thik ache kina</p>
            <div class="flex gap-2">
              <input id="tMail" type="email" class="${base}" placeholder="tomar@gmail.com">
              <button id="tSend" class="px-4 py-2 rounded-[8px] bg-[#0F2043] text-white font-bold text-[12px] flex-shrink-0">Test</button>
            </div>
            <p id="tOut" class="hidden mt-3 text-[12px] font-semibold rounded-lg px-3 py-2"></p>
            <div class="mt-4 text-[11.5px] text-slate-500 bg-[#F8F9FD] rounded-[10px] p-3 leading-relaxed">
              <b>Gmail setup:</b> Google Account > Security > 2-Step ON > App Passwords > "Mail" > 16-digit password copy kore Settings > Email > SMTP Pass-e boshan. Host: smtp.gmail.com, Port: 587.<br>
              <b>SendGrid:</b> Provider SendGrid kore API Key boshan.
            </div>
          </div>
        </div>`;
      $('nSend').addEventListener('click', async function () {
        const box = $('nOut');
        box.classList.add('hidden');
        try {
          const j = await api('/api/admin/notify', { method: 'POST', body: JSON.stringify({
            to: $('nTo').value, userId: $('nUser').value, sendToAll: $('nAll').checked,
            subject: $('nSub').value, message: $('nMsg').value }) });
          box.textContent = j.message;
          box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-[#E6F4EA] text-[#16A34A] border border-[#C8E9D5]';
          box.classList.remove('hidden'); toast(j.message);
        } catch (err) {
          box.textContent = err.message;
          box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
          box.classList.remove('hidden');
        }
      });
      $('tSend').addEventListener('click', async function () {
        const box = $('tOut');
        box.classList.add('hidden');
        try {
          const j = await api('/api/admin/email-test', { method: 'POST', body: JSON.stringify({ to: $('tMail').value.trim() }) });
          box.textContent = j.message;
          box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-[#E6F4EA] text-[#16A34A] border border-[#C8E9D5]';
          box.classList.remove('hidden');
        } catch (err) {
          box.textContent = err.message;
          box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
          box.classList.remove('hidden');
        }
      });
    } catch (err) { view.innerHTML = errorBox(err.message); }
  }

  /* ---------------- Notice (order mail alert + template setup) ----------------
   * - Admin email on new order (ON/OFF + addresses)
   * - All order-related user mail templates are edited here */
  async function renderNotice() {
    const view = $('view');
    const base = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF]';
    view.innerHTML = `<div class="text-center py-20 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-[22px]"></i><p class="text-[13px] mt-2">Loading notice settings...</p></div>`;
    try {
      const [sj, tj] = await Promise.all([api('/api/admin/settings'), api('/api/admin/email-templates')]);
      const s = sj.data || {};
      const t = tj.data || {};
      const orderKeys = ['new_order_admin', 'order_pending', 'order_confirmed', 'order_completed', 'order_cancelled', 'welcome']
        .filter(k => t[k]);
      const tplStyle = {
        new_order_admin: ['fa-bell', '#0F2043'],
        order_pending: ['fa-hourglass-half', '#F59E0B'],
        order_confirmed: ['fa-circle-check', '#1A56FF'],
        order_completed: ['fa-graduation-cap', '#16A34A'],
        order_cancelled: ['fa-circle-xmark', '#DC2626'],
        welcome: ['fa-hand-sparkles', '#7C3AED']
      };
      const kindTag = k => k === 'new_order_admin'
        ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0F2043] text-white">ADMIN MAIL</span>'
        : '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E6F0FF] text-[#1A56FF]">USER MAIL</span>';
      const providerLabel = (s.emailProvider === 'sendgrid') ? 'SendGrid API' : (s.emailProvider === 'brevo') ? 'Brevo API' : 'Gmail / SMTP';
      const mailOn = !!s.emailEnabled;
      const varList = ['name', 'phone', 'email', 'orderNo', 'total', 'items', 'payment', 'status', 'siteName'];
      const toggle = (id, attr, on, accent) => `
        <label class="inline-flex items-center gap-2 cursor-pointer select-none">
          <input ${id ? `id="${id}"` : ''} type="checkbox" ${attr} ${on ? 'checked' : ''} class="peer sr-only">
          <span class="relative h-5 w-9 rounded-full bg-slate-200 transition-colors peer-checked:bg-[${accent}] after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4"></span>
        </label>`;
      view.innerHTML = `
        <div class="rounded-[16px] p-5 mb-4 flex flex-wrap items-center gap-4 text-white shadow-sm" style="background:${mailOn ? 'linear-gradient(135deg,#16A34A 0%,#059669 100%)' : 'linear-gradient(135deg,#DC2626 0%,#B45309 100%)'}">
          <div class="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <i class="fa-solid ${mailOn ? 'fa-envelope-circle-check' : 'fa-triangle-exclamation'} text-[20px]"></i>
          </div>
          <div class="flex-1 min-w-[200px]">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[15px] font-extrabold">Email Service ${mailOn ? 'is Active' : 'is Paused'}</span>
              <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/20">${esc(providerLabel)}</span>
            </div>
            <p class="text-[12px] text-white/85 mt-0.5">${mailOn ? 'All order emails are being sent automatically.' : 'No emails are being sent right now. Enable it from Settings > Email.'}</p>
          </div>
          <a href="#/settings" class="px-4 py-2.5 rounded-[10px] bg-white font-bold text-[12px] text-[#0F2043] hover:bg-slate-100 flex-shrink-0"><i class="fa-solid fa-gear mr-1"></i>Email Settings</a>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-4 items-start">
          <div class="space-y-4 lg:sticky lg:top-[78px]">
            <div class="bg-white rounded-[16px] border border-slate-100 shadow-sm overflow-hidden">
              <div class="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-[12px] bg-[#FEF3C7] text-[#B45309] flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-bell"></i></div>
                  <div>
                    <h3 class="text-[14px] font-extrabold text-[#0F2043]">Admin Order Alerts</h3>
                    <p class="text-[11px] text-slate-500">Instant email for every new order.</p>
                  </div>
                </div>
                ${toggle('ntcAdminOn', '', !!s.adminNotifyEnabled, '#16A34A')}
              </div>
              <div class="px-5 pb-5">
                <label class="text-[11px] font-bold text-slate-600 uppercase">Admin Emails <span class="text-slate-400 normal-case font-semibold">(comma separated)</span></label>
                <input id="ntcAdminEmail" value="${esc(s.adminNotifyEmail || '')}" class="${base} mt-1" placeholder="owner@gmail.com, manager@gmail.com">
                <p id="ntcAdminMsg" class="hidden mt-3 text-[12px] font-semibold rounded-lg px-3 py-2"></p>
                <button id="ntcAdminSave" class="mt-3 w-full px-5 py-2.5 rounded-[10px] bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-[13px] transition">
                  <i class="fa-solid fa-floppy-disk mr-1"></i> Save Alert Settings
                </button>
              </div>
            </div>
            <div class="bg-white rounded-[16px] border border-slate-100 shadow-sm p-5">
              <div class="flex items-center gap-3 mb-1">
                <div class="w-10 h-10 rounded-[12px] bg-[#E6F0FF] text-[#1A56FF] flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-vial"></i></div>
                <div>
                  <h3 class="text-[14px] font-extrabold text-[#0F2043]">Send a Test Email</h3>
                  <p class="text-[11px] text-slate-500">Verify your email provider before going live.</p>
                </div>
              </div>
              <div class="flex gap-2 mt-3">
                <input id="ntcTestMail" type="email" class="${base} flex-1" placeholder="you@example.com">
                <button id="ntcTestSend" class="px-5 py-2 rounded-[10px] bg-[#0F2043] hover:bg-[#16294F] text-white font-bold text-[12px] flex-shrink-0 transition"><i class="fa-solid fa-paper-plane mr-1"></i>Send</button>
              </div>
              <p id="ntcTestMsg" class="hidden mt-3 text-[12px] font-semibold rounded-lg px-3 py-2"></p>
            </div>
            <div class="bg-white rounded-[16px] border border-slate-100 shadow-sm p-5">
              <div class="flex items-center gap-3 mb-1">
                <div class="w-10 h-10 rounded-[12px] bg-[#F1F5F9] text-[#0F2043] flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-clock-rotate-left"></i></div>
                <div class="flex-1 min-w-0">
                  <h3 class="text-[14px] font-extrabold text-[#0F2043]">Recent Email Activity</h3>
                  <p class="text-[11px] text-slate-500">Last 20 sends — fail/skip hole reason ekhane dekhabe.</p>
                </div>
                <button id="ntcLogRefresh" class="w-9 h-9 rounded-[8px] bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center flex-shrink-0" title="Refresh"><i class="fa-solid fa-rotate-right text-[13px]"></i></button>
              </div>
              <div id="ntcMailLog" class="mt-3 space-y-2 max-h-[320px] overflow-y-auto"><p class="text-[12px] text-slate-400 text-center py-4">Loading...</p></div>
            </div>
          </div>
          <div class="space-y-4">
            <div class="rounded-[16px] p-5 text-white shadow-sm" style="background:linear-gradient(135deg,#1A56FF 0%,#4F46E5 60%,#7C3AED 100%)">
              <div class="flex items-center gap-2">
                <i class="fa-solid fa-envelope-open-text"></i>
                <h3 class="text-[14px] font-extrabold">Email Templates (${orderKeys.length})</h3>
              </div>
              <p class="text-[11.5px] text-white/85 mt-1 mb-3">Sent automatically on order events. Click any variable to copy it into your subject or body.</p>
              <div class="flex flex-wrap gap-1.5">
                ${varList.map(v => `<button type="button" data-var="{{${v}}}" title="Click to copy" class="px-2 py-1 rounded-[6px] bg-white/15 hover:bg-white/30 border border-white/20 font-mono text-[11px] font-bold transition">{{${v}}}</button>`).join('')}
              </div>
            </div>
            ${orderKeys.map(k => {
              const st = tplStyle[k] || ['fa-envelope', '#1A56FF'];
              return `
              <div class="bg-white rounded-[16px] border border-slate-100 shadow-sm overflow-hidden" style="border-left:4px solid ${st[1]}" data-tpl="${esc(k)}">
                <div class="px-5 pt-4 pb-3 flex items-center gap-3">
                  <div class="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 text-white" style="background:${st[1]}"><i class="fa-solid ${st[0]} text-[14px]"></i></div>
                  <div class="flex-1 min-w-0">
                    <div class="text-[13.5px] font-extrabold text-[#0F2043] truncate">${esc(t[k].name || k)}</div>
                    <div class="mt-0.5">${kindTag(k)}</div>
                  </div>
                  ${toggle('', 'data-t-enabled', t[k].enabled !== false, '#16A34A')}
                </div>
                <div class="px-5 pb-5 space-y-3">
                  <div>
                    <label class="text-[10px] font-bold text-slate-500 uppercase">Subject</label>
                    <input data-t-subject value="${esc(t[k].subject || '')}" class="${base} mt-1" placeholder="Email subject...">
                  </div>
                  <div>
                    <label class="text-[10px] font-bold text-slate-500 uppercase">Body <span class="text-slate-400 normal-case font-semibold">(each line = new paragraph)</span></label>
                    <textarea data-t-body rows="5" class="${base} mt-1" placeholder="Email body...">${esc(t[k].body || '')}</textarea>
                  </div>
                </div>
              </div>`;
            }).join('')}
            <div class="bg-white rounded-[16px] border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-2 lg:sticky lg:bottom-4">
              <button id="ntcTplSave" class="flex-1 min-w-[160px] px-5 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px] transition"><i class="fa-solid fa-floppy-disk mr-1"></i> Save Templates</button>
              <button id="ntcTplReset" class="px-4 py-2.5 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-700 transition">Reset to Default</button>
            </div>
            <p id="ntcTplMsg" class="hidden text-[12px] font-semibold rounded-lg px-3 py-2"></p>
          </div>
        </div>`;
      view.querySelectorAll('[data-var]').forEach(ch => ch.addEventListener('click', () => {
        const v = ch.dataset.var;
        const done = () => toast('Copied ' + v);
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done).catch(done);
        else done();
      }));
      $('ntcAdminSave').addEventListener('click', async function () {
        const box = $('ntcAdminMsg');
        box.classList.add('hidden');
        try {
          await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({
            adminNotifyEnabled: $('ntcAdminOn').checked,
            adminNotifyEmail: $('ntcAdminEmail').value.trim()
          }) });
          box.textContent = 'Alert settings saved. New orders will notify these emails.';
          box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-[#E6F4EA] text-[#16A34A] border border-[#C8E9D5]';
          box.classList.remove('hidden'); toast('Alert settings saved');
        } catch (err) {
          box.textContent = err.message;
          box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
          box.classList.remove('hidden');
        }
      });
      $('ntcTestSend').addEventListener('click', async function () {
        const box = $('ntcTestMsg');
        box.classList.add('hidden');
        try {
          const j = await api('/api/admin/email-test', { method: 'POST', body: JSON.stringify({ to: $('ntcTestMail').value.trim() }) });
          box.textContent = j.message;
          box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-[#E6F4EA] text-[#16A34A] border border-[#C8E9D5]';
          box.classList.remove('hidden');
        } catch (err) {
          box.textContent = err.message;
          box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
          box.classList.remove('hidden');
        }
      });
      async function loadMailLog() {
        const box = $('ntcMailLog');
        if (!box) return;
        try {
          const j = await api('/api/admin/email-logs');
          const logs = (j.data || []).slice(0, 20);
          if (!logs.length) { box.innerHTML = '<p class="text-[12px] text-slate-400 text-center py-4">No emails sent yet. Order korle ba test mail pathale ekhane dekhabe.</p>'; return; }
          box.innerHTML = logs.map(function (l) {
            const ok = !!l.ok;
            const when = (l.at || '').slice(0, 16).replace('T', ' ');
            const info = ok ? 'Sent' : esc(l.error || l.reason || 'Failed');
            return '<div class="flex items-start gap-2.5 p-2.5 rounded-[10px] ' + (ok ? 'bg-[#E6F4EA]/60' : 'bg-red-50/70') + '">'
              + '<div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ' + (ok ? 'bg-[#16A34A] text-white' : 'bg-red-500 text-white') + '"><i class="fa-solid ' + (ok ? 'fa-check' : 'fa-xmark') + ' text-[11px]"></i></div>'
              + '<div class="flex-1 min-w-0"><div class="text-[12px] font-bold text-[#0F2043] truncate">' + esc(l.to || '-') + '</div>'
              + '<div class="text-[11px] text-slate-500 truncate">' + esc((l.tag || 'mail') + ' • ' + (l.subject || '')) + '</div>'
              + '<div class="text-[11px] font-semibold ' + (ok ? 'text-[#16A34A]' : 'text-red-600') + '">' + info + '</div></div>'
              + '<div class="text-[10px] text-slate-400 flex-shrink-0">' + esc(when) + '</div></div>';
          }).join('');
        } catch (err) { box.innerHTML = '<p class="text-[12px] text-red-500 text-center py-4">' + esc(err.message) + '</p>'; }
      }
      const logRef = $('ntcLogRefresh');
      if (logRef) logRef.addEventListener('click', loadMailLog);
      loadMailLog();
      $('ntcTplSave').addEventListener('click', async function () {
        const box = $('ntcTplMsg');
        box.classList.add('hidden');
        try {
          const payload = {};
          view.querySelectorAll('[data-tpl]').forEach(card => {
            const k = card.dataset.tpl;
            payload[k] = {
              subject: card.querySelector('[data-t-subject]').value,
              body: card.querySelector('[data-t-body]').value,
              enabled: card.querySelector('[data-t-enabled]').checked
            };
          });
          await api('/api/admin/email-templates', { method: 'PUT', body: JSON.stringify(payload) });
          box.textContent = 'Templates saved. Future emails will use this content.';
          box.className = 'text-[12px] font-semibold rounded-lg px-3 py-2 bg-[#E6F4EA] text-[#16A34A] border border-[#C8E9D5]';
          box.classList.remove('hidden'); toast('Templates saved');
        } catch (err) {
          box.textContent = err.message;
          box.className = 'text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
          box.classList.remove('hidden');
        }
      });
      $('ntcTplReset').addEventListener('click', function () {
        confirmDialog('Reset templates?', 'All mail templates will be restored to their default content.', async function () {
          await api('/api/admin/email-templates/reset', { method: 'POST' });
          toast('Templates reset'); renderNotice();
        }, 'Yes, Reset');
      });
    } catch (err) { view.innerHTML = errorBox(err.message); }
  }

  /* ---------------- Settings ---------------- */
  /* Settings: Nav Bar Telegram multi links (dropdown: Group 1, Group 2...) */
  function settingsTgList(s) {
    if (Array.isArray(s.telegramLinks) && s.telegramLinks.length) return s.telegramLinks;
    if (s.telegram && String(s.telegram).trim()) return [{ label: 'Group 1', url: String(s.telegram).trim() }];
    return [{ label: 'Group 1', url: '' }];
  }
  function tgLinksRows(s) {
    return settingsTgList(s).map((x, i) => `
      <div class="flex gap-2" data-stg-row="${i}">
        <input data-stg-label value="${esc((x && x.label) || ('Group ' + (i + 1)))}" placeholder="Label (e.g. Group 1)" class="border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white w-[38%] min-w-0">
        <input data-stg-url value="${esc((x && (x.url || x.link)) || '')}" placeholder="https://t.me/+xxxx" class="border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white flex-1 min-w-0">
        <button type="button" data-stg-rm="${i}" class="w-9 rounded-[8px] bg-red-50 text-red-600 hover:bg-red-100 flex-shrink-0" title="Remove"><i class="fa-solid fa-trash text-[11px]"></i></button>
      </div>`).join('');
  }
  function collectSettingsTgLinks() {
    const rows = Array.prototype.slice.call(document.querySelectorAll('[data-stg-row]'));
    return rows.map((row, i) => ({
      label: String((row.querySelector('[data-stg-label]') || {}).value || ('Group ' + (i + 1))).trim().slice(0, 80),
      url: String((row.querySelector('[data-stg-url]') || {}).value || '').trim().slice(0, 2000)
    })).filter(x => x.url);
  }
  async function renderSettings() {
    const view = $('view');
    view.innerHTML = `<div class="text-center py-20 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-[22px]"></i><p class="text-[13px] mt-2">Loading settings...</p></div>`;
    const base = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF]';
    try {
      const json = await api('/api/admin/settings');
      const s = json.data || {};
      view.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
            <h3 class="text-[15px] font-extrabold text-[#0F2043] mb-1"><i class="fa-solid fa-globe text-[#1A56FF] mr-1"></i>Site Information</h3>
            <p class="text-[11px] text-slate-500 mb-4">Empty rakhle empty e thakbe - kono default auto add hobe na</p>
            <!-- Notice Bar -->
            <div class="mb-4 bg-gradient-to-r from-[#EEF2FF] to-[#F5F3FF] rounded-[12px] border border-[#E0D8FF] p-4">
              <div class="flex items-center justify-between mb-2">
                <label class="text-[11px] font-bold text-slate-600 uppercase"><i class="fa-solid fa-bullhorn text-[#7C3AED] mr-1"></i>Notice Bar (Nav er upore)</label>
                <label class="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                  <input id="sNoticeEnabled" type="checkbox" ${s.noticeEnabled ? 'checked' : ''} class="w-4 h-4 accent-[#1A56FF]"> Enable
                </label>
              </div>
              <div id="sNoticePreview" class="rounded-[8px] py-2.5 px-3 flex items-center justify-center gap-2 text-[12px] font-semibold text-center" style="background:${esc(s.noticeBg && String(s.noticeBg).trim()!=='' ? s.noticeBg : 'linear-gradient(90deg,#1A56FF 0%,#4F46E5 50%,#7C3AED 100%)')};color:${esc(s.noticeColor || '#ffffff')}">
                <i class="fa-solid fa-bullhorn text-[#FACC15]"></i>
                <span id="sNoticePreviewText">${esc(s.noticeText || 'Preview: Notice text ekhane dekhabe')}</span>
                <span id="sNoticePreviewLink" class="${s.noticeLink ? '' : 'hidden'} ml-1 px-2 py-0.5 rounded-full bg-white text-[#1A56FF] text-[10px] font-bold">View</span>
              </div>
              <div class="grid grid-cols-1 gap-3 mt-3">
                <div><label class="text-[10px] font-bold text-slate-500 uppercase">Notice Text</label><input id="sNoticeText" value="${esc(s.noticeText || '')}" class="${base} mt-1" placeholder="e.g. Admission Open! Special 20% discount..."></div>
                <div><label class="text-[10px] font-bold text-slate-500 uppercase">Link URL (optional)</label><input id="sNoticeLink" value="${esc(s.noticeLink || '')}" class="${base} mt-1" placeholder="https://..."></div>
                <div class="grid grid-cols-2 gap-3">
                  <div><label class="text-[10px] font-bold text-slate-500 uppercase">Background</label><div class="flex items-center gap-2 mt-1"><input id="sNoticeBg" type="color" value="${esc(s.noticeBg && s.noticeBg.startsWith('#') ? s.noticeBg : '#1A56FF')}" class="w-9 h-8 rounded border border-slate-200"><input id="sNoticeBgText" value="${esc(s.noticeBg || '')}" class="${base}" placeholder="#1A56FF or gradient"></div></div>
                  <div><label class="text-[10px] font-bold text-slate-500 uppercase">Text Color</label><div class="flex items-center gap-2 mt-1"><input id="sNoticeColor" type="color" value="${esc(s.noticeColor || '#ffffff')}" class="w-9 h-8 rounded border border-slate-200"><input id="sNoticeColorText" value="${esc(s.noticeColor || '')}" class="${base}" placeholder="#ffffff"></div></div>
                </div>
                <label class="flex items-center gap-2 text-[11px] font-semibold text-slate-600"><input id="sNoticeDismissible" type="checkbox" ${s.noticeDismissible !== false ? 'checked' : ''} class="w-4 h-4 accent-[#1A56FF]"> Dismissible (close button dekhabe)</label>
                <p class="text-[10px] text-slate-400">Empty text rakhle bar auto hide hobe. Sundor gradient default deya ache.</p>
              </div>
            </div>
            <!-- Maintenance Mode -->
            <div class="mb-4 bg-gradient-to-r from-[#FFF7ED] to-[#FEF2F2] rounded-[12px] border border-[#FED7AA] p-4">
              <div class="flex items-center justify-between mb-2">
                <label class="text-[11px] font-bold text-slate-600 uppercase"><i class="fa-solid fa-screwdriver-wrench text-[#EA580C] mr-1"></i>Maintenance Mode</label>
                <label class="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                  <input id="sMaintEnabled" type="checkbox" ${s.maintenanceEnabled ? 'checked' : ''} class="w-4 h-4 accent-[#EA580C]"> Enable
                </label>
              </div>
              <div class="grid grid-cols-1 gap-3">
                <div><label class="text-[10px] font-bold text-slate-500 uppercase">Title</label><input id="sMaintTitle" value="${esc(s.maintenanceTitle || '')}" class="${base} mt-1" placeholder="Maintenance cholche 🔧"></div>
                <div><label class="text-[10px] font-bold text-slate-500 uppercase">Message</label><textarea id="sMaintMsg" rows="2" class="${base} mt-1" placeholder="Amra site update korchi...">${esc(s.maintenanceMessage || '')}</textarea></div>
                <div><label class="text-[10px] font-bold text-slate-500 uppercase">Back by / ETA (optional)</label><input id="sMaintEta" value="${esc(s.maintenanceEta || '')}" class="${base} mt-1" placeholder="e.g. Tonight 10 PM"></div>
              </div>
              <div class="flex items-center gap-2 mt-3">
                <a href="maintenance.html" target="_blank" class="px-3 py-2 rounded-[8px] bg-white border border-slate-200 text-[11.5px] font-bold text-slate-700 hover:bg-slate-50"><i class="fa-solid fa-eye mr-1"></i> Preview Page</a>
                <p class="text-[10px] text-slate-400">ON thakle sob public page maintenance dekhabe. Admin panel khola thakbe.</p>
              </div>
            </div>
            <!-- Logo Upload -->
            <div class="mb-4 bg-[#F8F9FD] rounded-[12px] border border-dashed border-slate-200 p-4">
              <label class="text-[11px] font-bold text-slate-600 uppercase"><i class="fa-solid fa-image text-[#1A56FF] mr-1"></i>Site Logo</label>
              <div class="mt-2 bg-white rounded-[10px] border border-slate-200 overflow-hidden min-h-[96px] flex items-center justify-center p-3">
                <img id="sLogoPreview" src="${esc(s.logoUrl || '')}" alt="Logo" class="${s.logoUrl ? '' : 'hidden'} max-h-[96px] max-w-[260px] w-auto h-auto object-contain">
                <div id="sLogoNoImg" class="${s.logoUrl ? 'hidden' : 'flex'} flex-col items-center justify-center py-4 text-slate-400">
                  <i class="fa-regular fa-image text-[26px] mb-1"></i>
                  <p class="text-[11px] font-semibold">No logo uploaded</p>
                  <p class="text-[10px]">Default SVG logo dekhabe</p>
                </div>
              </div>
              <input id="sLogoUrl" value="${esc(s.logoUrl || '')}" class="${base} mt-3" placeholder="https://... ba upload korle auto base64 bosbe">
              <div class="flex items-center gap-2 mt-2">
                <label class="flex-1 px-3 py-2 rounded-[8px] bg-[#0F2043] text-white text-[12px] font-bold text-center cursor-pointer hover:bg-[#16294F]">
                  <i class="fa-solid fa-upload mr-1"></i> Logo Upload
                  <input id="sLogoFile" type="file" accept="image/*,.svg" class="hidden">
                </label>
                <button id="sLogoRemove" type="button" class="px-3 py-2 rounded-[8px] bg-red-50 text-red-600 text-[12px] font-bold border border-red-100 hover:bg-red-100">Remove</button>
              </div>
              <p class="text-[10px] text-slate-400 mt-1">Any size. PNG/JPG/SVG/WebP. Proper fit (object-contain) auto hobe.</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Site Name</label><input id="sSiteName" value="${esc(s.siteName != null ? s.siteName : '')}" placeholder="" class="${base} mt-1"></div>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Tagline</label><input id="sTagline" value="${esc(s.tagline != null ? s.tagline : '')}" placeholder="" class="${base} mt-1"></div>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Currency Symbol</label><input id="sCurrency" value="${esc(s.currency != null ? s.currency : '')}" placeholder="" class="${base} mt-1"></div>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Phone</label><input id="sPhone" value="${esc(s.phone != null ? s.phone : '')}" placeholder="" class="${base} mt-1"></div>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Email</label><input id="sEmail" value="${esc(s.email != null ? s.email : '')}" placeholder="" class="${base} mt-1"></div>
              <div class="sm:col-span-2">
                <label class="text-[11px] font-bold text-slate-600 uppercase">Telegram Links (Nav Bar dropdown)</label>
                <div id="sTgLinksBox" class="space-y-2 mt-1">${tgLinksRows(s)}</div>
                <button id="sTgLinkAdd" type="button" class="mt-2 px-3 py-1.5 rounded-[8px] bg-[#E6F0FF] text-[#1A56FF] font-bold text-[12px] hover:bg-[#DDE8FF]"><i class="fa-solid fa-plus mr-1"></i> Add Telegram Link</button>
                <p class="text-[10px] text-slate-400 mt-1">1 ta thakle direct open hobe — ekadhik thakle Nav Bar-e Telegram click-e dropdown (Group 1, Group 2...) asbe, kono dropdown icon thakbe na.</p>
              </div>
              <div class="sm:col-span-2"><label class="text-[11px] font-bold text-slate-600 uppercase">Address</label><input id="sAddress" value="${esc(s.address != null ? s.address : '')}" placeholder="" class="${base} mt-1"></div>
              <div class="sm:col-span-2"><label class="text-[11px] font-bold text-slate-600 uppercase">Footer Text</label><input id="sFooter" value="${esc(s.footerText != null ? s.footerText : '')}" placeholder="" class="${base} mt-1"></div>
            </div>
            <button id="saveSettings" class="mt-5 px-5 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]">
              <i class="fa-solid fa-floppy-disk mr-1"></i> Save Settings
            </button>
          </div>

          <div class="space-y-4">
            <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
              <h3 class="text-[15px] font-extrabold text-[#0F2043] mb-1"><i class="fa-solid fa-key text-[#1A56FF] mr-1"></i>Change Admin Password</h3>
              <p class="text-[11px] text-slate-500 mb-4">Use a strong password (minimum 6 characters)</p>
              <div class="space-y-3">
                <div><label class="text-[11px] font-bold text-slate-600 uppercase">Current Password</label><input id="pCurrent" type="password" class="${base} mt-1"></div>
                <div><label class="text-[11px] font-bold text-slate-600 uppercase">New Password</label><input id="pNew" type="password" class="${base} mt-1"></div>
                <div><label class="text-[11px] font-bold text-slate-600 uppercase">Confirm New Password</label><input id="pConfirm" type="password" class="${base} mt-1"></div>
              </div>
              <p id="passMsg" class="hidden mt-4 text-[12px] font-semibold rounded-lg px-3 py-2"></p>
              <button id="savePassword" class="mt-5 px-5 py-2.5 rounded-[10px] bg-[#0F2043] hover:bg-[#16294F] text-white font-bold text-[13px]">
                <i class="fa-solid fa-shield-halved mr-1"></i> Update Password
              </button>
            </div>

            <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
              <h3 class="text-[15px] font-extrabold text-[#0F2043] mb-1"><i class="fa-brands fa-google text-[#1A56FF] mr-1"></i>Google Login</h3>
              <p class="text-[11px] text-slate-500 mb-4">Student ra "Continue with Google" diye login korte parbe</p>
              <label class="flex items-center gap-2 text-[12px] font-bold text-slate-700 mb-3">
                <input id="sGoogleEnabled" type="checkbox" ${s.googleLoginEnabled ? 'checked' : ''} class="w-4 h-4 accent-[#1A56FF]"> Enable Google Login
              </label>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Google Client ID</label>
              <input id="sGoogleClientId" value="${esc(s.googleClientId || '')}" class="${base} mt-1" placeholder="xxxxxx.apps.googleusercontent.com"></div>
              <p id="googleMsg" class="hidden mt-3 text-[12px] font-semibold rounded-lg px-3 py-2"></p>
              <button id="saveGoogle" class="mt-3 px-5 py-2.5 rounded-[10px] bg-[#0F2043] hover:bg-[#16294F] text-white font-bold text-[13px]">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Save Google Settings
              </button>
            </div>

            <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
              <h3 class="text-[15px] font-extrabold text-[#0F2043] mb-1"><i class="fa-solid fa-credit-card text-[#16A34A] mr-1"></i>PipaPay Payment</h3>
              <p class="text-[11px] text-slate-500 mb-4">Student ra bKash / Nagad / Rocket diye online payment korte parbe</p>
              <label class="flex items-center gap-2 text-[12px] font-bold text-slate-700 mb-3">
                <input id="sPipraEnabled" type="checkbox" ${s.piprapayEnabled ? 'checked' : ''} class="w-4 h-4 accent-[#16A34A]"> Enable Online Payment
              </label>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">PipaPay API Key</label>
              <input id="sPipraKey" type="password" value="${esc(s.piprapayApiKey || '')}" class="${base} mt-1" placeholder="PipaPay dashboard theke API key"></div>
              <div class="mt-3"><label class="text-[11px] font-bold text-slate-600 uppercase">API Base URL</label>
              <input id="sPipraBase" value="${esc(s.piprapayBaseUrl || '')}" class="${base} mt-1" placeholder="https://sandbox.piprapay.com"></div>
              <p id="pipraMsg" class="hidden mt-3 text-[12px] font-semibold rounded-lg px-3 py-2"></p>
              <button id="savePipra" class="mt-3 px-5 py-2.5 rounded-[10px] bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-[13px]">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Save Payment Settings
              </button>
            </div>

            <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
              <h3 class="text-[15px] font-extrabold text-[#0F2043] mb-4"><i class="fa-brands fa-telegram text-[#229ED9] mr-1"></i>Telegram Bot</h3>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Bot Token (@BotFather)</label>
              <input id="sBotToken" type="password" value="${esc(s.botToken || '')}" class="${base} mt-1" placeholder="123456:ABC-DEF..."></div>
              <p id="botMsg" class="hidden mt-3 text-[12px] font-semibold rounded-lg px-3 py-2"></p>
              <button id="saveBot" class="mt-3 px-5 py-2.5 rounded-[10px] bg-[#229ED9] hover:bg-[#1B8AC0] text-white font-bold text-[13px]">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Save Bot Token
              </button>
            </div>

            <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
              <h3 class="text-[15px] font-extrabold text-[#0F2043] mb-1"><i class="fa-solid fa-envelope text-[#16A34A] mr-1"></i>Email Notifications (Brevo / Gmail)</h3>
              <p class="text-[11px] text-slate-500 mb-4">Order / welcome / custom mail ekhan theke jabe. <b>Brevo FREE</b> (300/day, card lage na) recommended — Test Notifications menu theke kora jabe.</p>
              <label class="flex items-center gap-2 text-[12px] font-bold text-slate-700 mb-3">
                <input id="sEmailEnabled" type="checkbox" ${s.emailEnabled ? 'checked' : ''} class="w-4 h-4 accent-[#16A34A]"> Enable Email Notifications
              </label>
              <div class="grid grid-cols-2 gap-3 mb-3">
                <div><label class="text-[11px] font-bold text-slate-600 uppercase">Provider</label>
                  <select id="sEmailProvider" class="${base} mt-1">
                    <option value="smtp" ${(!s.emailProvider || s.emailProvider === 'smtp') ? 'selected' : ''}>Gmail / SMTP</option>
                    <option value="brevo" ${s.emailProvider === 'brevo' ? 'selected' : ''}>Brevo API (FREE 300/day)</option>
                    <option value="sendgrid" ${s.emailProvider === 'sendgrid' ? 'selected' : ''}>SendGrid API</option>
                  </select></div>
                <div><label class="text-[11px] font-bold text-slate-600 uppercase">Sender Email *</label>
                  <input id="sSenderEmail" value="${esc(s.senderEmail || '')}" class="${base} mt-1" placeholder="studymart@gmail.com"></div>
              </div>
              <div class="mb-3"><label class="text-[11px] font-bold text-slate-600 uppercase">Sender Name</label>
                <input id="sSenderName" value="${esc(s.senderName || '')}" class="${base} mt-1" placeholder="StudyMart"></div>
              <div id="smtpBox" class="grid grid-cols-2 gap-3">
                <div class="col-span-2 text-[11px] font-bold text-slate-500">GMAIL / SMTP SETTINGS</div>
                <div><label class="text-[11px] font-bold text-slate-600 uppercase">SMTP Host</label>
                  <input id="sSmtpHost" value="${esc(s.smtpHost || 'smtp.gmail.com')}" class="${base} mt-1"></div>
                <div><label class="text-[11px] font-bold text-slate-600 uppercase">Port</label>
                  <input id="sSmtpPort" value="${esc(s.smtpPort || '587')}" class="${base} mt-1"></div>
                <div><label class="text-[11px] font-bold text-slate-600 uppercase">SMTP User (gmail)</label>
                  <input id="sSmtpUser" value="${esc(s.smtpUser || '')}" class="${base} mt-1" placeholder="studymart@gmail.com"></div>
                <div><label class="text-[11px] font-bold text-slate-600 uppercase">App Password</label>
                  <input id="sSmtpPass" type="password" value="" class="${base} mt-1" placeholder="${s.smtpUser ? 'Saved (change korte chaile likhun)' : 'xxxx xxxx xxxx xxxx'}"></div>
                <label class="col-span-2 flex items-center gap-2 text-[12px] font-semibold text-slate-600"><input id="sSmtpSecure" type="checkbox" ${s.smtpSecure ? 'checked' : ''} class="w-4 h-4 accent-[#16A34A]"> SSL (port 465 hole tick din)</label>
              </div>
              <div id="sgBox" class="mt-3">
                <label class="text-[11px] font-bold text-slate-600 uppercase">SendGrid API Key</label>
                <input id="sSgKey" type="password" value="" class="${base} mt-1" placeholder="SG.xxx...">
              </div>
              <div id="brevoBox" class="mt-3">
                <label class="text-[11px] font-bold text-slate-600 uppercase">Brevo API Key (xkeysib-...)</label>
                <input id="sBrevoKey" type="password" value="" class="${base} mt-1" placeholder="xkeysib-xxx...">
                <p class="text-[10.5px] text-slate-500 mt-1">app.brevo.com → profile menu → SMTP &amp; API → API Keys → Generate. FREE 300 mail/day. Sender Email-ta Brevo-te (Senders &amp; IP) verify kora thakte hobe.</p>
              </div>
              <p id="emailMsg" class="hidden mt-3 text-[12px] font-semibold rounded-lg px-3 py-2"></p>
              <button id="saveEmail" class="mt-3 px-5 py-2.5 rounded-[10px] bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-[13px]">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Save Email Settings
              </button>
            </div>

            <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
              <h3 class="text-[15px] font-extrabold text-[#0F2043] mb-3"><i class="fa-solid fa-server text-[#1A56FF] mr-1"></i>System Info</h3>
              <div id="sysInfo" class="text-[12.5px] text-slate-600 space-y-2">
                <div class="flex items-center gap-2"><i class="fa-solid fa-spinner fa-spin text-slate-400"></i> Checking server...</div>
              </div>
            </div>
          </div>
        </div>`;

      bindSettingsActions();
    } catch (err) {
      view.innerHTML = errorBox(err.message);
    }
  }

  function bindSettingsActions() {
    // logo upload handlers
    const logoFile = $('sLogoFile');
    if (logoFile) logoFile.addEventListener('change', function(e){
      const file = e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = function(ev){
        const dataUrl = ev.target.result;
        $('sLogoUrl').value = dataUrl;
        const img = $('sLogoPreview');
        img.src = dataUrl;
        img.classList.remove('hidden');
        $('sLogoNoImg').classList.add('hidden');
        toast('Logo loaded - Save korun');
      };
      reader.readAsDataURL(file);
    });
    const logoUrlEl = $('sLogoUrl');
    if (logoUrlEl) logoUrlEl.addEventListener('input', function(){
      const v = this.value.trim();
      const img = $('sLogoPreview');
      if(v){ img.src = v; img.classList.remove('hidden'); $('sLogoNoImg').classList.add('hidden'); }
      else { img.classList.add('hidden'); $('sLogoNoImg').classList.remove('hidden'); }
    });
    const logoRemove = $('sLogoRemove');
    if (logoRemove) logoRemove.addEventListener('click', function(){
      $('sLogoUrl').value = '';
      $('sLogoPreview').classList.add('hidden');
      $('sLogoNoImg').classList.remove('hidden');
    });

    // Nav Bar Telegram multi links add/remove
    const tgAddBtn = $('sTgLinkAdd');
    if (tgAddBtn) tgAddBtn.addEventListener('click', function(){
      const box = $('sTgLinksBox');
      if (!box) return;
      const n = box.querySelectorAll('[data-stg-row]').length;
      if (n >= 10) { toast('Max 10 telegram links', false); return; }
      const div = document.createElement('div');
      div.className = 'flex gap-2';
      div.setAttribute('data-stg-row', String(n));
      div.innerHTML = '<input data-stg-label value="Group ' + (n + 1) + '" placeholder="Label (e.g. Group 1)" class="border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white w-[38%] min-w-0">'
        + '<input data-stg-url value="" placeholder="https://t.me/+xxxx" class="border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white flex-1 min-w-0">'
        + '<button type="button" data-stg-rm="' + n + '" class="w-9 rounded-[8px] bg-red-50 text-red-600 hover:bg-red-100 flex-shrink-0" title="Remove"><i class="fa-solid fa-trash text-[11px]"></i></button>';
      box.appendChild(div);
      bindStgRemove(div);
    });
    function bindStgRemove(scope){
      (scope.querySelectorAll ? scope.querySelectorAll('[data-stg-rm]') : []).forEach(function(btn){
        if (btn.dataset.stgBound) return;
        btn.dataset.stgBound = '1';
        btn.addEventListener('click', function(){
          const row = btn.closest('[data-stg-row]');
          if (row) row.remove();
        });
      });
    }
    bindStgRemove(document);

    // notice preview live
    function updateNoticePreview(){
      const txtEl = $('sNoticeText');
      const linkEl = $('sNoticeLink');
      const bgEl = $('sNoticeBg');
      const bgTextEl = $('sNoticeBgText');
      const colorEl = $('sNoticeColor');
      const colorTextEl = $('sNoticeColorText');
      const prev = $('sNoticePreview');
      const prevText = $('sNoticePreviewText');
      const prevLink = $('sNoticePreviewLink');
      if (!prev) return;
      if (prevText) prevText.textContent = (txtEl && txtEl.value.trim()) || 'Preview: Notice text ekhane dekhabe';
      if (prevLink) {
        if (linkEl && linkEl.value.trim()) prevLink.classList.remove('hidden');
        else prevLink.classList.add('hidden');
      }
      const bgVal = (bgTextEl && bgTextEl.value.trim()) || (bgEl && bgEl.value) || '';
      const colorVal = (colorTextEl && colorTextEl.value.trim()) || (colorEl && colorEl.value) || '#ffffff';
      prev.style.background = bgVal && bgVal.trim() !== '' ? bgVal : 'linear-gradient(90deg,#1A56FF 0%,#4F46E5 50%,#7C3AED 100%)';
      prev.style.color = colorVal || '#ffffff';
    }
    ['sNoticeText','sNoticeLink','sNoticeBg','sNoticeBgText','sNoticeColor','sNoticeColorText'].forEach(id=>{
      const el = $(id);
      if (el) el.addEventListener('input', updateNoticePreview);
    });
    const bgPicker = $('sNoticeBg');
    if (bgPicker) bgPicker.addEventListener('input', function(){ const t=$('sNoticeBgText'); if(t) t.value=this.value; updateNoticePreview(); });
    const colorPicker = $('sNoticeColor');
    if (colorPicker) colorPicker.addEventListener('input', function(){ const t=$('sNoticeColorText'); if(t) t.value=this.value; updateNoticePreview(); });
    const bgText = $('sNoticeBgText');
    if (bgText) bgText.addEventListener('input', function(){ const p=$('sNoticeBg'); if(p && this.value.startsWith('#') && this.value.length===7) p.value=this.value; updateNoticePreview(); });
    const colorText = $('sNoticeColorText');
    if (colorText) colorText.addEventListener('input', function(){ const p=$('sNoticeColor'); if(p && this.value.startsWith('#') && this.value.length===7) p.value=this.value; updateNoticePreview(); });
    // initial preview
    updateNoticePreview();

    $('saveSettings').addEventListener('click', async function () {
      try {
        const bgVal = ($('sNoticeBgText') && $('sNoticeBgText').value.trim()) || ($('sNoticeBg') && $('sNoticeBg').value) || '';
        const colorVal = ($('sNoticeColorText') && $('sNoticeColorText').value.trim()) || ($('sNoticeColor') && $('sNoticeColor').value) || '';
        const tgLinks = collectSettingsTgLinks();
        await api('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({
            logoUrl: $('sLogoUrl').value.trim(),
            siteName: $('sSiteName').value, tagline: $('sTagline').value, currency: $('sCurrency').value,
            phone: $('sPhone').value, email: $('sEmail').value,
            telegram: tgLinks.length ? tgLinks[0].url : '',
            telegramLinks: tgLinks,
            address: $('sAddress').value, footerText: $('sFooter').value,
            noticeEnabled: $('sNoticeEnabled') ? $('sNoticeEnabled').checked : false,
            noticeText: $('sNoticeText') ? $('sNoticeText').value.trim() : '',
            noticeLink: $('sNoticeLink') ? $('sNoticeLink').value.trim() : '',
            noticeBg: bgVal,
            noticeColor: colorVal,
            noticeDismissible: $('sNoticeDismissible') ? $('sNoticeDismissible').checked : true,
            maintenanceEnabled: $('sMaintEnabled') ? $('sMaintEnabled').checked : false,
            maintenanceTitle: $('sMaintTitle') ? $('sMaintTitle').value.trim() : '',
            maintenanceMessage: $('sMaintMsg') ? $('sMaintMsg').value.trim() : '',
            maintenanceEta: $('sMaintEta') ? $('sMaintEta').value.trim() : ''
          })
        });
        toast('Settings saved successfully');
      } catch (err) { toast(err.message, false); }
    });

    const saveGoogleBtn = $('saveGoogle');
    if (saveGoogleBtn) saveGoogleBtn.addEventListener('click', async function () {
      const box = $('googleMsg');
      box.classList.add('hidden');
      const clientId = $('sGoogleClientId').value.trim();
      const enabled = $('sGoogleEnabled').checked;
      if (enabled && !/\.apps\.googleusercontent\.com$/.test(clientId)) {
        box.textContent = 'Enable korle valid Client ID dite hobe (***.apps.googleusercontent.com diye sesh hobe)';
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        box.classList.remove('hidden');
        return;
      }
      try {
        await api('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({ googleLoginEnabled: enabled, googleClientId: clientId })
        });
        box.textContent = 'Google settings saved successfully';
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-[#E6F4EA] text-[#16A34A] border border-[#C8E9D5]';
        box.classList.remove('hidden');
        toast('Google settings saved');
      } catch (err) {
        box.textContent = err.message;
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        box.classList.remove('hidden');
      }
    });

    const savePipraBtn = $('savePipra');
    if (savePipraBtn) savePipraBtn.addEventListener('click', async function () {
      const box = $('pipraMsg');
      box.classList.add('hidden');
      const enabled = $('sPipraEnabled').checked;
      const key = $('sPipraKey').value.trim();
      const base = $('sPipraBase').value.trim();
      const keyIsMasked = (key === '••••••••' || key === '********');
      if (enabled && !key) {
        box.textContent = 'Enable korle PipaPay API Key dite hobe';
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        box.classList.remove('hidden');
        return;
      }
      try {
        const payload = { piprapayEnabled: enabled, piprapayBaseUrl: base };
        if (!keyIsMasked) payload.piprapayApiKey = key;
        await api('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        box.textContent = 'Payment settings saved successfully';
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-[#E6F4EA] text-[#16A34A] border border-[#C8E9D5]';
        box.classList.remove('hidden');
        toast('Payment settings saved');
      } catch (err) {
        box.textContent = err.message;
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        box.classList.remove('hidden');
      }
    });

    const saveBotBtn = $('saveBot');
    if (saveBotBtn) saveBotBtn.addEventListener('click', async function () {
      const box = $('botMsg');
      box.classList.add('hidden');
      const token = $('sBotToken').value.trim();
      if (token && token !== '••••••••' && token !== '********' && !/^\d+:[\w-]{20,}$/.test(token)) {
        box.textContent = 'Token format thik nai — @BotFather theke copy kore full token daw';
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        box.classList.remove('hidden');
        return;
      }
      try {
        await api('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({ botToken: (token === '••••••••' || token === '********') ? undefined : token })
        });
        box.textContent = 'Bot token saved — ekhon Order Approve-এ auto invite banbe';
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-[#E6F4EA] text-[#16A34A] border border-[#C8E9D5]';
        box.classList.remove('hidden');
        toast('Bot token saved');
      } catch (err) {
        box.textContent = err.message;
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        box.classList.remove('hidden');
      }
    });

    // Email settings: provider toggle + save
    const provSel = $('sEmailProvider');
    const smtpBox = $('smtpBox');
    const sgBox = $('sgBox');
    const brevoBox = $('brevoBox');
    function paintEmailBoxes() {
      const v = provSel && provSel.value;
      if (smtpBox) smtpBox.style.display = (v === 'smtp' || !v) ? '' : 'none';
      if (sgBox) sgBox.style.display = v === 'sendgrid' ? '' : 'none';
      if (brevoBox) brevoBox.style.display = v === 'brevo' ? '' : 'none';
    }
    if (provSel) { provSel.addEventListener('change', paintEmailBoxes); paintEmailBoxes(); }
    else paintEmailBoxes();
    const saveEmailBtn = $('saveEmail');
    if (saveEmailBtn) saveEmailBtn.addEventListener('click', async function () {
      const box = $('emailMsg');
      box.classList.add('hidden');
      try {
        const payload = {
          emailEnabled: $('sEmailEnabled').checked,
          emailProvider: $('sEmailProvider').value,
          senderName: $('sSenderName').value.trim(),
          senderEmail: $('sSenderEmail').value.trim(),
          smtpHost: $('sSmtpHost').value.trim(),
          smtpPort: $('sSmtpPort').value.trim(),
          smtpSecure: $('sSmtpSecure').checked,
          smtpUser: $('sSmtpUser').value.trim()
        };
        const pass = $('sSmtpPass').value;
        if (pass && pass.trim() !== '') payload.smtpPass = pass;
        const sg = $('sSgKey').value;
        if (sg && sg.trim() !== '') payload.sendgridApiKey = sg.trim();
        const bv = $('sBrevoKey').value;
        if (bv && bv.trim() !== '') payload.brevoApiKey = bv.trim();
        if (payload.emailEnabled && !payload.senderEmail) throw new Error('Sender Email din (Brevo-te verify kora address / Gmail address)');
        await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
        box.textContent = 'Email settings saved — Notifications menu theke test mail pathan';
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-[#E6F4EA] text-[#16A34A] border border-[#C8E9D5]';
        box.classList.remove('hidden');
        $('sSmtpPass').value = ''; $('sSgKey').value = ''; $('sBrevoKey').value = '';
        toast('Email settings saved');
      } catch (err) {
        box.textContent = err.message;
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        box.classList.remove('hidden');
      }
    });

    $('savePassword').addEventListener('click', async function () {
      const box = $('passMsg');
      box.classList.add('hidden');
      if ($('pNew').value !== $('pConfirm').value) {
        box.textContent = 'New password and confirm password do not match';
        box.className = 'mt-4 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        box.classList.remove('hidden');
        return;
      }
      try {
        await api('/api/admin/account/password', {
          method: 'PUT',
          body: JSON.stringify({ currentPassword: $('pCurrent').value, newPassword: $('pNew').value })
        });
        box.textContent = 'Password changed successfully';
        box.className = 'mt-4 text-[12px] font-semibold rounded-lg px-3 py-2 bg-[#E6F4EA] text-[#16A34A] border border-[#C8E9D5]';
        box.classList.remove('hidden');
        $('pCurrent').value = ''; $('pNew').value = ''; $('pConfirm').value = '';
        toast('Password updated');
      } catch (err) {
        box.textContent = err.message;
        box.className = 'mt-4 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        box.classList.remove('hidden');
      }
    });

    fetch('/api/health').then(function (r) { return r.json(); }).then(function (h) {
      const c = h.collections || {};
      $('sysInfo').innerHTML = `
        <div class="flex items-center justify-between"><span>Server status</span><b class="text-[#16A34A]">Online</b></div>
        <div class="flex items-center justify-between"><span>Uptime</span><b>${esc(h.uptime)}</b></div>
        <div class="flex items-center justify-between"><span>Courses / Batches</span><b>${c.courses || 0} / ${c.batches || 0}</b></div>
        <div class="flex items-center justify-between"><span>Users / Orders</span><b>${c.users || 0} / ${c.orders || 0}</b></div>
        <div class="flex items-center justify-between"><span>Coupons / Platforms</span><b>${c.coupons || 0} / ${c.platforms || 0}</b></div>
        <div class="flex items-center justify-between"><span>API Base URL</span><b class="text-[#1A56FF]">/api</b></div>`;
    }).catch(function () {
      $('sysInfo').innerHTML = '<span class="text-red-600 font-semibold">Could not read system info</span>';
    });
  }

  /* ---------------- Home Page Editor ---------------- */
  async function renderHomePage() {
    const view = $('view');
    view.innerHTML = `<div class="text-center py-20 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-[22px]"></i><p class="text-[13px] mt-2">Loading home page...</p></div>`;
    let hp;
    try {
      const json = await api('/api/admin/homepage');
      hp = json.data;
    } catch (err) {
      view.innerHTML = errorBox(err.message);
      return;
    }
    const baseCls = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white';
    const hero = hp.hero || {};
    const sec = hp.sections || {};

    view.innerHTML = `
      <div class="sticky top-2 z-20 mb-4 rounded-[16px] p-4 sm:p-5 text-white shadow-lg" style="background:linear-gradient(135deg,#1A56FF 0%,#4F46E5 55%,#7C3AED 100%)">
        <div class="flex flex-wrap items-center gap-3">
          <div class="w-11 h-11 rounded-[12px] bg-white/20 flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-house-chimney text-white text-[18px]"></i></div>
          <div class="flex-1 min-w-[180px]">
            <h2 class="text-[17px] font-extrabold leading-tight">Home Page Editor</h2>
            <p class="text-[12px] text-white/80 font-medium">Hero • Category Tabs • Page Sections — 3 step e manage koro</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <a href="index.html" target="_blank" class="px-3 py-2 rounded-[10px] bg-white/15 hover:bg-white/25 text-[12px] font-bold text-white transition"><i class="fa-solid fa-eye mr-1"></i> Preview</a>
            <button id="hpReset" class="px-3 py-2 rounded-[10px] bg-white/15 hover:bg-white/25 text-[12px] font-bold text-white transition"><i class="fa-solid fa-rotate-left mr-1"></i> Reset</button>
            <button id="hpSave" class="px-5 py-2.5 rounded-[10px] bg-white hover:bg-[#F0F4FF] text-[#1A56FF] font-extrabold text-[13px] shadow transition"><i class="fa-solid fa-floppy-disk mr-1"></i> Save Changes</button>
          </div>
        </div>
      </div>

      <!-- 01 · Hero Section -->
      <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm mb-4 overflow-hidden">
        <div data-sec-head class="flex items-center gap-3 p-5 pb-4 cursor-pointer select-none">
          <span class="w-8 h-8 rounded-[10px] text-[12px] font-extrabold flex items-center justify-center flex-shrink-0" style="background:#FFF2E6;color:#C2410C">01</span>
          <span class="w-9 h-9 rounded-[10px] bg-[#FFF7ED] border border-orange-100 flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-star text-[#F59E0B] text-[15px]"></i></span>
          <span class="min-w-0 flex-1">
            <span class="block text-[15px] font-extrabold text-[#0F2043]">Hero Section</span>
            <span class="block text-[11px] text-slate-500 font-medium">Top banner — title, text, button & image</span>
          </span>
          <label class="relative inline-flex cursor-pointer items-center flex-shrink-0" title="Show / Hide hero">
            <input id="hpHeroEnabled" type="checkbox" ${hero.enabled !== false ? 'checked' : ''} class="peer sr-only">
            <span class="block w-10 h-[22px] rounded-full bg-slate-200 peer-checked:bg-[#16A34A] transition relative after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:w-4 after:h-4 after:bg-white after:rounded-full after:shadow after:transition peer-checked:after:translate-x-[18px]"></span>
          </label>
          <i class="fa-solid fa-chevron-down text-slate-300 text-[12px] transition-transform" data-sec-chev></i>
        </div>
        <div data-sec-body class="px-5 pb-5">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="space-y-3">
            <div><label class="text-[11px] font-bold text-slate-600 uppercase">Badge Text</label><input id="hpBadge" value="${esc(hero.badge || '')}" class="${baseCls} mt-1" placeholder="Smart Learning, Better Future"></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Title Line 1</label><input id="hpTitle1" value="${esc(hero.titleLine1 || '')}" class="${baseCls} mt-1"></div>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Title Line 2</label><input id="hpTitle2" value="${esc(hero.titleLine2 || '')}" class="${baseCls} mt-1"></div>
            </div>
            <div><label class="text-[11px] font-bold text-slate-600 uppercase">Highlighted Word (blue)</label><input id="hpHighlight" value="${esc(hero.highlight || '')}" class="${baseCls} mt-1" placeholder="Starts Here"></div>
            <div><label class="text-[11px] font-bold text-slate-600 uppercase">Description</label><textarea id="hpDesc" rows="3" class="${baseCls} mt-1" placeholder="Explore...">${esc(hero.description || '')}</textarea><p class="text-[10px] text-slate-400 mt-1">Use &lt;br&gt; for line break</p></div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Search Placeholder</label><input id="hpSearchPh" value="${esc(hero.searchPlaceholder || '')}" class="${baseCls} mt-1"></div>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">CTA Button Text</label><input id="hpCtaText" value="${esc(hero.ctaText || '')}" class="${baseCls} mt-1" placeholder="Explore Courses"></div>
            </div>
            <div><label class="text-[11px] font-bold text-slate-600 uppercase">CTA Link</label><input id="hpCtaLink" value="${esc(hero.ctaLink || '')}" class="${baseCls} mt-1" placeholder="#popular or /courses.html"></div>
          </div>

          <div class="space-y-3">
            <div class="bg-[#F8F9FD] rounded-[12px] p-4 border border-dashed border-slate-200">
              <label class="text-[11px] font-bold text-slate-600 uppercase">Hero Image</label>
              <div class="mt-2 relative bg-white rounded-[10px] border border-slate-200 overflow-hidden min-h-[180px] flex items-center justify-center">
                <img id="hpPreview" src="${esc(hero.imageUrl || '')}" class="${hero.imageUrl ? '' : 'hidden'} max-h-[220px] w-full object-contain">
                <div id="hpNoImg" class="${hero.imageUrl ? 'hidden' : 'flex'} flex-col items-center justify-center py-8 text-slate-400">
                  <i class="fa-regular fa-image text-[32px] mb-2"></i>
                  <p class="text-[12px] font-semibold">No image uploaded</p>
                  <p class="text-[11px]">Default illustration will show</p>
                </div>
              </div>
              <div class="grid grid-cols-1 gap-2 mt-3">
                <input id="hpImageUrl" value="${esc(hero.imageUrl || '')}" class="${baseCls}" placeholder="https://... or paste base64 (auto-filled on upload)">
                <div class="flex items-center gap-2">
                  <label class="flex-1 px-3 py-2 rounded-[8px] bg-[#0F2043] text-white text-[12px] font-bold text-center cursor-pointer hover:bg-[#16294F]">
                    <i class="fa-solid fa-upload mr-1"></i> Upload Image
                    <input id="hpFile" type="file" accept="image/*" class="hidden">
                  </label>
                  <button id="hpRemoveImg" class="px-3 py-2 rounded-[8px] bg-red-50 text-red-600 text-[12px] font-bold border border-red-100">Remove</button>
                </div>
                <p class="text-[10px] text-slate-400">Any size. JPG/PNG/WebP. Upload korle auto base64 hoye save hobe.</p>
              </div>
              <div class="mt-3"><label class="text-[11px] font-bold text-slate-600 uppercase">Image Alt Text</label><input id="hpImageAlt" value="${esc(hero.imageAlt || '')}" class="${baseCls} mt-1"></div>
            </div>
          </div>
        </div>
        </div>
      </div>

      <!-- 02 · Batch Page Category Tabs -->
      <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm mb-4 overflow-hidden">
        <div data-sec-head class="flex items-center gap-3 p-5 pb-4 cursor-pointer select-none">
          <span class="w-8 h-8 rounded-[10px] text-[12px] font-extrabold flex items-center justify-center flex-shrink-0" style="background:#E0F2FE;color:#0284C7">02</span>
          <span class="w-9 h-9 rounded-[10px] bg-[#F0F9FF] border border-sky-100 flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-arrow-down-up-across-line text-[#0284C7] text-[15px]"></i></span>
          <span class="min-w-0 flex-1">
            <span class="block text-[15px] font-extrabold text-[#0F2043]">Category Tabs — Position & Column</span>
            <span class="block text-[11px] text-slate-500 font-medium">batch.html / ebbatch.html tab order — Up/Down diye sajao</span>
          </span>
          <i class="fa-solid fa-chevron-down text-slate-300 text-[12px] transition-transform" data-sec-chev></i>
        </div>
        <div data-sec-body class="px-5 pb-5">
        ${(() => {
          const ct = sec.categoryTabs || {};
          const cols = Math.min(6, Math.max(1, parseInt(ct.cols, 10) || 3));
          const cBatches = (state.meta.batches || []).filter(b => (b.status || 'active') === 'active');
          const eBatches = (state.meta.ebookBatches || []).filter(b => (b.status || 'active') === 'active');
          const opt = (b, tag) => `<option value="${tag}:${esc(b.id)}">${esc(b.name)} (${tag === 'eb' ? 'E-Book' : 'Course'})</option>`;
          return `<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label class="text-[11px] font-bold text-slate-600 uppercase">Batch Select koro</label>
              <select id="ctabBatchSel" class="${baseCls} mt-2">
                <option value="__default">All Batches (default position)</option>
                ${cBatches.length ? `<optgroup label="Course Batches">${cBatches.map(b => opt(b, 'c')).join('')}</optgroup>` : ''}
                ${eBatches.length ? `<optgroup label="E-Book Batches">${eBatches.map(b => opt(b, 'eb')).join('')}</optgroup>` : ''}
              </select>
              <label class="text-[11px] font-bold text-slate-600 uppercase mt-3 block">Tab Position (Up / Down diye age-piche koro)</label>
              <div id="ctabList" class="mt-2 space-y-2">
                <p class="text-[12px] text-slate-400 py-3 text-center"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Loading...</p>
              </div>
              <p id="ctabHint" class="text-[10px] text-slate-400 mt-2"></p>
            </div>
            <div>
              <label class="text-[11px] font-bold text-slate-600 uppercase">Column</label>
              <input id="ctabCols" type="number" min="1" max="6" value="${cols}" class="${baseCls} mt-2 max-w-[220px]">
            </div>
          </div>`;
        })()}
        </div>
      </div>

      <!-- 03 · Page Sections -->
      <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
        <div class="flex items-center gap-3 mb-3">
          <span class="w-8 h-8 rounded-[10px] text-[12px] font-extrabold flex items-center justify-center flex-shrink-0" style="background:#EDE9FF;color:#4F46E5">03</span>
          <span class="w-9 h-9 rounded-[10px] bg-[#F5F3FF] border border-violet-100 flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-layer-group text-[#4F46E5] text-[15px]"></i></span>
          <span class="min-w-0 flex-1">
            <span class="block text-[15px] font-extrabold text-[#0F2043]">Page Sections</span>
            
          </span>
        </div>
        <div class="flex items-center gap-2 mb-4">
          <span id="secVisibleCount" class="px-3 py-1.5 rounded-full bg-[#EDE9FF] text-[#4F46E5] text-[11px] font-extrabold"></span>
          
        </div>
        <div id="secGrid" class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${[
            {key:'categories', label:'Categories Pills', icon:'fa-tags', hasTitle:false, hint:'Pills row — batch theke auto', acc:'background:#EDE9FF;color:#4F46E5'},
            {key:'ebookCategory', label:'E-Book Category', icon:'fa-book-open', hasTitle:true, hasRows:true, hint:'E-book category row', acc:'background:#E0F2FE;color:#0284C7'},
            {key:'popular', label:'Popular Courses', icon:'fa-fire', hasTitle:true, hasRows:true, hint:'Popular courses row', acc:'background:#FFF2E6;color:#C2410C'},
            {key:'latest', label:'Latest Courses', icon:'fa-clock', hasTitle:true, hasRows:true, hint:'Latest courses row', acc:'background:#E6F4EA;color:#15803D'},
            {key:'ebooks', label:'Ebooks', icon:'fa-book-open', hasTitle:true, hasRows:true, hint:'E-books row', acc:'background:#E0F2FE;color:#0284C7'},
            {key:'popularEbooks', label:'Popular Ebooks', icon:'fa-fire', hasTitle:true, hasRows:true, hint:'Most downloaded e-books', acc:'background:#FFF2E6;color:#C2410C'},
            {key:'featured', label:'Featured Courses', icon:'fa-star', hasTitle:true, hasSubtitle:true, hint:'Hand-picked featured', acc:'background:#FCE7F3;color:#BE185D'},
            {key:'howToBuy', label:'How To Buy', icon:'fa-circle-play', hasTitle:true, hasSubtitle:true, hint:'Steps + video guide', acc:'background:#E6F4EA;color:#15803D'},
            {key:'browseCategory', label:'Browse by Category', icon:'fa-table-cells', hasTitle:true, hint:'Shop by category', acc:'background:#EDE9FF;color:#4F46E5'},
            {key:'stats', label:'Stats Counters', icon:'fa-chart-simple', hasTitle:true, hint:'Students / courses counter', acc:'background:#E0F2FE;color:#0284C7'},
            {key:'batchesSection', label:'Our Batches', icon:'fa-layer-group', hasTitle:true, hint:'Batch cards row', acc:'background:#FCE7F3;color:#BE185D'},
          ].map((s, idx) => {
            const cfg = sec[s.key] || {};
            let extra = '';
            if (s.key === 'howToBuy') {
              const hbV = String(cfg.videoUrl || '');
              const hbIsUpload = hbV.indexOf('/uploads/videos/') === 0;
              extra = `
                <div class="mt-3 pt-3 border-t border-slate-200 space-y-3">
                  <div><label class="text-[10px] font-bold text-slate-500 uppercase">Description / Steps (text)</label><textarea data-hb-desc rows="4" class="${baseCls} mt-1" placeholder="1. Buy Now chap dao<br>2. Payment koro...">${esc(cfg.description || '')}</textarea><p class="text-[10px] text-slate-400 mt-1">Use &lt;br&gt; for line break</p></div>
                  <div>
                    <label class="text-[10px] font-bold text-slate-500 uppercase">Video — YouTube link / Upload</label>
                    <div class="flex gap-1 bg-slate-100 rounded-[8px] p-1 mt-1" data-hb-tabs>
                      <button type="button" data-hb-tab="youtube" class="flex-1 py-1.5 rounded-[6px] text-[11px] font-bold ${hbIsUpload ? 'text-slate-500' : 'bg-white text-[#1A56FF] shadow'}"><i class="fa-brands fa-youtube mr-1"></i>YouTube</button>
                      <button type="button" data-hb-tab="upload" class="flex-1 py-1.5 rounded-[6px] text-[11px] font-bold ${hbIsUpload ? 'bg-white text-[#1A56FF] shadow' : 'text-slate-500'}"><i class="fa-solid fa-upload mr-1"></i>Upload</button>
                    </div>
                    <div data-hb-ytbox class="${hbIsUpload ? 'hidden' : ''} mt-2">
                      <input data-hb-video value="${hbIsUpload ? '' : esc(hbV)}" class="${baseCls}" placeholder="https://youtube.com/watch?v=... or video ID">
                      <p class="text-[10px] text-slate-400 mt-1">watch / youtu.be / shorts / embed link ba sudhu video ID dilei hobe</p>
                    </div>
                    <div data-hb-upbox class="${hbIsUpload ? '' : 'hidden'} mt-2">
                      <div data-hb-upstatus>${hbIsUpload ? `<div class="flex items-center gap-2 bg-[#E6F4EA] border border-[#C8E9D5] rounded-[8px] px-3 py-2"><i class="fa-solid fa-file-video text-[#16A34A]"></i><span class="text-[11px] font-bold truncate flex-1">${esc(hbV.split('/').pop() || 'Uploaded video')}</span><button type="button" data-hb-upremove class="text-[11px] font-bold text-red-600">Remove</button></div>` : `<div class="text-[11px] text-slate-500 border border-dashed rounded-[8px] px-3 py-2 text-center">MP4 / WebM upload koro — YouTube link lagbe na</div>`}</div>
                      <input type="hidden" data-hb-upload value="${hbIsUpload ? esc(hbV) : ''}">
                      <label class="mt-2 flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-[8px] px-3 py-2.5 cursor-pointer hover:border-[#1A56FF] bg-white"><i class="fa-solid fa-cloud-arrow-up text-[#1A56FF]"></i><span class="text-[11px] font-semibold text-slate-500">MP4 / WebM — any size</span><input data-hb-file type="file" accept="video/mp4,video/webm,.mp4,.webm,.mov" class="hidden"></label>
                      <div data-hb-prog class="hidden mt-2"><div class="h-2 rounded-full bg-slate-200 overflow-hidden"><div data-hb-progbar class="h-full bg-[#1A56FF] rounded-full" style="width:0%"></div></div><p data-hb-progtxt class="text-[10px] text-slate-500 mt-1">Uploading...</p></div>
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <div><label class="text-[10px] font-bold text-slate-500 uppercase">Button Text</label><input data-hb-btntext value="${esc(cfg.btnText || '')}" class="${baseCls} mt-1" placeholder="Browse Courses"></div>
                    <div><label class="text-[10px] font-bold text-slate-500 uppercase">Button Link</label><input data-hb-btnlink value="${esc(cfg.btnLink || '')}" class="${baseCls} mt-1" placeholder="courses.html"></div>
                  </div>
                </div>`;
            }
            if (s.key === 'categories') {
              const batchIds = Array.isArray(cfg.batchIds) ? cfg.batchIds.map(String) : [];
              const isAuto = batchIds.length === 0;
              const batches = state.meta.batches || [];
              const curLimit = cfg.limit != null ? cfg.limit : 50;
              const curRows = cfg.rows != null ? cfg.rows : 0;
              const curCols = Math.min(6, Math.max(2, parseInt(cfg.cols,10) || 4));
              extra = `
                <div class="mt-3 pt-3 border-t border-slate-200 space-y-2">
                  <div class="grid grid-cols-3 gap-2">
                    <div><label class="text-[10px] font-bold text-slate-500 uppercase">Column</label><select data-sec-cols="categories" class="${baseCls} mt-1"><option value="2" ${curCols===2?'selected':''}>2 col</option><option value="3" ${curCols===3?'selected':''}>3 col</option><option value="4" ${curCols===4?'selected':''}>4 col</option><option value="5" ${curCols===5?'selected':''}>5 col</option><option value="6" ${curCols===6?'selected':''}>6 col</option></select></div>
                    <div><label class="text-[10px] font-bold text-slate-500 uppercase">Row</label><select data-sec-rows="categories" class="${baseCls} mt-1"><option value="1" ${String(curRows)==='1'?'selected':''}>1 Row</option><option value="2" ${String(curRows)==='2'?'selected':''}>2 Rows</option><option value="3" ${String(curRows)==='3'?'selected':''}>3 Rows</option><option value="4" ${String(curRows)==='4'?'selected':''}>4 Rows</option><option value="5" ${String(curRows)==='5'?'selected':''}>5 Rows</option><option value="6" ${String(curRows)==='6'?'selected':''}>6 Rows</option><option value="0" ${String(curRows)==='0'?'selected':''}>Auto (limit onujayi)</option></select></div>
                    <div><label class="text-[10px] font-bold text-slate-500 uppercase">Limit</label><input data-sec-limit="categories" type="number" min="1" max="100" value="${esc(curLimit)}" class="${baseCls} mt-1"></div>
                  </div>
                  <p class="text-[10px] text-slate-400">E-Book er moto grid — Column x Row = visible limit.</p>
                  <div class="bg-white rounded-[10px] border border-slate-100 p-3">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-[11px] font-bold text-[#0F2043]"><i class="fa-solid fa-layer-group text-[#1A56FF] mr-1"></i>Batch hisabe — Batch Manage theke auto asbe</span>
                      <label class="flex items-center gap-1.5 text-[10px] font-bold text-[#1A56FF]"><input id="catBatchAuto" type="checkbox" ${isAuto?'checked':''} class="w-3.5 h-3.5 accent-[#1A56FF]"> Auto (sob batch)</label>
                    </div>
                    <div id="catBatchList" class="${isAuto ? 'opacity-50 pointer-events-none' : ''} space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                      ${batches.length ? batches.map(b => `
                        <label class="flex items-center gap-2 bg-[#F8F9FD] rounded-[8px] border border-slate-100 px-3 py-2 hover:bg-white cursor-pointer">
                          <input type="checkbox" data-batch-id="${b.id}" ${isAuto || batchIds.includes(String(b.id)) ? 'checked' : ''} class="w-4 h-4 accent-[#1A56FF]">
                          <span class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style="background:${esc(b.color||'#EEF2FF')}"><i class="fa-solid fa-layer-group text-[11px]" style="color:${esc(b.color||'#6366F1')}"></i></span>
                          <span class="text-[12px] font-bold text-[#0F2043]">${esc(b.name)}</span>
                          <span class="ml-auto text-[10px] text-slate-400">${esc(b.slug||'')}</span>
                          <span class="text-[10px] px-1.5 py-0.5 rounded-full ${b.status==='active'?'bg-[#E6F4EA] text-[#16A34A]':'bg-slate-100 text-slate-500'}">${esc(b.status||'active')}</span>
                        </label>
                      `).join('') : '<p class="text-[11px] text-slate-400 py-2">No batches yet — Batch Manage e batch create korun</p>'}
                    </div>
                  </div>
                </div>`;
            }
            if (s.hasRows) {
              const curLimit = cfg.limit != null ? cfg.limit : 8;
              const curRows = cfg.rows != null ? cfg.rows : Math.max(1, Math.ceil(curLimit / 4));
              const curCols = Math.min(6, Math.max(2, parseInt(cfg.cols,10) || 4));
              // ebookCategory also unlimited + cols/rows, others keep rows/limit but expanded
              const isEbookCat = s.key === 'ebookCategory';
              extra = `
                <div class="mt-3 pt-3 border-t border-slate-200 space-y-2">
                  <div class="grid ${isEbookCat ? 'grid-cols-3' : 'grid-cols-2'} gap-2">
                    ${isEbookCat ? `<div><label class="text-[10px] font-bold text-slate-500 uppercase">Column</label><select data-sec-cols="${s.key}" class="${baseCls} mt-1"><option value="2" ${curCols===2?'selected':''}>2 col</option><option value="3" ${curCols===3?'selected':''}>3 col</option><option value="4" ${curCols===4?'selected':''}>4 col</option><option value="5" ${curCols===5?'selected':''}>5 col</option><option value="6" ${curCols===6?'selected':''}>6 col</option></select></div>` : ''}
                    <div><label class="text-[10px] font-bold text-slate-500 uppercase">Row</label><select data-sec-rows="${s.key}" class="${baseCls} mt-1"><option value="1" ${String(curRows)==='1'?'selected':''}>1 Row</option><option value="2" ${String(curRows)==='2'?'selected':''}>2 Rows</option><option value="3" ${String(curRows)==='3'?'selected':''}>3 Rows</option><option value="4" ${String(curRows)==='4'?'selected':''}>4 Rows</option><option value="5" ${String(curRows)==='5'?'selected':''}>5 Rows</option><option value="6" ${String(curRows)==='6'?'selected':''}>6 Rows</option><option value="0" ${String(curRows)==='0'?'selected':''}>Auto (limit onujayi)</option></select></div>
                    <div><label class="text-[10px] font-bold text-slate-500 uppercase">Limit</label><input data-sec-limit="${s.key}" type="number" min="1" max="100" value="${esc(curLimit)}" class="${baseCls} mt-1"></div>
                  </div>
                  ${isEbookCat ? `<p class="text-[10px] text-slate-400">..</p>` : `<p class="text-[10px] text-slate-400">Limit 100 porjonto iccha moto set koro. Row = limit / cols.</p>`}
                </div>`;
            }
            return `
            <div class="bg-white border border-slate-200 rounded-[12px] overflow-hidden transition hover:border-[#1A56FF]/40 hover:shadow-sm">
              <div data-sec-head class="flex items-center gap-2.5 px-3.5 py-3 cursor-pointer select-none">
                <span class="w-6 h-6 rounded-[8px] text-[10px] font-extrabold flex items-center justify-center flex-shrink-0" style="${s.acc}">${String(idx+1).padStart(2,'0')}</span>
                <span class="w-8 h-8 rounded-[10px] bg-[#F8F9FD] border border-slate-100 flex items-center justify-center flex-shrink-0"><i class="fa-solid ${s.icon} text-[#1A56FF] text-[14px]"></i></span>
                <span class="min-w-0 flex-1">
                  <span class="block text-[13px] font-bold text-[#0F2043] truncate">${s.label}</span>
                  <span class="block text-[10px] text-slate-400 font-medium truncate">${s.hint} • <span data-sec-status></span></span>
                </span>
                <label class="relative inline-flex cursor-pointer items-center flex-shrink-0" title="Show / Hide">
                  <input data-sec-enabled="${s.key}" type="checkbox" ${cfg.enabled !== false ? 'checked' : ''} class="peer sr-only">
                  <span class="block w-10 h-[22px] rounded-full bg-slate-200 peer-checked:bg-[#16A34A] transition relative after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:w-4 after:h-4 after:bg-white after:rounded-full after:shadow after:transition peer-checked:after:translate-x-[18px]"></span>
                </label>
                <i class="fa-solid fa-chevron-down text-slate-300 text-[12px] transition-transform" data-sec-chev></i>
              </div>
              <div data-sec-body class="px-3.5 pb-3.5 hidden">
              ${s.hasTitle ? `<div><label class="text-[10px] font-bold text-slate-500 uppercase">Section Title</label><input data-sec-title="${s.key}" value="${esc(cfg.title || '')}" class="${baseCls} mt-1" placeholder="${esc(s.label)}"></div>` : '<p class="text-[11px] text-slate-400">No title needed — pills auto</p>'}
              ${s.hasSubtitle ? `<div class="mt-2"><label class="text-[10px] font-bold text-slate-500 uppercase">Subtitle</label><input data-sec-subtitle="${s.key}" value="${esc(cfg.subtitle || '')}" class="${baseCls} mt-1"></div>` : ''}
              ${extra}
              </div>
            </div>`;
          }).join('')}
        </div>
        <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
          <button id="hpSave2" class="px-5 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]"><i class="fa-solid fa-floppy-disk mr-1"></i> Save Changes</button>
        </div>
      </div>
      <p id="hpMsg" class="hidden mt-4 text-[12px] font-semibold rounded-lg px-3 py-2"></p>
    `;

    // file upload handler
    const fileEl = document.getElementById('hpFile');
    if (fileEl) fileEl.addEventListener('change', function(e){
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(ev){
        const dataUrl = ev.target.result;
        $('hpImageUrl').value = dataUrl;
        const img = $('hpPreview');
        img.src = dataUrl;
        img.classList.remove('hidden');
        $('hpNoImg').classList.add('hidden');
        toast('Image loaded - click Save to apply');
      };
      reader.readAsDataURL(file);
    });
    $('hpImageUrl').addEventListener('input', function(){
      const v = this.value.trim();
      const img = $('hpPreview');
      if (v) { img.src = v; img.classList.remove('hidden'); $('hpNoImg').classList.add('hidden'); }
      else { img.classList.add('hidden'); $('hpNoImg').classList.remove('hidden'); $('hpNoImg').classList.add('flex'); }
    });
    $('hpRemoveImg').addEventListener('click', function(){
      $('hpImageUrl').value = '';
      $('hpPreview').classList.add('hidden');
      $('hpNoImg').classList.remove('hidden');
      $('hpNoImg').classList.add('flex');
    });
    const catAddBtn = $('catAddBtn');
    if (catAddBtn) catAddBtn.addEventListener('click', function(){
      const items = hp.sections.categories.items || [];
      const newId = 'cat' + Date.now().toString().slice(-4);
      items.push({ id: newId, name: 'New Pill', icon: 'fa-star', color: '#6366F1', bg: '#EEF2FF', link: 'courses.html', enabled: true });
      hp.sections.categories.items = items;
      renderHomePage();
      toast('New pill added - edit name then Save');
    });
    const catAuto = $('catBatchAuto');
    const catList = $('catBatchList');
    if (catAuto && catList) catAuto.addEventListener('change', function(){
      if (this.checked) { catList.classList.add('opacity-50','pointer-events-none'); }
      else { catList.classList.remove('opacity-50','pointer-events-none'); }
    });
    // ---- Batch Page Category Tabs: batch-wise position (dropdown + Up/Down) ----
    const CTAB_DEFAULT = ['academic', 'admission', 'revision'];
    const CTAB_META = { academic: { name: 'Academic', icon: 'fa-book-open' }, admission: { name: 'Admission', icon: 'fa-building-columns' }, revision: { name: 'Revision', icon: 'fa-bullseye' } };
    const ctabCfg0 = (hp.sections && hp.sections.categoryTabs) || {};
    let ctabGlobalOrder = Array.isArray(ctabCfg0.tabOrder) && ctabCfg0.tabOrder.length ? ctabCfg0.tabOrder.map(String) : CTAB_DEFAULT.slice();
    let ctabPerBatch = Object.assign({}, ctabCfg0.perBatch || {});
    let ctabCurrentKey = '__default';
    let ctabNameMap = {};
    function refreshCtabNumbers(){
      const rows = Array.from(view.querySelectorAll('#ctabList [data-ctab]'));
      rows.forEach((row, idx)=>{
        const num = row.querySelector('[data-ctab-num]');
        if (num) num.textContent = idx + 1;
        const up = row.querySelector('[data-ctab-up]');
        const down = row.querySelector('[data-ctab-down]');
        if (up) { up.dataset.ctabUp = idx; if (idx === 0) up.setAttribute('disabled',''); else up.removeAttribute('disabled'); }
        if (down) { down.dataset.ctabDown = idx; if (idx === rows.length - 1) down.setAttribute('disabled',''); else down.removeAttribute('disabled'); }
      });
    }
    function renderCtabRows(order){
      const list = $('ctabList');
      if (!list) return;
      if (!order.length) { list.innerHTML = '<p class="text-[11px] text-slate-400 py-3 text-center">Ei batch e ekhono kono category nai</p>'; return; }
      list.innerHTML = order.map((slug) => {
        const m = CTAB_META[slug] || {};
        const nm = m.name || ctabNameMap[slug] || slug;
        const ic = m.icon || 'fa-layer-group';
        return `<div data-ctab="${esc(slug)}" class="flex items-center gap-2 bg-[#F8F9FD] rounded-[10px] border border-slate-100 px-3 py-2">`
          + `<span data-ctab-num class="w-6 h-6 rounded-full bg-[#EDE9FF] text-[#4F46E5] text-[11px] font-extrabold flex items-center justify-center flex-shrink-0"></span>`
          + `<span class="w-8 h-8 rounded-full bg-white border border-slate-100 flex items-center justify-center flex-shrink-0"><i class="fa-solid ${ic} text-[#1A56FF] text-[14px]"></i></span>`
          + `<span class="text-[13px] font-bold text-[#0F2043]">${esc(nm)}</span>`
          + `<span class="ml-auto flex items-center gap-1">`
          + `<button type="button" data-ctab-up class="w-8 h-8 rounded-[8px] bg-white border border-slate-200 text-slate-600 hover:bg-[#EEF2FF] hover:text-[#1A56FF] disabled:opacity-30 disabled:pointer-events-none" title="Upore naw"><i class="fa-solid fa-chevron-up text-[12px]"></i></button>`
          + `<button type="button" data-ctab-down class="w-8 h-8 rounded-[8px] bg-white border border-slate-200 text-slate-600 hover:bg-[#EEF2FF] hover:text-[#1A56FF] disabled:opacity-30 disabled:pointer-events-none" title="Niche naw"><i class="fa-solid fa-chevron-down text-[12px]"></i></button>`
          + `</span></div>`;
      }).join('');
      refreshCtabNumbers();
    }
    function captureCtabRows(){
      const rows = Array.from(view.querySelectorAll('#ctabList [data-ctab]')).map(el => el.dataset.ctab).filter(Boolean);
      if (ctabCurrentKey === '__default') { if (rows.length) ctabGlobalOrder = rows; }
      else { ctabPerBatch[ctabCurrentKey] = rows; }
    }
    function mergeCtabOrder(saved, fresh){
      const out = [];
      (saved || []).forEach(s => { if (fresh.includes(s) && !out.includes(s)) out.push(s); });
      ctabGlobalOrder.forEach(s => { if (fresh.includes(s) && !out.includes(s)) out.push(s); });
      fresh.slice().sort().forEach(s => { if (!out.includes(s)) out.push(s); });
      return out;
    }
    async function refreshCtabList(){
      const list = $('ctabList'), hint = $('ctabHint');
      if (ctabCurrentKey === '__default') {
        ctabNameMap = {};
        renderCtabRows(ctabGlobalOrder);
        if (hint) hint.textContent = '.';
        return;
      }
      const sep = ctabCurrentKey.indexOf(':');
      const tag = ctabCurrentKey.slice(0, sep), bid = ctabCurrentKey.slice(sep + 1);
      if (list) list.innerHTML = '<p class="text-[12px] text-slate-400 py-3 text-center"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Category loading...</p>';
      try {
        const url = tag === 'eb'
          ? '/api/public/ebooks?ebookBatchId=' + encodeURIComponent(bid) + '&limit=200'
          : '/api/public/courses?batchId=' + encodeURIComponent(bid) + '&limit=200';
        const r = await fetch(url);
        const j = await r.json();
        const items = Array.isArray(j) ? j : (j.data || []);
        const seen = {}, fresh = [];
        ctabNameMap = {};
        items.forEach(it => {
          const slug = String(it.categorySlug || it.categoryName || '').toLowerCase().trim();
          if (!slug || seen[slug]) return;
          seen[slug] = true;
          fresh.push(slug);
          ctabNameMap[slug] = it.categoryName || slug;
        });
        // oi batch er save kora order thakle setai age, nahole default
        const saved = ctabPerBatch[ctabCurrentKey];
        const order = mergeCtabOrder(Array.isArray(saved) ? saved : null, fresh);
        renderCtabRows(order);
        if (hint) hint.textContent = fresh.length
          ? 'Ei batch er ' + fresh.length + ' ta category — Up/Down diye position set kore Save Changes daw.'
          : 'Ei batch e ekhono kono course/e-book nai, tai category o nai.';
      } catch (e) {
        if (list) list.innerHTML = '<p class="text-[12px] text-red-500 py-3 text-center">Category load hoyni — abar try koro</p>';
      }
    }
    const ctabSel = $('ctabBatchSel');
    if (ctabSel) ctabSel.addEventListener('change', function(){
      captureCtabRows();
      ctabCurrentKey = this.value;
      refreshCtabList();
    });
    const ctabListEl = $('ctabList');
    if (ctabListEl) ctabListEl.addEventListener('click', function(e){
      const btn = e.target.closest('[data-ctab-up],[data-ctab-down]');
      if (!btn) return;
      const row = btn.closest('[data-ctab]');
      if (!row) return;
      if (btn.hasAttribute('data-ctab-up')) {
        const prev = row.previousElementSibling;
        if (prev) ctabListEl.insertBefore(row, prev);
      } else {
        const next = row.nextElementSibling;
        if (next) ctabListEl.insertBefore(next, row);
      }
      refreshCtabNumbers();
    });
    refreshCtabList();
    // ---- How To Buy: YouTube / Upload tabs + video upload (progress soho) ----
    (function(){
      const tabs = view.querySelector('[data-hb-tabs]');
      if (!tabs) return;
      const ytBox = view.querySelector('[data-hb-ytbox]');
      const upBox = view.querySelector('[data-hb-upbox]');
      const upStatus = view.querySelector('[data-hb-upstatus]');
      const upHidden = view.querySelector('[data-hb-upload]');
      const fileInp = view.querySelector('[data-hb-file]');
      const prog = view.querySelector('[data-hb-prog]');
      const progBar = view.querySelector('[data-hb-progbar]');
      const progTxt = view.querySelector('[data-hb-progtxt]');
      function paintHbTab(which){
        tabs.querySelectorAll('[data-hb-tab]').forEach(b=>{
          const on = b.dataset.hbTab === which;
          b.className = 'flex-1 py-1.5 rounded-[6px] text-[11px] font-bold ' + (on ? 'bg-white text-[#1A56FF] shadow' : 'text-slate-500');
        });
        if (ytBox) ytBox.classList.toggle('hidden', which !== 'youtube');
        if (upBox) upBox.classList.toggle('hidden', which !== 'upload');
      }
      tabs.querySelectorAll('[data-hb-tab]').forEach(b=> b.addEventListener('click', ()=> paintHbTab(b.dataset.hbTab)));
      view.addEventListener('click', function(e){
        const rm = e.target && e.target.closest ? e.target.closest('[data-hb-upremove]') : null;
        if (rm) {
          if (upHidden) upHidden.value = '';
          if (upStatus) upStatus.innerHTML = '<div class="text-[11px] text-slate-500 border border-dashed rounded-[8px] px-3 py-2 text-center">Removed — Save chap dile video clear hobe</div>';
        }
      });
      if (fileInp) fileInp.addEventListener('change', function(){
        const f = fileInp.files && fileInp.files[0]; if (!f) return;
        if (!/video\/(mp4|webm|quicktime)/i.test(f.type) && !/\.(mp4|webm|mov)$/i.test(f.name)) { toast('Only MP4/WebM allowed', false); fileInp.value=''; return; }
        if (prog) prog.classList.remove('hidden');
        if (upStatus) upStatus.innerHTML = '<div class="text-[11px] text-[#1A56FF] font-bold px-3 py-2">Uploading ' + esc(f.name) + '...</div>';
        const xhr = new XMLHttpRequest();
        // homepage endpoint age, fallback course video endpoint
        xhr.open('POST', '/api/admin/homepage/video', true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + state.token);
        xhr.setRequestHeader('Content-Type', f.type || 'video/mp4');
        xhr.setRequestHeader('x-file-name', encodeURIComponent(f.name));
        xhr.upload.onprogress = function(ev){
          if (!ev.lengthComputable) return;
          const pct = Math.round(ev.loaded / ev.total * 100);
          if (progBar) progBar.style.width = pct + '%';
          if (progTxt) progTxt.textContent = 'Uploading ' + f.name + '... ' + pct + '%';
        };
        xhr.onload = function(){
          let j = null; try { j = JSON.parse(xhr.responseText); } catch (e) {}
          // 403 (homepage perm nai kintu courses ache) hole fallback try
          if (xhr.status === 403 || (j && /permission/i.test(j.message || ''))) {
            const x2 = new XMLHttpRequest();
            x2.open('POST', '/api/admin/videos/upload', true);
            x2.setRequestHeader('Authorization', 'Bearer ' + state.token);
            x2.setRequestHeader('Content-Type', f.type || 'video/mp4');
            x2.setRequestHeader('x-file-name', encodeURIComponent(f.name));
            x2.upload.onprogress = xhr.upload.onprogress;
            x2.onload = function(){
              let k = null; try { k = JSON.parse(x2.responseText); } catch (e) {}
              if (x2.status >= 200 && x2.status < 300 && k && k.success) {
                if (upHidden) upHidden.value = k.data.videoUrl;
                if (upStatus) upStatus.innerHTML = '<div class="flex items-center gap-2 bg-[#E6F4EA] border border-[#C8E9D5] rounded-[8px] px-3 py-2"><i class="fa-solid fa-file-video text-[#16A34A]"></i><span class="text-[11px] font-bold truncate flex-1">' + esc(f.name) + '</span><button type="button" data-hb-upremove class="text-[11px] font-bold text-red-600">Remove</button></div>';
                if (prog) prog.classList.add('hidden');
                toast('Video uploaded — Save chap daw');
              } else { toast((k && k.message) || 'Upload failed', false); if (prog) prog.classList.add('hidden'); }
            };
            x2.onerror = function(){ toast('Network error', false); if (prog) prog.classList.add('hidden'); };
            x2.send(f);
            return;
          }
          if (xhr.status >= 200 && xhr.status < 300 && j && j.success) {
            if (upHidden) upHidden.value = j.data.videoUrl;
            if (upStatus) upStatus.innerHTML = '<div class="flex items-center gap-2 bg-[#E6F4EA] border border-[#C8E9D5] rounded-[8px] px-3 py-2"><i class="fa-solid fa-file-video text-[#16A34A]"></i><span class="text-[11px] font-bold truncate flex-1">' + esc(f.name) + '</span><button type="button" data-hb-upremove class="text-[11px] font-bold text-red-600">Remove</button></div>';
            if (prog) prog.classList.add('hidden');
            toast('Video uploaded — Save chap daw');
          } else { toast((j && j.message) || 'Upload failed', false); if (prog) prog.classList.add('hidden'); }
        };
        xhr.onerror = function(){ toast('Network error', false); if (prog) prog.classList.add('hidden'); };
        xhr.send(f);
      });
    })();
    // Row select -> auto set limit = rows*4 (Desktop 1 row = 4 cards)
    view.querySelectorAll('[data-sec-rows]').forEach(rowEl=>{
      rowEl.addEventListener('change', function(){
        const k = this.dataset.secRows;
        const limEl = view.querySelector('[data-sec-limit="'+k+'"]');
        if (limEl) limEl.value = (parseInt(this.value,10)||1) * 4;
      });
    });

    async function doSave(){
      const heroPayload = {
        enabled: $('hpHeroEnabled').checked,
        badge: $('hpBadge').value.trim(),
        titleLine1: $('hpTitle1').value.trim(),
        titleLine2: $('hpTitle2').value.trim(),
        highlight: $('hpHighlight').value.trim(),
        description: $('hpDesc').value.trim(),
        searchPlaceholder: $('hpSearchPh').value.trim(),
        ctaText: $('hpCtaText').value.trim(),
        ctaLink: $('hpCtaLink').value.trim(),
        imageUrl: $('hpImageUrl').value.trim(),
        imageAlt: $('hpImageAlt').value.trim()
      };
      const sectionsPayload = {};
      view.querySelectorAll('[data-sec-enabled]').forEach(el=>{
        const k = el.dataset.secEnabled;
        sectionsPayload[k] = sectionsPayload[k] || {};
        sectionsPayload[k].enabled = el.checked;
      });
      view.querySelectorAll('[data-sec-title]').forEach(el=>{
        const k = el.dataset.secTitle;
        sectionsPayload[k] = sectionsPayload[k] || {};
        sectionsPayload[k].title = el.value.trim();
      });
      view.querySelectorAll('[data-sec-subtitle]').forEach(el=>{
        const k = el.dataset.secSubtitle;
        sectionsPayload[k] = sectionsPayload[k] || {};
        sectionsPayload[k].subtitle = el.value.trim();
      });
      // include toggles without title
      if (!sectionsPayload.categories) sectionsPayload.categories = { enabled: view.querySelector('[data-sec-enabled="categories"]').checked };
      // Row / Limit / Cols controls: E-Book Category, Popular, Latest, Ebooks + Categories (unlimited 100, row/col manage)
      view.querySelectorAll('[data-sec-limit]').forEach(el=>{
        const k = el.dataset.secLimit;
        sectionsPayload[k] = sectionsPayload[k] || {};
        const defL = (k === 'ebooks' || k === 'popularEbooks') ? 4 : 8;
        sectionsPayload[k].limit = Math.max(1, Math.min(100, parseInt(el.value,10)||defL));
      });
      view.querySelectorAll('[data-sec-rows]').forEach(el=>{
        const k = el.dataset.secRows;
        sectionsPayload[k] = sectionsPayload[k] || {};
        sectionsPayload[k].rows = Math.max(0, Math.min(10, parseInt(el.value,10)||0));
      });
      view.querySelectorAll('[data-sec-cols]').forEach(el=>{
        const k = el.dataset.secCols;
        sectionsPayload[k] = sectionsPayload[k] || {};
        sectionsPayload[k].cols = Math.max(2, Math.min(6, parseInt(el.value,10)||4));
      });
      // categories extra controls (Batch hisabe + display + cols)
      const catDisplayEl = view.querySelector('[data-sec-display="categories"]');
      const catArrowsEl = view.querySelector('[data-sec-arrows="categories"]');
      if (catDisplayEl) { sectionsPayload.categories.display = catDisplayEl.value; sectionsPayload.categories.layout = catDisplayEl.value === 'scroll' ? '1row' : 'grid'; }
      const legacyLayoutEl = view.querySelector('[data-sec-layout="categories"]');
      if (legacyLayoutEl) sectionsPayload.categories.layout = legacyLayoutEl.value;
      if (catArrowsEl) sectionsPayload.categories.showArrows = catArrowsEl.checked;
      const catAutoEl = view.querySelector('#catBatchAuto');
      if (catAutoEl) {
        if (catAutoEl.checked) {
          sectionsPayload.categories.batchIds = [];
        } else {
          const checked = Array.from(view.querySelectorAll('[data-batch-id]:checked')).map(el=> el.dataset.batchId);
          sectionsPayload.categories.batchIds = checked;
        }
      }
      // Batch page category tabs: default order + per-batch order + columns
      try { captureCtabRows(); } catch (e) {}
      const ctabColsEl = view.querySelector('#ctabCols');
      const cleanPer = {};
      Object.keys(ctabPerBatch || {}).forEach(k => {
        if (Array.isArray(ctabPerBatch[k]) && ctabPerBatch[k].length) cleanPer[k] = ctabPerBatch[k];
      });
      sectionsPayload.categoryTabs = {
        tabOrder: ctabGlobalOrder.length ? ctabGlobalOrder : ['academic', 'admission', 'revision'],
        cols: ctabColsEl ? Math.min(6, Math.max(1, parseInt(ctabColsEl.value, 10) || 3)) : 3,
        perBatch: cleanPer
      };
      // keep legacy items for fallback
      const catRows = view.querySelectorAll('[data-cat-name]');
      if (catRows.length) {
        const baseItems = (hp.sections.categories && hp.sections.categories.items) ? hp.sections.categories.items.slice() : [];
        const newItems = [];
        catRows.forEach((el, idx)=>{
          const base = baseItems[idx] || { id: 'cat'+(idx+1) };
          const enabledEl = view.querySelector('[data-cat-enabled="'+idx+'"]');
          const nameEl = view.querySelector('[data-cat-name="'+idx+'"]');
          const iconEl = view.querySelector('[data-cat-icon="'+idx+'"]');
          newItems.push({
            id: base.id || ('cat'+(idx+1)),
            name: nameEl ? nameEl.value.trim() || base.name : base.name,
            icon: iconEl ? iconEl.value.trim() || base.icon : base.icon,
            color: base.color || '#6366F1',
            bg: base.bg || '#EEF2FF',
            link: base.link || 'courses.html',
            enabled: enabledEl ? enabledEl.checked : true
          });
        });
        sectionsPayload.categories.items = newItems;
      }
      // How To Buy extra fields (text + video YouTube/Upload + button)
      sectionsPayload.howToBuy = sectionsPayload.howToBuy || {};
      const hbDescEl = view.querySelector('[data-hb-desc]');
      if (hbDescEl) sectionsPayload.howToBuy.description = hbDescEl.value.trim();
      // active tab onujayi videoUrl: upload tab + uploaded URL thakle setai, nahole YouTube link
      (function(){
        const upInp = view.querySelector('[data-hb-upload]');
        const ytInp = view.querySelector('[data-hb-video]');
        const upBox = view.querySelector('[data-hb-upbox]');
        const isUploadTab = upBox && !upBox.classList.contains('hidden');
        const upUrl = upInp ? upInp.value.trim() : '';
        const ytUrl = ytInp ? ytInp.value.trim() : '';
        if (isUploadTab) sectionsPayload.howToBuy.videoUrl = upUrl || ytUrl;
        else sectionsPayload.howToBuy.videoUrl = ytUrl || upUrl;
      })();
      const hbBtnTextEl = view.querySelector('[data-hb-btntext]');
      if (hbBtnTextEl) sectionsPayload.howToBuy.btnText = hbBtnTextEl.value.trim();
      const hbBtnLinkEl = view.querySelector('[data-hb-btnlink]');
      if (hbBtnLinkEl) sectionsPayload.howToBuy.btnLink = hbBtnLinkEl.value.trim();

      const msgBox = $('hpMsg');
      msgBox.classList.add('hidden');
      try {
        await api('/api/admin/homepage', { method: 'PUT', body: JSON.stringify({ hero: heroPayload, sections: sectionsPayload }) });
        msgBox.textContent = 'Home page saved successfully! Preview: index.html';
        msgBox.className = 'mt-4 text-[12px] font-semibold rounded-lg px-3 py-2 bg-[#E6F4EA] text-[#16A34A] border border-[#C8E9D5]';
        msgBox.classList.remove('hidden');
        toast('Home page saved');
      } catch(err){
        msgBox.textContent = err.message;
        msgBox.className = 'mt-4 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        msgBox.classList.remove('hidden');
        toast(err.message, false);
      }
    }
    $('hpSave').addEventListener('click', doSave);
    const hpSave2 = $('hpSave2');
    if (hpSave2) hpSave2.addEventListener('click', doSave);
    $('hpReset').addEventListener('click', function(){
      confirmDialog('Reset Home Page?', 'Sob text & image default e firbe. Are you sure?', async function(){
        try { await api('/api/admin/homepage/reset', {method:'POST'}); toast('Reset done'); renderHomePage(); } catch(e){ toast(e.message,false); }
      }, 'Yes, Reset');
    });
    // ---- Home editor UX: collapse cards, show/hide all, visible counter ----
    try {
      view.querySelectorAll('[data-sec-head]').forEach(function(head){
        head.addEventListener('click', function(e){
          if (e.target.closest('label,input,select,textarea,button,a')) return;
          var body = head.parentElement.querySelector('[data-sec-body]');
          var chev = head.querySelector('[data-sec-chev]');
          if (body) body.classList.toggle('hidden');
          if (chev) chev.classList.toggle('rotate-180');
        });
      });
      var secInputs = function(){ return Array.from(view.querySelectorAll('[data-sec-enabled]')); };
      var paintStatus = function(input){
        var st = input.closest('[data-sec-head]').querySelector('[data-sec-status]');
        if (!st) return;
        st.innerHTML = input.checked ? '<span class="text-[#16A34A] font-bold">Visible</span>' : '<span class="text-slate-400">Hidden</span>';
      };
      var paintCount = function(){
        var all = secInputs();
        var on = all.filter(function(i){ return i.checked; }).length;
        var el = $('secVisibleCount');
        if (el) el.textContent = on + ' / ' + all.length + ' sections visible';
      };
      if (!view._secDelegated) {
        view.addEventListener('change', function(e){
          if (e.target && e.target.matches && e.target.matches('[data-sec-enabled]')) { paintStatus(e.target); paintCount(); }
        });
        view._secDelegated = true;
      }
      secInputs().forEach(paintStatus); paintCount();
      var allOn = $('secAllOn'), allOff = $('secAllOff');
      if (allOn) allOn.addEventListener('click', function(){ secInputs().forEach(function(i){ i.checked = true; paintStatus(i); }); paintCount(); });
      if (allOff) allOff.addEventListener('click', function(){ secInputs().forEach(function(i){ i.checked = false; paintStatus(i); }); paintCount(); });
      var setAllBodies = function(show){
        view.querySelectorAll('#secGrid [data-sec-body]').forEach(function(b){ b.classList.toggle('hidden', !show); });
        view.querySelectorAll('#secGrid [data-sec-chev]').forEach(function(c){ c.classList.toggle('rotate-180', show); });
      };
      var expAll = $('secExpandAll'), colAll = $('secCollapseAll');
      if (expAll) expAll.addEventListener('click', function(){ setAllBodies(true); });
      if (colAll) colAll.addEventListener('click', function(){ setAllBodies(false); });
    } catch (e) {}
  }

  /* ---------------- boot / init ---------------- */
  async function refreshMeta() {
    try {
      const json = await api('/api/admin/batches');
      state.meta.batches = json.data || [];
      try {
        const eb = await api('/api/admin/ebookBatches');
        state.meta.ebookBatches = eb.data || [];
      } catch (e) { state.meta.ebookBatches = []; }
      const c = await api('/api/admin/categories');
      state.meta.categories = c.data || [];
      const p = await api('/api/admin/platforms');
      state.meta.platforms = p.data || [];
      try {
        const g = await api('/api/admin/groups');
        state.meta.groups = g.data || [];
      } catch (e) { state.meta.groups = []; }
      try {
        const s = await api('/api/admin/subjects');
        state.meta.subjects = s.data || [];
      } catch (e) { state.meta.subjects = []; }
    } catch (err) {
      toast('Could not load settings data: ' + err.message, false);
    }
  }

  async function boot() {
    await refreshMeta();
    if (!location.hash) location.hash = '#/dashboard';
    route();
    refreshOrdersBadge();
  }

  async function init() {
    if (state.started) return;
    state.started = true;
    if (!state.token) {
      showLogin();
      return;
    }
    try {
      const me = await api('/api/admin/me');
      state.admin = me.data;
      showApp();
      await boot();
    } catch (err) {
      showLogin();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState === 'complete' || document.readyState === 'interactive') init();
})();













