import {
  ROUNDS, ROUND_MS, botAnswers, chooseOpponent, leaderboard, maxScore, newRunId, pickQuestions, points,
  sanitizeRun, shuffledOrder, total,
} from './duel.js';

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
const data = await (await fetch('questions.json')).json();
const QBY = new Map(data.questions.map((q) => [q.id, q]));
const TOPICS = new Map(data.topics.map((t) => [t.id, t]));
const shareUrl = document.querySelector('meta[name="pm:share-url"]')?.content || '';

// Simple line drawings, one per topic. Static markup, never user data.
const ICONS = {
  body: '<path d="M22 37s-13-8-13-17a7 7 0 0 1 13-3 7 7 0 0 1 13 3c0 9-13 17-13 17z"/><path d="M9 22h7l3-5 4 9 3-4h9"/>',
  life: '<path d="M14 6c0 10 16 12 16 22s-16 8-16 10"/><path d="M30 6c0 10-16 12-16 22s16 8 16 10"/><path d="M17 12h10M15 20h14M15 28h14M17 34h10"/>',
  animals: '<ellipse cx="22" cy="29" rx="8" ry="7"/><circle cx="12" cy="19" r="3.5"/><circle cx="18" cy="12" r="3.5"/><circle cx="26" cy="12" r="3.5"/><circle cx="32" cy="19" r="3.5"/>',
  earth: '<circle cx="22" cy="22" r="10"/><ellipse cx="22" cy="22" rx="19" ry="6" transform="rotate(-20 22 22)"/>',
  ancient: '<path d="M8 12h28M10 8h24l2 4M10 36h24M8 40h28"/><path d="M13 14v20M19 14v20M25 14v20M31 14v20"/>',
};

// ---------- helpers ----------
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* blocked */ } },
};

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}

function icon(topic) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 44 44');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[topic] || '';
  return svg;
}

let toastTimer;
function toast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
}

let timers = [];
let frame = 0;
function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
  cancelAnimationFrame(frame);
  document.onkeydown = null;
}

// ---------- platform (all optional: without them you play bots) ----------
async function capability(name) {
  try { return (await window.claude?.use?.(name)) ?? null; } catch { return null; }
}

let db = null;
let user = null;
let me = { id: null, name: '', avatarUrl: '' };
let runs = [];
let challenge = null;
const people = {};

async function resolveNames(ids) {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!user || !wanted.length) return;
  try { Object.assign(people, await user.profiles(wanted)); } catch { /* names stay generic */ }
}

function personFor(kind, opts = {}) {
  if (kind === 'you') return { side: 'you', name: me.name || 'You', avatar: me.avatarUrl, tag: null };
  if (kind === 'bot') return { side: 'opp', name: opts.bot.name, avatar: null, tag: 'Bot' };
  const p = opts.id ? people[opts.id] : null;
  return { side: 'opp', name: p?.name || 'Someone', avatar: p?.avatarUrl || null, tag: null };
}

function avatar(person, small = false) {
  const cls = `avatar${small ? ' small' : ''}`;
  if (person.avatar) return h('img', { class: cls, src: person.avatar, alt: '' });
  const initial = person.tag === 'Bot' ? '⚙' : (person.name.trim()[0] || '?').toUpperCase();
  return h('div', { class: cls, 'aria-hidden': 'true' }, initial);
}

// ---------- home ----------
let screen = 'home';
let homeToken = 0;

