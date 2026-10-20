import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ROUNDS, botAnswers, BOTS, chooseOpponent, leaderboard, maxScore, newRunId, pickQuestions, points, sanitizeRun, total,
} from './duel.js';

const data = JSON.parse(readFileSync(new URL('./questions.json', import.meta.url)));
const QBY = new Map(data.questions.map((q) => [q.id, q]));
const topicIds = data.topics.map((t) => t.id);
const ok = (topic, ans, extra = {}) => ({
  topic, qs: data.questions.filter((q) => q.t === topic).slice(0, ROUNDS).map((q) => q.id), ans, by: 'u1', at: 1, ...extra,
});
const allRight = (ms) => Array.from({ length: ROUNDS }, () => ({ c: 0, ms }));

test('question packs are well formed', () => {
  assert.equal(new Set(data.questions.map((q) => q.id)).size, data.questions.length, 'duplicate ids');
  for (const q of data.questions) {
    assert.ok(topicIds.includes(q.t), `${q.id} has unknown topic`);
    assert.equal(q.a.length, 4, `${q.id} needs 4 options`);
    assert.equal(new Set(q.a.map((a) => a.toLowerCase())).size, 4, `${q.id} has duplicate options`);
    assert.ok(q.q && q.x, `${q.id} needs a question and a fact`);
  }
  for (const t of topicIds) assert.ok(data.questions.filter((q) => q.t === t).length >= 25, `${t} is too small`);
});

test('scoring rewards speed and doubles the last round', () => {
  assert.equal(points(0, { c: 0, ms: 0 }), 20);
  assert.equal(points(0, { c: 0, ms: 5000 }), 10);
  assert.equal(points(0, { c: 0, ms: 9999 }), 2);
  assert.equal(points(0, { c: 2, ms: 100 }), 0);
  assert.equal(points(0, { c: -1, ms: 10000 }), 0);
  assert.equal(points(ROUNDS - 1, { c: 0, ms: 0 }), 40);
  assert.equal(total(allRight(0)), maxScore());
});

test('recorded games are validated and rescored', () => {
  const good = sanitizeRun('r1', ok('body', allRight(1000), { score: 9999 }), QBY);
  assert.equal(good.score, total(allRight(1000)));
  assert.equal(sanitizeRun('r', ok('nope', allRight(1)), QBY), null);
  assert.equal(sanitizeRun('r', ok('body', allRight(1).slice(1)), QBY), null);
  assert.equal(sanitizeRun('r', ok('body', allRight(20000)), QBY), null);
  assert.equal(sanitizeRun('r', ok('body', allRight(1), { qs: Array(ROUNDS).fill('b01') }), QBY), null);
  assert.equal(sanitizeRun('r', ok('body', [...allRight(1).slice(1), { c: 7, ms: 1 }]), QBY), null);
  assert.equal(sanitizeRun('r', { ...ok('body', allRight(1)), qs: ok('life', []).qs }, QBY), null);
});

test('opponents: fresh real games first, then a bot', () => {
  const runs = [
    sanitizeRun('mine', ok('body', allRight(1), { by: 'me', at: 5 }), QBY),
    sanitizeRun('old', ok('body', allRight(1), { by: 'u2', at: 1 }), QBY),
    sanitizeRun('other-topic', ok('life', allRight(1), { by: 'u3', at: 9 }), QBY),
  ];
  const a = chooseOpponent(runs, 'body', 'me', new Set(), () => 0);
  assert.equal(a.kind, 'ghost');
  assert.equal(a.run.id, 'old');
  const b = chooseOpponent(runs, 'body', 'me', new Set(['old']), () => 0);
  assert.equal(b.kind, 'bot');
});

test('bots and question picks', () => {
  const answers = botAnswers(BOTS[2], () => 0);
  assert.equal(answers.length, ROUNDS);
  assert.ok(answers.every((a) => a.c === 0 && a.ms === BOTS[2].fastest));
  const qs = pickQuestions(data.questions, 'earth');
  assert.equal(new Set(qs).size, ROUNDS);
  assert.ok(qs.every((id) => QBY.get(id).t === 'earth'));
});

test('leaderboard keeps each player’s best', () => {
  const runs = [
    sanitizeRun('a', ok('body', allRight(5000), { by: 'u1' }), QBY),
    sanitizeRun('b', ok('body', allRight(0), { by: 'u1' }), QBY),
    sanitizeRun('c', ok('body', allRight(2000), { by: 'u2' }), QBY),
  ];
  assert.deepEqual(leaderboard(runs, 'body').map((r) => r.id), ['b', 'c']);
});

test('run ids are path-safe', () => {
  assert.match(newRunId(), /^r[a-z0-9]+$/);
});
