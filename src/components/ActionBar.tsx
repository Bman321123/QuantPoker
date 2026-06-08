import { DecisionView } from "../game/types";
import { Candidate } from "../engine/ev";

function colorFor(c: Candidate): string {
  if (c.kind === "fold") return "bg-rose-500/15 text-rose-200 border-rose-400/30 hover:bg-rose-500/25";
  if (c.kind === "check" || c.kind === "call")
    return "bg-cyan-glow/10 text-cyan-100 border-cyan-glow/30 hover:bg-cyan-glow/20";
  if (c.label === "All-in")
    return "bg-violet-glow/20 text-violet-100 border-violet-glow/40 hover:bg-violet-glow/30";
  return "bg-emerald-glow/15 text-emerald-100 border-emerald-glow/30 hover:bg-emerald-glow/25";
}

export function ActionBar({
  decision,
  disabled,
  onAct,
}: {
  decision: DecisionView;
  disabled?: boolean;
  onAct: (idx: number) => void;
}) {
  const passive: number[] = [];
  const aggressive: number[] = [];
  decision.candidates.forEach((c, i) => {
    if (c.kind === "bet" || c.kind === "raise") aggressive.push(i);
    else passive.push(i);
  });

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2">
        {passive.map((i) => {
          const c = decision.candidates[i];
          return (
            <button
              key={i}
              disabled={disabled}
              onClick={() => onAct(i)}
              className={`btn border ${colorFor(c)} min-w-[5.5rem]`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      {aggressive.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {aggressive.map((i) => {
            const c = decision.candidates[i];
            return (
              <button
                key={i}
                disabled={disabled}
                onClick={() => onAct(i)}
                className={`btn border ${colorFor(c)} flex-col !py-2 min-w-[5rem]`}
              >
                <span>{c.label}</span>
                <span className="chip-num text-[10px] opacity-60">{c.amount.toFixed(1)}bb</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
