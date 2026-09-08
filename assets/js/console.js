import { CATALOG } from './catalog.js';

const REPO = 'mumusecure/mumusecure.github.io';
const PATH = 'data/universe.json';
const BRANCH = 'main';
const TOKEN_KEY = 'mumu-voyage-token';

const $ = s => document.querySelector(s);
const state = { data: null, sha: null, dirty: false };

/* ───────── 유틸 ───────── */
const b64 = str => {
  const bytes = new TextEncoder().encode(str);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
let toastTimer;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast ' + kind; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.hidden = true, kind === 'err' ? 6000 : 3000);
}
function markDirty(v = true) {
  state.dirty = v;
  $('#dirty').hidden = !v;
}
const json = () => JSON.stringify(state.data, null, 2) + '\n';
const token = () => localStorage.getItem(TOKEN_KEY) || '';

/* ───────── GitHub ───────── */
async function gh(path, opts = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token()}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `${res.status} ${res.statusText}`);
  return body;
}

async function refreshAuth() {
  const badge = $('#auth-state');
  if (!token()) {
    badge.textContent = '미연결'; badge.className = 'badge';
    $('#btn-publish').disabled = true;
    return;
  }
  try {
    const f = await gh(`contents/${PATH}?ref=${BRANCH}`);
    state.sha = f.sha;
    badge.textContent = '연결됨'; badge.className = 'badge ok';
    $('#btn-publish').disabled = false;
  } catch (e) {
    badge.textContent = '토큰 오류'; badge.className = 'badge';
    $('#btn-publish').disabled = true;
    toast(`GitHub 연결 실패 — ${e.message}`, 'err');
  }
}

