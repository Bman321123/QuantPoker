import { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { DecisionView } from "../game/types";
import { explainLine } from "../engine/coach";
import { pct, potOdds } from "../engine/theory";

// Why the chosen action leaks vs the best, in one plain-English line.
function whyWorse(chosenKind: string, bestKind: string): string {
  if (chosenKind === "fold") return "you're folding a hand that has enough equity or fold-equity to keep going.";
  if (bestKind === "fold" && (chosenKind === "call" || chosenKind === "bet" || chosenKind === "raise"))
    return "you're investing chips without the equity or fold-equity to justify it.";
  if (chosenKind === "check") return "checking passes up value and fold-equity you should be taking.";
  if (chosenKind === "call" && (bestKind === "bet" || bestKind === "raise"))
    return "flat-calling is too passive — betting/raising wins more from folds and worse calls.";
  if ((chosenKind === "bet" || chosenKind === "raise") && (bestKind === "bet" || bestKind === "raise"))
    return "the sizing is off — a different bet size captures more EV here.";
  return "another line captures more big blinds over the long run.";
}

export function InterventionModal({
  decision,
  idx,
  onRethink,
  onProceed,
  onBest,
}: {
  decision: DecisionView;
  idx: number;
  onRethink: () => void;
  onProceed: () => void;
  onBest: () => void;
}) {
  const [revealed, setRevealed] = useState(false);

  const ev = decision.evResult;
  const chosen = ev.actions[idx];
  const best = ev.actions[ev.bestIndex];
  const loss = Math.max(0, best.ev - chosen.ev);
  const math = explainLine(decision.coachCtx);
  const ctx = decision.coachCtx;

  const questions = [
    `How much equity do you have against villain's range?`,
    ctx.toCall > 0
      ? `What price are you getting — what equity do you actually need to continue?`
      : `Can a bet fold out better hands or get called by worse ones?`,
    `Across many trials, which action keeps the most big blinds?`,
  ];

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/75 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-lg rounded-3xl border border-gold-glow/30 bg-gradient-to-b from-gold-glow/10 to-ink-800/90 p-6 shadow-panel"
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gold-glow/20 text-lg">⚠️</span>
          <h2 className="text-lg font-extrabold text-white">Hold on — that's likely a leak</h2>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-ink-900/60 px-4 py-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-white/40">You picked</div>
            <div className="text-sm font-bold text-rose-200">{chosen.label}</div>
            <div className="chip-num text-xs text-white/45">{chosen.ev >= 0 ? "+" : ""}{chosen.ev.toFixed(2)}bb</div>
          </div>
          <div className="text-white/30">→</div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-white/40">Max-EV line</div>
            <div className="text-sm font-bold text-emerald-200">{best.label}</div>
            <div className="chip-num text-xs text-white/45">{best.ev >= 0 ? "+" : ""}{best.ev.toFixed(2)}bb</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-white/40">Leak</div>
            <div className="chip-num text-sm font-bold text-amber-200">−{loss.toFixed(2)}bb</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold text-white/80">Before you lock it in, think it through:</div>
          <ul className="mt-2 space-y-1.5">
            {questions.map((q, i) => (
              <li key={i} className="flex gap-2 text-sm text-white/70">
                <span className="text-gold-glow">{i + 1}.</span>
                {q}
              </li>
            ))}
          </ul>
        </div>

        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            className="mt-3 text-xs font-semibold text-cyan-200/90 hover:text-cyan-100"
          >
            Show me why →
          </button>
        ) : (
          <div className="mt-3 rounded-xl border border-white/10 bg-ink-900/60 p-3.5">
            <p className="text-sm leading-relaxed text-white/80">{math.summary}</p>
            <p className="mt-2 text-xs leading-relaxed text-white/55">
              Your <b className="text-rose-200">{chosen.label}</b> leaks {loss.toFixed(2)}bb because {whyWorse(chosen.kind, best.kind)}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/50">
              <span>equity {pct(ctx.equity, 0)}</span>
              {ctx.toCall > 0 && <span>need {pct(potOdds(ctx.toCall, ctx.pot), 0)}</span>}
              {best.villainFold !== undefined && <span>fold equity {pct(best.villainFold, 0)}</span>}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={onBest}
            className="btn flex-1 bg-emerald-glow/20 border border-emerald-glow/40 text-emerald-100 font-bold"
          >
            Play {best.label}
          </button>
          <button onClick={onRethink} className="btn bg-white/5 border border-white/10 text-white/75">
            Let me rethink
          </button>
          <button onClick={onProceed} className="btn bg-white/5 border border-white/10 text-white/45">
            Play it anyway
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
