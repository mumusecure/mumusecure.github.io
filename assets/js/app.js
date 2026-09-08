import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CATALOG, sceneRadius, sceneDistance } from './catalog.js';

const GOLDEN = 137.507764; // 성계 각도 배분 — 몇 개가 추가돼도 겹치지 않는다
const TEX = 'assets/textures/';

/* ───────────────────────── 렌더러 ───────────────────────── */
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 20000);
const controls = new OrbitControls(camera, canvas);
Object.assign(controls, {
  enableDamping: true, dampingFactor: .055, rotateSpeed: .42,
  zoomSpeed: .7, panSpeed: .5, minDistance: 2, maxDistance: 900
});

const loader = new THREE.TextureLoader();
const loadTex = name => new Promise(res => {
  loader.load(`${TEX}${name}`, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }, undefined, () => res(null));
});

/* ───────────────────────── 배경: 별과 성운 ───────────────────────── */
function buildStarfield(count = 9000) {
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), siz = new Float32Array(count);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // 구면에 균일 분포
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 3000 + Math.random() * 5000;
    const s = Math.sqrt(1 - u * u);
    pos.set([Math.cos(th) * s * r, u * r, Math.sin(th) * s * r], i * 3);
    // 실제 별 색온도 분포에 가깝게 — 대부분 흰-노랑, 소수가 청색·적색
    const t = Math.random();
    const hue = t < .70 ? .11 - Math.random() * .05 : t < .90 ? .58 : .04;
    const sat = t < .70 ? .18 + Math.random() * .22 : t < .90 ? .45 : .55;
    c.setHSL(hue, sat, .72 + Math.random() * .26);
    col.set([c.r, c.g, c.b], i * 3);
    siz[i] = Math.pow(Math.random(), 3.2) * 9 + 1.1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uPix: { value: Math.min(devicePixelRatio, 2) } },
    vertexShader: `
      attribute float aSize; varying vec3 vC; uniform float uPix;
      void main(){ vC = color;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = aSize * uPix * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      varying vec3 vC;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.06, d);
        a *= a;
        gl_FragColor = vec4(vC, a);
      }`,
    vertexColors: true
  });
  return new THREE.Points(g, m);
}

function buildNebula() {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vP; uniform float uTime;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
      float noise(vec3 p){
        vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        float n = mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                      mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
        return n;
      }
      float fbm(vec3 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
      void main(){
        vec3 d = normalize(vP);
        float n = fbm(d*2.4 + vec3(uTime*0.004));
        float n2 = fbm(d*5.1 - vec3(uTime*0.002));
        float m1 = smoothstep(0.52, 0.86, n);
        float m2 = smoothstep(0.58, 0.92, n2);
        vec3 c = vec3(0.020,0.032,0.075) * m1 * 1.15
               + vec3(0.062,0.022,0.070) * m2 * 0.80
               + vec3(0.004,0.009,0.019);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  return new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 32), m);
}

