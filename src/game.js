// Pure game state for Fib. No DOM access here, so it can be tested in Node.

export const MAX_QUESTIONS = 20;
export const LIE_WINDOW = 8; // the lie is one of the first N yes/no answers

export const ANSWER_LABEL = { y: 'Yes', n: 'No', s: 'Sort of', x: "Doesn't apply" };
const ANSWER_EMOJI = { y: '🟢', n: '🔴', s: '🟡', x: '⚪' };
const FLIP = { y: 'n', n: 'y' };

export function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9' -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Strips "is it a", "it's the", trailing "?" etc. so "Is it a lighthouse?" -> "lighthouse".
export function guessTarget(text) {
  return normalize(text)
    .replace(/^(is it|is this|is that|it is|it's|its|my guess is|i guess|guess)\s+/, '')
    .replace(/^(a|an|the|some)\s+/, '')
    .trim();
}

function singular(word) {
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

export function isSecret(day, text) {
  const target = guessTarget(text);
  if (!target) return false;
  return day.aliases.some((a) => {
    const alias = normalize(a).replace(/^(a|an|the)\s+/, '');
    return target === alias || singular(target) === alias || target.replace(/[ -]/g, '') === alias.replace(/[ -]/g, '');
  });
}

// True when a question names the secret, e.g. "is it some kind of lighthouse?"
export function mentionsSecret(day, text) {
  const t = ` ${normalize(text).replace(/-/g, ' ')} `;
  return day.aliases.some((a) => t.includes(` ${normalize(a).replace(/-/g, ' ').replace(/^(a|an|the)\s+/, '')} `));
}

export function isClose(day, text) {
  const target = guessTarget(text);
  return (day.close || []).some((c) => normalize(c) === target || normalize(c) === singular(target));
}

export function createGame(day) {
  return { date: day.date, entries: [], ynCount: 0, status: 'playing', liePick: undefined };
}

export const questionsUsed = (state) => state.entries.length;
export const questionsLeft = (state) => MAX_QUESTIONS - state.entries.length;

function finishIfOut(state) {
  if (state.status === 'playing' && questionsUsed(state) >= MAX_QUESTIONS) state.status = 'lost';
}

// concept: { id, canonical } from the matcher. Asking the same concept twice
// returns the earlier entry (lie included) and costs nothing.
export function ask(state, day, concept, askedText) {
  if (state.status !== 'playing') throw new Error('Game is over');
  const previous = state.entries.find((e) => e.kind === 'answer' && e.id === concept.id);
  if (previous) return { repeat: true, entry: previous };

  const truth = day.answers[concept.id] ?? 'x';
  const entry = { kind: 'answer', id: concept.id, canonical: concept.canonical, asked: askedText, answer: truth, lie: false };
  if (truth === 'y' || truth === 'n') {
    state.ynCount += 1;
    entry.ynIndex = state.ynCount;
    if (state.ynCount === day.lieAt) {
      entry.answer = FLIP[truth];
      entry.lie = true;
    }
  }
  state.entries.push(entry);
  finishIfOut(state);
  return { repeat: false, entry };
}

export function guess(state, day, text) {
  if (state.status !== 'playing') throw new Error('Game is over');
  const correct = isSecret(day, text);
  const entry = { kind: 'guess', asked: text.trim(), target: guessTarget(text), correct, close: !correct && isClose(day, text) };
  state.entries.push(entry);
  if (correct) state.status = 'won';
  else finishIfOut(state);
  return entry;
}

// Answers the player can accuse of being the lie.
export function lieCandidates(state) {
  return state.entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.kind === 'answer' && entry.ynIndex && entry.ynIndex <= LIE_WINDOW);
}

export const lieIndex = (state) => state.entries.findIndex((e) => e.lie);

// index is an entry index, or null for "the lie never came up".
export function pickLie(state, index) {
  state.liePick = index;
  return lieCaught(state);
}

export function lieCaught(state) {
  if (state.liePick === undefined) return undefined;
  const actual = lieIndex(state);
  return actual === -1 ? state.liePick === null : state.liePick === actual;
}

export function entryEmoji(entry) {
  if (entry.kind === 'guess') return entry.correct ? '🎯' : '❌';
  return ANSWER_EMOJI[entry.answer];
}

export function shareText(state, number, url) {
  const head =
    state.status === 'won' ? `Fib #${number} 🎯 ${questionsUsed(state)}/${MAX_QUESTIONS}` : `Fib #${number} ❌ X/${MAX_QUESTIONS}`;
  const caught = lieCaught(state);
  const lie = caught === undefined ? '' : caught ? ' · 🕵️ caught the lie' : ' · 🤥 fooled by the lie';
  const grid = state.entries.map(entryEmoji).join('');
  return [head + lie, grid, url].filter(Boolean).join('\n');
}

// Day number shown in the share text. Day 1 is launch day.
export const LAUNCH_DATE = '2026-10-19';
export function dayNumber(date) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${LAUNCH_DATE}T00:00:00Z`)) / 86400000) + 1;
}
