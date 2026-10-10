/**
 * Simple file-based JSON data store with in-memory cache.
 * No native dependencies -> works everywhere (Windows/Linux/Mac).
 */
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const COLLECTIONS = ['users', 'courses', 'lessons', 'ebooks', 'ebookBatches', 'batches', 'categories', 'platforms', 'groups', 'subjects', 'coupons', 'orders', 'admins', 'adminInvites', 'commissions', 'withdrawals', 'walletTxns'];

let cache = null;

function defaultHomePage() {
  return {
    hero: {
      enabled: true,
      badge: 'Smart Learning, Better Future',
      titleLine1: 'Your Learning',
      titleLine2: 'Journey',
      highlight: 'Starts Here',
      description: 'Explore our wide range of academic, admission<br> and skill development courses.',
      searchPlaceholder: 'Search for courses, subjects or topics...',
      ctaText: 'Explore Courses',
      ctaLink: 'courses.html',
      imageUrl: '',
      imageAlt: 'StudyMart Hero Image'
    },
    sections: {
      categories: {
        enabled: true,
        title: '',
        limit: 50,
        cols: 4,
        rows: 0,
        layout: 'grid',
        display: 'grid',
        showArrows: true,
        equalHeight: true,
        batchIds: [],
        items: [
          { id: 'hsc26', name: 'HSC 26', icon: 'fa-graduation-cap', color: '#6366F1', bg: '#EEF2FF', link: 'batch.html?batch=hsc26', enabled: true },
          { id: 'hsc27', name: 'HSC 27', icon: 'fa-graduation-cap', color: '#6366F1', bg: '#EEF2FF', link: 'batch.html?batch=hsc27', enabled: true },
          { id: 'hsc28', name: 'HSC 28', icon: 'fa-graduation-cap', color: '#6366F1', bg: '#EEF2FF', link: 'batch.html?batch=hsc28', enabled: true },
          { id: 'ssc', name: 'SSC', icon: 'fa-book-open', color: '#6366F1', bg: '#EEF2FF', link: 'batch.html?batch=ssc26', enabled: true },
          { id: 'skill', name: 'Skill Development', icon: 'fa-briefcase', color: '#6366F1', bg: '#EEF2FF', link: 'batch.html?batch=skill-development', enabled: true }
        ]
      },
      ebookCategory: { enabled: true, title: 'E-Book Category', subtitle: '', limit: 50, cols: 4, rows: 0 },
      popular: { enabled: true, title: 'Popular Courses', subtitle: '', limit: 8, rows: 2 },
      latest: { enabled: false, title: 'Latest Courses', subtitle: '', limit: 8, rows: 2 },
      ebooks: { enabled: true, title: 'Ebooks', subtitle: '', limit: 8, rows: 2 },
      popularEbooks: { enabled: true, title: 'Popular Ebooks', subtitle: '', limit: 8, rows: 2 },
      featured: { enabled: true, title: 'Featured Courses', subtitle: 'Hand-picked by the StudyMart team' },
      howToBuy: { enabled: true, title: 'How To Buy', subtitle: 'Course kinar sohoj niyom', description: '1. Pochonder course select kore <b>Buy Now</b> chap dao<br>2. bKash / Nagad / Rocket diye payment complete koro<br>3. Admin confirm korlei course tomar <b>Dashboard</b> e peye jabe', videoUrl: '', btnText: 'Browse Courses', btnLink: 'courses.html' },
      stats: { enabled: true, title: 'StudyMart at a Glance' },
      batchesSection: { enabled: false, title: 'Our Batches' },
      browseCategory: { enabled: false, title: 'Browse by Category' },
      // Batch page (batch.html + ebbatch.html) category tabs: position order + grid columns
      categoryTabs: { tabOrder: ['academic', 'admission', 'revision'], cols: 3 }
    }
  };
}