async function renderHome() {
  screen = 'home';
  clearTimers();
  const token = ++homeToken;
  const boards = new Map(data.topics.map((t) => [t.id, leaderboard(runs, t.id)]));
  await resolveNames([...[...boards.values()].flat().map((r) => r.by), challenge?.by]);
  if (token !== homeToken || screen !== 'home') return;

  const topicCards = data.topics.map((t) => {
    const games = runs.filter((r) => r.topic === t.id).length;
    const top = boards.get(t.id)[0];
    const mine = me.id ? Math.max(0, ...runs.filter((r) => r.topic === t.id && r.by === me.id).map((r) => r.score)) : 0;
    return h('button', { class: 'topic', onclick: () => startMatch(t.id) },
      icon(t.id),
      h('div', {},
        h('h2', {}, t.name),
        h('div', { class: 'blurb' }, t.blurb),
        h('div', { class: 'stats' },
          db ? h('span', {}, `${games} ${games === 1 ? 'game' : 'games'}`) : null,
          top ? h('span', {}, 'Top ', h('b', {}, String(top.score)), ` ${top.by === me.id ? 'you' : personFor('ghost', { id: top.by }).name}`) : null,
          mine ? h('span', {}, 'Your best ', h('b', {}, String(mine))) : null)),
      h('span', { class: 'go' }, 'Play'));
  });

  const banner = challenge && h('div', { class: 'banner' },
    h('p', {}, h('b', {}, personFor('ghost', { id: challenge.by }).name), ` challenged you in ${TOPICS.get(challenge.topic).name}. They scored `,
      h('b', { class: 'mono' }, String(challenge.score)), '.'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-you', onclick: () => { const run = challenge; challenge = null; startMatch(run.topic, run); } }, 'Accept challenge'),
      h('button', { class: 'btn btn-line', onclick: () => { challenge = null; renderHome(); } }, 'Not now')));

  app.replaceChildren(...[
    h('header', { class: 'masthead' },
      h('span', { class: 'label' }, 'Head-to-head science trivia'),
      h('h1', {}, 'Polymath'),
      h('p', {}, 'Seven questions, ten seconds each. Answer faster than your opponent to score more. The last round counts double.')),
    banner,
    h('div', { class: 'topics' }, topicCards),
    h('p', { class: 'footnote' }, db
      ? 'You play against other people’s recorded games, answer for answer, at their real speed. If nobody has played a topic yet, you face a bot.'
      : 'Other players’ games aren’t available here, so you’ll face bots.'),
  ].filter(Boolean));
}

// ---------- a match ----------
let match = null;

async function startMatch(topic, forcedRun = null) {
  clearTimers();
  screen = 'match';
  const played = new Set(store.get('pm-played', []));
  const opponent = forcedRun ? { kind: 'ghost', run: forcedRun } : chooseOpponent(runs, topic, me.id, played);
  if (opponent.kind === 'ghost') await resolveNames([opponent.run.by]);
  match = {
    topic,
    qs: opponent.kind === 'ghost' ? opponent.run.qs : pickQuestions(data.questions, topic),
    opp: opponent.kind === 'ghost'
      ? { ...personFor('ghost', { id: opponent.run.by }), runId: opponent.run.id, answers: opponent.run.ans }
      : { ...personFor('bot', { bot: opponent.bot }), botKey: opponent.bot.key, answers: botAnswers(opponent.bot) },
    mine: [],
    orders: Array.from({ length: ROUNDS }, () => shuffledOrder()),
    round: 0,
  };
  renderVs();
  later(() => startRound(), 2400);
}

function playerCard(person) {
  return h('div', { class: `player-card ${person.side}` }, avatar(person), h('span', { class: 'name' }, person.name),
    person.tag ? h('span', { class: 'tag' }, person.tag) : null);
}

function renderVs() {
  const you = personFor('you');
  app.replaceChildren(h('section', { class: 'vs' },
    h('span', { class: 'label' }, TOPICS.get(match.topic).name),
    h('div', { class: 'pair' }, playerCard(you), h('span', { class: 'x' }, 'vs'), playerCard(match.opp)),
    h('p', { class: 'muted' }, match.opp.tag
      ? 'Nobody else has played this topic yet, so you’re up against a bot.'
      : `You’re racing ${match.opp.name}’s recorded game: same questions, their real answers and timing.`)));
}

function side(person, score, right = false) {
  return h('div', { class: `side ${person.side}${right ? ' right' : ''}` },
    avatar(person, true),
    h('div', { class: 'who' },
      h('div', { class: 'name' }, person.name),
      h('div', { class: 'score', 'data-score': '' }, String(score)),
      h('div', { class: 'answered', 'data-answered': '' })));
}

