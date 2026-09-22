// Admin panel / CMS API + teacher tools. Everything here is permission-gated per role.
import { Router } from 'express';
import { all, get, run, insert, update, parse, tx } from '../db.js';
import { requireAuth, requirePerm, can, hashPassword, normalizePhone } from '../auth.js';
import { RESOURCES, REF_LABEL } from '../resources.js';
import { RULE_TAGS } from '../constants.js';
import {
  WORKFLOW_TABLES, checkTransition, scheduleReindex, notify, notifyMany, courseTree, accessibleCourseIds, localDate, utcToLocalDate,
} from '../services.js';
import { contentUpload, fileUrl } from '../uploads.js';
import { youtubeId } from '../youtube.js';

export const admin = Router();
export const teach = Router();
admin.use(requireAuth);
teach.use(requireAuth);

const staffOnly = (req, res, next) => (req.user.role === 'student' ? res.status(403).json({ error: 'Рұқсат жоқ' }) : next());
admin.use(staffOnly);
teach.use(staffOnly);

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const resOf = (name) => RESOURCES[name];
const CONTENT_SKIP = new Set(['sort', 'duration_min']); // edits to these do not trigger re-review

admin.get('/meta', (req, res) => {
  const visible = Object.fromEntries(Object.entries(RESOURCES).filter(([, r]) => can(req.user, r.perm)).map(([k, r]) => [k, { label: r.label, fields: r.fields, workflow: !!r.workflow, parent: r.parent, perm: r.perm }]));
  res.json({ resources: visible, permissions: req.user.role === 'admin' ? ['*'] : undefined });
});

// ---- helpers for generic CRUD ----
function toDb(resource, body, { creating }) {
  const out = {}; const errors = [];
  for (const f of resource.fields) {
    if (!(f.name in body)) continue;
    if (f.createOnly && !creating) continue;
    let v = body[f.name];
    switch (f.type) {
      case 'number': v = v === '' || v == null ? null : Number(v); if (v != null && Number.isNaN(v)) errors.push(`${f.label}: сан болуы керек`); break;
      case 'ref': v = v === '' || v == null ? null : Number(v); break;
      case 'bool': v = v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0; break;
      case 'select': v = v === '' || v == null ? null : (f.name === 'weekday' ? Number(v) : String(v)); break;
      case 'lines': v = JSON.stringify((Array.isArray(v) ? v : String(v || '').split('\n')).map((s) => String(s).trim()).filter(Boolean)); break;
      case 'examples': v = JSON.stringify((Array.isArray(v) ? v : String(v || '').split('\n').map((line) => { const [ar, ...note] = line.split('|'); return { ar: ar?.trim(), note: note.join('|').trim() }; })).filter((x) => x.ar)); break;
      case 'youtube': v = String(v || '').trim() || null; if (v && !youtubeId(v)) errors.push(`${f.label}: YouTube сілтемесі танылмады`); break;
      case 'password': if (v) { if (String(v).length < 6) errors.push('Құпиясөз кемінде 6 таңба'); out.password_hash = hashPassword(String(v)); } continue;
      case 'answers': {
        const a = typeof v === 'string' ? parse(v, {}) : (v || {});
        if (resource.table === 'questions') {
          const type = body.type;
          out.options = JSON.stringify(type === 'match' ? { pairs: a.pairs || [] } : (a.options ?? null));
          out.answer = JSON.stringify(a.answer ?? null);
        } else out.data = JSON.stringify(a);
        continue;
      }
      default: v = v == null ? null : String(v);
    }
    if (f.required && (v == null || v === '')) errors.push(`${f.label} толтырылуы керек`);
    out[f.name] = v;
  }
  if (resource.table === 'users') {
    if ('email' in out) out.email = out.email ? out.email.trim().toLowerCase() : null;
    if ('phone' in out) out.phone = out.phone ? normalizePhone(out.phone) : null;
  }
  return { out, errors };
}

