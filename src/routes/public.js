/**
 * Public API - used by the frontend website (no admin rights needed).
 */
const express = require('express');
const store = require('../store');
const auth = require('../auth');
const piprapay = require('../piprapay');

const router = express.Router();

/* ---------- Fast repeat loads: short public cache, never for private/auth data ----------
 * List/catalogue GETs: 30s browser cache + 90s stale-while-revalidate.
 * Search (?q=): 10s only. /my/* (login data): never cached. */
router.get('*', (req, res, next) => {
  try {
    if (req.path.startsWith('/my/') || req.path.startsWith('/auth/')) {
      res.setHeader('Cache-Control', 'private, no-store');
    } else if (req.query && req.query.q) {
      res.setHeader('Cache-Control', 'public, max-age=10');
    } else if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=90');
    }
  } catch (e) {}
  next();
});

// Secrets (gateway API keys) must NEVER leak to the public website.
const SECRET_SETTING_KEYS = ['piprapayApiKey', 'botToken'];
function publicSettings() {
  const s = Object.assign({}, store.load().settings || {});
  SECRET_SETTING_KEYS.forEach(k => delete s[k]);
  return s;
}

const activeOnly = list => list.filter(i => (i.status || 'active') === 'active');

/* ---------- Home Page (public) ---------- */
router.get('/homepage', (req, res) => {
  const db = store.load();
  if (!db.homePage) db.homePage = store.defaultHomePage();
  res.json({ success: true, data: db.homePage });
});

/* ---------- Meta / settings ---------- */
router.get('/settings', (req, res) => {
  res.json({ success: true, data: publicSettings() });
});

router.get('/meta', (req, res) => {
  res.json({
    success: true,
    data: {
      settings: publicSettings(),
      batches: activeOnly(store.all('batches')),
      ebookBatches: activeOnly(store.all('ebookBatches')),
      categories: activeOnly(store.all('categories')),
      platforms: activeOnly(store.all('platforms')),
      groups: activeOnly(store.all('groups')),
      subjects: activeOnly(store.all('subjects'))
    }
  });
});

/* ---------- Batches / Categories / Platforms / Groups / Subjects ---------- */
['batches', 'categories', 'platforms', 'groups', 'subjects'].forEach(name => {
  router.get('/' + name, (req, res) => {
    let list = activeOnly(store.all(name));
    if (req.query.q) {
      const term = String(req.query.q).toLowerCase();
      list = list.filter(i => String(i.name).toLowerCase().includes(term));
    }
    res.json({ success: true, count: list.length, data: list });
  });

  router.get('/' + name + '/:id', (req, res) => {
    const item = store.find(name, req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, data: item });
  });
});

/* ---------- E-Book Batches (course batch theke alada) ---------- */
router.get('/ebook-batches', (req, res) => {
  let list = activeOnly(store.all('ebookBatches'));
  if (req.query.q) {
    const term = String(req.query.q).toLowerCase();
    list = list.filter(i => String(i.name).toLowerCase().includes(term));
  }
  list = list.slice().sort((a, b) => ((Number(a.order) || 999) - (Number(b.order) || 999)) || (Number(a.id) - Number(b.id)));
  res.json({ success: true, count: list.length, data: list });
});

