/* ======== 只需要改這兩行 ======== */
const LIFF_ID = '請填入 LIFF ID';
const GAS_URL = '請填入 Apps Script 網址';
/* ================================ */

let PARAMS = new URLSearchParams(location.search);
// LIFF 還沒設定，或網址帶 ?demo 時，用範例資料預覽畫面
const DEMO = LIFF_ID.startsWith('請填') || PARAMS.has('demo');
const DEMO_MODE = PARAMS.get('demo') || '';

const $app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = html => { $app.innerHTML = html; window.scrollTo(0, 0); };
const $ = id => document.getElementById(id);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const loading = () => `<div class="loading" role="status"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>`;
const isHttps = u => /^https:\/\//.test(u || '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}
function copyText(text, done) {
  navigator.clipboard.writeText(text).then(() => toast(done), () => toast('無法複製，請長按文字自行複製'));
}
/** 危險動作按兩下確認 */
function armThen(btn, label, fn) {
  if (!btn.classList.contains('armed')) {
    const old = btn.textContent;
    btn.classList.add('armed'); btn.textContent = label;
    setTimeout(() => { if (btn.isConnected && !btn.disabled) { btn.classList.remove('armed'); btn.textContent = old; } }, 3500);
    return;
  }
  btn.disabled = true;
  Promise.resolve(fn()).catch(e => { toast(e.message); btn.disabled = false; });
}

/* ================= 週次 ================= */
// 一週＝週一～週日，週次用該週一的日期「yyyy-MM-dd」表示
const WD = '日一二三四五六';
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], m[2] - 1, +m[3]) : null; };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = d => addDays(d, -((d.getDay() + 6) % 7));
const md = d => `${d.getMonth() + 1}/${d.getDate()}`;
const weekLabel = wk => { const a = parseYmd(wk); return a ? `${md(a)}～${md(addDays(a, 6))}` : ''; };
/** 截止：該週結束後的週一，例如「11/2（一）12:00」 */
const dueLabel = (wk, time) => { const a = parseYmd(wk); if (!a) return ''; const d = addDays(a, 7); return `${md(d)}（${WD[d.getDay()]}）${time || '12:00'}`; };
const REMIND_DAYS = { 6: '週六', 0: '週日', 1: '週一' };

/* ================= 回報欄位 =================
   每個項目有自己的欄位，管理員可以增刪、調整順序：
   info＝記住的資料（專區、校園…填一次之後自動帶入）、number＝數字、list＝名單（可加代號，例如 A追求/B禱告/C出訪）、text＝文字、photo＝照片 */
const FIELD_TYPES = { info: '記住的資料', number: '數字', list: '名單', text: '文字', photo: '照片' };
const newId = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const DEFAULT_FIELDS = () => [
  { id: 'f1', type: 'info', label: '專區' },
  { id: 'f2', type: 'info', label: '校園' },
  { id: 'f3', type: 'number', label: '青少年家聚會數' },
  { id: 'f4', type: 'list', label: '陪排成員', slots: 5, tags: ['A追求', 'B禱告', 'C出訪'] },
  { id: 'f5', type: 'list', label: '邀約人入排', slots: 1, tags: [] },
  { id: 'f6', type: 'list', label: '與牧養者/得少聯絡', slots: 5, tags: [] },
  { id: 'f7', type: 'list', label: '邀約主日', slots: 3, tags: [] },
  { id: 'f8', type: 'text', label: '本週重點（選填）' },
  { id: 'f9', type: 'photo', label: '照片（選填）' },
];
/** 代號「A追求」在名單上只顯示「A」 */
const tagCode = t => /^[A-Za-z0-9]/.test(t) ? t[0] : t;
const fieldTitle = f => f.type === 'list' && (f.tags || []).length ? `${f.label}（${f.tags.join('/')}）` : f.label;
const plainLabel = f => f.label.replace(/（選填）$/, '');
const listItems = v => (Array.isArray(v) ? v : []).filter(x => x && String(x.n || '').trim());
const MAX_PHOTOS = 4;

/** 回報轉成文字，格式跟大家原本在群組貼的一樣 */
function reportText(p, r) {
  const L = [weekLabel(r.week), `【${r.name}】`];
  let afterBlock = false;
  p.fields.forEach(f => {
    const v = (r.data || {})[f.id];
    if (f.type === 'info' || f.type === 'number') {
      if (afterBlock) { L.push(''); afterBlock = false; }
      L.push(`${f.label}：${v ?? ''}`);
    } else if (f.type === 'list') {
      const it = listItems(v);
      L.push('', `${fieldTitle(f)}：`);
      (it.length ? it : [{ n: '' }]).forEach((x, i) => L.push(`${i + 1}.${x.n}${(x.t || []).map(tagCode).join('')}`));
      afterBlock = true;
    } else if (f.type === 'text' && String(v || '').trim()) {
      L.push('', `${plainLabel(f)}：`, String(v).trim());
      afterBlock = true;
    }
  });
  return L.join('\n');
}

/** 統計用的指標：回報人數、每個數字欄位的總和、每個名單的人數與各代號人數 */
function metricsOf(p) {
  const out = [{ key: '_n', label: '回報人數', get: () => 1 }];
  p.fields.forEach(f => {
    if (f.type === 'number') out.push({ key: f.id, label: f.label, get: r => +((r.data || {})[f.id]) || 0 });
    if (f.type === 'list') {
      out.push({ key: f.id, label: `${f.label}（人）`, get: r => listItems((r.data || {})[f.id]).length });
      (f.tags || []).forEach(t => out.push({ key: `${f.id}:${t}`, label: `${f.label}・${t}`, sub: true,
        get: r => listItems((r.data || {})[f.id]).filter(x => (x.t || []).includes(t)).length }));
    }
  });
  return out;
}
const sumOf = (m, reps) => reps.reduce((n, r) => n + m.get(r), 0);

/* ================= 圖卡色調（沿用活動登記平台） ================= */
const THEMES = {
  classic: { name: '經典',     btn: '#2F3343', notch: '#C49356', paper: '#FFFDF8', ink: '#2F3343', muted: '#67645F', line: '#E4DCCC' },
  feast:   { name: '愛筵聚餐', btn: '#9A3B26', notch: '#E0A458', paper: '#FFF8F1', ink: '#3A2A22', muted: '#7A6457', line: '#EEDCCB' },
  prayer:  { name: '禱告',     btn: '#2B4C7E', notch: '#9DB4D3', paper: '#F6F8FC', ink: '#1F2D44', muted: '#5D6B80', line: '#D9E1EE' },
  gospel:  { name: '福音開展', btn: '#2E6B4F', notch: '#A8C686', paper: '#F6FAF4', ink: '#1F3A2D', muted: '#5B6E62', line: '#D7E5D4' },
  youth:   { name: '青年',     btn: '#6B3FA0', notch: '#F2B84B', paper: '#FBF8FF', ink: '#2E2240', muted: '#6C6280', line: '#E4DCF0' },
  kids:    { name: '兒童',     btn: '#B4470F', notch: '#F4C542', paper: '#FFFBEF', ink: '#3B2A12', muted: '#7A6A50', line: '#F0E2C2' },
  study:   { name: '讀經成全', btn: '#5B4636', notch: '#C9A66B', paper: '#FAF6EF', ink: '#33281F', muted: '#6F6255', line: '#E6DCCB' },
  service: { name: '服事',     btn: '#1F6F78', notch: '#8FC1C7', paper: '#F4FAFA', ink: '#173B40', muted: '#587073', line: '#D3E6E8' },
};
const themeOf = p => THEMES[p && p.theme] || THEMES.classic;
const themeVars = t => `--paper:${t.paper};--line:${t.btn};--marigold:${t.notch};--ink:${t.ink};--ink-2:${t.muted};--rule:${t.line}`;

function ticket(p, stubHtml, extra = '') {
  return `<article class="ticket" style="${themeVars(themeOf(p))}">
    ${extra}
    <div class="main">
      <h2 class="title">${esc(p.title || '')}</h2>
      ${p.desc ? `<p class="desc">${esc(p.desc)}</p>` : ''}
    </div>
    <div class="perf" aria-hidden="true"></div>
    ${stubHtml}
  </article>`;
}

/* ================= 預覽模式用的假資料 ================= */
const DEMO_NOW = new Date(2026, 10, 2, 9, 0); // 11/2（一）早上：要回報 10/26～11/1
const demo = (() => {
  const people = {
    U1: { name: '孫學暐', info: { 專區: '復興', 校園: '台中高工' } },
    U2: { name: '簡晨光', info: { 專區: '復興', 校園: '台中一中' } },
    U3: { name: '王小明', info: { 專區: '北屯', 校園: '東山高中' } },
    U4: { name: '陳怡君', info: { 專區: '北屯', 校園: '文華高中' } },
    U5: { name: '林志豪', info: { 專區: '西屯', 校園: '西苑高中' } },
  };
  const pool = ['甘樂與', '許祐耘', '劉冠佑', '陳延鑫', '尤昶景', '黃柏翰', '吳承恩', '張家瑜', '李品睿', '蔡宜庭', '鄭宇翔', '周芷安', '郭琳婷', '何俊廷', '謝語彤'];
  let seed = 11; const rnd = n => { seed = (seed * 9301 + 49297) % 233280; return Math.floor(seed / 233280 * n); };
  const pick = (k, tags) => Array.from({ length: k }, () => ({ n: pool[rnd(pool.length)], t: tags ? [tags[rnd(tags.length)]] : [] }));
  const reports = [];
  let w = parseYmd('2026-09-07');
  for (let i = 0; i < 8; i++, w = addDays(w, 7)) {
    const wk = ymd(w);
    Object.keys(people).forEach(uid => {
      if (wk === '2026-10-26' && (uid === 'U2' || uid === 'U5')) return; // 這週還沒交
      if (rnd(10) === 0) return;
      const pp = people[uid];
      reports.push({ id: `R${reports.length + 1}`, week: wk, userId: uid, name: pp.name, time: `${md(addDays(w, 7))} ${pad(8 + rnd(4))}:${pad(rnd(60))}`, late: rnd(8) === 0,
        data: { f1: pp.info.專區, f2: pp.info.校園, f3: 4 + rnd(9), f4: pick(2 + rnd(4), ['A追求', 'B禱告', 'C出訪']), f5: pick(rnd(2)), f6: pick(1 + rnd(3)), f7: pick(rnd(3)), f8: rnd(3) ? '' : '這週帶兩位新朋友參加家聚會，請為他們禱告。', f9: [] } });
    });
  }
  const ex = reports.find(r => r.week === '2026-10-26' && r.userId === 'U1');
  if (ex) Object.assign(ex, { late: false, data: { f1: '復興', f2: '台中高工', f3: 10,
    f4: [{ n: '甘樂與', t: ['A追求'] }, { n: '許祐耘', t: ['A追求'] }, { n: '劉冠佑', t: ['A追求'] }, { n: '陳延鑫', t: ['B禱告'] }, { n: '尤昶景', t: ['A追求'] }],
    f5: [], f6: [{ n: '郭琳婷', t: [] }], f7: [], f8: '', f9: [] } });
  if (DEMO_MODE === 'first') delete people.U2;
  return {
    me: { userId: 'U2', displayName: '晨光', isAdmin: true },
    people, reports,
    projects: [{ id: 'P1', title: '全時間工作重點回報', desc: '每週一中午前，回報上一週（週一～週日）的重點。', start: '2026-09-07', end: '', remindDay: 0, remindTime: '20:00', dueTime: '12:00', open: true, theme: 'youth', fields: DEFAULT_FIELDS(), created: '2026/9/1' }],
    members: { P1: ['U1', 'U2', 'U3', 'U4', 'U5'].filter(u => people[u]) },
  };
})();