function fromDb(resource, row) {
  if (!row) return row;
  const o = { ...row };
  delete o.password_hash;
  for (const f of resource.fields) {
    if (f.type === 'lines' || f.type === 'examples') o[f.name] = parse(o[f.name], []);
    if (f.type === 'answers') {
      if (resource.table === 'questions') { const opt = parse(row.options); o.options = { options: Array.isArray(opt) ? opt : null, pairs: opt?.pairs, answer: parse(row.answer) }; }
      else o.data = parse(row.data, {});
    }
  }
  return o;
}

const guardUser = (req, target, next) => {
  if (req.user.role === 'admin') return null;
  if (target && target.role !== 'student') return 'Куратор тек оқушылар аккаунтын басқара алады';
  if (next?.role && next.role !== 'student') return 'Куратор тек оқушы рөлін бере алады';
  return null;
};

function afterContentChange(resource, id, beforeRow, changed) {
  // editing verified religious content sends it back to review (Draft → Review → Approved → Published)
  const contentChanged = Object.keys(changed).some((k) => !CONTENT_SKIP.has(k) && String(changed[k] ?? '') !== String(beforeRow?.[k] ?? ''));
  if (resource.workflow && beforeRow && ['approved', 'published'].includes(beforeRow.status) && contentChanged) {
    run("UPDATE " + resource.table + " SET status = 'review', reviewed_by = NULL, reviewed_at = NULL WHERE id = ?", id);
    return 'review';
  }
  if (resource.parentWorkflow && contentChanged) {
    const parentId = changed[resource.parent] ?? beforeRow?.[resource.parent];
    run(`UPDATE ${resource.parentWorkflow} SET status = 'review', reviewed_by = NULL, reviewed_at = NULL WHERE id = ? AND status IN ('approved','published')`, parentId);
  }
  return null;
}

// ---- generic CRUD ----
admin.get('/r/:res', (req, res) => {
  const R = resOf(req.params.res);
  if (!R) return bad(res, 'Белгісіз ресурс', 404);
  if (!can(req.user, R.perm)) return bad(res, 'Рұқсат жоқ', 403);
  const where = []; const p = [];
  for (const f of R.fields) {
    if (req.query[f.name] !== undefined && req.query[f.name] !== '' && ['ref', 'select', 'number', 'bool'].includes(f.type)) { where.push(`${f.name} = ?`); p.push(req.query[f.name]); }
  }
  if (R.workflow && req.query.status) { where.push('status = ?'); p.push(req.query.status); }
  if (req.query.q && R.search) { where.push('(' + R.search.map((c) => `${c} LIKE ?`).join(' OR ') + ')'); R.search.forEach(() => p.push(`%${req.query.q}%`)); }
  const limit = Math.min(Number(req.query.limit) || 100, 500); const offset = Number(req.query.offset) || 0;
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = get(`SELECT count(*) n FROM ${R.table} ${w}`, ...p).n;
  let rows = all(`SELECT * FROM ${R.table} ${w} ORDER BY ${R.order || 'id'} LIMIT ${limit} OFFSET ${offset}`, ...p).map((x) => fromDb(R, x));
  if (R.table === 'users') rows = rows.map(decorateUser);
  res.json({ total, rows });
});

function decorateUser(u) {
  if (u.role !== 'student') return u;
  const trees = accessibleCourseIds(u).map((id) => courseTree(u, id));
  const t = trees.reduce((a, x) => ({ total: a.total + x.total, done: a.done + x.done }), { total: 0, done: 0 });
  const last = get(`SELECT max(created_at) t FROM activity WHERE user_id = ?`, u.id)?.t;
  const groups = all('SELECT g.name FROM group_members gm JOIN groups g ON g.id = gm.group_id WHERE gm.user_id = ?', u.id).map((g) => g.name);
  return { ...u, progress: t.total ? Math.round((t.done / t.total) * 100) : 0, last_active: last, groups };
}

admin.get('/r/:res/:id', (req, res) => {
  const R = resOf(req.params.res);
  if (!R || !can(req.user, R.perm)) return bad(res, 'Рұқсат жоқ', 403);
  const row = get(`SELECT * FROM ${R.table} WHERE id = ?`, req.params.id);
  if (!row) return bad(res, 'Табылмады', 404);
  const out = fromDb(R, row);
  if (R.workflow && row.reviewed_by) out.reviewer = get('SELECT name FROM users WHERE id = ?', row.reviewed_by)?.name;
  res.json(out);
});