router.get('/ebook-batches/:id', (req, res) => {
  const item = store.find('ebookBatches', req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
  res.json({ success: true, data: item });
});

/* ---------- Courses ---------- */
// PRIVATE fields (video ids, telegram links) are NEVER sent to the public site.
// Students get them only via the gated /api/my/... endpoints below.
const PRIVATE_COURSE_FIELDS = ['telegramLink', 'telegramLinks', 'telegramChatIds', 'previewVideoId', 'emptyStructure'];

function publicCourse(course) {
  const out = Object.assign({}, course);
  PRIVATE_COURSE_FIELDS.forEach(k => delete out[k]);
  return out;
}

function enrich(course) {
  const batch = store.find('batches', course.batchId);
  const category = store.find('categories', course.categoryId);
  const platform = store.find('platforms', course.platformId);
  const group = store.find('groups', course.groupId);
  const subject = store.find('subjects', course.subjectId);
  const lessonsCount = store.all('lessons')
    .filter(l => String(l.courseId) === String(course.id) && (l.status || 'active') === 'active').length;
  return Object.assign(publicCourse(course), {
    batchName: batch ? batch.name : '',
    batchSlug: batch ? batch.slug : '',
    batchColor: batch ? batch.color : '#4F46E5',
    categoryName: category ? category.name : '',
    categorySlug: category ? category.slug : '',
    categoryColor: category ? category.color : '#EDE9FF',
    platformName: platform ? platform.name : '',
    platformIcon: platform ? platform.icon : 'fa-globe',
    groupName: group ? group.name : '',
    groupSlug: group ? group.slug : '',
    subjectName: subject ? subject.name : '',
    subjectSlug: subject ? subject.slug : '',
    lessonsCount,
    hasPreview: !!course.previewVideoId,
    discount: course.oldPrice > course.price
      ? Math.round(((course.oldPrice - course.price) / course.oldPrice) * 100) : 0
  });
}

// Has this student bought this course? (admin confirms payment -> confirmed/completed)
// Free courses (price 0) are automatically accessible / instant enrolled!
function hasEnrollment(userId, courseId) {
  if (!courseId) return false;
  if (!userId) return false;
  const user = store.find('users', userId);
  if (!user) return false;
  if (user.status === 'banned' || user.status === 'blocked') return false;

  const sCourseId = String(courseId);

  // If explicitly revoked by admin, deny
  if (Array.isArray(user.revokedCourses) && user.revokedCourses.map(String).includes(sCourseId)) {
    return false;
  }

  // If manually granted by admin, allow
  if (Array.isArray(user.enrolledCourses) && user.enrolledCourses.map(String).includes(sCourseId)) {
    return true;
  }

  const course = store.find('courses', courseId);
  if (course && Number(course.price) === 0) return true;

  return store.all('orders').some(o =>
    String(o.userId) === String(userId) &&
    ['confirmed', 'completed'].includes(o.status) &&
    Array.isArray(o.items) && o.items.some(i => String(i.courseId) === sCourseId)
  );
}

function getUserEnrolledCourses(userId) {
  const user = store.find('users', userId);
  if (!user || user.status === 'banned' || user.status === 'blocked') return [];
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

function publicResources(lesson) {
  // Public catalogue-e sudhu label/kind (URL enrolled-der jonno gated)
  return (Array.isArray(lesson.resources) ? lesson.resources : [])
    .filter(r => r && r.label)
    .map(r => ({ label: String(r.label).slice(0, 80), kind: r.kind || 'other' }));
}

function fullResources(lesson) {
  // Enrolled student / free preview: asol download URL soho
  return (Array.isArray(lesson.resources) ? lesson.resources : [])
    .filter(r => r && r.label && r.url)
    .map(r => ({ label: String(r.label).slice(0, 80), url: String(r.url).slice(0, 2000), kind: r.kind || 'other' }));
}

/* ---------- Chapter / Section-level node resources ----------
 * course.nodeResources = [{ path:{...}, resources:[...] }] — class-er under-e na,
 * borong Section/Sub-Section/Chapter/Topic level-e attach kora sheet.
 * full=false hole guest-der jonno sudhu label/kind (URL gated). */
function nodeResourcesOut(course, full) {
  const list = course && Array.isArray(course.nodeResources) ? course.nodeResources : [];
  return list
    .filter(n => n && n.path && typeof n.path === 'object' && n.path.section && Array.isArray(n.resources) && n.resources.length)
    .map(n => ({
      path: n.path,
      resources: n.resources
        .filter(r => r && r.label && (full ? r.url : true))
        .map(r => full
          ? { label: String(r.label).slice(0, 80), url: String(r.url).slice(0, 2000), kind: r.kind || 'other' }
          : { label: String(r.label).slice(0, 80), kind: r.kind || 'other' })
    }))
    .filter(n => n.resources.length);
}
// Lesson-er full step path (prune logic-er moto legacy+steps merge)
function lessonFullPath(lesson) {
  const steps = (lesson.steps && typeof lesson.steps === 'object' && !Array.isArray(lesson.steps)) ? lesson.steps : {};
  const out = {
    section: ((lesson.subject && String(lesson.subject).trim()) || steps.section || 'General'),
    subsection: ((lesson.subsection && String(lesson.subsection).trim()) || steps.subsection || ''),
    chapter: (String(lesson.section || lesson.chapter || steps.chapter || '').trim() || 'Chapter 1'),
    topic: ((lesson.topic && String(lesson.topic).trim()) || steps.topic || ''),
    subtopic: ((lesson.subtopic && String(lesson.subtopic).trim()) || steps.subtopic || '')
  };
  Object.keys(steps).forEach(k => { if (out[k] === undefined && steps[k]) out[k] = steps[k]; });
  return out;
}
// Lesson-er ancestor node gulor resources, PATH GROUP soho (section -> ... -> deepest).
// Player-e flat-merge na kore group-wise dekhano hoy — kon sheet kon
// Section/Chapter-er ta bojha jay. URL diye dedupe hoy.
function ancestorNodeGroups(course, lesson, full) {
  const list = course && Array.isArray(course.nodeResources) ? course.nodeResources : [];
  if (!list.length) return [];
  const lp = lessonFullPath(lesson);
  const matched = list.filter(n => {
    if (!n || !n.path || typeof n.path !== 'object' || !n.path.section) return false;
    return Object.keys(n.path).every(k => String(lp[k] || '') === String(n.path[k]));
  });
  // shallow (section) age, deep pore
  matched.sort((a, b) => Object.keys(a.path).length - Object.keys(b.path).length);
  const seen = new Set();
  return matched.map(n => {
    const resources = [];
    (Array.isArray(n.resources) ? n.resources : []).forEach(r => {
      if (!r || !r.label || (full && !r.url)) return;
      const key = full ? String(r.url) : ('label:' + String(r.label));
      if (seen.has(key)) return;
      seen.add(key);
      resources.push(full
        ? { label: String(r.label).slice(0, 80), url: String(r.url).slice(0, 2000), kind: r.kind || 'other' }
        : { label: String(r.label).slice(0, 80), kind: r.kind || 'other' });
    });
    return { path: n.path, resources };
  }).filter(g => g.resources.length);
}
// (legacy flat merge — ekhon groups use hoy, compatibility-r jonno rakha)
function ancestorNodeResources(course, lesson, full) {
  const out = [];
  ancestorNodeGroups(course, lesson, full).forEach(g => { g.resources.forEach(r => out.push(r)); });
  return out;
}

function safeLessons(courseId) {
  const subjById = {};
  try{ store.all('subjects').forEach(s=> subjById[String(s.id)] = s); }catch(e){}
  return store.all('lessons')
    .filter(l => String(l.courseId) === String(courseId) && (l.status || 'active') === 'active')
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .map(l => {
      const sid = String(l.subjectId || '');
      const subjObj = sid && subjById[sid] ? subjById[sid] : null;
      const subjName = l.subject && String(l.subject).trim() ? String(l.subject).trim() : (subjObj ? subjObj.name : '');
      // steps fallback to legacy fields
      const steps = (l.steps && typeof l.steps === 'object' && !Array.isArray(l.steps)) ? l.steps : {};
      const chap = l.chapter || l.section || steps.chapter || '';
      const subsec = (l.subsection && String(l.subsection).trim()) ? String(l.subsection).trim() : (steps.subsection || '');
      const topic = (l.topic && String(l.topic).trim()) ? String(l.topic).trim() : (steps.topic || '');
      const subtopic = (l.subtopic && String(l.subtopic).trim()) ? String(l.subtopic).trim() : (steps.subtopic || '');
          const stepsOut = (steps && Object.keys(steps).length) ? store.normalizeLessonSteps(steps) : store.normalizeLessonSteps({ section: l.subject || '', subsection: subsec, chapter: chap || '', topic: topic || '', subtopic: subtopic || '' });
          return { id: l.id, subject: subjName, subjectId: l.subjectId ? Number(l.subjectId) : 0, subsection: subsec, section: l.section || chap || '', chapter: chap || l.section || '', topic, subtopic, title: l.title, duration: l.duration || '', isFree: !!l.isFree, order: Number(l.order) || 0, source: (l.videoUrl ? 'upload' : 'youtube'), resources: publicResources(l), resourceCount: (Array.isArray(l.resources) ? l.resources.length : 0), steps: stepsOut };
    });
}

// Generic hierarchical structure using course.steps + lesson.steps (unlimited levels, no max)
// FRAME: legacy fields (subject/subsection/chapter/topic/subtopic) fallback for backward compat.
function courseStructure(courseId){
  const course = store.find('courses', courseId);
  const stepsDef = course ? store.resolveSteps(course) : store.defaultSteps();
  const stepIds = stepsDef.map(s => s.id);
  const lessons = safeLessons(courseId);
  
  // Build map: stepId -> { name, children: { value -> { lessons, children } } }
  // We'll use a recursive tree where each level groups by its step value
  const root = { name: '', children: {}, count: 0 };
  
  lessons.forEach(l => {
    const steps = (l.steps && typeof l.steps === 'object' && !Array.isArray(l.steps)) ? l.steps : {};
    let node = root;
    stepIds.forEach(stepId => {
      const val = steps[stepId] || (stepId === 'section' ? (l.subject || 'General') : 
                       stepId === 'subsection' ? (l.subsection || '') :
                       stepId === 'chapter' ? (l.chapter || l.section || 'All Classes') :
                       stepId === 'topic' ? (l.topic || '') :
                       stepId === 'subtopic' ? (l.subtopic || '') : '');
      if (!val) return;
      if (!node.children[val]) {
        node.children[val] = { name: val, children: {}, count: 0, stepId, stepName: stepsDef.find(s => s.id === stepId)?.name || stepId };
      }
      node = node.children[val];
      node.count++;
      // store lesson at leaf level (last step)
    });
    // Put lesson at the deepest level that has a value
    // (simple: attach to the last step that had a value)
    // For flat structure, also push to each ancestor for backward compat counts
  });
  
  // Convert tree to array format for frontend
  const buildTree = (node, depth) => {
    const stepDef = stepsDef[depth];
    const stepId = stepDef?.id;
    const stepLabel = stepDef?.name || stepId || 'Level';
    const children = Object.values(node.children).map(child => {
      const childNode = buildTree(child, depth + 1);
      return {
        id: stepId + '_' + child.name,
        [stepId]: child.name,
        label: child.name,
        stepLabel: child.stepName || stepLabel,
        children: childNode.children,
        count: child.count + (childNode.lessons?.length || 0),
        lessons: childNode.lessons || []
      };
    });
    // Collect lessons at this level
    // For now return flat list of children
    return { children, count: node.count };
  };
  
  // Simplified flat grouped output for now (backward compat with existing frontend)
  // This builds the same structure as before but uses dynamic steps
  const subjMap = {};
  const order = [];
  lessons.forEach(l=>{
    const key = l.subject || 'General';
    if(!subjMap[key]){
      subjMap[key] = { subject: key, subjectId: l.subjectId||0, chapters: {}, chapterOrder: [], subMap: {}, subOrder: [], totalLessons: 0, freeLessons: 0 };
      order.push(key);
    }
    const s = subjMap[key];
    s.totalLessons++;
    if(l.isFree) s.freeLessons++;
    const subKey = l.subsection || '';
    if(!s.subMap[subKey]){
      s.subMap[subKey] = { subsection: subKey, chapters: {}, chapterOrder: [] };
      s.subOrder.push(subKey);
    }
    const sub = s.subMap[subKey];
    const cKey = l.chapter || l.section || 'All Classes';
    if(!sub.chapters[cKey]){
      sub.chapters[cKey] = { chapter: cKey, lessons: [], topicMap: {}, topicOrder: [] };
      sub.chapterOrder.push(cKey);
    }
    const tKey = l.topic || '';
    if(tKey && !sub.chapters[cKey].topicMap[tKey]){
      sub.chapters[cKey].topicMap[tKey] = { topic: tKey, lessons: [], subTopicMap: {}, subTopicOrder: [] };
      sub.chapters[cKey].topicOrder.push(tKey);
    }
    if(tKey){
      sub.chapters[cKey].topicMap[tKey].lessons.push(l);
      const stKey = l.subtopic || '';
      if(stKey){
        if(!sub.chapters[cKey].topicMap[tKey].subTopicMap[stKey]){
          sub.chapters[cKey].topicMap[tKey].subTopicMap[stKey] = { subtopic: stKey, lessons: [] };
          sub.chapters[cKey].topicMap[tKey].subTopicOrder.push(stKey);
        }
        sub.chapters[cKey].topicMap[tKey].subTopicMap[stKey].lessons.push(l);
      }
    }
    sub.chapters[cKey].lessons.push(l);
    if(!s.chapters[cKey]){
      s.chapters[cKey] = { chapter: cKey, lessons: [] };
      s.chapterOrder.push(cKey);
    }
    s.chapters[cKey].lessons.push(l);
  });
  const topicsOf = (chapObj) => (chapObj.topicOrder || []).map(tk => {
    const t = chapObj.topicMap[tk];
    return {
      topic: t.topic,
      lessons: t.lessons,
      count: t.lessons.length,
      subtopics: (t.subTopicOrder || []).map(stk => ({
        subtopic: stk,
        lessons: t.subTopicMap[stk].lessons,
        count: t.subTopicMap[stk].lessons.length
      })),
      subtopicCount: (t.subTopicOrder || []).length
    };
  });
  return order.map(k=>{
    const s = subjMap[k];
    return {
      subject: s.subject,
      subjectId: s.subjectId,
      totalLessons: s.totalLessons,
      freeLessons: s.freeLessons,
      subsections: s.subOrder.map(sk=> ({
        subsection: s.subMap[sk].subsection,
        chapters: s.subMap[sk].chapterOrder.map(ck=> {
          const ch = s.subMap[sk].chapters[ck];
          return {
            chapter: ck,
            lessons: ch.lessons,
            count: ch.lessons.length,
            topics: topicsOf(ch),
            topicCount: (ch.topicOrder || []).length
          };
        }),
        chapterCount: s.subMap[sk].chapterOrder.length,
        lessonCount: s.subMap[sk].chapterOrder.reduce((a,ck)=> a + s.subMap[sk].chapters[ck].lessons.length, 0)
      })),
      subsectionCount: s.subOrder.filter(x=> x !== '').length,
      chapters: s.chapterOrder.map(ck=> ({
        chapter: ck,
        lessons: s.chapters[ck].lessons,
        count: s.chapters[ck].lessons.length
      })),
      chapterCount: s.chapterOrder.length
    };
  });
}

function lessonVideoPayload(lesson) {
  if (lesson.videoUrl) {
    return { source: 'upload', embedUrl: '', videoUrl: lesson.videoUrl };
  }
  return { source: 'youtube', embedUrl: 'https://www.youtube-nocookie.com/embed/' + lesson.videoId + '?rel=0', videoUrl: '' };
}

router.get('/courses', (req, res) => {
  let list = activeOnly(store.all('courses')).map(enrich);
  const { batch, batchId, category, categoryId, platformId, groupId, subjectId, group, subject, platform, featured, q } = req.query;
  if (batch) list = list.filter(c => String(c.batchSlug).toLowerCase() === String(batch).toLowerCase());
  if (batchId) list = list.filter(c => String(c.batchId) === String(batchId));
  if (category) list = list.filter(c => String(c.categorySlug).toLowerCase() === String(category).toLowerCase());
  if (categoryId) list = list.filter(c => String(c.categoryId) === String(categoryId));
  if (platformId) list = list.filter(c => String(c.platformId) === String(platformId));
  if (platform) list = list.filter(c => String(c.platformName).toLowerCase() === String(platform).toLowerCase() || String(c.platformSlug).toLowerCase() === String(platform).toLowerCase());
  if (groupId) list = list.filter(c => String(c.groupId) === String(groupId));
  if (group) list = list.filter(c => String(c.groupName).toLowerCase() === String(group).toLowerCase() || String(c.groupSlug).toLowerCase() === String(group).toLowerCase());
  if (subjectId) list = list.filter(c => String(c.subjectId) === String(subjectId));
  if (subject) list = list.filter(c => String(c.subjectName).toLowerCase() === String(subject).toLowerCase() || String(c.subjectSlug).toLowerCase() === String(subject).toLowerCase());
  if (featured === 'true') list = list.filter(c => c.featured === true);
  if (q) {
    const term = String(q).toLowerCase();
    list = list.filter(c => (c.title + ' ' + (c.teacher || '') + ' ' + (c.categoryName || '')).toLowerCase().includes(term));
  }
  const paged = store.paginate(list, req.query);
  res.json(Object.assign({ success: true, count: paged.total, data: paged.items }, paged));
});

router.get('/courses/:idOrSlug', (req, res) => {
  const key = req.params.idOrSlug;
  const course = store.find('courses', key) || store.all('courses').find(c => c.slug === key);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  res.json({ success: true, data: enrich(course) });
});

/* ---------- Coupons (course / batch / category targeting) ----------
 * coupon.courseIds + batchIds + categoryIds — tin tai khali hole sob
 * course-e cholbe; nahole cart-er je item gulo selected course / batch /
 * category-r sathe mile (OR logic) sudhu oi gulor subtotal-er upor
 * discount + minOrder check hobe. */
function couponItemMeta(item) {
  const id = String(item.courseId != null ? item.courseId : (item.ebookId != null ? item.ebookId : (item.id != null ? item.id : '')));
  if (!id) return { id: '', batchIds: [], categoryId: '' };
  // E-book item hole e-book age lookup (ID collision-e course mile jeto)
  if (item.ebookId != null || item.type === 'ebook') {
    const ebookFirst = store.find('ebooks', id);
    if (ebookFirst) {
      const bids = [String(ebookFirst.batchId || ''), String(ebookFirst.ebookBatchId || '')].filter(Boolean);
      return { id, batchIds: bids, categoryId: String(ebookFirst.categoryId || '') };
    }
  }
  const course = store.find('courses', id);
  if (course) {
    return {
      id,
      batchIds: [String(course.batchId || '')].filter(Boolean),
      categoryId: String(course.categoryId || '')
    };
  }
  const ebook = store.find('ebooks', id);
  if (ebook) {
    const bids = [String(ebook.batchId || ''), String(ebook.ebookBatchId || '')].filter(Boolean);
    return { id, batchIds: bids, categoryId: String(ebook.categoryId || '') };
  }
  // catalogue-e na thakle frontend-er pathano batchId/categoryId thakle seta use koro
  return {
    id,
    batchIds: [String(item.batchId || ''), String(item.ebookBatchId || '')].filter(Boolean),
    categoryId: String(item.categoryId || '')
  };
}

function couponBuyerOf(buyer, sessionUser) {
  const b = buyer && typeof buyer === 'object' ? buyer : {};
  const s = sessionUser && typeof sessionUser === 'object' ? sessionUser : {};
  const userId = String(b.userId || s.id || '').trim();
  const email = String(b.email || s.email || '').trim().toLowerCase();
  const phone = String(b.phone || s.phone || '').replace(/[\s\-()]/g, '');
  return { userId, email, phone };
}

function validateCoupon(code, subtotal, items, buyer) {
  const coupon = store.findBy('coupons', 'code', code || '');
  if (!coupon) {
    // Referral code? (friend-er referral coupon coupon box-e bosale % off)
    try {
      const ref = require('../referral');
      const cfg = ref.refConfig();
      if (cfg.enabled) {
        const owner = ref.findByCode(code);
        if (owner) {
          const who = couponBuyerOf(buyer, null);
          if (who.userId && String(who.userId) === String(owner.id)) {
            return { valid: false, message: 'Nijer referral code use kora jabe na' };
          }
          const off = (typeof ref.userFriendOff === 'function') ? ref.userFriendOff(owner) : cfg.friendOff;
          if (!(off > 0)) return { valid: false, message: 'Invalid coupon code' };
          const base = Math.max(0, Number(subtotal) || 0);
          const discount = Math.min(Math.floor(base * off / 100), base);
          return { valid: true, discount, referral: true, referrerId: owner.id, referrerName: owner.name || '', friendOff: off };
        }
      }
    } catch (e) {}
    return { valid: false, message: 'Invalid coupon code' };
  }
  if (coupon.status !== 'active') return { valid: false, message: 'This coupon is not active' };
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date(new Date().toDateString())) {
    return { valid: false, message: 'This coupon has expired' };
  }
  if (coupon.usageLimit && Number(coupon.used) >= Number(coupon.usageLimit)) {
    return { valid: false, message: 'Coupon usage limit reached' };
  }
  // User restriction: any of userIds / allowedEmails / allowedPhones set = private coupon
  const allowedIds = Array.isArray(coupon.userIds) ? coupon.userIds.map(String) : [];
  const allowedEmails = Array.isArray(coupon.allowedEmails) ? coupon.allowedEmails.map(e => String(e).toLowerCase()) : [];
  const allowedPhones = Array.isArray(coupon.allowedPhones) ? coupon.allowedPhones.map(p => String(p).replace(/[\s\-()]/g, '')) : [];
  if (allowedIds.length || allowedEmails.length || allowedPhones.length) {
    const who = couponBuyerOf(buyer, null);
    const hitUser = (who.userId && allowedIds.includes(String(who.userId)))
      || (who.email && allowedEmails.includes(who.email))
      || (who.phone && allowedPhones.includes(who.phone));
    if (!hitUser) return { valid: false, message: 'This coupon is not assigned to your account' };
  }
  const courseTargets = Array.isArray(coupon.courseIds) ? coupon.courseIds.map(String) : [];
  const batchTargets = Array.isArray(coupon.batchIds) ? coupon.batchIds.map(String) : [];
  const categoryTargets = Array.isArray(coupon.categoryIds) ? coupon.categoryIds.map(String) : [];
  const hasTarget = courseTargets.length || batchTargets.length || categoryTargets.length;
  let base = Number(subtotal) || 0;
  if (hasTarget && Array.isArray(items) && items.length) {
    const hit = items.filter(i => {
      const meta = couponItemMeta(i);
      if (courseTargets.includes(meta.id)) return true;
      if (meta.batchIds.some(b => batchTargets.includes(String(b)))) return true;
      if (meta.categoryId && categoryTargets.includes(String(meta.categoryId))) return true;
      return false;
    });
    if (!hit.length) return { valid: false, message: 'This coupon is not valid for the selected items' };
    base = hit.reduce((s, i) => s + Number(i.price || 0), 0);
  }
  if (base < Number(coupon.minOrder || 0)) {
    return { valid: false, message: 'Minimum order for this coupon is ' + coupon.minOrder };
  }
  let discount = coupon.type === 'percent'
    ? (base * Number(coupon.value)) / 100
    : Number(coupon.value);
  if (coupon.maxDiscount) discount = Math.min(discount, Number(coupon.maxDiscount));
  discount = Math.min(Math.round(discount), base);
  return { valid: true, coupon, discount };
}

/* ---------- Admin invitations (accept via emailed link, 24h expiry) ---------- */
function findAdminInvite(token) {
  const t = String(token || '').trim();
  if (!t) return null;
  return store.all('adminInvites').find(i => String(i.token || '') === t) || null;
}

router.get('/admin-invites/:token', (req, res) => {
  const invite = findAdminInvite(req.params.token);
  if (!invite) return res.status(404).json({ success: false, message: 'Invalid invitation link' });
  if (invite.used) return res.status(410).json({ success: false, message: 'This invitation has already been used' });
  if (Date.now() > Number(invite.expiresAt || 0)) {
    return res.status(410).json({ success: false, message: 'This invitation has expired. Please ask for a new one.' });
  }
  const s = store.load().settings || {};
  res.json({
    success: true,
    data: { email: invite.email, role: invite.role, siteName: s.siteName || 'StudyMart', expiresAt: invite.expiresAt }
  });
});

router.post('/admin-invites/:token/accept', (req, res) => {
  const invite = findAdminInvite(req.params.token);
  if (!invite) return res.status(404).json({ success: false, message: 'Invalid invitation link' });
  if (invite.used) return res.status(410).json({ success: false, message: 'This invitation has already been used' });
  if (Date.now() > Number(invite.expiresAt || 0)) {
    return res.status(410).json({ success: false, message: 'This invitation has expired. Please ask for a new one.' });
  }
  const { username, name, password } = req.body || {};
  const cleanUser = String(username || '').trim();
  if (!cleanUser) return res.status(400).json({ success: false, message: 'Username is required' });
  if (store.findBy('admins', 'username', cleanUser)) {
    return res.status(409).json({ success: false, message: 'This username is already taken' });
  }
  if (store.all('admins').some(a => String(a.email || '').toLowerCase() === String(invite.email || '').toLowerCase())) {
    return res.status(409).json({ success: false, message: 'This email is already an admin' });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }
  const admin = store.insert('admins', {
    username: cleanUser,
    name: String(name || cleanUser).trim(),
    email: String(invite.email || '').toLowerCase(),
    password: auth.hashPassword(String(password)),
    role: invite.role === 'superadmin' ? 'superadmin' : 'admin',
    permissions: Array.isArray(invite.permissions) ? invite.permissions : []
  });
  store.update('adminInvites', invite.id, { used: true, usedAt: new Date().toISOString(), usedBy: cleanUser });
  res.status(201).json({ success: true, message: 'Welcome aboard! You can now log in to the admin panel.', data: { username: admin.username, email: admin.email } });
});

router.post('/coupons/validate', auth.optionalUser, (req, res) => {
  const { code, subtotal, items, email, phone, userId } = req.body || {};
  const sessionUser = req.session && req.session.role === 'user'
    ? { id: req.session.id, email: req.session.email, phone: req.session.phone }
    : null;
  const result = validateCoupon(code, Number(subtotal) || 0, items, couponBuyerOf({ email, phone, userId }, sessionUser));
  if (!result.valid) return res.status(400).json({ success: false, message: result.message });
  if (result.referral) {
    return res.json({
      success: true,
      message: 'Referral applied: ' + result.friendOff + '% off' + (result.referrerName ? ' (ref: ' + result.referrerName.split(' ')[0] + ')' : ''),
      data: { code: String(code || '').trim().toUpperCase(), discount: result.discount, type: 'referral', referral: true, referrerId: result.referrerId, friendOff: result.friendOff }
    });
  }
  res.json({
    success: true,
    message: 'Coupon applied: ' + result.coupon.code,
    data: { code: result.coupon.code, discount: result.discount, type: result.coupon.type }
  });
});

/* ---------- Auth (students) ---------- */
// Auth page uses ONE "Email or Mobile Number" field, so both are accepted here.
// BD mobiles are normalized to 01XXXXXXXXX. Mobile-only accounts get an
// internal placeholder email (phone@mobile.studymart) - phone is the real login.
function normalizeMobile(input) {
  let s = String(input || '').replace(/[\s-]/g, '');
  if (/^\+?8801\d{9}$/.test(s)) s = '01' + s.slice(-9);
  if (!/^01\d{9}$/.test(s)) return '';
  return s;
}

function findUserByIdentifier(ident) {
  const s = String(ident || '').trim();
  if (!s) return null;
  const sLower = s.toLowerCase();
  // 1. check exact or lowercase email
  if (s.includes('@')) {
    const byEmail = store.findBy('users', 'email', sLower);
    if (byEmail) return byEmail;
  }
  // 2. check phone (both raw and normalized)
  const ph = normalizeMobile(s);
  const byPhone = store.all('users').find(u => {
    const up = String(u.phone || '').trim();
    if (!up) return false;
    return up === s || (ph && normalizeMobile(up) === ph);
  });
  if (byPhone) return byPhone;

  // 3. Fallback: try by email anyway or username
  return store.findBy('users', 'email', sLower) ||
         store.findBy('users', 'username', sLower) ||
         null;
}

router.post('/auth/register', (req, res) => {
  const { name, email, phone, password, identifier } = req.body || {};
  let em = String(email || '').trim().toLowerCase();
  let ph = String(phone || '').trim();
  const ident = String(identifier || '').trim();
  if (ident) {
    if (ident.includes('@')) em = ident.toLowerCase();
    else ph = ident;
  }
  const pass = String(password || '').trim();
  if (!name || (!em && !ph) || !pass) {
    return res.status(400).json({ success: false, message: 'Name, email/mobile and password are required' });
  }
  if (pass.length < 4) {
    return res.status(400).json({ success: false, message: 'Password must be at least 4 characters' });
  }
  if (em) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address' });
    }
    if (store.findBy('users', 'email', em)) {
      return res.status(409).json({ success: false, message: 'This email is already registered' });
    }
  } else {
    ph = normalizeMobile(ph);
    if (!ph) {
      return res.status(400).json({ success: false, message: 'Enter a valid email or mobile number (01XXXXXXXXX)' });
    }
    if (store.all('users').some(u => {
      const up = normalizeMobile(u.phone);
      return up && up === ph;
    })) {
      return res.status(409).json({ success: false, message: 'This mobile number is already registered' });
    }
    em = ph + '@mobile.studymart'; // internal placeholder, login works via phone
  }
  const user = store.insert('users', {
    name: String(name).trim(),
    email: em,
    phone: ph ? normalizeMobile(ph) || String(ph) : '',
    password: auth.hashPassword(pass),
    role: 'student',
    status: 'active',
    referralCode: require('../referral').genCode(),
    walletBalance: 0
  });
  const token = auth.createSession({ id: user.id, role: 'user', name: user.name, email: user.email });
  try { require('../email').notifyWelcome(user); } catch (e) {}
  res.status(201).json({ success: true, message: 'Account created successfully', token, data: auth.publicUser(user) });
});