/* ───────────────────────── 행성 셰이더 ───────────────────────── */
const PLANET_VERT = `
  varying vec2 vUv; varying vec3 vNw; varying vec3 vWp;
  void main(){
    vUv = uv;
    vNw = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWp = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

// 월드 공간에서 조명을 계산한다. cameraPosition 은 three 가 자동으로 넣어주는 유니폼.
const PLANET_FRAG = `
  uniform sampler2D uDay; uniform sampler2D uNight;
  uniform float uHasNight; uniform float uHasAtmo;
  uniform vec3 uSunWorld; uniform vec3 uAtmo; uniform float uProgress;
  varying vec2 vUv; varying vec3 vNw; varying vec3 vWp;
  vec3 dec(vec3 c){ return pow(c, vec3(2.2)); }
  void main(){
    vec3 N = normalize(vNw);
    vec3 L = normalize(uSunWorld - vWp);
    float ndl = dot(N, L);
    // 진행도 = 태양빛을 받는 면적. 0이면 완전한 실루엣, 1이면 완전 조명.
    float bias = (uProgress - 1.0) * 1.35;
    float day = smoothstep(-0.12, 0.17, ndl + bias);

    vec3 dayC = dec(texture2D(uDay, vUv).rgb) * 1.95;
    vec3 col;
    if (uHasNight > 0.5) {
      vec3 nightC = dec(texture2D(uNight, vUv).rgb);
      nightC = pow(nightC, vec3(1.3)) * 1.15;
      col = mix(nightC * (0.25 + 0.75 * uProgress), dayC, day);
    } else {
      col = dayC * (0.022 + 0.978 * day);
    }
    // 대기 산란 — 바다가 파랗게 보이는 진짜 이유는 표면이 아니라 그 위의 대기다
    float mu = max(ndl, 0.0);
    float lum = dot(dayC, vec3(0.299, 0.587, 0.114));
    float water = smoothstep(0.10, 0.006, lum);
    col += uAtmo * uHasAtmo * day * (0.030 + 0.125 * water) * (0.40 + 0.60 * mu);

    vec3 V = normalize(cameraPosition - vWp);
    float fres = pow(1.0 - max(dot(V, N), 0.0), 3.4);
    col += uAtmo * fres * uHasAtmo * (0.06 + 0.34 * day);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// 대기 산란 — 실제 우주 사진의 푸른 테두리를 만드는 요소
const ATMO_VERT = `
  varying vec3 vNw; varying vec3 vWp;
  void main(){
    vNw = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWp = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const ATMO_FRAG = `
  uniform vec3 uSunWorld; uniform vec3 uAtmo;
  uniform float uProgress; uniform float uPower; uniform float uStrength;
  varying vec3 vNw; varying vec3 vWp;
  void main(){
    vec3 N = normalize(vNw);
    vec3 V = normalize(cameraPosition - vWp);
    vec3 L = normalize(uSunWorld - vWp);
    float bias = (uProgress - 1.0) * 1.35;
    float lit = smoothstep(-0.42, 0.26, dot(N, L) + bias);
    float rim = pow(1.0 - max(dot(V, N), 0.0), uPower);
    // 태양을 등질수록 전방산란이 강해진다
    float fwd = pow(max(dot(-V, L), 0.0), 3.0) * 0.35;
    float f = (rim + fwd) * lit * uStrength;
    gl_FragColor = vec4(uAtmo * f, f);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/* ───────────────────────── 우주 구축 ───────────────────────── */
const state = { data: null, bodies: [], selected: null, sunPos: new THREE.Vector3(0, 0, 0) };
window.__voyage = { state, THREE, camera, controls, frames: 0 };

function layout(system, sysIndex) {
  const angle = THREE.MathUtils.degToRad(sysIndex * GOLDEN);
  const rows = system.bodies.map(b => {
    const cat = CATALOG[b.id] || CATALOG.earth;
    return { b, cat, r: sceneRadius(cat.km), d: sceneDistance(cat.au) };
  }).sort((x, y) => x.d - y.d);
  // 압축 때문에 겹치는 경우 최소 간격을 강제한다
  for (let i = 1; i < rows.length; i++) {
    const need = rows[i - 1].d + rows[i - 1].r + rows[i].r + 4;
    if (rows[i].d < need) rows[i].d = need;
  }
  rows.forEach(row => { row.pos = new THREE.Vector3(Math.cos(angle) * row.d, 0, Math.sin(angle) * row.d); });
  return rows;
}

async function buildBody(row, system) {
  const { b, cat, r, pos } = row;
  const group = new THREE.Group();
  group.position.copy(pos);

  const day = await loadTex(`${cat.tex}_2k.jpg`) || await loadTex('earth_day_2k.jpg');
  const night = cat.night ? await loadTex(cat.night) : null;

  const mat = new THREE.ShaderMaterial({
    vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG,
    uniforms: {
      uDay: { value: day }, uNight: { value: night || day },
      uHasNight: { value: night ? 1 : 0 },
      uHasAtmo: { value: cat.atmo ? 1 : 0 },
      uAtmo: { value: new THREE.Color(...(cat.atmo || [0, 0, 0])) },
      uSunWorld: { value: state.sunPos },
      uProgress: { value: b.progress ?? 0 }
    }
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 96, 64), mat);
  mesh.rotation.z = THREE.MathUtils.degToRad(cat.tex === 'uranus' ? 97 : 23.4);
  group.add(mesh);

  const mats = [mat];
  if (cat.atmo) {
    const isEarth = cat.tex === 'earth_day';
    const am = new THREE.ShaderMaterial({
      vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: {
        uSunWorld: { value: state.sunPos },
        uAtmo: { value: new THREE.Color(...cat.atmo) },
        uProgress: { value: b.progress ?? 0 },
        uPower: { value: isEarth ? 2.8 : 3.2 },
        uStrength: { value: isEarth ? 0.80 : 0.55 }
      }
    });
    group.add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.055, 64, 48), am));
    mats.push(am);
  }

  if (cat.ring) {
    const ringTex = await loadTex('saturn_ring.png');
    const rg = new THREE.RingGeometry(r * cat.ring[0], r * cat.ring[1], 128);
    // RingGeometry의 uv를 반경 방향으로 다시 매핑
    const p = rg.attributes.position, uv = rg.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const d = Math.hypot(p.getX(i), p.getY(i));
      const t = (d - r * cat.ring[0]) / (r * (cat.ring[1] - cat.ring[0]));
      uv.setXY(i, t, 0.5);
    }
    const rp = b.progress ?? 0;   // 고리도 조명을 받아야 한다 — 미확인이면 거의 안 보인다
    const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({
      map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false,
      opacity: 0.92 * (0.10 + 0.90 * rp),
      color: new THREE.Color().setScalar(0.22 + 0.78 * rp)
    }));
    ring.rotation.x = Math.PI / 2;
    ring.rotation.y = THREE.MathUtils.degToRad(-26.7);
    group.add(ring);
  }

  // 궤도선
  const pts = [];
  for (let i = 0; i <= 256; i++) {
    const a = (i / 256) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * pos.length(), 0, Math.sin(a) * pos.length()));
  }
  const orbit = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x9ec5ff, transparent: true, opacity: .07 })
  );
  scene.add(orbit);
  scene.add(group);

  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.textContent = b.name || cat.name;
  document.getElementById('labels').appendChild(tag);

  return { data: b, cat, system, group, mesh, mat, mats, radius: r, tag };
}