admin.post('/r/:res', (req, res) => {
  const R = resOf(req.params.res);
  if (!R || !can(req.user, R.perm)) return bad(res, 'Рұқсат жоқ', 403);
  const { out, errors } = toDb(R, req.body || {}, { creating: true });
  for (const f of R.fields) if (f.default !== undefined && out[f.name] === undefined) out[f.name] = f.default;
  if (R.table === 'users') {
    const e = guardUser(req, null, out); if (e) return bad(res, e, 403);
    if (!out.password_hash) errors.push('Құпиясөз толтырылуы керек');
    if (!out.email && !out.phone) errors.push('Email немесе телефон қажет');
  }
  if (R.table === 'exercises' && !out.lesson_id && !out.topic_id) errors.push('Сабақты немесе тақырыпты таңдаңыз');
  if (errors.length) return bad(res, errors.join('. '));
  if (R.workflow) out.status = 'draft';
  try {
    const id = insert(R.table, out);
    if (R.parentWorkflow) afterContentChange(R, id, null, out);
    scheduleReindex();
    res.json(fromDb(R, get(`SELECT * FROM ${R.table} WHERE id = ?`, R.manualId ? out.id : id)));
  } catch (e) {
    bad(res, /UNIQUE/.test(e.message) ? 'Мұндай жазба бұрыннан бар (email/телефон/нөмір қайталанбауы керек)' : e.message);
  }
});

admin.put('/r/:res/:id', (req, res) => {
  const R = resOf(req.params.res);
  if (!R || !can(req.user, R.perm)) return bad(res, 'Рұқсат жоқ', 403);
  const before = get(`SELECT * FROM ${R.table} WHERE id = ?`, req.params.id);
  if (!before) return bad(res, 'Табылмады', 404);
  const { out, errors } = toDb(R, req.body || {}, { creating: false });
  delete out.status; if (R.workflow) { delete out.reviewed_by; delete out.reviewed_at; }
  if (R.table === 'courses' || R.table === 'tests' || R.table === 'materials') if (req.body.status) out.status = req.body.status; // simple publish flag for non-religious containers
  if (R.table === 'users') {
    const e = guardUser(req, before, out); if (e) return bad(res, e, 403);
    if (before.id === req.user.id && (out.role && out.role !== before.role || out.active === 0)) return bad(res, 'Өз рөліңізді немесе белсенділігіңізді өзгерте алмайсыз');
  }
  if (errors.length) return bad(res, errors.join('. '));
  try {
    tx(() => {
      update(R.table, before.id, R.workflow ? { ...out, updated_at: new Date().toISOString() } : out);
      const st = afterContentChange(R, before.id, before, out);
      res.locals.reset = st;
    });
    scheduleReindex();
    res.json({ ...fromDb(R, get(`SELECT * FROM ${R.table} WHERE id = ?`, before.id)), _notice: res.locals.reset ? 'Өзгеріс сақталды. Материал қайта тексеруге (Review) жіберілді.' : null });
  } catch (e) {
    bad(res, /UNIQUE/.test(e.message) ? 'Мұндай жазба бұрыннан бар' : e.message);
  }
});

admin.delete('/r/:res/:id', (req, res) => {
  const R = resOf(req.params.res);
  if (!R || !can(req.user, R.perm)) return bad(res, 'Рұқсат жоқ', 403);
  if (R.table === 'users') {
    if (req.user.role !== 'admin') return bad(res, 'Жоюды тек әкімші жасай алады. Оқушыны деактивациялаңыз.', 403);
    if (Number(req.params.id) === req.user.id) return bad(res, 'Өзіңізді жоя алмайсыз');
  }
  run(`DELETE FROM ${R.table} WHERE id = ?`, req.params.id);
  scheduleReindex();
  res.json({ ok: true });
});

// dropdown options for ref fields
admin.get('/options/:res', (req, res) => {
  const R = resOf(req.params.res);
  if (!R || !REF_LABEL[req.params.res]) return bad(res, 'Белгісіз', 404);
  const where = []; const p = [];
  if (req.query.role) { where.push('role = ?'); p.push(req.query.role); }
  res.json(all(`SELECT id, ${REF_LABEL[req.params.res]} AS label FROM ${R.table} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${R.order || 'id'} LIMIT 1000`, ...p));
});