router.post('/auth/login', (req, res) => {
  const { email, password, identifier } = req.body || {};
  const ident = String(identifier || email || '').trim();
  const pass = String(password || '');
  if (!ident || !pass) {
    return res.status(400).json({ success: false, message: 'Email/Mobile and password are required' });
  }
  const user = findUserByIdentifier(ident);
  if (!user || (!auth.verifyPassword(pass, user.password) && !auth.verifyPassword(pass.trim(), user.password))) {
    return res.status(401).json({ success: false, message: 'Invalid email/mobile or password' });
  }
  if (user.status === 'blocked' || user.status === 'banned') {
    return res.status(403).json({ success: false, message: 'Your account has been banned/blocked. Please contact support.' });
  }
  const token = auth.createSession({ id: user.id, role: 'user', name: user.name, email: user.email });
  res.json({ success: true, message: 'Welcome back, ' + user.name.split(' ')[0], token, data: auth.publicUser(user) });
});

router.post('/auth/logout', (req, res) => {
  auth.destroySession(auth.getToken(req));
  res.json({ success: true, message: 'Logged out' });
});

// Google Sign-In: frontend sends the ID credential, we verify the signature
// with Google's certs and log the student in (auto-creates account on first use)
router.post('/auth/google', async (req, res) => {
  try {
    const settings = store.load().settings || {};
    if (!settings.googleLoginEnabled || !settings.googleClientId) {
      return res.status(400).json({ success: false, message: 'Google login is not enabled by admin' });
    }
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ success: false, message: 'Missing Google credential' });
    const { verifyGoogleIdToken } = require('../google');
    const g = await verifyGoogleIdToken(credential, String(settings.googleClientId).trim());
    let user = store.findBy('users', 'email', g.email);
    if (user && user.status === 'blocked') {
      return res.status(403).json({ success: false, message: 'This account has been blocked' });
    }
    let isNewGoogleUser = false;
    if (!user) {
      const crypto = require('crypto');
      user = store.insert('users', {
        name: g.name,
        email: g.email,
        phone: '',
        password: auth.hashPassword(crypto.randomBytes(24).toString('hex')), // unguessable; Google is the key
        avatar: g.picture || '',
        provider: 'google',
        role: 'student',
        status: 'active',
        referralCode: require('../referral').genCode(),
        walletBalance: 0
      });
      isNewGoogleUser = true;
    }
    const token = auth.createSession({ id: user.id, role: 'user', name: user.name, email: user.email });
    try { if (isNewGoogleUser) require('../email').notifyWelcome(user); } catch (e) {}
    res.json({ success: true, message: 'Welcome, ' + user.name.split(' ')[0], token, data: auth.publicUser(user) });
  } catch (err) {
    res.status(401).json({ success: false, message: err.message || 'Google verification failed' });
  }
});