async function publish() {
  if (!token()) return toast('먼저 토큰을 저장할 것', 'err');
  const btn = $('#btn-publish');
  btn.disabled = true; btn.textContent = '발행 중…';
  try {
    if (!state.sha) await refreshAuth();
    const res = await gh(`contents/${PATH}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: '항해 기록 갱신',
        content: b64(json()),
        sha: state.sha,
        branch: BRANCH
      })
    });
    state.sha = res.content.sha;
    markDirty(false);
    toast('발행 완료 — 잠시 뒤 사이트에 반영된다', 'ok');
  } catch (e) {
    toast(`발행 실패 — ${e.message}`, 'err');
  } finally {
    btn.disabled = false; btn.textContent = '발행';
  }
}

/* ───────── 렌더 ───────── */
function usedIds(sys) { return new Set(sys.bodies.map(b => b.id)); }

function render() {
  const keepScroll = window.scrollY;   // 추가·삭제 시 보던 위치를 잃지 않도록
  const host = $('#systems');
  host.innerHTML = '';
  state.data.systems.forEach((sys, si) => {
    const el = document.createElement('div');
    el.className = 'sys';
    el.innerHTML = `
      <div class="sys-top">
        <label>성계 이름<input class="s-name" type="text" value="${esc(sys.name)}"></label>
        <label>분야<input class="s-field" type="text" value="${esc(sys.field || '')}"></label>
        <button class="icon del-sys" title="성계 삭제">×</button>
      </div>
      <label class="sys-desc">분야 설명<input class="s-desc" type="text" value="${esc(sys.field_desc || '')}"></label>
      <div class="sys-bodies"></div>
      <div class="add-body-row">
        <select class="pick-body"></select>
        <button class="primary sm add-body">+ 천체 추가</button>
      </div>`;

    el.querySelector('.s-name').oninput = e => { sys.name = e.target.value; markDirty(); };
    el.querySelector('.s-field').oninput = e => { sys.field = e.target.value; markDirty(); };
    el.querySelector('.s-desc').oninput = e => { sys.field_desc = e.target.value; markDirty(); };
    el.querySelector('.del-sys').onclick = () => {
      if (!confirm(`성계 "${sys.name}"과 그 안의 천체 ${sys.bodies.length}개를 삭제한다.`)) return;
      state.data.systems.splice(si, 1); markDirty(); render();
    };

    const pick = el.querySelector('.pick-body');
    const used = usedIds(sys);
    const avail = Object.entries(CATALOG).filter(([id]) => !used.has(id));
    pick.innerHTML = avail.length
      ? avail.map(([id, c]) => `<option value="${id}">${c.name} · ${c.en} — ${c.au} AU</option>`).join('')
      : '<option value="">태양계 천체를 모두 등록했다</option>';
    pick.disabled = !avail.length;
    el.querySelector('.add-body').disabled = !avail.length;
    el.querySelector('.add-body').onclick = () => {
      const id = pick.value; if (!id) return;
      sys.bodies.push({ id, name: CATALOG[id].name, title: '', date: '', summary: '', progress: 0, moons: [] });
      markDirty(); render();
    };

    const list = el.querySelector('.sys-bodies');
    // 태양에서 가까운 순으로 정렬해 보여준다
    sys.bodies.sort((a, b) => (CATALOG[a.id]?.au ?? 99) - (CATALOG[b.id]?.au ?? 99));
    sys.bodies.forEach(b => list.appendChild(bodyCard(sys, b)));
    host.appendChild(el);
  });
  requestAnimationFrame(() => window.scrollTo(0, keepScroll));
}

function bodyCard(sys, b) {
  const cat = CATALOG[b.id] || {};
  const node = $('#tpl-body').content.cloneNode(true).firstElementChild;
  node.querySelector('.ko').textContent = cat.name || b.id;
  node.querySelector('.en').textContent = cat.en || '';

  const bind = (sel, key, ev = 'input') => {
    const el = node.querySelector(sel);
    el.value = b[key] ?? '';
    el.addEventListener(ev, () => { b[key] = el.value; markDirty(); });
  };
  bind('.f-name', 'name'); bind('.f-title', 'title');
  bind('.f-date', 'date'); bind('.f-summary', 'summary');

  const range = node.querySelector('.f-progress'), val = node.querySelector('.prog-val');
  range.value = Math.round((b.progress ?? 0) * 100);
  val.textContent = range.value + '%';
  range.addEventListener('input', () => {
    val.textContent = range.value + '%';
    b.progress = +range.value / 100;
    markDirty();
  });

  node.querySelector('.del-body').onclick = () => {
    if (!confirm(`"${b.name || cat.name}"을 삭제한다.`)) return;
    sys.bodies.splice(sys.bodies.indexOf(b), 1); markDirty(); render();
  };

  const listEl = node.querySelector('.moon-list');
  const suggEl = node.querySelector('.moon-suggest');
  const drawMoons = () => {
    b.moons = b.moons || [];
    listEl.innerHTML = '';
    b.moons.forEach((m, i) => {
      const row = document.createElement('div');
      row.className = 'moon-item';
      row.innerHTML = `<input type="text" value="${esc(m.name)}">
        <input type="range" min="0" max="100" step="5" value="${Math.round((m.progress ?? 0) * 100)}">
        <span class="mv">${Math.round((m.progress ?? 0) * 100)}%</span>
        <button class="icon">×</button>`;
      const [nameEl, rangeEl] = row.querySelectorAll('input');
      nameEl.oninput = () => { m.name = nameEl.value; markDirty(); };
      rangeEl.oninput = () => {
        m.progress = +rangeEl.value / 100;
        row.querySelector('.mv').textContent = rangeEl.value + '%';
        markDirty();
      };
      row.querySelector('button').onclick = () => { b.moons.splice(i, 1); markDirty(); drawMoons(); };
      listEl.appendChild(row);
    });
    // 실제 위성 이름 제안 — 누르기 전엔 들어가지 않는다
    const have = new Set(b.moons.map(m => m.name));
    const rest = (cat.moons || []).filter(n => !have.has(n));
    suggEl.innerHTML = rest.length
      ? `<span class="sugg-note">실제 위성:</span>` +
        rest.map(n => `<button class="sugg" data-n="${esc(n)}">+ ${n}</button>`).join('')
      : '';
    suggEl.querySelectorAll('.sugg').forEach(el => el.onclick = () => {
      b.moons.push({ name: el.dataset.n, progress: 0 }); markDirty(); drawMoons();
    });
  };
  drawMoons();

  const newMoon = node.querySelector('.f-newmoon');
  const addMoon = () => {
    const n = newMoon.value.trim(); if (!n) return;
    b.moons.push({ name: n, progress: 0 }); newMoon.value = ''; markDirty(); drawMoons();
  };
  node.querySelector('.add-moon').onclick = addMoon;
  newMoon.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addMoon(); } };

  return node;
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ───────── 시작 ───────── */
$('#btn-token').onclick = async () => {
  const v = $('#token').value.trim();
  if (!v) return toast('토큰을 입력할 것', 'err');
  localStorage.setItem(TOKEN_KEY, v);
  $('#token').value = '';
  await refreshAuth();
  if (token()) toast('토큰 저장됨', 'ok');
};
$('#btn-forget').onclick = () => {
  localStorage.removeItem(TOKEN_KEY);
  state.sha = null;
  refreshAuth();
  toast('토큰 삭제됨');
};
$('#btn-publish').onclick = publish;
$('#btn-copy').onclick = async () => {
  try { await navigator.clipboard.writeText(json()); toast('JSON 복사됨', 'ok'); }
  catch { toast('클립보드 접근 실패', 'err'); }
};
$('#btn-download').onclick = () => {
  const url = URL.createObjectURL(new Blob([json()], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'universe.json'; a.click();
  URL.revokeObjectURL(url);
};
$('#btn-add-system').onclick = () => {
  const name = prompt('성계 이름 (예: 알파 센타우리)'); if (!name) return;
  const field = prompt('분야 이름 (예: 시스템 해킹)') || '';
  state.data.systems.push({
    id: 'sys-' + Date.now().toString(36),
    name, field, field_desc: '', bodies: []
  });
  markDirty(); render();
};
addEventListener('beforeunload', e => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

(async function init() {
  const res = await fetch('data/universe.json?v=' + Date.now());
  state.data = await res.json();
  state.data.systems.forEach(s => s.bodies.forEach(b => { b.moons = b.moons || []; }));
  render();
  await refreshAuth();
})();
