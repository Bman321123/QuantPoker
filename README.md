# Quant · Poker Trainer

Learn to play No-Limit Hold'em **perfectly, by the numbers.** You play randomized hands
against one villain on the button; every action is scored by how much expected value (EV) you
left behind versus the best line, and you get tested mid-hand on the real math — combos,
equity, pot odds, MDF — with a guided walk-through whenever you want it.

Clean, dark, vibrant. No backend. Your progress lives in `localStorage`.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production bundle into dist/
```

## What it does (v1)

- **Play** randomized NLHE hands, 100bb deep, you on the BTN vs a single BB villain, across
  all four streets, with discrete bet sizes (⅓ / ½ / ⅔ / pot / all-in).
- **Scores every decision by EV loss** — each legal action gets an EV in big blinds; the best
  is the highest-EV action, and you're graded on the gap (0 = optimal).
- **A live 13×13 range grid** that narrows on every villain action, with a pairs / suited /
  offsuit combo breakdown.
- **Mid-hand quizzes** that are weak-topic-weighted: numeric entry, but every question
  decomposes into a Socratic ladder of simpler steps, with a "just answer" shortcut.
- **A deterministic coach** that explains each decision with the engine's own numbers
  (equity, pot odds, fold equity, the recommended line). Works offline, instantly.
- **Beginner ↔ Pro** coaching depth from one UI.
- **A progress dashboard**: accuracy by street, EV-loss trend, net bb, and a per-concept
  mastery "skill tree" driven by your quiz history.

## How "correct" is defined — read this

The source of truth is a **fast, transparent heuristic engine, not a $1,000 solver**, and the
app says so. Specifically:

- **Exact** where it can be: the 7-card hand evaluator, all combinatorics (combo counts,
  blockers), pot odds, MDF, and alpha. Equity is Monte-Carlo (exact by enumeration on the
  river).
- **A labeled 1-ply model** for the EV of bets/raises: fold equity + an MDF-based continuing
  range, then equity realized at showdown. It's directionally sound and internally consistent
  (the villain genuinely plays the range you're shown, so the combo counts never lie), but it
  is not a full game-tree solve.

## Ranges are data, not hardcoded charts

Every range is authored in standard poker notation (`22+`, `A2s+`, `KTo+`, `T9s`) — see
[`src/engine/ranges.ts`](src/engine/ranges.ts). The defaults are reasonable modern GTO-style
ranges. They're meant to be edited: if you own a chart source (e.g. *Modern Poker Theory*), you
transcribe its exact ranges once and the app treats them as ground truth. The trainer does not
ship a copy of any copyrighted chart.

## Architecture

```
src/engine/      pure poker math — no React
  cards.ts         card encoding, deck, RNG
  evaluator.ts     exact 7-card hand evaluator
  combos.ts        169 classes, combo expansion, blockers, counts
  equity.ts        Monte-Carlo / exact equity, combo strength
  ranges.ts        notation parser + default GTO ranges (editable)
  narrow.ts        MDF range narrowing by strength
  villain.ts       villain policy (consistent with the displayed range)
  theory.ts        pot odds, MDF, alpha, rule of 2 & 4
  ev.ts            1-ply EV per action, best line, EV loss
  coach.ts         deterministic explanations + verdicts
src/quiz/         topics, Socratic question generators, spaced repetition
src/game/         hand state machine (engine.ts) + types
src/store/        zustand store with localStorage persistence
src/components/   table, cards, action bar, range grid, coach, quiz, dashboard
```

## Roadmap (deferred from v1, architected for)

- Scale from 1 villain to a full 9-handed table (seat model already generalized).
- Drill mode: focused reps on a spot type (3-bet pots, turn barrels, river bluff-catches).
- Optional LLM chat coach (free-tier API) layered on the deterministic coach.
- In-app range editor / chart import.
