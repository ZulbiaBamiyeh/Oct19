// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  MAX_QUESTIONS, ask, createGame, dayNumber, guess, isSecret, lieCandidates, lieCaught, mentionsSecret, pickLie, shareText,
} from '../src/game.js';
import { Matcher, guessLikePhrase, hasNegation } from '../src/matcher.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
const bank = read('data/bank.json');
const days = read('data/days/index.json').map((d) => read(`data/days/${d}.json`));
const day = days.find((d) => d.date === '2026-10-19');
const matcher = new Matcher(bank);
const concept = (id) => {
  const c = bank.find((x) => x.id === id);
  return { id, canonical: c.q[0], big: !!c.big };
};

test('every day answers every bank question', () => {
  const files = readdirSync(new URL('../data/days/', import.meta.url)).filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f));
  assert.deepEqual(files.map((f) => f.slice(0, 10)).sort(), read('data/days/index.json').sort());
  const ids = new Set(bank.map((c) => c.id));
  assert.equal(ids.size, bank.length, 'duplicate concept ids');
  for (const d of days) {
    for (const id of ids) assert.match(d.answers[id] ?? '', /^[ynsx]$/, `${d.date} is missing ${id}`);
    for (const id of Object.keys(d.answers)) assert.ok(ids.has(id), `${d.date} answers unknown ${id}`);
    assert.ok(d.lieAt >= 1 && d.lieAt <= 3, `${d.date} lieAt out of range`);
  }
});

test('no phrasing appears in two concepts', () => {
  const seen = new Map();
  for (const c of bank) for (const q of c.q) {
    const k = q.toLowerCase();
    assert.ok(!seen.has(k), `"${q}" is in ${seen.get(k)} and ${c.id}`);
    seen.set(k, c.id);
  }
});

test('the liar flips the lieAt-th big yes/no answer and nothing else', () => {
  const s = createGame(day); // lieAt is 3
  const ids = ['alive', 'tall', 'place', 'man_made', 'castle', 'building', 'bigger_car'];
  const [alive, tall, place, manMade, castle, building, biggerCar] = ids.map((id) => ask(s, day, concept(id), id).entry);
  assert.deepEqual([alive.answer, alive.bigIndex], ['n', 1]);
  assert.equal(tall.answer, 'y'); // small questions are always true
  assert.equal(tall.bigIndex, undefined);
  assert.equal(place.answer, 's'); // big, but "sort of" answers don't count
  assert.equal(place.bigIndex, undefined);
  assert.deepEqual([manMade.answer, manMade.bigIndex], ['y', 2]);
  assert.equal(castle.answer, 'n');
  assert.deepEqual([building.answer, building.bigIndex, building.lie], ['n', 3, true]); // truth is y
  assert.deepEqual([biggerCar.answer, biggerCar.lie], ['y', false]);
  assert.equal(s.entries.filter((e) => e.lie).length, 1);
});

test('only small questions means the liar never strikes', () => {
  const s = createGame(day);
  for (const id of ['tall', 'castle', 'tower', 'gives_light', 'near_water', 'climb']) ask(s, day, concept(id), id);
  assert.ok(s.entries.every((e) => !e.lie && e.answer === day.answers[e.id]));
});

test('the bank tags a sensible set of big questions', () => {
  const big = bank.filter((c) => c.big).map((c) => c.id);
  assert.ok(big.length >= 30, `only ${big.length} big questions`);
  for (const id of ['alive', 'man_made', 'bigger_car', 'food', 'person']) assert.ok(big.includes(id), id);
});

test('asking the same concept again is free and repeats the lie', () => {
  const s = createGame(day);
  ask(s, day, concept('alive'), 'a');
  ask(s, day, concept('man_made'), 'b');
  ask(s, day, concept('building'), 'c'); // the lie
  const again = ask(s, day, concept('building'), 'is it a building?');
  assert.ok(again.repeat);
  assert.equal(again.entry.answer, 'n');
  assert.equal(s.entries.length, 3);
});

test('guessing', () => {
  for (const g of ['lighthouse', 'Is it a lighthouse?', "it's a light house", 'LIGHTHOUSES', 'a light-house'])
    assert.ok(isSecret(day, g), g);
  for (const g of ['light', 'house', 'tower', 'is it a lamp']) assert.ok(!isSecret(day, g), g);
  assert.ok(mentionsSecret(day, 'is it some kind of lighthouse?'));
  assert.ok(!mentionsSecret(day, 'is it a house?'));

  const s = createGame(day);
  assert.equal(guess(s, day, 'is it a beacon').close, true);
  assert.equal(s.status, 'playing');
  guess(s, day, 'Lighthouse');
  assert.equal(s.status, 'won');
  assert.throws(() => guess(s, day, 'x'));
});

test('running out of questions loses', () => {
  const s = createGame(day);
  for (let i = 0; i < MAX_QUESTIONS; i++) guess(s, day, `wrong ${i}`);
  assert.equal(s.status, 'lost');
});

test('naming the lie', () => {
  const s = createGame(day);
  for (const id of ['alive', 'man_made', 'building', 'tall']) ask(s, day, concept(id), id);
  guess(s, day, 'lighthouse');
  assert.equal(lieCandidates(s).length, 3); // tall is a small question
  assert.equal(pickLie(s, 1), false);
  assert.equal(pickLie(s, 2), true);

  const early = createGame(day);
  ask(early, day, concept('alive'), 'x');
  guess(early, day, 'lighthouse');
  assert.equal(pickLie(early, null), true); // won before the lie came up
});

test('share text', () => {
  const s = createGame(day);
  for (const id of ['alive', 'place', 'man_made', 'building']) ask(s, day, concept(id), id);
  guess(s, day, 'castle');
  guess(s, day, 'lighthouse');
  pickLie(s, 3);
  assert.equal(shareText(s, dayNumber(day.date), ''), 'Fib #1 🎯 6/20 · 🕵️ caught the lie\n🔴🟡🟢🔴❌🎯');
  assert.equal(lieCaught(s), true);
});

test('matcher helpers', () => {
  assert.ok(hasNegation("Isn't it alive?"));
  assert.ok(hasNegation('is it not a person'));
  assert.ok(!hasNegation('Is it a knotted rope?'));
  assert.equal(guessLikePhrase('Is it a castle?'), 'castle');
  assert.equal(guessLikePhrase('Is it squishy?'), null);
});

test('keyword fallback finds obvious rephrasings', () => {
  const cases = {
    'is it made out of metal': 'made_metal',
    'Is it made of metal??': 'made_metal',
    'can i eat it': 'food',
    'does it glow': 'gives_light',
    'is it bigger than a car': 'bigger_car',
    'is it used by sailors': 'sailors',
    'is it near the ocean': 'near_water',
    'is it alive': 'alive',
  };
  for (const [text, id] of Object.entries(cases)) {
    const r = matcher.classify(text);
    assert.equal(r.kind, 'match', `${text} -> ${r.kind} ${r.concept.id} ${r.score.toFixed(2)}`);
    assert.equal(r.concept.id, id, text);
  }
  assert.equal(matcher.classify('what is the meaning of life').kind, 'none');
});
