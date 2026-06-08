import { useStore } from "../store/useStore";
import { TOPICS } from "../quiz/topics";
import { masteryScore } from "../quiz/mastery";
import { Street } from "../game/types";
import { Tone } from "../engine/coach";

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-[11px] uppercase tracking-wide text-white/40">{label}</div>
      <div className="chip-num mt-1 text-2xl font-bold" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="text-xs text-white/45">{sub}</div>}
    </div>
  );
}

function masteryColor(s: number): string {
  if (s < 0.4) return "#FF5C7A";
  if (s < 0.7) return "#F5C451";
  return "#10B981";
}

const TONE_DOT: Record<Tone, string> = {
  perfect: "bg-emerald-glow",
  great: "bg-emerald-glow",
  good: "bg-cyan-glow",
  ok: "bg-gold-glow",
  mistake: "bg-orange-400",
  blunder: "bg-rose-400",
};

const STREETS: Street[] = ["preflop", "flop", "turn", "river"];

export function Dashboard() {
  const { stats, mastery, history, resetStats, setScreen, startHand } = useStore();

  const acc = stats.decisions ? stats.matched / stats.decisions : 0;
  const avgLoss = stats.decisions ? stats.evLossTotal / stats.decisions : 0;
  const quizAcc = stats.quizAttempts ? stats.quizCorrect / stats.quizAttempts : 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Your progress</h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setScreen("play");
              startHand();
            }}
            className="btn bg-emerald-glow/20 border border-emerald-glow/40 text-emerald-100"
          >
            Back to table
          </button>
          <button
            onClick={() => confirm("Reset all stats and mastery?") && resetStats()}
            className="btn bg-white/5 border border-white/10 text-white/60"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Hands" value={`${stats.hands}`} />
        <StatCard label="Decisions" value={`${stats.decisions}`} />
        <StatCard label="Accuracy" value={`${(acc * 100).toFixed(0)}%`} sub="matched best line" accent="#10B981" />
        <StatCard label="Avg EV loss" value={`${avgLoss.toFixed(2)}`} sub="bb / decision" accent="#F5C451" />
        <StatCard label="Net" value={`${stats.netBb >= 0 ? "+" : ""}${stats.netBb.toFixed(0)}`} sub="bb" accent={stats.netBb >= 0 ? "#10B981" : "#FF5C7A"} />
        <StatCard label="Quiz" value={`${(quizAcc * 100).toFixed(0)}%`} sub={`${stats.quizCorrect}/${stats.quizAttempts}`} accent="#8B5CF6" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {/* By street */}
        <div className="glass rounded-2xl p-5">
          <h3 className="mb-3 text-sm font-semibold text-white/90">Accuracy by street</h3>
          <div className="space-y-3">
            {STREETS.map((st) => {
              const s = stats.byStreet[st];
              const a = s.decisions ? s.matched / s.decisions : 0;
              return (
                <div key={st}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="capitalize text-white/70">{st}</span>
                    <span className="chip-num text-white/45">
                      {s.decisions ? `${(a * 100).toFixed(0)}% · ${(s.evLoss / Math.max(1, s.decisions)).toFixed(2)}bb loss` : "—"}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-emerald-glow" style={{ width: `${a * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mastery skill tree */}
        <div className="glass rounded-2xl p-5">
          <h3 className="mb-3 text-sm font-semibold text-white/90">Concept mastery</h3>
          <div className="space-y-2.5">
            {TOPICS.map((t) => {
              const m = mastery[t.id];
              const score = m ? masteryScore(m) : 0;
              return (
                <div key={t.id}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-white/70">{t.label}</span>
                    <span className="chip-num text-white/45">
                      {m ? `${(score * 100).toFixed(0)}%` : "untested"}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${(m ? score : 0.04) * 100}%`, background: masteryColor(score) }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent decisions */}
      <div className="glass mt-4 rounded-2xl p-5">
        <h3 className="mb-3 text-sm font-semibold text-white/90">Recent decisions</h3>
        {history.length === 0 ? (
          <p className="text-sm text-white/40">Play some hands to build your history.</p>
        ) : (
          <div className="space-y-1.5">
            {history.slice(0, 12).map((r, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className={`h-2 w-2 rounded-full ${TONE_DOT[r.tone]}`} />
                <span className="w-16 capitalize text-white/50">{r.street}</span>
                <span className="text-white/80">{r.actionLabel}</span>
                {!r.matchedBest && <span className="text-white/40">· best: {r.bestLabel}</span>}
                <span className="chip-num ml-auto text-white/40">
                  {r.evLoss > 0.001 ? `−${r.evLoss.toFixed(2)}bb` : "optimal"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