function defaultEmailTemplates() {
  return {
    welcome: {
      name: 'Welcome (new student)',
      enabled: true,
      subject: 'Welcome to {{siteName}}, {{name}}! 🎉',
      body: 'Hi {{name}},\n\nWelcome to {{siteName}}! Your account has been created successfully.\n\nYou can now browse courses, track orders and start learning from your Dashboard.\n\nNeed help? Just reply to this email — we usually respond within a few hours.\n\nHappy learning!\n- {{siteName}} Team'
    },
    order_pending: {
      name: 'Order received (pending)',
      enabled: true,
      subject: 'Order {{orderNo}} received - payment pending ⏳',
      body: 'Hi {{name}},\n\nThanks for your order! We have received order {{orderNo}} ({{total}}).\nItems: {{items}}\nPayment method: {{payment}}\n\nManual payment (bKash / Nagad / Rocket) hole payment complete kore ektu opekkha koro — admin confirm korlei course Dashboard-e peye jabe.\nOnline payment kore thakle Dashboard check koro, course already add hoye jete pare.\n\nOrder date: {{orderDate}}\n- {{siteName}} Team'
    },
    order_confirmed: {
      name: 'Order confirmed',
      enabled: true,
      subject: 'Order {{orderNo}} confirmed ✅ Start learning!',
      body: 'Hi {{name}},\n\nGreat news! Your payment for order {{orderNo}} ({{total}}) has been confirmed.\nItems: {{items}}\n\nTomar course ekhon Dashboard-e ready — ekhoni class shuru koro!\n\nHappy learning!\n- {{siteName}} Team'
    },
    order_completed: {
      name: 'Order completed',
      enabled: true,
      subject: 'Order {{orderNo}} completed 🎓 Enjoy!',
      body: 'Hi {{name}},\n\nYour order {{orderNo}} is now complete.\nItems: {{items}}\n\nCourse niye kono somossa hole reply dao — amra help korbo.\n\nHappy learning!\n- {{siteName}} Team'
    },
    order_cancelled: {
      name: 'Order cancelled',
      enabled: true,
      subject: 'Order {{orderNo}} cancelled',
      body: 'Hi {{name}},\n\nYour order {{orderNo}} ({{total}}) has been cancelled.\nJodi eta vul hoye thake ba payment already kore thako, ei mail-e reply dao — amra check kore janabo.\n\n- {{siteName}} Team'
    },
    new_order_admin: {
      name: 'Admin alert (new order)',
      enabled: true,
      subject: '🔔 New order {{orderNo}} - {{total}} ({{payment}})',
      body: 'A new order has arrived!\n\nOrder No: {{orderNo}}\nDate: {{orderDate}}\nCustomer: {{name}} ({{phone}}, {{email}})\nItems: {{items}}\nTotal: {{total}}\nPayment: {{payment}}\nStatus: {{status}}\n\nPlease confirm it from Admin Panel > Orders.\n\n- {{siteName}}'
    }
  };
}

/* Legacy Banglish template bodies — untouched custom templates are never
 * overwritten; only stored templates identical to these old defaults are
 * upgraded to the English versions above. */
function legacyEmailTemplateBodies() {
  return {
    welcome: 'Hi {{name}},\nYour account has been created successfully.\nLogin kore tomar courses Dashboard theke dekhte parbe.\n\n- {{siteName}} Team',
    order_pending: 'Hi {{name}},\nTomar order {{orderNo}} peyechi ({{total}}).\nItems: {{items}}\nPayment confirm holei Dashboard-e course peye jabe.\n\n- {{siteName}} Team',
    order_confirmed: 'Hi {{name}},\nGreat news! Tomar order {{orderNo}} confirm hoyeche.\nItems: {{items}}\nDashboard theke ekhoni shuru koro.\n\n- {{siteName}} Team',
    order_completed: 'Hi {{name}},\nTomar order {{orderNo}} complete.\nItems: {{items}}\nHappy learning!\n\n- {{siteName}} Team',
    order_cancelled: 'Hi {{name}},\nTomar order {{orderNo}} cancel kora hoyeche.\nSupport-e contact koro jodi vul hoye thake.\n\n- {{siteName}} Team',
    new_order_admin: 'New order eseche!\n\nOrder No: {{orderNo}}\nCustomer: {{name}} ({{phone}}, {{email}})\nItems: {{items}}\nTotal: {{total}}\nPayment: {{payment}}\nStatus: {{status}}\n\nAdmin panel > Orders theke confirm koro.\n\n- {{siteName}}'
  };
}

