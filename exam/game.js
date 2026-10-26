import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ============================================================================
// Content
// ============================================================================

const LETTERS = 'ABCD';
const EXAM_SECONDS = 300; // 45 exam minutes in 5 real ones

const QUESTIONS = [
  { q: 'A heron is Tuesday. How many spoons fit inside Belgium?', opts: ['Eleven', 'Only the sad ones', 'Belgium is full', '4.5 herons'] },
  { q: 'Translate from Old Wednesday: “glorp vex anton.”', opts: ['“Pass the moon.”', '“My uncle is a door.”', '“Beware the soup.”', '“Wednesday again.”'] },
  { q: 'Simplify: (fish + Thursday) ÷ the colour of a cough.', opts: ['Damp', '7 fish', 'Beige, but louder', 'Undefined Thursday'] },
  { q: 'Label part X of the gloon shown below.', diagram: true, opts: ['The wobbling', 'Secondary gloon', 'Knee', 'Where the hum lives'] },
  { q: 'Which of these is heaviest?', opts: ['A kilogram of feathers', 'A kilogram of regret', 'Tuesday', 'The letter Q'] },
  { q: 'Explain the French Revolution using only the smell of pencils.', opts: ['Graphite, mostly', 'Cedar and rebellion', 'Le sniff', 'It cannot be smelled'] },
  { q: 'What is your invigilator’s middle name?', opts: ['Gerald', 'Moira', 'Philippa', 'Kevin'] },
  { q: 'Shade the same letter you shaded for Question 2.', opts: ['A', 'B', 'C', 'D'] },
];
const KEY = [2, 1, 2, 3, 1, 1, 2, 1];

// What each source of cheating actually says.
const SHEETS = {
  priya: { answers: KEY.slice(), version: 'A', fill: (i) => 22 + i * 23 },            // right, tiny and faint
  marcus: { answers: [2, 0, 2, 0, 1, 3, 2, 0], version: 'A', fill: (i) => 50 + i * 28 }, // half right, covers his paper
  dave: { answers: [0, 3, 0, 1, 3, 0, 0, 3], version: 'B', fill: (i) => 10 + i * 12 },  // huge, confident, different paper
};
const BOTTLE_TEXT = ['5 · B', '6 · B', '7 · C', '8 · B'];
const TEXTS = [
  { t: 42, text: 'u ok?? i did this exact paper last year' },
  { t: 70, text: 'q1 is C trust me' },
  { t: 84, text: 'q2 B' },
  { t: 99, text: 'q3 C (the beige one lol)' },
  { t: 116, text: 'q4 is D. where the hum lives' },
  { t: 158, text: 'wait which paper r u on. A or B??' },
  { t: 176, text: 'if ur A ignore that. or B. one of them' },
];

const LINES = {
  start: ['Mrs Grimsby', 'You may turn over your papers. You have forty-five minutes.'],
  ahem: ['Mrs Grimsby', 'Ahem.'],
  strike1: ['Mrs Grimsby', 'Eyes on your own paper, please.'],
  strike2: ['Mrs Grimsby', 'I am watching you, candidate zero four one two.'],
  caught: ['Mrs Grimsby', 'Right. Pencil down. Out you go.'],
  ball: ['Mrs Grimsby', 'Did you just throw something?'],
  hmm: ['Mrs Grimsby', 'Hmm. Litter.'],
  buzz: ['Mrs Grimsby', 'Whose phone is that?'],
  priya: ['Priya', 'Excuse me?! Stop looking at my paper.'],
  priyaTell: ['Priya', 'Miss! They keep copying me!'],
  tenLeft: ['Mrs Grimsby', 'Ten minutes remaining.'],
  end: ['Mrs Grimsby', 'Pencils down, everyone.'],
};

// ============================================================================
// Small helpers
// ============================================================================

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const HAND = '"Caveat", "Segoe Print", "Bradley Hand", cursive';
const PRINT = '"Libre Baskerville", Georgia, serif';
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
}

async function fontsReady() {
  if (!document.fonts) return;
  const faces = ['700 60px Caveat', '500 60px Caveat', '28px "Libre Baskerville"', '700 28px "Libre Baskerville"'];
  await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f).catch(() => {}))), new Promise((r) => setTimeout(r, 2500))]);
}

// ============================================================================
// Audio: everything is synthesised, so there are no files to load
// ============================================================================

const audio = {
  ctx: null, master: null, muted: store.get('eyes-muted', false),
  start() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      this.room();
    } catch { this.ctx = null; }
  },
  toggle() {
    this.muted = !this.muted;
    store.set('eyes-muted', this.muted);
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.8;
    toast(this.muted ? 'Sound off' : 'Sound on');
  },
  noise(seconds) {
    const b = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * seconds), this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  },
  room() { // the hum of a silent exam hall
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise(2); src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    src.connect(f).connect(g).connect(this.master); src.start();
  },
  burst({ freq = 3000, q = 1.5, dur = 0.12, gain = 0.15, type = 'bandpass', pan = 0, when = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource(); src.buffer = this.noise(dur);
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    src.connect(f).connect(g).connect(p).connect(this.master); src.start(t);
  },
  tone({ freq = 440, dur = 0.1, gain = 0.1, type = 'sine', when = 0, to = null }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  tick() { this.tone({ freq: 1800, dur: 0.025, gain: 0.025, type: 'square' }); },
  scratch(pan) { this.burst({ freq: rand(2500, 4500), q: 2, dur: rand(0.06, 0.16), gain: 0.035, pan }); },
  shade() { for (let i = 0; i < 5; i++) this.burst({ freq: 3200, q: 1.2, dur: 0.07, gain: 0.08, when: i * 0.06 }); },
  step(pan, vol) { this.burst({ freq: 140, q: 0.8, dur: 0.09, gain: 0.12 * vol, type: 'lowpass', pan }); },
  buzz() { for (let i = 0; i < 3; i++) this.tone({ freq: 170, dur: 0.28, gain: 0.25, type: 'sawtooth', when: i * 0.38 }); },
  whoosh() { this.burst({ freq: 900, q: 0.7, dur: 0.3, gain: 0.12 }); },
  thud(pan) { this.burst({ freq: 400, q: 1, dur: 0.12, gain: 0.25, pan }); },
  sting() { this.tone({ freq: 220, dur: 0.6, gain: 0.12, type: 'triangle', to: 110 }); },
  bell() { [880, 1320, 1760].forEach((f, i) => this.tone({ freq: f, dur: 1.4, gain: 0.08 / (i + 1), when: 0 })); },
};

function say(lineKey) {
  const [who, text] = LINES[lineKey];
  showSubtitle(who, text);
  if (audio.muted || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (who === 'Priya') { u.pitch = 1.5; u.rate = 1.15; } else { u.pitch = 0.75; u.rate = 0.92; }
    u.volume = 0.9;
    speechSynthesis.speak(u);
  } catch { /* subtitles are enough */ }
}

let subtitleTimer;
function showSubtitle(who, text) {
  const s = $('#subtitle');
  s.replaceChildren(el('span', { class: 'who' }, `${who}: `), text);
  clearTimeout(subtitleTimer);
  subtitleTimer = setTimeout(() => s.replaceChildren(), 3600);
}

let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
}

// ============================================================================
// Renderer and scene
// ============================================================================

const canvas = $('#scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch {
  $('#title').replaceChildren(el('div', { class: 'sheet error' },
    el('h1', {}, 'Your browser can’t draw 3D'),
    el('p', {}, 'This game needs WebGL. Try a recent version of Chrome, Firefox, Safari or Edge, or turn on hardware acceleration in your browser settings.')));
  throw new Error('WebGL unavailable');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const ANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.background = new THREE.Color('#d8dccb');
scene.fog = new THREE.Fog('#e3e1cf', 12, 26);
const camera = new THREE.PerspectiveCamera(62, 1, 0.03, 60);
scene.add(camera);

const mats = new Map();
function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o }));
  return mats.get(k);
}
function mesh(geo, m, { cast = true, receive = true } = {}) {
  const x = new THREE.Mesh(geo, m);
  x.castShadow = cast; x.receiveShadow = receive;
  return x;
}
const boxGeo = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function canvasTexture(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = ANISO;
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(...repeat); }
  const redraw = (...args) => { draw(ctx, w, h, ...args); tex.needsUpdate = true; };
  redraw();
  return { tex, ctx, canvas: c, redraw };
}

// Things the player can look at, and things that block the view.
const gazeTargets = [];
function gaze(object, tag) { object.userData.gaze = tag; gazeTargets.push(object); return object; }

// ---------- room layout ----------
const COLS = [-2.7, -0.9, 0.9, 2.7];
const ROWS = [-3.0, -1.2, 0.6, 2.4];
const AISLES = [-3.6, -1.8, 0, 1.8, 3.6];
const FRONT_Z = -4.15;
const BACK_Z = 3.55;
const ROOM = { x: 4.6, front: -6.6, back: 4.6, h: 3.4 };
const PLAYER_DESK = { x: -0.9, z: 0.6 };
const SEAT_EYE = new THREE.Vector3(-0.9, 1.13, 1.16);
const DESK_SLANT = 0.17;

