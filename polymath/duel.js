// Duel rules and recorded-game handling. No DOM, so it can be tested in Node.

export const ROUNDS = 7;
export const ROUND_MS = 10000;

// A correct answer is worth 20 points at once, falling to 2 near the buzzer.
// The final round counts double, so a game is never settled early.
export function points(round, answer) {
  if (!answer || answer.c !== 0) return 0;
  const base = Math.max(2, Math.round(20 - answer.ms / 500));
  return round === ROUNDS - 1 ? base * 2 : base;
}

export const total = (answers) => answers.reduce((sum, a, i) => sum + points(i, a), 0);
export const maxScore = () => 20 * (ROUNDS + 1);

// Recorded games come from a shared store anyone can write to, so check
// every field and recompute the score instead of trusting it.
export function sanitizeRun(id, d, questionsById) {
  if (!d || typeof d !== 'object') return null;
  const { topic, qs, ans, by, at, vs } = d;
  if (typeof topic !== 'string' || !Array.isArray(qs) || !Array.isArray(ans)) return null;
  if (qs.length !== ROUNDS || ans.length !== ROUNDS) return null;
  if (!qs.every((q) => questionsById.get(q)?.t === topic) || new Set(qs).size !== ROUNDS) return null;
  const clean = [];
  for (const a of ans) {
    if (!a || !Number.isInteger(a.c) || a.c < -1 || a.c > 3) return null;
    if (typeof a.ms !== 'number' || !(a.ms >= 0 && a.ms <= ROUND_MS)) return null;
    clean.push({ c: a.c, ms: Math.round(a.ms) });
  }
  return {
    id,
    topic,
    qs: [...qs],
    ans: clean,
    by: typeof by === 'string' ? by : null,
    at: typeof at === 'number' ? at : 0,
    vs: typeof vs === 'string' ? vs : null,
    score: total(clean),
  };
}

export const BOTS = [
  { key: 'labrat', name: 'Lab Rat', accuracy: 0.55, fastest: 3500, slowest: 8500 },
  { key: 'grad', name: 'Grad Student', accuracy: 0.72, fastest: 2500, slowest: 7000 },
  { key: 'prof', name: 'The Professor', accuracy: 0.88, fastest: 1500, slowest: 5000 },
];

export function botAnswers(bot, rand = Math.random) {
  return Array.from({ length: ROUNDS }, () => {
    const right = rand() < bot.accuracy;
    return {
      c: right ? 0 : 1 + Math.floor(rand() * 3),
      ms: Math.round(bot.fastest + rand() * (bot.slowest - bot.fastest)),
    };
  });
}

export function pickQuestions(questions, topic, rand = Math.random) {
  const pool = questions.filter((q) => q.t === topic).map((q) => q.id);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, ROUNDS);
}

// Prefer a recent real game in this topic that isn't yours and you haven't
// played against yet; fall back to a bot.
export function chooseOpponent(runs, topic, myId, played, rand = Math.random) {
  const fresh = runs
    .filter((r) => r.topic === topic && (!myId || r.by !== myId) && !played.has(r.id))
    .sort((a, b) => b.at - a.at)
    .slice(0, 8);
  if (fresh.length) return { kind: 'ghost', run: fresh[Math.floor(rand() * fresh.length)] };
  return { kind: 'bot', bot: BOTS[Math.floor(rand() * BOTS.length)] };
}

// Best score per player in a topic, highest first.
export function leaderboard(runs, topic, limit = 3) {
  const best = new Map();
  for (const r of runs) {
    if (r.topic !== topic || !r.by) continue;
    if (!best.has(r.by) || best.get(r.by).score < r.score) best.set(r.by, r);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.at - b.at).slice(0, limit);
}

export function newRunId(now = Date.now(), rand = Math.random) {
  return `r${now.toString(36)}${Math.floor(rand() * 36 ** 6).toString(36).padStart(6, '0')}`;
}

export function shuffledOrder(rand = Math.random) {
  const order = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