/* ───────────────────────── 카메라 워프 ───────────────────────── */
let flight = null;
function flyTo(entry, instant = false) {
  const to = entry.group.position.clone();
  const dist = entry.radius * 4.4;
  // 태양 쪽으로 비스듬히 — 낮면과 명암경계선이 함께 보이는 각도
  const toSun = state.sunPos.clone().sub(to).normalize();
  const side = new THREE.Vector3(0, 1, 0).cross(toSun).normalize();
  const dir = toSun.multiplyScalar(0.52)
    .add(side.multiplyScalar(0.78))
    .add(new THREE.Vector3(0, 0.30, 0)).normalize();
  const camTo = to.clone().add(dir.multiplyScalar(dist));
  state.lastView = { kind: 'body', id: entry.data.id };
  if (instant) { camera.position.copy(camTo); controls.target.copy(to); controls.update(); return; }
  flight = { t: 0, dur: 1700, cf: camera.position.clone(), ct: camTo, tf: controls.target.clone(), tt: to };
}
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// 성계 전체를 한눈에 — 항해를 건너뛰고 위치를 파악하고 싶을 때
function overview(sysIndex = 0, instant = false) {
  const sys = state.data.systems[sysIndex];
  const list = state.bodies.filter(e => e.system === sys);
  if (!list.length) return;
  const far = Math.max(...list.map(e => e.group.position.length()));
  const a = THREE.MathUtils.degToRad(sysIndex * GOLDEN);
  const arm = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
  const perp = new THREE.Vector3(0, 1, 0).cross(arm).normalize();
  const to = arm.clone().multiplyScalar(far * 0.52);
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  let dist = (far * 0.62) / Math.tan(hFov / 2) * 1.12;
  if (!Number.isFinite(dist) || dist <= 0) dist = far * 1.8;
  const off = perp.multiplyScalar(0.80)
    .add(new THREE.Vector3(0, 0.55, 0))
    .add(arm.clone().multiplyScalar(0.12)).normalize();
  const camTo = to.clone().add(off.multiplyScalar(dist));
  state.lastView = { kind: 'overview', i: sysIndex };
  if (instant) { camera.position.copy(camTo); controls.target.copy(to); controls.update(); return; }
  flight = { t: 0, dur: 1900, cf: camera.position.clone(), ct: camTo, tf: controls.target.clone(), tt: to };
}

/* ───────────────────────── UI ───────────────────────── */
const stateOf = p => (p >= .999 ? 'lit' : p > .001 ? 'partial' : 'dark');
const stateKo = { lit: '조명됨 · 달성', partial: '조명 중 · 학습 중', dark: '미확인 천체' };

