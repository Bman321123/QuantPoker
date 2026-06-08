import { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import { DecisionView, HandState } from "../game/types";
import { Level, Verdict, streetTip, Tone, explainLine, LineMath } from "../engine/coach";
import { potOdds, pct } from "../engine/theory";

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

function MathBlock({ math }: { math: LineMath }) {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const evs = math.evTable.map((a) => a.ev);
  const max = Math.max(...evs);
  const min = Math.min(...evs, 0);
  const span = max - min || 1;

  return (
    <div className="rounded-xl border border-emerald-glow/25 bg-emerald-glow/[0.06] p-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
          Recommended
        </span>
        <span className="text-sm font-bold text-white">{math.bestLabel}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-white/65">{math.summary}</p>

      {/* equations */}
      <div className="mt-2.5 space-y-1">
        {math.steps.map((s, i) => (
          <div key={i} className="flex items-baseline gap-2 text-xs">
            <span className="w-24 shrink-0 text-white/45">{s.label}</span>
            <span className="chip-num text-white/85">{s.expr}</span>
          </div>
        ))}
      </div>

      {/* EV across the legal actions */}
      <div className="mt-3 space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-white/35">EV by action (bb)</div>
        {math.evTable.map((a, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`w-20 shrink-0 text-xs ${a.best ? "font-bold text-emerald-200" : "text-white/60"}`}>
              {a.label}
            </span>
            <div className="relative h-2 flex-1 rounded-full bg-white/5">
              <div
                className={`absolute top-0 h-full rounded-full ${a.best ? "bg-emerald-glow" : "bg-white/25"}`}
                style={{ left: `${((Math.min(0, a.ev) - min) / span) * 100}%`, width: `${(Math.abs(a.ev) / span) * 100}%` }}
              />
            </div>
            <span className={`chip-num w-12 text-right text-xs ${a.best ? "text-emerald-200" : "text-white/50"}`}>
              {a.ev >= 0 ? "+" : ""}
              {a.ev.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={() => setShowShortcuts((v) => !v)}
        className="mt-2 text-[11px] font-semibold text-cyan-200/80 hover:text-cyan-100"
      >
        {showShortcuts ? "Hide shortcuts" : "Equity & sizing shortcuts"}
      </button>
      {showShortcuts && (
        <ul className="mt-1.5 space-y-1">
          {math.shortcuts.map((s, i) => (
            <li key={i} className="text-[11px] leading-relaxed text-white/55">
              • {s}
            </li>
          ))}
        </ul>
      )}
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
  const showLine = useStore((s) => s.showLine);
  const [revealed, setRevealed] = useState(false);

  // reset the on-demand reveal whenever a new decision comes up
  useEffect(() => {
    setRevealed(false);
  }, [hand.street, hand.board.length, hand.toCall, hand.awaiting]);

  const lineShown = showLine || revealed;
  const math = decision ? explainLine(decision.coachCtx) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-white/90">Coach</div>
        <span className="text-[10px] uppercase tracking-widest text-white/30">heuristic</span>
      </div>

      {decision && (
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

          <p className="text-sm leading-relaxed text-white/70">{streetTip(decision.coachCtx, level)}</p>

          {!lineShown && (
            <button
              onClick={() => setRevealed(true)}
              className="self-start text-xs font-semibold text-violet-200/80 hover:text-violet-100 transition"
            >
              Stuck? Show the line + math
            </button>
          )}
          {lineShown && math && <MathBlock math={math} />}
        </>
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

      {hand.awaiting === "done" && hand.result && <ResultBlock result={hand.result} hand={hand} />}
    </div>
  );
}

function ResultBlock({ result, hand }: { result: HandState["result"]; hand: HandState }) {
  if (!result) return null;
  const won = result.heroDelta > 0.05;
  const lost = result.heroDelta < -0.05;
  const headline = won ? "You won" : lost ? "You lost" : "No pot";

  const runoutNote = result.wonByFold
    ? result.showdownWinner === "hero"
      ? "Folded early — but on this run-out you had the best hand."
      : result.showdownWinner === "villain"
      ? "Folded early — on this run-out villain had the best hand."
      : "Folded early — this run-out would have chopped."
    : null;

  return (
    <div className="rounded-xl border border-white/10 bg-ink-800/70 px-3.5 py-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white/80">{headline}</span>
        <span className={`chip-num text-sm font-bold ${result.heroDelta >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
          {result.heroDelta >= 0 ? "+" : ""}
          {result.heroDelta.toFixed(1)} bb
        </span>
      </div>
      <p className="mt-1 text-xs text-white/50">{result.reason}</p>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-ink-900/60 px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-white/35">You</div>
          <div className="text-xs font-semibold text-white/85">{result.heroHandLabel}</div>
        </div>
        <div className="rounded-lg bg-ink-900/60 px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-white/35">Villain</div>
          <div className="text-xs font-semibold text-white/85">{result.villainHandLabel}</div>
        </div>
      </div>

      {runoutNote && <p className="mt-2 text-[11px] leading-relaxed text-white/40">{runoutNote}</p>}
    </div>
  );
}
