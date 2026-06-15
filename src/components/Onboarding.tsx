import { motion } from "framer-motion";

export function Onboarding({ onStart }: { onStart: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/80 backdrop-blur-sm p-5">
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="glass w-full max-w-lg rounded-3xl p-7"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-glow to-cyan-glow text-2xl font-black text-ink-900">
            ♠
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white">Quant Poker Trainer</h1>
            <p className="text-xs text-white/50">Learn to play perfectly — by the numbers.</p>
          </div>
        </div>

        <ul className="mt-5 space-y-3 text-sm text-white/75">
          <li className="flex gap-3">
            <Dot c="#10B981" />
            <span>
              Play heads-up No-Limit Hold'em vs a villain that plays the numbers — seats (button / big blind)
              randomized every hand.
            </span>
          </li>
          <li className="flex gap-3">
            <Dot c="#22D3EE" />
            <span>
              Every action is scored by <b className="text-white">EV loss</b> — how many big blinds you left
              behind vs the best line.
            </span>
          </li>
          <li className="flex gap-3">
            <Dot c="#8B5CF6" />
            <span>
              Drill the real math in the <b className="text-white">Train tab</b> — combos, equity, pot odds, MDF —
              on real dealt scenarios, with a guided walk-through whenever you want it.
            </span>
          </li>
          <li className="flex gap-3">
            <Dot c="#F5C451" />
            <span>Watch villain's range narrow live, and track your concept mastery over time.</span>
          </li>
        </ul>

        <p className="mt-5 rounded-xl border border-white/10 bg-ink-800/60 px-3 py-2 text-xs text-white/45">
          Heads up: the "correct" answer is a fast, transparent heuristic (real equity + combinatorics + a 1-ply
          EV model) — a sharp coach, not a $1,000 solver.
        </p>

        <button
          onClick={onStart}
          className="btn mt-6 w-full bg-gradient-to-r from-emerald-glow to-cyan-glow text-ink-900 text-base font-bold"
        >
          Deal me in
        </button>
      </motion.div>
    </div>
  );
}

function Dot({ c }: { c: string }) {
  return <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: c }} />;
}