router.get('/auth/me', auth.requireUser, (req, res) => {
  if (req.session.role === 'admin') {
    return res.json({ success: true, data: { role: 'admin', name: req.session.name } });
  }
  const user = store.find('users', req.session.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  try { require('../referral').ensureCode(user); } catch (e) {}
  res.json({ success: true, data: auth.publicUser(store.find('users', req.session.id) || user) });
});

/* ---------- Referral + Wallet (student) ---------- */
router.get('/my/referral/summary', auth.requireUser, (req, res) => {
  if (req.session.role !== 'user') return res.status(400).json({ success: false, message: 'Students only' });
  const ref = require('../referral');
  let user = store.find('users', req.session.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const code = ref.ensureCode(user);
  user = store.find('users', req.session.id) || user;
  const cfg = ref.refConfig();
  const st = ref.walletStats(user.id);
  const referralOrders = store.all('orders').filter(o =>
    String(o.referrerId) === String(user.id) && ['confirmed', 'completed'].includes(o.status));
  const referredBuyers = new Set(referralOrders.map(o => String(o.userId))).size;
  res.json({
    success: true,
    data: {
      enabled: cfg.enabled,
      code: code,
      wallet: ref.walletOf(user),
      friendOff: (typeof ref.userFriendOff === 'function') ? ref.userFriendOff(user) : cfg.friendOff,
      commissionPct: (typeof ref.userCommissionPct === 'function') ? ref.userCommissionPct(user) : cfg.commissionPct,
      minWithdraw: cfg.minWithdraw,
      stats: {
        earned: st.earned,
        withdrawn: st.withdrawn,
        spent: st.spent,
        pendingWithdraw: st.pendingWithdraw,
        referralOrders: referralOrders.length,
        referredBuyers: referredBuyers
      }
    }
  });
});

router.get('/my/referral/transactions', auth.requireUser, (req, res) => {
  if (req.session.role !== 'user') return res.status(400).json({ success: false, message: 'Students only' });
  const list = store.all('walletTxns')
    .filter(t => String(t.userId) === String(req.session.id))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 100);
  res.json({ success: true, data: list });
});

router.get('/my/referral/withdrawals', auth.requireUser, (req, res) => {
  if (req.session.role !== 'user') return res.status(400).json({ success: false, message: 'Students only' });
  const list = store.all('withdrawals')
    .filter(w => String(w.userId) === String(req.session.id))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 50);
  res.json({ success: true, data: list });
});

