// Maps a typed question to a concept in the question bank.
// Uses sentence embeddings when the model has loaded, and keyword overlap until then
// (or for good, if the model can't load).

import { normalize } from './game.js';

export const SEMANTIC = { accept: 0.8, suggest: 0.55 };
export const LEXICAL = { accept: 0.85, suggest: 0.45 };

const STOP = new Set(
  ('is it its it\'s a an the does do did could would will you your i me my be been are was were this that ' +
    'thing something there any some of out ever kind type sort really very just please one usually typically generally ' +
    'considered normally mostly often')
    .split(' ')
);

const SYNONYMS = {
  colour: 'color', colourful: 'colorful', coloured: 'colored', grey: 'gray', harbour: 'harbor', jewellery: 'jewelry',
  metallic: 'metal', wooden: 'wood', edible: 'eat', eaten: 'eat', huge: 'big', large: 'big', giant: 'big',
  tiny: 'small', little: 'small', human: 'person', people: 'person', someone: 'person',
  ocean: 'sea', seaside: 'sea', coast: 'sea', coastal: 'sea', shore: 'sea', usa: 'america', britain: 'uk',
  england: 'uk', automobile: 'car', ship: 'boat', vessel: 'boat', glow: 'light', shine: 'light', lit: 'light',
};

function stem(word) {
  const s = SYNONYMS[word] ?? strip(word);
  return SYNONYMS[s] ?? s;
}

function strip(word) {
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function tokens(text) {
  const words = normalize(text).replace(/-/g, ' ').split(' ');
  return [...new Set(words.filter((w) => w && !STOP.has(w)).map(stem))];
}

const NEGATION = /\b(not|never|isn't|doesn't|don't|didn't|can't|cannot|won't|wasn't|aren't|weren't|couldn't|wouldn't|no longer)\b/;
export const hasNegation = (text) => NEGATION.test(normalize(text));

// "Is it a castle?" -> "castle". Only phrases with an article, so "is it squishy" isn't a guess.
export function guessLikePhrase(text) {
  const m = normalize(text).match(/^(?:is|are) (?:it|this|that|they) (?:a|an|the|some) ([a-z][a-z' -]{1,40})$/);
  return m ? m[1].trim() : null;
}

function dice(a, b) {
  if (!a.length || !b.length) return 0;
  const set = new Set(b);
  const shared = a.filter((t) => set.has(t)).length;
  return (2 * shared) / (a.length + b.length);
}

export class Matcher {
  constructor(bank) {
    this.items = bank.flatMap((concept) =>
      concept.q.map((text) => ({ concept: { id: concept.id, canonical: concept.q[0] }, text, toks: tokens(text) }))
    );
    this.vectors = null; // Float32Array, items.length x dim, L2-normalised
    this.dim = 0;
  }

  get phrases() {
    return this.items.map((i) => i.text);
  }

  setVectors(vectors, dim) {
    if (vectors.length !== this.items.length * dim) throw new Error('Vector count does not match the bank');
    this.vectors = vectors;
    this.dim = dim;
  }

  get semanticReady() {
    return this.vectors !== null;
  }

  best(scoreOf) {
    let best = null;
    for (let i = 0; i < this.items.length; i++) {
      const score = scoreOf(i);
      if (!best || score > best.score) best = { item: this.items[i], score };
    }
    return best;
  }

  lexical(text) {
    const q = tokens(text);
    const best = this.best((i) => dice(q, this.items[i].toks));
    return { ...best, method: 'lexical', ...LEXICAL };
  }

  semantic(queryVector) {
    const { vectors, dim } = this;
    const best = this.best((i) => {
      let dot = 0;
      for (let d = 0, o = i * dim; d < dim; d++) dot += vectors[o + d] * queryVector[d];
      return dot;
    });
    return { ...best, method: 'semantic', ...SEMANTIC };
  }

  // Returns { kind: 'match' | 'suggest' | 'none', concept, phrase, score, method }.
  // An exact (normalised) bank phrase always matches, whichever method is active.
  classify(text, queryVector) {
    const exact = this.items.find((i) => normalize(i.text) === normalize(text));
    if (exact) return { kind: 'match', concept: exact.concept, phrase: exact.text, score: 1, method: 'exact' };
    const r = queryVector && this.semanticReady ? this.semantic(queryVector) : this.lexical(text);
    const kind = r.score >= r.accept ? 'match' : r.score >= r.suggest ? 'suggest' : 'none';
    return { kind, concept: r.item.concept, phrase: r.item.text, score: r.score, method: r.method };
  }
}