function buildRoom() {
  // parquet floor
  const floorTex = canvasTexture(512, 512, (ctx, w, h) => {
    const plank = 64;
    ctx.fillStyle = '#9a7650'; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += plank / 2) {
      for (let x = 0; x < w; x += plank * 2) {
        const off = (y / (plank / 2)) % 2 ? plank : 0;
        const tone = 120 + Math.random() * 40;
        ctx.fillStyle = `rgb(${tone + 40}, ${tone}, ${tone - 50})`;
        for (const px of [(x + off) % w, ((x + off) % w) - w]) {
          ctx.fillRect(px, y, plank * 2, plank / 2);
          ctx.strokeStyle = 'rgba(60,40,20,0.35)'; ctx.lineWidth = 2;
          ctx.strokeRect(px, y, plank * 2, plank / 2);
        }
      }
    }
  }, [5, 6]);
  const floor = mesh(new THREE.PlaneGeometry(ROOM.x * 2, ROOM.back - ROOM.front), mat('#ffffff', { map: floorTex.tex, roughness: 0.7 }), { cast: false });
  floor.rotation.x = -Math.PI / 2; floor.position.z = (ROOM.back + ROOM.front) / 2;
  scene.add(floor);

  const wallMat = mat('#c9d5bd');
  const dadoMat = mat('#7f957a');
  const depth = ROOM.back - ROOM.front;
  const midZ = (ROOM.back + ROOM.front) / 2;
  const walls = [
    { w: ROOM.x * 2, pos: [0, ROOM.h / 2, ROOM.front], rot: 0 },
    { w: ROOM.x * 2, pos: [0, ROOM.h / 2, ROOM.back], rot: Math.PI },
    { w: depth, pos: [-ROOM.x, ROOM.h / 2, midZ], rot: Math.PI / 2 },
    { w: depth, pos: [ROOM.x, ROOM.h / 2, midZ], rot: -Math.PI / 2 },
  ];
  for (const wl of walls) {
    const m = mesh(new THREE.PlaneGeometry(wl.w, ROOM.h), wallMat, { cast: false });
    m.position.set(...wl.pos); m.rotation.y = wl.rot; scene.add(m);
    const dado = mesh(new THREE.PlaneGeometry(wl.w, 1.0), dadoMat, { cast: false });
    dado.position.set(wl.pos[0], 0.5, wl.pos[2]); dado.rotation.y = wl.rot;
    dado.translateZ(0.01); scene.add(dado);
    const rail = mesh(boxGeo(wl.w, 0.05, 0.04), mat('#5d4632'), { cast: false });
    rail.position.set(wl.pos[0], 1.02, wl.pos[2]); rail.rotation.y = wl.rot; rail.translateZ(0.02); scene.add(rail);
  }
  const ceiling = mesh(new THREE.PlaneGeometry(ROOM.x * 2, depth), mat('#f1efe6', { emissive: '#e9e4d6', emissiveIntensity: 0.55 }), { cast: false });
  ceiling.rotation.x = Math.PI / 2; ceiling.position.set(0, ROOM.h, midZ); scene.add(ceiling);
  for (const z of [-4.5, -1.5, 1.5]) for (const x of [-2, 2]) {
    const panel = mesh(boxGeo(1.2, 0.04, 0.5), mat('#ffffff', { emissive: '#fffbe9', emissiveIntensity: 0.9 }), { cast: false });
    panel.position.set(x, ROOM.h - 0.02, z); scene.add(panel);
  }

  // windows on the right wall, full of afternoon sun
  const glass = mat('#fffaf0', { emissive: '#fff4d6', emissiveIntensity: 1.25 });
  for (const z of [-4.2, -1.2, 1.8]) {
    const g = mesh(new THREE.PlaneGeometry(1.7, 1.9), glass, { cast: false });
    g.position.set(ROOM.x - 0.01, 1.95, z); g.rotation.y = -Math.PI / 2; scene.add(g);
    const frame = mat('#f4f1e6');
    for (const [w, h, y, dz] of [[1.84, 0.08, 2.92, 0], [1.84, 0.08, 0.98, 0], [0.08, 1.9, 1.95, 0.88], [0.08, 1.9, 1.95, -0.88], [0.05, 1.9, 1.95, 0], [1.7, 0.05, 1.95, 0]]) {
      const f = mesh(boxGeo(0.06, h, w), frame, { cast: false });
      f.position.set(ROOM.x - 0.03, y, z + dz); scene.add(f);
    }
    const sill = mesh(boxGeo(0.25, 0.05, 1.9), mat('#efe9da')); sill.position.set(ROOM.x - 0.1, 0.95, z); scene.add(sill);
  }

  // blackboard
  const board = canvasTexture(1024, 400, (ctx, w, h) => {
    ctx.fillStyle = '#273a31'; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.08; ctx.fillStyle = '#fff';
    for (let i = 0; i < 40; i++) ctx.fillRect(rand(0, w), rand(0, h), rand(60, 260), rand(6, 30));
    ctx.globalAlpha = 1; ctx.fillStyle = '#f2f0e6'; ctx.textAlign = 'center';
    ctx.font = `700 64px ${HAND}`; ctx.fillText('SILENCE — EXAM IN PROGRESS', w / 2, 82);
    ctx.font = `500 46px ${HAND}`;
    ctx.fillText('Advanced Nonsense (Higher Tier) · Paper A & B', w / 2, 158);
    ctx.fillText('Start 10:00      Finish 10:45', w / 2, 226);
    ctx.fillText('Eyes on your OWN paper', w / 2, 300);
    ctx.strokeStyle = '#f2f0e6'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(330, 315); ctx.lineTo(694, 312); ctx.stroke();
    ctx.font = `500 34px ${HAND}`; ctx.fillText('— Mrs G. P. Grimsby', w / 2 + 250, 370);
  });
  const boardMesh = mesh(new THREE.PlaneGeometry(4.6, 1.8), mat('#ffffff', { map: board.tex, roughness: 0.95 }), { cast: false });
  boardMesh.position.set(-0.4, 1.85, ROOM.front + 0.045); scene.add(gaze(boardMesh, 'board'));
  const boardFrame = mesh(boxGeo(4.75, 1.95, 0.05), mat('#6b4b31'), { cast: false });
  boardFrame.position.set(-0.4, 1.85, ROOM.front + 0.01); scene.add(boardFrame);
  const tray = mesh(boxGeo(4.6, 0.04, 0.12), mat('#6b4b31')); tray.position.set(-0.4, 0.94, ROOM.front + 0.08); scene.add(tray);

  // posters
  const poster = (lines, bg, fg, x, z, rotY, w = 0.9, h = 1.2) => {
    const t = canvasTexture(360, 480, (ctx, cw, ch) => {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = fg; ctx.textAlign = 'center';
      lines.forEach(([size, text, y, font = PRINT]) => { ctx.font = `700 ${size}px ${font}`; ctx.fillText(text, cw / 2, y); });
    });
    const p = mesh(new THREE.PlaneGeometry(w, h), mat('#ffffff', { map: t.tex }), { cast: false });
    p.position.set(x, 1.9, z); p.rotation.y = rotY; scene.add(p);
  };
  poster([[44, 'NO', 150], [44, 'PHONES', 210], [26, 'in the exam hall', 290, HAND], [70, '✕', 400]], '#d24636', '#fff6e8', -ROOM.x + 0.02, -3.5, Math.PI / 2);
  poster([[30, 'KEEP CALM', 130], [30, 'AND SHADE', 180], [30, 'THE BUBBLE', 230], [90, '◉', 380]], '#24425f', '#f6f0df', -ROOM.x + 0.02, 0.5, Math.PI / 2);
  poster([[30, 'Periodic Table', 70], [30, 'of Feelings', 110], [22, 'Me  Ug  Hm  Ok', 200], [22, 'Ss  Zz  Ah  No', 250], [22, 'Ew  Oh  Yay  Hm', 300], [22, 'Sigh  Ugh  Eh', 350]], '#f3e7c4', '#3a2f22', 2.6, ROOM.back - 0.02, Math.PI, 1.3, 1.0);

  // the clock: there's a 13 where the 12 should be
  const face = canvasTexture(256, 256, (ctx, w) => {
    ctx.fillStyle = '#fbf8ef'; ctx.beginPath(); ctx.arc(w / 2, w / 2, w / 2 - 4, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 10; ctx.strokeStyle = '#2b2b2b'; ctx.stroke();
    ctx.fillStyle = '#222'; ctx.font = `700 30px ${PRINT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.fillText(i === 12 ? '13' : String(i), w / 2 + Math.sin(a) * 92, w / 2 - Math.cos(a) * 92);
    }
  });
  const clockGroup = new THREE.Group();
  clockGroup.position.set(2.75, 2.75, ROOM.front + 0.05);
  const disc = mesh(new THREE.CircleGeometry(0.34, 48), mat('#ffffff', { map: face.tex }), { cast: false });
  clockGroup.add(gaze(disc, 'clock'));
  const hand = (len, w, color) => { const g = new THREE.Group(); const m = mesh(boxGeo(w, len, 0.01), mat(color), { cast: false }); m.position.y = len / 2 - 0.02; m.position.z = 0.01; g.add(m); clockGroup.add(g); return g; };
  world.hourHand = hand(0.17, 0.025, '#222');
  world.minuteHand = hand(0.26, 0.016, '#222');
  world.secondHand = hand(0.27, 0.006, '#c8342b');
  scene.add(clockGroup);

  // invigilator's desk, with the incriminating mug
  const desk = new THREE.Group();
  desk.position.set(0, 0, -5.2);
  const top = mesh(boxGeo(1.9, 0.07, 0.85), mat('#8a5d3b', { roughness: 0.6 })); top.position.y = 0.76; desk.add(top);
  const front = mesh(boxGeo(1.9, 0.62, 0.04), mat('#7a5233')); front.position.set(0, 0.43, 0.4); desk.add(front);
  for (const sx of [-0.88, 0.88]) { const side = mesh(boxGeo(0.06, 0.72, 0.8), mat('#7a5233')); side.position.set(sx, 0.38, 0); desk.add(side); }
  const stack = mesh(boxGeo(0.34, 0.08, 0.46), mat('#f6f2e4')); stack.position.set(-0.5, 0.84, 0); desk.add(stack);
  const mugTex = canvasTexture(512, 160, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2b2b2b'; ctx.textAlign = 'center';
    ctx.font = `700 34px ${PRINT}`; ctx.fillText('G. PHILIPPA GRIMSBY', w / 4, 70);
    ctx.font = `italic 22px ${PRINT}`; ctx.fillText('world’s okayest invigilator', w / 4, 112);
  });
  mugTex.tex.offset.x = 0.0;
  const mug = mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.17, 28), [mat('#ffffff', { map: mugTex.tex, roughness: 0.4 }), mat('#ffffff'), mat('#3a2a1a')]);
  mug.rotation.y = -Math.PI / 2 - 0.3;
  mug.position.set(0.45, 0.885, 0.3);
  desk.add(gaze(mug, 'mug'));
  const handle = mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 16), mat('#ffffff')); handle.position.set(0.53, 0.885, 0.3); handle.rotation.y = Math.PI / 2; desk.add(handle);
  const chair = makeChair('#3a5560'); chair.position.set(0.1, 0, -0.75); chair.rotation.y = Math.PI; desk.add(chair);
  scene.add(desk);

  // lights
  scene.add(new THREE.HemisphereLight('#f6f7ff', '#7b6a52', 0.85));
  const sun = new THREE.DirectionalLight('#ffe9c4', 2.6);
  sun.position.set(9, 7.5, 2.5);
  sun.target.position.set(0, 0, -0.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#dce6ff', 0.45); fill.position.set(-6, 5, 6); scene.add(fill);

  // dust drifting in the sunlight
  const n = 380;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = rand(-1, 4.4); pos[i * 3 + 1] = rand(0.3, 3); pos[i * 3 + 2] = rand(-6, 4); }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  world.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#fff3d0', size: 0.014, transparent: true, opacity: 0.7, depthWrite: false }));
  scene.add(world.dust);
}

function makeChair(color) {
  const g = new THREE.Group();
  const m = mat(color, { roughness: 0.6 });
  const metal = mat('#7d8288', { metalness: 0.6, roughness: 0.4 });
  const seat = mesh(boxGeo(0.44, 0.04, 0.42), m); seat.position.y = 0.45; g.add(seat);
  const back = mesh(boxGeo(0.44, 0.34, 0.03), m); back.position.set(0, 0.72, 0.2); back.rotation.x = -0.08; g.add(back);
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) {
    const leg = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.45, 6), metal); leg.position.set(x, 0.225, z); g.add(leg);
  }
  return g;
}

// ---------- answer sheets drawn on canvases ----------
function sheetPainter({ name, version, style }) {
  return (ctx, w, h, answers = []) => {
    ctx.fillStyle = '#f7f3e6'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e8dfca'; for (let y = 120; y < h; y += 4) if (y % 64 === 0) ctx.fillRect(0, y, w, 1);
    ctx.fillStyle = '#2a2722'; ctx.textAlign = 'left';
    ctx.font = `700 22px ${PRINT}`; ctx.fillText('ANSWER SHEET', 26, 44);
    ctx.font = `16px ${PRINT}`; ctx.fillText('Advanced Nonsense (Higher)', 26, 70);
    // the paper version, in a box: the detail that catches out Dave-copiers
    ctx.lineWidth = 3; ctx.strokeStyle = '#2a2722'; ctx.strokeRect(w - 150, 18, 124, 52);
    ctx.font = `700 28px ${PRINT}`; ctx.textAlign = 'center'; ctx.fillText(`PAPER ${version}`, w - 88, 54);
    ctx.textAlign = 'left'; ctx.font = `600 34px ${HAND}`; ctx.fillStyle = '#2b3a8c'; ctx.fillText(name, 26, 108);
    const top = 160, rowH = 66, bx = [150, 240, 330, 420];
    for (let i = 0; i < 8; i++) {
      const y = top + i * rowH;
      ctx.fillStyle = '#2a2722'; ctx.font = `700 26px ${PRINT}`; ctx.textAlign = 'right'; ctx.fillText(`${i + 1}`, 92, y + 9);
      for (let j = 0; j < 4; j++) {
        ctx.beginPath(); ctx.arc(bx[j], y, 22, 0, Math.PI * 2);
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#6d6658'; ctx.stroke();
        ctx.fillStyle = '#8b8372'; ctx.font = `700 18px ${PRINT}`; ctx.textAlign = 'center'; ctx.fillText(LETTERS[j], bx[j], y + 6);
      }
      const a = answers[i];
      if (a == null) continue;
      ctx.save();
      if (style === 'faint') { ctx.globalAlpha = 0.42; ctx.fillStyle = '#4b4b4b'; ctx.beginPath(); ctx.ellipse(bx[a], y, 15, 13, 0.3, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.globalAlpha = 0.92; ctx.fillStyle = '#26241f'; ctx.beginPath(); ctx.ellipse(bx[a], y, 21, 19, 0.2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      if (style === 'huge') {
        ctx.fillStyle = '#c0261f'; ctx.font = `700 60px ${HAND}`; ctx.textAlign = 'left';
        ctx.fillText(LETTERS[a], 12, y + 20);
      }
    }
    if (style === 'huge') { ctx.fillStyle = '#c0261f'; ctx.font = `700 40px ${HAND}`; ctx.textAlign = 'center'; ctx.fillText('EASY!!', 120, h - 22); }
  };
}

// ============================================================================
// People
// ============================================================================

const world = {};
const students = {};

function makeDesk(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const metal = mat('#717880', { metalness: 0.5, roughness: 0.45 });
  for (const [lx, lz] of [[-0.44, -0.26], [0.44, -0.26], [-0.44, 0.26], [0.44, 0.26]]) {
    const leg = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.72, 8), metal); leg.position.set(lx, 0.36, lz); g.add(leg);
  }
  const top = new THREE.Group();
  top.position.y = 0.75; top.rotation.x = DESK_SLANT;
  const board = mesh(boxGeo(1.0, 0.035, 0.62), mat('#b98a5b', { roughness: 0.55 })); top.add(board);
  const lip = mesh(boxGeo(1.0, 0.03, 0.02), mat('#8f6440')); lip.position.set(0, 0.025, 0.3); top.add(lip);
  const pencil = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.17, 6), mat('#f2c230')); pencil.rotation.z = Math.PI / 2; pencil.position.set(-0.32, 0.03, 0.22); top.add(pencil);
  g.add(top);
  scene.add(g);
  return { group: g, top };
}

function addSheet(desk, { name, version, style, tag, x = 0.06 }) {
  const painter = sheetPainter({ name, version, style });
  const tex = canvasTexture(512, 724, painter);
  const paper = new THREE.Group();
  paper.position.set(x, 0.02, 0.05);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.467), new THREE.MeshStandardMaterial({ map: tex.tex, roughness: 0.9 }));
  front.rotation.x = -Math.PI / 2; front.receiveShadow = true;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.467), mat('#efe9d8'));
  back.rotation.x = Math.PI / 2; back.receiveShadow = true;
  paper.add(gaze(front, tag), gaze(back, 'blank'));
  desk.top.add(paper);
  return { paper, tex, answers: Array(8).fill(null), redraw() { tex.redraw(this.answers); } };
}

const HAIR = ['#2b1d14', '#4a2e1b', '#7a4b26', '#c99a52', '#1b1b1b', '#8b3b22'];
const SKIN = ['#f1c7a5', '#d9a07c', '#a8714d', '#7a4a2d', '#f5d4b8', '#c58c64'];
const TOPS = ['#2f4d7a', '#7a2f3a', '#3d6b4f', '#5b4a7a', '#8a6d2f', '#2c5f63', '#6b6b6b', '#a34e2b'];

function makeStudent(x, z, look = {}) {
  const g = new THREE.Group();
  g.position.set(x, 0, z + 0.5);
  const skin = mat(look.skin || pick(SKIN));
  const top = mat(look.top || pick(TOPS));
  const hair = mat(look.hair || pick(HAIR), { roughness: 0.9 });
  const trousers = mat('#2f3238');
  g.add(makeChair('#4b6670'));
  const torso = mesh(boxGeo(0.4, 0.46, 0.24), top); torso.position.set(0, 0.74, 0.04); torso.rotation.x = -0.12; g.add(gaze(torso, 'body'));
  const thighs = mesh(boxGeo(0.36, 0.13, 0.42), trousers); thighs.position.set(0, 0.52, -0.14); g.add(thighs);
  for (const sx of [-0.1, 0.1]) { const shin = mesh(boxGeo(0.12, 0.45, 0.13), trousers); shin.position.set(sx, 0.24, -0.33); g.add(shin); }
  const head = new THREE.Group(); head.position.set(0, 1.1, 0.0); g.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.13, 20, 16), skin); head.add(gaze(skull, 'body'));
  const neck = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 10), skin); neck.position.set(0, 1.0, 0.02); g.add(neck);
  addHair(head, look.style || pick(['short', 'long', 'bun', 'curly', 'spiky', 'short']), hair);
  for (const sx of [-0.045, 0.045]) { const eye = mesh(new THREE.SphereGeometry(0.014, 8, 6), mat('#1a1a1a'), { cast: false }); eye.position.set(sx, 0.02, -0.122); head.add(eye); }
  const arms = {};
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -0.24 : 0.24;
    const shoulder = new THREE.Group(); shoulder.position.set(sx, 0.93, 0.02); g.add(shoulder);
    const upper = mesh(boxGeo(0.1, 0.3, 0.1), top); upper.position.y = -0.14; shoulder.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -0.28; shoulder.add(elbow);
    const fore = mesh(boxGeo(0.09, 0.28, 0.09), top); fore.position.y = -0.13; elbow.add(fore);
    const handM = mesh(new THREE.SphereGeometry(0.05, 10, 8), skin); handM.position.y = -0.28; elbow.add(handM);
    shoulder.rotation.x = 0.55; elbow.rotation.x = 1.15;
    shoulder.rotation.z = side === 'L' ? -0.12 : 0.12;
    arms[side] = { shoulder, elbow };
  }
  const hand = look.hand || 'R';
  const pencil = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 6), mat('#f2c230')); pencil.position.set(0, -0.3, -0.05); pencil.rotation.x = 1.0; arms[hand].elbow.add(pencil);
  if (look.restOther) { const other = arms[hand === 'L' ? 'R' : 'L']; other.shoulder.rotation.x = 0.12; other.elbow.rotation.x = 0.35; }
  scene.add(g);
  return { group: g, head, arms, hand, phase: rand(0, 10), writing: rand(0, 1) < 0.7, nextSwitch: rand(2, 6), lookYaw: 0, targetYaw: 0, flourish: 0 };
}

function addHair(head, style, m) {
  if (style === 'curly') {
    for (let i = 0; i < 14; i++) {
      const s = mesh(new THREE.SphereGeometry(rand(0.05, 0.07), 10, 8), m);
      const a = rand(0, Math.PI * 2), e = rand(0.1, 1.1);
      s.position.set(Math.cos(a) * 0.12 * Math.cos(e), 0.06 + Math.sin(e) * 0.09, Math.sin(a) * 0.12 * Math.cos(e) + 0.02);
      head.add(s);
    }
    return;
  }
  const cap = mesh(new THREE.SphereGeometry(0.138, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), m);
  cap.position.y = 0.012; cap.rotation.x = -0.25; head.add(cap);
  if (style === 'long') { const back = mesh(boxGeo(0.26, 0.28, 0.08), m); back.position.set(0, -0.08, 0.1); head.add(back); }
  if (style === 'bun') { const bun = mesh(new THREE.SphereGeometry(0.065, 12, 10), m); bun.position.set(0, 0.11, 0.1); head.add(bun); }
  if (style === 'spiky') for (let i = 0; i < 9; i++) {
    const c = mesh(new THREE.ConeGeometry(0.035, 0.11, 6), m);
    const a = (i / 9) * Math.PI * 2;
    c.position.set(Math.cos(a) * 0.07, 0.15, Math.sin(a) * 0.07); c.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    head.add(c);
  }
}

function makeInvigilator() {
  const g = new THREE.Group();
  const cardigan = mat('#6a3f6e');
  const skirt = mat('#2f3646');
  const skin = mat('#e8b996');
  const hips = new THREE.Group(); hips.position.y = 0.88; g.add(hips);
  const legs = [];
  for (const sx of [-0.1, 0.1]) {
    const hip = new THREE.Group(); hip.position.x = sx; hips.add(hip);
    const leg = mesh(boxGeo(0.12, 0.84, 0.13), mat('#3a3330')); leg.position.y = -0.42; hip.add(leg);
    const shoe = mesh(boxGeo(0.13, 0.07, 0.22), mat('#1d1b1a')); shoe.position.set(0, -0.84, -0.04); hip.add(shoe);
    legs.push(hip);
  }
  const skirtM = mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.42, 14), skirt); skirtM.position.y = 0.82; g.add(gaze(skirtM, 'grimsby'));
  const torso = mesh(boxGeo(0.46, 0.58, 0.28), cardigan); torso.position.y = 1.3; g.add(gaze(torso, 'grimsby'));
  const badge = mesh(boxGeo(0.1, 0.05, 0.01), mat('#f7f2e6'), { cast: false }); badge.position.set(0.12, 1.42, -0.145); g.add(badge);
  const lanyard = mesh(boxGeo(0.02, 0.24, 0.01), mat('#c8342b'), { cast: false }); lanyard.position.set(0, 1.42, -0.145); g.add(lanyard);
  const head = new THREE.Group(); head.position.y = 1.74; g.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.145, 22, 16), skin); head.add(gaze(skull, 'grimsby'));
  const hair = mat('#a7a39c', { roughness: 0.95 });
  const cap = mesh(new THREE.SphereGeometry(0.152, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hair); cap.position.y = 0.015; cap.rotation.x = -0.3; head.add(cap);
  const bun = mesh(new THREE.SphereGeometry(0.08, 12, 10), hair); bun.position.set(0, 0.12, 0.12); head.add(bun);
  const rim = mat('#1f1f1f', { metalness: 0.4, roughness: 0.3 });
  for (const sx of [-0.055, 0.055]) {
    const lens = mesh(new THREE.TorusGeometry(0.035, 0.007, 6, 18), rim, { cast: false }); lens.position.set(sx, 0.015, -0.135); head.add(lens);
    const eye = mesh(new THREE.SphereGeometry(0.012, 8, 6), mat('#111'), { cast: false }); eye.position.set(sx, 0.015, -0.13); head.add(eye);
  }
  const bridge = mesh(boxGeo(0.04, 0.008, 0.008), rim, { cast: false }); bridge.position.set(0, 0.02, -0.138); head.add(bridge);
  const arms = [];
  for (const sx of [-0.28, 0.28]) {
    const sh = new THREE.Group(); sh.position.set(sx, 1.55, 0); g.add(sh);
    const arm = mesh(boxGeo(0.11, 0.56, 0.11), cardigan); arm.position.y = -0.28; sh.add(arm);
    const hand = mesh(new THREE.SphereGeometry(0.055, 10, 8), skin); hand.position.y = -0.58; sh.add(hand);
    arms.push(sh);
  }
  const book = mesh(boxGeo(0.26, 0.34, 0.04), mat('#8f2d2a')); book.position.set(0, 1.35, -0.32); book.rotation.x = 0.55; book.visible = false; g.add(book);
  scene.add(g);
  return { group: g, head, legs, arms, book };
}

function buildPeople() {
  const looks = {
    priya: { skin: '#b9825c', hair: '#1a1210', top: '#2c6a6f', style: 'bun', hand: 'L', restOther: true },
    marcus: { skin: '#6e4329', hair: '#161211', top: '#3f6b3a', style: 'curly' },
    dave: { skin: '#f0c9a8', hair: '#d9b25a', top: '#b2382f', style: 'spiky' },
  };
  for (const z of ROWS) for (const x of COLS) {
    const desk = makeDesk(x, z);
    if (x === PLAYER_DESK.x && z === PLAYER_DESK.z) { world.playerDesk = desk; continue; }
    const role = x === -2.7 && z === -1.2 ? 'priya' : x === -0.9 && z === -1.2 ? 'marcus' : x === 0.9 && z === 0.6 ? 'dave' : null;
    const s = makeStudent(x, z, looks[role] || {});
    s.desk = desk;
    if (role) {
      s.role = role;
      s.sheet = addSheet(desk, { name: role[0].toUpperCase() + role.slice(1), version: SHEETS[role].version, style: role === 'priya' ? 'faint' : role === 'dave' ? 'huge' : 'normal', tag: role, x: { priya: 0.27, dave: -0.24, marcus: 0.06 }[role] });
      students[role] = s;
    } else {
      s.sheet = addSheet(desk, { name: pick(['Sam', 'Ellie', 'Tom', 'Ana', 'Kofi', 'Mia', 'Josh', 'Lena', 'Ravi', 'Zoe', 'Ben', 'Ivy']), version: Math.random() < 0.5 ? 'A' : 'B', style: 'normal', tag: 'other' });
      s.fillTimes = Array.from({ length: 8 }, () => rand(20, 290)).sort((a, b) => a - b);
      s.fillAnswers = Array.from({ length: 8 }, () => Math.floor(rand(0, 4)));
      students[`s${x}${z}`] = s;
    }
  }
  // Marcus rests his arm across the bottom of his paper now and then
  const sleeve = mesh(boxGeo(0.34, 0.07, 0.11), mat('#3f6b3a'));
  sleeve.position.set(0.06, 0.06, 0.12); sleeve.rotation.y = 0.15; sleeve.visible = false;
  students.marcus.desk.top.add(gaze(sleeve, 'body'));
  students.marcus.sleeve = sleeve;
  // your own sheet
  world.ownSheet = addSheet(world.playerDesk, { name: 'Candidate 0412', version: 'A', style: 'normal', tag: 'own' });
  world.grimsby = makeInvigilator();
}

// ============================================================================
// Game state
// ============================================================================

const game = {
  state: 'title', t: 0, answers: Array(8).fill(null),
  suspicion: 0, strikes: 0, ahemDone: false, tenDone: false,
  phoneOpen: false, phoneEverOpened: false, buzzed: false, textsShown: 0,
  balls: 3, thrown: 0, ballsSeen: 0,
  bottleHeld: 0, bottleUsed: false,
  peek: { priya: 0, marcus: 0, dave: 0, mug: 0, bottle: 0 },
  priyaStare: 0, priyaNotices: 0, priyaCover: 0,
  marcusCover: 0, marcusNext: 25,
  paperMode: false, endTimer: 0, outcome: null,
  lastTick: -1,
};

// ============================================================================
// Player
// ============================================================================

const input = { keys: new Set(), mx: 0, my: 0, rightDown: false, dragX: 0, dragY: 0 };
const view = { yaw: 0, pitch: -0.12, lean: 0, up: 0, fov: 62, bottleSpin: 0 };
let gazeTag = null;

function setupInput() {
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      input.mx = (e.clientX / innerWidth) * 2 - 1;
      input.my = (e.clientY / innerHeight) * 2 - 1;
    }
  });
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') drag = { x: e.clientX, y: e.clientY, mx: input.mx, my: input.my };
    if (e.button === 2) input.rightDown = true;
  });
  addEventListener('pointermove', (e) => {
    if (!drag || e.pointerType === 'mouse') return;
    input.mx = clamp(drag.mx - ((e.clientX - drag.x) / innerWidth) * 2.2, -1, 1);
    input.my = clamp(drag.my - ((e.clientY - drag.y) / innerHeight) * 2.2, -1, 1);
  });
  addEventListener('pointerup', (e) => { drag = null; if (e.button === 2) input.rightDown = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['tab'].includes(k)) return;
    if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
    if (e.repeat) return;
    tap(k);
    input.keys.add(k);
  });
  addEventListener('keyup', (e) => input.keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => { input.keys.clear(); input.rightDown = false; });

  for (const b of document.querySelectorAll('#touch [data-hold]')) {
    const k = b.dataset.hold;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); input.keys.add(k); b.classList.add('on'); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { input.keys.delete(k); b.classList.remove('on'); });
  }
  for (const b of document.querySelectorAll('#touch [data-tap]')) b.addEventListener('click', () => tap(b.dataset.tap));
}

function tap(k) {
  if (k === 'm') { audio.toggle(); return; }
  if (game.state !== 'play') return;
  if (k === ' ' || k === 'escape' && game.paperMode) togglePaper();
  else if (k === 'p') togglePhone();
  else if (k === 'f') throwBall();
}

function updateView(dt) {
  const k = input.keys;
  const held = (key) => k.has(key);
  const leanTarget = game.paperMode ? 0 : (held('a') || held('q') ? -1 : 0) + (held('d') || held('e') ? 1 : 0);
  const upTarget = !game.paperMode && held('w') ? 1 : 0;
  const squint = !game.paperMode && (held('shift') || input.rightDown);
  const bottle = !game.paperMode && held('b');

  view.lean = damp(view.lean, leanTarget, 7, dt);
  view.up = damp(view.up, upTarget, 6, dt);
  view.fov = damp(view.fov, squint ? 24 : 62, 6, dt);
  document.body.classList.toggle('squinting', squint);

  if (game.paperMode) {
    view.yaw = damp(view.yaw, 0, 6, dt);
    view.pitch = damp(view.pitch, -0.7, 6, dt);
  } else if (bottle) {
    view.bottleSpin = damp(view.bottleSpin, input.mx * Math.PI * 1.15, 10, dt);
  } else {
    view.yaw = damp(view.yaw, -input.mx * 1.75, 9, dt);
    view.pitch = damp(view.pitch, clamp(-input.my * 0.8 - 0.1, -1.0, 0.55), 9, dt);
  }

  const breathe = Math.sin(performance.now() / 1300) * 0.006;
  camera.position.set(SEAT_EYE.x + view.lean * 0.42, SEAT_EYE.y + view.up * 0.2 + breathe - Math.abs(view.lean) * 0.05, SEAT_EYE.z - view.up * 0.18);
  camera.rotation.set(0, 0, 0);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = view.yaw;
  camera.rotation.x = view.pitch;
  camera.rotation.z = -view.lean * 0.09;
  camera.fov = view.fov;
  camera.updateProjectionMatrix();

  // the bottle you raise to "drink"
  world.bottle.visible = bottle;
  world.bottle.rotation.y = view.bottleSpin;
  if (bottle) {
    game.bottleHeld += dt;
    if (game.bottleHeld > 0.6) game.bottleUsed = true;
    if (Math.abs(Math.sin(view.bottleSpin)) < 0.5 && Math.cos(view.bottleSpin) < 0) game.peek.bottle += dt;
  } else game.bottleHeld = 0;

  return { squint, bottle };
}

const ray = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);
function updateGaze() {
  ray.setFromCamera(center, camera);
  ray.far = 12;
  const hit = ray.intersectObjects(gazeTargets, false)[0];
  gazeTag = hit ? hit.object.userData.gaze : null;
  return gazeTag;
}

function makeBottle() {
  const g = new THREE.Group();
  const label = canvasTexture(512, 160, (ctx, w, h) => {
    ctx.fillStyle = '#e9f3f7'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2a76a8'; ctx.fillRect(0, 0, w / 2, h);
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
    ctx.font = `700 40px ${PRINT}`; ctx.fillText('GLACIA', w / 4, 72);
    ctx.font = `italic 22px ${PRINT}`; ctx.fillText('still spring water', w / 4, 112);
    ctx.fillStyle = '#1d2f8c'; ctx.font = `700 34px ${HAND}`;
    BOTTLE_TEXT.forEach((t, i) => ctx.fillText(t, w * 0.62 + (i % 2) * 120, 62 + Math.floor(i / 2) * 50));
    ctx.font = `500 24px ${HAND}`; ctx.fillText('good luck x', w * 0.75, 152);
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#cfe8f2', transparent: true, opacity: 0.35, roughness: 0.1, side: THREE.DoubleSide }));
  const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.0462, 0.0462, 0.075, 48, 1, true), new THREE.MeshStandardMaterial({ map: label.tex, roughness: 0.6 }));
  lab.rotation.y = Math.PI / 2;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.03, 16), mat('#2a76a8'));
  cap.position.y = 0.13;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.045, 0.04, 24), body.material); neck.position.y = 0.115;
  g.add(body, lab, cap, neck);
  g.position.set(0.05, -0.04, -0.4);
  g.visible = false;
  camera.add(g);
  world.bottle = g;
}

// ============================================================================
// Invigilator behaviour
// ============================================================================

const G = {
  pos: new THREE.Vector3(0, 0, -5.85), yaw: Math.PI, headYaw: 0, headPitch: 0,
  state: 'desk', timer: 6, path: [], speed: 1.0, walkPhase: 0, lookAt: null, after: null, stepT: 0,
};
const DESK_SPOT = new THREE.Vector3(0, 0, -5.85);
const BESIDE_YOU = new THREE.Vector3(0, 0, 1.15);
const nearestAisle = (x) => AISLES.reduce((b, a) => (Math.abs(a - x) < Math.abs(b - x) ? a : b));
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

function routeTo(target) {
  const pts = [];
  let cur = G.pos.clone();
  const onDesk = (p) => p.z < -4.6;
  if (onDesk(cur)) { cur = new THREE.Vector3(0, 0, FRONT_Z); pts.push(cur.clone()); }
  if (onDesk(target)) {
    if (Math.abs(cur.x) > 0.05 || Math.abs(cur.z - FRONT_Z) > 0.05) {
      pts.push(new THREE.Vector3(cur.x, 0, FRONT_Z), new THREE.Vector3(0, 0, FRONT_Z));
    }
    pts.push(target.clone());
    return pts;
  }
  const curInCorridor = Math.abs(cur.z - FRONT_Z) < 0.05 || Math.abs(cur.z - BACK_Z) < 0.05;
  if (Math.abs(cur.x - target.x) < 0.05 && !curInCorridor) { pts.push(target.clone()); return pts; }
  const cost = (cz) => Math.abs(cur.z - cz) + Math.abs(target.z - cz);
  const cz = cost(FRONT_Z) <= cost(BACK_Z) ? FRONT_Z : BACK_Z;
  pts.push(new THREE.Vector3(cur.x, 0, cz), new THREE.Vector3(target.x, 0, cz), target.clone());
  return pts;
}

function grimsbyGo(target, state, after) {
  G.path = routeTo(target);
  G.state = state;
  G.after = after;
}

function chooseNext() {
  const r = Math.random();
  if (G.pos.z < -4.6) {
    if (r < 0.32) { G.state = 'read'; G.timer = rand(6, 10); }
    else if (r < 0.6) { G.state = 'desk'; G.timer = rand(6, 11); }
    else patrol();
  } else if (r < 0.3) grimsbyGo(DESK_SPOT, 'walk', () => { G.state = 'desk'; G.timer = rand(5, 9); });
  else patrol();
}

function patrol() {
  const target = new THREE.Vector3(pick(AISLES), 0, pick([-3.6, -2.1, -0.3, 1.5, 3.0]));
  grimsbyGo(target, 'walk', () => { G.state = 'pause'; G.timer = rand(2, 4.5); G.headBase = G.yaw; });
}

function updateGrimsby(dt, t) {
  const g = world.grimsby;
  const toYou = new THREE.Vector3(SEAT_EYE.x - G.pos.x, 0, SEAT_EYE.z - G.pos.z);
  let moving = false;
  G.timer -= dt;

  if (G.path.length) {
    const next = G.path[0];
    const d = new THREE.Vector3(next.x - G.pos.x, 0, next.z - G.pos.z);
    const dist = d.length();
    const speed = G.state === 'catch' ? 1.5 : G.state === 'approach' ? 1.25 : G.speed;
    if (dist < 0.04) { G.pos.copy(next); G.path.shift(); if (!G.path.length && G.after) { const a = G.after; G.after = null; a(); } }
    else {
      d.normalize();
      G.pos.addScaledVector(d, Math.min(dist, speed * dt));
      G.yaw = turnToward(G.yaw, yawTo(d.x, d.z), 6, dt);
      moving = true;
    }
  }

  // head: where she's looking
  let headTarget = 0, pitchTarget = 0.05;
  switch (G.state) {
    case 'desk': if (!G.path.length) { G.yaw = turnToward(G.yaw, Math.PI, 3, dt); headTarget = Math.sin(t * 0.45) * 0.95; } if (G.timer <= 0) chooseNext(); break;
    case 'read': G.yaw = turnToward(G.yaw, Math.PI, 3, dt); pitchTarget = 0.55; if (G.timer <= 0) chooseNext(); break;
    case 'pause': headTarget = Math.sin(t * 0.9) * 1.1; if (G.timer <= 0) chooseNext(); break;
    case 'walk': headTarget = Math.sin(t * 0.7) * 0.5; break;
    case 'investigate': if (G.lookAt && !G.path.length) { G.yaw = turnToward(G.yaw, yawTo(G.lookAt.x - G.pos.x, G.lookAt.z - G.pos.z), 4, dt); pitchTarget = 0.6; if (G.timer <= 0) { if (world.ball) { scene.remove(world.ball.mesh); world.ball = null; } say('hmm'); chooseNext(); } } break;
    case 'approach': case 'watchYou': case 'catch':
      if (!G.path.length) { G.yaw = turnToward(G.yaw, yawTo(toYou.x, toYou.z), 5, dt); pitchTarget = 0.25; }
      if (G.state === 'watchYou' && G.timer <= 0) chooseNext();
      break;
    case 'glance': G.yaw = turnToward(G.yaw, yawTo(toYou.x, toYou.z), 4, dt); if (G.timer <= 0) { G.state = G.prev || 'desk'; G.timer = rand(3, 6); } break;
  }
  G.headYaw = damp(G.headYaw, headTarget, 3, dt);
  G.headPitch = damp(G.headPitch, pitchTarget, 4, dt);

  // walk cycle
  if (moving) {
    G.walkPhase += dt * 7;
    const prevStep = Math.sin(G.stepT);
    G.stepT = G.walkPhase;
    if (Math.sign(Math.sin(G.stepT)) !== Math.sign(prevStep)) {
      const rel = G.pos.clone().sub(camera.position);
      const pan = clamp(rel.clone().applyQuaternion(camera.quaternion.clone().invert()).x / 4, -1, 1);
      audio.step(pan, clamp(1.4 - rel.length() / 8, 0.2, 1));
    }
  } else G.walkPhase = damp(G.walkPhase, Math.round(G.walkPhase / Math.PI) * Math.PI, 8, dt);
  const swing = moving ? Math.sin(G.walkPhase) * 0.45 : 0;
  g.legs[0].rotation.x = swing; g.legs[1].rotation.x = -swing;
  g.arms[0].rotation.x = -swing * 0.6; g.arms[1].rotation.x = swing * 0.6;
  const reading = G.state === 'read';
  g.book.visible = reading;
  if (reading) { g.arms[0].rotation.x = 1.2; g.arms[1].rotation.x = 1.2; }
  g.group.position.set(G.pos.x, moving ? Math.abs(Math.sin(G.walkPhase)) * 0.025 : 0, G.pos.z);
  g.group.rotation.y = G.yaw;
  g.head.rotation.set(-G.headPitch, G.headYaw, 0, 'YXZ');
}

function turnToward(a, b, k, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * (1 - Math.exp(-k * dt));
}

// How well she can see you right now, from 0 to 1.
function grimsbyVision(wideCone) {
  if (G.state === 'read') return 0;
  const lookYaw = G.yaw + G.headYaw;
  const dir = new THREE.Vector3(-Math.sin(lookYaw), 0, -Math.cos(lookYaw));
  const to = new THREE.Vector3(camera.position.x - G.pos.x, 0, camera.position.z - G.pos.z);
  const dist = to.length();
  to.normalize();
  const cos = dir.dot(to);
  const cone = wideCone ? smooth(Math.cos(1.5), Math.cos(0.6), cos) : smooth(Math.cos(0.95), Math.cos(0.35), cos);
  return cone * clamp(1.45 - dist / 9, 0.4, 1);
}

// ============================================================================
// Suspicion
// ============================================================================

function behaviour({ squint, bottle }) {
  if (game.paperMode) return 0;
  let s = 0;
  s += Math.abs(view.lean) * 0.32;
  s += view.up * 0.2;
  if (squint) s += 0.18;
  if (['priya', 'marcus', 'dave', 'other'].includes(gazeTag)) s += squint ? 0.65 : 0.45;
  if (gazeTag === 'mug') s += 0.15;
  if (Math.abs(view.yaw) > 1.15) s += 0.2;
  if (bottle && game.bottleHeld > 2.5) s += 0.55;
  if (game.phoneOpen) s += 1;
  return Math.min(1, s);
}

function addSuspicion(n) {
  if (game.state !== 'play') return;
  game.suspicion = clamp(game.suspicion + n, 0, 100);
  if (game.suspicion >= 100) strike();
}

function strike() {
  game.strikes += 1;
  audio.sting();
  if (game.strikes >= 3) return caught();
  game.suspicion = 40;
  say(game.strikes === 1 ? 'strike1' : 'strike2');
  grimsbyGo(BESIDE_YOU, 'approach', () => { G.state = 'watchYou'; G.timer = 9; });
}

function caught() {
  game.state = 'ending';
  game.outcome = 'caught';
  closePhone();
  togglePaperOff();
  say('caught');
  grimsbyGo(BESIDE_YOU, 'catch', () => { G.state = 'catch'; });
  setTimeout(() => finish(), 3800);
}

function updateSuspicion(dt, actions) {
  const v = grimsbyVision(game.phoneOpen);
  const s = behaviour(actions);
  if (s > 0.12) addSuspicion(s * v * 46 * dt);
  else game.suspicion = clamp(game.suspicion - (game.paperMode ? 11 : 5) * dt, 0, 100);
  if (!game.ahemDone && game.suspicion > 55) {
    game.ahemDone = true;
    say('ahem');
    if (['desk', 'pause', 'walk'].includes(G.state) && !G.path.length) { G.prev = G.state; G.state = 'glance'; G.timer = 2.5; }
  }
  if (game.suspicion < 20) game.ahemDone = false;
  return v;
}

// ============================================================================
// Neighbours
// ============================================================================

function updateStudents(dt, t) {
  for (const s of Object.values(students)) {
    s.phase += dt;
    s.nextSwitch -= dt;
    if (s.nextSwitch <= 0) {
      s.writing = Math.random() < 0.75;
      s.targetYaw = Math.random() < 0.25 ? rand(-0.5, 0.5) : 0;
      s.nextSwitch = rand(2, 7);
    }
    if (s.flourish > 0) s.flourish -= dt;
    const writing = s.writing || s.flourish > 0;
    s.arms[s.hand].shoulder.rotation.x = 0.55 + (writing ? Math.sin(s.phase * 13) * 0.04 : 0.1);
    s.arms[s.hand].elbow.rotation.x = 1.15 + (writing ? Math.cos(s.phase * 11) * 0.06 : -0.25);
    let yaw = s.targetYaw;
    if (s.role === 'priya' && game.priyaCover > 0) yaw = -1.9;
    s.lookYaw = damp(s.lookYaw, yaw, 4, dt);
    s.head.rotation.y = s.lookYaw;
    s.head.rotation.x = writing ? -0.35 : -0.08;
    if (writing && Math.random() < dt * 0.5) audio.scratch(clamp((s.group.position.x - camera.position.x) / 4, -1, 1));
    if (s.fillTimes) {
      while (s.fillTimes.length && s.fillTimes[0] <= t) {
        s.fillTimes.shift();
        s.sheet.answers[8 - s.fillTimes.length - 1] = s.fillAnswers[8 - s.fillTimes.length - 1];
        s.sheet.redraw();
      }
    }
  }
  for (const role of ['priya', 'marcus', 'dave']) {
    const s = students[role];
    let changed = false;
    for (let i = 0; i < 8; i++) {
      if (s.sheet.answers[i] == null && t >= SHEETS[role].fill(i)) { s.sheet.answers[i] = SHEETS[role].answers[i]; changed = true; s.flourish = 1.2; }
    }
    if (changed) s.sheet.redraw();
  }

  // Priya notices when you stare
  const p = students.priya;
  if (game.state !== 'play') { p.sheet.paper.rotation.z = damp(p.sheet.paper.rotation.z, 0, 8, dt); }
  else if (game.priyaCover > 0) {
    game.priyaCover -= dt;
    p.sheet.paper.rotation.z = damp(p.sheet.paper.rotation.z, Math.PI, 8, dt);
  } else {
    p.sheet.paper.rotation.z = damp(p.sheet.paper.rotation.z, 0, 8, dt);
    if (gazeTag === 'priya') game.priyaStare += dt; else game.priyaStare = Math.max(0, game.priyaStare - dt * 0.35);
    if (game.priyaStare > 3.2) {
      game.priyaStare = 0;
      game.priyaNotices += 1;
      game.priyaCover = 9;
      if (game.priyaNotices >= 2) { say('priyaTell'); addSuspicion(38); if (game.state === 'play') grimsbyGo(BESIDE_YOU, 'approach', () => { G.state = 'watchYou'; G.timer = 8; }); }
      else { say('priya'); addSuspicion(12); }
    }
  }

  // Marcus covers the bottom of his paper with his arm
  const m = students.marcus;
  game.marcusNext -= dt;
  if (game.marcusNext <= 0) {
    m.sleeve.visible = !m.sleeve.visible;
    game.marcusNext = m.sleeve.visible ? rand(10, 18) : rand(8, 14);
  }

  if (game.state !== 'play') return;
  for (const role of ['priya', 'marcus', 'dave']) if (gazeTag === role) game.peek[role] += dt;
  if (gazeTag === 'mug' && view.fov < 40) game.peek.mug += dt;
}

// ============================================================================
// Gadgets: phone, paper balls
// ============================================================================

function togglePhone() {
  if (game.phoneOpen) return closePhone();
  if (game.paperMode) togglePaper();
  game.phoneOpen = true;
  game.phoneEverOpened = true;
  $('#phone').hidden = false;
  world.phoneLight.intensity = 1.6;
  renderPhone();
}
function closePhone() {
  game.phoneOpen = false;
  $('#phone').hidden = true;
  world.phoneLight.intensity = 0;
}
function renderPhone() {
  const shown = TEXTS.filter((m) => m.t <= game.t);
  $('#msgs').replaceChildren(...shown.map((m) => el('div', { class: 'msg' }, m.text)));
  const next = TEXTS.find((m) => m.t > game.t);
  $('#typing').textContent = next && next.t - game.t < 6 ? 'Jess is typing…' : '';
  const box = $('#msgs'); box.scrollTop = box.scrollHeight;
}
function updatePhone() {
  const count = TEXTS.filter((m) => m.t <= game.t).length;
  if (count !== game.textsShown) {
    game.textsShown = count;
    if (!game.phoneEverOpened && !game.buzzed) {
      game.buzzed = true;
      audio.buzz();
      toast('Bzzzt. Your phone is on vibrate.');
      const d = G.pos.distanceTo(new THREE.Vector3(SEAT_EYE.x, 0, SEAT_EYE.z));
      setTimeout(() => { if (game.state === 'play') { say('buzz'); addSuspicion(d < 6 ? 34 : 18); } }, 900);
    } else if (!game.phoneOpen) toast('Your phone lit up in your sock');
  }
  if (game.phoneOpen) renderPhone();
}

function throwBall() {
  if (game.paperMode || game.balls <= 0 || world.ball) { if (game.balls <= 0) toast('No paper left to scrunch up'); return; }
  game.balls -= 1; game.thrown += 1;
  const m = mesh(new THREE.IcosahedronGeometry(0.045, 0), mat('#f4f0e2', { flatShading: true }));
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  m.position.copy(camera.position).addScaledVector(dir, 0.3);
  scene.add(m);
  world.ball = { mesh: m, vel: dir.multiplyScalar(7.5).add(new THREE.Vector3(0, 2.2, 0)), landed: false };
  audio.whoosh();
  const v = grimsbyVision(false);
  if (v > 0.25) { game.ballsSeen += 1; game.ahemDone = true; say('ball'); addSuspicion(55); }
}

function updateBall(dt) {
  const b = world.ball;
  if (!b || b.landed) return;
  b.vel.y -= 9.8 * dt;
  b.mesh.position.addScaledVector(b.vel, dt);
  b.mesh.rotation.x += dt * 9; b.mesh.rotation.z += dt * 7;
  const p = b.mesh.position;
  if (Math.abs(p.x) > ROOM.x - 0.1) { p.x = Math.sign(p.x) * (ROOM.x - 0.1); b.vel.x *= -0.35; }
  if (p.z < ROOM.front + 0.1 || p.z > ROOM.back - 0.1) { p.z = clamp(p.z, ROOM.front + 0.1, ROOM.back - 0.1); b.vel.z *= -0.35; }
  if (p.y <= 0.045) {
    p.y = 0.045; b.landed = true;
    audio.thud(clamp((p.x - camera.position.x) / 4, -1, 1));
    if (game.state === 'play' && !['approach', 'watchYou', 'catch'].includes(G.state)) {
      const spot = new THREE.Vector3(nearestAisle(p.x), 0, clamp(p.z, FRONT_Z, BACK_Z));
      G.lookAt = p.clone();
      grimsbyGo(spot, 'investigate', () => { G.timer = 4.5; });
      G.state = 'investigate';
    }
  }
}

// ============================================================================
// Your paper
// ============================================================================

function gloonSvg() {
  return `<svg class="diagram" viewBox="0 0 220 130" role="img" aria-label="A diagram of a gloon, a lumpy creature, with an arrow labelled X pointing at a squiggle on its side">
  <path d="M30 90 C 20 40, 80 20, 110 40 C 140 10, 200 40, 185 85 C 175 120, 60 125, 30 90 Z" fill="#efe6cf" stroke="#2a2722" stroke-width="2.5"/>
  <circle cx="80" cy="55" r="6" fill="#2a2722"/><circle cx="100" cy="52" r="4" fill="#2a2722"/>
  <path d="M120 75 q 8 -10 16 0 t 16 0" fill="none" stroke="#2a2722" stroke-width="2.5"/>
  <path d="M60 100 l -8 18 M90 105 l 0 18 M150 100 l 10 18" stroke="#2a2722" stroke-width="2.5"/>
  <path d="M200 20 L 150 70" stroke="#c8342b" stroke-width="2" marker-end="url(#ar)"/>
  <defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#c8342b"/></marker></defs>
  <text x="200" y="16" font-family="Caveat, cursive" font-size="22" fill="#c8342b">X</text>
  <text x="18" y="22" font-family="Libre Baskerville, serif" font-size="11" font-style="italic" fill="#2a2722">Fig. 1 — a gloon (not to scale)</text></svg>`;
}

function renderBooklet() {
  const b = $('#booklet');
  const qs = QUESTIONS.map((q, i) => {
    const opts = q.opts.map((o, j) => el('button', {
      class: `opt${game.answers[i] === j ? ' on' : ''}`,
      onclick: () => { game.answers[i] = j; audio.shade(); world.ownSheet.answers[i] = j; world.ownSheet.redraw(); renderBooklet(); },
      'aria-pressed': String(game.answers[i] === j),
    }, el('span', { class: 'bubble' }, LETTERS[j]), el('span', {}, o)));
    const wrap = el('div', { class: 'q' }, el('p', {}, el('b', {}, `${i + 1}.`), q.q));
    if (q.diagram) { const d = document.createElement('div'); d.innerHTML = gloonSvg(); wrap.append(d.firstElementChild); }
    wrap.append(el('div', { class: 'opts' }, opts));
    return wrap;
  });
  const done = game.answers.filter((a) => a != null).length;
  b.replaceChildren(
    el('header', {},
      el('div', {}, el('h2', {}, 'Advanced Nonsense'), el('div', { class: 'sub' }, 'Higher Tier · Answer all questions · Shade one bubble each')),
      el('span', { class: 'paper-code' }, 'PAPER A')),
    ...qs,
    el('footer', {},
      el('span', {}, `${done} of 8 shaded`),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
        el('button', { class: 'btn btn-line', onclick: () => togglePaper() }, 'Look up (Space)'),
        el('button', { class: 'btn btn-ink', onclick: () => handIn() }, 'Hand in early'))));
}

function togglePaper() {
  if (game.state !== 'play') return;
  game.paperMode = !game.paperMode;
  if (game.paperMode) { closePhone(); renderBooklet(); }
  $('#booklet').hidden = !game.paperMode;
  $('#reticle').hidden = game.paperMode;
}

function handIn() {
  if (game.state !== 'play') return;
  game.outcome = 'early';
  game.state = 'ending';
  togglePaperOff();
  finish();
}
function togglePaperOff() { game.paperMode = false; $('#booklet').hidden = true; }

// ============================================================================
// Ending and report card
// ============================================================================

const ENDINGS = {
  disq: { title: 'DISQUALIFIED', blurb: 'Escorted out with 20 minutes to go.' },
  ghost: { title: 'THE GHOST', blurb: 'Full marks. Not one warning. Nobody saw a thing.' },
  astar: { title: 'A* (UNDER INVESTIGATION)', blurb: 'Full marks, and a meeting with the head.' },
  daveB: { title: 'PAPER B ENTHUSIAST', blurb: 'Copied Dave. Dave was on a different paper.' },
  honest: { title: 'HONEST, SADLY', blurb: 'No cheating at all. It shows.' },
  criminal: { title: 'QUIETLY CRIMINAL', blurb: 'Most of it right. Some of it suspicious.' },
  wrong: { title: 'CONFIDENTLY WRONG', blurb: 'Cheated, and still got it wrong.' },
  average: { title: 'AVERAGE CHEAT', blurb: 'Some cheating. Some luck. A pass, roughly.' },
};

function grade(score) { return ['U', 'U', 'U', 'E', 'D', 'C', 'B', 'A', 'A*'][score]; }

function results() {
  const a = game.answers;
  const right = a.map((x, i) => (i === 7 ? x != null && x === a[1] : x === KEY[i]));
  const score = right.filter(Boolean).length;
  const matches = (arr) => a.filter((x, i) => x != null && x === arr[i]).length;
  const daveMatch = a.filter((x, i) => x != null && x === SHEETS.dave.answers[i] && x !== KEY[i]).length;
  const priyaMatch = matches(SHEETS.priya.answers);
  const peeked = (k) => game.peek[k] > 0.8;
  const cheated = peeked('priya') || peeked('marcus') || peeked('dave') || game.phoneEverOpened || game.bottleUsed || peeked('mug') || game.thrown > 0;
  let ending;
  if (game.outcome === 'caught') ending = 'disq';
  else if (score === 8 && game.strikes === 0) ending = 'ghost';
  else if (score === 8) ending = 'astar';
  else if (daveMatch >= 4) ending = 'daveB';
  else if (!cheated) ending = 'honest';
  else if (score >= 6) ending = 'criminal';
  else if (score <= 2) ending = 'wrong';
  else ending = 'average';

  const notes = [];
  if (game.outcome === 'caught') notes.push(game.phoneOpen ? 'Caught with a phone glowing under the desk.' : 'Asked to leave after three warnings. Left the bubbles half shaded.');
  if (right[6] && peeked('mug')) notes.push('Knew my middle name. Nobody knows my middle name.');
  else if (right[6]) notes.push('Guessed my middle name. I am considering moving house.');
  if (daveMatch >= 3) notes.push('Your answers match Dave’s almost exactly. Dave sat Paper B.');
  if (priyaMatch >= 5 && peeked('priya')) notes.push('Remarkably similar to Priya’s paper. Priya has asked to move desks.');
  if (game.buzzed) notes.push('Your sock buzzed during the exam.');
  else if (game.phoneEverOpened) notes.push('Spent a long time looking at your knees.');
  if (game.bottleUsed) notes.push('Drank a lot of water for someone whose bottle stayed full.');
  if (game.thrown) notes.push(`Someone threw ${game.thrown} paper ball${game.thrown > 1 ? 's' : ''}. I have my suspicions.`);
  if (a[7] != null && a[7] === a[1] && a[1] !== KEY[1]) notes.push('Followed the instructions for Question 8 perfectly. Question 2, less so.');
  if (ending === 'honest') notes.push('Did not cheat. Also did not know anything.');
  if (game.strikes === 0 && cheated && game.outcome !== 'caught') notes.push('Never once looked up. Or so it seemed.');
  if (game.strikes >= 2 && game.outcome !== 'caught') notes.push(`Told to keep their eyes on their own paper ${game.strikes} times.`);
  const blank = a.filter((x) => x == null).length;
  if (blank && game.outcome !== 'caught') notes.push(`${blank} question${blank > 1 ? 's' : ''} left blank. Honest, at least.`);
  return { score, ending, notes: notes.slice(0, 3), right };
}

function finish() {
  if (game.state === 'report') return;
  game.state = 'report';
  closePhone();
  togglePaperOff();
  $('#fade').classList.add('on');
  audio.bell();
  setTimeout(showReport, 1300);
}

function showReport() {
  const r = results();
  const found = new Set(store.get('eyes-endings', []));
  const isNew = !found.has(r.ending);
  found.add(r.ending);
  store.set('eyes-endings', [...found]);
  const e = { ...ENDINGS[r.ending] };
  if (r.ending === 'disq') { const left = Math.max(1, Math.round(45 - (game.t / EXAM_SECONDS) * 45)); e.blurb = `Escorted out with ${left} minute${left === 1 ? '' : 's'} to go.`; }
  const g = game.outcome === 'caught' ? 'X' : grade(r.score);
  const shareText = `Eyes On Your Own Paper — ${game.outcome === 'caught' ? 'Disqualified' : `Grade ${g} (${r.score}/8)`} · ${e.title} · ${game.strikes}/3 warnings`;
  const answerLine = el('p', { class: 'found' }, 'Your paper: ', ...game.answers.map((x, i) => el('span', { style: `margin-right:8px;${r.right[i] ? '' : 'text-decoration:line-through;'}` }, `${i + 1}${x == null ? '–' : LETTERS[x]}`)));
  $('#report').replaceChildren(el('div', { class: 'sheet' },
    el('div', { class: 'stamp' }, e.title),
    el('span', { class: 'eyebrow' }, 'Statement of results · Candidate 0412'),
    el('h1', {}, game.outcome === 'caught' ? 'Disqualified' : 'Your result'),
    el('p', {}, el('i', {}, 'Advanced Nonsense (Higher Tier), Paper A')),
    el('div', { class: 'grade' }, el('div', { class: 'ring' }, g),
      el('div', {}, el('b', {}, game.outcome === 'caught' ? 'No mark awarded' : `${r.score} out of 8`), el('div', {}, e.blurb),
        el('div', { class: 'found' }, `Warnings: ${game.strikes} of 3`))),
    el('p', { class: 'eyebrow' }, 'Invigilator’s comments'),
    el('ul', { class: 'comments' }, r.notes.map((n) => el('li', {}, n))),
    answerLine,
    el('p', { class: 'found' }, `${isNew ? 'New ending! ' : ''}Endings found: ${found.size} of ${Object.keys(ENDINGS).length}`),
    el('div', { class: 'row' },
      el('button', { class: 'btn btn-ink', onclick: () => location.reload() }, 'Resit the exam'),
      el('button', { class: 'btn btn-line', onclick: async () => {
        try { await navigator.clipboard.writeText(shareText); toast('Result copied'); }
        catch { toast('Couldn’t copy automatically'); }
      } }, 'Copy result'))));
  $('#report').hidden = false;
  $('#hud').hidden = true;
  $('#touch').hidden = true;
}

// ============================================================================
// HUD
// ============================================================================

function updateHud(v) {
  const examMin = (game.t / EXAM_SECONDS) * 45;
  const mins = Math.floor(examMin);
  $('#clock-time').textContent = `10:${String(mins).padStart(2, '0')}`;
  const left = Math.max(0, 45 - mins);
  $('#clock-left').textContent = `${left} minute${left === 1 ? '' : 's'} left`;
  const bar = $('#sus-bar');
  bar.style.width = `${game.suspicion}%`;
  bar.classList.toggle('hot', game.suspicion > 60);
  document.querySelectorAll('#strikes b').forEach((b, i) => b.classList.toggle('on', i < game.strikes));
  const seen = v > 0.3;
  $('#seen').classList.toggle('on', seen);
  $('#eye-pupil').setAttribute('r', String(2 + v * 4));
  document.querySelector('.watch').style.color = seen ? 'var(--danger)' : 'var(--hud-ink)';
  $('#gadgets').textContent = `Paper balls: ${game.balls} · Phone: ${game.phoneOpen ? 'out' : 'in sock'}`;

  // clock hands
  const totalMin = 600 + examMin;
  world.minuteHand.rotation.z = -((totalMin % 60) / 60) * Math.PI * 2;
  world.hourHand.rotation.z = -(((totalMin / 60) % 12) / 12) * Math.PI * 2;
  world.secondHand.rotation.z = -((game.t * 9) % 60) / 60 * Math.PI * 2;
}

// ============================================================================
// Main loop
// ============================================================================

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const playing = game.state === 'play';
  if (playing) game.t += dt;
  const actions = game.state === 'title' ? { squint: false, bottle: false } : updateView(dt);
  if (game.state === 'title') {
    // slow look around the hall behind the cover sheet
    camera.position.set(SEAT_EYE.x, SEAT_EYE.y, SEAT_EYE.z);
    camera.rotation.set(-0.12, Math.sin(now / 4000) * 0.5, 0, 'YXZ');
  }
  updateGaze();
  updateStudents(dt, game.t);
  updateGrimsby(dt, now / 1000);
  updateBall(dt);
  let v = 0;
  if (playing) {
    v = updateSuspicion(dt, actions);
    updatePhone();
    const sec = Math.floor(game.t);
    if (sec !== game.lastTick) { game.lastTick = sec; audio.tick(); }
    if (!game.tenDone && game.t > EXAM_SECONDS * (35 / 45)) { game.tenDone = true; say('tenLeft'); }
    if (game.t >= EXAM_SECONDS) {
      game.state = 'ending';
      game.outcome = 'time';
      say('end');
      setTimeout(finish, 2600);
    }
  }
  if (game.state !== 'title' && game.state !== 'report') updateHud(v);
  const d = world.dust.geometry.attributes.position;
  for (let i = 0; i < d.count; i += 7) d.setY(i, d.getY(i) + Math.sin(now / 900 + i) * 0.0004);
  d.needsUpdate = true;
  world.dust.rotation.y = Math.sin(now / 20000) * 0.05;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function start() {
  audio.start();
  $('#title').hidden = true;
  $('#hud').hidden = false;
  if (matchMedia('(pointer: coarse)').matches) $('#touch').hidden = false;
  game.state = 'play';
  game.t = 0;
  say('start');
  G.state = 'desk'; G.timer = 7;
}

// ============================================================================
// Boot
// ============================================================================

await fontsReady();
buildRoom();
buildPeople();
makeBottle();
world.phoneLight = new THREE.PointLight('#9fc2ff', 0, 1.6, 2);
world.phoneLight.position.set(0, -0.35, -0.15);
camera.add(world.phoneLight);
setupInput();
resize();
addEventListener('resize', resize);
const found = store.get('eyes-endings', []);
if (found.length) $('#title-found').textContent = `Endings found: ${found.length} of ${Object.keys(ENDINGS).length}`;
$('#start-btn').addEventListener('click', start);
requestAnimationFrame(frame);
