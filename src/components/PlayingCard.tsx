import { motion } from "framer-motion";
import { Card as TCard, rankOf, suitOf, RANK_CHARS, SUIT_SYMBOLS, SUIT_COLORS } from "../engine/cards";

type Size = "sm" | "md" | "lg" | "xl";

const SIZES: Record<Size, string> = {
  sm: "w-9 h-12 text-sm rounded-md",
  md: "w-14 h-20 text-lg rounded-lg",
  lg: "w-[4.75rem] h-[6.75rem] text-2xl rounded-xl",
  xl: "w-[5.5rem] h-[7.75rem] text-3xl rounded-xl",
};

function rankLabel(r: number): string {
  return r === 10 ? "10" : RANK_CHARS[r - 2];
}

export function PlayingCard({
  card,
  faceDown,
  size = "md",
  index = 0,
}: {
  card?: TCard;
  faceDown?: boolean;
  size?: Size;
  index?: number;
}) {
  if (faceDown || card === undefined) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -16, rotateZ: -4 }}
        animate={{ opacity: 1, y: 0, rotateZ: 0 }}
        transition={{ delay: index * 0.06, type: "spring", stiffness: 320, damping: 26 }}
        className={`${SIZES[size]} relative shadow-card border border-white/10`}
        style={{
          background: "repeating-linear-gradient(45deg,#000000 0 7px,#0e0e10 7px 14px)",
        }}
      >
        <div className="absolute inset-0 grid place-items-center">
          <div className="h-3 w-3 rounded-full bg-gradient-to-br from-violet-glow to-cyan-glow opacity-90" />
        </div>
      </motion.div>
    );
  }

  const r = rankOf(card);
  const s = suitOf(card);
  const color = SUIT_COLORS[s];

  return (
    <motion.div
      initial={{ opacity: 0, y: -18, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.06, type: "spring", stiffness: 320, damping: 24 }}
      className={`${SIZES[size]} relative select-none border border-white/15 bg-gradient-to-br from-[#23262d] to-[#0c0d10] shadow-card`}
    >
      <div className="absolute top-1 left-1.5 leading-none font-bold" style={{ color }}>
        <div>{rankLabel(r)}</div>
        <div className="text-[0.7em] -mt-0.5">{SUIT_SYMBOLS[s]}</div>
      </div>
      <div
        className="absolute inset-0 grid place-items-center font-bold opacity-90"
        style={{ color, fontSize: "1.7em" }}
      >
        {SUIT_SYMBOLS[s]}
      </div>
    </motion.div>
  );
}

export function CardSlot({ size = "md" }: { size?: Size }) {
  return <div className={`${SIZES[size]} border border-white/10 bg-black/30`} />;
}