/* ---------- Custom step labels (per-course hierarchy names) ----------
 * Client chaile Section/Sub-Section/Chapter/Topic/Sub-Topic-er naam course
 * onujayi bodlate parbe (e.g. Chapter -> Module, Topic -> Part).
 * Na bodlale default naam-ই cholbe (backward compat). */
function defaultStepLabels() {
  return { section: 'Section', subsection: 'Sub-Section', chapter: 'Chapter', topic: 'Topic', subtopic: 'Sub-Topic' };
}
function normalizeStepLabels(v) {
  if (v === undefined) return undefined;
  const defs = defaultStepLabels();
  const out = {};
  const src = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  Object.keys(defs).forEach(k => {
    const s = String(src[k] !== undefined ? src[k] : '').trim().slice(0, 40);
    if (s) out[k] = s;
  });
  return out;
}
function resolveStepLabels(course) {
  const defs = defaultStepLabels();
  const custom = (course && course.stepLabels && typeof course.stepLabels === 'object') ? course.stepLabels : {};
  const out = {};
  Object.keys(defs).forEach(k => {
    const s = String(custom[k] !== undefined ? custom[k] : '').trim().slice(0, 40);
    out[k] = s || defs[k];
  });
  // course.steps (generic Steps manager) — notun rename id theke ashe, seta authoritative
  try {
    if (course && Array.isArray(course.steps) && course.steps.length) {
      normalizeSteps(course.steps).forEach(sd => {
        if (out[sd.id] !== undefined && sd.name) out[sd.id] = String(sd.name).slice(0, 40);
      });
    }
  } catch (e) {}
  return out;
}

/* ---------- Generic unlimited steps (no max limit) ----------
 * course.steps: [{id, name}] ordered hierarchy, e.g.
 *   [{id:'section',name:'Section'},{id:'subsection',name:'Sub-Section'},
 *    {id:'chapter',name:'Chapter'},{id:'c1',name:'Part'}]
 * Core ids (rename-only, never deleted): section, subsection, chapter.
 * Legacy ids (dual-written with lesson.subject/subsection/section/chapter/
 * topic/subtopic so old readers keep working): topic, subtopic.
 * Custom ids: c1, c2, ... (live only in lesson.steps).
 * lesson.steps: {stepId: value} for ALL levels. */
