/**
 * 全時間工作重點回報 — Google Apps Script 後端
 * 貼到 Google 試算表的「擴充功能 → Apps Script」。第一次和每次更新程式後執行一次 setup()，再「部署 → 管理部署作業 → 建立新版本」。
 */

const CONFIG = {
  CHANNEL_ID: '2012412693',        // LINE Developers → LINE Login channel → Basic settings 的 Channel ID
  LIFF_ID: '2012412693-oJoL0N7l',      // 提醒信裡的連結會用到
  TZ: 'Asia/Taipei',
  PHOTO_FOLDER: '全時間回報照片',   // 上傳的照片存在雲端硬碟這個資料夾
};

const SH = { PROJECTS: '項目', PEOPLE: '名單', MEMBERS: '項目成員', REPORTS: '回報', ADMINS: '管理員' };
const HEADERS = {
  '項目': ['項目代碼', '名稱', '說明', '開始週', '結束週', '提醒星期', '提醒時間', '截止時間', '欄位', '色調', '開放', '建立者', '建立時間'],
  '名單': ['LINE userId', '姓名', 'LINE名稱', '記住的資料', '更新時間'],
  '項目成員': ['項目代碼', 'LINE userId', '加入時間'],
  '回報': ['回報代碼', '回報時間', '項目代碼', '週次', '姓名', 'LINE userId', '內容', '資料', '逾期', '修改時間'],
  '管理員': ['LINE userId', '名稱', 'Email（收提醒信，可留白）'],
};
const PJ = { ID: 0, TITLE: 1, DESC: 2, START: 3, END: 4, RDAY: 5, RTIME: 6, DUE: 7, FIELDS: 8, THEME: 9, OPEN: 10, CREATOR: 11, CREATED: 12 };
const RP = { ID: 0, TIME: 1, PID: 2, WEEK: 3, NAME: 4, UID: 5, TEXT: 6, DATA: 7, LATE: 8, EDITED: 9 };

/** 建立工作表、補齊標題列、安裝每小時檢查提醒的排程。更新程式後再執行一次也安全 */
function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(CONFIG.TZ);
  Object.keys(HEADERS).forEach(name => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    const h = HEADERS[name];
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  ['D:D', 'E:E', 'G:G', 'H:H'].forEach(c => sheet(SH.PROJECTS).getRange(c).setNumberFormat('@'));
  sheet(SH.REPORTS).getRange('D:D').setNumberFormat('@');
  sessionSheet();
  photoFolder();
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'remindTick')) {
    ScriptApp.newTrigger('remindTick').timeBased().everyHours(1).create();
  }
}

function doGet() { return json({ ok: true, msg: '全時間工作重點回報系統運作中' }); }

function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const user = req.session && req.action !== 'session' ? userFromSession(req.session) : verifyIdToken(req.idToken);
    const admin = () => requireAdmin(user);
    switch (req.action) {
      case 'session':       out = { ok: true, ...createSession(user) }; break;
      case 'me':            out = { ok: true, userId: user.userId, displayName: user.displayName, isAdmin: isAdmin(user.userId), profile: profileOf(user.userId) }; break;
      case 'saveProfile':   out = { ok: true, profile: saveProfile(user, req.name, req.info) }; break;
      case 'listProjects':  out = { ok: true, projects: listProjects(user) }; break;
      case 'project':       out = { ok: true, ...projectForUser(user, req.projectId, req.week) }; break;
      case 'submit':        out = { ok: true, ...submit(user, req.projectId, req.week, req.data) }; break;
      case 'myReports':     out = { ok: true, project: getProject(req.projectId), reports: reportsOf(req.projectId).filter(r => r.userId === user.userId).sort(byWeekDesc) }; break;
      case 'weekReports':   out = { ok: true, project: getProject(req.projectId), week: req.week, reports: reportsOf(req.projectId).filter(r => r.week === req.week) }; break;
      case 'uploadImage':   out = { ok: true, url: uploadImage(user, req.data, req.mime) }; break;
      case 'myData':        out = { ok: true, ...myData(user) }; break;
      case 'deleteMyData':  out = { ok: true, ...deleteMyData(user) }; break;
      case 'projectStats':  admin(); out = { ok: true, ...projectStats(req.projectId) }; break;
      case 'createProject': admin(); out = { ok: true, project: createProject(user, req.project || {}) }; break;
      case 'updateProject': admin(); out = { ok: true, project: updateProject(req.projectId, req.project || {}) }; break;
      case 'setOpen':       admin(); out = { ok: true, project: setOpen(req.projectId, !!req.open) }; break;
      case 'deleteProject': admin(); deleteProject(req.projectId); out = { ok: true }; break;
      case 'removeMember':  admin(); removeMember(req.projectId, req.userId); out = { ok: true, ...projectStats(req.projectId) }; break;
      default: throw new Error('未知的動作');
    }
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return json(out);
}