/** 預設要回報的週：週六、週日填本週；週一到週五填上一週 */
function demoDefaultWeek(p) {
  const wd = DEMO_NOW.getDay();
  let w = mondayOf(DEMO_NOW);
  if (!(wd === 6 || wd === 0)) w = addDays(w, -7);
  const s = mondayOf(parseYmd(p.start));
  if (w < s) w = s;
  if (p.end && w > mondayOf(parseYmd(p.end))) w = mondayOf(parseYmd(p.end));
  return ymd(w);
}
function demoWeeks(p) {
  const out = [], last = parseYmd(demoDefaultWeek(p));
  for (let w = mondayOf(parseYmd(p.start)); w <= last; w = addDays(w, 7)) out.unshift(ymd(w));
  return out;
}
if (DEMO) window.liff = { isInClient: () => false, closeWindow() {}, isApiAvailable: () => false, getContext: () => null, isLoggedIn: () => true };

async function demoApi(action, d) {
  await sleep(250);
  const me = demo.me.userId;
  const P = id => demo.projects.find(p => p.id === id);
  const prof = () => demo.people[me] || { name: '', info: {} };
  const statsOf = p => ({ project: p, weeks: demoWeeks(p), defaultWeek: demoDefaultWeek(p),
    members: (demo.members[p.id] || []).map(u => ({ userId: u, name: demo.people[u].name, info: demo.people[u].info })),
    reports: demo.reports.filter(r => !r.project || r.project === p.id) });
  switch (action) {
    case 'me': return { ok: true, ...demo.me, profile: prof() };
    case 'listProjects': return { ok: true, projects: demo.projects.map(p => {
      const wk = demoDefaultWeek(p), got = demo.reports.filter(r => r.week === wk);
      return { ...p, defaultWeek: wk, submitted: got.length, memberCount: (demo.members[p.id] || []).length, mineDone: got.some(r => r.userId === me), isMember: (demo.members[p.id] || []).includes(me) };
    }) };
    case 'project': {
      const p = P(d.projectId); if (!p) throw new Error('找不到這個回報項目');
      const weeks = demoWeeks(p), wk = d.week && weeks.includes(d.week) ? d.week : demoDefaultWeek(p);
      const mineAll = demo.reports.filter(r => r.userId === me);
      if (DEMO_MODE === 'done' && !mineAll.some(r => r.week === wk)) demo.reports.push({ id: 'Rme', week: wk, userId: me, name: prof().name, time: '11/2 09:12', late: false, data: { f1: '復興', f2: '台中一中', f3: 6, f4: [{ n: '黃柏翰', t: ['A追求', 'C出訪'] }, { n: '李品睿', t: ['B禱告'] }], f5: [{ n: '蔡宜庭', t: [] }], f6: [], f7: [{ n: '黃柏翰', t: [] }], f8: '', f9: [] } });
      const mine = demo.reports.find(r => r.userId === me && r.week === wk) || null;
      const last = demo.reports.filter(r => r.userId === me && r.week < wk).sort((a, b) => b.week.localeCompare(a.week))[0] || null;
      return { ok: true, project: p, week: wk, weeks: weeks.map(w => ({ week: w, done: mineAll.some(r => r.week === w) || (mine && w === wk) })), mine, last, profile: prof() };
    }
    case 'saveProfile': demo.people[me] = { name: String(d.name || '').trim(), info: { ...prof().info, ...(d.info || {}) } }; if (!demo.people[me].name) throw new Error('請填寫姓名'); return { ok: true, profile: demo.people[me] };
    case 'submit': {
      const p = P(d.projectId);
      if (!prof().name) throw new Error('請先填寫姓名');
      const info = {}; p.fields.filter(f => f.type === 'info').forEach(f => { info[f.label] = d.data[f.id] || ''; });
      demo.people[me].info = { ...demo.people[me].info, ...info };
      if (!(demo.members[p.id] || []).includes(me)) (demo.members[p.id] = demo.members[p.id] || []).push(me);
      let r = demo.reports.find(x => x.userId === me && x.week === d.week);
      const now = `${md(DEMO_NOW)} ${pad(DEMO_NOW.getHours())}:${pad(DEMO_NOW.getMinutes())}`;
      if (r) Object.assign(r, { data: d.data, name: prof().name, edited: now });
      else demo.reports.push(r = { id: 'R' + Date.now(), week: d.week, userId: me, name: prof().name, time: now, late: false, data: d.data });
      return { ok: true, report: r, updated: !!r.edited, submitted: demo.reports.filter(x => x.week === d.week).length, memberCount: demo.members[p.id].length };
    }
    case 'myReports': return { ok: true, project: P(d.projectId), reports: demo.reports.filter(r => r.userId === me).sort((a, b) => b.week.localeCompare(a.week)) };
    case 'weekReports': return { ok: true, project: P(d.projectId), week: d.week, reports: demo.reports.filter(r => r.week === d.week) };
    case 'projectStats': return { ok: true, ...statsOf(P(d.projectId)) };
    case 'createProject': { const p = { ...d.project, id: 'P' + Date.now(), open: true, created: md(DEMO_NOW) }; demo.projects.unshift(p); demo.members[p.id] = []; return { ok: true, project: p }; }
    case 'updateProject': { const p = P(d.projectId); Object.assign(p, d.project); return { ok: true, project: p }; }
    case 'setOpen': { const p = P(d.projectId); p.open = d.open; return { ok: true, project: p }; }
    case 'deleteProject': demo.projects = demo.projects.filter(p => p.id !== d.projectId); return { ok: true };
    case 'removeMember': demo.members[d.projectId] = demo.members[d.projectId].filter(u => u !== d.userId); return { ok: true, ...statsOf(P(d.projectId)) };
    case 'uploadImage': return { ok: true, url: d.data };
    case 'myData': return { ok: true, found: !!demo.people[me], name: prof().name, info: prof().info, lineName: '簡晨光 Isaiah Chien', reports: demo.reports.filter(r => r.userId === me).length, projects: 1 };
    case 'deleteMyData': return { ok: true, reports: demo.reports.filter(r => r.userId === me).length };
  }
  throw new Error('預覽模式不支援：' + action);
}

/* ---------- 平台通行證：登入一次，60 天內不用再登入 ---------- */
const SESSION_KEY = 'report.session';
const getSession = () => { try { const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); return s && s.expires > Date.now() + 60000 ? s : null; } catch (e) { return null; } };
const setSession = s => { try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify({ token: s.token, expires: s.expires })) : localStorage.removeItem(SESSION_KEY); } catch (e) {} };

async function api(action, data = {}) {
  if (DEMO) return demoApi(action, data);
  const body = { action, ...data };
  const s = action === 'session' ? null : getSession();
  if (s) body.session = s.token; else body.idToken = liff.getIDToken();
  const r = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) {
    if (j.error === 'SESSION_EXPIRED') {
      setSession(null);
      if (liff.isLoggedIn()) return api(action, data);
      liff.login({ redirectUri: location.href }); throw new Error('登入已過期，正在重新登入');
    }
    if (j.error === 'TOKEN_EXPIRED') { liff.logout(); liff.login({ redirectUri: location.href }); throw new Error('登入已過期，正在重新登入'); }
    throw new Error(j.error);
  }
  return j;
}

/* ================= 入口 ================= */
let ME = null;
async function main() {
  try {
    if (PARAMS.has('install')) return installFlow();
    if (!DEMO) {
      await liff.init({ liffId: LIFF_ID });
      PARAMS = new URLSearchParams(location.search); // LIFF 會把 liff.line.me 後面的參數放回網址
      if (!liff.isLoggedIn() && !getSession()) { liff.login({ redirectUri: location.href }); return; }
      if (liff.isLoggedIn() && !getSession()) { try { setSession(await api('session')); } catch (e) {} }
    }
    if (PARAMS.has('mydata')) return myDataFlow();
    ME = await api('me');
    const pid = PARAMS.get('p');
    if (pid || ['report', 'first', 'done'].includes(DEMO_MODE)) return reportFlow(pid || 'P1', PARAMS.get('w'));
    await homeFlow();
    const rid = PARAMS.get('remind') || (DEMO_MODE === 'admin' ? 'P1' : '');
    if (rid && ME.isAdmin) openProject(rid, 'week');
  } catch (e) {
    view(`<section class="solo">${ticket({ title: '無法開啟' }, `<div class="result-msg"><p>${esc(e.message)}</p><p class="muted">請關閉後從 LINE 重新開啟一次。</p></div>`)}</section>`);
  }
}

const header = title => `<header class="top"><div class="brand"><img class="logo" src="img/in-christ.svg" alt="IN CHRIST 標誌" width="44" height="44"><h1>${esc(title)}</h1></div><button class="help" id="help" type="button" aria-label="使用教學">?</button></header>
  ${DEMO ? `<p class="demo-note">預覽模式：目前使用範例資料。</p>` : ''}`;
const subbar = (label, title) => `<div class="subbar"><button class="back" id="back">‹ ${esc(label)}</button>${title ? `<h1>${esc(title)}</h1>` : '<span></span>'}</div>`;

/* ================= 填寫回報 ================= */
let R = null; // 目前的回報表單 { project, week, weeks, mine, last, profile, data }

async function reportFlow(pid, wk) {
  view(loading());
  const r = await api('project', { projectId: pid, week: wk });
  R = r;
  document.title = r.project.title;
  if (!r.profile || !r.profile.name) return nameForm();
  if (DEMO_MODE === 'done' && r.mine) return resultView(r.mine, false, false);
  reportForm();
}