const CORE_STEP_IDS = ['section', 'subsection', 'chapter'];
const KNOWN_STEP_IDS = ['section', 'subsection', 'chapter', 'topic', 'subtopic'];
function defaultSteps() {
  return [
    { id: 'section', name: 'Section' },
    { id: 'subsection', name: 'Sub-Section' },
    { id: 'chapter', name: 'Chapter' }
  ];
}
function normalizeSteps(v) {
  const list = Array.isArray(v) ? v : [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const id = String(raw.id || '').trim().slice(0, 20);
    if (!id || seen.has(id)) continue;
    const name = String(raw.name || '').trim().slice(0, 40) || id;
    seen.add(id);
    out.push({ id, name });
    if (out.length >= 50) break;
  }
  // core 3 always present, in order, at front
  const rest = out.filter(s => CORE_STEP_IDS.indexOf(s.id) === -1);
  const front = defaultSteps().map(c => {
    const f = out.find(s => s.id === c.id);
    return { id: c.id, name: (f && f.name) || c.name };
  });
  return front.concat(rest);
}
function resolveSteps(course) {
  try {
    const norm = normalizeSteps(course && course.steps);
    if (norm && norm.length) return norm;
  } catch (e) {}
  return defaultSteps();
}
/* lesson.steps normalize: {stepId: value(<=120)} — max 50 keys */
function normalizeLessonSteps(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  Object.keys(v).slice(0, 50).forEach(k => {
    const id = String(k || '').trim().slice(0, 20);
    if (!id) return;
    out[id] = String(v[k] !== undefined && v[k] !== null ? v[k] : '').trim().slice(0, 120);
  });
  return out;
}
/* One lesson-er ekta step-er value (steps object > legacy fields fallback) */
function lessonStepValue(l, id) {
  try {
    if (l && l.steps && typeof l.steps === 'object' && !Array.isArray(l.steps) && l.steps[id] !== undefined) {
      return String(l.steps[id] || '').trim();
    }
  } catch (e) {}
  try {
    if (id === 'section') return (l.subject && String(l.subject).trim()) ? String(l.subject).trim() : '';
    if (id === 'subsection') return (l.subsection && String(l.subsection).trim()) ? String(l.subsection).trim() : '';
    if (id === 'chapter') return String(l.section || l.chapter || '').trim() || '';
    if (id === 'topic') return (l.topic && String(l.topic).trim()) ? String(l.topic).trim() : '';
    if (id === 'subtopic') return (l.subtopic && String(l.subtopic).trim()) ? String(l.subtopic).trim() : '';
  } catch (e) {}
  return '';
}
/* steps object theke legacy lesson fields (dual-write — purono reader safe) */
function legacyFieldsFromSteps(steps) {
  const s = steps || {};
  const chap = String(s.chapter || '').trim();
  return {
    subject: String(s.section || '').trim(),
    subsection: String(s.subsection || '').trim(),
    section: chap,
    chapter: chap,
    topic: String(s.topic || '').trim(),
    subtopic: String(s.subtopic || '').trim()
  };
}
/* One-time steps migration (idempotent): lessons.steps backfill + course.steps build + emptyStructure normalize */
function migrateSteps() {
  let changed = false;
  try {
    const db = load();
    const LEGACY_NODE_MAP = { s: 'section', ss: 'subsection', section: 'section', subsection: 'subsection', c: 'chapter', chapter: 'chapter', t: 'topic', topic: 'topic', st: 'subtopic', subtopic: 'subtopic', subTopic: 'subtopic' };
    const nodeToPath = (n) => {
      if (!n || typeof n !== 'object') return null;
      const src = (n.path && typeof n.path === 'object' && !Array.isArray(n.path)) ? n.path : n;
      const path = {};
      Object.keys(src).forEach(k => {
        if (k === 'path') return;
        const id = LEGACY_NODE_MAP[k] || String(k).trim().slice(0, 20);
        const v = String(src[k] !== undefined && src[k] !== null ? src[k] : '').trim().slice(0, 120);
        if (id && v) path[id] = v;
      });
      return Object.keys(path).length ? { path } : null;
    };
    (db.lessons || []).forEach(l => {
      const hasSteps = l.steps && typeof l.steps === 'object' && !Array.isArray(l.steps) && Object.keys(l.steps).length;
      if (!hasSteps) {
        l.steps = {
          section: (l.subject && String(l.subject).trim()) ? String(l.subject).trim() : '',
          subsection: (l.subsection && String(l.subsection).trim()) ? String(l.subsection).trim() : '',
          chapter: String(l.section || l.chapter || '').trim() || '',
          topic: (l.topic && String(l.topic).trim()) ? String(l.topic).trim() : '',
          subtopic: (l.subtopic && String(l.subtopic).trim()) ? String(l.subtopic).trim() : ''
        };
        changed = true;
      }
    });
    (db.courses || []).forEach(c => {
      if (Array.isArray(c.steps) && c.steps.length) return;
      const labels = resolveStepLabels(c);
      const defs = defaultSteps().map(d => ({ id: d.id, name: labels[d.id] || d.name }));
      const lessons = (db.lessons || []).filter(l => String(l.courseId) === String(c.id));
      const valExists = (id) => lessons.some(l => lessonStepValue(l, id));
      const emptyNodes = Array.isArray(c.emptyStructure) ? c.emptyStructure : [];
      const nodeHas = (id) => emptyNodes.some(n => {
        const p = nodeToPath(n);
        return p && p.path[id];
      });
      const customT = labels.topic && labels.topic !== 'Topic';
      const customSt = labels.subtopic && labels.subtopic !== 'Sub-Topic';
      if (customT || valExists('topic') || nodeHas('topic')) defs.push({ id: 'topic', name: labels.topic || 'Topic' });
      if (customSt || valExists('subtopic') || nodeHas('subtopic')) defs.push({ id: 'subtopic', name: labels.subtopic || 'Sub-Topic' });
      c.steps = normalizeSteps(defs);
      changed = true;
    });
    (db.courses || []).forEach(c => {
      if (!Array.isArray(c.emptyStructure) || !c.emptyStructure.length) return;
      const conv = [];
      c.emptyStructure.forEach(n => {
        const p = nodeToPath(n);
        if (p) conv.push(p);
      });
      const before = JSON.stringify(c.emptyStructure);
      const after = JSON.stringify(conv);
      if (before !== after) { c.emptyStructure = conv; changed = true; }
    });
    if (changed) {
      save();
      console.log('[store] Steps migrated (lessons + courses + empty nodes)');
    }
  } catch (e) { console.error('[store] Steps migration failed:', e.message); }
  return changed;
}