function renderStarmap() {
  const host = document.getElementById('starmap-body');
  const systems = state.data.systems;
  const total = state.bodies.length;
  if (!total) {
    host.innerHTML = `<div class="empty"><b>아직 관측된 천체가 없습니다</b>관제 화면에서 첫 목표를 등록하면<br>이 좌표에 천체가 나타납니다.</div>`;
  } else {
    host.innerHTML = systems.map(sys => `
      <div class="sys-group">
        <div class="sys-head"><span class="sys-name">${sys.name}</span><span class="sys-field">${sys.field}</span></div>
        ${sys.bodies.map(b => {
          const e = state.bodies.find(x => x.data.id === b.id); if (!e) return '';
          const p = b.progress ?? 0, st = stateOf(p);
          return `<button class="body-row" data-id="${b.id}">
            <span class="dot ${st}"></span>
            <span class="body-label">
              <span class="body-name">${b.name || e.cat.name}</span>
              <span class="body-title">${b.title || '&nbsp;'}</span>
            </span>
            <span class="body-pct">${Math.round(p * 100)}%</span>
          </button>`;
        }).join('')}
      </div>`).join('');
    host.querySelectorAll('.body-row').forEach(el =>
      el.addEventListener('click', () => select(el.dataset.id)));
  }
  const avg = total ? state.bodies.reduce((s, e) => s + (e.data.progress ?? 0), 0) / total : 0;
  document.getElementById('overall').textContent = Math.round(avg * 100) + '%';
  document.getElementById('overall-bar').style.width = (avg * 100) + '%';
}

function select(id) {
  const e = state.bodies.find(x => x.data.id === id); if (!e) return;
  state.selected = e; flyTo(e);
  const p = e.data.progress ?? 0, st = stateOf(p);
  document.getElementById('d-system').textContent = `${e.system.name} · ${e.system.field}`;
  document.getElementById('d-name').textContent = e.data.name || e.cat.name;
  document.getElementById('d-en').textContent = e.cat.en;
  const chip = document.getElementById('d-state');
  chip.textContent = stateKo[st]; chip.className = 'chip ' + st;
  document.getElementById('d-summary').textContent = e.data.summary || '아직 기록이 없습니다.';
  const moons = e.data.moons?.length ? e.data.moons : e.cat.moons.map(n => ({ name: n, progress: 0 }));
  document.getElementById('d-moons').innerHTML = moons.length
    ? `<div class="moons-head">위성 · 세부 목표</div>` + moons.map(m =>
        `<div class="moon-row"><span class="dot ${stateOf(m.progress ?? 0)}"></span>${m.name}</div>`).join('')
    : '';
  document.getElementById('detail').hidden = false;
  document.querySelectorAll('.body-row').forEach(el =>
    el.classList.toggle('active', el.dataset.id === id));
}

function renderSummary() {
  document.getElementById('summary-body').innerHTML = state.data.systems.map(sys => `
    <div class="sum-sys">
      <h3>${sys.name} — ${sys.field_desc || sys.field}</h3>
      ${sys.bodies.map(b => {
        const e = state.bodies.find(x => x.data.id === b.id);
        return `<div class="sum-item"><span class="dot ${stateOf(b.progress ?? 0)}"></span>
          <div><div class="sum-name">${b.name || e?.cat.name || b.id} · ${b.title || ''}</div>
          <div class="sum-desc">${b.summary || ''}</div></div></div>`;
      }).join('')}
    </div>`).join('');
}