// ---- content workflow: Draft → Review → Approved → Published ----
admin.post('/r/:res/:id/status', requirePerm('content.edit'), (req, res) => {
  const R = resOf(req.params.res);
  if (!R?.workflow) return bad(res, 'Бұл ресурста workflow жоқ');
  const row = get(`SELECT * FROM ${R.table} WHERE id = ?`, req.params.id);
  if (!row) return bad(res, 'Табылмады', 404);
  const to = req.body?.status;
  const err = checkTransition(req.user, row, to);
  if (err) return bad(res, err, 403);
  const patch = { status: to };
  if (to === 'approved') Object.assign(patch, { reviewed_by: req.user.id, reviewed_at: new Date().toISOString() });
  if (to === 'draft' || to === 'review') Object.assign(patch, { reviewed_by: null, reviewed_at: null });
  update(R.table, row.id, patch);
  if (to === 'published' && R.table === 'surahs') {
    const students = all("SELECT id FROM users WHERE role = 'student' AND active = 1").map((u) => u.id);
    notifyMany(students, 'Жаңа тәпсір сабағы шықты', `${row.name_kk} сүресінің тәпсірі`, `/tafsir/${row.id}`, 'content');
  }
  scheduleReindex();
  res.json(fromDb(R, get(`SELECT * FROM ${R.table} WHERE id = ?`, row.id)));
});

admin.get('/review', requirePerm('content.edit'), (req, res) => {
  const items = [];
  const label = { lessons: 'Сабақ', surahs: 'Тәпсір', kb_topics: 'Білім базасы' };
  for (const t of WORKFLOW_TABLES) {
    const title = t === 'surahs' ? "name_kk || ' сүресі'" : 'title';
    for (const r of all(`SELECT id, ${title} AS title, status, updated_at, reviewed_at, source_id, scholar, book, is_demo, (SELECT name FROM users WHERE id = reviewed_by) AS reviewer FROM ${t} ORDER BY updated_at DESC`)) {
      items.push({ ...r, resource: t, type: label[t], has_source: !!(r.source_id || r.scholar || r.book) });
    }
  }
  const counts = items.reduce((a, x) => ((a[x.status] = (a[x.status] || 0) + 1), a), {});
  res.json({ counts, items: req.query.status ? items.filter((x) => x.status === req.query.status) : items });
});

// ---- group members & course access ----
admin.get('/groups/:id/members', requirePerm('groups.manage'), (req, res) => {
  res.json(all('SELECT u.id, u.name, u.email, u.phone FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ? ORDER BY u.name', req.params.id));
});
admin.put('/groups/:id/members', requirePerm('groups.manage'), (req, res) => {
  const ids = (req.body?.user_ids || []).map(Number).filter(Boolean);
  tx(() => {
    run('DELETE FROM group_members WHERE group_id = ?', req.params.id);
    ids.forEach((uid) => run('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?,?)', req.params.id, uid));
  });
  res.json({ ok: true, count: ids.length });
});

admin.get('/courses/:id/access', requirePerm('access.grant'), (req, res) => {
  res.json(all(`SELECT a.*, u.name AS user_name, g.name AS group_name FROM course_access a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN groups g ON g.id = a.group_id WHERE a.course_id = ?`, req.params.id));
});
admin.post('/courses/:id/access', requirePerm('access.grant'), (req, res) => {
  const { user_id, group_id } = req.body || {};
  if (!user_id && !group_id) return bad(res, 'Оқушыны немесе топты таңдаңыз');
  const dup = get('SELECT 1 FROM course_access WHERE course_id = ? AND (user_id IS ? AND group_id IS ?)', req.params.id, user_id || null, group_id || null);
  if (!dup) insert('course_access', { course_id: Number(req.params.id), user_id: user_id ? Number(user_id) : null, group_id: group_id ? Number(group_id) : null });
  const course = get('SELECT title FROM courses WHERE id = ?', req.params.id);
  const targets = user_id ? [Number(user_id)] : all('SELECT user_id FROM group_members WHERE group_id = ?', group_id).map((x) => x.user_id);
  notifyMany(targets, 'Жаңа курс ашылды', course?.title, `/courses/${req.params.id}`, 'content');
  res.json({ ok: true });
});
admin.delete('/courses/:id/access/:aid', requirePerm('access.grant'), (req, res) => {
  run('DELETE FROM course_access WHERE id = ? AND course_id = ?', req.params.aid, req.params.id);
  res.json({ ok: true });
});

