import { ReactNode } from "react";
import { motion } from "framer-motion";
import { HandState } from "../game/types";
import { PlayingCard, CardSlot } from "./PlayingCard";

function Stack({ bb }: { bb: number }) {
  return (
    <span className="chip-num text-xs text-white/70">{bb.toFixed(1)} bb</span>
  );
}

function Pod({
  label,
  sub,
  stack,
  active,
  tag,
  children,
}: {
  label: string;
  sub: string;
  stack: number;
  active?: boolean;
  tag?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-1.5">{children}</div>
      <div
        className={`flex items-center gap-2 rounded-full px-3 py-1 border transition ${
          active
            ? "border-emerald-glow/60 bg-emerald-glow/10 shadow-glow"
            : "border-white/10 bg-ink-800/80"
        }`}
      >
        <span className="text-xs font-semibold text-white/90">{label}</span>
        <span className="text-[10px] uppercase tracking-wide text-white/40">{sub}</span>
        <Stack bb={stack} />
      </div>
      {tag && (
        <span className="rounded-full bg-black/40 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-200">
          {tag}
        </span>
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
      {toCall > 0 && (
        <span className="chip-num text-xs text-rose-300">to call {toCall.toFixed(1)}bb</span>
      )}
    </div>
  );
}

export function Table({ hand }: { hand: HandState }) {
  const done = hand.awaiting === "done";
  const reveal = done; // villain is always revealed at hand end (board runs out)
  const heroTurn = hand.awaiting === "hero";
  const heroTag = done ? hand.result?.heroHandLabel : undefined;
  const villainTag = done ? hand.result?.villainHandLabel : undefined;

  return (
    <div className="felt-surface rounded-[2.5rem] px-6 py-5 relative overflow-hidden">
      {/* center logo watermark */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-[0.05]">
        <span className="text-7xl font-black tracking-tighter">♠</span>
      </div>

      {/* Villain */}
      <div className="relative flex justify-center">
        <Pod label="Villain" sub="BB" stack={hand.villainStack} active={!heroTurn && !done} tag={villainTag}>
          {reveal ? (
            <>
              <PlayingCard card={hand.result!.villainCombo[0]} size="md" index={0} />
              <PlayingCard card={hand.result!.villainCombo[1]} size="md" index={1} />
            </>
          ) : (
            <>
              <PlayingCard faceDown size="md" index={0} />
              <PlayingCard faceDown size="md" index={1} />
            </>
          )}
        </Pod>
      </div>

      {/* Board + pot */}
      <div className="relative my-5 flex flex-col items-center gap-4">
        <PotPill pot={hand.pot} toCall={hand.toCall} />
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4].map((i) =>
            hand.board[i] !== undefined ? (
              <PlayingCard key={hand.board[i]} card={hand.board[i]} size="md" index={i} />
            ) : (
              <CardSlot key={`slot-${i}`} size="md" />
            )
          )}
        </div>
      </div>

      {/* Hero */}
      <div className="relative flex justify-center">
        <div className="relative">
          <Pod label="You" sub="BTN" stack={hand.heroStack} active={heroTurn} tag={heroTag}>
            <PlayingCard card={hand.hero[0]} size="lg" index={0} />
            <PlayingCard card={hand.hero[1]} size="lg" index={1} />
          </Pod>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -right-7 bottom-9 grid h-6 w-6 place-items-center rounded-full bg-white text-[10px] font-black text-ink-900 shadow"
            title="Dealer button"
          >
            D
          </motion.div>
        </div>
      </div>
    </div>
  );
}