/** 第一次使用：留下姓名（之後都記得，可以在「我的資料」修改） */
function nameForm() {
  const p = R.project;
  view(`<section class="solo">
    ${ticket(p, `<div class="result-msg">
      <p><b>第一次回報，請留下你的姓名</b></p>
      <p class="muted" style="margin-bottom:14px">只要填這一次，之後打開就直接填回報。回報圖卡上會顯示這個名字。</p>
      <label class="field"><span>姓名</span><input id="f-name" autocomplete="name" value="${esc(DEMO ? '' : (ME && ME.displayName) || '')}" maxlength="20"></label>
      <button id="f-go" class="btn send" style="margin-top:6px">下一步：填寫回報</button>
    </div>`)}
  </section>`);
  const btn = $('f-go');
  btn.onclick = async () => {
    const name = $('f-name').value.trim();
    if (!name) { toast('請填寫姓名'); return; }
    btn.disabled = true; btn.textContent = '儲存中';
    try { R.profile = (await api('saveProfile', { name })).profile; reportForm(); }
    catch (e) { toast(e.message); btn.disabled = false; btn.textContent = '下一步：填寫回報'; }
  };
}

function blankData(p, profile) {
  const d = {};
  p.fields.forEach(f => {
    if (f.type === 'info') d[f.id] = (profile.info || {})[f.label] || '';
    else if (f.type === 'number') d[f.id] = '';
    else if (f.type === 'list') d[f.id] = Array.from({ length: Math.max(1, +f.slots || 1) }, () => ({ n: '', t: [] }));
    else if (f.type === 'text') d[f.id] = '';
    else if (f.type === 'photo') d[f.id] = [];
  });
  return d;
}
/** 名單至少保留設定的空格數 */
function padList(f, list) {
  const it = listItems(list).map(x => ({ n: x.n, t: [...(x.t || [])] }));
  while (it.length < (+f.slots || 1)) it.push({ n: '', t: [] });
  return it;
}
function dataFrom(p, src, profile) {
  const d = blankData(p, profile);
  if (!src) return d;
  p.fields.forEach(f => {
    const v = src[f.id];
    if (v == null) return;
    if (f.type === 'list') d[f.id] = padList(f, v);
    else if (f.type === 'photo') d[f.id] = Array.isArray(v) ? v.slice(0, MAX_PHOTOS) : [];
    else d[f.id] = v;
  });
  return d;
}

function reportForm() {
  const p = R.project, t = themeOf(p);
  if (!p.open) {
    view(`<section class="solo">${ticket(p, `<div class="result-msg"><p>這個回報項目已經停止回報。</p><p class="muted">有問題請聯絡管理員。</p></div>`)}${myDataLink()}</section>`);
    return;
  }
  R.data = dataFrom(p, R.mine && R.mine.data, R.profile);
  const hasLastList = R.last && p.fields.some(f => f.type === 'list' && listItems((R.last.data || {})[f.id]).length);
  view(`<section class="solo" style="padding-top:20px">
    <div class="week-bar"><select class="inp" id="wk" aria-label="回報哪一週">${R.weeks.map(w => `<option value="${w.week}" ${w.week === R.week ? 'selected' : ''}>${weekLabel(w.week)}${w.done ? '　✓ 已回報' : ''}</option>`).join('')}</select></div>
    <p class="due">截止：<b>${dueLabel(R.week, p.dueTime)}</b></p>
    ${R.mine ? `<p class="note-ok">你已經回報過這一週，修改後再按一次送出即可。</p>` : ''}
    <form class="rform" id="rform" style="${themeVars(t)}" novalidate>
      <p class="who">【${esc(R.profile.name)}】</p>
      <p class="proj">${esc(p.title)}・${weekLabel(R.week)}</p>
      ${hasLastList && !R.mine ? `<button type="button" class="btn plain small carry" id="carry">帶入上週（${weekLabel(R.last.week)}）的名單</button>` : ''}
      <div id="fields"></div>
    </form>
    <div class="dock"><div class="inner"><button class="btn send" id="submit">${R.mine ? '儲存修改並發到群組' : '送出回報'}</button></div></div>
    <footer class="page-foot"><a class="mydata-link" href="#" id="my-hist">我的回報紀錄</a><a class="mydata-link" href="#" id="week-all">本週大家的回報</a>${myDataLinkInline()}</footer>
  </section>`);
  drawFields();
  $('wk').onchange = () => reportFlow(p.id, $('wk').value);
  if ($('carry')) $('carry').onclick = () => {
    p.fields.forEach(f => { if (f.type === 'list' && listItems(R.last.data[f.id]).length) R.data[f.id] = padList(f, R.last.data[f.id]); });
    drawFields(); toast('已帶入上週的名單，有變動再修改');
  };
  $('submit').onclick = submitReport;
  $('my-hist').onclick = e => { e.preventDefault(); historyFlow(p.id); };
  $('week-all').onclick = e => { e.preventDefault(); weekAllFlow(p.id, R.week); };
}

function drawFields() {
  const p = R.project, d = R.data;
  const infos = p.fields.filter(f => f.type === 'info');
  let html = '';
  if (infos.length) {
    html += `<div class="group"><div class="info-row" style="${infos.length === 1 ? 'grid-template-columns:1fr' : ''}">${infos.map(f =>
      `<label class="field"><span>${esc(f.label)}</span><input class="inp" data-info="${f.id}" value="${esc(d[f.id])}" maxlength="30"></label>`).join('')}</div>
      <p class="remember">這些會記住，下次自動帶入，也可以隨時改。</p></div>`;
  }
  p.fields.forEach(f => {
    if (f.type === 'info') return;
    if (f.type === 'number') {
      html += `<div class="group"><label class="field"><span style="font-weight:700;color:var(--ink);font-size:15px">${esc(f.label)}</span><input class="inp num" type="number" inputmode="numeric" min="0" data-num="${f.id}" value="${esc(d[f.id])}" placeholder="0"></label></div>`;
    } else if (f.type === 'list') {
      const tags = f.tags || [];
      html += `<div class="group"><h2>${esc(f.label)}<small>${listItems(d[f.id]).length} 人</small></h2>
        ${tags.length ? `<p class="legend">${tags.map(esc).join('／')}（可複選）</p>` : ''}
        ${d[f.id].map((x, i) => `<div class="li"><span class="no">${i + 1}.</span><input data-list="${f.id}" data-i="${i}" value="${esc(x.n)}" maxlength="20" aria-label="${esc(f.label)} 第 ${i + 1} 位">
          ${tags.length ? `<span class="tagset">${tags.map(tg => `<button type="button" data-tag="${f.id}" data-i="${i}" data-t="${esc(tg)}" aria-pressed="${(x.t || []).includes(tg)}" title="${esc(tg)}">${esc(tagCode(tg))}</button>`).join('')}</span>` : '<span></span>'}</div>`).join('')}
        <button type="button" class="add-slot" data-add="${f.id}">＋ 再加一格</button></div>`;
    } else if (f.type === 'text') {
      html += `<div class="group"><label class="field"><span style="font-weight:700;color:var(--ink);font-size:15px">${esc(f.label)}</span><textarea class="inp" data-text="${f.id}" maxlength="1000" rows="4">${esc(d[f.id])}</textarea></label></div>`;
    } else if (f.type === 'photo') {
      html += `<div class="group"><h2>${esc(f.label)}<small>最多 ${MAX_PHOTOS} 張</small></h2>
        <div class="photos">${d[f.id].map((u, i) => `<div class="ph"><img src="${esc(u)}" alt=""><button type="button" data-delph="${f.id}" data-i="${i}" aria-label="移除照片">×</button></div>`).join('')}</div>
        ${d[f.id].length < MAX_PHOTOS ? `<label class="btn plain small" style="cursor:pointer">上傳照片<input type="file" accept="image/*" multiple data-photo="${f.id}" hidden></label> <span class="legend" id="ph-status-${f.id}"></span>` : ''}</div>`;
    }
  });
  $('fields').innerHTML = html;
  $$('[data-info]').forEach(el => el.oninput = () => { d[el.dataset.info] = el.value; });
  $$('[data-num]').forEach(el => el.oninput = () => { d[el.dataset.num] = el.value; });
  $$('[data-text]').forEach(el => el.oninput = () => { d[el.dataset.text] = el.value; });
  $$('[data-list]').forEach(el => el.oninput = () => {
    d[el.dataset.list][+el.dataset.i].n = el.value;
    const h = el.closest('.group').querySelector('h2 small'); if (h) h.textContent = `${listItems(d[el.dataset.list]).length} 人`;
  });
  $$('[data-tag]').forEach(b => b.onclick = () => {
    const x = d[b.dataset.tag][+b.dataset.i], tg = b.dataset.t;
    x.t = x.t.includes(tg) ? x.t.filter(y => y !== tg) : x.t.concat(tg);
    b.setAttribute('aria-pressed', x.t.includes(tg));
  });
  $$('[data-add]').forEach(b => b.onclick = () => {
    d[b.dataset.add].push({ n: '', t: [] }); drawFields();
    const ins = $$(`[data-list="${b.dataset.add}"]`); ins[ins.length - 1].focus();
  });
  $$('[data-delph]').forEach(b => b.onclick = () => { d[b.dataset.delph].splice(+b.dataset.i, 1); drawFields(); });
  $$('[data-photo]').forEach(inp => inp.onchange = () => uploadPhotos(inp));
}

async function uploadPhotos(inp) {
  const fid = inp.dataset.photo, files = Array.from(inp.files || []);
  inp.value = '';
  const st = $(`ph-status-${fid}`);
  for (const file of files) {
    if (R.data[fid].length >= MAX_PHOTOS) { toast(`最多 ${MAX_PHOTOS} 張`); break; }
    st.textContent = '上傳中…';
    try {
      const dataUrl = await shrinkImage(file, 1200, 0.82);
      R.data[fid].push((await api('uploadImage', { data: dataUrl, mime: 'image/jpeg' })).url);
    } catch (e) { toast('上傳失敗：' + e.message); }
  }
  drawFields();
}

function shrinkImage(file, maxW, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('無法讀取這張圖片'));
    img.src = URL.createObjectURL(file);
  });
}

/** 送出前整理：名單去掉空格、數字轉成數字 */
function cleanData(p, d) {
  const out = {};
  p.fields.forEach(f => {
    const v = d[f.id];
    if (f.type === 'list') out[f.id] = listItems(v).map(x => ({ n: String(x.n).trim(), t: (x.t || []).filter(t => (f.tags || []).includes(t)) }));
    else if (f.type === 'number') out[f.id] = String(v).trim() === '' ? '' : Math.max(0, Number(v) || 0);
    else if (f.type === 'photo') out[f.id] = (v || []).slice(0, MAX_PHOTOS);
    else out[f.id] = String(v || '').trim();
  });
  return out;
}