function defaultEmailSettings() {
  return {
    emailEnabled: false,
    emailProvider: 'smtp',
    senderName: 'StudyMart',
    senderEmail: '',
    smtpHost: 'smtp.gmail.com',
    smtpPort: '587',
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    sendgridApiKey: '',
    brevoApiKey: '',
    adminNotifyEnabled: false,
    adminNotifyEmail: '',
    maintenanceEnabled: false,
    maintenanceTitle: 'Maintenance cholche 🔧',
    maintenanceMessage: 'Amra site update korchi. Kichukkhon por abar aso.',
    maintenanceEta: ''
  };
}

function emptyDB() {
  const db = { settings: Object.assign({}, defaultEmailSettings()), homePage: defaultHomePage(), emailTemplates: defaultEmailTemplates() };
  db.admins = [{ id: 1, username: 'admin', password: 'admin123', name: 'Super Admin', role: 'superadmin' }];
  COLLECTIONS.forEach(c => { if (c !== 'admins') db[c] = []; });
  return db;
}

function normalize(db) {
  const base = emptyDB();
  const out = Object.assign({}, base, db || {});
  COLLECTIONS.forEach(c => { if (!Array.isArray(out[c])) out[c] = []; });
  if (!out.settings || typeof out.settings !== 'object') out.settings = base.settings;
  out.settings = Object.assign({}, defaultEmailSettings(), out.settings);
  if (!out.emailTemplates || typeof out.emailTemplates !== 'object') out.emailTemplates = defaultEmailTemplates();
  const legacyBodies = legacyEmailTemplateBodies();
  // Previous English defaults (v1) — untouched (non-customized) templates auto-upgrade to new content
  const prevEnglishBodies = {
    welcome: 'Hi {{name}},\nYour account has been created successfully.\nLog in to view your courses from the Dashboard.\n\n- {{siteName}} Team',
    order_pending: 'Hi {{name}},\nWe have received your order {{orderNo}} ({{total}}).\nItems: {{items}}\nOnce your payment is confirmed, your courses will appear on the Dashboard.\n\n- {{siteName}} Team',
    order_confirmed: 'Hi {{name}},\nGreat news! Your order {{orderNo}} has been confirmed.\nItems: {{items}}\nStart learning right now from your Dashboard.\n\n- {{siteName}} Team',
    order_completed: 'Hi {{name}},\nYour order {{orderNo}} is now complete.\nItems: {{items}}\nHappy learning!\n\n- {{siteName}} Team',
    order_cancelled: 'Hi {{name}},\nYour order {{orderNo}} has been cancelled.\nPlease contact support if you think this is a mistake.\n\n- {{siteName}} Team',
    new_order_admin: 'A new order has arrived!\n\nOrder No: {{orderNo}}\nCustomer: {{name}} ({{phone}}, {{email}})\nItems: {{items}}\nTotal: {{total}}\nPayment: {{payment}}\nStatus: {{status}}\n\nPlease confirm it from Admin Panel > Orders.\n\n- {{siteName}}'
  };
  Object.keys(defaultEmailTemplates()).forEach(k => {
    out.emailTemplates[k] = Object.assign({}, defaultEmailTemplates()[k], out.emailTemplates[k] || {});
    // Upgrade stored templates that still match the old Banglish defaults (custom edits untouched)
    if (legacyBodies[k] && out.emailTemplates[k].body === legacyBodies[k]) {
      out.emailTemplates[k].body = defaultEmailTemplates()[k].body;
    }
    // Upgrade stored templates that still match the previous English defaults
    if (prevEnglishBodies[k] && out.emailTemplates[k].body === prevEnglishBodies[k]) {
      out.emailTemplates[k].body = defaultEmailTemplates()[k].body;
      out.emailTemplates[k].subject = defaultEmailTemplates()[k].subject;
      // cancelled mail age default OFF chilo — ekhon auto-mail chai bole ON kore dao
      if (k === 'order_cancelled') out.emailTemplates[k].enabled = true;
    }
    if (k === 'new_order_admin' && out.emailTemplates[k].name === 'Admin alert (new order asle)') {
      out.emailTemplates[k].name = defaultEmailTemplates()[k].name;
    }
  });
  if (!out.homePage || typeof out.homePage !== 'object') out.homePage = base.homePage;
  // deep merge homePage defaults
  out.homePage.hero = Object.assign({}, base.homePage.hero, out.homePage.hero || {});
  out.homePage.sections = Object.assign({}, base.homePage.sections, out.homePage.sections || {});
  Object.keys(base.homePage.sections).forEach(k => {
    out.homePage.sections[k] = Object.assign({}, base.homePage.sections[k], (out.homePage.sections[k] || {}));
  });
  // ensure categories batchIds is array + cols/limit defaults for unlimited + row/col management
  if (!Array.isArray(out.homePage.sections.categories.batchIds)) out.homePage.sections.categories.batchIds = [];
  if (!Array.isArray(out.homePage.sections.categories.items)) out.homePage.sections.categories.items = base.homePage.sections.categories.items.slice();
  if (!out.homePage.sections.categories.cols) out.homePage.sections.categories.cols = 4;
  if (!out.homePage.sections.categories.limit || Number(out.homePage.sections.categories.limit) < 1) out.homePage.sections.categories.limit = 50;
  if (!out.homePage.sections.ebookCategory.cols) out.homePage.sections.ebookCategory.cols = 4;
  if (!out.homePage.sections.ebookCategory.limit || Number(out.homePage.sections.ebookCategory.limit) < 1) out.homePage.sections.ebookCategory.limit = 50;
  // migrate old layout values: 1row -> scroll, 2rows -> grid
  if (out.homePage.sections.categories.layout === '1row') { out.homePage.sections.categories.display = 'scroll'; out.homePage.sections.categories.layout = 'grid'; }
  if (out.homePage.sections.categories.layout === '2rows') { out.homePage.sections.categories.display = 'grid'; out.homePage.sections.categories.layout = 'grid'; }
  if (!out.homePage.sections.categories.display) out.homePage.sections.categories.display = 'grid';
  return out;
}

