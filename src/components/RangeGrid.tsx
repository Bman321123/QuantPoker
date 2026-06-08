import { useMemo, CSSProperties } from "react";
import { Card } from "../engine/cards";
import { ALL_CLASSES, Range, ComboCounts, liveClassCombos, comboType } from "../engine/combos";
import { rangePercent } from "../engine/ranges";

function cellStyle(weight: number, live: number): CSSProperties {
  if (weight <= 0 || live === 0)
    return { background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.18)" };
  const a = 0.18 + 0.62 * Math.min(1, weight);
  return {
    background: `rgba(16,185,129,${a})`,
    color: weight > 0.55 ? "#04140d" : "rgba(255,255,255,0.85)",
  };
}

export function RangeGrid({
  range,
  dead,
  combos,
}: {
  range: Range;
  dead: Card[];
  combos: ComboCounts;
}) {
  const deadSet = useMemo(() => new Set(dead), [dead]);
  const pct = rangePercent(range);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold text-white/90">Villain's range</div>
        <div className="chip-num text-xs text-white/50">
          {combos.total} combos · {pct.toFixed(0)}%
        </div>
      </div>

      <div className="grid grid-cols-13 gap-[2px]">
        {ALL_CLASSES.map((cls) => {
          const w = range[cls] ?? 0;
          const live = liveClassCombos(cls, deadSet).length;
          return (
            <div
              key={cls}
              title={`${cls} · ${live} combo${live === 1 ? "" : "s"}${w > 0 && w < 1 ? ` · ${Math.round(w * 100)}%` : ""}`}
              className="aspect-square grid place-items-center rounded-[3px] text-[7px] font-semibold leading-none"
              style={cellStyle(w, live)}
            >
              {cls.length === 2 ? cls : cls.slice(0, 2)}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Breakdown label="Pairs" value={combos.pairs} accent="#F5C451" />
        <Breakdown label="Suited" value={combos.suited} accent="#22D3EE" />
        <Breakdown label="Offsuit" value={combos.offsuit} accent="#8B5CF6" />
      </div>
    </div>
  );
}

function Breakdown({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-lg bg-ink-800/60 border border-white/5 py-2">
      <div className="chip-num text-lg font-bold" style={{ color: accent }}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-white/40">{label}</div>
    </div>
  );
}