// course structure for the course builder
admin.get('/courses/:id/tree', requirePerm('content.edit'), (req, res) => {
  const course = get('SELECT * FROM courses WHERE id = ?', req.params.id);
  if (!course) return bad(res, 'Табылмады', 404);
  const modules = all('SELECT * FROM modules WHERE course_id = ? ORDER BY sort, id', course.id).map((m) => ({
    ...m,
    lessons: all(`SELECT id, title, status, sort, youtube_url, duration_min, (SELECT count(*) FROM exercises e WHERE e.lesson_id = l.id) AS exercises,
      (SELECT count(*) FROM tests t WHERE t.lesson_id = l.id) AS tests FROM lessons l WHERE module_id = ? ORDER BY sort, id`, m.id),
  }));
  res.json({ course, modules });
});

// ---- uploads ----
admin.post('/upload', requirePerm('content.edit'), contentUpload.single('file'), (req, res) => {
  if (!req.file) return bad(res, 'Файл таңдалмаған');
  res.json({ url: fileUrl('content', req.file.filename), name: req.file.originalname, size: req.file.size });
});

// ---- notifications ----
admin.post('/notify', requirePerm('notify.send'), (req, res) => {
  const { title, body, link, target } = req.body || {};
  if (!title) return bad(res, 'Тақырып қажет');
  let ids;
  if (!target || target === 'all') ids = all("SELECT id FROM users WHERE role = 'student' AND active = 1").map((x) => x.id);
  else if (String(target).startsWith('group:')) ids = all('SELECT user_id id FROM group_members WHERE group_id = ?', Number(target.split(':')[1])).map((x) => x.id);
  else if (String(target).startsWith('user:')) ids = [Number(target.split(':')[1])];
  else return bad(res, 'Қабылдаушы қате');
  notifyMany(ids, String(title), body || null, link && String(link).startsWith('/') ? link : null, 'broadcast');
  res.json({ ok: true, sent: ids.length });
});

// ---- live toggle ----
admin.post('/events/:id/live', requirePerm('events.manage'), (req, res) => {
  const ev = get('SELECT * FROM events WHERE id = ?', req.params.id);
  if (!ev) return bad(res, 'Табылмады', 404);
  const live = req.body?.live ? 1 : 0;
  run('UPDATE events SET is_live = ? WHERE id = ?', live, ev.id);
  if (live) {
    const ids = ev.group_id ? all('SELECT user_id id FROM group_members WHERE group_id = ?', ev.group_id).map((x) => x.id)
      : all("SELECT id FROM users WHERE role='student' AND active=1").map((x) => x.id);
    notifyMany(ids, `🔴 Қазір эфирде: ${ev.title}`, ev.teacher_name, '/calendar', 'live');
  }
  res.json({ ok: true, live });
});

