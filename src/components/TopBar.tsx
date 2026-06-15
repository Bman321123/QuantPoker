import { useStore } from "../store/useStore";

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-full border border-white/10 bg-ink-800/80 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
            value === o.id ? "bg-white text-ink-900" : "text-white/60 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  on,
  onClick,
  label,
  color,
  title,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  color: "emerald" | "violet" | "gold" | "cyan";
  title: string;
}) {
  const onCls = {
    emerald: "border-emerald-glow/40 bg-emerald-glow/15 text-emerald-100",
    violet: "border-violet-glow/40 bg-violet-glow/15 text-violet-100",
    gold: "border-gold-glow/40 bg-gold-glow/15 text-amber-100",
    cyan: "border-cyan-glow/40 bg-cyan-glow/15 text-cyan-100",
  }[color];
  const dot = { emerald: "bg-emerald-glow", violet: "bg-violet-glow", gold: "bg-gold-glow", cyan: "bg-cyan-glow" }[color];
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        on ? onCls : "border-white/10 bg-ink-800/80 text-white/45"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${on ? dot : "bg-white/25"}`} />
      {label}
    </button>
  );
}

export function TopBar() {
  const {
    level,
    setLevel,
    coach,
    toggleCoach,
    guard,
    toggleGuard,
    revealEquity,
    toggleRevealEquity,
    screen,
    setScreen,
  } = useStore();

  return (
    <header className="flex items-center justify-between gap-4 border-b border-white/5 px-5 py-3">
      <div className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-emerald-glow to-cyan-glow text-lg font-black text-ink-900">
          ♠
        </div>
        <div className="leading-none">
          <div className="text-sm font-extrabold tracking-tight text-white">Quant</div>
          <div className="text-[10px] uppercase tracking-widest text-white/35">Poker Trainer</div>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {screen === "play" && (
          <>
            <Segmented
              value={level}
              onChange={(l) => setLevel(l)}
              options={[
                { id: "beginner", label: "Beginner" },
                { id: "pro", label: "Pro" },
              ]}
            />
            <Toggle on={coach} onClick={toggleCoach} label="Coach" color="emerald" title="Show live reads + the recommended line" />
            <Toggle on={guard} onClick={toggleGuard} label="Guard" color="gold" title="Warn me before a clearly suboptimal action and walk me through it" />
            <Toggle
              on={revealEquity}
              onClick={toggleRevealEquity}
              label="Equity"
              color="cyan"
              title="Show your equity vs the equity needed to call — turn off to estimate it yourself"
            />
          </>
        )}

        <Segmented
          value={screen}
          onChange={(s) => setScreen(s)}
          options={[
            { id: "play", label: "Table" },
            { id: "train", label: "Train" },
            { id: "blackjack", label: "Blackjack" },
            { id: "dashboard", label: "Progress" },
          ]}
        />
      </div>
    </header>
  );
}