async function submitReport() {
  const p = R.project, btn = $('submit'), label = btn.textContent;
  const data = cleanData(p, R.data);
  const missingInfo = p.fields.filter(f => f.type === 'info' && !data[f.id]).map(f => f.label);
  if (missingInfo.length) { toast(`請填寫${missingInfo.join('、')}`); return; }
  btn.disabled = true; btn.textContent = '送出中';
  try {
    const r = await api('submit', { projectId: p.id, week: R.week, data });
    resultView(r.report, true, r.updated, r);
  } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = label; }
}

/** 送出後：蓋章、顯示回報內容、自動在群組貼出回報圖卡 */
function resultView(rep, justSent, updated, extra = {}) {
  const p = R.project;
  view(`<section class="solo">
    ${ticket({ ...p, desc: '' }, `<div class="result-msg">
      <p>${esc(rep.name)}，${weekLabel(rep.week)} ${updated ? '的回報已更新' : justSent ? '回報完成' : '已經回報了'}。</p>
      ${extra.memberCount ? `<p class="muted">這週已有 ${extra.submitted}／${extra.memberCount} 人回報。</p>` : ''}
      <p class="posted" id="posted" hidden></p>
      <details class="rep" style="margin-top:12px;padding:10px 0 0;background:none" open><summary><span class="nm">回報內容</span></summary><div class="body"><pre class="rtext">${esc(reportText(p, rep))}</pre>${photosHtml(p, rep)}</div></details>
    </div>`, `<div class="stamp land" aria-hidden="true">已回報</div>`)}
    <button class="btn send" style="margin-top:18px" id="post-again">發到群組</button>
    <div class="btn-row"><button class="btn plain" id="copy">複製成文字</button><button class="btn plain" id="edit">修改回報</button></div>
    ${liff.isInClient() ? `<button class="btn plain" style="margin-top:10px" onclick="liff.closeWindow()">回到聊天室</button>` : ''}
    <footer class="page-foot"><a class="mydata-link" href="#" id="my-hist">我的回報紀錄</a><a class="mydata-link" href="#" id="week-all">本週大家的回報</a></footer>
  </section>`);
  $('copy').onclick = () => copyText(reportText(p, rep), '已複製，可以貼到任何地方');
  $('edit').onclick = () => { R.mine = rep; R.week = rep.week; reportForm(); };
  $('my-hist').onclick = e => { e.preventDefault(); historyFlow(p.id); };
  $('week-all').onclick = e => { e.preventDefault(); weekAllFlow(p.id, rep.week); };
  const again = $('post-again');
  again.onclick = async () => { again.disabled = true; const ok = await postReport(p, rep, true); again.disabled = false; if (ok) again.textContent = '再發一次到群組'; };
  if (justSent) postReport(p, rep, false).then(ok => { if (ok) again.textContent = '再發一次到群組'; });
}

const photosHtml = (p, rep) => {
  const urls = p.fields.filter(f => f.type === 'photo').flatMap(f => (rep.data || {})[f.id] || []);
  return urls.length ? `<div class="rphotos">${urls.map(u => `<img src="${esc(u)}" alt="" loading="lazy">`).join('')}</div>` : '';
};

/** 從群組裡打開的就直接以本人名義貼到那個群組；不是的話用 LINE 的選單選群組 */
async function postReport(p, rep, viaPicker) {
  const note = $('posted');
  const say = t => { if (note) { note.hidden = false; note.textContent = t; } };
  const msg = reportFlex(p, rep);
  if (DEMO) { say('預覽模式：正式版會在群組貼出你的回報圖卡'); return false; }
  const ctx = liff.isInClient() ? liff.getContext() : null;
  const inChat = ctx && ['group', 'room', 'utou'].includes(ctx.type);
  if (inChat && !viaPicker) {
    try {
      if (liff.permission) {
        const q = await liff.permission.query('chat_message.write').catch(() => null);
        if (q && q.state === 'prompt') await liff.permission.requestAll().catch(() => {});
      }
      await liff.sendMessages([msg]);
      say('已在群組貼出你的回報'); return true;
    } catch (e) { say(`沒有貼到群組（${e.message}），可以按下面「發到群組」再試一次。`); return false; }
  }
  if (!viaPicker) { say('按「發到群組」選擇要貼到哪個群組。'); return false; }
  return pickAndSend(msg, '已發到群組');
}

async function pickAndSend(msg, done) {
  if (DEMO) { toast('預覽模式：正式版會在這裡跳出群組選單'); return false; }
  if (!liff.isLoggedIn()) { toast('發到群組前需要登入 LINE 一次'); setTimeout(() => liff.login({ redirectUri: location.href }), 600); return false; }
  if (!liff.isApiAvailable('shareTargetPicker')) { toast('無法開啟群組選單，請確認 LIFF 已開啟 Share target picker'); return false; }
  try {
    const res = await liff.shareTargetPicker([msg], { isMultiple: true });
    toast(res ? done : '已取消'); return !!res;
  } catch (e) { toast('發送失敗：' + e.message); return false; }
}

/** 自己的歷史回報 */
async function historyFlow(pid) {
  view(loading());
  const r = await api('myReports', { projectId: pid });
  const p = r.project;
  view(`${subbar('返回', '我的回報紀錄')}
    <p class="summary">${esc(p.title)}・共 ${r.reports.length} 週</p>
    ${r.reports.length ? r.reports.map((x, i) => repCard(p, x, i === 0, true)).join('') : '<p class="empty">還沒有回報紀錄。</p>'}`);
  $('back').onclick = () => reportFlow(pid, R && R.week);
  bindRepCards(p, r.reports);
}

/** 本週大家的回報（每週的文字大家都看得到） */
async function weekAllFlow(pid, wk) {
  view(loading());
  const r = await api('weekReports', { projectId: pid, week: wk });
  const p = r.project;
  view(`${subbar('返回', `${weekLabel(wk)} 的回報`)}
    <p class="summary">${esc(p.title)}・${r.reports.length} 人已回報</p>
    ${r.reports.length ? r.reports.map(x => repCard(p, x, false, false)).join('') : '<p class="empty">這週還沒有人回報。</p>'}`);
  $('back').onclick = () => reportFlow(pid, wk);
  bindRepCards(p, r.reports);
}

/** 一則回報（可展開） */
function repCard(p, x, open, showWeek) {
  return `<details class="rep" ${open ? 'open' : ''}>
    <summary><span class="nm">${showWeek ? weekLabel(x.week) : esc(x.name)}${x.late ? '<span class="late">逾期</span>' : ''}</span><span class="mt">${esc(x.time || '')}</span></summary>
    <div class="body"><pre class="rtext">${esc(reportText(p, x))}</pre>${photosHtml(p, x)}
      <div class="rep-acts"><button class="btn plain small" data-copy="${esc(x.id)}">複製文字</button></div></div>
  </details>`;
}
function bindRepCards(p, list) {
  $$('[data-copy]').forEach(b => b.onclick = () => { const x = list.find(y => y.id === b.dataset.copy); copyText(reportText(p, x), '已複製'); });
}

/* ================= 首頁 ================= */
let PROJECTS = [], TAB = 'mine';
async function homeFlow() {
  view(loading());
  document.title = '全時間工作重點回報';
  PROJECTS = (await api('listProjects')).projects;
  renderHome();
  if (!PARAMS.has('notour') && !PARAMS.get('remind') && DEMO_MODE !== 'admin') maybeStartTour();
}

function renderHome() {
  view(`${header('全時間工作重點回報')}
    <nav class="tabs" role="tablist">
      <button role="tab" aria-selected="${TAB === 'mine'}" data-tab="mine">我的回報</button>
      ${ME.isAdmin ? `<button role="tab" aria-selected="${TAB === 'admin'}" data-tab="admin">管理<span class="n">${PROJECTS.length}</span></button>` : ''}
    </nav>
    <div id="panel"></div>
    <footer class="page-foot">${isStandalone() ? '' : '<a class="mydata-link" href="#" id="install-link">安裝到手機桌面</a>'}${myDataLinkInline()}</footer>`);
  $$('[data-tab]').forEach(b => b.onclick = () => { TAB = b.dataset.tab; renderHome(); });
  $('help').onclick = () => startTour(TOUR_STEPS);
  if ($('install-link')) $('install-link').onclick = e => { e.preventDefault(); startInstall(); };
  TAB === 'admin' && ME.isAdmin ? renderAdminList() : renderMine();
}

function renderMine() {
  const list = PROJECTS.filter(p => p.open);
  $('panel').innerHTML = list.length ? `<div class="stubs">${list.map(p => `
    <button class="stub-card proj-card" data-open="${p.id}" style="${themeVars(themeOf(p))};border-left:6px solid var(--line)">
      <div class="info"><div class="t">${esc(p.title)}</div>
        <div class="d">${weekLabel(p.defaultWeek)}・截止 <b>${dueLabel(p.defaultWeek, p.dueTime)}</b></div>
        ${p.mineDone ? '<span class="pill ok">已回報</span>' : '<span class="pill todo">還沒回報</span>'}</div>
      <div class="count"><b>${p.submitted}</b><small>／${p.memberCount} 人已交</small></div>
    </button>`).join('')}</div>`
    : `<div class="empty"><p>目前沒有進行中的回報項目。</p><p class="muted">管理員建立項目後，會在群組貼出提醒，點提醒就能填寫。</p></div>`;
  $$('[data-open]').forEach(b => b.onclick = () => reportFlow(b.dataset.open));
}

function renderAdminList() {
  $('panel').innerHTML = `<button class="btn send" id="new-proj" style="margin-bottom:16px">＋ 建立新的回報項目</button>
    ${PROJECTS.length ? `<div class="stubs">${PROJECTS.map(p => `
      <button class="stub-card proj-card ${p.open ? '' : 'past'}" data-proj="${p.id}" style="${themeVars(themeOf(p))};border-left:6px solid var(--line)">
        <div class="info"><div class="t">${esc(p.title)}</div>
          <div class="d">每週${REMIND_DAYS[p.remindDay] ? REMIND_DAYS[p.remindDay].slice(1) : '日'} ${esc(p.remindTime)} 提醒・週一 ${esc(p.dueTime)} 截止</div>
          ${p.open ? `<span class="pill ok">回報中</span>` : '<span class="pill off">已停止</span>'}</div>
        <div class="count"><b>${p.submitted}</b><small>／${p.memberCount}<br>${weekLabel(p.defaultWeek)}</small></div>
      </button>`).join('')}</div>` : '<p class="empty">還沒有回報項目，按上面的按鈕建立第一個。</p>'}`;
  $('new-proj').onclick = () => editProject(null);
  $$('[data-proj]').forEach(b => b.onclick = () => openProject(b.dataset.proj, 'week'));
}

