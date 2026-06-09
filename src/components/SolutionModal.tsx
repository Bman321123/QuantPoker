import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { LineMath } from "../engine/coach";

function EvBars({ math }: { math: LineMath }) {
  const evs = math.evTable.map((a) => a.ev);
  const max = Math.max(...evs);
  const min = Math.min(...evs, 0);
  const span = max - min || 1;
  return (
    <div className="space-y-1.5">
      {math.evTable.map((a, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className={`w-24 shrink-0 text-sm ${a.best ? "font-bold text-emerald-200" : "text-white/70"}`}>
            {a.label}
          </span>
          <div className="relative h-2.5 flex-1 rounded-full bg-white/5">
            <div
              className={`absolute top-0 h-full rounded-full ${a.best ? "bg-emerald-glow" : "bg-white/25"}`}
              style={{
                left: `${((Math.min(0, a.ev) - min) / span) * 100}%`,
                width: `${(Math.abs(a.ev) / span) * 100}%`,
              }}
            />
          </div>
          <span className={`chip-num w-14 text-right text-sm ${a.best ? "text-emerald-200" : "text-white/55"}`}>
            {a.ev >= 0 ? "+" : ""}
            {a.ev.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SolutionModal({ math, onClose }: { math: LineMath; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/70 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="glass w-full max-w-3xl rounded-3xl p-6 sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">The solution</div>
            <h2 className="mt-0.5 text-2xl font-extrabold text-white">
              Why {math.bestLabel}?
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-white/65">{math.summary}</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-ink-800 text-white/60 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* the worked math */}
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/40">The math</div>
            <div className="space-y-2.5">
              {math.steps.map((s, i) => (
                <div key={i} className="rounded-lg bg-ink-800/50 px-3.5 py-2.5">
                  <div className="text-[11px] uppercase tracking-wide text-white/40">{s.label}</div>
                  <div className="chip-num mt-0.5 text-sm text-white/90">{s.expr}</div>
                </div>
              ))}
            </div>
          </div>

          {/* EV comparison + shortcuts */}
          <div className="flex flex-col gap-6">
            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/40">
                EV by action (bb)
              </div>
              <EvBars math={math} />
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">
                Shortcuts to compute these
              </div>
              <ul className="space-y-1.5">
                {math.shortcuts.map((s, i) => (
                  <li key={i} className="text-xs leading-relaxed text-white/60">
                    • {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
