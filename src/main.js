import {
  ANSWER_LABEL, LIE_WINDOW, MAX_QUESTIONS, ask, createGame, dayNumber, guess, guessTarget, lieCandidates,
  lieCaught, lieIndex, mentionsSecret, pickLie, questionsLeft, shareText,
} from './game.js';
import { Matcher, guessLikePhrase, hasNegation } from './matcher.js';

const $ = (sel) => document.querySelector(sel);
const els = {
  number: $('#puzzle-number'), log: $('#log'), empty: $('#empty'), form: $('#ask-form'), input: $('#question'),
  guessBtn: $('#guess-btn'), notice: $('#notice'), left: $('#left'), lieZone: $('#lie-zone'), status: $('#match-status'),
  end: $('#end'), help: $('#help'), stats: $('#stats'), toast: $('#toast'),
};

// ---------- storage (best effort: private windows can throw) ----------
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  },
};

// ---------- loading today's puzzle ----------
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function getJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

async function loadDay() {
  const wanted = new URLSearchParams(location.search).get('date') || localDate();
  const dates = (await getJSON('data/days/index.json')).sort();
  const date = dates.includes(wanted) ? wanted : dates.filter((d) => d <= wanted).pop() || dates[0];
  return { day: await getJSON(`data/days/${date}.json`), stale: date !== wanted };
}

const [{ day, stale }, bank] = await Promise.all([loadDay(), getJSON('data/bank.json')]);
const number = dayNumber(day.date);
const stateKey = `fib-state-v2:${day.date}`; // v2: the liar only lies on big questions
const state = store.get(stateKey, null) ?? createGame(day);
const matcher = new Matcher(bank);
const save = () => store.set(stateKey, state);

els.number.textContent = `#${number}`;
if (stale) showNotice(`No new puzzle today yet, so here's #${number}.`);

// ---------- smart matching (embeddings in a worker) ----------
const MODEL_KEY = 'all-MiniLM-L6-v2-q8';
let worker = null;
let nextId = 0;
const pending = new Map();

function embed(texts) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, texts });
  });
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

function toBase64(floats) {
  const bytes = new Uint8Array(floats.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

async function embedBank() {
  const phrases = matcher.phrases;
  const cacheKey = `fib-vectors:${MODEL_KEY}:${hashString(phrases.join('\n'))}`;
  const cached = store.get(cacheKey, null);
  if (cached) {
    matcher.setVectors(fromBase64(cached.data), cached.dim);
    return;
  }
  const chunks = [];
  let dim = 0;
  for (let i = 0; i < phrases.length; i += 64) {
    const out = await embed(phrases.slice(i, i + 64));
    chunks.push(out.data);
    dim = out.dim;
    setStatus('loading', `Smart matching: preparing ${Math.round(((i + 64) / phrases.length) * 100)}%`);
  }
  const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) { all.set(c, offset); offset += c.length; }
  matcher.setVectors(all, dim);
  store.set(cacheKey, { dim, data: toBase64(all) });
}

function setStatus(kind, text) {
  els.status.dataset.kind = kind;
  els.status.textContent = text;
}

function startSmartMatching() {
  try {
    worker = new Worker(new URL('./embed-worker.js', import.meta.url), { type: 'module' });
  } catch {
    setStatus('off', 'Basic matching');
    return;
  }
  setStatus('loading', 'Smart matching: loading…');
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      setStatus('loading', `Smart matching: downloading ${Math.min(99, Math.round((data.loaded / data.total) * 100))}%`);
    } else if (data.type === 'ready') {
      embedBank().then(
        () => setStatus('on', 'Smart matching on'),
        () => setStatus('off', 'Basic matching')
      );
    } else if (data.type === 'result' || data.type === 'error') {
      const p = pending.get(data.id);
      if (p) {
        pending.delete(data.id);
        data.type === 'result' ? p.resolve(data) : p.reject(new Error(data.message));
      } else if (data.type === 'error') {
        setStatus('off', 'Basic matching');
        console.warn('Smart matching unavailable:', data.message);
      }
    }
  };
  worker.onerror = () => setStatus('off', 'Basic matching');
}

async function classify(text) {
  if (matcher.semanticReady) {
    try {
      const out = await embed([text]);
      return matcher.classify(text, out.data);
    } catch { /* fall through to keywords */ }
  }
  return matcher.classify(text);
}

// ---------- rendering ----------
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}