router.post('/my/referral/withdraw', auth.requireUser, (req, res) => {
  if (req.session.role !== 'user') return res.status(400).json({ success: false, message: 'Students only' });
  const ref = require('../referral');
  const cfg = ref.refConfig();
  if (!cfg.enabled) return res.status(400).json({ success: false, message: 'Referral system is currently off' });
  const user = store.find('users', req.session.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const amount = Math.floor(Number((req.body || {}).amount) || 0);
  const method = String((req.body || {}).method || '').toLowerCase();
  const account = String((req.body || {}).account || '').replace(/[\s-]/g, '');
  if (!['bkash', 'nagad', 'rocket'].includes(method)) {
    return res.status(400).json({ success: false, message: 'Payment method select koro (bKash / Nagad / Rocket)' });
  }
  if (!/^01\d{9}$/.test(account)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid account number (01XXXXXXXXX)' });
  }
  if (!(amount > 0)) return res.status(400).json({ success: false, message: 'Amount dite hobe' });
  if (amount < cfg.minWithdraw) {
    return res.status(400).json({ success: false, message: 'Minimum withdraw ৳' + cfg.minWithdraw });
  }
  if (amount > ref.walletOf(user)) {
    return res.status(400).json({ success: false, message: 'Wallet-e porjapto balance nai' });
  }
  const wd = store.insert('withdrawals', {
    userId: user.id,
    userName: user.name || '',
    amount: amount,
    method: method,
    account: account,
    status: 'pending',
    createdAt: new Date().toISOString()
  });
  ref.walletAdd(user.id, -amount, 'withdraw', 'Withdraw request (' + method + ')', { withdrawalId: wd.id });
  res.status(201).json({ success: true, message: 'Withdraw request sent! You will receive payment after admin approval.', data: wd });
});

/* ---------- Student profile: view is /auth/me, edit profile + change password ---------- */
router.put('/auth/profile', auth.requireUser, (req, res) => {
  if (req.session.role !== 'user') {
    return res.status(400).json({ success: false, message: 'Admins use the Admin Panel account settings' });
  }
  const user = store.find('users', req.session.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const { name, phone, avatar } = req.body || {};
  const data = {};
  if (name !== undefined) {
    const nm = String(name || '').trim();
    if (!nm) return res.status(400).json({ success: false, message: 'Name cannot be empty' });
    if (nm.length > 80) return res.status(400).json({ success: false, message: 'Name is too long (max 80 characters)' });
    data.name = nm;
  }
  if (phone !== undefined) {
    const raw = String(phone || '').trim();
    if (raw) {
      const ph = normalizeMobile(raw) || (/^01\d{9}$/.test(raw.replace(/[\s-]/g, '')) ? raw.replace(/[\s-]/g, '') : '');
      if (!ph) return res.status(400).json({ success: false, message: 'Enter a valid mobile number (01XXXXXXXXX)' });
      const taken = store.all('users').some(u => String(u.id) !== String(user.id) && String(u.phone || '').trim() && (String(u.phone).trim() === ph || normalizeMobile(u.phone) === ph));
      if (taken) return res.status(409).json({ success: false, message: 'This mobile number is already used by another account' });
      data.phone = ph;
    } else {
      data.phone = '';
    }
  }
  if (avatar !== undefined) {
    const av = String(avatar || '').trim();
    if (!av) {
      data.avatar = '';
    } else if (av.startsWith('data:')) {
      const saved = store.storeImage(av, 'avatar-' + user.id);
      // storeImage returns the original data-URL back if it could not save it
      if (typeof saved === 'string' && saved.startsWith('data:') && saved.length > 200000) {
        return res.status(400).json({ success: false, message: 'Photo is too large. Try a smaller image (max ~200KB after resize)' });
      }
      data.avatar = saved;
    } else if (/^(\/uploads\/|https?:\/\/)/.test(av) && av.length < 500) {
      data.avatar = av;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid photo format' });
    }
  }
  const updated = store.update('users', user.id, data);
  res.json({ success: true, message: 'Profile updated successfully', data: auth.publicUser(updated) });
});

router.put('/auth/password', auth.requireUser, (req, res) => {
  if (req.session.role !== 'user') {
    return res.status(400).json({ success: false, message: 'Admins use the Admin Panel account settings' });
  }
  const user = store.find('users', req.session.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Current password and new password are required' });
  }
  if (!auth.verifyPassword(String(currentPassword), user.password) && !auth.verifyPassword(String(currentPassword).trim(), user.password)) {
    return res.status(400).json({ success: false, message: 'Current password is incorrect' });
  }
  const np = String(newPassword).trim();
  if (np.length < 4) {
    return res.status(400).json({ success: false, message: 'New password must be at least 4 characters' });
  }
  if (String(currentPassword) === np) {
    return res.status(400).json({ success: false, message: 'New password must be different from the current one' });
  }
  const updated = store.update('users', user.id, { password: auth.hashPassword(np) });
  res.json({ success: true, message: 'Password changed successfully', data: auth.publicUser(updated) });
});

/* ---------- Orders (checkout) ---------- */
// Sequential human-readable order number: ORD-0001, ORD-0002, ...
// Legacy SM* numbers stay untouched; counter starts after existing orders.
function nextOrderNo() {
  const orders = store.all('orders');
  let max = 0;
  orders.forEach(o => {
    const m = String(o.orderNo || '').match(/^ORD-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  });
  max = Math.max(max, orders.length);
  let n = max + 1, no = '';
  for (;; n++) {
    no = 'ORD-' + String(n).padStart(4, '0');
    if (!orders.some(o => String(o.orderNo) === no)) return no;
  }
}
router.post('/orders', auth.requireUser, async (req, res) => {
  const { items, couponCode, phone, paymentMethod, note, walletPay } = req.body || {};
  // Login required: req.session is guaranteed by requireUser (user or admin)
  // Fresh DB record theke name/email/phone naw (session stale hote pare)
  let buyerId = req.session.id;
  let buyerName = req.session.name || '';
  let buyerEmail = req.session.email || '';
  let buyerPhone = phone || req.session.phone || '';
  try {
    const dbUser = store.find('users', req.session.id);
    if (dbUser) {
      buyerName = dbUser.name || buyerName;
      buyerEmail = dbUser.email || buyerEmail;
      buyerPhone = dbUser.phone || buyerPhone;
    }
  } catch (e) {}
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ success: false, message: 'Order must contain at least one item' });
  }
  const detailed = [];
  for (const raw of items) {
    const obj = (raw && typeof raw === 'object') ? raw : {};
    // E-book ID ar Course ID same number hote pare — explicit type thakle
    // sothik collection age lookup koro, nahole bhul item order hoye jabe
    if (obj.ebookId || obj.type === 'ebook') {
      const eid = obj.ebookId || obj.id || obj.courseId;
      const ebook = store.find('ebooks', eid);
      if (!ebook) return res.status(400).json({ success: false, message: 'Item not found: ' + eid });
      detailed.push({ ebookId: ebook.id, title: ebook.title, price: Number(ebook.price) || 0 });
      continue;
    }
    const id = typeof raw === 'object' ? (raw.id || raw.courseId || raw.ebookId) : raw;
    const course = store.find('courses', id);
    if (course) {
      detailed.push({ courseId: course.id, title: course.title, price: Number(course.price) || 0 });
      continue;
    }
    const ebook = store.find('ebooks', id);
    if (ebook) {
      detailed.push({ ebookId: ebook.id, title: ebook.title, price: Number(ebook.price) || 0 });
      continue;
    }
    return res.status(400).json({ success: false, message: 'Item not found: ' + id });
  }
  const subtotal = detailed.reduce((sum, i) => sum + i.price, 0);
  let discount = 0;
  let appliedCoupon = null;
  let referrerId = null;
  let referralCodeUsed = '';
  if (couponCode) {
    const check = validateCoupon(couponCode, subtotal, detailed, couponBuyerOf(
      { email: buyerEmail, phone: buyerPhone, userId: buyerId },
      { id: buyerId, email: buyerEmail, phone: buyerPhone }
    ));
    if (!check.valid) return res.status(400).json({ success: false, message: check.message });
    discount = check.discount;
    appliedCoupon = check.coupon || null;
    if (check.referral) {
      referrerId = check.referrerId;
      referralCodeUsed = String(couponCode || '').trim().toUpperCase();
    }
  }
  // Wallet payment (server authoritative — balance/amount re-check)
  let walletPaid = 0;
  try {
    const ref = require('../referral');
    const buyer = store.find('users', buyerId);
    const wantWallet = Math.floor(Number(walletPay) || 0);
    if (wantWallet > 0 && buyer) {
      walletPaid = Math.min(ref.walletOf(buyer), wantWallet, Math.max(0, subtotal - discount));
    }
  } catch (e) { walletPaid = 0; }
  const orderNo = nextOrderNo();
  const finalTotal = Math.max(0, subtotal - discount - walletPaid);
  const isFree = finalTotal <= 0;

  // Online payment-e panel valid email chay — order insert-er AGEI check
  // (nahole pending order + wallet deduct hoye jeto, pore gateway reject korto).
  // Mobile panel-e mandatory holeo gateway payload-e default fallback jay,
  // tai customer-ke phone-er jonno atkano hoy na.
  if (!isFree && String(paymentMethod || '') === 'piprapay') {
    const __bem = String(buyerEmail || '');
    const __hasRealEmail = !!(__bem && __bem.indexOf('@mobile.studymart') === -1);
    if (!__hasRealEmail) return res.status(400).json({ success: false, message: 'Online payment-er jonno valid email din (Profile theke jog korun)' });
  }

  const order = store.insert('orders', {
    orderNo,
    userId: buyerId,
    customer: {
      name: buyerName || 'Student',
      email: buyerEmail || '',
      phone: buyerPhone || ''
    },
    items: detailed,
    subtotal,
    discount,
    couponCode: appliedCoupon ? appliedCoupon.code : referralCodeUsed,
    referrerId: referrerId,
    referralCode: referralCodeUsed,
    referralDiscount: referrerId ? discount : 0,
    walletPaid: walletPaid,
    total: finalTotal,
    paymentMethod: isFree ? 'free' : (paymentMethod || 'manual'),
    note: note || '',
    status: isFree ? 'completed' : 'pending', // Price 0 -> INSTANT ENROLL & ACCESS!
    paidAt: isFree ? new Date().toISOString() : null
  });

  // Wallet deduct (order placement-e hold — cancel hole refund hobe)
  if (walletPaid > 0) {
    try { require('../referral').walletAdd(buyerId, -walletPaid, 'purchase', 'Order: ' + orderNo, { orderId: order.id }); } catch (e) {}
  }

  if (appliedCoupon && (isFree || paymentMethod !== 'piprapay')) {
    store.update('coupons', appliedCoupon.id, { used: Number(appliedCoupon.used || 0) + 1 });
  }

  // Notun order aslei admin-ke email alert (Notice page-e ON/OFF + address)
  try { require('../email').notifyAdminNewOrder(store.find('orders', order.id) || order); } catch (e) {}

  // Instant response for free orders (no gateway or manual approval needed)
  if (isFree) {
    try { auth.grantOrderAccess(store.find('orders', order.id) || order); } catch (e) {}
    try { require('../email').notifyOrder(store.find('orders', order.id) || order, 'completed'); } catch (e) {}
    return res.status(201).json({
      success: true,
      message: 'Free enrollment completed successfully.',
      data: order
    });
  }

  const wantOnline = paymentMethod === 'piprapay';
  if (wantOnline) {
    const settings = store.load().settings || {};
    if (!piprapay.isEnabled(settings)) {
      return res.status(400).json({ success: false, message: 'Online payment is not enabled right now. Please choose manual payment.' });
    }
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    const siteBase = proto + '://' + req.get('host');
    try {
      const charge = await piprapay.createCharge(settings, {
        fullName: order.customer.name,
        emailMobile: order.customer.email || order.customer.phone,
        email: String(order.customer.email || ''),
        phone: String(order.customer.phone || ''),
        amount: order.total,
        invoiceId: orderNo,
        redirectUrl: siteBase + '/payment-success.html?order=' + encodeURIComponent(orderNo),
        cancelUrl: siteBase + '/cart.html',
        returnType: 'GET',
        webhookUrl: siteBase + '/api/public/payments/piprapay/webhook'
      });
      store.update('orders', order.id, { pp_id: charge.pp_id, paymentUrl: charge.pp_url });
      try { require('../email').notifyOrder(store.find('orders', order.id) || order, 'pending'); } catch (e) {}
      return res.status(201).json({
        success: true,
        message: 'Redirecting to payment...',
        data: { order: store.find('orders', order.id), pp_id: charge.pp_id, pp_url: charge.pp_url }
      });
    } catch (e) {
      return res.status(400).json({ success: false, message: e.message || 'Payment gateway error. Please try again.' });
    }
  }
  res.status(201).json({ success: true, message: 'Order placed successfully. Order No: ' + orderNo, data: order });
  try { require('../email').notifyOrder(order, 'pending'); } catch (e) {}
});

