/**
 * Admin API - everything the Admin Panel controls.
 * Every route here requires an admin session (Bearer token).
 */
const express = require('express');
const store = require('../store');
const auth = require('../auth');
const tracker = require('../tracker');

const router = express.Router();
router.use(auth.requireAdmin);

const FIELDS = {
  batches: ['name', 'slug', 'icon', 'iconUrl', 'color', 'status', 'order'],
  ebookBatches: ['name', 'slug', 'icon', 'iconUrl', 'color', 'status', 'order'],
  categories: ['name', 'slug', 'icon', 'color', 'status', 'for'],
  platforms: ['name', 'status'],
  groups: ['name', 'status'],
  subjects: ['name', 'status'],
  courses: ['title', 'slug', 'batchId', 'categoryId', 'platformId', 'groupId', 'subjectId', 'teacher', 'price', 'oldPrice',
    'duration', 'totalClass', 'thumbnail', 'description', 'featured', 'pinned', 'pinnedLessons', 'status',
    'telegramLink', 'telegramLinks', 'telegramChatIds', 'sectionTg', 'chapterTg', 'previewVideoId', 'features', 'tags', 'bannerColor', 'emptyStructure', 'stepLabels'],
  lessons: ['courseId', 'subject', 'subjectId', 'subsection', 'section', 'chapter', 'topic', 'subtopic', 'title', 'videoId', 'videoUrl', 'videoName', 'videoSize', 'videoType', 'duration', 'isFree', 'order', 'status', 'resources', 'telegramLinks', 'telegramChatIds'],
  coupons: ['code', 'type', 'value', 'minOrder', 'maxDiscount', 'usageLimit', 'used', 'expiresAt', 'status', 'courseIds', 'batchIds', 'categoryIds', 'userIds', 'allowedEmails', 'allowedPhones'],
  ebooks: ['title', 'slug', 'cover', 'details', 'author', 'price', 'oldPrice', 'fileUrl', 'fileName', 'fileSize', 'linkUrl', 'downloads', 'status', 'batchId', 'categoryId', 'ebookBatchId']
};

const NUMBER_FIELDS = ['price', 'oldPrice', 'totalClass', 'value', 'minOrder', 'maxDiscount',
  'usageLimit', 'used', 'batchId', 'categoryId', 'platformId', 'groupId', 'subjectId', 'order', 'ebookBatchId', 'videoSize'];
const BOOL_FIELDS = ['featured', 'pinned', 'pinnedLessons'];

function pick(entity, body) {
  const out = {};
  (FIELDS[entity] || []).forEach(key => {
    if (body[key] === undefined) return;
    let value = body[key];
    if (NUMBER_FIELDS.includes(key)) value = Number(value) || 0;
    if (BOOL_FIELDS.includes(key)) value = (value === true || value === 'true' || value === 1);
    out[key] = value;
  });
  return out;
}

function slugify(text) {
  return String(text || '').toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
}

/* ---------- Slug: khali thakle name/title theke auto + unique rakho ----------
 * Admin slug field khali rekhe save korle ("slug: -") public link/lookup
 * nosto hoy. Tai empty slug auto-generate + same entity-te clash hole -2/-3. */
function ensureUniqueSlug(entity, data, ignoreId) {
  if (!data.slug && (data.name || data.title)) data.slug = slugify(data.name || data.title);
  if (!data.slug) return;
  const all = store.all(entity);
  const base = String(data.slug);
  let slug = base, n = 2;
  while (all.some(x => String(x.id) !== String(ignoreId) && String(x.slug) === slug)) slug = base + '-' + (n++);
  data.slug = slug;
}

/* ---------- Image fields: base64 ele file banaw (db + API light rakhar jonno) ---------- */
const IMAGE_FIELDS = { courses: ['thumbnail'], ebooks: ['cover'], batches: ['iconUrl'], ebookBatches: ['iconUrl'] };
function lightenImages(entity, data, prev) {
  (IMAGE_FIELDS[entity] || []).forEach(key => {
    if (data[key] === undefined) return;
    const v = data[key];
    if (typeof v === 'string' && v.startsWith('data:')) {
      data[key] = store.storeImage(v, entity);
      // replace hole purono media file mushe felo
      if (prev && typeof prev[key] === 'string' && prev[key].startsWith('/uploads/media/') && prev[key] !== data[key]) {
        try {
          const path = require('path');
          const fs = require('fs');
          const fp = path.join(__dirname, '..', '..', prev[key]);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        } catch (e) { /* ignore */ }
      }
    }
  });
}

/* ---------- Multi Telegram normalize (error-proof) ----------
 * telegramLinks: [{label, url}] — static channel links (oneke add kora jabe)
 * telegramChatIds: [{label, chatId}] — private group/channel ID (auto invite-er jonno)
 * Purono single telegramLink thakleo cholbe (backward compat). */
function normalizeTelegramLinks(legacyLink, links) {
  const out = [];
  const push = (label, url) => {
    url = String(url || '').trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url) && !/^t\.me\//i.test(url)) return; // vul link bad
    if (/^t\.me\//i.test(url)) url = 'https://' + url;
    if (out.some(x => x.url.toLowerCase() === url.toLowerCase())) return; // duplicate bad
    out.push({ label: String(label || ('Channel ' + (out.length + 1))), url });
  };
  if (Array.isArray(links)) {
    links.forEach((x, i) => {
      if (typeof x === 'string') push('Channel ' + (i + 1), x);
      else if (x && typeof x === 'object') push(x.label || ('Channel ' + (i + 1)), x.url || x.link || '');
    });
  } else if (typeof links === 'string' && links.trim()) {
    // comma/newline separated string holeo vag kore ney (error khabe na)
    links.split(/[\n,]+/).forEach((u, i) => push('Channel ' + (i + 1), u));
  }
  if (legacyLink && String(legacyLink).trim()) push('Main Channel', legacyLink);
  return out.slice(0, 20); // max 20 ta
}

function normalizeTelegramChatIds(ids) {
  const out = [];
  const push = (label, chatId) => {
    chatId = String(chatId || '').trim().replace(/\s+/g, '');
    if (!chatId) return;
    if (!/^-?\d+$/.test(chatId)) return; // ID sudhu number/ -100xxx hoy
    if (out.some(x => x.chatId === chatId)) return; // duplicate bad
    out.push({ label: String(label || ('Group ' + (out.length + 1))), chatId });
  };
  if (Array.isArray(ids)) {
    ids.forEach((x, i) => {
      if (typeof x === 'string' || typeof x === 'number') push('Group ' + (i + 1), x);
      else if (x && typeof x === 'object') push(x.label || ('Group ' + (i + 1)), x.chatId || x.id || x.chat_id || '');
    });
  } else if (ids !== undefined && ids !== null && String(ids).trim() !== '') {
    String(ids).split(/[\n,]+/).forEach((c, i) => push('Group ' + (i + 1), c));
  }
  return out.slice(0, 20);
}

/* ---------- Course + tar sob class-er Group IDs (auto invite-er jonno merged) ----------
 * Class-level / Section-level / Chapter-level ID add korleo order approve-e
 * Bot auto single-use invite banabe. */
function mapTgIds(map) {
  const ids = [];
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    Object.keys(map).forEach(k => {
      const v = map[k] || {};
      (Array.isArray(v.ids) ? v.ids : (Array.isArray(v.telegramChatIds) ? v.telegramChatIds : [])).forEach(x => ids.push(x));
    });
  }
  return ids;
}
function courseAllChatIds(course) {
  const out = Array.isArray(course.telegramChatIds) ? course.telegramChatIds.slice() : [];
  const seen = new Set(out.map(x => String((x && typeof x === 'object' ? (x.chatId || x.id) : x) || '').trim()));
  const addMore = (arr) => {
    (Array.isArray(arr) ? arr : []).forEach(x => {
      const id = String((x && typeof x === 'object' ? (x.chatId || x.id) : x) || '').trim();
      if (id && !seen.has(id)) { seen.add(id); out.push(x); }
    });
  };
  store.all('lessons')
    .filter(l => String(l.courseId) === String(course.id))
    .forEach(l => addMore(l.telegramChatIds));
  addMore(mapTgIds(course.sectionTg));
  addMore(mapTgIds(course.chapterTg));
  return out;
}

/* ---------- Section/Chapter telegram maps normalize ----------
 * sectionTg: { "<Section>": { links:[{label,url}], ids:[{label,chatId}] } }
 * chapterTg: { "<Section||Chapter>": { links, ids } } — khali entry auto drop (remove support). */
function normalizeTgMap(map) {
  const out = {};
  if (!map || typeof map !== 'object' || Array.isArray(map)) return out;
  Object.keys(map).slice(0, 100).forEach(k => {
    const key = String(k || '').trim().slice(0, 120);
    if (!key) return;
    const v = map[k] || {};
    const links = normalizeTelegramLinks(undefined, v.links !== undefined ? v.links : v.telegramLinks);
    const ids = normalizeTelegramChatIds(v.ids !== undefined ? v.ids : (v.telegramChatIds !== undefined ? v.telegramChatIds : v.chatIds));
    if (links.length || ids.length) out[key] = { links, ids };
  });
  return out;
}

/* ---------- Empty structure (class charai save) — canonical storage: [{ path: { stepId: value } }] ----------
 * Legacy body { s, ss, c, t, st } o accept kore (client compatibility).
 * path-form theke legacy fields o derive kora jay (admin UI legacy read-er jonno). */
const NODE_KEY_MAP = { s: 'section', ss: 'subsection', section: 'section', subsection: 'subsection', c: 'chapter', chapter: 'chapter', t: 'topic', topic: 'topic', st: 'subtopic', subtopic: 'subtopic', subTopic: 'subtopic' };
function nodeToPath(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const src = (raw.path && typeof raw.path === 'object' && !Array.isArray(raw.path)) ? raw.path : raw;
  const path = {};
  Object.keys(src).forEach(k => {
    if (k === 'path') return;
    const id = NODE_KEY_MAP[k] || String(k).trim().slice(0, 20);
    const v = String(src[k] !== undefined && src[k] !== null ? src[k] : '').trim().slice(0, 120);
    if (id && v) path[id] = v;
  });
  return Object.keys(path).length ? { path } : null;
}
function pathToLegacy(n) {
  const p = (n && n.path && typeof n.path === 'object') ? n.path : (nodeToPath(n) || { path: {} }).path;
  return { s: p.section || '', ss: p.subsection || '', c: p.chapter || '', t: p.topic || '', st: p.subtopic || '', path: p };
}
function normalizeEmptyStructure(v) {
  if (v === undefined) return undefined;
  const list = Array.isArray(v) ? v : [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const p = nodeToPath(raw);
    if (!p) continue;
    const key = JSON.stringify(p.path);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= 200) break;
  }
  return out;
}
function pruneEmptyStructure(courseId, emptyArr) {
  // je node-e real class ache, empty list theke bad (real hoye geche)
  // node prefix-match: node-er sob filled level-e lesson-er value match korte hobe
  try {
    const lessons = store.all('lessons').filter(l => String(l.courseId) === String(courseId));
    const lessonPaths = lessons.map(l => {
      const steps = (l.steps && typeof l.steps === 'object' && !Array.isArray(l.steps)) ? l.steps : {};
      return {
        section: ((l.subject && String(l.subject).trim()) || steps.section || 'General'),
        subsection: ((l.subsection && String(l.subsection).trim()) || steps.subsection || ''),
        chapter: (String(l.section || l.chapter || steps.chapter || '').trim() || 'Chapter 1'),
        topic: ((l.topic && String(l.topic).trim()) || steps.topic || ''),
        subtopic: ((l.subtopic && String(l.subtopic).trim()) || steps.subtopic || ''),
        ...steps
      };
    });
    return (emptyArr || []).filter(n => {
      const p = (n && n.path && typeof n.path === 'object') ? n.path : (nodeToPath(n) || {}).path;
      if (!p || !Object.keys(p).length) return false;
      return !lessonPaths.some(lp => Object.keys(p).every(k => String(lp[k] || '') === String(p[k])));
    });
  } catch (e) { return emptyArr || []; }
}

function pageResponse(res, paged, items) {
  res.json({
    success: true,
    count: paged.total,
    page: paged.page,
    limit: paged.limit,
    totalPages: paged.totalPages,
    data: items
  });
}

/* ---------- Dashboard ---------- */
router.get('/stats', (req, res) => {
  const courses = store.all('courses');
  const orders = store.all('orders');
  const users = store.all('users');
  const paid = ['confirmed', 'completed'];
  const sum = list => list.reduce((s, o) => s + Number(o.total || 0), 0);

  const byBatch = store.all('batches').map(b => ({
    batch: b.name,
    color: b.color,
    courses: courses.filter(c => String(c.batchId) === String(b.id)).length
  }));

  const byStatus = ['pending', 'confirmed', 'completed', 'cancelled'].map(status => ({
    status,
    count: orders.filter(o => o.status === status).length
  }));

  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    const dayOrders = orders.filter(o => String(o.createdAt || '').slice(0, 10) === key);
    last7Days.push({ date: key, orders: dayOrders.length, revenue: sum(dayOrders) });
  }

  const todayVisitors = tracker.getTodayStats();
  const visitorHistory = tracker.getHistory(7);

  res.json({
    success: true,
    data: {
      totals: {
        courses: courses.length,
        activeCourses: courses.filter(c => c.status === 'active').length,
        batches: store.all('batches').length,
        categories: store.all('categories').length,
        platforms: store.all('platforms').length,
        groups: store.all('groups').length,
        subjects: store.all('subjects').length,
        coupons: store.all('coupons').length,
        users: users.length,
        orders: orders.length,
        pendingOrders: orders.filter(o => o.status === 'pending').length,
        revenue: sum(orders.filter(o => paid.includes(o.status))),
        pendingRevenue: sum(orders.filter(o => o.status === 'pending'))
      },
      todayVisitors,
      visitorHistory,
      byBatch,
      byStatus,
      last7Days,
      recentOrders: orders.slice(-6).reverse(),
      recentUsers: users.slice(-5).reverse().map(auth.publicUser)
    }
  });
});

router.get('/visitors/today', (req, res) => {
  res.json({ success: true, data: tracker.getTodayStats() });
});

/* ---------- Batch serial: keep `order` unique (swap on collision) ----------
 * Courses-er batch + E-Book batch — duitar jonnoi same niyom. */
function resolveBatchOrder(id, newOrder, coll) {
  const target = coll || 'batches';
  const n = Number(newOrder);
  if (!n || n <= 0) return;
  const clash = store.all(target)
    .find(b => String(b.id) !== String(id) && Number(b.order) === n);
  if (!clash) return;
  if (id) {
    // editing: swap serials with the clashing batch
    const me = store.find(target, id);
    const oldOrder = me ? Number(me.order) || 0 : 0;
    if (oldOrder && oldOrder !== n) {
      store.update(target, clash.id, { order: oldOrder });
      return;
    }
  }
  // new batch (or no old serial): shift clashing + higher serials down by one
  store.all(target)
    .filter(b => Number(b.order) >= n)
    .sort((a, b) => Number(b.order) - Number(a.order))
    .forEach(b => store.update(target, b.id, { order: Number(b.order) + 1 }));
}

/* ---------- Coupon targeting: [] / khali = sob course-e cholbe ----------
 * courseIds: nirdisto course | batchIds: puro batch | categoryIds: puro category
 * Tin-tar jekono ektay match korlei coupon cholbe (OR logic). */