/* ───────────────────────── 루프 ───────────────────────── */
const _s = new THREE.Vector3();
function resize() {
  // 숨겨진 탭에서 로드되면 innerWidth/Height 가 0이라 aspect 가 NaN 이 된다 → 카메라 좌표 전체가 무너짐
  const w = Math.max(innerWidth, 1), h = Math.max(innerHeight, 1);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', () => { resize(); reframe(); });

// 마지막으로 잡았던 화면을 기억해 두고, 창 크기가 바뀌면 다시 잡는다
function reframe() {
  if (!state.lastView) return;
  if (state.lastView.kind === 'overview') overview(state.lastView.i, true);
  else {
    const e = state.bodies.find(x => x.data.id === state.lastView.id);
    if (e) flyTo(e, true);
  }
}

let last = performance.now(), lastW = 0, lastH = 0;
function tick(now) {
  const dt = Math.min(now - last, 50); last = now;
  requestAnimationFrame(tick);

  // 숨겨진 탭에서 로드된 뒤 처음 보일 때 크기가 확정되므로 여기서 다시 잡는다
  if (innerWidth !== lastW || innerHeight !== lastH) {
    lastW = innerWidth; lastH = innerHeight;
    resize(); reframe();
  }

  if (flight) {
    flight.t += dt;
    const k = easeInOut(Math.min(flight.t / flight.dur, 1));
    camera.position.lerpVectors(flight.cf, flight.ct, k);
    controls.target.lerpVectors(flight.tf, flight.tt, k);
    if (flight.t >= flight.dur) flight = null;
  }
  controls.update();
  nebula.material.uniforms.uTime.value = now / 1000;

  for (const e of state.bodies) e.mesh.rotation.y += dt * 0.000045;

  // 라벨 — 카메라에 가까운 것부터 자리를 잡고, 겹치면 뒤엣것을 숨긴다
  const placed = [];
  const ordered = state.bodies
    .map(e => ({ e, d: camera.position.distanceTo(e.group.position) }))
    .sort((a, b) => a.d - b.d);
  for (const { e } of ordered) {
    _s.copy(e.group.position).project(camera);
    const x = (_s.x * .5 + .5) * innerWidth + 14;
    const y = (-_s.y * .5 + .5) * innerHeight;
    const onScreen = _s.z < 1 && x > -60 && x < innerWidth + 60 && y > -40 && y < innerHeight + 40;
    const clear = onScreen && !placed.some(q => Math.abs(q.x - x) < 78 && Math.abs(q.y - y) < 22);
    e.tag.style.opacity = clear ? '1' : '0';
    if (clear) {
      placed.push({ x, y });
      e.tag.style.left = x + 'px';
      e.tag.style.top = y + 'px';
      e.tag.classList.toggle('lit', (e.data.progress ?? 0) > .001);
    }
  }
  renderer.render(scene, camera);
  window.__voyage.frames++;
}
window.__voyage.renderNow = () => { controls.update(); renderer.render(scene, camera); };

/* ───────────────────────── 시작 ───────────────────────── */
const nebula = buildNebula();
scene.add(nebula, buildStarfield());

// 태양 — 원점에 있고, 모든 행성의 광원이다
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d').createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0.00, 'rgba(255,247,226,1)');
  g.addColorStop(0.10, 'rgba(255,226,170,0.72)');
  g.addColorStop(0.30, 'rgba(255,190,120,0.20)');
  g.addColorStop(0.65, 'rgba(255,170,90,0.045)');
  g.addColorStop(1.00, 'rgba(255,160,80,0)');
  const ctx = c.getContext('2d'); ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(2.6, 40, 24),
  new THREE.MeshBasicMaterial({ color: 0xfff6e2 })
);
scene.add(sun);
const glow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture(), transparent: true, opacity: .9,
  blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
}));
glow.scale.setScalar(22); scene.add(glow);

const boot = document.getElementById('boot');
const bootBar = boot.querySelector('.boot-bar i');
const bootMsg = boot.querySelector('.boot-msg');

(async function init() {
  resize();
  bootBar.style.width = '18%';
  const res = await fetch('data/universe.json?v=' + Date.now());
  state.data = await res.json();
  bootMsg.textContent = '천체 데이터 수신';
  bootBar.style.width = '42%';

  for (let i = 0; i < state.data.systems.length; i++) {
    const sys = state.data.systems[i];
    const rows = layout(sys, i);
    for (const row of rows) state.bodies.push(await buildBody(row, sys));
  }
  bootBar.style.width = '88%';
  bootMsg.textContent = '항로 계산';

  resize();
  renderStarmap(); renderSummary();
  if (state.bodies.length) {
    if (location.hash === '#overview') { overview(0, true); }
    else { flyTo(state.bodies[0], true); select(state.bodies[0].data.id); }
  }
  else { camera.position.set(0, 30, 90); controls.target.set(0, 0, 0); }

  bootBar.style.width = '100%';
  setTimeout(() => { boot.classList.add('done'); setTimeout(() => boot.remove(), 950); }, 420);
  requestAnimationFrame(tick);
})();

// 3D에서 천체 직접 클릭
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let downAt = null;
canvas.addEventListener('pointerdown', e => downAt = { x: e.clientX, y: e.clientY });
canvas.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(state.bodies.map(b => b.mesh))[0];
  if (hit) select(state.bodies.find(b => b.mesh === hit.object).data.id);
});

document.getElementById('detail-close').onclick = () => document.getElementById('detail').hidden = true;
document.getElementById('starmap-toggle').onclick = e => {
  const p = document.getElementById('starmap');
  p.classList.toggle('collapsed');
  e.target.textContent = p.classList.contains('collapsed') ? '+' : '−';
};
document.getElementById('btn-overview').onclick = () => overview(0);
document.getElementById('btn-summary').onclick = () => document.getElementById('summary-sheet').hidden = false;
document.getElementById('summary-close').onclick = () => document.getElementById('summary-sheet').hidden = true;