/* ---------- PipaPay: verify + webhook ---------- */
function markPipraPaid(order, tx, ppId) {
  store.update('orders', order.id, {
    status: 'confirmed',
    paidAt: new Date().toISOString(),
    gateway: (tx && tx.gateway) || 'piprapay',
    transactionId: (tx && tx.transaction_id) || String(ppId || '')
  });
  if (order.couponCode) {
    const cp = store.findBy('coupons', 'code', order.couponCode);
    if (cp) store.update('coupons', cp.id, { used: Number(cp.used || 0) + 1 });
  }
  try { auth.grantOrderAccess(store.find('orders', order.id) || order); } catch (e) {}
  try { require('../referral').grantCommission(store.find('orders', order.id) || order); } catch (e) {}
  try { require('../email').notifyOrder(store.find('orders', order.id) || order, 'confirmed'); } catch (e) {}
  return store.find('orders', order.id);
}

router.post('/payments/piprapay/verify', async (req, res) => {
  const { orderNo, pp_id } = req.body || {};
  if (!orderNo && !pp_id) {
    return res.status(400).json({ success: false, message: 'Order reference missing' });
  }
  let order = orderNo ? store.findBy('orders', 'orderNo', String(orderNo)) : null;
  if (!order && pp_id) order = store.findBy('orders', 'pp_id', String(pp_id));
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  if (order.status === 'confirmed' || order.status === 'completed') {
    return res.json({ success: true, message: 'Payment already verified', data: { order, alreadyPaid: true } });
  }
  const settings = store.load().settings || {};
  try {
    const tx = await piprapay.verifyPayment(settings, pp_id || order.pp_id);
    const status = String(tx.status || '').toLowerCase();
    if (status !== 'completed') {
      return res.json({ success: false, message: 'Payment not completed yet (status: ' + (tx.status || 'unknown') + ')', data: { order } });
    }
    const metaInv = tx.metadata && (tx.metadata.invoice_id || tx.metadata.invoiceId);
    if (metaInv && String(metaInv) !== String(order.orderNo)) {
      return res.status(400).json({ success: false, message: 'Invoice mismatch. Contact support.' });
    }
    const paidAmt = Number(tx.total || tx.amount || 0);
    if (Math.abs(paidAmt - Number(order.total)) > 1) {
      return res.status(400).json({ success: false, message: 'Paid amount does not match order total. Contact support.' });
    }
    const fresh = markPipraPaid(order, tx, pp_id || order.pp_id);
    return res.json({ success: true, message: 'Payment verified successfully', data: { order: fresh } });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message || 'Verification failed' });
  }
});

router.post('/payments/piprapay/webhook', async (req, res) => {
  try {
    const body = req.body || {};
    const ppId = body.pp_id || body.ppId || (body.data && body.data.pp_id);
    if (!ppId) return res.json({ received: true });
    const settings = store.load().settings || {};
    const tx = await piprapay.verifyPayment(settings, ppId);
    if (String(tx.status || '').toLowerCase() !== 'completed') return res.json({ received: true });
    const metaInv = tx.metadata && (tx.metadata.invoice_id || tx.metadata.invoiceId);
    let order = (metaInv && store.findBy('orders', 'orderNo', String(metaInv))) || store.findBy('orders', 'pp_id', String(ppId));
    if (!order) return res.json({ received: true });
    if (order.status !== 'confirmed' && order.status !== 'completed') markPipraPaid(order, tx, ppId);
    return res.json({ received: true });
  } catch (e) {
    return res.json({ received: true });
  }
});

router.get('/my/orders', auth.requireUser, (req, res) => {
  const user = store.find('users', req.session.id);
  const userEmail = user && user.email ? user.email.toLowerCase() : '';
  const userPhone = user && user.phone ? normalizeMobile(user.phone) : '';
  const orders = store.all('orders').filter(o => {
    if (String(o.userId) === String(req.session.id)) return true;
    if (userEmail && o.email && String(o.email).toLowerCase() === userEmail) return true;
    if (userPhone && o.phone && normalizeMobile(o.phone) === userPhone) return true;
    return false;
  });
  res.json({ success: true, count: orders.length, data: orders.slice().reverse() });
});