function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------- 平台通行證：登入一次，60 天內不用再登入（存在隱藏的「登入」工作表） ---------- */
const SESSION_SHEET = '登入';
const SESSION_DAYS = 60;
function sessionSheet() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SESSION_SHEET);
  if (!sh) { sh = ss.insertSheet(SESSION_SHEET); sh.appendRow(['通行證', 'LINE userId', 'LINE名稱', '到期', '建立']); sh.setFrozenRows(1); sh.hideSheet(); }
  return sh;
}
function createSession(user) {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const now = new Date(), exp = new Date(now.getTime() + SESSION_DAYS * 864e5);
  withLock(() => {
    const sh = sessionSheet(), data = sh.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) if (data[i][3] instanceof Date && data[i][3] < now) sh.deleteRow(i + 1);
    sh.appendRow([token, user.userId, user.displayName, exp, now]);
  });
  return { token, expires: exp.getTime() };
}
function userFromSession(token) {
  const data = sessionSheet().getDataRange().getValues(), now = new Date();
  for (let i = 1; i < data.length; i++) if (data[i][0] === token && data[i][3] instanceof Date && data[i][3] > now) return { userId: String(data[i][1]), displayName: String(data[i][2]) };
  throw new Error('SESSION_EXPIRED');
}
function deleteSessionsOf(uid) {
  const sh = sessionSheet(), data = sh.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) if (String(data[i][1]) === uid) sh.deleteRow(i + 1);
}
/** 向 LINE 驗證 ID token，防止有人偽造身分 */
function verifyIdToken(idToken) {
  if (!idToken) throw new Error('缺少登入資訊，請在 LINE 中重新開啟');
  const res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', { method: 'post', payload: { id_token: idToken, client_id: CONFIG.CHANNEL_ID }, muteHttpExceptions: true });
  const d = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) {
    const m = d.error_description || '驗證失敗';
    throw new Error(/expired/i.test(m) ? 'TOKEN_EXPIRED' : 'LINE 身分驗證失敗：' + m);
  }
  return { userId: d.sub, displayName: d.name || '' };
}