/* ================= 建立／編輯回報項目 ================= */
let PD = null; // 編輯中的項目
function editProject(p) {
  const isNew = !p;
  PD = p ? JSON.parse(JSON.stringify(p)) : { title: '全時間工作重點回報', desc: '每週一中午前，回報上一週（週一～週日）的重點。', start: ymd(mondayOf(new Date())), end: '', remindDay: 0, remindTime: '20:00', dueTime: '12:00', theme: 'youth', fields: DEFAULT_FIELDS() };
  view(`${subbar(isNew ? '返回' : '返回項目', isNew ? '建立回報項目' : '編輯項目')}
    <div class="group"><label class="field"><span>項目名稱</span><input class="inp" id="pj-title" maxlength="40" value="${esc(PD.title)}"></label>
      <label class="field"><span>說明（顯示在填寫頁）</span><textarea class="inp" id="pj-desc" rows="2" maxlength="200">${esc(PD.desc)}</textarea></label></div>
    <div class="group"><h2>期間</h2><div class="row2">
      <label class="field"><span>從哪一週開始</span><input class="inp" type="date" id="pj-start" value="${esc(PD.start)}"></label>
      <label class="field"><span>到哪一週結束（選填）</span><input class="inp" type="date" id="pj-end" value="${esc(PD.end)}"></label></div>
      <p class="help" style="font-size:12px;color:var(--ink-2);margin:0">一週是週一～週日；選任何一天都會算那一整週。沒填結束就一直進行到你按「停止回報」。</p></div>
    <div class="group"><h2>提醒與截止</h2><div class="row2">
      <label class="field"><span>提醒管理員</span><select class="inp" id="pj-rday">${Object.entries(REMIND_DAYS).map(([k, v]) => `<option value="${k}" ${+k === +PD.remindDay ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span>提醒時間</span><input class="inp" type="time" id="pj-rtime" value="${esc(PD.remindTime)}"></label></div>
      <label class="field"><span>截止：該週結束後的週一幾點</span><input class="inp" type="time" id="pj-due" value="${esc(PD.dueTime)}" style="max-width:12em"></label>
      <p class="help" style="font-size:12px;color:var(--ink-2);margin:0">時間到了會寄 Email 給管理員，信裡有連結，點一下就能把提醒卡貼到群組。</p></div>
    <div class="group"><h2>圖卡色調</h2><div class="tones" role="radiogroup">${Object.entries(THEMES).map(([k, t]) => `<button type="button" role="radio" aria-checked="${PD.theme === k}" data-theme="${k}" style="--sw:${t.btn};--sw2:${t.notch}"><i></i>${t.name}</button>`).join('')}</div></div>
    <div class="group"><h2>回報欄位</h2><p style="font-size:13px;color:var(--ink-2);margin:-4px 0 10px">照順序顯示在填寫頁和群組圖卡上。名單可以設定預設幾格（填的人還能再加），和可複選的代號。</p>
      <div id="pj-fields"></div>
      <div class="add-field">${Object.entries(FIELD_TYPES).map(([k, v]) => `<button type="button" class="chip" data-addf="${k}">＋ ${v}</button>`).join('')}</div></div>
    ${isNew ? '' : `<div class="group"><h2>停止或刪除</h2>
      <button class="btn plain" id="pj-open">${PD.open ? '停止回報' : '重新開放回報'}</button>
      <button class="btn cancel" id="pj-del" style="margin-top:10px">刪除這個項目</button>
      <p style="font-size:12px;color:var(--ink-2)">刪除項目時，所有回報紀錄也會一起刪除，無法復原。只想暫停請用「停止回報」。</p></div>`}
    <div class="dock"><div class="inner"><button class="btn send" id="pj-save">${isNew ? '建立項目' : '儲存'}</button></div></div>`);
  drawFieldEditor();
  $('back').onclick = () => isNew ? renderHome() : openProject(p.id, 'settings');
  $$('[data-theme]').forEach(b => b.onclick = () => { PD.theme = b.dataset.theme; $$('[data-theme]').forEach(x => x.setAttribute('aria-checked', x === b)); });
  $$('[data-addf]').forEach(b => b.onclick = () => {
    const type = b.dataset.addf;
    PD.fields.push({ id: newId(), type, label: '', slots: type === 'list' ? 3 : undefined, tags: type === 'list' ? [] : undefined });
    drawFieldEditor(); const ins = $$('[data-flabel]'); ins[ins.length - 1].focus();
  });
  if ($('pj-open')) $('pj-open').onclick = async () => {
    const r = await api('setOpen', { projectId: p.id, open: !PD.open }); toast(r.project.open ? '已重新開放回報' : '已停止回報');
    await reloadProjects(); openProject(p.id, 'settings');
  };
  if ($('pj-del')) $('pj-del').onclick = () => armThen($('pj-del'), '確定刪除？所有回報都會刪除，再按一次', async () => {
    await api('deleteProject', { projectId: p.id }); toast('已刪除'); await reloadProjects(); TAB = 'admin'; renderHome();
  });
  $('pj-save').onclick = () => saveProject(isNew, p);
}

function drawFieldEditor() {
  $('pj-fields').innerHTML = PD.fields.map((f, i) => `<div class="fcard" data-fi="${i}">
    <div class="top">
      <select class="inp" data-ftype="${i}" aria-label="欄位類型">${Object.entries(FIELD_TYPES).map(([k, v]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <input class="inp" data-flabel="${i}" value="${esc(f.label)}" placeholder="欄位名稱" maxlength="30">
      <span class="ctl"><button type="button" data-up="${i}" aria-label="上移" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-down="${i}" aria-label="下移" ${i === PD.fields.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-delf="${i}" aria-label="刪除欄位">×</button></span>
    </div>
    ${f.type === 'list' ? `<div class="sub"><span>預設幾格</span><input class="inp" type="number" inputmode="numeric" min="1" max="30" list="slot-opts" data-slots="${i}" value="${+f.slots || 1}" style="max-width:7em">
      <span>代號（選填）</span><input class="inp" data-tags="${i}" value="${esc((f.tags || []).join('/'))}" placeholder="例如 A追求/B禱告/C出訪"></div>
      <p class="hint">代號用「/」分開，填的人可以複選；名單上只顯示第一個字母，例如「甘樂與A」。</p>` : ''}
    ${f.type === 'info' ? '<p class="hint">每個人填一次就記住，下週自動帶入，例如專區、校園。</p>' : ''}
  </div>`).join('') + `<datalist id="slot-opts">${[1, 2, 3, 4, 5, 6, 8, 10].map(n => `<option value="${n}">`).join('')}</datalist>`;
  const F = i => PD.fields[+i];
  $$('[data-ftype]').forEach(el => el.onchange = () => { const f = F(el.dataset.ftype); f.type = el.value; if (f.type === 'list') { f.slots = f.slots || 3; f.tags = f.tags || []; } drawFieldEditor(); });
  $$('[data-flabel]').forEach(el => el.oninput = () => { F(el.dataset.flabel).label = el.value; });
  $$('[data-slots]').forEach(el => el.oninput = () => { F(el.dataset.slots).slots = Math.min(30, Math.max(1, parseInt(el.value, 10) || 1)); });
  $$('[data-tags]').forEach(el => el.oninput = () => { F(el.dataset.tags).tags = el.value.split(/[\/／,，、]/).map(s => s.trim()).filter(Boolean).slice(0, 6); });
  const move = (i, d) => { const a = PD.fields; [a[i], a[i + d]] = [a[i + d], a[i]]; drawFieldEditor(); };
  $$('[data-up]').forEach(b => b.onclick = () => move(+b.dataset.up, -1));
  $$('[data-down]').forEach(b => b.onclick = () => move(+b.dataset.down, 1));
  $$('[data-delf]').forEach(b => b.onclick = () => {
    if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = '刪'; setTimeout(() => { if (b.isConnected) { b.classList.remove('armed'); b.textContent = '×'; } }, 3000); return; }
    PD.fields.splice(+b.dataset.delf, 1); drawFieldEditor();
  });
}

async function saveProject(isNew, old) {
  const btn = $('pj-save'), label = btn.textContent;
  const proj = { title: $('pj-title').value.trim(), desc: $('pj-desc').value.trim(), start: $('pj-start').value, end: $('pj-end').value,
    remindDay: +$('pj-rday').value, remindTime: $('pj-rtime').value || '20:00', dueTime: $('pj-due').value || '12:00', theme: PD.theme,
    fields: PD.fields.map(f => ({ ...f, label: String(f.label || '').trim() })).filter(f => f.label) };
  if (!proj.title) { toast('請填寫項目名稱'); return; }
  if (!proj.start) { toast('請選擇開始的週'); return; }
  if (!proj.fields.length) { toast('至少要有一個回報欄位'); return; }
  if (PD.fields.some(f => !String(f.label || '').trim())) { toast('有欄位沒有名稱，請填寫或刪除'); return; }
  btn.disabled = true; btn.textContent = '儲存中';
  try {
    const r = isNew ? await api('createProject', { project: proj }) : await api('updateProject', { projectId: old.id, project: proj });
    toast(isNew ? '已建立，可以把填寫連結或提醒卡發到群組' : '已儲存');
    await reloadProjects();
    openProject(r.project.id, isNew ? 'week' : 'settings');
  } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = label; }
}

async function reloadProjects() { try { PROJECTS = (await api('listProjects')).projects; } catch (e) {} }

/* ================= 管理員：項目詳情 ================= */
let S = null, PTAB = 'week', SWEEK = null, GROUPBY = '', RANGE = 'all', TREND = '_n';

async function openProject(pid, tab) {
  view(loading());
  S = await api('projectStats', { projectId: pid });
  PTAB = tab || 'week';
  if (!SWEEK || !S.weeks.includes(SWEEK)) SWEEK = S.defaultWeek;
  const infos = S.project.fields.filter(f => f.type === 'info');
  if (!infos.some(f => f.id === GROUPBY)) GROUPBY = infos[0] ? infos[0].id : '';
  renderProject();
}

function renderProject() {
  const p = S.project;
  document.title = p.title;
  view(`${subbar('所有項目', '')}
    <h1 class="form-title" style="margin-top:0">${esc(p.title)} ${p.open ? '' : '<span class="pill off">已停止</span>'}</h1>
    <nav class="tabs" role="tablist">
      ${[['week', '每週'], ['agg', '彙整'], ['members', `成員<span class="n">${S.members.length}</span>`], ['settings', '設定']].map(([k, v]) => `<button role="tab" aria-selected="${PTAB === k}" data-ptab="${k}">${v}</button>`).join('')}
    </nav>
    <div id="ppanel"></div>`);
  $('back').onclick = () => { TAB = 'admin'; renderHome(); };
  $$('[data-ptab]').forEach(b => b.onclick = () => { PTAB = b.dataset.ptab; renderProject(); });
  if (PTAB === 'week') renderWeekTab();
  else if (PTAB === 'agg') renderAggTab();
  else if (PTAB === 'members') renderMembersTab();
  else editProjectInline();
}

const weekReps = wk => S.reports.filter(r => r.week === wk).sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hant'));

function renderWeekTab() {
  const p = S.project, wk = SWEEK, reps = weekReps(wk);
  const got = new Set(reps.map(r => r.userId));
  const missing = S.members.filter(m => !got.has(m.userId));
  const late = reps.filter(r => r.late).length;
  const ms = metricsOf(p).filter(m => m.key !== '_n');
  $('ppanel').innerHTML = `
    <h2 class="print-title">${esc(p.title)}・${weekLabel(wk)}</h2>
    <div class="week-bar"><select class="inp" id="swk">${S.weeks.map(w => `<option value="${w}" ${w === wk ? 'selected' : ''}>${weekLabel(w)}${w === S.defaultWeek ? '（本次）' : ''}</option>`).join('')}</select></div>
    <p class="due">截止：<b>${dueLabel(wk, p.dueTime)}</b></p>
    <div class="facts three"><div class="fact"><small>已回報</small><b>${reps.length}</b></div><div class="fact"><small>未回報</small><b>${missing.length}</b></div><div class="fact"><small>逾期</small><b>${late}</b></div></div>
    <button class="btn send" id="remind" style="margin-top:12px">${missing.length ? `發提醒到群組（${missing.length} 人未交）` : '發提醒到群組'}</button>
    <div class="btn-row"><button class="btn plain" id="copy-link">複製填寫連結</button><button class="btn plain" id="print">列印／存 PDF</button></div>
    ${missing.length ? `<div class="sec-h"><h2>未回報</h2></div><div class="miss">${missing.map(m => `<span>${esc(m.name)}</span>`).join('')}</div>` : (reps.length ? '<p class="posted" style="margin-top:14px">這週全部都回報了。</p>' : '')}
    ${reps.length ? `<div class="sec-h"><h2>本週合計</h2></div>
      <div class="stat">${ms.map(m => `<div class="metric"><span>${esc(m.label)}</span><span class="v">${sumOf(m, reps)}</span></div>`).join('')}</div>` : ''}
    <div class="sec-h"><h2>回報內容</h2>${reps.length ? '<button class="btn plain small" id="copy-all">全部複製</button>' : ''}</div>
    ${reps.length ? reps.map(x => repCard(p, x, false, false)).join('') : '<p class="empty">這週還沒有人回報。</p>'}`;
  $('swk').onchange = () => { SWEEK = $('swk').value; renderWeekTab(); };
  $('remind').onclick = () => pickAndSend(remindFlex(p, wk, reps, missing), '已把提醒貼到群組');
  $('copy-link').onclick = () => copyText(reportUrl(p.id), '已複製填寫連結');
  $('print').onclick = () => { $$('details.rep').forEach(d => d.open = true); setTimeout(() => window.print(), 100); if (!DEMO && liff.isInClient()) toast('LINE 裡面可能無法列印，可改用電腦或手機瀏覽器開啟平台'); };
  if ($('copy-all')) $('copy-all').onclick = () => copyText(reps.map(x => reportText(p, x)).join('\n\n'), `已複製 ${reps.length} 則回報`);
  bindRepCards(p, reps);
}

const reportUrl = (pid, wk) => DEMO ? `${location.origin}${location.pathname}?demo=report` : `https://liff.line.me/${LIFF_ID}?p=${encodeURIComponent(pid)}${wk ? `&w=${wk}` : ''}`;

/** 彙整：依專區／校園分組、每週趨勢、每個人的累計，可匯出 Excel */
function renderAggTab() {
  const p = S.project, ms = metricsOf(p), infos = p.fields.filter(f => f.type === 'info');
  const weeksInRange = RANGE === 'all' ? S.weeks : S.weeks.slice(0, +RANGE);
  const reps = S.reports.filter(r => weeksInRange.includes(r.week));
  const gf = infos.find(f => f.id === GROUPBY);
  const memberInfo = uid => { const m = S.members.find(x => x.userId === uid); return m ? m.info || {} : {}; };
  const gval = r => gf ? (String((r.data || {})[gf.id] || memberInfo(r.userId)[gf.label] || '').trim() || '（未填）') : '全部';
  const groups = {};
  reps.forEach(r => { (groups[gval(r)] = groups[gval(r)] || []).push(r); });
  const gkeys = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  const cols = ms;
  const trendM = ms.find(m => m.key === TREND) || ms[0];
  const trend = [...weeksInRange].reverse().map(w => ({ w, v: sumOf(trendM, S.reports.filter(r => r.week === w)) }));
  const maxV = Math.max(1, ...trend.map(x => x.v));
  // 每個人
  const people = S.members.map(m => {
    const rs = reps.filter(r => r.userId === m.userId);
    return { m, rs, n: rs.length };
  }).sort((a, b) => b.n - a.n || String(a.m.name).localeCompare(String(b.m.name), 'zh-Hant'));
  const numCols = ms.filter(m => m.key !== '_n' && !m.sub);

  $('ppanel').innerHTML = `
    <div class="sec-h" style="margin-top:0"><h2>範圍</h2><select class="inp" id="range">${[['4', '近 4 週'], ['8', '近 8 週'], ['13', '近 3 個月'], ['all', `全部（${S.weeks.length} 週）`]].map(([k, v]) => `<option value="${k}" ${RANGE === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="btn-row" style="margin-top:0"><button class="btn send" id="xlsx">匯出 Excel</button><button class="btn plain" id="print">列印／存 PDF</button></div>
    <h2 class="print-title">${esc(p.title)}・彙整（${weeksInRange.length ? `${weekLabel(weeksInRange[weeksInRange.length - 1]).split('～')[0]}～${weekLabel(weeksInRange[0]).split('～')[1]}` : ''}）</h2>

    <div class="sec-h"><h2>依${gf ? esc(gf.label) : '全部'}彙整</h2>${infos.length ? `<select class="inp" id="groupby">${infos.map(f => `<option value="${f.id}" ${f.id === GROUPBY ? 'selected' : ''}>依${esc(f.label)}</option>`).join('')}<option value="" ${!GROUPBY ? 'selected' : ''}>不分組</option></select>` : ''}</div>
    <div class="agg-wrap"><table class="agg"><thead><tr><th>${gf ? esc(gf.label) : ''}</th>${cols.map(m => `<th>${esc(m.label)}</th>`).join('')}</tr></thead><tbody>
      ${gkeys.map(g => `<tr><td>${esc(g)}</td>${cols.map(m => `<td>${sumOf(m, groups[g])}</td>`).join('')}</tr>`).join('')}
      <tr class="total"><td>合計</td>${cols.map(m => `<td>${sumOf(m, reps)}</td>`).join('')}</tr>
    </tbody></table></div>
    <p class="caption" style="text-align:left;margin:6px 0 0">「回報人數」是回報的人次；名單人數是每週加總，同一個人連續幾週都有算幾次。</p>

    <div class="sec-h"><h2>每週趨勢</h2><select class="inp" id="trend">${ms.map(m => `<option value="${m.key}" ${m.key === trendM.key ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></div>
    <div class="stat"><div class="chart">${trend.map(x => `<div class="col"><div class="track"><span class="n">${x.v}</span><i style="height:${Math.round(x.v / maxV * 100)}%"></i></div><span class="d">${weekLabel(x.w).split('～')[0]}</span></div>`).join('')}</div></div>

    <div class="sec-h"><h2>每個人</h2></div>
    <div class="agg-wrap"><table class="agg"><thead><tr><th>姓名</th><th>回報週數</th>${numCols.map(m => `<th>${esc(m.label)}</th>`).join('')}</tr></thead><tbody>
      ${people.map(x => `<tr><td class="link" data-person="${esc(x.m.userId)}">${esc(x.m.name)}</td><td>${x.n}／${weeksInRange.length}</td>${numCols.map(m => `<td>${sumOf(m, x.rs)}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
    <p class="caption" style="text-align:left;margin:6px 0 0">點名字可以看這個人每一週的回報。</p>`;
  $('range').onchange = () => { RANGE = $('range').value; renderAggTab(); };
  if ($('groupby')) $('groupby').onchange = () => { GROUPBY = $('groupby').value; renderAggTab(); };
  $('trend').onchange = () => { TREND = $('trend').value; renderAggTab(); };
  $('xlsx').onclick = () => exportXlsx(weeksInRange);
  $('print').onclick = () => window.print();
  $$('[data-person]').forEach(td => td.onclick = () => personView(td.dataset.person));
}

function personView(uid) {
  const p = S.project, m = S.members.find(x => x.userId === uid) || { name: '' };
  const rs = S.reports.filter(r => r.userId === uid).sort((a, b) => b.week.localeCompare(a.week));
  const done = new Set(rs.map(r => r.week));
  const missed = S.weeks.filter(w => !done.has(w));
  view(`${subbar('返回彙整', m.name)}
    <p class="summary">${esc(p.title)}・回報 ${rs.length}／${S.weeks.length} 週${Object.values(m.info || {}).filter(Boolean).length ? `・${Object.values(m.info).filter(Boolean).map(esc).join('・')}` : ''}</p>
    ${missed.length ? `<div class="stat" style="margin-bottom:12px"><h3>沒有回報的週</h3><div class="miss">${missed.map(w => `<span>${weekLabel(w)}</span>`).join('')}</div></div>` : ''}
    ${rs.map((x, i) => repCard(p, x, i === 0, true)).join('') || '<p class="empty">還沒有回報。</p>'}`);
  $('back').onclick = () => { PTAB = 'agg'; renderProject(); };
  bindRepCards(p, rs);
}

function renderMembersTab() {
  const p = S.project;
  const cnt = uid => S.reports.filter(r => r.userId === uid).length;
  $('ppanel').innerHTML = `<p class="summary">打開填寫連結並回報過一次的人，就會加入這裡；未回報名單以這份成員為準。離開的人可以移除（他的回報紀錄會保留）。</p>
    ${S.members.length ? `<ul class="members">${S.members.map(m => `<li><div class="line1"><span class="nm">${esc(m.name)}</span><span class="ph">${cnt(m.userId)} 週</span></div>
      <div class="line2"><span>${Object.entries(m.info || {}).filter(([k, v]) => v && p.fields.some(f => f.type === 'info' && f.label === k)).map(([k, v]) => `${esc(k)}：${esc(v)}`).join('　') || '&nbsp;'}</span>
      <span class="acts"><button data-hist="${esc(m.userId)}">紀錄</button><button class="danger" data-rm="${esc(m.userId)}">移除</button></span></div></li>`).join('')}</ul>`
      : '<p class="empty">還沒有成員。把填寫連結或提醒卡發到群組，大家回報後就會出現在這裡。</p>'}`;
  $$('[data-hist]').forEach(b => b.onclick = () => personView(b.dataset.hist));
  $$('[data-rm]').forEach(b => b.onclick = () => armThen(b, '確定？', async () => {
    S = await api('removeMember', { projectId: p.id, userId: b.dataset.rm }); toast('已移除'); renderProject();
  }));
}

function editProjectInline() { editProject(S.project); }

/* ================= 匯出 Excel ================= */
function loadScript(src) {
  return new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('載入失敗，請檢查網路')); document.head.append(s); });
}
async function exportXlsx(weeks) {
  try {
    toast('正在產生 Excel…');
    if (!window.XLSX) await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
    const p = S.project, ms = metricsOf(p);
    const reps = S.reports.filter(r => weeks.includes(r.week)).sort((a, b) => b.week.localeCompare(a.week) || String(a.name).localeCompare(String(b.name), 'zh-Hant'));
    // 1. 回報明細：一列一則回報
    const head = ['週次', '姓名', '回報時間', '逾期'];
    p.fields.forEach(f => {
      if (f.type === 'list') { head.push(`${f.label}（人）`, fieldTitle(f)); (f.tags || []).forEach(t => head.push(`${f.label}・${t}`)); }
      else if (f.type === 'photo') head.push(`${plainLabel(f)}（網址）`);
      else head.push(plainLabel(f));
    });
    const rows = reps.map(r => {
      const row = [weekLabel(r.week), r.name, r.time || '', r.late ? '是' : ''];
      p.fields.forEach(f => {
        const v = (r.data || {})[f.id];
        if (f.type === 'list') { const it = listItems(v); row.push(it.length, it.map(x => x.n + (x.t || []).map(tagCode).join('')).join('、')); (f.tags || []).forEach(t => row.push(it.filter(x => (x.t || []).includes(t)).length)); }
        else if (f.type === 'photo') row.push((v || []).join('\n'));
        else if (f.type === 'number') row.push(v === '' || v == null ? '' : +v);
        else row.push(v || '');
      });
      return row;
    });
    // 2. 每週彙整
    const wHead = ['週次', '應回報', '未回報'].concat(ms.map(m => m.label));
    const wRows = weeks.map(w => { const rs = S.reports.filter(r => r.week === w); return [weekLabel(w), S.members.length, Math.max(0, S.members.length - rs.length)].concat(ms.map(m => sumOf(m, rs))); });
    const wb = XLSX.utils.book_new();
    const add = (name, aoa, widths) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = widths; XLSX.utils.book_append_sheet(wb, ws, name); };
    add('回報明細', [head].concat(rows), head.map(h => ({ wch: Math.max(8, Math.min(40, h.length * 2 + 2)) })));
    add('每週彙整', [wHead].concat(wRows), wHead.map(h => ({ wch: Math.max(8, h.length * 2) })));
    // 3. 依每個記住的資料分組
    p.fields.filter(f => f.type === 'info').forEach(f => {
      const g = {};
      S.reports.filter(r => weeks.includes(r.week)).forEach(r => { const k = String((r.data || {})[f.id] || '').trim() || '（未填）'; (g[k] = g[k] || []).push(r); });
      add(`依${f.label}`.slice(0, 31), [[f.label].concat(ms.map(m => m.label))].concat(Object.keys(g).sort().map(k => [k].concat(ms.map(m => sumOf(m, g[k]))))), [{ wch: 14 }].concat(ms.map(() => ({ wch: 12 }))));
    });
    XLSX.writeFile(wb, `${p.title}_${ymd(new Date())}.xlsx`);
  } catch (e) { toast('匯出失敗：' + e.message); }
}

/* ================= 群組裡的圖卡（Flex Message） ================= */
const flexInfo = (k, v, t) => ({ type: 'box', layout: 'baseline', spacing: 'md', contents: [
  { type: 'text', text: String(k), color: t.muted, size: 'sm', flex: 0 },
  { type: 'text', text: String(v === '' || v == null ? '—' : v), wrap: true, color: t.ink, size: 'sm', flex: 1, weight: 'bold' } ] });
const flexBtn = (label, uri, t) => ({ type: 'box', layout: 'horizontal', spacing: 'md', paddingAll: '16px', contents: [
  { type: 'box', layout: 'vertical', width: '6px', cornerRadius: '3px', backgroundColor: t.notch, contents: [] },
  { type: 'button', style: 'primary', color: t.btn, height: 'sm', flex: 1, action: { type: 'uri', label: String(label).slice(0, 20), uri } } ] });

/** 個人回報圖卡：版面跟大家原本貼的文字一樣，名單一人一行、代號靠右 */
function reportFlex(p, r) {
  const t = themeOf(p);
  const body = [
    { type: 'text', text: `${weekLabel(r.week)}・${p.title}`, size: 'xs', color: t.muted, wrap: true },
    { type: 'text', text: `【${r.name}】`, weight: 'bold', size: 'xl', color: t.ink, margin: 'sm', wrap: true },
  ];
  const facts = p.fields.filter(f => f.type === 'info' || f.type === 'number').map(f => flexInfo(f.label, (r.data || {})[f.id], t));
  if (facts.length) body.push({ type: 'box', layout: 'vertical', margin: 'md', spacing: 'sm', contents: facts });
  p.fields.forEach(f => {
    const v = (r.data || {})[f.id];
    if (f.type === 'list') {
      const it = listItems(v), tags = (f.tags || []).length > 0;
      body.push({ type: 'separator', margin: 'lg', color: t.line });
      body.push({ type: 'box', layout: 'baseline', margin: 'lg', contents: [
        { type: 'text', text: fieldTitle(f), size: 'sm', weight: 'bold', color: t.ink, wrap: true, flex: 1 },
        { type: 'text', text: `${it.length} 人`, size: 'xs', color: t.muted, flex: 0 } ] });
      if (it.length) body.push({ type: 'box', layout: 'vertical', margin: 'sm', spacing: 'xs', contents: it.slice(0, 30).map((x, i) => ({ type: 'box', layout: 'baseline', spacing: 'sm', contents: [
        { type: 'text', text: `${i + 1}.`, size: 'sm', color: t.btn, weight: 'bold', flex: 1, align: 'end' },
        { type: 'text', text: String(x.n).slice(0, 30), size: 'sm', color: t.ink, flex: 7, wrap: true },
        ...(tags ? [{ type: 'text', text: (x.t || []).map(tagCode).join(' ') || '－', size: 'sm', color: t.btn, weight: 'bold', flex: 2, align: 'end' }] : []) ] })) });
    } else if (f.type === 'text' && String(v || '').trim()) {
      body.push({ type: 'separator', margin: 'lg', color: t.line });
      body.push({ type: 'text', text: plainLabel(f), size: 'sm', weight: 'bold', color: t.ink, margin: 'lg' });
      body.push({ type: 'text', text: String(v).trim().slice(0, 800), size: 'sm', color: t.ink, wrap: true, margin: 'sm' });
    }
  });
  const bubble = { type: 'bubble', size: 'mega', styles: { body: { backgroundColor: t.paper }, footer: { backgroundColor: t.paper } },
    body: { type: 'box', layout: 'vertical', paddingAll: '20px', contents: body },
    footer: flexBtn('我也要回報', reportUrl(p.id, r.week), t) };
  const photo = p.fields.filter(f => f.type === 'photo').flatMap(f => (r.data || {})[f.id] || []).find(isHttps);
  if (photo) bubble.hero = { type: 'image', url: photo, size: 'full', aspectRatio: '20:13', aspectMode: 'cover' };
  return { type: 'flex', altText: `${r.name} 回報了 ${weekLabel(r.week)}「${p.title}」`.slice(0, 400), contents: bubble };
}

/** 提醒卡：哪一週、截止時間、已交人數和還沒交的名單 */
function remindFlex(p, wk, reps, missing) {
  const t = themeOf(p);
  const body = [
    { type: 'text', text: '回報提醒', size: 'xs', color: t.btn, weight: 'bold' },
    { type: 'text', text: p.title, weight: 'bold', size: 'xl', color: t.ink, wrap: true, margin: 'sm' },
    { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm', contents: [
      flexInfo('週次', weekLabel(wk), t), flexInfo('截止', dueLabel(wk, p.dueTime), t), flexInfo('已交', `${reps.length}／${S.members.length} 人`, t) ] },
  ];
  if (missing.length) {
    body.push({ type: 'separator', margin: 'lg', color: t.line });
    body.push({ type: 'text', text: `還沒回報（${missing.length}）`, size: 'sm', weight: 'bold', color: t.ink, margin: 'lg' });
    body.push({ type: 'text', text: missing.slice(0, 60).map(m => m.name).join('、') + (missing.length > 60 ? `…等 ${missing.length} 人` : ''), size: 'sm', color: t.muted, wrap: true, margin: 'sm' });
  }
  return { type: 'flex', altText: `【回報提醒】${p.title} ${weekLabel(wk)}，截止 ${dueLabel(wk, p.dueTime)}`.slice(0, 400),
    contents: { type: 'bubble', styles: { body: { backgroundColor: t.paper }, footer: { backgroundColor: t.paper } },
      body: { type: 'box', layout: 'vertical', paddingAll: '20px', contents: body }, footer: flexBtn('填寫回報', reportUrl(p.id, wk), t) } };
}

/* ================= 我的資料：查看、修改、刪除 ================= */
const myDataLink = () => `<a class="mydata-link" href="#" onclick="myDataFlow(); return false;">我的資料</a>`;
const myDataLinkInline = () => `<a class="mydata-link" href="#" onclick="myDataFlow(); return false;">我的資料</a>`;

async function myDataFlow() {
  view(loading());
  document.title = '我的資料';
  const d = await api('myData');
  const back = () => { if (R && R.project) reportFlow(R.project.id, R.week); else homeFlow(); };
  if (!d.found) {
    view(`${subbar('返回', '我的資料')}${ticket({ title: '我的資料' }, `<div class="result-msg"><p>系統裡沒有你的資料。</p><p class="muted">回報一次之後，這裡會顯示你的姓名和記住的資料。</p></div>`)}`);
    $('back').onclick = back; return;
  }
  const info = Object.entries(d.info || {});
  view(`${subbar('返回', '我的資料')}
    ${ticket({ title: '我的資料' }, `<div class="result-msg">
      <label class="field"><span>姓名（顯示在回報上）</span><input class="inp" id="md-name" value="${esc(d.name)}" maxlength="20"></label>
      ${info.map(([k, v], i) => `<label class="field"><span>${esc(k)}</span><input class="inp" data-mdk="${esc(k)}" value="${esc(v)}" maxlength="30"></label>`).join('')}
      <button class="btn send" id="md-save" style="margin-top:4px">儲存</button>
      <p class="muted" style="margin-top:14px">LINE：${esc(d.lineName || '')}・已回報 ${d.reports} 次</p>
      <p class="muted" style="margin-top:14px">刪除後，你的姓名、記住的資料和所有回報紀錄都會移除。已經貼在群組裡的圖卡無法收回。</p>
      <button class="btn cancel" id="md-del" style="margin-top:10px">刪除我的資料</button>
    </div>`)}`);
  $('back').onclick = back;
  $('md-save').onclick = async () => {
    const info2 = {}; $$('[data-mdk]').forEach(el => { info2[el.dataset.mdk] = el.value.trim(); });
    try { const r = await api('saveProfile', { name: $('md-name').value.trim(), info: info2 }); if (R) R.profile = r.profile; toast('已儲存'); } catch (e) { toast(e.message); }
  };
  $('md-del').onclick = () => armThen($('md-del'), '確定刪除？無法復原，再按一次', async () => {
    const r = await api('deleteMyData');
    setSession(null);
    view(`<section class="solo">${ticket({ title: '已刪除你的資料' }, `<div class="result-msg"><p>已移除你的資料${r.reports ? `和 ${r.reports} 則回報` : ''}。</p></div>`, `<div class="stamp land ink" aria-hidden="true">已刪除</div>`)}
      ${liff.isInClient() ? `<button class="btn plain" style="margin-top:18px" onclick="liff.closeWindow()">關閉</button>` : ''}</section>`);
  });
}

/* ================= 安裝到手機桌面（PWA） ================= */
let installPrompt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installUrl = () => `${location.origin}${location.pathname}?install=1`;
function startInstall() {
  if (!DEMO && liff.isInClient && liff.isInClient()) { liff.openWindow({ url: installUrl(), external: true }); return; }
  installFlow();
}
function installFlow() {
  document.title = '安裝「工作回報」';
  const steps = isIOS()
    ? `<ol class="install-steps"><li>用 <b>Safari</b> 開啟這個頁面</li><li>點下方的「分享」按鈕 <span aria-hidden="true">⬆︎</span></li><li>往下滑，點「<b>加入主畫面</b>」</li><li>按右上角「新增」</li></ol>`
    : `<ol class="install-steps"><li>點上面的「安裝到手機桌面」</li><li>如果沒有反應：點瀏覽器右上角「⋮」選單</li><li>選「<b>安裝應用程式</b>」或「<b>加到主畫面</b>」</li></ol>`;
  view(`<section class="solo install">
    <img class="app-icon" src="icons/icon-192.png" alt="" width="96" height="96">
    <h1>工作回報</h1>
    <p class="muted">把「全時間工作重點回報」放到手機桌面，像 App 一樣一點就開。</p>
    ${isStandalone() ? '<p class="posted">已經安裝好了，從桌面的圖示打開即可。</p>' : `<button class="btn send" id="do-install" ${isIOS() ? 'hidden' : ''}>安裝到手機桌面</button>${steps}`}
    <p class="muted small">第一次從桌面打開時，會請你用 LINE 帳號登入一次。</p>
    <button class="btn plain" id="go-platform" style="margin-top:14px">前往平台</button>
  </section>`);
  const btn = $('do-install');
  if (btn) btn.onclick = async () => {
    if (!installPrompt) { toast('請依照下面的步驟，從瀏覽器選單安裝'); return; }
    installPrompt.prompt();
    const r = await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    toast(r && r.outcome === 'accepted' ? '安裝完成，可以從桌面打開了' : '已取消安裝');
  };
  $('go-platform').onclick = () => { location.href = `${location.origin}${location.pathname}?pwa=1`; };
}
if ('serviceWorker' in navigator && location.protocol === 'https:') addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

/* ================= 使用教學（金框導覽，沿用活動登記平台） =================
   之後加功能時：新步驟標上 since: 新版本號，並把 TOUR_VERSION 加 1 */
const TOUR_KEY = 'report.tour';
const TOUR_VERSION = 1;
const q1 = sel => document.querySelector(sel);
const TOUR_STEPS = [
  { since: 1, tab: 'mine', target: () => q1('.proj-card') || q1('#panel .empty'), title: '我的回報',
    text: '進行中的回報項目都在這裡，顯示這次要回報哪一週、截止時間、你交了沒。點一下就能填寫。' },
  { since: 1, tab: 'mine', target: () => q1('.page-foot .mydata-link:last-child'), title: '我的資料',
    text: '姓名、專區、校園等資料填一次就記住。想改名字或資料、或刪除自己的資料，都在這裡。' },
  { since: 1, admin: true, tab: 'admin', target: () => q1('#new-proj'), title: '建立回報項目',
    text: '管理員在這裡建立持續數週的回報項目：期間、提醒與截止時間、要回報哪些欄位（名單幾格、代號）都可以設定。' },
  { since: 1, admin: true, tab: 'admin', target: () => q1('[data-proj]'), title: '每週提醒與統計',
    text: '點進項目可以看每週誰交了、誰還沒交，一鍵把提醒卡貼到群組；還有依專區、校園的彙整、趨勢圖和匯出 Excel。' },
  { since: 1, tab: 'mine', target: () => q1('#help'), title: '隨時重看教學',
    text: '填好的回報會以你的名義貼到群組，大家都看得到。忘記怎麼用時，按這個「?」再看一次。' },
];
const tourSeen = () => { try { return parseInt(localStorage.getItem(TOUR_KEY) || '0', 10) || 0; } catch (e) { return TOUR_VERSION; } };
const markTour = () => { try { localStorage.setItem(TOUR_KEY, String(TOUR_VERSION)); } catch (e) {} };
function maybeStartTour() {
  const seen = tourSeen();
  if (!seen) return startTour(TOUR_STEPS);
  if (seen >= TOUR_VERSION) return;
  markTour();
  const fresh = TOUR_STEPS.filter(s => s.since > seen && (!s.admin || ME.isAdmin));
  if (fresh.length) notice(`新功能：${fresh.map(s => s.title).join('、')}`, '看介紹', () => startTour(fresh));
}
function notice(text, action, fn) {
  const n = $('notice');
  $('notice-text').textContent = text; $('notice-go').textContent = action; n.hidden = false;
  const close = () => { n.hidden = true; };
  $('notice-go').onclick = () => { close(); fn(); };
  $('notice-x').onclick = close;
  setTimeout(close, 15000);
}
let TOUR = null;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function startTour(steps) {
  if (TOUR) return;
  markTour();
  steps = steps.filter(s => !s.admin || ME.isAdmin);
  if (!steps.length) return;
  const el = document.createElement('div');
  el.className = 'tour';
  el.innerHTML = `<div class="tour-catch"></div><div class="tour-hole" aria-hidden="true"></div>
    <div class="tour-bubble" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text">
      <div class="tour-head"><h2 id="tour-title"></h2><span class="tour-count"></span></div>
      <p id="tour-text"></p>
      <div class="tour-btns"><button type="button" class="tour-skip">跳過</button><button type="button" class="tour-prev">上一步</button><button type="button" class="tour-next">下一步</button></div>
    </div>`;
  document.body.append(el);
  TOUR = { el, steps, i: -1, from: TAB };
  el.querySelector('.tour-catch').addEventListener('click', e => e.stopPropagation());
  el.querySelector('.tour-skip').onclick = endTour;
  el.querySelector('.tour-prev').onclick = () => tourGo(TOUR.i - 1, -1);
  el.querySelector('.tour-next').onclick = () => tourGo(TOUR.i + 1, 1);
  addEventListener('keydown', tourKey, true);
  addEventListener('resize', placeTour);
  addEventListener('scroll', placeTour, true);
  requestAnimationFrame(() => el.classList.add('on'));
  tourGo(0, 1);
}
function tourKey(e) { if (TOUR && e.key === 'Escape') { e.preventDefault(); endTour(); } }
async function tourGo(i, dir) {
  const t = TOUR;
  if (!t || t.busy || i < 0) return;
  if (i >= t.steps.length) return endTour();
  const s = t.steps[i];
  t.busy = true;
  if (s.tab && TAB !== s.tab) { TAB = s.tab; renderHome(); }
  let el = null;
  for (let n = 0; n < 40 && !el; n++) { el = s.target(); if (!el) await sleep(50); }
  t.busy = false;
  if (TOUR !== t) return;
  if (!el) return tourGo(i + dir, dir);
  t.i = i; t.target = el;
  el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  t.el.querySelector('#tour-title').textContent = s.title;
  t.el.querySelector('#tour-text').textContent = s.text;
  t.el.querySelector('.tour-count').textContent = `${i + 1} / ${t.steps.length}`;
  t.el.querySelector('.tour-prev').disabled = i === 0;
  t.el.querySelector('.tour-next').textContent = i === t.steps.length - 1 ? '完成' : '下一步';
  placeTour();
  await sleep(reducedMotion() ? 0 : 380);
  placeTour();
  t.el.querySelector('.tour-next').focus({ preventScroll: true });
}
function placeTour() {
  const t = TOUR;
  if (!t || !t.target) return;
  const PAD = 6, GAP = 14, EDGE = 12;
  const r = t.target.getBoundingClientRect();
  const x = Math.max(r.left - PAD, 4), y = Math.max(r.top - PAD, 4);
  const w = Math.min(r.right + PAD, innerWidth - 4) - x, h = Math.min(r.bottom + PAD, innerHeight - 4) - y;
  const hole = t.el.querySelector('.tour-hole');
  hole.style.width = `${Math.max(0, w)}px`; hole.style.height = `${Math.max(0, h)}px`;
  hole.style.transform = `translate(${x}px, ${y}px)`;
  const b = t.el.querySelector('.tour-bubble');
  const bw = b.offsetWidth, bh = b.offsetHeight;
  let by;
  if (innerHeight - (y + h) - GAP - EDGE >= bh) by = y + h + GAP;
  else if (y - GAP - EDGE >= bh) by = y - GAP - bh;
  else by = innerHeight - EDGE - bh;
  const bx = Math.min(Math.max(x + w / 2 - bw / 2, EDGE), innerWidth - EDGE - bw);
  b.style.transform = `translate(${bx}px, ${Math.max(EDGE, by)}px)`;
}
function endTour() {
  const t = TOUR;
  if (!t) return;
  TOUR = null;
  removeEventListener('keydown', tourKey, true);
  removeEventListener('resize', placeTour);
  removeEventListener('scroll', placeTour, true);
  t.el.classList.remove('on');
  setTimeout(() => t.el.remove(), 220);
  TAB = t.from; renderHome();
}

main();