/* ---------- E-books (alada E-Book Batch system; purono course-batch fallback soho) ---------- */
function enrichEbook(ebook) {
  // notun system age: ebookBatchId -> ebookBatches
  const ebBatch = ebook.ebookBatchId ? store.find('ebookBatches', ebook.ebookBatchId) : null;
  // purono data fallback: batchId -> course batches
  const batch = ebBatch || (ebook.batchId ? store.find('batches', ebook.batchId) : null);
  const category = store.find('categories', ebook.categoryId);
  return Object.assign({}, ebook, {
    ebookBatchId: ebook.ebookBatchId || '',
    ebookBatchName: ebBatch ? ebBatch.name : '',
    ebookBatchSlug: ebBatch ? ebBatch.slug : '',
    ebookBatchColor: ebBatch ? ebBatch.color : '#0EA5E9',
    batchName: batch ? batch.name : '',
    batchSlug: batch ? batch.slug : '',
    batchColor: batch ? batch.color : '#4F46E5',
    batchOrder: batch ? (Number(batch.order) || 999) : 999,
    categoryName: category ? category.name : '',
    categorySlug: category ? category.slug : ''
  });
}

router.get('/ebooks', (req, res) => {
  let list = activeOnly(store.all('ebooks')).map(enrichEbook);
  const { batch, batchId, category, categoryId, ebookBatch, ebookBatchId, q, sort } = req.query;
  if (batch) list = list.filter(e => String(e.batchSlug).toLowerCase() === String(batch).toLowerCase());
  if (batchId) list = list.filter(e => String(e.batchId) === String(batchId));
  if (ebookBatch) list = list.filter(e => String(e.ebookBatchSlug).toLowerCase() === String(ebookBatch).toLowerCase());
  if (ebookBatchId) list = list.filter(e => String(e.ebookBatchId) === String(ebookBatchId));
  if (category) list = list.filter(e => String(e.categorySlug).toLowerCase() === String(category).toLowerCase());
  if (categoryId) list = list.filter(e => String(e.categoryId) === String(categoryId));
  if (q) {
    const term = String(q).toLowerCase();
    list = list.filter(e => (e.title + ' ' + (e.details || '') + ' ' + (e.author || '')).toLowerCase().includes(term));
  }
  if (String(sort || '').toLowerCase() === 'popular') {
    list = list.slice().sort((a, b) => (Number(b.downloads) || 0) - (Number(a.downloads) || 0));
  }
  const paged = store.paginate(list, req.query);
  res.json(Object.assign({ success: true, count: paged.total, data: paged.items }, paged));
});

router.get('/ebooks/:idOrSlug', (req, res) => {
  const key = req.params.idOrSlug;
  const ebook = store.find('ebooks', key) || store.all('ebooks').find(e => e.slug === key);
  if (!ebook) return res.status(404).json({ success: false, message: 'E-book not found' });
  res.json({ success: true, data: enrichEbook(ebook) });
});

// Download: free books redirect directly; paid books need a confirmed order.
// (Plain link navigation carries no login token, so paid files are issued
// as random unguessable URLs via the gated /api/my/... endpoint below.)
router.get('/ebooks/:idOrSlug/download', (req, res) => {
  const key = req.params.idOrSlug;
  const ebook = store.find('ebooks', key) || store.all('ebooks').find(e => e.slug === key);
  if (!ebook) return res.status(404).json({ success: false, message: 'E-book not found' });
  if (Number(ebook.price) > 0) {
    return res.status(403).json({ success: false, message: 'Please buy this e-book first to download' });
  }
  const target = ebook.fileUrl || ebook.linkUrl;
  if (!target) return res.status(404).json({ success: false, message: 'No file attached yet' });
  store.update('ebooks', ebook.id, { downloads: Number(ebook.downloads || 0) + 1 });
  return res.redirect(target);
});

function hasEbook(userId, ebookId) {
  if (!userId || !ebookId) return false;
  return store.all('orders').some(o =>
    String(o.userId) === String(userId) &&
    ['confirmed', 'completed'].includes(o.status) &&
    Array.isArray(o.items) && o.items.some(i => String(i.ebookId) === String(ebookId))
  );
}

// Has the logged-in student bought this e-book?
router.get('/my/ebooks/:id/access', auth.requireUser, (req, res) => {
  const ebook = store.find('ebooks', req.params.id);
  if (!ebook) return res.status(404).json({ success: false, message: 'E-book not found' });
  const free = !(Number(ebook.price) > 0);
  const purchased = free || req.session.role === 'admin' || hasEbook(req.session.id, ebook.id);
  res.json({ success: true, data: { ebookId: ebook.id, free, purchased } });
});

// Gated file issue for paid e-books (called via fetch WITH login token)
router.get('/my/ebooks/:id/download', auth.requireUser, (req, res) => {
  const ebook = store.find('ebooks', req.params.id);
  if (!ebook) return res.status(404).json({ success: false, message: 'E-book not found' });
  const target = ebook.fileUrl || ebook.linkUrl;
  if (!target) return res.status(404).json({ success: false, message: 'No file attached yet' });
  if (Number(ebook.price) > 0 && req.session.role !== 'admin' && !hasEbook(req.session.id, ebook.id)) {
    return res.status(403).json({ success: false, message: 'Please buy this e-book first to download' });
  }
  store.update('ebooks', ebook.id, { downloads: Number(ebook.downloads || 0) + 1 });
  res.json({ success: true, data: { fileUrl: target, fileName: ebook.fileName || (ebook.title + '.pdf') } });
});

/* ---------- Public curriculum (titles only - safe for guests) ---------- */
router.get('/courses/:idOrSlug/curriculum', (req, res) => {
  const key = req.params.idOrSlug;
  const course = store.find('courses', key) || store.all('courses').find(c => c.slug === key);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const lessons = safeLessons(course.id);
  const structure = courseStructure(course.id);
  res.json({ success: true, data: { courseId: course.id, hasPreview: !!course.previewVideoId, lessons, structure, nodeResources: nodeResourcesOut(course, false), stepLabels: store.resolveStepLabels(course), steps: store.resolveSteps(course) } });
});

router.get('/courses/:idOrSlug/structure', (req, res) => {
  const key = req.params.idOrSlug;
  const course = store.find('courses', key) || store.all('courses').find(c => c.slug === key);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  res.json({ success: true, data: { courseId: course.id, structure: courseStructure(course.id), lessons: safeLessons(course.id), nodeResources: nodeResourcesOut(course, false), stepLabels: store.resolveStepLabels(course), steps: store.resolveSteps(course) } });
});

/* ---------- Student Enrolled Courses ---------- */
router.get('/my/courses', auth.requireUser, (req, res) => {
  res.json({ success: true, data: getUserEnrolledCourses(req.session.id) });
});

/* ---------- Gated course content (private videos) ----------
 * Video IDs live ONLY here. The public site never sees raw links.
 * - Free-preview classes: playable by anyone (no login needed)
 * - Paid classes: only students with a confirmed/completed order
 * - Telegram group link: only enrolled students */
router.get('/my/courses/:id/access', auth.requireUser, async (req, res) => {
  const course = store.find('courses', req.params.id);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const enrolled = req.session.role === 'admin' || hasEnrollment(req.session.id, course.id);
  if (!enrolled) {
    const ls = safeLessons(course.id);
    const st = courseStructure(course.id);
    return res.json({
      success: true,
      data: { courseId: course.id, enrolled: false, hasPreview: !!course.previewVideoId, telegramLink: '', telegramGroups: [], lessons: ls, structure: st, nodeResources: nodeResourcesOut(course, false) }
    });
  }
  // Static multi links (purono single link soho, backward compat)
  const staticGroups = [];
  const seen = new Set();
  (Array.isArray(course.telegramLinks) ? course.telegramLinks : []).forEach((x, i) => {
    const url = x && (x.url || x.link);
    if (!url || seen.has(String(url).toLowerCase())) return;
    seen.add(String(url).toLowerCase());
    staticGroups.push({ label: (x && x.label) || ('Channel ' + (i + 1)), url: String(url), type: 'static' });
  });
  if (course.telegramLink && !seen.has(String(course.telegramLink).toLowerCase())) {
    staticGroups.push({ label: 'Main Channel', url: String(course.telegramLink), type: 'static' });
  }
  // Dynamic single-use invites (order approve-er por auto-generate, na thakle ekhanei banay)
  let dynamicGroups = [];
  try {
    dynamicGroups = await getMyInvites(req.session.id, course);
  } catch (e) { dynamicGroups = []; }
  const telegramGroups = staticGroups.concat(dynamicGroups);
  const chatIds = Array.isArray(course.telegramChatIds) ? course.telegramChatIds : [];
  // Enrolled hole lesson resources-er asol URL soho pathaw (gated — public-e sudhu label jay)
  const ls2 = safeLessons(course.id).map(sl => {
    try {
      const full = store.find('lessons', sl.id);
      sl.resources = fullResources(full || {});
    } catch (e) { sl.resources = []; }
    return sl;
  });
  const st2 = courseStructure(course.id);
  res.json({
    success: true,
    data: {
      courseId: course.id,
      enrolled,
      hasPreview: !!course.previewVideoId,
      telegramLink: telegramGroups.length ? telegramGroups[0].url : '', // purono frontend-er jonno
      telegramGroups,
      canRefresh: chatIds.length > 0, // Group ID thakle student nije notun invite nite parbe
      lessons: ls2,
      structure: st2,
      nodeResources: nodeResourcesOut(course, true)
    }
  });
});

/* ---------- Course + tar sob class-er Group IDs (merged — class-level ID-eo auto invite) ---------- */
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

/* ---------- Student nije notun invite ney ----------
 * Single-use link ekbar join korlei expired hoy (Telegram-er niyom — share
 * atkatei eita). Join korar por abar dhukte chaile ba link expired dekhale
 * student ekhan theke notun link nite parbe. Cooldown 5 min (spam rodh). */