function normalizeCouponCourses(v) {
  const out = [];
  const push = (x) => {
    const s = String(x == null ? '' : x).trim();
    if (!s || out.includes(s)) return;
    out.push(s);
  };
  if (Array.isArray(v)) v.forEach(push);
  else if (v !== undefined && v !== null && String(v).trim() !== '') String(v).split(/[\n,]+/).forEach(push);
  return out.slice(0, 100);
}
const normalizeCouponBatches = normalizeCouponCourses;
const normalizeCouponCategories = normalizeCouponCourses;
const normalizeCouponUsers = normalizeCouponCourses;
function normalizeCouponEmails(v) {
  const out = [];
  const push = (x) => {
    const s = String(x == null ? '' : x).trim().toLowerCase();
    if (!s || out.includes(s)) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return;
    out.push(s);
  };
  if (Array.isArray(v)) v.forEach(push);
  else if (v !== undefined && v !== null && String(v).trim() !== '') String(v).split(/[\n,;]+/).forEach(push);
  return out.slice(0, 200);
}
function normalizeCouponPhones(v) {
  const out = [];
  const push = (x) => {
    const s = String(x == null ? '' : x).replace(/[\s\-()]/g, '');
    if (!s || out.includes(s)) return;
    if (!/^\+?\d{6,15}$/.test(s)) return;
    out.push(s);
  };
  if (Array.isArray(v)) v.forEach(push);
  else if (v !== undefined && v !== null && String(v).trim() !== '') String(v).split(/[\n,;]+/).forEach(push);
  return out.slice(0, 200);
}

/* ---------- Generic CRUD: batches / categories / platforms / courses / coupons ----------
 * NOTE: 'lessons' FIELDS-e thakleo loop theke bad — lessons-er dedicated
 * YouTube/upload-aware routes niche ache (generic route shadow kore dito).
 * Protita entity-te oi section-er permission lage (Admin Manage > Permission).
 * Purono admin (permissions field nai) + superadmin = sob khanei access. */
const ENTITY_PERM = {
  batches: 'batches', ebookBatches: 'ebookBatches', categories: 'categories',
  platforms: 'platforms', groups: 'groups', subjects: 'subjects', courses: 'courses', lessons: 'courses',
  coupons: 'coupons', ebooks: 'ebooks'
};
Object.keys(FIELDS).filter(entity => entity !== 'lessons').forEach(entity => {
  const need = auth.requirePermission(ENTITY_PERM[entity] || 'settings');
  router.get('/' + entity, need, (req, res) => {
    let list = store.all(entity).slice();
    const { q, status } = req.query;
    if (status) list = list.filter(i => i.status === status);
    if (q) {
      const term = String(q).toLowerCase();
      list = list.filter(i => JSON.stringify(i).toLowerCase().includes(term));
    }
    list.reverse();
    const paged = store.paginate(list, req.query);
    res.json({
      success: true,
      count: paged.total, page: paged.page, limit: paged.limit, totalPages: paged.totalPages,
      data: paged.items
    });
  });

  router.get('/' + entity + '/:id', need, (req, res) => {
    const item = store.find(entity, req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: item });
  });

  router.post('/' + entity, need, (req, res) => {
    const data = pick(entity, req.body || {});
    if (entity === 'courses' && !data.title) {
      return res.status(400).json({ success: false, message: 'Course title is required' });
    }
    if (entity === 'coupons' && !data.code) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }
    if (entity === 'ebooks' && !data.title) {
      return res.status(400).json({ success: false, message: 'E-Book Name is required' });
    }
    if (entity !== 'courses' && entity !== 'coupons' && entity !== 'ebooks' && !data.name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    ensureUniqueSlug(entity, data, null);
    if (data.status === undefined) data.status = 'active';
    if (entity === 'batches' || entity === 'ebookBatches') {
      if (data.order === undefined || data.order === 0) {
        const maxOrder = Math.max(0, ...store.all(entity).map(b => Number(b.order) || 0));
        data.order = maxOrder + 1;
      } else {
        resolveBatchOrder(null, data.order, entity);
      }
      if (data.icon === undefined) data.icon = 'fa-layer-group';
      if (data.iconUrl === undefined) data.iconUrl = '';
      if (data.color === undefined) data.color = '#6366F1';
    }
    if (entity === 'courses') {
      if (data.featured === undefined) data.featured = false;
      if (data.pinned === undefined) data.pinned = false;
      if (data.pinnedLessons === undefined) data.pinnedLessons = false;
      ['price', 'oldPrice', 'totalClass'].forEach(k => { if (data[k] === undefined) data[k] = 0; });
      // Multi Telegram: normalize arrays, keep legacy telegramLink (first link) for backward compat
      data.telegramLinks = normalizeTelegramLinks(data.telegramLink, data.telegramLinks);
      data.telegramChatIds = normalizeTelegramChatIds(data.telegramChatIds);
      data.sectionTg = normalizeTgMap(data.sectionTg);
      data.chapterTg = normalizeTgMap(data.chapterTg);
      if (data.emptyStructure !== undefined) data.emptyStructure = normalizeEmptyStructure(data.emptyStructure) || [];
      if (data.stepLabels !== undefined) data.stepLabels = store.normalizeStepLabels(data.stepLabels) || {};
      if (!data.telegramLink && data.telegramLinks.length) data.telegramLink = data.telegramLinks[0].url;
    }
    if (entity === 'coupons') {
      if (data.usageLimit === undefined) data.usageLimit = 0;
      if (data.used === undefined) data.used = 0;
      if (data.type === undefined) data.type = 'percent';
      if (data.value === undefined) data.value = 0;
    }
    if (entity === 'coupons') {
      data.code = String(data.code).toUpperCase().trim();
      if (store.findBy('coupons', 'code', data.code)) {
        return res.status(409).json({ success: false, message: 'This coupon code already exists' });
      }
      data.courseIds = normalizeCouponCourses(data.courseIds);
      data.batchIds = normalizeCouponBatches(data.batchIds);
      data.categoryIds = normalizeCouponCategories(data.categoryIds);
      data.userIds = normalizeCouponUsers(data.userIds);
      data.allowedEmails = normalizeCouponEmails(data.allowedEmails);
      data.allowedPhones = normalizeCouponPhones(data.allowedPhones);
    }
    lightenImages(entity, data, null);
    const item = store.insert(entity, data);
    // Notun batch create hole Home > Courses Category-te auto show koro:
    // manual tick mode-e (batchIds non-empty) thakleo notun batch auto-tick hobe.
    if (entity === 'batches') {
      try {
        const db = store.load();
        const cat = db.homePage && db.homePage.sections && db.homePage.sections.categories;
        if (cat && Array.isArray(cat.batchIds) && cat.batchIds.length && !cat.batchIds.map(String).includes(String(item.id))) {
          cat.batchIds.push(String(item.id));
          store.save();
        }
      } catch (e) { /* home auto-tick fail korleo batch create success */ }
    }
    res.status(201).json({ success: true, message: 'Created successfully', data: item });
  });

  router.put('/' + entity + '/:id', need, (req, res) => {
    const data = pick(entity, req.body || {});
    // Slug khali kore save korle name theke regenerate + unique rakho
    if (data.slug !== undefined && !String(data.slug).trim()) {
      const prev = store.find(entity, req.params.id) || {};
      const tmp = { slug: '', name: data.name !== undefined ? data.name : prev.name, title: data.title !== undefined ? data.title : prev.title };
      ensureUniqueSlug(entity, tmp, req.params.id);
      data.slug = tmp.slug;
    } else if (data.slug) {
      ensureUniqueSlug(entity, data, req.params.id);
    }
    if (entity === 'courses') {
      if (data.telegramLinks !== undefined || data.telegramLink !== undefined) {
        const prev = store.find('courses', req.params.id) || {};
        data.telegramLinks = normalizeTelegramLinks(
          data.telegramLink !== undefined ? data.telegramLink : prev.telegramLink,
          data.telegramLinks !== undefined ? data.telegramLinks : prev.telegramLinks
        );
        if (!data.telegramLink && data.telegramLinks.length) data.telegramLink = data.telegramLinks[0].url;
      }
      if (data.telegramChatIds !== undefined) {
        data.telegramChatIds = normalizeTelegramChatIds(data.telegramChatIds);
      }
      if (data.sectionTg !== undefined) data.sectionTg = normalizeTgMap(data.sectionTg);
      if (data.chapterTg !== undefined) data.chapterTg = normalizeTgMap(data.chapterTg);
      if (data.emptyStructure !== undefined) data.emptyStructure = normalizeEmptyStructure(data.emptyStructure) || [];
      if (data.stepLabels !== undefined) data.stepLabels = store.normalizeStepLabels(data.stepLabels) || {};
    }
    if ((entity === 'batches' || entity === 'ebookBatches') && data.order !== undefined && Number(data.order) > 0) {
      resolveBatchOrder(req.params.id, data.order, entity);
    }
    if (entity === 'coupons' && data.code) {
      data.code = String(data.code).toUpperCase().trim();
      const existing = store.findBy('coupons', 'code', data.code);
      if (existing && String(existing.id) !== String(req.params.id)) {
        return res.status(409).json({ success: false, message: 'This coupon code already exists' });
      }
    }
    if (entity === 'coupons' && data.courseIds !== undefined) {
      data.courseIds = normalizeCouponCourses(data.courseIds);
    }
    if (entity === 'coupons' && data.batchIds !== undefined) {
      data.batchIds = normalizeCouponBatches(data.batchIds);
    }
    if (entity === 'coupons' && data.categoryIds !== undefined) {
      data.categoryIds = normalizeCouponCategories(data.categoryIds);
    }
    if (entity === 'coupons' && data.userIds !== undefined) {
      data.userIds = normalizeCouponUsers(data.userIds);
    }
    if (entity === 'coupons' && data.allowedEmails !== undefined) {
      data.allowedEmails = normalizeCouponEmails(data.allowedEmails);
    }
    if (entity === 'coupons' && data.allowedPhones !== undefined) {
      data.allowedPhones = normalizeCouponPhones(data.allowedPhones);
    }
    lightenImages(entity, data, store.find(entity, req.params.id));
    const item = store.update(entity, req.params.id, data);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Updated successfully', data: item });
  });

  router.delete('/' + entity + '/:id', need, (req, res) => {
    const removed = store.remove(entity, req.params.id);
    if (!removed) return res.status(404).json({ success: false, message: 'Not found' });
    // cascade: deleting a course removes its classes + uploaded class videos + sheets too
    if (entity === 'courses') {
      store.all('lessons')
        .filter(l => String(l.courseId) === String(removed.id))
        .forEach(l => { const r = store.remove('lessons', l.id); deleteLessonFile(r || l); deleteResourceFiles((r || l).resources, (r || l).id); });
    }
    // cascade: deleting an e-book removes its uploaded PDF file too
    if (entity === 'ebooks' && removed.fileUrl && removed.fileUrl.startsWith('/uploads/')) {
      try {
        const fs = require('fs');
        const path = require('path');
        const fp = path.join(__dirname, '..', '..', removed.fileUrl);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch (e) { /* ignore */ }
    }
    // cascade: cover/thumbnail/icon media file-o mushe felo (onno item use na korle)
    (IMAGE_FIELDS[entity] || []).forEach(key => {
      const u = removed[key];
      if (typeof u !== 'string' || !u.startsWith('/uploads/media/')) return;
      const stillUsed = store.all(entity).some(x => x[key] === u);
      if (stillUsed) return;
      try {
        const fs = require('fs');
        const path = require('path');
        const fp = path.join(__dirname, '..', '..', u);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch (e) { /* ignore */ }
    });
    res.json({ success: true, message: 'Deleted successfully', data: removed });
  });
});

/* ---------- Lessons (course classes) ----------
 * Dui vabe video deya jabe: YouTube link (videoId store hoy) BA direct
 * video file upload (videoUrl = /uploads/videos/...).
 * Duitar kono raw link public API-te jay na (see public.js watch endpoint). */
function extractYouTubeId(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  // raw 11-char id
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let m = s.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return '';
}

function isUploadedVideoUrl(u) {
  return typeof u === 'string' && u.startsWith('/uploads/videos/');
}

function isUploadedResourceUrl(u) {
  return typeof u === 'string' && u.startsWith('/uploads/resources/');
}

function isResourceUrl(u) {
  if (typeof u !== 'string') return false;
  const s = u.trim();
  if (!s) return false;
  if (isUploadedResourceUrl(s)) return true;
  return /^https?:\/\//i.test(s);
}

/* ---------- Class resources (Lecture Sheet / Practice Sheet) ----------
 * resources: [{ label, url, kind }]
 * label: "Lecture Sheet" / "Practice Sheet" / custom
 * url: uploaded /uploads/resources/*.pdf BA external https link (Drive/Telegram)
 * kind: lecture | practice | other (label theke auto, filter/icon-er jonno) */
function resourceKind(label) {
  const s = String(label || '').toLowerCase();
  if (/lecture|sheet.*lec|lec.*sheet|class.*note|note/.test(s)) return 'lecture';
  if (/practice|exercise|worksheet|hw|home/.test(s)) return 'practice';
  if (/solution|solve|answer/.test(s)) return 'solution';
  if (/exam|test|quiz|mcq/.test(s)) return 'exam';
  return 'other';
}

function normalizeResources(v) {
  if (v === undefined) return undefined; // field pathano hoyni = change koro na
  const out = [];
  const list = Array.isArray(v) ? v : (v ? [v] : []);
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const label = String(raw.label || '').trim().slice(0, 80);
    const url = String(raw.url || '').trim().slice(0, 2000);
    if (!label || !isResourceUrl(url)) continue; // vul/empty row bad
    out.push({ label, url, kind: resourceKind(label) });
    if (out.length >= 10) break; // per class max 10
  }
  return out;
}