function load() {
  if (cache) return cache;
  try {
    cache = normalize(JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')));
  } catch (err) {
    console.error('[store] DB read failed, starting with empty DB:', err.message);
    cache = emptyDB();
  }
  return cache;
}

function save() {
  const db = load();
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('[store] DB write failed:', err.message);
  }
  return db;
}

/* ---------- One-time media migration (super-fast loading) ----------
 * Admin panel base64 data-URL hisebe save kore (thumbnail/cover/logo) —
 * egula protita API response-e MB er por MB jeto. Ekhane ekbar file-e
 * namiye /uploads/media/ URL bosiye dei, tarpor db.json + sob API choto
 * thake + browser image alada kore cache korte pare. */
const MEDIA_MIME_EXT = {
  'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png',
  'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg'
};
/* ---------- Save one data-URL image as file (admin write path) ----------
 * Admin panel thumbnail/cover/logo base64 pathale songe songe file baniye
 * URL return kore — db.json kokhono vari hoy na. Normal URL untouched. */
function storeImage(dataUrl, prefix) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return dataUrl;
  const m = dataUrl.match(/^data:([^;,]+)(;base64)?,(.*)$/);
  if (!m) return dataUrl;
  const ext = MEDIA_MIME_EXT[String(m[1]).toLowerCase()] || '.png';
  let buf = null;
  try { buf = Buffer.from(m[3], 'base64'); } catch (e) { return dataUrl; }
  if (!buf || buf.length < 100 || buf.length > 8 * 1024 * 1024) return dataUrl;
  try {
    const crypto = require('crypto');
    const dir = path.join(__dirname, '..', 'uploads', 'media');
    fs.mkdirSync(dir, { recursive: true });
    const name = prefix + '-' + Date.now() + '-' + crypto.randomBytes(6).toString('hex') + ext;
    fs.writeFileSync(path.join(dir, name), buf);
    return '/uploads/media/' + name;
  } catch (e) { return dataUrl; }
}
let mediaMigrated = false;
function migrateMedia() {
  if (mediaMigrated) return false;
  mediaMigrated = true;
  let changed = 0;
  const saveDataUrl = (dataUrl, prefix) => {
    const m = String(dataUrl || '').match(/^data:([^;,]+)(;base64)?,(.*)$/);
    if (!m) return null;
    const ext = MEDIA_MIME_EXT[String(m[1]).toLowerCase()] || '.png';
    let buf = null;
    try { buf = Buffer.from(m[3], 'base64'); } catch (e) { return null; }
    if (!buf || buf.length < 100 || buf.length > 8 * 1024 * 1024) return null;
    try {
      const crypto = require('crypto');
      const dir = path.join(__dirname, '..', 'uploads', 'media');
      fs.mkdirSync(dir, { recursive: true });
      const name = prefix + '-' + Date.now() + '-' + crypto.randomBytes(6).toString('hex') + ext;
      fs.writeFileSync(path.join(dir, name), buf);
      changed++;
      return '/uploads/media/' + name;
    } catch (e) { return null; }
  };
  const fixField = (obj, key, prefix) => {
    if (obj && typeof obj[key] === 'string' && obj[key].startsWith('data:')) {
      const url = saveDataUrl(obj[key], prefix);
      if (url) obj[key] = url;
    }
  };
  try {
    const db = load();
    if (db.settings) fixField(db.settings, 'logoUrl', 'logo');
    if (db.homePage && db.homePage.hero) fixField(db.homePage.hero, 'imageUrl', 'hero');
    (db.courses || []).forEach((c, i) => fixField(c, 'thumbnail', 'course-' + (c.id || i)));
    (db.ebooks || []).forEach((e, i) => fixField(e, 'cover', 'ebook-' + (e.id || i)));
    (db.batches || []).forEach((b, i) => fixField(b, 'iconUrl', 'batch-' + (b.id || i)));
    (db.ebookBatches || []).forEach((b, i) => fixField(b, 'iconUrl', 'ebbatch-' + (b.id || i)));
    if (changed) {
      save();
      console.log('[store] Media migrated to files: ' + changed + ' image(s), db.json is light now');
    }
  } catch (e) { console.error('[store] Media migration failed:', e.message); }
  return changed > 0;
}

