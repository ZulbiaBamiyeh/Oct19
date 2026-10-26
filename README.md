# Fib

A daily game of 20 Questions where one of the answers is a lie.

Everyone gets the same secret each day. You ask yes/no questions in your own words. The liar lies exactly once, on one of your first 3 **big questions**: the broad ones like "Is it alive?" or "Is it bigger than a car?", marked ⚡. Small, specific questions are always true. Big questions are efficient but risky; small ones are safe but slow. Find the secret, then name the lie.

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

- **`data/bank.json`** is a shared bank of about 320 question *concepts*, each with a few phrasings ("Is it alive?", "Is it a living thing?", …). About 50 broad ones are tagged `"big": true`; those are the only ones the liar can lie on.
- **`data/days/<date>.json`** holds one day's secret plus a precomputed answer for every concept: `y`, `n`, `s` (sort of) or `x` (doesn't apply). It also stores `lieAt` (1-3): the liar flips the player's lieAt-th big yes/no answer. "Sort of" answers are never lies.
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

---

# Polymath

`polymath/` is a second game: head-to-head trivia in the style of the old QuizUp, limited to science, medicine, biology, animals and ancient history.

- **7 rounds, 10 seconds each.** A right answer scores up to 20 points, less the slower you are. The last round counts double.
- **You race recorded games.** Every finished game is saved with its answers and timings, and the next player in that topic is matched against it at the same speed. If nobody has played a topic yet, you face a bot, which is always labelled as one.
- **Challenge links** let a friend play against your exact game.
- **Questions** live in `polymath/questions.json`: 154 questions across 5 topics, each with a one-line fact shown after the answer.
- **Storage** uses the claude.ai artifact database when it runs as an artifact. Opened as a plain web page, it plays bots only.

Run it with `npm run serve` and open http://localhost:8080/polymath/. `polymath/duel.js` holds the rules and is tested by `npm test`.

---

# Eyes On Your Own Paper

`exam/` is a 3D stealth game built with three.js. You haven't revised, the exam (Advanced Nonsense, Higher Tier) makes no sense, and the only way to pass is to cheat without Mrs Grimsby noticing.

- **Ways to cheat:** lean and squint at Priya's paper (always right, writes faintly, flips her paper over if you stare too long), Marcus's (half right, sometimes covers it with his arm) or Dave's (huge confident letters, but he's on Paper B). Your phone has texts from Jess, but it buzzes unless you've checked it. Your water bottle label has notes on the back. Her mug gives away her middle name. Paper balls send her off to investigate.
- **Getting caught:** a suspicion meter fills when she can see you doing something suspicious, and drains while you look at your own paper. Three warnings and you're out.
- **Endings:** 8 report-card endings, remembered in the browser.

Run it with `npm run serve` and open http://localhost:8080/exam/. Everything is in `exam/game.js`; sound and voices are synthesised, so there are no asset files.