function entryRow(entry, i, { reveal = false } = {}) {
  const isGuess = entry.kind === 'guess';
  const title = isGuess ? `Guess: ${entry.target || entry.asked}` : entry.canonical;
  const sameText = !isGuess && entry.asked.trim().toLowerCase().replace(/\?$/, '') === entry.canonical.toLowerCase().replace(/\?$/, '');
  const badge = isGuess
    ? el('span', { class: `ans ${entry.correct ? 'ans-win' : 'ans-wrong'}` }, entry.correct ? 'Correct!' : entry.close ? 'Close, but no' : 'No')
    : el('span', { class: `ans ans-${entry.answer}` }, ANSWER_LABEL[entry.answer]);
  return el('li', { class: `entry${reveal && entry.lie ? ' is-lie' : ''}${entry.bigIndex && entry.bigIndex <= LIE_WINDOW ? ' in-zone' : ''}` },
    el('span', { class: 'num' }, String(i + 1)),
    el('div', { class: 'q' }, entry.big ? el('span', { class: 'big', title: 'Big question: the liar can lie here' }, '⚡') : null,
      title, !isGuess && !sameText ? el('small', {}, `you asked “${entry.asked}”`) : null),
    badge,
    reveal && entry.lie ? el('span', { class: 'lie-tag' }, `🤥 really ${ANSWER_LABEL[entry.answer === 'y' ? 'n' : 'y']}`) : null);
}

function render() {
  const over = state.status !== 'playing';
  els.log.replaceChildren(...state.entries.map((e, i) => entryRow(e, i, { reveal: over && state.liePick !== undefined })));
  els.empty.hidden = state.entries.length > 0;
  els.left.textContent = `${questionsLeft(state)} of ${MAX_QUESTIONS} questions left`;
  els.lieZone.textContent =
    state.bigCount < LIE_WINDOW
      ? `⚡ Big answers: ${state.bigCount}/${LIE_WINDOW}. One of the first ${LIE_WINDOW} is a lie`
      : '✅ The liar has had its chance. Every answer from here on is true.';
  els.lieZone.classList.toggle('done', state.bigCount >= LIE_WINDOW);
  els.form.hidden = over;
  if (over) renderEnd();
  else els.end.hidden = true;
}

function renderEnd() {
  els.end.hidden = false;
  const won = state.status === 'won';
  const headline = won
    ? el('h2', {}, `🎯 It's ${day.display}!`)
    : el('h2', {}, `Out of questions. It was ${day.display}.`);
  const sub = el('p', { class: 'muted' }, won ? `Solved in ${state.entries.length} of ${MAX_QUESTIONS} questions.` : 'Better luck tomorrow.');

  if (state.liePick === undefined) {
    const choices = lieCandidates(state).map(({ entry, index }) =>
      el('button', { class: 'choice', onclick: () => accuse(index) },
        el('span', { class: 'num' }, String(index + 1)), el('span', {}, `⚡ ${entry.canonical}`),
        el('span', { class: `ans ans-${entry.answer}` }, ANSWER_LABEL[entry.answer])));
    els.end.replaceChildren(headline, sub,
      el('h3', {}, 'Which answer was the lie?'),
      el('div', { class: 'choices' }, choices,
        el('button', { class: 'choice none', onclick: () => accuse(null) }, 'None. I finished before the liar struck.')));
    return;
  }

  const caught = lieCaught(state);
  const li = lieIndex(state);
  const lieEntry = state.entries[li];
  const verdict = caught
    ? el('p', { class: 'verdict good' }, li === -1 ? '🕵️ Right: you finished before the liar struck.' : `🕵️ You caught it! Question ${li + 1} was the lie.`)
    : el('p', { class: 'verdict bad' }, li === -1
      ? '🤥 Fooled! The liar never struck. You finished before it got the chance.'
      : `🤥 Fooled! The lie was question ${li + 1}: “${lieEntry.canonical}” was really ${ANSWER_LABEL[lieEntry.answer === 'y' ? 'n' : 'y']}.`);
  const text = shareText(state, number, shareUrl());
  els.end.replaceChildren(headline, sub, verdict,
    el('pre', { class: 'share-preview' }, text),
    el('button', { class: 'primary', onclick: () => share(text) }, 'Share result'),
    el('p', { class: 'muted next' }, 'Next puzzle in ', el('span', { id: 'countdown' }, countdown())));
}

// <meta name="fib:share-url"> overrides the link in the share text (empty means no link).
function shareUrl() {
  const meta = document.querySelector('meta[name="fib:share-url"]');
  if (meta) return meta.content;
  return location.protocol.startsWith('http') ? location.origin + location.pathname : '';
}

function accuse(index) {
  if (pickLie(state, index)) {
    const s = store.get('fib-stats', null);
    if (s) store.set('fib-stats', { ...s, caught: (s.caught || 0) + 1 });
  }
  save();
  render();
  els.end.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function countdown() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const s = Math.max(0, Math.floor((next - now) / 1000));
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}
setInterval(() => { const c = document.getElementById('countdown'); if (c) c.textContent = countdown(); }, 30000);

