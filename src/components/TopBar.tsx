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

export function TopBar() {
  const { level, setLevel, testMe, toggleTestMe, showLine, toggleShowLine, screen, setScreen } =
    useStore();

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

      <div className="flex items-center gap-3">
        <Segmented
          value={level}
          onChange={(l) => setLevel(l)}
          options={[
            { id: "beginner", label: "Beginner" },
            { id: "pro", label: "Pro" },
          ]}
        />

        <button
          onClick={toggleShowLine}
          title="Show the engine's recommended action + the math behind it"
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
            showLine
              ? "border-emerald-glow/40 bg-emerald-glow/15 text-emerald-100"
              : "border-white/10 bg-ink-800/80 text-white/50"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${showLine ? "bg-emerald-glow" : "bg-white/30"}`} />
          Show line
        </button>

        <button
          onClick={toggleTestMe}
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
            testMe
              ? "border-violet-glow/40 bg-violet-glow/15 text-violet-100"
              : "border-white/10 bg-ink-800/80 text-white/50"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${testMe ? "bg-violet-glow" : "bg-white/30"}`} />
          Test me
        </button>

        <Segmented
          value={screen}
          onChange={(s) => setScreen(s)}
          options={[
            { id: "play", label: "Table" },
            { id: "dashboard", label: "Progress" },
          ]}
        />
      </div>
    </header>
  );
}