/* ---------- 工具 ---------- */
function sheet(name) { return SpreadsheetApp.getActive().getSheetByName(name); }
function rows(name) { const v = sheet(name).getDataRange().getValues(); v.shift(); return v; }
function fmt(d, p) { return Utilities.formatDate(d, CONFIG.TZ, p || 'yyyy/MM/dd HH:mm'); }
function parseJson(s, fb) { try { return JSON.parse(s); } catch (e) { return fb; } }
function isTrue(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function withLock(fn) { const l = LockService.getScriptLock(); l.waitLock(15000); try { return fn(); } finally { l.releaseLock(); } }
function str(v, n) { return String(v == null ? '' : v).trim().slice(0, n || 200); }
function hhmm(v, fb) { const s = v instanceof Date ? fmt(v, 'HH:mm') : str(v, 5); return /^\d{2}:\d{2}$/.test(s) ? s : fb; }
const byWeekDesc = (a, b) => b.week.localeCompare(a.week);

/* ---------- 週次：週一～週日，以該週一「yyyy-MM-dd」表示 ---------- */
const DAY = 864e5;
function dateOf(ymd) { return Utilities.parseDate(String(ymd) + ' 00:00', CONFIG.TZ, 'yyyy-MM-dd HH:mm'); }
function ymdOf(v) { if (v instanceof Date) return fmt(v, 'yyyy-MM-dd'); const s = str(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }
function mondayOf(d) { const wd = Number(fmt(d, 'u')); return fmt(new Date(d.getTime() - (wd - 1) * DAY), 'yyyy-MM-dd'); }
function addWeeks(wk, n) { return fmt(new Date(dateOf(wk).getTime() + n * 7 * DAY + 12 * 3600e3), 'yyyy-MM-dd'); }
function weekLabel(wk) { const a = dateOf(wk), b = new Date(a.getTime() + 6 * DAY); return fmt(a, 'M/d') + '～' + fmt(b, 'M/d'); }
/** 截止＝該週結束後的週一 HH:mm */
function dueOf(p, wk) { return Utilities.parseDate(addWeeks(wk, 1) + ' ' + p.dueTime, CONFIG.TZ, 'yyyy-MM-dd HH:mm'); }
function dueLabel(p, wk) { const d = dueOf(p, wk); return fmt(d, 'M/d') + '（' + '一二三四五六日'.charAt(Number(fmt(d, 'u')) - 1) + '）' + p.dueTime; }
/** 這次要回報的週：週六、週日填本週；週一到週五填上一週。限制在項目期間內 */
function defaultWeek(p, now) {
  now = now || new Date();
  const wd = Number(fmt(now, 'u'));
  let wk = mondayOf(now);
  if (wd < 6) wk = addWeeks(wk, -1);
  const s = mondayOf(dateOf(p.start));
  if (wk < s) wk = s;
  if (p.end) { const e = mondayOf(dateOf(p.end)); if (wk > e) wk = e; }
  return wk;
}
function weeksOf(p) {
  const out = [], last = defaultWeek(p);
  for (let w = mondayOf(dateOf(p.start)); w <= last && out.length < 520; w = addWeeks(w, 1)) out.unshift(w);
  return out;
}

/* ---------- 管理員 ---------- */
function isAdmin(uid) { return rows(SH.ADMINS).some(r => String(r[0]).trim() === uid); }
function requireAdmin(user) { if (!isAdmin(user.userId)) throw new Error('只有管理員可以使用這個功能'); }

/* ---------- 個人資料（姓名＋記住的資料） ---------- */
function findPerson(uid) {
  const data = sheet(SH.PEOPLE).getDataRange().getValues();
  for (let i = 1; i < data.length; i++) if (String(data[i][0]) === uid) return { row: i + 1, r: data[i] };
  return null;
}
function profileOf(uid) {
  const f = findPerson(uid);
  return f ? { name: String(f.r[1]), info: parseJson(f.r[3], {}) || {} } : { name: '', info: {} };
}
function saveProfile(user, name, info) {
  return withLock(() => {
    const f = findPerson(user.userId);
    const cur = f ? { name: String(f.r[1]), info: parseJson(f.r[3], {}) || {} } : { name: '', info: {} };
    const nm = name == null ? cur.name : str(name, 20);
    if (!nm) throw new Error('請填寫姓名');
    const merged = Object.assign({}, cur.info);
    Object.keys(info || {}).forEach(k => { merged[str(k, 30)] = str(info[k], 30); });
    const row = [user.userId, nm, user.displayName, JSON.stringify(merged), new Date()];
    if (f) sheet(SH.PEOPLE).getRange(f.row, 1, 1, row.length).setValues([row]);
    else sheet(SH.PEOPLE).appendRow(row);
    return { name: nm, info: merged };
  });
}

/* ---------- 項目 ---------- */
const THEMES = ['classic', 'feast', 'prayer', 'gospel', 'youth', 'kids', 'study', 'service'];
const FIELD_TYPES = ['info', 'number', 'list', 'text', 'photo'];
function cleanFields(list) {
  const seen = {};
  return (Array.isArray(list) ? list : []).map(f => {
    const type = FIELD_TYPES.indexOf(f && f.type) >= 0 ? f.type : 'text';
    let id = str(f && f.id, 24).replace(/[^\w]/g, '') || 'f' + Utilities.getUuid().slice(0, 6);
    while (seen[id]) id += 'x';
    seen[id] = 1;
    const out = { id, type, label: str(f && f.label, 30) };
    if (type === 'list') {
      out.slots = Math.min(30, Math.max(1, parseInt(f.slots, 10) || 1));
      out.tags = (Array.isArray(f.tags) ? f.tags : []).map(t => str(t, 12)).filter(Boolean).slice(0, 6);
    }
    return out;
  }).filter(f => f.label).slice(0, 30);
}
function rowToProject(r) {
  return {
    id: String(r[PJ.ID]), title: String(r[PJ.TITLE]), desc: String(r[PJ.DESC] || ''),
    start: ymdOf(r[PJ.START]), end: ymdOf(r[PJ.END]),
    remindDay: Number(r[PJ.RDAY]) || 0, remindTime: hhmm(r[PJ.RTIME], '20:00'), dueTime: hhmm(r[PJ.DUE], '12:00'),
    fields: parseJson(r[PJ.FIELDS], []) || [], theme: THEMES.indexOf(String(r[PJ.THEME])) >= 0 ? String(r[PJ.THEME]) : 'classic',
    open: isTrue(r[PJ.OPEN]), created: r[PJ.CREATED] instanceof Date ? fmt(r[PJ.CREATED], 'yyyy/M/d') : '',
  };
}
function findProjectRow(id) {
  const data = sheet(SH.PROJECTS).getDataRange().getValues();
  for (let i = 1; i < data.length; i++) if (String(data[i][PJ.ID]) === String(id)) return { row: i + 1, r: data[i] };
  throw new Error('找不到這個回報項目，可能已經被刪除');
}
function getProject(id) { return rowToProject(findProjectRow(id).r); }
function projectValues(input) {
  const title = str(input.title, 40), start = ymdOf(input.start), fields = cleanFields(input.fields);
  if (!title) throw new Error('請填寫項目名稱');
  if (!start) throw new Error('請選擇開始的週');
  if (!fields.length) throw new Error('至少要有一個回報欄位');
  const rday = [0, 1, 6].indexOf(Number(input.remindDay)) >= 0 ? Number(input.remindDay) : 0;
  return [title, str(input.desc, 200), start, ymdOf(input.end), rday, hhmm(input.remindTime, '20:00'), hhmm(input.dueTime, '12:00'),
    JSON.stringify(fields), THEMES.indexOf(input.theme) >= 0 ? input.theme : 'classic'];
}
function createProject(user, input) {
  const v = projectValues(input);
  const id = 'P' + fmt(new Date(), 'yyMMddHHmmss');
  sheet(SH.PROJECTS).appendRow([id].concat(v, [true, user.displayName + ' (' + user.userId + ')', new Date()]));
  return getProject(id);
}
function updateProject(id, input) {
  const v = projectValues(input), f = findProjectRow(id);
  sheet(SH.PROJECTS).getRange(f.row, 2, 1, v.length).setValues([v]);
  return getProject(id);
}
function setOpen(id, open) { const f = findProjectRow(id); sheet(SH.PROJECTS).getRange(f.row, PJ.OPEN + 1).setValue(open); return getProject(id); }
function deleteProject(id) {
  withLock(() => {
    const f = findProjectRow(id);
    sheet(SH.PROJECTS).deleteRow(f.row);
    deleteRowsWhere(SH.REPORTS, r => String(r[RP.PID]) === id);
    deleteRowsWhere(SH.MEMBERS, r => String(r[0]) === id);
  });
}
function deleteRowsWhere(name, test) {
  const sh = sheet(name), data = sh.getDataRange().getValues();
  let n = 0;
  for (let i = data.length - 1; i >= 1; i--) if (test(data[i])) { sh.deleteRow(i + 1); n++; }
  return n;
}

/* ---------- 成員：回報過一次就加入項目 ---------- */
function memberIds(pid) { return rows(SH.MEMBERS).filter(r => String(r[0]) === pid).map(r => String(r[1])); }
function ensureMember(pid, uid) { if (memberIds(pid).indexOf(uid) < 0) sheet(SH.MEMBERS).appendRow([pid, uid, new Date()]); }
function removeMember(pid, uid) { withLock(() => deleteRowsWhere(SH.MEMBERS, r => String(r[0]) === pid && String(r[1]) === uid)); }

/* ---------- 回報 ---------- */
function rowToReport(r) {
  return { id: String(r[RP.ID]), week: ymdOf(r[RP.WEEK]), userId: String(r[RP.UID]), name: String(r[RP.NAME]),
    time: r[RP.TIME] instanceof Date ? fmt(r[RP.TIME], 'M/d HH:mm') : String(r[RP.TIME] || ''),
    edited: r[RP.EDITED] instanceof Date ? fmt(r[RP.EDITED], 'M/d HH:mm') : '', late: isTrue(r[RP.LATE]), data: parseJson(r[RP.DATA], {}) || {} };
}
function reportsOf(pid) { return rows(SH.REPORTS).filter(r => String(r[RP.PID]) === String(pid)).map(rowToReport); }

/** 存進試算表的可讀文字，格式跟大家原本在群組貼的一樣 */
function listItems(v) { return (Array.isArray(v) ? v : []).filter(x => x && str(x.n, 40)); }
function tagCode(t) { return /^[A-Za-z0-9]/.test(t) ? t.charAt(0) : t; }
function reportText(p, wk, name, data) {
  const L = [weekLabel(wk), '【' + name + '】'];
  let after = false;
  p.fields.forEach(f => {
    const v = data[f.id];
    if (f.type === 'info' || f.type === 'number') { if (after) { L.push(''); after = false; } L.push(f.label + '：' + (v == null ? '' : v)); }
    else if (f.type === 'list') {
      const it = listItems(v);
      L.push('', (f.tags && f.tags.length ? f.label + '（' + f.tags.join('/') + '）' : f.label) + '：');
      (it.length ? it : [{ n: '' }]).forEach((x, i) => L.push((i + 1) + '.' + x.n + (x.t || []).map(tagCode).join('')));
      after = true;
    } else if (f.type === 'text' && str(v, 1000)) { L.push('', f.label.replace(/（選填）$/, '') + '：', str(v, 1000)); after = true; }
  });
  return L.join('\n');
}
function cleanData(p, data) {
  data = data || {};
  const out = {};
  p.fields.forEach(f => {
    const v = data[f.id];
    if (f.type === 'list') out[f.id] = listItems(v).slice(0, 60).map(x => ({ n: str(x.n, 20), t: (Array.isArray(x.t) ? x.t : []).filter(t => (f.tags || []).indexOf(t) >= 0) }));
    else if (f.type === 'number') out[f.id] = String(v == null ? '' : v).trim() === '' ? '' : Math.max(0, Number(v) || 0);
    else if (f.type === 'photo') out[f.id] = (Array.isArray(v) ? v : []).filter(u => /^https:\/\/lh3\.googleusercontent\.com\//.test(u)).slice(0, 4);
    else if (f.type === 'text') out[f.id] = str(v, 1000);
    else out[f.id] = str(v, 30);
  });
  return out;
}

function projectForUser(user, pid, week) {
  const p = getProject(pid), weeks = weeksOf(p);
  const wk = week && weeks.indexOf(week) >= 0 ? week : defaultWeek(p);
  const mine = reportsOf(pid).filter(r => r.userId === user.userId);
  const done = {}; mine.forEach(r => { done[r.week] = true; });
  return {
    project: p, week: wk, weeks: weeks.map(w => ({ week: w, done: !!done[w] })),
    mine: mine.filter(r => r.week === wk)[0] || null,
    last: mine.filter(r => r.week < wk).sort(byWeekDesc)[0] || null,
    profile: profileOf(user.userId),
  };
}

function submit(user, pid, week, data) {
  const p = getProject(pid);
  if (!p.open) throw new Error('這個項目已經停止回報');
  if (weeksOf(p).indexOf(week) < 0) throw new Error('這一週不在回報期間內');
  const prof = profileOf(user.userId);
  if (!prof.name) throw new Error('請先填寫姓名');
  const clean = cleanData(p, data);
  // 「記住的資料」存回個人資料，下次自動帶入
  const info = {};
  p.fields.filter(f => f.type === 'info').forEach(f => { info[f.label] = clean[f.id]; });
  saveProfile(user, null, info);
  return withLock(() => {
    ensureMember(pid, user.userId);
    const sh = sheet(SH.REPORTS), all = sh.getDataRange().getValues(), now = new Date();
    const text = reportText(p, week, prof.name, clean);
    let updated = false, id = '';
    for (let i = 1; i < all.length; i++) {
      if (String(all[i][RP.PID]) === pid && ymdOf(all[i][RP.WEEK]) === week && String(all[i][RP.UID]) === user.userId) {
        id = String(all[i][RP.ID]);
        sh.getRange(i + 1, RP.NAME + 1, 1, 4).setValues([[prof.name, user.userId, text, JSON.stringify(clean)]]);
        sh.getRange(i + 1, RP.EDITED + 1).setValue(now);
        updated = true; break;
      }
    }
    if (!updated) {
      id = 'R' + fmt(now, 'yyMMddHHmmss') + Math.floor(Math.random() * 1000);
      sh.appendRow([id, now, pid, week, prof.name, user.userId, text, JSON.stringify(clean), now > dueOf(p, week), '']);
    }
    const reps = reportsOf(pid);
    return { report: reps.filter(r => r.id === id)[0], updated, submitted: reps.filter(r => r.week === week).length, memberCount: memberIds(pid).length };
  });
}

function listProjects(user) {
  const admin = isAdmin(user.userId);
  const reps = rows(SH.REPORTS), mem = rows(SH.MEMBERS);
  return rows(SH.PROJECTS).map(rowToProject).filter(p => admin || p.open).map(p => {
    const wk = defaultWeek(p);
    const got = reps.filter(r => String(r[RP.PID]) === p.id && ymdOf(r[RP.WEEK]) === wk);
    const ids = mem.filter(r => String(r[0]) === p.id).map(r => String(r[1]));
    return Object.assign(p, { defaultWeek: wk, submitted: got.length, memberCount: ids.length,
      mineDone: got.some(r => String(r[RP.UID]) === user.userId), isMember: ids.indexOf(user.userId) >= 0 });
  }).reverse();
}

function projectStats(pid) {
  const p = getProject(pid), people = {};
  rows(SH.PEOPLE).forEach(r => { people[String(r[0])] = { name: String(r[1]), info: parseJson(r[3], {}) || {} }; });
  return { project: p, weeks: weeksOf(p), defaultWeek: defaultWeek(p),
    members: memberIds(pid).filter(u => people[u]).map(u => ({ userId: u, name: people[u].name, info: people[u].info })),
    reports: reportsOf(pid) };
}

/* ---------- 照片 ---------- */
function photoFolder() { const it = DriveApp.getFoldersByName(CONFIG.PHOTO_FOLDER); return it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.PHOTO_FOLDER); }
function uploadImage(user, data, mime) {
  mime = /^image\/(jpeg|png)$/.test(mime) ? mime : 'image/jpeg';
  const b64 = String(data || '').replace(/^data:[^,]+,/, '');
  if (!b64) throw new Error('沒有收到照片');
  if (b64.length > 7000000) throw new Error('照片太大，請換一張小一點的');
  const file = photoFolder().createFile(Utilities.newBlob(Utilities.base64Decode(b64), mime, 'report-' + fmt(new Date(), 'yyyyMMdd-HHmmss') + '.jpg'));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); // LINE 圖卡要能讀到
  file.setDescription('上傳者：' + user.displayName + ' (' + user.userId + ')');
  return 'https://lh3.googleusercontent.com/d/' + file.getId();
}

/* ---------- 我的資料 ---------- */
function myData(user) {
  const f = findPerson(user.userId);
  const n = rows(SH.REPORTS).filter(r => String(r[RP.UID]) === user.userId).length;
  if (!f) return { found: false };
  return { found: true, name: String(f.r[1]), info: parseJson(f.r[3], {}) || {}, lineName: user.displayName, reports: n };
}
function deleteMyData(user) {
  return withLock(() => {
    const reports = deleteRowsWhere(SH.REPORTS, r => String(r[RP.UID]) === user.userId);
    deleteRowsWhere(SH.MEMBERS, r => String(r[1]) === user.userId);
    deleteRowsWhere(SH.PEOPLE, r => String(r[0]) === user.userId);
    deleteSessionsOf(user.userId);
    return { reports };
  });
}

/* ---------- 每小時檢查：到了提醒時間就寄信給管理員 ---------- */
function remindTick() {
  const now = new Date();
  const dow = Number(fmt(now, 'u')) % 7; // 0＝週日
  const hour = fmt(now, 'HH');
  const props = PropertiesService.getScriptProperties();
  rows(SH.PROJECTS).map(rowToProject).filter(p => p.open).forEach(p => {
    if (p.remindDay !== dow || p.remindTime.slice(0, 2) !== hour) return;
    if (dateOf(p.start).getTime() > now.getTime() + 2 * DAY) return; // 還沒開始
    const wk = defaultWeek(p, now);
    const key = 'sent:' + p.id + ':' + wk;
    if (props.getProperty(key)) return;
    sendRemindMail(p, wk);
    props.setProperty(key, fmt(now));
  });
}

function sendRemindMail(p, wk) {
  const st = projectStats(p.id);
  const got = {}; st.reports.filter(r => r.week === wk).forEach(r => { got[r.userId] = true; });
  const missing = st.members.filter(m => !got[m.userId]).map(m => m.name);
  const link = 'https://liff.line.me/' + CONFIG.LIFF_ID + '?remind=' + encodeURIComponent(p.id);
  const to = rows(SH.ADMINS).map(r => str(r[2], 100)).filter(e => /@/.test(e));
  if (!to.length) to.push(Session.getEffectiveUser().getEmail());
  const subject = '【回報提醒】' + p.title + ' ' + weekLabel(wk) + '，截止 ' + dueLabel(p, wk);
  const html = '<div style="font-family:sans-serif;line-height:1.7;color:#2F3343">'
    + '<p>「' + p.title + '」' + weekLabel(wk) + ' 的回報，截止時間是 <b>' + dueLabel(p, wk) + '</b>。</p>'
    + '<p>目前已交 ' + Object.keys(got).length + '／' + st.members.length + ' 人' + (missing.length ? '，還沒交：' + missing.join('、') : '') + '。</p>'
    + '<p><a href="' + link + '" style="display:inline-block;background:#2F3343;color:#F7F1E4;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:bold">打開平台，把提醒貼到群組</a></p>'
    + '<p style="color:#67645F;font-size:13px">請在手機上點這個連結（會用 LINE 打開），按「發提醒到群組」，選擇群組就完成了。</p></div>';
  MailApp.sendEmail({ to: to.join(','), subject, htmlBody: html, name: '全時間工作重點回報' });
}

/** 手動測試提醒信：在 Apps Script 選這個函式執行，會寄出第一個進行中項目的提醒 */
function testRemindMail() {
  const p = rows(SH.PROJECTS).map(rowToProject).filter(x => x.open)[0];
  if (!p) throw new Error('還沒有進行中的項目');
  sendRemindMail(p, defaultWeek(p));
}

/** 第一次設定用：管理員還沒有人時，把最早從 LINE 登入平台的人（「登入」工作表第一筆）設為管理員。只有試算表擁有者能在 Apps Script 執行 */
function addFirstAdmin() {
  const adm = sheet(SH.ADMINS);
  if (adm.getLastRow() > 1) { Logger.log('已經有管理員了：' + adm.getRange(2, 1, adm.getLastRow() - 1, 2).getValues().map(r => r.join(' ')).join('、')); return; }
  const s = rows(SESSION_SHEET)[0];
  if (!s) throw new Error('還沒有人登入過平台，請先從 LINE 打開平台一次');
  const uid = String(s[1]), prof = profileOf(uid);
  adm.appendRow([uid, prof.name || String(s[2]), Session.getEffectiveUser().getEmail()]);
  Logger.log('已設為管理員：' + (prof.name || s[2]) + ' ' + uid);
}