// ---- analytics ----
admin.get('/analytics', requirePerm('analytics.view'), (_req, res) => {
  const students = all("SELECT * FROM users WHERE role = 'student'");
  const n = (sql, ...p) => get(sql, ...p).n;
  const active7 = n(`SELECT count(DISTINCT a.user_id) n FROM activity a JOIN users u ON u.id = a.user_id WHERE u.role='student' AND a.created_at > datetime('now','-7 days')`);
  const learnedToday = n(`SELECT count(DISTINCT a.user_id) n FROM activity a JOIN users u ON u.id=a.user_id WHERE u.role='student' AND a.kind IN ('lesson_view','lesson_complete') AND a.created_at >= datetime('now','start of day')`);
  const logins = (d) => n(`SELECT count(DISTINCT a.user_id) n FROM activity a JOIN users u ON u.id=a.user_id WHERE u.role='student' AND a.created_at > datetime('now', ?)`, d);
  const progresses = students.filter((s) => s.active).map((s) => {
    const trees = accessibleCourseIds(s).map((id) => courseTree(s, id));
    const t = trees.reduce((a, x) => ({ total: a.total + x.total, done: a.done + x.done }), { total: 0, done: 0 });
    return t.total ? (t.done / t.total) * 100 : 0;
  });
  const topLessons = all(`SELECT l.id, l.title, count(*) views, count(DISTINCT a.user_id) users FROM activity a JOIN lessons l ON l.id = a.ref_id
    WHERE a.kind = 'lesson_view' GROUP BY l.id ORDER BY views DESC LIMIT 6`);
  // drop-off: lessons where inactive (7+ days) students got stuck (started, not completed)
  const dropoff = all(`SELECT l.id, l.title, count(*) n FROM student_progress sp JOIN lessons l ON l.id = sp.lesson_id
    WHERE sp.status = 'in_progress' AND sp.user_id NOT IN (SELECT user_id FROM activity WHERE created_at > datetime('now','-7 days'))
    GROUP BY l.id ORDER BY n DESC LIMIT 6`);
  const hardQuestions = all(`SELECT q.id, q.prompt, t.title AS test, count(*) total, sum(a.correct = 0) wrong,
    round(100.0 * sum(a.correct = 0) / count(*)) rate FROM answers a JOIN questions q ON q.id = a.question_id JOIN tests t ON t.id = q.test_id
    GROUP BY q.id HAVING total >= 2 ORDER BY rate DESC, wrong DESC LIMIT 6`);
  const ruleStats = {};
  for (const m of all('SELECT rule_tag, count(*) n FROM mistakes GROUP BY rule_tag')) ruleStats[m.rule_tag] = (ruleStats[m.rule_tag] || 0) + m.n;
  for (const m of all('SELECT q.rule_tag, count(*) n FROM answers a JOIN questions q ON q.id = a.question_id WHERE a.correct = 0 AND q.rule_tag IS NOT NULL GROUP BY q.rule_tag')) ruleStats[m.rule_tag] = (ruleStats[m.rule_tag] || 0) + m.n;
  const hardRules = Object.entries(ruleStats).map(([tag, n]) => ({ tag, label: RULE_TAGS[tag] || tag, n })).sort((a, b) => b.n - a.n).slice(0, 8);
  const days = [];
  const perDay = new Map();
  for (const r of all(`SELECT a.user_id, a.created_at FROM activity a JOIN users u ON u.id=a.user_id WHERE u.role='student' AND a.created_at > datetime('now','-15 days')`)) {
    const d = utcToLocalDate(r.created_at); if (!perDay.has(d)) perDay.set(d, new Set()); perDay.get(d).add(r.user_id);
  }
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = localDate(d); days.push({ date: k, users: perDay.get(k)?.size || 0 }); }
  res.json({
    totals: {
      students: students.length,
      active: active7,
      today: learnedToday,
      avgProgress: progresses.length ? Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length) : 0,
      completed: n('SELECT count(DISTINCT user_id) n FROM certificates'),
      inactive: students.filter((s) => s.active).length - n(`SELECT count(DISTINCT a.user_id) n FROM activity a JOIN users u ON u.id=a.user_id WHERE u.role='student' AND a.created_at > datetime('now','-14 days')`),
    },
    logins: { today: n(`SELECT count(DISTINCT a.user_id) n FROM activity a JOIN users u ON u.id=a.user_id WHERE u.role='student' AND a.created_at >= datetime('now','start of day')`), d7: logins('-7 days'), d30: logins('-30 days') },
    days, topLessons, dropoff, hardQuestions, hardRules,
    pending: { submissions: n("SELECT count(*) n FROM submissions WHERE status = 'pending'"), questions: n("SELECT count(*) n FROM qa_threads WHERE status = 'open'"), review: n("SELECT (SELECT count(*) FROM lessons WHERE status='review') + (SELECT count(*) FROM surahs WHERE status='review') + (SELECT count(*) FROM kb_topics WHERE status='review') n") },
  });
});