router.post('/my/courses/:id/invite', auth.requireUser, async (req, res) => {
  const course = store.find('courses', req.params.id);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const enrolled = req.session.role === 'admin' || hasEnrollment(req.session.id, course.id);
  if (!enrolled) return res.status(403).json({ success: false, message: 'Please enroll first' });
  const cid = String(course.id);
  const orders = store.all('orders').filter(o =>
    String(o.userId) === String(req.session.id) &&
    ['confirmed', 'completed'].includes(o.status) &&
    Array.isArray(o.items) && o.items.some(i => String(i.courseId) === cid)
  );
  if (!orders.length) return res.status(400).json({ success: false, message: 'No approved order found' });
  const order = orders[orders.length - 1];
  const chatIds = courseAllChatIds(course);
  if (!chatIds.length) return res.status(400).json({ success: false, message: 'Ei course-e auto invite set kora nai' });
  const last = Number(order.telegramInviteAt || 0);
  const left = 5 * 60 * 1000 - (Date.now() - last);
  if (left > 0) {
    return res.status(429).json({ success: false, message: 'Ektu wait koro — ' + Math.ceil(left / 1000) + 's por abar try koro' });
  }
  try {
    const telegram = require('../telegram');
    if (!telegram.getBotToken()) {
      return res.status(500).json({ success: false, message: 'Telegram bot connect kora nai — admin-er sathe contact koro' });
    }
    const invites = await telegram.createMultiInvites(chatIds, order.orderNo || order.id);
    const good = invites.filter(x => x.inviteLink);
    if (!good.length) {
      const err = (invites[0] && invites[0].error) || 'Invite banano jayni';
      return res.status(500).json({ success: false, message: err });
    }
    const prev = (order.telegramInvites && typeof order.telegramInvites === 'object') ? order.telegramInvites : {};
    prev[cid] = invites;
    store.update('orders', order.id, { telegramInvites: prev, telegramInviteAt: Date.now() });
    res.json({
      success: true, message: 'Notun invite link ready!',
      data: { telegramGroups: good.map(x => ({ label: x.label || 'Private Group', url: x.inviteLink, type: 'invite', chatId: x.chatId })) }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message || 'Invite banano jayni' });
  }
});

/* Student-er confirmed order theke invite ber kore, na thakle same Bot token diye banay.
 * Admin pore notun Group ID add korle sudhu missing gulor invite baniye ager
 * gulor sathe merge kore — tai sob group-er button eksathe show kore. */
async function getMyInvites(userId, course) {
  const cid = String(course.id);
  const orders = store.all('orders').filter(o =>
    String(o.userId) === String(userId) &&
    ['confirmed', 'completed'].includes(o.status) &&
    Array.isArray(o.items) && o.items.some(i => String(i.courseId) === cid)
  );
  if (!orders.length) return [];
  // sobcheye recent order-er invite naw
  const order = orders[orders.length - 1];
  const saved = order.telegramInvites && order.telegramInvites[cid];
  const savedList = Array.isArray(saved) ? saved.filter(x => x && x.inviteLink) : [];
  const savedByChat = {};
  savedList.forEach(x => { savedByChat[String(x.chatId || '').trim()] = x; });
  const chatIds = courseAllChatIds(course);
  const chatIdOf = x => String((x && typeof x === 'object' ? (x.chatId || x.id) : x) || '').trim();
  // Admin pore add kora group (saved-e nai) -> sudhu ogular invite banaw
  const missing = chatIds.filter(x => { const id = chatIdOf(x); return id && !savedByChat[id]; });
  let merged = savedList.slice();
  if (missing.length) {
    try {
      const telegram = require('../telegram');
      if (telegram.getBotToken()) {
        const fresh = await telegram.createMultiInvites(missing, order.orderNo || order.id);
        const good = fresh.filter(x => x.inviteLink);
        const prev = (order.telegramInvites && typeof order.telegramInvites === 'object') ? order.telegramInvites : {};
        prev[cid] = savedList.concat(fresh);
        store.update('orders', order.id, { telegramInvites: prev });
        merged = merged.concat(good);
      }
    } catch (e) { /* notun group-er invite fail hole ager gulai return hobe */ }
  }
  return merged.map(x => ({ label: x.label || 'Private Group', url: x.inviteLink, type: 'invite', chatId: x.chatId }));
}

// Secure player URL for ONE class (or the free intro preview)
router.get('/my/lessons/:id/watch', auth.optionalUser, async (req, res) => {
  const lesson = req.query.preview === '1' ? null : store.find('lessons', req.params.id);
  const session = req.session;
  const me = session && (session.role === 'user' || session.role === 'admin')
    ? (session.role === 'admin' ? { name: session.name || 'Admin', email: '' } : store.find('users', session.id))
    : null;

  // Free intro preview video of a course (no login needed)
  if (req.query.preview === '1') {
    const course = store.find('courses', req.params.id);
    if (!course || !course.previewVideoId) {
      return res.status(404).json({ success: false, message: 'No preview video for this course' });
    }
    return res.json({
      success: true,
      data: {
        title: course.title + ' (Preview)',
        embedUrl: 'https://www.youtube-nocookie.com/embed/' + course.previewVideoId + '?rel=0',
        watermark: me ? (me.name || me.email || '') : ''
      }
    });
  }

  if (!lesson) return res.status(404).json({ success: false, message: 'Class not found' });
  // Watch-er sathe oi class-er chapter/section-er sheet-gulo PATH GROUP hisebe jay
  // (flat-merge na — player-e kon sheet kon level-er ta header soho dekhabe)
  const watchCourse = store.find('courses', lesson.courseId);
  const mergedResources = () => fullResources(lesson);
  const nodeSheets = () => (watchCourse ? ancestorNodeGroups(watchCourse, lesson, true) : []);
  // Class-level telegram (gated — sudhu enrolled/admin dekhbe, free class-eo guest pabe na)
  const viewerEnrolled = (session && session.role === 'admin') || (me && hasEnrollment(session.id, lesson.courseId));
  const lessonTg = [];
  const seenL = new Set();
  const pushStatic = (arr) => {
    (Array.isArray(arr) ? arr : []).forEach((x, i) => {
      const url = x && (x.url || x.link);
      if (!url || seenL.has(String(url).toLowerCase())) return;
      seenL.add(String(url).toLowerCase());
      lessonTg.push({ label: (x && x.label) || ('Channel ' + (i + 1)), url: String(url), type: 'static' });
    });
  };
  if (viewerEnrolled) {
    pushStatic(lesson.telegramLinks);
    // Section / Chapter maps (course doc theke)
    try {
      const course0 = store.find('courses', lesson.courseId);
      if (course0) {
        const secName = lesson.subject || 'General';
        const chapName = lesson.section || lesson.chapter || 'Chapter 1';
        const secEntry = course0.sectionTg && course0.sectionTg[secName];
        const chapEntry = course0.chapterTg && course0.chapterTg[secName + '||' + chapName];
        if (secEntry) pushStatic(secEntry.links);
        if (chapEntry) pushStatic(chapEntry.links);
      }
    } catch (e) {}
    if (session && session.role !== 'admin' && me) {
      try {
        const course = store.find('courses', lesson.courseId);
        if (course) {
          const allInv = await getMyInvites(session.id, course);
          const want = new Set();
          const collectIds = (arr) => (Array.isArray(arr) ? arr : []).forEach(x => {
            const id = String((x && typeof x === 'object' ? (x.chatId || x.id) : x) || '').trim();
            if (id) want.add(id);
          });
          collectIds(lesson.telegramChatIds);
          const secName2 = lesson.subject || 'General';
          const chapName2 = lesson.section || lesson.chapter || 'Chapter 1';
          const secEntry2 = course.sectionTg && course.sectionTg[secName2];
          const chapEntry2 = course.chapterTg && course.chapterTg[secName2 + '||' + chapName2];
          if (secEntry2) collectIds(secEntry2.ids);
          if (chapEntry2) collectIds(chapEntry2.ids);
          allInv.forEach(iv => { if (want.has(String(iv.chatId || '').trim())) lessonTg.push(iv); });
        }
      } catch (e) { /* invite fail hole static gulai jabe */ }
    }
  }
  // Free-preview class: open for everyone (class sheet + path-grouped chapter/section sheet)
  if (lesson.isFree) {
    return res.json({
      success: true,
      data: Object.assign({
        title: lesson.title,
        watermark: me ? (me.name || me.email || '') : '',
        resources: mergedResources(),
        nodeSheets: nodeSheets(),
        telegramGroups: lessonTg
      }, lessonVideoPayload(lesson))
    });
  }
  // Paid class: must be logged in + enrolled
  if (!me) return res.status(401).json({ success: false, message: 'Please login and enroll to watch this class' });
  const enrolled = session.role === 'admin' || hasEnrollment(session.id, lesson.courseId);
  if (!enrolled) return res.status(403).json({ success: false, message: 'This class is locked. Please enroll first.' });
  res.json({
    success: true,
    data: Object.assign({
      title: lesson.title,
      watermark: me.name || me.email || '',
      resources: mergedResources(),
      nodeSheets: nodeSheets(),
      telegramGroups: lessonTg
    }, lessonVideoPayload(lesson))
  });
});

/* ---------- Public counters ---------- */
router.get('/stats', (req, res) => {
  res.json({
    success: true,
    data: {
      totalCourses: activeOnly(store.all('courses')).length,
      totalStudents: store.all('users').length,
      totalBatches: activeOnly(store.all('batches')).length,
      totalOrders: store.all('orders').length
    }
  });
});

module.exports = router;