function startRound() {
  clearTimers();
  const i = match.round;
  const q = QBY.get(match.qs[i]);
  const order = match.orders[i];
  const oppAnswer = match.opp.answers[i];
  const myScore = total(match.mine);
  const oppScore = total(match.opp.answers.slice(0, i));
  const you = personFor('you');

  const youSide = side(you, myScore);
  const oppSide = side(match.opp, oppScore, true);
  const youMeter = h('div', { class: 'meter you' }, h('i'));
  const oppMeter = h('div', { class: 'meter opp' }, h('i'));
  const timerBar = h('i');
  const after = h('div', { class: 'qcard-after' });
  const buttons = order.map((orig, pos) => h('button', {
    class: 'choice', 'data-orig': String(orig), onclick: () => choose(orig),
    'aria-keyshortcuts': String(pos + 1),
  }, q.a[orig], h('span', { class: 'marks' })));

  app.replaceChildren(
    h('div', { class: 'board' }, youSide,
      h('div', { class: 'round-no' }, h('div', { class: 'label' }, 'Round'), h('div', { class: 'mono' }, `${i + 1}/${ROUNDS}`)),
      oppSide),
    h('div', { class: 'arena' }, youMeter,
      h('div', { class: 'qcard' },
        h('div', { class: 'timer' }, timerBar),
        i === ROUNDS - 1 ? h('span', { class: 'label final' }, 'Final round · double points') : null,
        h('div', { class: 'question' }, q.q),
        h('div', { class: 'choices' }, buttons),
        after),
      oppMeter));
  setMeter(youMeter, myScore);
  setMeter(oppMeter, oppScore);

  const start = performance.now();
  let mine = null;
  let resolved = false;

  const tick = () => {
    const left = Math.max(0, ROUND_MS - (performance.now() - start));
    timerBar.style.transform = `scaleX(${left / ROUND_MS})`;
    if (left <= 0 && !mine) choose(-1, ROUND_MS);
    else if (!resolved) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  // The opponent "answers" at the moment they really did.
  if (oppAnswer.c !== -1) later(() => { oppSide.querySelector('[data-answered]').textContent = 'answered'; }, oppAnswer.ms);

  document.onkeydown = (e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= 4 && !mine) choose(order[n - 1]);
  };

  function choose(orig, ms = Math.min(ROUND_MS, performance.now() - start)) {
    if (mine) return;
    mine = { c: orig, ms: Math.round(ms) };
    buttons.forEach((b) => { b.disabled = true; });
    youSide.querySelector('[data-answered]').textContent = orig === -1 ? 'out of time' : 'answered';
    if (orig !== -1) mark(orig, 'you', 'You');
    later(resolve, Math.max(0, oppAnswer.ms - (performance.now() - start)));
  }

  function mark(orig, cls, text) {
    const b = buttons.find((x) => x.dataset.orig === String(orig));
    b.querySelector('.marks').append(h('span', { class: `mark ${cls}` }, text));
  }

  function resolve() {
    if (resolved) return;
    resolved = true;
    cancelAnimationFrame(frame);
    document.onkeydown = null;
    match.mine.push(mine);
    for (const b of buttons) {
      if (b.dataset.orig === '0') b.classList.add('correct');
      else if (b.dataset.orig === String(mine.c)) b.classList.add('wrong');
    }
    if (oppAnswer.c !== -1) mark(oppAnswer.c, 'opp', match.opp.tag ? 'Bot' : 'Them');
    else oppSide.querySelector('[data-answered]').textContent = 'out of time';

    const gotMine = points(i, mine);
    const gotOpp = points(i, oppAnswer);
    youSide.querySelector('[data-score]').textContent = String(myScore + gotMine);
    oppSide.querySelector('[data-score]').textContent = String(oppScore + gotOpp);
    setMeter(youMeter, myScore + gotMine);
    setMeter(oppMeter, oppScore + gotOpp);

    const last = i === ROUNDS - 1;
    const next = () => { if (last) finish(); else { match.round += 1; startRound(); } };
    after.replaceChildren(
      h('p', { class: 'fact' }, h('span', { class: 'label' }, 'Fact'), q.x),
      h('div', { class: 'next-row' },
        h('span', { class: 'points' }, h('span', { class: 'you' }, `+${gotMine}`), ' · ', h('span', { class: 'opp' }, `+${gotOpp}`)),
        h('button', { class: 'btn btn-you', onclick: next }, last ? 'See result' : 'Next')));
    after.querySelector('.btn').focus({ preventScroll: true });
    document.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); } };
    later(next, 6000);
  }
}

function setMeter(meter, score) {
  meter.firstChild.style.height = `${Math.min(100, (score / maxScore()) * 100)}%`;
}

