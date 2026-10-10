/**
 * Referral + Wallet engine (shared by public + admin routes).
 * - User share referral code -> friend coupon box-e bosale % off
 * - Order confirm hole referrer wallet-e % commission
 * - Wallet diye kena + withdraw request (admin approve)
 */
const store = require('./store');

function settings() {
  return store.load().settings || {};
}

function refConfig() {
  const s = settings();
  return {
    enabled: s.referralEnabled === true || s.referralEnabled === 'true' || s.referralEnabled === 1,
    friendOff: Math.min(90, Math.max(0, Number(s.referralFriendOff) || 0)),
    commissionPct: Math.min(90, Math.max(0, Number(s.referralCommission) || 0)),
    minWithdraw: Math.max(0, Number(s.referralMinWithdraw) || 0)
  };
}

// Per-user customize (Admin > Users > Wallet & Referral):
// user.customCommission set thakle global commission-er bodle oita use hobe.
// user.customFriendOff set thakle friend discount-e oita use hobe.
// Empty/null = global default.
function userCommissionPct(user) {
  if (!user) return refConfig().commissionPct;
  const v = user.customCommission;
  if (v === null || v === undefined || v === '') return refConfig().commissionPct;
  const n = Number(v);
  if (!Number.isFinite(n)) return refConfig().commissionPct;
  return Math.min(90, Math.max(0, n));
}

function userFriendOff(user) {
  if (!user) return refConfig().friendOff;
  const v = user.customFriendOff;
  if (v === null || v === undefined || v === '') return refConfig().friendOff;
  const n = Number(v);
  if (!Number.isFinite(n)) return refConfig().friendOff;
  return Math.min(90, Math.max(0, n));
}

// 6-char unambiguous code (no 0/O/1/I)
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const existing = new Set(store.all('users').map(u => String(u.referralCode || '').toUpperCase()));
  for (let attempt = 0; attempt < 50; attempt++) {
    code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    if (!existing.has(code)) return code;
  }
  return 'R' + String(Date.now()).slice(-5);
}

function findByCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  return store.all('users').find(u => String(u.referralCode || '').toUpperCase() === c) || null;
}

// Purono user-der code na thakle lazy-assign (login/summary/profile hit-e)
function ensureCode(user) {
  if (!user) return null;
  if (user.referralCode && String(user.referralCode).trim()) return user.referralCode;
  const code = genCode();
  store.update('users', user.id, { referralCode: code });
  return code;
}

function walletOf(user) {
  return Math.max(0, Math.floor(Number((user && user.walletBalance) || 0)));
}

// Wallet credit/debit + history row (single place — balance kokhono negative hobe na)
function walletAdd(userId, amount, type, note, extra) {
  const u = store.find('users', userId);
  if (!u) return null;
  amount = Math.floor(Number(amount) || 0);
  if (!amount) return walletOf(u);
  const next = Math.max(0, walletOf(u) + amount);
  store.update('users', userId, { walletBalance: next });
  try {
    store.insert('walletTxns', Object.assign({
      userId: userId,
      type: type || 'adjust',
      amount: amount, // + credit, - debit
      balanceAfter: next,
      note: String(note || '').slice(0, 200),
      createdAt: new Date().toISOString()
    }, extra || {}));
  } catch (e) {}
  return next;
}

function walletStats(userId) {
  const txns = store.all('walletTxns').filter(t => String(t.userId) === String(userId));
  let earned = 0, withdrawn = 0, spent = 0;
  txns.forEach(t => {
    const a = Number(t.amount) || 0;
    if (t.type === 'commission' && a > 0) earned += a;
    if (t.type === 'withdraw' && a < 0) withdrawn += -a;
    if (t.type === 'purchase' && a < 0) spent += -a;
  });
  const pendingWd = store.all('withdrawals')
    .filter(w => String(w.userId) === String(userId) && w.status === 'pending')
    .reduce((s, w) => s + (Number(w.amount) || 0), 0);
  return { earned, withdrawn, spent, pendingWithdraw: pendingWd, txns: txns.length };
}

// Order confirm (admin) hole referrer-ke commission — order proti ekbar
// Per-user customCommission thakle global-er bodle referrer-er tai use hobe.
function grantCommission(order) {
  try {
    const cfg = refConfig();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    if (!order || !order.referrerId) return { ok: false, reason: 'no-referrer' };
    if (String(order.referrerId) === String(order.userId)) return { ok: false, reason: 'self' };
    const dup = store.all('commissions').some(c => String(c.orderId) === String(order.id) && c.status !== 'cancelled');
    if (dup) return { ok: false, reason: 'already' };
    const referrer = store.find('users', order.referrerId);
    if (!referrer) return { ok: false, reason: 'referrer-gone' };
    const pct = userCommissionPct(referrer);
    if (!pct) return { ok: false, reason: 'disabled' };
    // Base = asol paid amount (subtotal - discount). Wallet-paid ongsho bad — cycling rodh.
    const base = Math.max(0, Number(order.subtotal || 0) - Number(order.discount || 0) - Number(order.walletPaid || 0));
    const amount = Math.floor(base * pct / 100);
    if (amount <= 0) return { ok: false, reason: 'zero' };
    const com = store.insert('commissions', {
      userId: referrer.id,
      buyerId: order.userId,
      orderId: order.id,
      orderNo: order.orderNo || '',
      amount: amount,
      percent: pct,
      base: base,
      status: 'approved',
      createdAt: new Date().toISOString()
    });
    walletAdd(referrer.id, amount, 'commission', 'Commission: ' + (order.orderNo || ('order #' + order.id)), { orderId: order.id });
    return { ok: true, commission: com };
  } catch (e) { return { ok: false, reason: e.message }; }
}

// Order cancel hole: commission reverse + buyer-er walletPaid refund
function reverseCommission(order) {
  try {
    if (!order) return;
    order = store.find('orders', order.id) || order;
    const coms = store.all('commissions').filter(c => String(c.orderId) === String(order.id) && c.status === 'approved');
    coms.forEach(c => {
      store.update('commissions', c.id, { status: 'cancelled', cancelledAt: new Date().toISOString() });
      walletAdd(c.userId, -Math.abs(Number(c.amount) || 0), 'commission_reverse', 'Reversed: ' + (order.orderNo || ('order #' + order.id)), { orderId: order.id });
    });
    if (Number(order.walletPaid || 0) > 0 && !order.walletRefunded) {
      walletAdd(order.userId, Math.abs(Number(order.walletPaid)), 'refund', 'Refund: ' + (order.orderNo || ('order #' + order.id)), { orderId: order.id });
      store.update('orders', order.id, { walletRefunded: true });
    }
  } catch (e) {}
}

module.exports = {
  refConfig, userCommissionPct, userFriendOff, genCode, findByCode, ensureCode,
  walletOf, walletAdd, walletStats,
  grantCommission, reverseCommission
};
