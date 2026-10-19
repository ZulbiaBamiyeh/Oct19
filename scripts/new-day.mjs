// Creates data/days/<date>.json by having Claude answer every question in the bank
// for a new secret. Run once per puzzle, ahead of time. Players never call the API.
//
//   ANTHROPIC_API_KEY=... node scripts/new-day.mjs 2026-10-20 "a penguin" \
//     --aliases "penguin,penguins" --close "puffin,emperor penguin"
//
// Review the generated answers by hand before publishing: they are the puzzle.

import Anthropic from '@anthropic-ai/sdk';
import { randomInt } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { aliases: { type: 'string' }, close: { type: 'string' }, 'lie-at': { type: 'string' } },
});
const [date, display] = positionals;
if (!/^\d{4}-\d\d-\d\d$/.test(date ?? '') || !display) {
  console.error('Usage: node scripts/new-day.mjs YYYY-MM-DD "a penguin" --aliases "penguin,penguins" [--close "puffin"] [--lie-at 1-3]');
  process.exit(1);
}

const root = new URL('../', import.meta.url);
const bank = JSON.parse(readFileSync(new URL('data/bank.json', root)));
const secret = display.replace(/^(a|an|the)\s+/i, '');
const list = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);

const SYSTEM = `You answer yes/no questions for a daily 20 Questions game. The secret is fixed; players ask questions about it.

For each question, answer about the typical, everyday example of the secret, the way most people would expect:
- "y": true for the typical example.
- "n": false for the typical example.
- "s" (sort of): partly true, true for some examples but not most, or depends on interpretation.
- "x" (doesn't apply): the question makes no sense for this kind of thing, like "Is it male?" about an object.

Be literal about what the secret is, not things near it ("Is it a building?" asks whether the secret itself is a building).
Prefer "y" or "n" when most people would agree; reserve "s" for genuinely mixed cases. Every player sees these answers, so they must be fair.`;

const SCHEMA = {
  type: 'object',
  properties: {
    answers: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, answer: { type: 'string', enum: ['y', 'n', 's', 'x'] } },
        required: ['id', 'answer'],
        additionalProperties: false,
      },
    },
  },
  required: ['answers'],
  additionalProperties: false,
};

const client = new Anthropic();

async function answerBatch(concepts) {
  const lines = concepts.map((c) => `${c.id}: ${c.q[0]}${c.q.length > 1 ? `  (also asked as: ${c.q.slice(1).join(' / ')})` : ''}`);
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: `The secret is: ${display}\n\nAnswer every question below by its id.\n\n${lines.join('\n')}` }],
  });
  if (response.stop_reason === 'refusal') throw new Error(`Refused: ${response.stop_details?.explanation ?? 'no details'}`);
  if (response.stop_reason === 'max_tokens') throw new Error('Response was cut off; use smaller batches');
  const text = response.content.find((b) => b.type === 'text')?.text;
  return JSON.parse(text).answers;
}

const answers = {};
const BATCH = 60;
for (let i = 0; i < bank.length; i += BATCH) {
  let todo = bank.slice(i, i + BATCH);
  for (let attempt = 1; todo.length && attempt <= 3; attempt++) {
    for (const { id, answer } of await answerBatch(todo)) {
      if (todo.some((c) => c.id === id)) answers[id] = answer;
    }
    todo = todo.filter((c) => !(c.id in answers));
  }
  if (todo.length) throw new Error(`No answer for: ${todo.map((c) => c.id).join(', ')}`);
  console.log(`Answered ${Math.min(i + BATCH, bank.length)}/${bank.length}`);
}

// The liar lies on the lieAt-th big yes/no answer (see LIE_WINDOW in src/game.js).
const lieAt = values['lie-at'] ? Number(values['lie-at']) : randomInt(1, 4);
if (!(lieAt >= 1 && lieAt <= 3)) throw new Error('--lie-at must be 1-3');

const day = {
  date,
  secret,
  display,
  aliases: [...new Set([secret, ...list(values.aliases)])],
  close: list(values.close),
  lieAt,
};
const body = JSON.stringify(day, null, 2).slice(0, -2) +
  ',\n  "answers": {\n' + bank.map((c) => `    "${c.id}": "${answers[c.id]}"`).join(',\n') + '\n  }\n}\n';
writeFileSync(new URL(`data/days/${date}.json`, root), body);

const indexUrl = new URL('data/days/index.json', root);
const index = new Set(JSON.parse(readFileSync(indexUrl)));
index.add(date);
writeFileSync(indexUrl, JSON.stringify([...index].sort()) + '\n');

const counts = Object.values(answers).reduce((acc, a) => ({ ...acc, [a]: (acc[a] || 0) + 1 }), {});
console.log(`Wrote data/days/${date}.json: ${JSON.stringify(counts)}, lie at big yes/no answer #${lieAt}`);