async function finish() {
  clearTimers();
  screen = 'result';
  if (match.opp.runId) {
    const played = store.get('pm-played', []);
    store.set('pm-played', [...played.slice(-200), match.opp.runId]);
  }
  if (db) {
    const id = newRunId();
    try {
      await db.collection('runs').doc(id).set({
        topic: match.topic, qs: match.qs, ans: match.mine, by: me.id, at: Date.now(),
        vs: match.opp.runId || `bot:${match.opp.botKey}`,
      });
      match.saved = id;
    } catch (e) {
      console.warn('Could not save game', e);
      match.saveError = true;
    }
  }
  renderResult();
}

function renderResult() {
  const you = personFor('you');
  const mineTotal = total(match.mine);
  const oppTotal = total(match.opp.answers);
  const verdict = mineTotal > oppTotal ? 'You win' : mineTotal < oppTotal ? 'You lost' : 'A draw';
  const rows = match.qs.map((id, i) => {
    const q = QBY.get(id);
    const a = points(i, match.mine[i]);
    const b = points(i, match.opp.answers[i]);
    return h('tr', {},
      h('td', { class: 'n' }, String(i + 1)),
      h('td', {}, q.q, h('div', { class: 'muted' }, q.a[0])),
      h('td', { class: `p you${a ? '' : ' miss'}` }, a ? `+${a}` : '0'),
      h('td', { class: `p opp${b ? '' : ' miss'}` }, b ? `+${b}` : '0'));
  });

  const link = match.saved && shareUrl ? `${shareUrl}#c-${match.saved}` : '';
  const note = match.saved
    ? 'Your game is saved. Other players in this topic can now be matched against it.'
    : match.saveError ? 'Your game couldn’t be saved, so other players won’t see it.' : '';

  app.replaceChildren(h('section', { class: 'result' },
    h('span', { class: 'label' }, TOPICS.get(match.topic).name),
    h('h1', {}, verdict),
    h('div', { class: 'final-score' },
      h('div', { class: 'player-card you' }, avatar(you), h('span', { class: 'num' }, String(mineTotal))),
      h('span', { class: 'muted' }, 'vs'),
      h('div', { class: 'player-card opp' }, avatar(match.opp), h('span', { class: 'num' }, String(oppTotal)))),
    h('table', { class: 'breakdown' }, h('tbody', {}, rows)),
    note ? h('p', { class: 'note' }, note) : null,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-you', onclick: () => startMatch(match.topic) }, 'Play again'),
      link ? h('button', { class: 'btn btn-line', onclick: () => copyChallenge(link, mineTotal) }, 'Challenge a friend') : null,
      h('button', { class: 'btn btn-line', onclick: () => renderHome() }, 'All topics'))));
  window.scrollTo({ top: 0 });
}

async function copyChallenge(link, score) {
  const text = `I scored ${score} in ${TOPICS.get(match.topic).name} on Polymath. Beat me: ${link}`;
  try {
    await navigator.clipboard.writeText(text);
    toast('Challenge link copied');
  } catch {
    toast('Couldn’t copy. Here’s the link to share.');
    const note = h('p', { class: 'note mono' }, link);
    app.querySelector('.result').append(note);
    getSelection().selectAllChildren(note);
  }
}

// ---------- start ----------
renderHome();

const [dbCap, userCap] = await Promise.all([capability('db'), capability('user')]);
user = userCap;
if (user) {
  try { me = await user.me(); } catch { /* stay anonymous */ }
}
db = dbCap;
if (db) {
  db.collection('runs').orderBy('at', 'desc').limit(300).onSnapshot(
    (snap) => {
      runs = snap.docs.map((d) => sanitizeRun(d.id, d.data(), QBY)).filter(Boolean);
      if (screen === 'home') renderHome();
    },
    (err) => console.warn('Recorded games unavailable', err));

  const challengeId = location.hash.match(/^#c-([A-Za-z0-9]+)$/)?.[1];
  if (challengeId) {
    try {
      const snap = await db.doc(`runs/${challengeId}`).get();
      challenge = snap.exists ? sanitizeRun(snap.id, snap.data(), QBY) : null;
    } catch { challenge = null; }
  }
}
if (screen === 'home') renderHome();