admin.post('/reindex', requirePerm('content.edit'), (_req, res) => { scheduleReindex(); res.json({ ok: true }); });

// ================= teacher tools =================
function scopeStudents(user) {
  if (user.role !== 'teacher') return null; // admin / curator see everyone
  const ids = all('SELECT DISTINCT gm.user_id FROM groups g JOIN group_members gm ON gm.group_id = g.id WHERE g.teacher_id = ?', user.id).map((x) => x.user_id);
  return ids.length ? ids : null;
}

teach.get('/submissions', requirePerm('submissions.review'), (req, res) => {
  const scope = scopeStudents(req.user);
  const status = req.query.status || 'pending';
  const rows = all(`SELECT s.*, u.name AS student, COALESCE(a.title, e.prompt) AS task, e.arabic, l.title AS lesson_title, l.rule_tag AS lesson_rule
    FROM submissions s JOIN users u ON u.id = s.user_id LEFT JOIN assignments a ON a.id = s.assignment_id
    LEFT JOIN exercises e ON e.id = s.exercise_id LEFT JOIN lessons l ON l.id = COALESCE(e.lesson_id, a.lesson_id)
    WHERE ${status === 'all' ? '1=1' : 's.status = ?'} ${scope ? `AND s.user_id IN (${scope.join(',')})` : ''} ORDER BY s.id DESC LIMIT 200`, ...(status === 'all' ? [] : [status]))
    .map((s) => ({ ...s, feedback: all('SELECT f.*, u.name AS teacher FROM teacher_feedback f LEFT JOIN users u ON u.id=f.teacher_id WHERE submission_id = ? ORDER BY f.id', s.id), mistakes: all('SELECT rule_tag FROM mistakes WHERE submission_id = ?', s.id).map((m) => m.rule_tag) }));
  const counts = Object.fromEntries(all(`SELECT status, count(*) n FROM submissions ${scope ? `WHERE user_id IN (${scope.join(',')})` : ''} GROUP BY status`).map((x) => [x.status, x.n]));
  res.json({ counts, rows });
});

const FEEDBACK_TEXT = { accepted: 'Қабылданды', reread: 'Қайта оқу керек', fix: 'Түзету қажет' };
teach.post('/submissions/:id/review', requirePerm('submissions.review'), (req, res) => {
  const s = get('SELECT * FROM submissions WHERE id = ?', req.params.id);
  if (!s) return bad(res, 'Табылмады', 404);
  const { status, comment, mistakes = [] } = req.body || {};
  if (!FEEDBACK_TEXT[status]) return bad(res, 'Күйді таңдаңыз');
  const tags = mistakes.filter((t) => RULE_TAGS[t]);
  tx(() => {
    run('UPDATE submissions SET status = ? WHERE id = ?', status, s.id);
    insert('teacher_feedback', { submission_id: s.id, teacher_id: req.user.id, status, comment: comment || null });
    tags.forEach((t) => insert('mistakes', { user_id: s.user_id, submission_id: s.id, rule_tag: t, note: comment || null }));
  });
  const extra = tags.length ? ` Қателер: ${tags.map((t) => RULE_TAGS[t]).join(', ')}.` : '';
  notify(s.user_id, `Ұстаз тапсырмаңызды тексерді: ${FEEDBACK_TEXT[status]}`, (comment || '') + extra, '/practice', status === 'accepted' ? 'success' : 'feedback');
  res.json({ ok: true });
});

teach.get('/students', requirePerm('analytics.view'), (req, res) => {
  const scope = scopeStudents(req.user);
  const rows = all(`SELECT * FROM users WHERE role = 'student' ${scope ? `AND id IN (${scope.join(',')})` : ''} ORDER BY name`).map(decorateUser)
    .map((u) => ({ id: u.id, name: u.name, phone: u.phone, email: u.email, active: u.active, progress: u.progress, last_active: u.last_active, groups: u.groups,
      mistakes: all('SELECT rule_tag, count(*) n FROM mistakes WHERE user_id = ? AND resolved = 0 GROUP BY rule_tag ORDER BY n DESC', u.id).map((m) => ({ label: RULE_TAGS[m.rule_tag], n: m.n })) }));
  res.json(rows);
});