// Lesson-er resource PDF file thakle disk theke mushe felo (external link-e hat dey na).
// Chapter/Section-level node resources-eo same file use hote pare — setao check hoy.
function isResourceFileUsed(url, ignoreLessonId) {
  if (!isUploadedResourceUrl(url)) return false;
  try {
    const usedByLesson = store.all('lessons').some(l =>
      String(l.id) !== String(ignoreLessonId == null ? '' : ignoreLessonId) &&
      Array.isArray(l.resources) && l.resources.some(x => x && x.url === url));
    if (usedByLesson) return true;
    return store.all('courses').some(c =>
      Array.isArray(c.nodeResources) && c.nodeResources.some(n =>
        Array.isArray(n.resources) && n.resources.some(x => x && x.url === url)));
  } catch (e) { return true; }
}
function deleteResourceFiles(resources, ignoreLessonId) {
  if (!Array.isArray(resources)) return;
  resources.forEach(r => {
    if (!r || !isUploadedResourceUrl(r.url)) return;
    try {
      if (isResourceFileUsed(r.url, ignoreLessonId)) return;
      const path = require('path');
      const fs = require('fs');
      const fp = path.join(__dirname, '..', '..', r.url);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch (e) { /* ignore */ }
  });
}

// Lesson-er uploaded mp4 file thakle disk theke mushe felo (YouTube link-e hat dey na).
// Onno kono class same file use korle musbe na (duplicate course-er jonno safe).
function deleteLessonFile(lesson, ignoreId) {
  if (!lesson || !isUploadedVideoUrl(lesson.videoUrl)) return;
  try {
    const stillUsed = store.all('lessons').some(l =>
      String(l.id) !== String(ignoreId == null ? (lesson.id || '') : ignoreId) &&
      l.videoUrl === lesson.videoUrl);
    if (stillUsed) return;
    const path = require('path');
    const fs = require('fs');
    const fp = path.join(__dirname, '..', '..', lesson.videoUrl);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (e) { /* ignore */ }
}

function nextLessonOrder(courseId) {
  const list = store.all('lessons').filter(l => String(l.courseId) === String(courseId));
  return list.length ? Math.max(...list.map(l => Number(l.order) || 0)) + 1 : 1;
}

// List lessons of a course (admin sees videoId; public never does)
router.get('/courses/:courseId/lessons', auth.requirePermission('courses'), (req, res) => {
  const course = store.find('courses', req.params.courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const list = store.all('lessons')
    .filter(l => String(l.courseId) === String(course.id))
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  res.json({ success: true, count: list.length, data: list });
});

// Add a lesson to a course (YouTube link BA uploaded video file)
router.post('/courses/:courseId/lessons', auth.requirePermission('courses'), (req, res) => {
  const course = store.find('courses', req.params.courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const { subject, subjectId, subsection, section, chapter, topic, subtopic, title, youtubeUrl, videoId, videoUrl, videoName, videoSize, videoType, duration, isFree, order, status, resources, telegramLinks, telegramChatIds, steps } = req.body || {};
  if (!title || !String(title).trim()) {
    return res.status(400).json({ success: false, message: 'Lesson title is required' });
  }
  const vid = extractYouTubeId(videoId || youtubeUrl);
  const uploaded = isUploadedVideoUrl(videoUrl) ? String(videoUrl) : '';
  if (!vid && !uploaded) {
    return res.status(400).json({ success: false, message: 'YouTube link BA uploaded video file din' });
  }
  const secVal = section !== undefined ? section : (chapter !== undefined ? chapter : '');
  const subjVal = subject !== undefined ? String(subject).trim() : '';
  const subjIdVal = subjectId !== undefined ? (Number(subjectId) || 0) : 0;
  const subSecVal = subsection !== undefined ? String(subsection).trim() : '';
  const stepsObj = store.normalizeLessonSteps(steps || {
    section: subjVal,
    subsection: subSecVal,
    chapter: secVal ? String(secVal) : '',
    topic: topic !== undefined ? String(topic).trim().slice(0, 120) : '',
    subtopic: subtopic !== undefined ? String(subtopic).trim().slice(0, 120) : ''
  });
  const legacy = store.legacyFieldsFromSteps(stepsObj);
  const lesson = store.insert('lessons', {
    courseId: course.id,
    subject: legacy.subject,
    subjectId: subjIdVal,
    subsection: legacy.subsection,
    section: legacy.section,
    chapter: legacy.chapter,
    topic: legacy.topic,
    subtopic: legacy.subtopic,
    steps: stepsObj,
    title: String(title).trim(),
    videoId: vid || '',
    videoUrl: uploaded,
    videoName: videoName ? String(videoName).slice(0, 150) : '',
    videoSize: Number(videoSize) || 0,
    videoType: uploaded ? 'upload' : 'youtube',
    duration: duration ? String(duration) : '',
    isFree: (isFree === true || isFree === 'true' || isFree === 1),
    order: order === undefined ? nextLessonOrder(course.id) : (Number(order) || 0),
    status: status || 'active',
    resources: normalizeResources(resources) || [],
    telegramLinks: normalizeTelegramLinks(undefined, telegramLinks),
    telegramChatIds: normalizeTelegramChatIds(telegramChatIds)
  });
  // class add hole matching empty nodes auto real (prune)
  try {
    if (Array.isArray(course.emptyStructure) && course.emptyStructure.length) {
      const pruned = pruneEmptyStructure(course.id, course.emptyStructure);
      if (pruned.length !== course.emptyStructure.length) store.update('courses', course.id, { emptyStructure: pruned });
    }
  } catch (e) {}
  res.status(201).json({ success: true, message: 'Class added', data: lesson });
});

// Update a lesson
router.put('/lessons/:id', auth.requirePermission('courses'), (req, res) => {
  const lesson = store.find('lessons', req.params.id);
  if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
  const data = pick('lessons', req.body || {});
  delete data.resources; // resources alada normalize hoy (niche)
  // class-level multi telegram (course-er moto normalize)
  if (req.body && req.body.telegramLinks !== undefined) data.telegramLinks = normalizeTelegramLinks(undefined, req.body.telegramLinks);
  if (req.body && req.body.telegramChatIds !== undefined) data.telegramChatIds = normalizeTelegramChatIds(req.body.telegramChatIds);
  // steps object: legacy fields + steps object dual-write
  if (req.body && (req.body.steps !== undefined || req.body.subject !== undefined || req.body.subsection !== undefined || req.body.section !== undefined || req.body.chapter !== undefined || req.body.topic !== undefined || req.body.subtopic !== undefined)) {
    const currentSteps = lesson.steps && typeof lesson.steps === 'object' && !Array.isArray(lesson.steps) ? lesson.steps : {};
    const incomingSteps = req.body.steps && typeof req.body.steps === 'object' && !Array.isArray(req.body.steps) ? req.body.steps : {};
    // fallback from legacy fields
    if (req.body.subject !== undefined) incomingSteps.section = String(req.body.subject).trim();
    if (req.body.subsection !== undefined) incomingSteps.subsection = String(req.body.subsection).trim();
    if (req.body.section !== undefined || req.body.chapter !== undefined) {
      const chVal = req.body.section !== undefined ? req.body.section : req.body.chapter;
      incomingSteps.chapter = String(chVal || '').trim();
    }
    if (req.body.topic !== undefined) incomingSteps.topic = String(req.body.topic).trim().slice(0, 120);
    if (req.body.subtopic !== undefined) incomingSteps.subtopic = String(req.body.subtopic).trim().slice(0, 120);
    const mergedSteps = store.normalizeLessonSteps({ ...currentSteps, ...incomingSteps });
    data.steps = mergedSteps;
    // dual-write legacy fields
    const legacy = store.legacyFieldsFromSteps(mergedSteps);
    data.subject = legacy.subject;
    data.subsection = legacy.subsection;
    data.section = legacy.section;
    data.chapter = legacy.chapter;
    data.topic = legacy.topic;
    data.subtopic = legacy.subtopic;
  }
  if (req.body && req.body.resources !== undefined) {
    const norm = normalizeResources(req.body.resources);
    if (norm !== undefined) {
      // replace hole purono uploaded PDF mushe felo (onno class use na korle)
      const oldUrls = Array.isArray(lesson.resources) ? lesson.resources.map(r => r && r.url) : [];
      const newUrls = norm.map(r => r.url);
      (lesson.resources || []).filter(r => r && isUploadedResourceUrl(r.url) && !newUrls.includes(r.url))
        .forEach(r => deleteResourceFiles([r], lesson.id));
      data.resources = norm;
    }
  }
  if (req.body && (req.body.youtubeUrl !== undefined || req.body.videoId !== undefined)) {
    const vid = extractYouTubeId(req.body.videoId !== undefined ? req.body.videoId : req.body.youtubeUrl);
    // khali string mane YouTube clear kora (uploaded video thakle cholbe)
    if (vid) {
      data.videoId = vid; data.videoType = 'youtube'; data.videoUrl = '';
      // upload theke YouTube-e switch: purono mp4 mushe felo (onno class use na korle)
      if (lesson.videoUrl) deleteLessonFile(lesson, lesson.id);
    }
    else if (req.body.videoUrl === undefined && !isUploadedVideoUrl(lesson.videoUrl)) {
      return res.status(400).json({ success: false, message: 'Valid YouTube link is required' });
    } else if (vid === '' && (req.body.videoUrl !== undefined || req.body.videoId !== undefined)) {
      data.videoId = '';
    }
  }
  if (data.videoUrl !== undefined) {
    if (data.videoUrl && !isUploadedVideoUrl(data.videoUrl)) {
      return res.status(400).json({ success: false, message: 'Video age upload korun' });
    }
    // replace hole purono mp4 mushe felo (onno class use na korle)
    if (data.videoUrl && lesson.videoUrl && data.videoUrl !== lesson.videoUrl) deleteLessonFile(lesson, lesson.id);
    if (data.videoUrl) { data.videoType = 'upload'; data.videoId = ''; }
    else if (!extractYouTubeId(req.body.youtubeUrl || req.body.videoId || '') && !lesson.videoId) {
      return res.status(400).json({ success: false, message: 'YouTube link BA uploaded video file din' });
    }
  }
  if (data.videoName !== undefined) data.videoName = String(data.videoName).slice(0, 150);
  if (data.videoSize !== undefined) data.videoSize = Number(data.videoSize) || 0;
  if (data.isFree !== undefined) data.isFree = (data.isFree === true || data.isFree === 'true' || data.isFree === 1);
  if (data.order !== undefined) data.order = Number(data.order) || 0;
  if (data.courseId !== undefined) data.courseId = Number(data.courseId) || data.courseId;
  const updated = store.update('lessons', req.params.id, data);
  res.json({ success: true, message: 'Class updated', data: updated });
});

// Delete a lesson
router.delete('/lessons/:id', auth.requirePermission('courses'), (req, res) => {
  const removed = store.remove('lessons', req.params.id);
  if (!removed) return res.status(404).json({ success: false, message: 'Not found' });
  deleteLessonFile(removed);
  deleteResourceFiles(removed.resources, removed.id);
  res.json({ success: true, message: 'Class deleted', data: removed });
});

// Merge ONE-OR-MORE Section/Chapter telegram entries (Class Update modal theke).
// Body: { sectionTg: { "<Section>": { links, ids } }, chapterTg: { "<Sec||Chap>": { links, ids } } }
// Khali links+ids pathale oi key delete hoy (remove support).
router.put('/courses/:courseId/tg-maps', auth.requirePermission('courses'), (req, res) => {
  const course = store.find('courses', req.params.courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const patch = {};
  ['sectionTg', 'chapterTg'].forEach(field => {
    const incoming = req.body && req.body[field];
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return;
    const prev = (course[field] && typeof course[field] === 'object' && !Array.isArray(course[field])) ? course[field] : {};
    const merged = Object.assign({}, prev);
    Object.keys(incoming).slice(0, 100).forEach(k => {
      const key = String(k || '').trim().slice(0, 120);
      if (!key) return;
      const v = incoming[k] || {};
      const links = normalizeTelegramLinks(undefined, v.links !== undefined ? v.links : v.telegramLinks);
      const ids = normalizeTelegramChatIds(v.ids !== undefined ? v.ids : (v.telegramChatIds !== undefined ? v.telegramChatIds : v.chatIds));
      if (links.length || ids.length) merged[key] = { links, ids };
      else delete merged[key];
    });
    patch[field] = merged;
  });
  const updated = store.update('courses', course.id, patch);
  res.json({ success: true, message: 'Telegram maps updated', data: updated });
});

// Empty structure nodes (class charai save — refresh-e jabe na)
// POST body: legacy { s, ss, c, t, st } ba generic { path: { stepId: value } } — parent charao save hobe
// (Section charai Chapter/Topic add kora jabe — display neutral thakbe, General banabe na)
// DELETE body: same — oi node + tar child empty nodes delete hobe (prefix match)
router.post('/courses/:courseId/structure-nodes', auth.requirePermission('courses'), (req, res) => {
  const course = store.find('courses', req.params.courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const incoming = nodeToPath(req.body || {});
  // Direct add: Section charai Chapter/Topic add kora jabe — sudhu ekta level thaklei hobe
  if (!incoming || !Object.keys(incoming.path).length) return res.status(400).json({ success: false, message: 'At least one name is required (e.g. Chapter)' });
  const cur = normalizeEmptyStructure(course.emptyStructure) || [];
  const key = JSON.stringify(incoming.path);
  if (!cur.some(n => JSON.stringify(n.path) === key)) {
    cur.push(incoming);
    if (cur.length > 200) return res.status(400).json({ success: false, message: 'Too many empty nodes (max 200)' });
  }
  const pruned = pruneEmptyStructure(course.id, cur);
  const updated = store.update('courses', course.id, { emptyStructure: pruned });
  res.status(201).json({ success: true, message: 'Saved', data: updated });
});
router.delete('/courses/:courseId/structure-nodes', auth.requirePermission('courses'), (req, res) => {
  const course = store.find('courses', req.params.courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const target = nodeToPath(req.body || {});
  if (!target || !Object.keys(target.path).length) return res.status(400).json({ success: false, message: 'Valid node path is required' });
  const prefix = target.path; // je level gulo fill kora hoy, oi prefix-e match + tar niche empty children o delete
  let cur = normalizeEmptyStructure(course.emptyStructure) || [];
  const before = cur.length;
  cur = cur.filter(n => !Object.keys(prefix).every(k => String(n.path[k] || '') === String(prefix[k])));
  // real class ache emon node delete korte dibo na (safe) — sudhu empty jabe
  const kept = pruneEmptyStructure(course.id, cur);
  const gone = before - kept.length;
  const updated = store.update('courses', course.id, { emptyStructure: kept });
  res.json({ success: true, message: gone === 0 ? 'Nothing to delete' : 'Deleted', data: updated });
});

/* ---------- Chapter / Section-level resources (node resources) ----------
 * Class-er under-e charao ekhon Section / Sub-Section / Chapter / Topic level-e
 * PDF-resource (Lecture Sheet / Practice Sheet / Drive link) attach kora jabe.
 * Storage: course.nodeResources = [{ path: {section, subsection?, chapter?, ...}, resources: [{label,url,kind}] }]
 * emptyStructure-er moto prune hoy na — class add holeo node sheet thakbe.
 * Upload: ager /api/admin/resources/upload endpoint-e reuse koro. */
function normalizeNodeResources(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const p = nodeToPath(raw);
    if (!p || !Object.keys(p.path).length) continue;
    const key = JSON.stringify(p.path);
    if (seen.has(key)) continue;
    seen.add(key);
    const res = normalizeResources(raw.resources) || [];
    out.push({ path: p.path, resources: res });
    if (out.length >= 200) break;
  }
  return out;
}

// List node resources of a course
router.get('/courses/:courseId/node-resources', auth.requirePermission('courses'), (req, res) => {
  const course = store.find('courses', req.params.courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  res.json({ success: true, data: normalizeNodeResources(course.nodeResources) });
});

// Upsert node resources — body { path:{...} ba legacy {s,ss,c,t,st}, resources:[{label,url}] }
// resources khali pathale oi node-er entry delete hobe
router.put('/courses/:courseId/node-resources', auth.requirePermission('courses'), (req, res) => {
  const course = store.find('courses', req.params.courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const body = req.body || {};
  const np = nodeToPath(body);
  if (!np || !Object.keys(np.path).length) return res.status(400).json({ success: false, message: 'Valid node path is required' });
  const norm = normalizeResources(body.resources);
  if (norm === undefined) return res.status(400).json({ success: false, message: 'resources array is required' });
  const key = JSON.stringify(np.path);
  let cur = normalizeNodeResources(course.nodeResources);
  const prev = cur.find(n => JSON.stringify(n.path) === key);
  if (!norm.length) {
    // khali = delete node
    cur = cur.filter(n => JSON.stringify(n.path) !== key);
    if (prev && prev.resources) deleteResourceFiles(prev.resources, null);
  } else {
    const removed = prev ? prev.resources.filter(r => r && !norm.some(x => x && x.url === r.url)) : [];
    if (cur.some(n => JSON.stringify(n.path) === key)) {
      cur = cur.map(n => JSON.stringify(n.path) === key ? { path: np.path, resources: norm } : n);
    } else {
      if (cur.length >= 200) return res.status(400).json({ success: false, message: 'Too many resource nodes (max 200)' });
      cur.push({ path: np.path, resources: norm });
    }
    if (removed.length) deleteResourceFiles(removed, null);
  }
  const updated = store.update('courses', course.id, { nodeResources: cur });
  res.json({ success: true, message: norm.length ? 'Saved' : 'Deleted', data: normalizeNodeResources(updated.nodeResources) });
});

// Delete one node (+ tar uploaded file cleanup)
router.delete('/courses/:courseId/node-resources', auth.requirePermission('courses'), (req, res) => {
  const course = store.find('courses', req.params.courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const np = nodeToPath(req.body || {});
  if (!np || !Object.keys(np.path).length) return res.status(400).json({ success: false, message: 'Valid node path is required' });
  const key = JSON.stringify(np.path);
  const cur = normalizeNodeResources(course.nodeResources);
  const gone = cur.find(n => JSON.stringify(n.path) === key);
  const kept = cur.filter(n => JSON.stringify(n.path) !== key);
  if (!gone) return res.json({ success: true, message: 'Nothing to delete', data: kept });
  if (gone.resources) deleteResourceFiles(gone.resources, null);
  const updated = store.update('courses', course.id, { nodeResources: kept });
  res.json({ success: true, message: 'Deleted', data: normalizeNodeResources(updated.nodeResources) });
});

/* ---------- Step VALUE rename / delete (Steps modal > items) ----------
 * Step GROUP-er naam bodlano (steps API) charao ekhon prottek step-er
 * ভেতরের item (Section / Chapter value — jemon "Zoology") rename + delete.
 * Rename: oi value use kora sob class + empty nodes + node sheets + telegram
 * map keys ekbare bodle jay. Delete: sudhu khali value (class nai) musbe —
 * class thakle 400 soho count janabe. */
function cuStepValOf(lesson, stepId) {
  // frontend cuLessonStepVal-er mirror (section->General, chapter->Chapter 1 default soho)
  try {
    const steps = (lesson.steps && typeof lesson.steps === 'object' && !Array.isArray(lesson.steps)) ? lesson.steps : {};
    if (stepId === 'section') return (lesson.subject && String(lesson.subject).trim()) ? String(lesson.subject).trim() : (steps.section || 'General');
    if (stepId === 'subsection') return (lesson.subsection && String(lesson.subsection).trim()) ? String(lesson.subsection).trim() : (steps.subsection || '');
    if (stepId === 'chapter') return String(lesson.section || lesson.chapter || steps.chapter || '').trim() || 'Chapter 1';
    return steps[stepId] || '';
  } catch (e) { return ''; }
}
function cuStepUpdateFor(lesson, stepId, v) {
  const steps = Object.assign({}, (lesson.steps && typeof lesson.steps === 'object' && !Array.isArray(lesson.steps)) ? lesson.steps : {});
  const u = {};
  if (stepId === 'section') { u.subject = v; steps.section = v; u.steps = steps; }
  else if (stepId === 'subsection') { u.subsection = v; steps.subsection = v; u.steps = steps; }
  else if (stepId === 'chapter') { u.section = v; u.chapter = v; steps.chapter = v; u.steps = steps; }
  else if (stepId === 'topic') { u.topic = v; steps.topic = v; u.steps = steps; }
  else if (stepId === 'subtopic') { u.subtopic = v; steps.subtopic = v; u.steps = steps; }
  else { steps[stepId] = v; u.steps = steps; }
  return u;
}
// prefix match: node path-er sob key lesson-er full path-er sathe mile kina
function cuPathPrefixMatch(fullPath, prefix) {
  return Object.keys(prefix || {}).every(k => String(fullPath[k] || '') === String(prefix[k]));
}
function cuLessonFullPath(l) {
  const steps = (l.steps && typeof l.steps === 'object' && !Array.isArray(l.steps)) ? l.steps : {};
  const out = {
    section: cuStepValOf(l, 'section'),
    subsection: cuStepValOf(l, 'subsection'),
    chapter: cuStepValOf(l, 'chapter'),
    topic: cuStepValOf(l, 'topic'),
    subtopic: cuStepValOf(l, 'subtopic')
  };
  Object.keys(steps).forEach(k => { if (out[k] === undefined && steps[k]) out[k] = steps[k]; });
  return out;
}

// Rename one step VALUE everywhere (scoped by parent path)
router.put('/courses/:courseId/step-values/rename', auth.requirePermission('courses'), (req, res) => {
  const course = store.find('courses', req.params.courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const b = req.body || {};
  const sid = String(b.stepId || '').trim().slice(0, 20);
  const from = String(b.from !== undefined ? b.from : '').trim().slice(0, 120);
  const to = String(b.to !== undefined ? b.to : '').trim().slice(0, 120);
  if (!sid) return res.status(400).json({ success: false, message: 'stepId is required' });
  if (!from) return res.status(400).json({ success: false, message: 'Current value is required' });
  if (!to) return res.status(400).json({ success: false, message: 'New name is required' });
  if (from === to) return res.status(400).json({ success: false, message: 'Same name — kichu bodlalo na' });
  const par = {};
  if (b.parents && typeof b.parents === 'object' && !Array.isArray(b.parents)) {
    Object.keys(b.parents).forEach(k => {
      const v = String(b.parents[k] !== undefined && b.parents[k] !== null ? b.parents[k] : '');
      if (v) par[String(k).trim().slice(0, 20)] = v.slice(0, 120);
    });
  }
  let lessonCount = 0;
  store.all('lessons')
    .filter(l => String(l.courseId) === String(course.id))
    .forEach(l => {
      const fp = cuLessonFullPath(l);
      if (!cuPathPrefixMatch(fp, par)) return;
      if (String(fp[sid] || '') !== from) return;
      store.update('lessons', l.id, cuStepUpdateFor(l, sid, to));
      lessonCount++;
    });
  // emptyStructure paths
  let nodeCount = 0;
  const empties = normalizeEmptyStructure(course.emptyStructure) || [];
  empties.forEach(n => {
    if (!cuPathPrefixMatch(Object.assign({ section: '', subsection: '', chapter: '', topic: '', subtopic: '' }, n.path), par)) return;
    if (String(n.path[sid] || '') !== from) return;
    n.path[sid] = to;
    nodeCount++;
  });
  // nodeResources paths (sheet sohoi move hobe)
  let resCount = 0;
  const nrs = normalizeNodeResources(course.nodeResources);
  nrs.forEach(n => {
    if (!cuPathPrefixMatch(Object.assign({ section: '', subsection: '', chapter: '', topic: '', subtopic: '' }, n.path), par)) return;
    if (String(n.path[sid] || '') !== from) return;
    n.path[sid] = to;
    resCount++;
  });
  // telegram maps (section / chapter key rename)
  let mapCount = 0;
  const secTg = (course.sectionTg && typeof course.sectionTg === 'object') ? Object.assign({}, course.sectionTg) : {};
  const chapTg = (course.chapterTg && typeof course.chapterTg === 'object') ? Object.assign({}, course.chapterTg) : {};
  const mergeTgEntry = (dst, a, b2) => {
    if (!dst[b2]) { dst[b2] = a; return; }
    const links = Array.isArray(dst[b2].links) ? dst[b2].links : [];
    const ids = Array.isArray(dst[b2].ids) ? dst[b2].ids : [];
    (Array.isArray(a.links) ? a.links : []).forEach(x => { if (x && x.url && !links.some(y => y && String(y.url).toLowerCase() === String(x.url).toLowerCase())) links.push(x); });
    (Array.isArray(a.ids) ? a.ids : []).forEach(x => { const id = String((x && (x.chatId || x.id)) || ''); if (id && !ids.some(y => String((y && (y.chatId || y.id)) || '') === id)) ids.push(x); });
    dst[b2] = { links, ids };
  };
  if (sid === 'section' && secTg[from] !== undefined) {
    mergeTgEntry(secTg, secTg[from], to);
    if (from !== to) delete secTg[from];
    mapCount++;
  }
  if (sid === 'section' || sid === 'chapter') {
    Object.keys(chapTg).forEach(k => {
      const sep = k.indexOf('||');
      const ks = sep >= 0 ? k.slice(0, sep) : k;
      const kc = sep >= 0 ? k.slice(sep + 2) : '';
      const matchSec = sid === 'section' ? (ks === from) : (par.section ? ks === String(par.section) : true);
      const matchChap = sid === 'chapter' ? (kc === from) : true;
      if (!(matchSec && matchChap)) return;
      const nk = (sid === 'section' ? to : ks) + '||' + (sid === 'chapter' ? to : kc);
      if (nk === k) return;
      mergeTgEntry(chapTg, chapTg[k], nk);
      delete chapTg[k];
      mapCount++;
    });
  }
  store.update('courses', course.id, { emptyStructure: empties, nodeResources: nrs, sectionTg: secTg, chapterTg: chapTg });
  if (!lessonCount && !nodeCount && !resCount && !mapCount) {
    return res.status(404).json({ success: false, message: 'Value not found: "' + from + '"' });
  }
  res.json({ success: true, message: 'Renamed ("' + from + '" → "' + to + '")', data: { lessons: lessonCount, emptyNodes: nodeCount, resourceNodes: resCount, tgMaps: mapCount } });
});

// Delete one step VALUE node (+ children) — sudhu class na thakle.
// body { path: {section, subsection?, chapter?, ...} } — full node path.
router.delete('/courses/:courseId/step-values', auth.requirePermission('courses'), (req, res) => {
  const course = store.find('courses', req.params.courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const np = nodeToPath((req.body || {}).path !== undefined ? req.body.path : req.body);
  if (!np || !Object.keys(np.path).length) return res.status(400).json({ success: false, message: 'Valid node path is required' });
  const prefix = np.path;
  const lessonsUnder = store.all('lessons').filter(l =>
    String(l.courseId) === String(course.id) && cuPathPrefixMatch(cuLessonFullPath(l), prefix));
  if (lessonsUnder.length) {
    return res.status(400).json({ success: false, message: 'Delete kora jabe na — ei value-te ' + lessonsUnder.length + ' ta class ache. Age class delete/move koro.' });
  }
  // empty nodes + children
  let empties = normalizeEmptyStructure(course.emptyStructure) || [];
  const beforeE = empties.length;
  empties = empties.filter(n => !cuPathPrefixMatch(Object.assign({ section: '', subsection: '', chapter: '', topic: '', subtopic: '' }, n.path), prefix));
  // nodeResources + children (+ uploaded file cleanup)
  let nrs = normalizeNodeResources(course.nodeResources);
  const goneRes = nrs.filter(n => cuPathPrefixMatch(Object.assign({ section: '', subsection: '', chapter: '', topic: '', subtopic: '' }, n.path), prefix));
  nrs = nrs.filter(n => !cuPathPrefixMatch(Object.assign({ section: '', subsection: '', chapter: '', topic: '', subtopic: '' }, n.path), prefix));
  goneRes.forEach(n => { if (n.resources) deleteResourceFiles(n.resources, null); });
  // telegram maps under prefix
  const secTg = (course.sectionTg && typeof course.sectionTg === 'object') ? Object.assign({}, course.sectionTg) : {};
  const chapTg = (course.chapterTg && typeof course.chapterTg === 'object') ? Object.assign({}, course.chapterTg) : {};
  let mapsGone = 0;
  const pKeys = Object.keys(prefix);
  const isSecLevel = pKeys.length === 1 && prefix.section;
  const isChapLevel = prefix.chapter && !prefix.topic && !prefix.subtopic;
  if (isSecLevel) {
    if (secTg[prefix.section] !== undefined) { delete secTg[prefix.section]; mapsGone++; }
    Object.keys(chapTg).forEach(k => {
      const ks = k.indexOf('||') >= 0 ? k.slice(0, k.indexOf('||')) : k;
      if (ks === prefix.section) { delete chapTg[k]; mapsGone++; }
    });
  } else if (isChapLevel) {
    // chapter key-te subsection thake na — section+chapter diye match
    Object.keys(chapTg).forEach(k => {
      const sep = k.indexOf('||');
      const ks = sep >= 0 ? k.slice(0, sep) : k;
      const kc = sep >= 0 ? k.slice(sep + 2) : '';
      if (ks === (prefix.section || '') && kc === (prefix.chapter || '')) { delete chapTg[k]; mapsGone++; }
    });
  }
  store.update('courses', course.id, { emptyStructure: empties, nodeResources: nrs, sectionTg: secTg, chapterTg: chapTg });
  const totalGone = (beforeE - empties.length) + goneRes.length + mapsGone;
  res.json({ success: true, message: totalGone ? 'Deleted' : 'Nothing to delete', data: { emptyNodes: beforeE - empties.length, resourceNodes: goneRes.length, tgMaps: mapsGone } });
});

// ===== Generic Steps API (unlimited levels, no max) =====
// GET /courses/:courseId/steps — return full ordered step definitions
router.get('/courses/:courseId/steps', auth.requirePermission('courses'), (req, res) => {
  const course = store.find('courses', req.params.courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  res.json({ success: true, data: store.resolveSteps(course) });
});

// PUT /courses/:courseId/steps — replace full step definitions (rename/reorder)
// body: { steps: [{id, name}] } — core ids (section,subsection,chapter) protected (cannot delete, only rename/reorder)
router.put('/courses/:courseId/steps', auth.requirePermission('courses'), (req, res) => {
  const course = store.find('courses', req.params.courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const b = req.body || {};
  const incoming = (b.steps && Array.isArray(b.steps)) ? b.steps : [];
  const norm = store.normalizeSteps(incoming);
  const updated = store.update('courses', course.id, { steps: norm });
  res.json({ success: true, message: 'Steps updated', data: updated, steps: store.resolveSteps(updated) });
});

// POST /courses/:courseId/steps — add a new step at end (or before specific core id)
// body: { name: "...", beforeId?: "chapter" }
router.post('/courses/:courseId/steps', auth.requirePermission('courses'), (req, res) => {
  const course = store.find('courses', req.params.courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 40);
  if (!name) return res.status(400).json({ success: false, message: 'Step name required' });
  const beforeId = b.beforeId ? String(b.beforeId).trim() : null;
  const cur = store.resolveSteps(course);
  // generate unique custom id
  let idx = 1;
  let customId = 'c' + idx;
  while (cur.some(s => s.id === customId)) { idx++; customId = 'c' + idx; }
  const newStep = { id: customId, name };
  let steps = cur.slice();
  if (beforeId) {
    const i = steps.findIndex(s => s.id === beforeId);
    if (i >= 0) steps.splice(i, 0, newStep);
    else steps.push(newStep);
  } else {
    steps.push(newStep);
  }
  const norm = store.normalizeSteps(steps);
  const updated = store.update('courses', course.id, { steps: norm });
  res.status(201).json({ success: true, message: 'Step added', data: updated, steps: store.resolveSteps(updated) });
});

// DELETE /courses/:courseId/steps/:stepId — remove a custom step (only non-core)
// body: { stepId: "c1" }
router.delete('/courses/:courseId/steps/:stepId', auth.requirePermission('courses'), (req, res) => {
  const course = store.find('courses', req.params.courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const stepId = req.params.stepId;
  if (store.CORE_STEP_IDS.indexOf(stepId) !== -1) {
    return res.status(400).json({ success: false, message: 'Core step cannot be deleted (rename instead)' });
  }
  const cur = store.resolveSteps(course).filter(s => s.id !== stepId);
  const norm = store.normalizeSteps(cur);
  const updated = store.update('courses', course.id, { steps: norm });
  res.json({ success: true, message: 'Step removed', data: updated, steps: store.resolveSteps(updated) });
});

// Bulk reorder: Subject -> Chapter -> Lecture serial maintain (up/down)
router.put('/courses/:courseId/reorder', auth.requirePermission('courses'), (req, res) => {
  const course = store.find('courses', req.params.courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const { order } = req.body || {};
  // order: array of lesson ids in desired final display order (flat)
  if (!Array.isArray(order) || !order.length) {
    return res.status(400).json({ success: false, message: 'order array (lesson ids) is required' });
  }
  let n = 1;
  const seen = new Set();
  for (const rawId of order) {
    const id = String(rawId);
    if (seen.has(id)) continue;
    seen.add(id);
    const lesson = store.find('lessons', id);
    if (!lesson || String(lesson.courseId) !== String(course.id)) continue;
    store.update('lessons', lesson.id, { order: n++ });
  }
  // any remaining lessons not in list keep at end
  store.all('lessons')
    .filter(l => String(l.courseId) === String(course.id) && !seen.has(String(l.id)))
    .sort((a,b)=> (Number(a.order)||0)-(Number(b.order)||0))
    .forEach(l => store.update('lessons', l.id, { order: n++ }));
  const list = store.all('lessons')
    .filter(l => String(l.courseId) === String(course.id))
    .sort((a,b)=> (Number(a.order)||0)-(Number(b.order)||0));
  res.json({ success: true, message: 'Order updated', data: list });
});

// Update subject/chapter names in bulk for a course (and optionally orders)
router.put('/courses/:courseId/structure', auth.requirePermission('courses'), (req, res) => {
  const course = store.find('courses', req.params.courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const { lessons } = req.body || {};
  if (!Array.isArray(lessons)) return res.status(400).json({ success: false, message: 'lessons array required' });
  for (const l of lessons) {
    if (!l || !l.id) continue;
    const cur = store.find('lessons', l.id);
    if (!cur || String(cur.courseId) !== String(course.id)) continue;
    const patch = {};
    if (l.subject !== undefined) patch.subject = String(l.subject).trim();
    if (l.subjectId !== undefined) patch.subjectId = Number(l.subjectId) || 0;
    if (l.subsection !== undefined) patch.subsection = String(l.subsection).trim();
    if (l.section !== undefined) patch.section = String(l.section).trim();
    if (l.chapter !== undefined) patch.chapter = String(l.chapter).trim();
    if (l.topic !== undefined) patch.topic = String(l.topic).trim().slice(0, 120);
    if (l.subtopic !== undefined) patch.subtopic = String(l.subtopic).trim().slice(0, 120);
    if (l.subTopic !== undefined) patch.subtopic = String(l.subTopic).trim().slice(0, 120);
    if (l.title !== undefined) patch.title = String(l.title).trim();
    if (l.order !== undefined) patch.order = Number(l.order) || 0;
    if (Object.keys(patch).length) store.update('lessons', cur.id, patch);
    // keep section/chapter in sync
    if (patch.section && !patch.chapter) store.update('lessons', cur.id, { chapter: patch.section });
    if (patch.chapter && !patch.section) store.update('lessons', cur.id, { section: patch.chapter });
  }
  const list = store.all('lessons')
    .filter(l => String(l.courseId) === String(course.id))
    .sort((a,b)=> (Number(a.order)||0)-(Number(b.order)||0));
  res.json({ success: true, data: list });
});

/* ---------- Class video file upload (raw bytes, no size limit) ----------
 * Dui vabe use hoy:
 * 1) POST /api/admin/videos/upload -> lesson charai temp upload (course add-er somoy),
 *    response videoUrl pore lesson create/update-e pathano hoy.
 * 2) POST /api/admin/lessons/:id/video -> existing class-er video replace. */
function checkVideoBytes(buf) {
  if (!buf || !buf.length) return 'No video file received';
  if (buf.length < 12) return 'File too small to be a video';
  // MP4/MOV: 'ftyp' at offset 4 | WebM/MKV: EBML header 0x1A45DFA3
  const ftyp = buf.slice(4, 8).toString() === 'ftyp';
  const ebml = buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3;
  if (!ftyp && !ebml) return 'Only MP4 / WebM video files are allowed';
  return '';
}

function headerFileName(req, maxLen) {
  let n = req.headers['x-file-name'] ? String(req.headers['x-file-name']) : '';
  try { n = decodeURIComponent(n); } catch (e) {}
  return n.slice(0, maxLen || 150);
}

function saveVideoBuffer(buf, origName) {
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');
  const dir = path.join(__dirname, '..', '..', 'uploads', 'videos');
  fs.mkdirSync(dir, { recursive: true });
  const ext = /webm/i.test(String(origName || '')) ? '.webm' : '.mp4';
  const filename = 'class-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex') + ext;
  fs.writeFileSync(path.join(dir, filename), buf);
  return { videoUrl: '/uploads/videos/' + filename, videoSize: buf.length };
}

router.post('/videos/upload', auth.requirePermission('courses'), (req, res) => {
  if (!req.body || !Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ success: false, message: 'No video file received' });
  }
  const bad = checkVideoBytes(req.body);
  if (bad) return res.status(400).json({ success: false, message: bad });
  try {
    const out = saveVideoBuffer(req.body, headerFileName(req));
    res.status(201).json({ success: true, message: 'Video uploaded', data: Object.assign(out, {
      videoName: headerFileName(req)
    })});
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not save video' });
  }
});

router.post('/lessons/:id/video', auth.requirePermission('courses'), (req, res) => {
  const lesson = store.find('lessons', req.params.id);
  if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
  if (!req.body || !Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ success: false, message: 'No video file received' });
  }
  const bad = checkVideoBytes(req.body);
  if (bad) return res.status(400).json({ success: false, message: bad });
  try {
    deleteLessonFile(lesson, lesson.id);
    const out = saveVideoBuffer(req.body, headerFileName(req));
    const updated = store.update('lessons', lesson.id, {
      videoUrl: out.videoUrl,
      videoSize: out.videoSize,
      videoName: headerFileName(req) || (lesson.videoName || ''),
      videoType: 'upload',
      videoId: ''
    });
    res.json({ success: true, message: 'Video uploaded', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not save video' });
  }
});

/* ---------- Class resource file upload (PDF / images, no size limit) ----------
 * Lecture Sheet / Practice Sheet — PDF upload kore class-er sathe attach.
 * POST /api/admin/resources/upload (Content-Type: application/pdf ba image/*)
 * response { fileUrl, fileSize, fileName } — pore lesson create/update-er
 * resources array-te { label, url: fileUrl } hisebe pathano hoy.
 * External link (Drive/Telegram) hole upload lagbe na, URL-e jothesto. */
function checkResourceBytes(buf, contentType) {
  if (!buf || !buf.length) return 'No file received';
  if (buf.length < 12) return 'File too small';
  const ct = String(contentType || '').toLowerCase();
  const head5 = buf.slice(0, 5).toString();
  const isPdf = head5 === '%PDF-';
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  const isJpg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  const isWebp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  const isGif = buf.slice(0, 3).toString() === 'GIF';
  if (isPdf || isPng || isJpg || isWebp || isGif) return '';
  if (/pdf/.test(ct) || /image\//.test(ct)) return ''; // parser mime onujayi allow
  return 'Only PDF / Image files are allowed for sheets';
}

router.post('/resources/upload', auth.requirePermission('courses'), (req, res) => {
  if (!req.body || !Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ success: false, message: 'No file received' });
  }
  const bad = checkResourceBytes(req.body, req.headers['content-type']);
  if (bad) return res.status(400).json({ success: false, message: bad });
  try {
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');
    const dir = path.join(__dirname, '..', '..', 'uploads', 'resources');
    fs.mkdirSync(dir, { recursive: true });
    const orig = headerFileName(req) || 'sheet.pdf';
    let ext = '.pdf';
    if (req.body.slice(0, 5).toString() === '%PDF-') ext = '.pdf';
    else if (req.body[0] === 0x89 && req.body[1] === 0x50) ext = '.png';
    else if (req.body[0] === 0xFF && req.body[1] === 0xD8) ext = '.jpg';
    else if (/\.png$/i.test(orig)) ext = '.png';
    else if (/\.jpe?g$/i.test(orig)) ext = '.jpg';
    else if (/\.webp$/i.test(orig)) ext = '.webp';
    const filename = 'sheet-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex') + ext;
    fs.writeFileSync(path.join(dir, filename), req.body);
    res.status(201).json({ success: true, message: 'Sheet uploaded', data: {
      fileUrl: '/uploads/resources/' + filename,
      fileSize: req.body.length,
      fileName: orig
    }});
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not save sheet' });
  }
});

/* ---------- Orphan resource cleanup (class save na kore modal bondho korle) ---------- */
router.delete('/resources', auth.requirePermission('courses'), (req, res) => {
  const { fileUrl } = req.body || {};
  if (!isUploadedResourceUrl(fileUrl)) return res.status(400).json({ success: false, message: 'Invalid file URL' });
  const usedByLesson = store.all('lessons').some(l => Array.isArray(l.resources) && l.resources.some(r => r && r.url === fileUrl));
  const usedByNode = store.all('courses').some(c => Array.isArray(c.nodeResources) && c.nodeResources.some(n => Array.isArray(n.resources) && n.resources.some(r => r && r.url === fileUrl)));
  if (usedByLesson || usedByNode) return res.json({ success: true, message: 'Sheet is used, kept' });
  try {
    const path = require('path');
    const fs = require('fs');
    const fp = path.join(__dirname, '..', '..', fileUrl);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (e) { /* ignore */ }
  res.json({ success: true, message: 'Sheet file removed' });
});

/* ---------- Duplicate course (Copy-Paste with classes) ----------
 * POST /api/admin/courses/:id/duplicate
 * Body (all optional): { title, batchId, categoryId, platformId, groupId, subjectId }
 * Akei course onno batch/category-te rakhte chaile alada kore class upload
 * korte hoy na — course + sob class copy hoye notun course hobe. */
router.post('/courses/:id/duplicate', auth.requirePermission('courses'), (req, res) => {
  const src = store.find('courses', req.params.id);
  if (!src) return res.status(404).json({ success: false, message: 'Course not found' });
  const b = req.body || {};
  const copy = {};
  Object.keys(src).forEach(k => {
    if (k === 'id' || k === 'createdAt' || k === 'updatedAt') return;
    const v = src[k];
    copy[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
  });
  copy.title = (b.title && String(b.title).trim()) || src.title;
  if (b.batchId !== undefined && String(b.batchId) !== '') copy.batchId = Number(b.batchId) || b.batchId;
  if (b.categoryId !== undefined && String(b.categoryId) !== '') copy.categoryId = Number(b.categoryId) || b.categoryId;
  if (b.platformId !== undefined && String(b.platformId) !== '') copy.platformId = b.platformId;
  if (b.groupId !== undefined && String(b.groupId) !== '') copy.groupId = Number(b.groupId) || b.groupId;
  if (b.subjectId !== undefined && String(b.subjectId) !== '') copy.subjectId = Number(b.subjectId) || b.subjectId;
  // slug unique rakho (nahole public URL clash korbe)
  let base = slugify(copy.title) || ('course-' + Date.now());
  let slug = base;
  let n = 2;
  while (store.all('courses').some(c => String(c.slug) === String(slug))) {
    slug = base + '-' + (n++);
  }
  copy.slug = slug;
  copy.pinned = false;
  copy.pinnedLessons = false;
  const created = store.insert('courses', copy);
  // sob class copy (YouTube videoId BA uploaded videoUrl, section, order soho)
  // note: uploaded mp4 file share hobe (notun copy hoy na), delete korle file musbe na jodi onno class use kore
  const lessons = store.all('lessons')
    .filter(l => String(l.courseId) === String(src.id))
    .sort((x, y) => (Number(x.order) || 0) - (Number(y.order) || 0));
  let copied = 0;
  lessons.forEach(l => {
    store.insert('lessons', {
      courseId: created.id,
      subject: l.subject || '',
      subjectId: Number(l.subjectId) || 0,
      subsection: l.subsection || '',
      section: l.section || l.chapter || '',
      chapter: l.chapter || l.section || '',
      topic: l.topic || '',
      subtopic: l.subtopic || '',
      steps: (l.steps && typeof l.steps === 'object' && !Array.isArray(l.steps)) ? store.normalizeLessonSteps(l.steps) : store.normalizeLessonSteps({
        section: l.subject || '',
        subsection: l.subsection || '',
        chapter: l.chapter || l.section || '',
        topic: l.topic || '',
        subtopic: l.subtopic || ''
      }),
      title: l.title || '',
      videoId: l.videoId || '',
      videoUrl: l.videoUrl || '',
      videoName: l.videoName || '',
      videoSize: Number(l.videoSize) || 0,
      videoType: l.videoType || (l.videoUrl ? 'upload' : 'youtube'),
      duration: l.duration || '',
      isFree: !!l.isFree,
      order: Number(l.order) || 0,
      status: l.status || 'active',
      resources: Array.isArray(l.resources)
        ? l.resources.filter(r => r && r.label && r.url).map(r => ({ label: String(r.label).slice(0, 80), url: String(r.url).slice(0, 2000), kind: r.kind || resourceKind(r.label) }))
        : []
    });
    copied++;
  });
  res.status(201).json({
    success: true,
    message: 'Course duplicated with ' + copied + ' class(es)',
    data: created,
    copiedLessons: copied
  });
});

/* ---------- E-book PDF file upload (raw bytes, no size limit) ---------- */
router.post('/ebooks/:id/file', auth.requirePermission('ebooks'), (req, res) => {
  const ebook = store.find('ebooks', req.params.id);
  if (!ebook) return res.status(404).json({ success: false, message: 'E-book not found' });
  if (!req.body || !Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ success: false, message: 'No PDF file received' });
  }
  // basic PDF magic-byte check
  if (req.body.slice(0, 5).toString() !== '%PDF-') {
    return res.status(400).json({ success: false, message: 'Only PDF files are allowed' });
  }
  try {
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');
    const dir = path.join(__dirname, '..', '..', 'uploads', 'ebooks');
    fs.mkdirSync(dir, { recursive: true });
    // unguessable name: file URL alone grants the download
    const filename = 'ebook-' + ebook.id + '-' + crypto.randomBytes(8).toString('hex') + '.pdf';
    // remove previous upload if any
    if (ebook.fileUrl && ebook.fileUrl.startsWith('/uploads/ebooks/')) {
      try {
        const old = path.join(__dirname, '..', '..', ebook.fileUrl);
        if (fs.existsSync(old)) fs.unlinkSync(old);
      } catch (e) { /* ignore */ }
    }
    fs.writeFileSync(path.join(dir, filename), req.body);
    const fileUrl = '/uploads/ebooks/' + filename;
    store.update('ebooks', ebook.id, {
      fileUrl, fileSize: req.body.length,
      fileName: req.headers['x-file-name'] ? String(req.headers['x-file-name']).slice(0, 120) : (ebook.fileName || '')
    });
    res.json({ success: true, message: 'PDF uploaded', data: { fileUrl, fileSize: req.body.length } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not save file' });
  }
});

/* ---------- Orphan video cleanup (course save na kore modal bondho korle) ---------- */
router.delete('/videos', auth.requirePermission('courses'), (req, res) => {
  const { videoUrl } = req.body || {};
  if (!isUploadedVideoUrl(videoUrl)) return res.status(400).json({ success: false, message: 'Invalid video URL' });
  const used = store.all('lessons').some(l => l.videoUrl === videoUrl);
  if (used) return res.json({ success: true, message: 'Video is used by a class, kept' });
  try {
    const path = require('path');
    const fs = require('fs');
    const fp = path.join(__dirname, '..', '..', videoUrl);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (e) { /* ignore */ }
  res.json({ success: true, message: 'Video file removed' });
});

/* ---------- Users management ---------- */
function getUserEnrolledCourses(userId) {
  const user = store.find('users', userId);
  if (!user) return [];
  const manual = Array.isArray(user.enrolledCourses) ? user.enrolledCourses.map(String) : [];
  const revoked = Array.isArray(user.revokedCourses) ? user.revokedCourses.map(String) : [];

  const orders = store.all('orders').filter(o => String(o.userId) === String(userId) && ['confirmed', 'completed'].includes(o.status));
  const orderCourseIds = [];
  orders.forEach(o => {
    (o.items || []).forEach(i => {
      const cid = String(i.courseId || '');
      if (cid && !orderCourseIds.includes(cid)) orderCourseIds.push(cid);
    });
  });

  const allIds = Array.from(new Set([...manual, ...orderCourseIds])).filter(id => !revoked.includes(id));
  const courses = store.all('courses');
  const batches = store.all('batches');
  const categories = store.all('categories');

  return allIds.map(id => {
    const c = courses.find(x => String(x.id) === String(id));
    if (!c) return null;
    const b = batches.find(x => String(x.id) === String(c.batchId));
    const cat = categories.find(x => String(x.id) === String(c.categoryId));
    return {
      id: c.id,
      title: c.title,
      slug: c.slug,
      thumbnail: c.thumbnail || '',
      price: c.price,
      batchId: c.batchId,
      batchName: b ? b.name : '',
      batchColor: b ? b.color : '',
      categoryName: cat ? cat.name : '',
      teacher: c.teacher || '',
      isManual: manual.includes(String(c.id)),
      isOrdered: orderCourseIds.includes(String(c.id))
    };
  }).filter(Boolean);
}

router.get('/users', auth.requirePermission('users'), (req, res) => {
  let list = store.all('users').slice();
  const { q, status } = req.query;
  if (status) list = list.filter(u => u.status === status);
  if (q) {
    const term = String(q).toLowerCase();
    list = list.filter(u => (u.name + ' ' + u.email + ' ' + (u.phone || '')).toLowerCase().includes(term));
  }
  list.reverse();
  const paged = store.paginate(list, req.query);
  const orders = store.all('orders');
  const items = paged.items.map(u => {
    const userOrders = orders.filter(o => String(o.userId) === String(u.id));
    const enrolled = getUserEnrolledCourses(u.id);
    return Object.assign(auth.publicUser(u), {
      orderCount: userOrders.length,
      enrolledCount: enrolled.length,
      totalSpent: userOrders.filter(o => ['confirmed', 'completed'].includes(o.status))
        .reduce((s, o) => s + Number(o.total || 0), 0)
    });
  });
  res.json({
    success: true,
    count: paged.total, page: paged.page, limit: paged.limit, totalPages: paged.totalPages,
    data: items
  });
});

router.get('/users/:id', auth.requirePermission('users'), (req, res) => {
  const user = store.find('users', req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const orders = store.all('orders').filter(o => String(o.userId) === String(user.id));
  const enrolledCourses = getUserEnrolledCourses(user.id);
  let wallet = null;
  try {
    const ref = require('../referral');
    const st = ref.walletStats(user.id);
    const txns = store.all('walletTxns').filter(t => String(t.userId) === String(user.id))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 20);
    const withdrawals = store.all('withdrawals').filter(w => String(w.userId) === String(user.id))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 20);
    wallet = {
      balance: ref.walletOf(user),
      referralCode: user.referralCode || '',
      customCommission: (user.customCommission === null || user.customCommission === undefined) ? '' : user.customCommission,
      customFriendOff: (user.customFriendOff === null || user.customFriendOff === undefined) ? '' : user.customFriendOff,
      effectiveCommission: (typeof ref.userCommissionPct === 'function') ? ref.userCommissionPct(user) : ref.refConfig().commissionPct,
      effectiveFriendOff: (typeof ref.userFriendOff === 'function') ? ref.userFriendOff(user) : ref.refConfig().friendOff,
      stats: st, txns, withdrawals
    };
  } catch (e) { wallet = null; }
  res.json({ success: true, data: Object.assign(auth.publicUser(user), { orders, enrolledCourses, wallet }) });
});

/* ---------- User wallet adjust (Admin > Users > Balance Add/Minus) ----------
 * POST /api/admin/users/:id/wallet { amount, note }
 * amount > 0 = Balance Add (bonus/commission), amount < 0 = Balance Minus.
 * History walletTxns-e type 'adjust' hisebe save hoy. */
router.post('/users/:id/wallet', auth.requirePermission('users'), (req, res) => {
  const user = store.find('users', req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const amount = Math.floor(Number((req.body || {}).amount) || 0);
  const note = String((req.body || {}).note || '').slice(0, 200);
  if (!amount) return res.status(400).json({ success: false, message: 'Amount dite hobe (positive = Add, negative = Minus)' });
  if (Math.abs(amount) > 1000000) return res.status(400).json({ success: false, message: 'Amount too large (max 10,00,000)' });
  const ref = require('../referral');
  if (amount < 0 && Math.abs(amount) > ref.walletOf(user)) {
    return res.status(400).json({ success: false, message: 'Balance kom ache — Minus ' + Math.abs(amount) + ' kora jabe na (ache ৳' + ref.walletOf(user) + ')' });
  }
  const next = ref.walletAdd(user.id, amount, 'adjust', note || ('Admin adjust ' + (amount > 0 ? '+' : '') + amount));
  const st = ref.walletStats(user.id);
  res.json({ success: true, message: (amount > 0 ? '৳' + amount + ' added' : '৳' + Math.abs(amount) + ' deducted') + ' — new balance ৳' + next, data: { balance: next, stats: st } });
});

// Grant course access to student
router.post('/users/:id/access', auth.requirePermission('users'), (req, res) => {
  const user = store.find('users', req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const { courseId } = req.body || {};
  if (!courseId) return res.status(400).json({ success: false, message: 'Course ID is required' });
  const course = store.find('courses', courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

  const cId = String(course.id);
  let manual = Array.isArray(user.enrolledCourses) ? user.enrolledCourses.map(String) : [];
  let revoked = Array.isArray(user.revokedCourses) ? user.revokedCourses.map(String) : [];

  revoked = revoked.filter(x => x !== cId);
  if (!manual.includes(cId)) manual.push(cId);

  store.update('users', user.id, { enrolledCourses: manual, revokedCourses: revoked });
  res.json({
    success: true,
    message: `Access to "${course.title}" granted successfully`,
    data: getUserEnrolledCourses(user.id)
  });
});

// Revoke course access from student
router.post('/users/:id/revoke', auth.requirePermission('users'), (req, res) => {
  const user = store.find('users', req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const { courseId } = req.body || {};
  if (!courseId) return res.status(400).json({ success: false, message: 'Course ID is required' });

  const cId = String(courseId);
  let manual = Array.isArray(user.enrolledCourses) ? user.enrolledCourses.map(String) : [];
  let revoked = Array.isArray(user.revokedCourses) ? user.revokedCourses.map(String) : [];

  manual = manual.filter(x => x !== cId);
  if (!revoked.includes(cId)) revoked.push(cId);

  store.update('users', user.id, { enrolledCourses: manual, revokedCourses: revoked });
  res.json({
    success: true,
    message: 'Course access removed successfully',
    data: getUserEnrolledCourses(user.id)
  });
});

router.delete('/users/:id/access/:courseId', auth.requirePermission('users'), (req, res) => {
  const user = store.find('users', req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const cId = String(req.params.courseId);

  let manual = Array.isArray(user.enrolledCourses) ? user.enrolledCourses.map(String) : [];
  let revoked = Array.isArray(user.revokedCourses) ? user.revokedCourses.map(String) : [];

  manual = manual.filter(x => x !== cId);
  if (!revoked.includes(cId)) revoked.push(cId);

  store.update('users', user.id, { enrolledCourses: manual, revokedCourses: revoked });
  res.json({
    success: true,
    message: 'Course access removed successfully',
    data: getUserEnrolledCourses(user.id)
  });
});

// Ban or unban user
router.post('/users/:id/ban', auth.requirePermission('users'), (req, res) => {
  const user = store.find('users', req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  let newStatus = 'banned';
  if (req.body && req.body.status) {
    newStatus = req.body.status;
  } else {
    newStatus = (user.status === 'banned' || user.status === 'blocked') ? 'active' : 'banned';
  }

  const updated = store.update('users', user.id, { status: newStatus });
  res.json({
    success: true,
    message: newStatus === 'banned' ? `User "${user.name}" has been banned` : `User "${user.name}" has been unbanned and activated`,
    data: auth.publicUser(updated)
  });
});

router.post('/users', auth.requirePermission('users'), (req, res) => {
  const { name, email, phone, password, status, role } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email and password are required' });
  }
  if (store.findBy('users', 'email', email)) {
    return res.status(409).json({ success: false, message: 'This email already exists' });
  }
  const user = store.insert('users', {
    name: String(name),
    email: String(email).toLowerCase(),
    phone: phone || '',
    password: auth.hashPassword(password),
    role: role || 'student',
    status: status || 'active'
  });
  res.status(201).json({ success: true, message: 'User created', data: auth.publicUser(user) });
});

router.put('/users/:id', auth.requirePermission('users'), (req, res) => {
  const b = req.body || {};
  const data = {};
  ['name', 'email', 'phone', 'status', 'role'].forEach(k => { if (b[k] !== undefined) data[k] = b[k]; });
  if (b.password) data.password = auth.hashPassword(b.password);
  // Referral customize (per-user): code edit + commission/friendOff override (empty = global default)
  if (b.referralCode !== undefined) {
    const c = String(b.referralCode || '').trim().toUpperCase();
    if (c) {
      if (!/^[A-Z0-9]{4,12}$/.test(c)) return res.status(400).json({ success: false, message: 'Referral code 4-12 char (A-Z, 0-9) hote hobe' });
      const taken = store.all('users').some(u => String(u.id) !== String(req.params.id) && String(u.referralCode || '').toUpperCase() === c);
      if (taken) return res.status(409).json({ success: false, message: 'Ei referral code onno user use kortese' });
      data.referralCode = c;
    } else {
      data.referralCode = '';
    }
  }
  ['customCommission', 'customFriendOff'].forEach(k => {
    if (b[k] !== undefined) {
      const raw = String(b[k]).trim();
      if (raw === '') { data[k] = ''; return; }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 90) return;
      data[k] = n;
    }
  });
  if (b.customCommission !== undefined && (String(b.customCommission).trim() !== '')) {
    const n = Number(b.customCommission);
    if (!Number.isFinite(n) || n < 0 || n > 90) return res.status(400).json({ success: false, message: 'Commission 0-90% er moddhe hote hobe' });
  }
  if (b.customFriendOff !== undefined && (String(b.customFriendOff).trim() !== '')) {
    const n = Number(b.customFriendOff);
    if (!Number.isFinite(n) || n < 0 || n > 90) return res.status(400).json({ success: false, message: 'Friend discount 0-90% er moddhe hote hobe' });
  }
  const user = store.update('users', req.params.id, data);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, message: 'User updated', data: auth.publicUser(user) });
});

router.delete('/users/:id', auth.requirePermission('users'), (req, res) => {
  const removed = store.remove('users', req.params.id);
  if (!removed) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, message: 'User deleted', data: auth.publicUser(removed) });
});

/* ---------- Orders management ---------- */
router.get('/orders', auth.requirePermission('orders'), (req, res) => {
  let list = store.all('orders').slice();
  const { q, status } = req.query;
  if (status) list = list.filter(o => o.status === status);
  if (q) {
    const term = String(q).toLowerCase();
    list = list.filter(o => (o.orderNo + ' ' + ((o.customer && o.customer.name) || '') + ' ' +
      ((o.customer && o.customer.email) || '') + ' ' + ((o.customer && o.customer.phone) || '') + ' ' +
      JSON.stringify(o.items)).toLowerCase().includes(term));
  }
  list.reverse();
  const paged = store.paginate(list, req.query);
  res.json({
    success: true,
    count: paged.total, page: paged.page, limit: paged.limit, totalPages: paged.totalPages,
    data: paged.items
  });
});

router.get('/orders/:id', auth.requirePermission('orders'), (req, res) => {
  const order = store.find('orders', req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  res.json({ success: true, data: order });
});

router.put('/orders/:id', auth.requirePermission('orders'), async (req, res) => {
  const { status, note, paymentMethod } = req.body || {};
  const allowed = ['pending', 'confirmed', 'completed', 'cancelled'];
  const data = {};
  if (status !== undefined) {
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Allowed: ' + allowed.join(', ') });
    }
    data.status = status;
  }
  if (note !== undefined) data.note = note;
  if (paymentMethod !== undefined) data.paymentMethod = paymentMethod;
  const order = store.update('orders', req.params.id, data);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  // Approve (confirmed/completed) = explicit grant: revoke-list theke course soraw,
  // nahole approved order-er course dashboard-e show kore na
  if (status === 'confirmed' || status === 'completed') {
    try { auth.grantOrderAccess(store.find('orders', order.id)); } catch (e) {}
    // Referral commission -> referrer wallet (order proti ekbar, idempotent)
    try { require('../referral').grantCommission(store.find('orders', order.id) || order); } catch (e) {}
  }
  // Cancel hole: commission reverse + buyer-er walletPaid refund (idempotent)
  if (status === 'cancelled') {
    try { require('../referral').reverseCommission(store.find('orders', order.id) || order); } catch (e) {}
  }
  // Status change hole template onujayi auto email (fail korleo response atkabe na)
  if (status !== undefined && ['confirmed', 'completed', 'cancelled'].includes(status)) {
    try { sendOrderStatusMail(store.find('orders', order.id)); } catch (e) {}
  }
  // Approved (confirmed/completed) hole same Bot token diye single-use invite auto-generate.
  // Telegram fail korleo order update atkabe na (error-proof).
  let telegramStatus = null;
  if (status === 'confirmed' || status === 'completed') {
    try { telegramStatus = await generateOrderInvites(order); }
    catch (e) { telegramStatus = { ok: false, error: e.message }; }
  }
  res.json({ success: true, message: 'Order updated', data: store.find('orders', order.id), telegram: telegramStatus });
});

/* ---------- Order telegram invites (regenerate) ----------
 * POST /api/admin/orders/:id/telegram-invites -> notun single-use link banay.
 * Bot code-ay hat deya lage na, Web same BOT_TOKEN use kore. */
router.post('/orders/:id/telegram-invites', auth.requirePermission('orders'), async (req, res) => {
  const order = store.find('orders', req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  try {
    const result = await generateOrderInvites(order, true);
    res.json({ success: true, message: 'Invite links generated', data: store.find('orders', order.id), telegram: result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message || 'Failed to generate invites' });
  }
});

/* Order-er protita course-er chatId theke single-use invite banay + order-e save kore. */
async function generateOrderInvites(order, force) {
  const telegram = require('../telegram');
  if (!telegram.getBotToken()) {
    return { ok: false, error: 'BOT_TOKEN set kora nai (cPanel env BOT_TOKEN / Admin Settings > Bot Token)' };
  }
  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) return { ok: false, error: 'Order-e kono course nai' };
  const prev = (order.telegramInvites && typeof order.telegramInvites === 'object') ? order.telegramInvites : {};
  const next = Object.assign({}, prev);
  let created = 0;
  const errors = [];
  for (const it of items) {
    const cid = String(it.courseId || '');
    if (!cid) continue;
    if (!force && next[cid] && Array.isArray(next[cid]) && next[cid].some(x => x.inviteLink)) continue; // age banano thakle skip
    const course = store.find('courses', cid);
    if (!course) continue;
    const chatIds = courseAllChatIds(course);
    if (!chatIds.length) continue;
    const invites = await telegram.createMultiInvites(chatIds, order.orderNo || order.id);
    const good = invites.filter(x => x.inviteLink);
    if (good.length) {
      next[cid] = invites;
      created += good.length;
    } else if (invites.length && invites[0].error) {
      errors.push(invites[0].error);
    }
  }
  store.update('orders', order.id, { telegramInvites: next });
  if (!created) {
    return { ok: false, error: errors[0] || 'Kono Group ID set kora nai / Bot admin na (Invite Users permission daw)' };
  }
  return { ok: true, created };
}

router.delete('/orders/:id', auth.requirePermission('orders'), (req, res) => {
  const removed = store.remove('orders', req.params.id);
  if (!removed) return res.status(404).json({ success: false, message: 'Order not found' });
  res.json({ success: true, message: 'Order deleted', data: removed });
});

/* ---------- Referral + Wallet (admin) ---------- */
router.get('/referrals/overview', auth.requirePermission('orders'), (req, res) => {
  const ref = require('../referral');
  const cfg = ref.refConfig();
  const coms = store.all('commissions');
  const wds = store.all('withdrawals');
  const paidOut = coms.filter(c => c.status === 'approved').reduce((s, c) => s + (Number(c.amount) || 0), 0);
  res.json({
    success: true,
    data: {
      config: cfg,
      totalCommissions: coms.length,
      approvedCommissions: coms.filter(c => c.status === 'approved').length,
      paidOut: paidOut,
      pendingWithdrawals: wds.filter(w => w.status === 'pending').length,
      pendingAmount: wds.filter(w => w.status === 'pending').reduce((s, w) => s + (Number(w.amount) || 0), 0),
      approvedWithdrawals: wds.filter(w => w.status === 'approved').length
    }
  });
});

router.get('/referrals/commissions', auth.requirePermission('orders'), (req, res) => {
  const list = store.all('commissions')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 200)
    .map(c => {
      const earner = store.find('users', c.userId);
      const buyer = c.buyerId ? store.find('users', c.buyerId) : null;
      return Object.assign({}, c, { earnerName: earner ? earner.name : '', buyerName: buyer ? buyer.name : '' });
    });
  res.json({ success: true, data: list });
});

router.get('/withdrawals', auth.requirePermission('orders'), (req, res) => {
  const st = String(req.query.status || '').trim();
  let list = store.all('withdrawals')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  if (st) list = list.filter(w => w.status === st);
  res.json({ success: true, data: list.slice(0, 200) });
});

router.put('/withdrawals/:id', auth.requirePermission('orders'), (req, res) => {
  const ref = require('../referral');
  const wd = store.find('withdrawals', req.params.id);
  if (!wd) return res.status(404).json({ success: false, message: 'Withdraw request not found' });
  if (wd.status !== 'pending') return res.status(400).json({ success: false, message: 'Already processed (' + wd.status + ')' });
  const action = String((req.body || {}).action || '').toLowerCase();
  const note = String((req.body || {}).note || '').slice(0, 200);
  if (action === 'approve') {
    // Taka request-ei wallet theke deduct hoye geche — approve-e sudhu status seal hoy,
    // tai wallet history-te alada row banano hoy na (0-amount marker row confusing dekhato).
    // Approval record withdrawals list-e status + processedAt hisebe thake.
    store.update('withdrawals', wd.id, { status: 'approved', note, processedAt: new Date().toISOString() });
    return res.json({ success: true, message: 'Withdrawal approved', data: store.find('withdrawals', wd.id) });
  }
  if (action === 'reject') {
    store.update('withdrawals', wd.id, { status: 'rejected', note, processedAt: new Date().toISOString() });
    ref.walletAdd(wd.userId, Math.abs(Number(wd.amount) || 0), 'refund', 'Withdraw rejected — refund', { withdrawalId: wd.id });
    return res.json({ success: true, message: 'Withdrawal rejected + refunded', data: store.find('withdrawals', wd.id) });
  }
  return res.status(400).json({ success: false, message: 'action must be approve or reject' });
});

/* ---------- Home Page ---------- */
router.get('/homepage', (req, res) => {
  const db = store.load();
  if (!db.homePage) db.homePage = store.defaultHomePage();
  res.json({ success: true, data: db.homePage });
});

router.put('/homepage', auth.requirePermission('homepage'), (req, res) => {
  const db = store.load();
  if (!db.homePage) db.homePage = store.defaultHomePage();
  const body = req.body || {};

  if (body.hero && typeof body.hero === 'object') {
    const allowedHero = ['enabled', 'badge', 'titleLine1', 'titleLine2', 'highlight', 'description', 'searchPlaceholder', 'ctaText', 'ctaLink', 'imageUrl', 'imageAlt'];
    allowedHero.forEach(k => { if (body.hero[k] !== undefined) db.homePage.hero[k] = body.hero[k]; });
  }
  const flatHeroMap = { badge: 'badge', titleLine1: 'titleLine1', titleLine2: 'titleLine2', highlight: 'highlight', description: 'description', searchPlaceholder: 'searchPlaceholder', ctaText: 'ctaText', ctaLink: 'ctaLink', imageUrl: 'imageUrl', imageAlt: 'imageAlt', heroEnabled: 'enabled' };
  Object.keys(flatHeroMap).forEach(k => { if (body[k] !== undefined) db.homePage.hero[flatHeroMap[k]] = body[k]; });
  // hero image base64 ele file banaw (db halka rakhar jonno)
  if (typeof db.homePage.hero.imageUrl === 'string' && db.homePage.hero.imageUrl.startsWith('data:')) {
    db.homePage.hero.imageUrl = store.storeImage(db.homePage.hero.imageUrl, 'hero');
  }

  // purono How To Buy uploaded video replace/remove hole orphan file muso
  let oldHbVideo = '';
  try { oldHbVideo = db.homePage.sections && db.homePage.sections.howToBuy ? String(db.homePage.sections.howToBuy.videoUrl || '') : ''; } catch (e) { oldHbVideo = ''; }

  if (body.sections && typeof body.sections === 'object') {
    Object.keys(body.sections).forEach(secKey => {
      if (db.homePage.sections[secKey] && typeof body.sections[secKey] === 'object') {
        Object.assign(db.homePage.sections[secKey], body.sections[secKey]);
      } else if (typeof body.sections[secKey] === 'object') {
        db.homePage.sections[secKey] = body.sections[secKey];
      }
    });
  }

  try {
    const newHbVideo = db.homePage.sections && db.homePage.sections.howToBuy ? String(db.homePage.sections.howToBuy.videoUrl || '') : '';
    if (oldHbVideo && oldHbVideo !== newHbVideo && oldHbVideo.startsWith('/uploads/videos/')) {
      const path = require('path');
      const fs = require('fs');
      const fp = path.join(__dirname, '..', '..', oldHbVideo);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
  } catch (e) { /* ignore cleanup error */ }

  store.save();
  res.json({ success: true, message: 'Home page saved', data: db.homePage });
});

router.post('/homepage/reset', auth.requirePermission('homepage'), (req, res) => {
  const db = store.load();
  db.homePage = store.defaultHomePage();
  store.save();
  res.json({ success: true, message: 'Home page reset to default', data: db.homePage });
});

/* ---------- Home Page: How To Buy video file upload (MP4/WebM, no size limit) ----------
 * Admin > Home Page > How To Buy section-er jonno.
 * POST /api/admin/homepage/video (Content-Type: video/mp4 ba video/webm, raw bytes)
 * response { videoUrl, videoSize, videoName } — pore PUT /api/admin/homepage
 * sections.howToBuy.videoUrl-te pathano hoy. YouTube link-er alternative. */
router.post('/homepage/video', auth.requirePermission('homepage'), (req, res) => {
  if (!req.body || !Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ success: false, message: 'No video file received' });
  }
  const bad = checkVideoBytes(req.body);
  if (bad) return res.status(400).json({ success: false, message: bad });
  try {
    const out = saveVideoBuffer(req.body, headerFileName(req));
    res.status(201).json({ success: true, message: 'Video uploaded', data: Object.assign(out, {
      videoName: headerFileName(req) || 'how-to-buy.mp4'
    })});
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not save video' });
  }
});

/* ---------- Home Page: uploaded How To Buy video delete (orphan cleanup) ---------- */
router.delete('/homepage/video', auth.requirePermission('homepage'), (req, res) => {
  const { videoUrl } = req.body || {};
  if (!isUploadedVideoUrl(videoUrl)) return res.status(400).json({ success: false, message: 'Invalid video URL' });
  const db = store.load();
  const inUse = db.homePage && db.homePage.sections && db.homePage.sections.howToBuy
    && db.homePage.sections.howToBuy.videoUrl === videoUrl;
  if (inUse) return res.json({ success: true, message: 'Video is used in How To Buy, kept' });
  try {
    const path = require('path');
    const fs = require('fs');
    const fp = path.join(__dirname, '..', '..', videoUrl);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (e) { /* ignore */ }
  res.json({ success: true, message: 'Video file removed' });
});

/* ---------- Settings ---------- */
router.get('/settings', (req, res) => {
  const data = Object.assign({}, store.load().settings);
  if (data.smtpPass) data.smtpPass = '••••••••'; // never leak secret; blank input = keep old
  if (data.sendgridApiKey) data.sendgridApiKey = '••••••••';
  if (data.brevoApiKey) data.brevoApiKey = '••••••••';
  if (data.piprapayApiKey) data.piprapayApiKey = '••••••••';
  if (data.botToken) data.botToken = '••••••••';
  res.json({ success: true, data });
});

router.put('/settings', auth.requirePermission('settings'), (req, res) => {
  const db = store.load();
  const allowed = ['siteName', 'tagline', 'currency', 'telegram', 'phone', 'email', 'address', 'footerText', 'logoUrl', 'logoAlt',
    'noticeEnabled', 'noticeText', 'noticeLink', 'noticeBg', 'noticeColor', 'noticeDismissible',
    'googleLoginEnabled', 'googleClientId',
    'piprapayEnabled', 'piprapayApiKey', 'piprapayBaseUrl',
    'botToken',
    'emailEnabled', 'emailProvider', 'senderName', 'senderEmail',
    'smtpHost', 'smtpPort', 'smtpSecure', 'smtpUser', 'smtpPass',
    'sendgridApiKey', 'brevoApiKey',
    'adminNotifyEnabled', 'adminNotifyEmail',
    'maintenanceEnabled', 'maintenanceTitle', 'maintenanceMessage', 'maintenanceEta',
    'referralEnabled', 'referralFriendOff', 'referralCommission', 'referralMinWithdraw'];
  const boolKeys = ['noticeEnabled', 'noticeDismissible', 'googleLoginEnabled', 'piprapayEnabled', 'emailEnabled', 'smtpSecure', 'adminNotifyEnabled', 'maintenanceEnabled', 'referralEnabled'];
  const secretKeys = ['smtpPass', 'sendgridApiKey', 'brevoApiKey', 'piprapayApiKey', 'botToken'];
  allowed.forEach(k => {
    if (req.body && req.body[k] !== undefined) {
      if (boolKeys.includes(k)) {
        const v = req.body[k];
        db.settings[k] = (v === true || v === 'true' || v === 1 || v === '1');
      } else if (secretKeys.includes(k)) {
        // masked bullet value = keep old secret; empty string = clear
        const v = String(req.body[k]);
        if (v === '••••••••' || v === '********') return;
        db.settings[k] = v;
      } else {
        db.settings[k] = req.body[k] === null ? '' : String(req.body[k]);
      }
    }
  });
  if (req.body && req.body.emailProvider !== undefined) {
    const p = String(req.body.emailProvider).toLowerCase();
    db.settings.emailProvider = (p === 'sendgrid' || p === 'brevo') ? p : 'smtp';
  }
  // Nav Bar Telegram multi links (dropdown: Group1, Group2...) — single `telegram` first link-er sathe sync thake
  if (req.body && req.body.telegramLinks !== undefined) {
    const links = normalizeTelegramLinks(undefined, req.body.telegramLinks);
    db.settings.telegramLinks = links;
    if ((req.body.telegram === undefined || String(req.body.telegram).trim() === '') && links.length) db.settings.telegram = links[0].url;
  }
  // logo base64 ele file banaw (db halka rakhar jonno)
  if (typeof db.settings.logoUrl === 'string' && db.settings.logoUrl.startsWith('data:')) {
    db.settings.logoUrl = store.storeImage(db.settings.logoUrl, 'logo');
  }
  store.save();
  res.json({ success: true, message: 'Settings saved', data: db.settings });
});

/* ---------- Admin account (change own password) ---------- */
router.put('/account/password', (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const admin = store.find('admins', req.session.id);
  if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
  if (!auth.verifyPassword(currentPassword, admin.password)) {
    return res.status(400).json({ success: false, message: 'Current password is incorrect' });
  }
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
  }
  admin.password = auth.hashPassword(newPassword);
  store.save();
  res.json({ success: true, message: 'Password changed successfully' });
});

/* ---------- Admin team: email invite + role + permissions ----------
 * - Email diye invite: auto temp password + Brevo/SMTP-te login mail jabe
 * - Permission: ke kon section dekhte/use korte parbe (superadmin = sob)
 * - Admin manage (add/edit/delete/invite) korte 'admins' permission lage */
function isValidEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function makeTempPassword() {
  return require('crypto').randomBytes(6).toString('hex'); // 12 char
}

// Notun admin-ke login info mail koro (Brevo/SMTP — Settings > Email onujayi)
async function sendAdminInviteMail(admin, tempPassword) {
  const emailer = require('../email');
  const s = store.load().settings || {};
  const site = s.siteName || 'StudyMart';
  const html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0F2043">'
    + '<div style="background:linear-gradient(90deg,#1A56FF,#7C3AED);color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">'
    + '<div style="font-size:18px;font-weight:800">' + site.replace(/[<>&"]/g, '') + ' — Admin Invite</div></div>'
    + '<div style="border:1px solid #E2E8F0;border-top:0;padding:22px;border-radius:0 0 12px 12px">'
    + '<p style="font-size:14px;line-height:1.7">Hi ' + String(admin.name || admin.username).replace(/[<>&"]/g, '') + ',</p>'
    + '<p style="font-size:14px;line-height:1.7">Tomake <b>' + site.replace(/[<>&"]/g, '') + '</b>-er admin panel-e access dewa hoyeche. Nicher info diye login koro:</p>'
    + '<div style="background:#F8F9FD;border:1px solid #E2E8F0;border-radius:8px;padding:14px 16px;margin:14px 0;font-size:14px">'
    + '<div>🔑 Username: <b>' + String(admin.username).replace(/[<>&"]/g, '') + '</b></div>'
    + '<div>🔒 Temporary password: <b>' + String(tempPassword).replace(/[<>&"]/g, '') + '</b></div>'
    + '<div>👤 Role: <b>' + String(admin.role || 'admin').replace(/[<>&"]/g, '') + '</b></div>'
    + '</div>'
    + '<p style="font-size:14px;line-height:1.7">Login page: <b>/admin.html</b> (site-er seshe /admin.html bosao)</p>'
    + '<p style="font-size:13px;color:#DC2626;line-height:1.7">⚠️ Login kore Settings theke password change kore nio.</p>'
    + '</div></div>';
  return emailer.sendMail({
    to: admin.email,
    subject: site + ' — Admin panel invite (login info)',
    html,
    tag: 'admin-invite'
  });
}

// Nijer theke boro access dewa atkaw: superadmin chara keu superadmin
// banate ba 'admins' permission dite parbe na.
function sanitizeRoleAndPerms(editor, role, permissions) {
  let r = (role === 'superadmin' || role === 'admin') ? role : 'admin';
  let perms = auth.normalizePermissions(permissions);
  if (!editor || editor.role !== 'superadmin') {
    r = 'admin';
    perms = perms.filter(p => p !== 'admins');
  }
  return { role: r, permissions: perms };
}

router.get('/admins', auth.requirePermission('admins'), (req, res) => {
  const list = store.all('admins').map(a => Object.assign(auth.publicAdmin(a), { createdAt: a.createdAt }));
  res.json({ success: true, count: list.length, data: list });
});

router.post('/admins', auth.requirePermission('admins'), async (req, res) => {
  const { username, name, email, password, role, permissions, sendInvite } = req.body || {};
  if (!username || !String(username).trim()) return res.status(400).json({ success: false, message: 'Username is required' });
  if (store.findBy('admins', 'username', String(username).trim())) {
    return res.status(409).json({ success: false, message: 'Ei username diye admin already ache' });
  }
  const cleanEmail = (email && String(email).trim()) ? String(email).trim().toLowerCase() : '';
  if (email && String(email).trim() && !isValidEmail(cleanEmail)) {
    return res.status(400).json({ success: false, message: 'Valid email address din' });
  }
  if (cleanEmail && store.all('admins').some(a => String(a.email || '').toLowerCase() === cleanEmail)) {
    return res.status(409).json({ success: false, message: 'Ei email diye admin already ache' });
  }
  const editor = store.find('admins', req.session.id);
  const { role: finalRole, permissions: finalPerms } = sanitizeRoleAndPerms(editor, role, permissions);

  const wantInvite = (sendInvite === true || sendInvite === 'true' || sendInvite === 1 || sendInvite === '1');
  let tempPassword = null;
  let finalPass = password;
  if (wantInvite) {
    if (!cleanEmail) return res.status(400).json({ success: false, message: 'Invite pathate Email address dite hobe' });
    tempPassword = makeTempPassword();
    finalPass = tempPassword;
  }
  if (!finalPass || String(finalPass).length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters (nahole "Send email invite" tick daw — auto password bosbe)' });
  const admin = store.insert('admins', {
    username: String(username).trim(),
    name: String(name || username).trim(),
    email: cleanEmail,
    password: auth.hashPassword(String(finalPass)),
    role: finalRole,
    permissions: finalPerms
  });
  // Invite mail ( Brevo / SMTP — fail korleo admin create hoyei thakbe,
  // temp password response-e pathiye deya hobe jate manually share kora jay )
  let mail = null;
  if (wantInvite) {
    try { mail = await sendAdminInviteMail(admin, tempPassword); }
    catch (e) { mail = { ok: false, error: e.message }; }
  }
  res.status(201).json({
    success: true,
    message: wantInvite
      ? (mail && mail.ok ? 'Invite email pathano hoyeche: ' + cleanEmail : 'Admin created — mail jayni (' + ((mail && (mail.error || mail.reason)) || 'email setup check koro') + '). Nicher password-ta copy kore manually daw')
      : 'Notun admin add hoyeche',
    data: auth.publicAdmin(admin),
    tempPassword: tempPassword, // ekbar-i dekhabe (mail fail hole manual share-er jonno)
    mail: mail ? { ok: !!mail.ok, error: mail.error || mail.reason || null } : null
  });
});

router.put('/admins/:id', auth.requirePermission('admins'), (req, res) => {
  const admin = store.find('admins', req.params.id);
  if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
  const { name, email, password, role, permissions } = req.body || {};
  const editor = store.find('admins', req.session.id);
  const data = {};
  if (name !== undefined && String(name).trim()) data.name = String(name).trim();
  if (email !== undefined) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (cleanEmail && !isValidEmail(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Valid email address din' });
    }
    if (cleanEmail && store.all('admins').some(a => String(a.id) !== String(admin.id) && String(a.email || '').toLowerCase() === cleanEmail)) {
      return res.status(409).json({ success: false, message: 'Ei email diye onno admin already ache' });
    }
    data.email = cleanEmail;
  }
  if (password !== undefined && String(password).trim() !== '') {
    if (String(password).length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    data.password = auth.hashPassword(String(password));
  }
  // role/permission change: superadmin-ke sudhu superadmin-i change korte parbe
  if (role !== undefined || permissions !== undefined) {
    if (String(admin.id) === String(req.session.id)) {
      return res.status(400).json({ success: false, message: 'Nijer role/permission nije change kora jabe na' });
    }
    if (admin.role === 'superadmin' && (!editor || editor.role !== 'superadmin')) {
      return res.status(403).json({ success: false, message: 'Super Admin-er role sudhu Super Admin change korte parbe' });
    }
    const s = sanitizeRoleAndPerms(editor, role !== undefined ? role : admin.role, permissions !== undefined ? permissions : admin.permissions);
    data.role = s.role;
    data.permissions = s.permissions;
  }
  const updated = store.update('admins', admin.id, data);
  res.json({ success: true, message: 'Admin updated', data: auth.publicAdmin(updated) });
});

/* ---------- Admin invitations (accept link, 24h expiry) ----------
 * POST /admins/invite -> email + role + permissions (link mail-e jabe)
 * GET  /admins/invites -> pending invite list
 * POST /admins/invites/:id/resend -> new link + 24h expiry
 * DELETE /admins/invites/:id -> revoke invite */
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

function escHtml(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function siteBaseUrl(req) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  return proto + '://' + req.get('host');
}
function inviteAcceptUrl(req, token) {
  return siteBaseUrl(req) + '/admin-accept.html?token=' + token;
}

function publicInvite(inv) {
  if (!inv) return null;
  return {
    id: inv.id, email: inv.email, role: inv.role, permissions: inv.permissions,
    used: !!inv.used, expired: Date.now() > Number(inv.expiresAt || 0),
    expiresAt: inv.expiresAt, createdAt: inv.createdAt
  };
}

// Invitation mail — matches the Admin Invitation template
async function sendAdminInviteLinkMail({ email, role, acceptUrl, siteBase }) {
  const emailer = require('../email');
  const s = store.load().settings || {};
  const site = s.siteName || 'StudyMart';
  const base = siteBase || '';
  const host = base.replace(/^https?:\/\//, '') || 'website';
  const siteLink = base
    ? '<a href="' + escHtml(base) + '" style="color:#1A56FF;font-weight:700">' + escHtml(host) + '</a>'
    : '<b>' + escHtml(site) + '</b>';
  const roleLabel = role === 'superadmin' ? 'Super Administrator' : 'Administrator';
  const html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0F2043">'
    + '<div style="background:linear-gradient(90deg,#1A56FF,#7C3AED);color:#fff;padding:22px;border-radius:12px 12px 0 0;text-align:center">'
    + '<div style="font-size:26px">🔐</div>'
    + '<div style="font-size:19px;font-weight:800;margin-top:4px">Admin Invitation</div></div>'
    + '<div style="border:1px solid #E2E8F0;border-top:0;padding:24px;border-radius:0 0 12px 12px">'
    + '<p style="font-size:14px;line-height:1.7">You have been invited to join ' + siteLink + ' as an Administrator.</p>'
    + '<div style="background:#F8F9FD;border:1px solid #E2E8F0;border-radius:8px;padding:14px 16px;margin:14px 0;font-size:14px;line-height:2">'
    + '<div>👤 Role: <b>' + escHtml(roleLabel) + '</b></div>'
    + '<div>📧 Email: <b>' + escHtml(email) + '</b></div>'
    + '</div>'
    + '<div style="text-align:center;margin:20px 0">'
    + '<a href="' + escHtml(acceptUrl) + '" style="display:inline-block;background:#1A56FF;color:#fff;font-weight:800;font-size:15px;text-decoration:none;padding:13px 34px;border-radius:10px">🔗 Accept Invitation</a>'
    + '</div>'
    + '<p style="font-size:13px;color:#B45309;line-height:1.7">⏳ This invitation will expire in <b>24 hours</b>.</p>'
    + '<p style="font-size:12px;color:#64748B;line-height:1.7">If you did not expect this invitation, you can safely ignore this message.</p>'
    + '</div></div>';
  return emailer.sendMail({ to: email, subject: 'Admin Invitation - ' + site, html });
}

router.post('/admins/invite', auth.requirePermission('admins'), async (req, res) => {
  const { email, role, permissions } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!isValidEmail(cleanEmail)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
  }
  if (store.all('admins').some(a => String(a.email || '').toLowerCase() === cleanEmail)) {
    return res.status(409).json({ success: false, message: 'This email is already an admin' });
  }
  const dupe = store.all('adminInvites')
    .find(i => String(i.email || '').toLowerCase() === cleanEmail && !i.used && Date.now() <= Number(i.expiresAt || 0));
  if (dupe) {
    return res.status(409).json({ success: false, message: 'An invitation is already pending for this email' });
  }
  const editor = store.find('admins', req.session.id);
  const safe = sanitizeRoleAndPerms(editor, role, permissions);
  const token = require('crypto').randomBytes(24).toString('hex');
  const invite = store.insert('adminInvites', {
    email: cleanEmail, role: safe.role, permissions: safe.permissions,
    token, expiresAt: Date.now() + INVITE_TTL_MS, used: false,
    createdBy: req.session.id, createdAt: new Date().toISOString()
  });
  const acceptUrl = inviteAcceptUrl(req, token);
  let mail = null;
  try { mail = await sendAdminInviteLinkMail({ email: cleanEmail, role: safe.role, acceptUrl, siteBase: siteBaseUrl(req) }); }
  catch (e) { mail = { ok: false, error: e.message }; }
  res.status(201).json({
    success: true,
    message: mail && mail.ok
      ? 'Invitation sent to ' + cleanEmail
      : 'Invite created — email failed (' + ((mail && (mail.error || mail.reason)) || 'check email setup') + '). Copy the link below and share it manually.',
    data: publicInvite(invite),
    acceptUrl,
    mail: mail ? { ok: !!mail.ok, error: mail.error || mail.reason || null } : null
  });
});

router.get('/admins/invites', auth.requirePermission('admins'), (req, res) => {
  const all = store.all('adminInvites').slice().reverse();
  const list = all.map(inv => Object.assign(publicInvite(inv), {
    acceptUrl: (!inv.used && inv.token) ? inviteAcceptUrl(req, inv.token) : ''
  }));
  res.json({ success: true, count: list.length, data: list });
});

router.post('/admins/invites/:id/resend', auth.requirePermission('admins'), async (req, res) => {
  const invite = store.find('adminInvites', req.params.id);
  if (!invite) return res.status(404).json({ success: false, message: 'Invitation not found' });
  if (invite.used) return res.status(400).json({ success: false, message: 'This invitation was already accepted' });
  const token = require('crypto').randomBytes(24).toString('hex');
  store.update('adminInvites', invite.id, { token, expiresAt: Date.now() + INVITE_TTL_MS });
  const fresh = store.find('adminInvites', invite.id);
  const acceptUrl = inviteAcceptUrl(req, token);
  let mail = null;
  try { mail = await sendAdminInviteLinkMail({ email: fresh.email, role: fresh.role, acceptUrl, siteBase: siteBaseUrl(req) }); }
  catch (e) { mail = { ok: false, error: e.message }; }
  res.json({
    success: true,
    message: mail && mail.ok ? 'Invitation resent to ' + fresh.email : 'Invite renewed — email failed. Copy the link and share it manually.',
    data: publicInvite(fresh),
    acceptUrl,
    mail: mail ? { ok: !!mail.ok, error: mail.error || mail.reason || null } : null
  });
});

router.delete('/admins/invites/:id', auth.requirePermission('admins'), (req, res) => {
  const removed = store.remove('adminInvites', req.params.id);
  if (!removed) return res.status(404).json({ success: false, message: 'Invitation not found' });
  res.json({ success: true, message: 'Invitation revoked' });
});

// Ager invite hariye gele / mail na gele: notun temp password + abar mail
router.post('/admins/:id/resend-invite', auth.requirePermission('admins'), async (req, res) => {
  const admin = store.find('admins', req.params.id);
  if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
  if (!admin.email || !isValidEmail(admin.email)) {
    return res.status(400).json({ success: false, message: 'Ei admin-er email set kora nai — age Edit kore email bosao' });
  }
  const tempPassword = makeTempPassword();
  store.update('admins', admin.id, { password: auth.hashPassword(tempPassword) });
  let mail = null;
  try { mail = await sendAdminInviteMail(store.find('admins', admin.id), tempPassword); }
  catch (e) { mail = { ok: false, error: e.message }; }
  res.json({
    success: true,
    message: mail && mail.ok ? 'Invite abar pathano hoyeche: ' + admin.email : 'Mail jayni (' + ((mail && (mail.error || mail.reason)) || 'email setup check koro') + ') — password-ta manually share koro',
    data: auth.publicAdmin(store.find('admins', admin.id)),
    tempPassword,
    mail: { ok: !!mail.ok, error: (mail && (mail.error || mail.reason)) || null }
  });
});

router.delete('/admins/:id', auth.requirePermission('admins'), (req, res) => {
  const admin = store.find('admins', req.params.id);
  if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
  if (String(admin.id) === String(req.session.id)) {
    return res.status(400).json({ success: false, message: 'Nijer account delete kora jabe na' });
  }
  if (store.all('admins').length <= 1) {
    return res.status(400).json({ success: false, message: 'Last admin delete kora jabe na' });
  }
  const editor = store.find('admins', req.session.id);
  if (admin.role === 'superadmin' && (!editor || editor.role !== 'superadmin')) {
    return res.status(403).json({ success: false, message: 'Super Admin-ke sudhu Super Admin remove korte parbe' });
  }
  const removed = store.remove('admins', admin.id);
  res.json({ success: true, message: 'Admin removed', data: auth.publicAdmin(removed) });
});

/* ---------- Email templates (admin panel theke edit) ---------- */
router.get('/email-templates', auth.requirePermission('notify'), (req, res) => {
  const db = store.load();
  if (!db.emailTemplates) db.emailTemplates = store.defaultEmailTemplates();
  res.json({ success: true, data: db.emailTemplates });
});

router.put('/email-templates', auth.requirePermission('notify'), (req, res) => {
  const db = store.load();
  if (!db.emailTemplates) db.emailTemplates = store.defaultEmailTemplates();
  const body = req.body || {};
  const templates = body.templates || body;
  Object.keys(templates).forEach(key => {
    const t = templates[key];
    if (!t || typeof t !== 'object') return;
    if (!db.emailTemplates[key]) db.emailTemplates[key] = { name: key, enabled: true, subject: '', body: '' };
    if (t.subject !== undefined) db.emailTemplates[key].subject = String(t.subject);
    if (t.body !== undefined) db.emailTemplates[key].body = String(t.body);
    if (t.enabled !== undefined) db.emailTemplates[key].enabled = (t.enabled === true || t.enabled === 'true' || t.enabled === 1 || t.enabled === '1');
    if (t.name !== undefined) db.emailTemplates[key].name = String(t.name);
  });
  store.save();
  res.json({ success: true, message: 'Email templates saved', data: db.emailTemplates });
});

router.post('/email-templates/reset', auth.requirePermission('notify'), (req, res) => {
  const db = store.load();
  db.emailTemplates = store.defaultEmailTemplates();
  store.save();
  res.json({ success: true, message: 'Templates reset to default', data: db.emailTemplates });
});

/* ---------- Email: test + custom notification ---------- */
router.get('/email-logs', auth.requirePermission('notify'), (req, res) => {
  const db = store.load();
  res.json({ success: true, data: Array.isArray(db.emailLogs) ? db.emailLogs.slice(0, 50) : [] });
});

router.post('/email-test', auth.requirePermission('notify'), async (req, res) => {
  const emailer = require('../email');
  const { to } = req.body || {};
  if (!to) return res.status(400).json({ success: false, message: 'Please enter a test email address' });
  const s = store.load().settings || {};
  const result = await emailer.sendMail({
    to: String(to).trim(),
    subject: 'Test email - ' + (s.siteName || 'StudyMart'),
    html: '<p>Hi,</p><p>Your email setup is working! This mail was sent from <b>' + (s.siteName || 'StudyMart') + '</b>.</p>',
    tag: 'test'
  });
  if (result.ok) return res.json({ success: true, message: 'Test email sent to: ' + to });
  res.status(400).json({ success: false, message: result.error || result.reason || 'Could not send email' });
});

router.post('/notify', auth.requirePermission('notify'), async (req, res) => {
  const emailer = require('../email');
  const { to, userId, userIds, sendToAll, subject, message } = req.body || {};
  if (!subject || !String(subject).trim()) return res.status(400).json({ success: false, message: 'Subject din' });
  if (!message || !String(message).trim()) return res.status(400).json({ success: false, message: 'Message din' });
  let targets = [];
  if (sendToAll === true || sendToAll === 'true') {
    targets = store.all('users').map(u => u.email).filter(e => emailer.isRealEmail(e));
  } else if (Array.isArray(userIds)) {
    userIds.forEach(id => {
      const u = store.find('users', id);
      if (u && emailer.isRealEmail(u.email)) targets.push(u.email);
    });
  } else if (userId) {
    const u = store.find('users', userId);
    if (u && emailer.isRealEmail(u.email)) targets.push(u.email);
  } else if (to) {
    String(to).split(/[\n,;]+/).map(x => x.trim()).filter(x => emailer.isRealEmail(x)).forEach(x => targets.push(x));
  }
  targets = Array.from(new Set(targets));
  if (!targets.length) return res.status(400).json({ success: false, message: 'Kono valid email address pawa jayni' });
  if (targets.length > 200) return res.status(400).json({ success: false, message: 'Ekbare max 200 jon ke pathano jabe' });
  const s = store.load().settings || {};
  let sent = 0;
  const errors = [];
  for (const addr of targets) {
    const user = store.findBy('users', 'email', addr);
    const html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0F2043">'
      + '<div style="background:linear-gradient(90deg,#1A56FF,#7C3AED);color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">'
      + '<div style="font-size:18px;font-weight:800">' + String(s.siteName || 'StudyMart').replace(/[<>&"]/g, '') + '</div></div>'
      + '<div style="border:1px solid #E2E8F0;border-top:0;padding:22px;border-radius:0 0 12px 12px">'
      + String(message).split('\n').map(line => '<p style="font-size:14px;line-height:1.7;margin:0 0 10px">' + line.replace(/[<>&"]/g, '') + '</p>').join('')
      + '</div></div>';
    const r = await emailer.sendMail({
      to: addr,
      subject: emailer.renderTemplate(String(subject), { name: user ? user.name : '', email: addr }),
      html: emailer.renderTemplate(html, { name: user ? user.name : '', email: addr }),
      tag: 'notify'
    });
    if (r.ok) sent++;
    else errors.push(addr + ': ' + (r.error || r.reason));
  }
  res.json({ success: true, message: sent + '/' + targets.length + ' jon ke email pathano hoyeche', data: { sent, total: targets.length, errors: errors.slice(0, 5) } });
});

/* ---------- Order status change -> auto email (template onujayi) ---------- */
async function sendOrderStatusMail(order) {
  try {
    const emailer = require('../email');
    emailer.notifyOrder(order, order.status);
  } catch (e) { /* email fail korleo order update atkabe na */ }
}

module.exports = router;
