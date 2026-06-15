import { ReactNode } from "react";
import { motion } from "framer-motion";
import { HandState } from "../game/types";
import { PlayingCard, CardSlot } from "./PlayingCard";

function Stack({ bb }: { bb: number }) {
  return <span className="chip-num text-xs text-white/70">{bb.toFixed(1)} bb</span>;
}

function Pod({
  label,
  sub,
  stack,
  active,
  tag,
  dealer,
  children,
}: {
  label: string;
  sub: string;
  stack: number;
  active?: boolean;
  tag?: string;
  dealer?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative flex flex-col items-center gap-2">
      <div className="flex gap-1.5">{children}</div>
      <div
        className={`flex items-center gap-2 rounded-full px-3 py-1 border transition ${
          active ? "border-emerald-glow/60 bg-emerald-glow/10 shadow-glow" : "border-white/10 bg-ink-800/80"
        }`}
      >
        {dealer && (
          <span
            className="grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-black text-ink-900 shadow"
            title="Dealer button"
          >
            D
          </span>
        )}
        <span className="text-xs font-semibold text-white/90">{label}</span>
        <span className="text-[10px] uppercase tracking-wide text-white/40">{sub}</span>
        <Stack bb={stack} />
      </div>
      {tag && (
        <span className="rounded-full bg-black/50 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-200">{tag}</span>
      )}
    </div>
  );
}

function PotPill({ pot, toCall }: { pot: number; toCall: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-2 rounded-full bg-black/40 border border-white/10 px-4 py-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-gold-glow shadow-[0_0_10px_2px_rgba(245,196,81,0.5)]" />
        <span className="chip-num text-sm font-bold text-white">{pot.toFixed(1)} bb</span>
        <span className="text-[10px] uppercase tracking-widest text-white/40">pot</span>
      </div>
      {toCall > 0 && <span className="chip-num text-xs text-rose-300">to call {toCall.toFixed(1)}bb</span>}
    </div>
  );
}

function ResultOverlay({ hand }: { hand: HandState }) {
  const r = hand.result!;
  let kind: "won" | "lost" | "split" | "none";
  if (r.heroWon === "split") kind = "split";
  else if (r.heroDelta > 0.05) kind = "won";
  else if (r.heroDelta < -0.05) kind = "lost";
  else kind = "none";

  const cfg = {
    won: { head: "YOU WON", cls: "border-emerald-glow/50 text-emerald-200", glow: "0 0 60px -10px rgba(16,185,129,0.6)" },
    lost: { head: "YOU LOST", cls: "border-rose-400/50 text-rose-200", glow: "0 0 60px -10px rgba(255,92,122,0.55)" },
    split: { head: "SPLIT POT", cls: "border-gold-glow/50 text-amber-200", glow: "0 0 60px -10px rgba(245,196,81,0.5)" },
    none: { head: "FOLDED", cls: "border-white/20 text-white/70", glow: "none" },
  }[kind];

  const delta = `${r.heroDelta >= 0 ? "+" : ""}${r.heroDelta.toFixed(1)} BB`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7, y: -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 17 }}
      className="pointer-events-none absolute inset-x-0 top-[20%] z-20 flex justify-center"
    >
      <div
        className={`rounded-2xl border bg-ink-900/75 px-9 py-4 text-center backdrop-blur-md ${cfg.cls}`}
        style={{ boxShadow: cfg.glow }}
      >
        <div className="text-3xl font-black tracking-tight sm:text-4xl">{cfg.head}</div>
        {kind !== "none" && <div className="chip-num mt-0.5 text-lg font-bold opacity-90">{delta}</div>}
      </div>
    </motion.div>
  );
}

export function Table({ hand }: { hand: HandState }) {
  const done = hand.awaiting === "done";
  const reveal = done; // villain always revealed at hand end
  const heroTurn = hand.awaiting === "hero";
  const heroTag = done ? hand.result?.heroHandLabel : undefined;
  const villainTag = done ? hand.result?.villainHandLabel : undefined;
  const heroSeat = hand.heroIsButton ? "BTN" : "BB";
  const villainSeat = hand.heroIsButton ? "BB" : "BTN";

  return (
    <div className="felt-surface relative w-full overflow-hidden rounded-[2.5rem] px-6 py-8">
      <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-[0.05]">
        <span className="text-8xl font-black tracking-tighter">♠</span>
      </div>

      {done && hand.result && <ResultOverlay hand={hand} />}

      {/* Villain */}
      <div className="relative flex justify-center">
        <Pod
          label="Villain"
          sub={villainSeat}
          stack={hand.villainStack}
          active={!heroTurn && !done}
          tag={villainTag}
          dealer={!hand.heroIsButton}
        >
          {reveal ? (
            <>
              <PlayingCard card={hand.result!.villainCombo[0]} size="lg" index={0} />
              <PlayingCard card={hand.result!.villainCombo[1]} size="lg" index={1} />
            </>
          ) : (
            <>
              <PlayingCard faceDown size="lg" index={0} />
              <PlayingCard faceDown size="lg" index={1} />
            </>
          )}
        </Pod>
      </div>

      {/* Board + pot */}
      <div className="relative my-7 flex flex-col items-center gap-4">
        <PotPill pot={hand.pot} toCall={hand.toCall} />
        <div className="flex gap-2.5">
          {[0, 1, 2, 3, 4].map((i) =>
            hand.board[i] !== undefined ? (
              <PlayingCard key={hand.board[i]} card={hand.board[i]} size="lg" index={i} />
            ) : (
              <CardSlot key={`slot-${i}`} size="lg" />
            )
          )}
        </div>
      </div>

      {/* Hero */}
      <div className="relative flex justify-center">
        <Pod label="You" sub={heroSeat} stack={hand.heroStack} active={heroTurn} tag={heroTag} dealer={hand.heroIsButton}>
          <PlayingCard card={hand.hero[0]} size="xl" index={0} />
          <PlayingCard card={hand.hero[1]} size="xl" index={1} />
        </Pod>
      </div>
    </div>
  );
}