function all(collection) {
  return load()[collection] || [];
}

function find(collection, id) {
  return all(collection).find(item => String(item.id) === String(id)) || null;
}

function findBy(collection, key, value) {
  return all(collection).find(item => String(item[key]).toLowerCase() === String(value).toLowerCase()) || null;
}

function nextId(collection) {
  const list = all(collection);
  return list.length ? Math.max(...list.map(i => Number(i.id) || 0)) + 1 : 1;
}

function insert(collection, data) {
  const db = load();
  const item = Object.assign({ id: nextId(collection), createdAt: new Date().toISOString() }, data);
  db[collection].push(item);
  save();
  return item;
}

function update(collection, id, data) {
  const item = find(collection, id);
  if (!item) return null;
  Object.keys(data).forEach(k => {
    if (k === 'id' || k === 'createdAt') return;
    item[k] = data[k];
  });
  item.updatedAt = new Date().toISOString();
  save();
  return item;
}

function remove(collection, id) {
  const db = load();
  const idx = db[collection].findIndex(i => String(i.id) === String(id));
  if (idx === -1) return null;
  const [removed] = db[collection].splice(idx, 1);
  save();
  return removed;
}

function paginate(list, query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(200, Math.max(0, parseInt(query.limit, 10) || 0)) || list.length || 1;
  const start = (page - 1) * limit;
  return {
    items: list.slice(start, start + limit),
    page,
    limit,
    total: list.length,
    totalPages: Math.max(1, Math.ceil(list.length / limit))
  };
}

module.exports = {
  DB_PATH, COLLECTIONS,
  load, save, all, find, findBy, nextId, insert, update, remove, paginate,
  defaultHomePage, defaultEmailTemplates, defaultEmailSettings, migrateMedia, storeImage,
  defaultStepLabels, normalizeStepLabels, resolveStepLabels,
  CORE_STEP_IDS, KNOWN_STEP_IDS, defaultSteps, normalizeSteps, resolveSteps,
  normalizeLessonSteps, lessonStepValue, legacyFieldsFromSteps, migrateSteps
};
