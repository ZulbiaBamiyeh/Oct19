# Fib

A daily game of 20 Questions where one of the answers is a lie.

Everyone gets the same secret each day. You ask yes/no questions in your own words, and one of the first 8 yes/no answers is a lie. Find the secret, then name the lie.

```
Fib #1 🎯 11/20 · 🕵️ caught the lie
🔴🔴🔴🟢🟢🔴🔴🟢🟢🟢🎯
```

## Running it

It's a static site with no build step and no backend.

```sh
npm run serve        # python3 -m http.server 8080, then open http://localhost:8080
open "http://localhost:8080/?date=2026-10-19"   # play a specific day
npm test             # game logic, data consistency and keyword matching
```

Any static host works (GitHub Pages, Netlify, Cloudflare Pages).

## How it works without an LLM at runtime

- **`data/bank.json`** is a shared bank of about 320 question *concepts*, each with a few phrasings ("Is it alive?", "Is it a living thing?", …).
- **`data/days/<date>.json`** holds one day's secret plus a precomputed answer for every concept: `y`, `n`, `s` (sort of) or `x` (doesn't apply). It also stores `lieAt`, meaning the Nth yes/no answer is flipped.
- **In the browser**, a small sentence-embedding model (`Xenova/all-MiniLM-L6-v2`, run by transformers.js in a Web Worker) matches whatever the player typed to the closest phrasing in the bank. Close-but-unsure matches get a "Did you mean…?" prompt. Unmatched questions ask the player to rephrase, so a bad match never silently gives a wrong answer.
- **Until the model loads**, or if it can't, a keyword matcher handles questions instead. The status line under the input shows which one is active.
- **Asking the same concept twice is free** and returns the same answer, lie included. Players catch the lie by asking *different* questions that check each other.
- **Negative questions** ("Isn't it alive?") are rejected with a request to rephrase, because embeddings can't tell them apart from the positive version.

The first visit downloads about 45 MB (the model plus the ONNX runtime), which the browser then caches. Bank embeddings are computed once and cached in `localStorage`.

## Making a new day

`scripts/new-day.mjs` asks Claude to answer every bank question for a new secret and writes the day file. It runs once per puzzle, ahead of time:

```sh
npm install
ANTHROPIC_API_KEY=... npm run new-day -- 2026-10-20 "a penguin" --aliases "penguin,penguins" --close "puffin"
npm test
```

Check the generated answers by hand before publishing, because they *are* the puzzle. Questions players ask that don't match anything are worth adding to the bank. When you add one, every existing day file needs an answer for it (`npm test` checks this).

## Files

| Path | What |
|---|---|
| `index.html`, `style.css` | The page |
| `src/game.js` | Game rules and state: asking, the lie, guessing, share text. No DOM, so it's tested in Node |
| `src/matcher.js` | Question matching: embeddings plus keyword fallback, thresholds, negation and guess detection |
| `src/embed-worker.js` | Loads the embedding model off the main thread |
| `src/main.js` | UI, persistence, stats |
| `scripts/new-day.mjs` | Generates a day file with Claude |
| `scripts/test.mjs` | Tests |

## Open items

- **The embedding thresholds are uncalibrated** (`SEMANTIC` in `src/matcher.js`: accept ≥ 0.80, suggest ≥ 0.55). Tune them by playing with smart matching on and watching for wrong matches.
- The bank was written around today's secret and needs broader coverage for people and animals.