// ---------- stats ----------
function recordStats() {
  if (state.recorded) return;
  state.recorded = true;
  const s = store.get('fib-stats', { played: 0, won: 0, streak: 0, maxStreak: 0, caught: 0, lastWin: null });
  s.played += 1;
  if (state.status === 'won') {
    const yesterday = new Date(Date.parse(`${day.date}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
    s.streak = s.lastWin === yesterday ? s.streak + 1 : 1;
    s.maxStreak = Math.max(s.maxStreak, s.streak);
    s.won += 1;
    s.lastWin = day.date;
  } else {
    s.streak = 0;
  }
  store.set('fib-stats', s);
}

function showStats() {
  const s = store.get('fib-stats', { played: 0, won: 0, streak: 0, maxStreak: 0, caught: 0 });
  const tile = (n, label) => el('div', { class: 'tile' }, el('strong', {}, String(n)), el('span', {}, label));
  $('#stats-body').replaceChildren(
    tile(s.played, 'Played'), tile(s.played ? `${Math.round((s.won / s.played) * 100)}%` : '–', 'Solved'),
    tile(s.streak, 'Streak'), tile(s.maxStreak, 'Best streak'), tile(s.caught, 'Lies caught'));
  els.stats.showModal();
}

// ---------- feedback ----------
function showNotice(text, actions = []) {
  const buttons = actions.filter(Boolean);
  els.notice.replaceChildren(el('p', {}, text), ...(buttons.length ? [el('div', { class: 'actions' }, buttons)] : []));
  els.notice.hidden = false;
}
const clearNotice = () => { els.notice.hidden = true; };

let toastTimer;
function toast(text) {
  els.toast.textContent = text;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 1800);
}

async function share(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    const preview = document.querySelector('.share-preview');
    if (preview) getSelection().selectAllChildren(preview);
    toast('Couldn’t copy automatically. The result is selected, so copy it yourself.');
  }
}

// ---------- actions ----------
function afterMove() {
  els.input.value = '';
  if (state.status !== 'playing') recordStats();
  save();
  render();
  const last = els.log.lastElementChild;
  if (last) last.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (state.status !== 'playing') els.end.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else els.input.focus();
}

function doAsk(concept, text) {
  clearNotice();
  const { repeat, entry } = ask(state, day, concept, text);
  if (repeat) {
    showNotice(`You already asked “${entry.canonical}”. The answer was ${ANSWER_LABEL[entry.answer]}. That one’s free.`);
    els.input.value = '';
    return;
  }
  afterMove();
}

function doGuess(text) {
  clearNotice();
  if (!guessTarget(text)) return;
  const entry = guess(state, day, text);
  if (!entry.correct) toast(entry.close ? 'Close, but no!' : `It's not ${entry.target}`);
  afterMove();
}

const rephrase = () => { clearNotice(); els.input.focus(); };

async function onAsk(text) {
  text = text.trim();
  if (!text || state.status !== 'playing') return;
  if (mentionsSecret(day, text)) return doGuess(text);
  if (hasNegation(text)) {
    return showNotice('Ask it without “not”. For example, “Is it alive?” instead of “Isn’t it alive?”');
  }
  const r = await classify(text);
  const nounGuess = guessLikePhrase(text);
  const guessButton = nounGuess && el('button', { class: 'secondary', onclick: () => doGuess(nounGuess) }, `Guess “${nounGuess}”`);
  if (r.kind === 'match') return doAsk(r.concept, text);
  if (r.kind === 'suggest') {
    return showNotice(`Did you mean: ${r.concept.big ? '⚡ ' : ''}${r.phrase}`, [
      el('button', { class: 'primary', onclick: () => doAsk(r.concept, text) }, 'Yes, ask that'),
      guessButton,
      el('button', { class: 'ghost', onclick: rephrase }, 'Rephrase'),
    ]);
  }
  if (nounGuess) {
    return showNotice(`I don’t have an answer for that question. Is “${nounGuess}” your guess?`, [
      guessButton, el('button', { class: 'ghost', onclick: rephrase }, 'Rephrase'),
    ]);
  }
  showNotice('I didn’t understand that one. Try a simple yes/no question, like “Is it bigger than a car?”');
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  onAsk(els.input.value);
});
els.guessBtn.addEventListener('click', () => {
  const text = els.input.value.trim();
  if (!text) {
    showNotice('Type your guess in the box first, then press Guess.');
    els.input.focus();
    return;
  }
  doGuess(text);
});
$('#help-btn').addEventListener('click', () => els.help.showModal());
$('#stats-btn').addEventListener('click', showStats);
for (const d of document.querySelectorAll('dialog')) {
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
}

render();
if (!store.get('fib-seen-help', false)) {
  els.help.showModal();
  store.set('fib-seen-help', true);
}
startSmartMatching();
