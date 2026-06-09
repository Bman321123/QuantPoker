import { useState } from "react";
import { useStore } from "../store/useStore";
import { DecisionView, HandState } from "../game/types";
import { Level, Verdict, streetTip, Tone, explainLine } from "../engine/coach";
import { potOdds, pct } from "../engine/theory";
import { SolutionModal } from "./SolutionModal";
import { LineMath } from "../engine/coach";

const TONE_CLASS: Record<Tone, { ring: string; text: string; dot: string }> = {
  perfect: { ring: "border-emerald-glow/40 bg-emerald-glow/10", text: "text-emerald-200", dot: "bg-emerald-glow" },
  great: { ring: "border-emerald-glow/40 bg-emerald-glow/10", text: "text-emerald-200", dot: "bg-emerald-glow" },
  good: { ring: "border-cyan-glow/40 bg-cyan-glow/10", text: "text-cyan-200", dot: "bg-cyan-glow" },
  ok: { ring: "border-gold-glow/40 bg-gold-glow/10", text: "text-amber-200", dot: "bg-gold-glow" },
  mistake: { ring: "border-orange-400/40 bg-orange-400/10", text: "text-orange-200", dot: "bg-orange-400" },
  blunder: { ring: "border-rose-400/50 bg-rose-500/10", text: "text-rose-200", dot: "bg-rose-400" },
};

function Read({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex-1 rounded-lg bg-ink-800/60 border border-white/5 px-3 py-2">
      <div className="chip-num text-base font-bold" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-white/40">{label}</div>
    </div>
  );
}

function MiniEvBars({ math }: { math: LineMath }) {
  const evs = math.evTable.map((a) => a.ev);
  const max = Math.max(...evs);
  const min = Math.min(...evs, 0);
  const span = max - min || 1;
  return (
    <div className="space-y-1">
      {math.evTable.map((a, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className={`w-[4.5rem] shrink-0 truncate text-xs ${a.best ? "font-bold text-emerald-200" : "text-white/60"}`}>
            {a.label}
          </span>
          <div className="relative h-1.5 flex-1 rounded-full bg-white/5">
            <div
              className={`absolute top-0 h-full rounded-full ${a.best ? "bg-emerald-glow" : "bg-white/25"}`}
              style={{ left: `${((Math.min(0, a.ev) - min) / span) * 100}%`, width: `${(Math.abs(a.ev) / span) * 100}%` }}
            />
          </div>
          <span className={`chip-num w-11 text-right text-[11px] ${a.best ? "text-emerald-200" : "text-white/45"}`}>
            {a.ev >= 0 ? "+" : ""}
            {a.ev.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CoachPanel({
  decision,
  verdict,
  level,
  hand,
}: {
  decision: DecisionView | null;
  verdict: Verdict | null;
  level: Level;
  hand: HandState;
}) {
  const coach = useStore((s) => s.coach);
  const guard = useStore((s) => s.guard);
  const [solutionOpen, setSolutionOpen] = useState(false);
  const math = decision ? explainLine(decision.coachCtx) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-white/90">Coach</div>
        <span className="text-[10px] uppercase tracking-widest text-white/30">heuristic</span>
      </div>

      {decision && coach && (
        <>
          <div className="flex gap-2">
            <Read label="Your equity" value={pct(decision.equity, 0)} accent="#10B981" />
            {decision.coachCtx.toCall > 0 ? (
              <Read
                label="Need to call"
                value={pct(potOdds(decision.coachCtx.toCall, decision.coachCtx.pot), 0)}
                accent="#FF5C7A"
              />
            ) : (
              <Read label="Villain combos" value={`${decision.combos.total}`} accent="#22D3EE" />
            )}
          </div>

          <p className="text-sm leading-relaxed text-white/65">{streetTip(decision.coachCtx, level)}</p>

          {math && (
            <div className="rounded-xl border border-emerald-glow/25 bg-emerald-glow/[0.06] p-3.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Recommended</span>
                <span className="text-base font-bold text-white">{math.bestLabel}</span>
              </div>
              <MiniEvBars math={math} />
              <button
                onClick={() => setSolutionOpen(true)}
                className="btn mt-2.5 w-full bg-ink-900/40 border border-white/10 text-emerald-100/90 !py-2 text-xs"
              >
                Full solution &amp; equations →
              </button>
            </div>
          )}
        </>
      )}

      {decision && !coach && (
        <div className="rounded-xl border border-white/10 bg-ink-800/50 px-3.5 py-3 text-xs leading-relaxed text-white/50">
          Coach is off — you're playing by feel.{" "}
          {guard ? "Guard will step in before a clear mistake." : "Turn on Guard to be warned before mistakes."}
        </div>
      )}

      {verdict && (
        <div className={`rounded-xl border px-3.5 py-3 ${TONE_CLASS[verdict.tone].ring}`}>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${TONE_CLASS[verdict.tone].dot}`} />
            <span className={`text-sm font-bold ${TONE_CLASS[verdict.tone].text}`}>{verdict.headline}</span>
            {verdict.evLoss > 0.001 && (
              <span className="chip-num ml-auto text-xs text-white/50">−{verdict.evLoss.toFixed(2)}bb</span>
            )}
          </div>
          <ul className="mt-1.5 space-y-1">
            {verdict.detail.map((d, i) => (
              <li key={i} className="text-xs leading-relaxed text-white/60">
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hand.awaiting === "done" && hand.result && (
        <div className="rounded-xl border border-white/10 bg-ink-800/70 px-3.5 py-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-ink-900/60 px-2.5 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-white/35">You</div>
              <div className="text-xs font-semibold text-white/85">{hand.result.heroHandLabel}</div>
            </div>
            <div className="rounded-lg bg-ink-900/60 px-2.5 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-white/35">Villain</div>
              <div className="text-xs font-semibold text-white/85">{hand.result.villainHandLabel}</div>
            </div>
          </div>
          <p className="mt-2 text-xs text-white/50">{hand.result.reason}</p>
        </div>
      )}

      {solutionOpen && math && <SolutionModal math={math} onClose={() => setSolutionOpen(false)} />}
    </div>
  );
}
