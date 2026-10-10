/**
 * PipaPay payment gateway integration (docs: docs.piprapay.com,
 * self-hosted panel compatible: payment.dkwinbd.site).
 *
 * Flow:
 *  1. createCharge() -> { pp_id, pp_url } -> redirect student to pp_url
 *  2. After payment PipaPay redirects back to our redirect_url with pp_id
 *     (GET or POST per return_type) -> verifyPayment({ pp_id })
 *  3. status === 'completed' + amount match => mark order as paid.
 */

const SANDBOX_URL = 'https://sandbox.piprapay.com';

// Self-hosted panel header (official docs header 'mh-piprapay-api-key'-o accept kore,
// kintu ei panel 'MHS-PIPRAPAY-API-KEY' format-e key check kore — tai eitai pathano hoy)
const API_KEY_HEADER = 'MHS-PIPRAPAY-API-KEY';

function baseUrl(settings) {
  let u = String((settings && settings.piprapayBaseUrl) || '').trim().replace(/\/+$/, '');
  // Admin vul kore '/api' soho bosaleo cholbe (code nije '/api/...' jog kore)
  u = u.replace(/\/api$/i, '');
  return u || SANDBOX_URL;
}

function apiKey(settings) {
  return String((settings && settings.piprapayApiKey) || '').trim();
}

function isEnabled(settings) {
  return !!(settings && settings.piprapayEnabled) && !!apiKey(settings);
}

async function callApi(url, key, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [API_KEY_HEADER]: key },
    body: JSON.stringify(body)
  });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  if (!r.ok) {
    const msg = (j && j.error && j.error.message) || (j && j.message) || ('PipaPay request failed (HTTP ' + r.status + ')');
    const err = new Error(msg);
    err.status = r.status;
    err.data = j;
    throw err;
  }
  return j;
}

async function createCharge(settings, opts) {
  const key = apiKey(settings);
  if (!key) throw new Error('PipaPay API key is not configured');
  const base = baseUrl(settings);
  // Self-hosted panel format: email + mobile alada field, metadata.invoice_id-te order no
  const contact = String(opts.emailMobile || '').trim();
  const isEmail = contact.indexOf('@') > -1;
  const realMobile = (isEmail ? String(opts.phone || '') : (contact || String(opts.phone || ''))).trim();
  // Official docs (POST /api/checkout/redirect) require `return_url`,
  // self-hosted panel + পুরনো guide `redirect_url` expect করে —
  // তাই দুটোতেই same URL পাঠানো হয় যাতে যেকোনো panel-e redirect back কাজ করে।
  const backUrl = opts.redirectUrl || opts.returnUrl || '';
  const payload = {
    full_name: String(opts.fullName || 'Student'),
    email_address: isEmail ? contact : String(opts.email || ''),
    // Panel mobile mandatory — real number na thakle default fallback jabe.
    // (Order record-er customer.phone-te customer-er asol info-tai thake)
    mobile_number: realMobile || '01700000000',
    amount: String(opts.amount),
    metadata: { invoice_id: String(opts.invoiceId || '') },
    return_url: backUrl,
    redirect_url: backUrl,
    cancel_url: opts.cancelUrl,
    return_type: opts.returnType || 'GET',
    webhook_url: opts.webhookUrl || '',
    currency: opts.currency || 'BDT'
  };
  const j = await callApi(base + '/api/checkout/redirect', key, payload);
  if (!j || !j.pp_url) {
    throw new Error((j && j.message) || 'PipaPay did not return a payment URL');
  }
  return { pp_id: j.pp_id, pp_url: j.pp_url, raw: j };
}

async function verifyPayment(settings, ppId) {
  const key = apiKey(settings);
  if (!key) throw new Error('PipaPay API key is not configured');
  if (!ppId) throw new Error('Missing transaction id (pp_id)');
  const base = baseUrl(settings);
  const j = await callApi(base + '/api/verify-payment', key, { pp_id: String(ppId) });
  return j;
}

module.exports = { SANDBOX_URL, baseUrl, apiKey, isEnabled, createCharge, verifyPayment };
