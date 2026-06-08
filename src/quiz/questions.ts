// Question generators. Each builds a numeric question from the live hand, with an exact
// answer and a Socratic ladder of simpler steps leading to it. The player can climb the
// ladder or skip straight to answering.
import { Card, rankOf, cardStr } from "../engine/cards";
import {
  Range,
  Combo,
  ComboCounts,
  comboType,
  liveClassCombos,
  parseClass,
  ALL_CLASSES,
} from "../engine/combos";
import { potOdds, mdf, alpha } from "../engine/theory";
import { TopicId } from "./topics";

export type Unit = "combos" | "%" | "bb";

export interface QuizStep {
  prompt: string;
  answer?: number; // omitted => informational step (no input)
  unit?: Unit;
}

export interface Quiz {
  topic: TopicId;
  prompt: string;
  answer: number;
  unit: Unit;
  tolerance: number;
  steps: QuizStep[];
  explanation: string;
}

export interface QuizContext {
  villainRange: Range;
  board: Card[];
  hero: Combo;
  combos: ComboCounts;
  equity: number;
  pot: number;
  toCall: number;
  betInPlay?: number; // size of a bet being faced/considered
  potBeforeBet?: number;
}

const RANK_PLURAL = [
  "", "", "Twos", "Threes", "Fours", "Fives", "Sixes", "Sevens", "Eights", "Nines",
  "Tens", "Jacks", "Queens", "Kings", "Aces",
];

function deadSet(ctx: QuizContext): Set<Card> {
  return new Set<Card>([ctx.hero[0], ctx.hero[1], ...ctx.board]);
}
function countClassesOfType(range: Range, type: "pair" | "suited" | "offsuit"): number {
  let n = 0;
  for (const cls in range) if (range[cls] > 0 && comboType(cls) === type) n++;
  return n;
}
function choose2(n: number): number {
  return (n * (n - 1)) / 2;
}

// ---- generators ----

function genSuited(ctx: QuizContext): Quiz {
  const nSuited = countClassesOfType(ctx.villainRange, "suited");
  return {
    topic: "combos_suited",
    prompt: "How many suited combos are in villain's range right now?",
    answer: ctx.combos.suited,
    unit: "combos",
    tolerance: 0,
    steps: [
      { prompt: "Before any cards are removed, how many combos does a single suited hand (like A♥5♥) have?", answer: 4, unit: "combos" },
      { prompt: `Villain's range holds ${nSuited} suited classes. Ignoring blockers, that's ${nSuited} × 4 = ? suited combos.`, answer: nSuited * 4, unit: "combos" },
      { prompt: "Your hand and the board remove some of those. After blockers, how many suited combos actually remain?", answer: ctx.combos.suited, unit: "combos" },
    ],
    explanation: `${nSuited} suited classes × 4 = ${nSuited * 4}, minus ${nSuited * 4 - ctx.combos.suited} blocked by your cards and the board = ${ctx.combos.suited}.`,
  };
}

function genPairs(ctx: QuizContext): Quiz {
  const nPairs = countClassesOfType(ctx.villainRange, "pair");
  return {
    topic: "combos_pairs",
    prompt: "How many pocket-pair combos are in villain's range?",
    answer: ctx.combos.pairs,
    unit: "combos",
    tolerance: 0,
    steps: [
      { prompt: "How many combos does a single pocket pair (like 7♦7♣) have before blockers?", answer: 6, unit: "combos" },
      { prompt: `Villain holds ${nPairs} pair classes → ${nPairs} × 6 = ? combos before blockers.`, answer: nPairs * 6, unit: "combos" },
      { prompt: "After removing pairs blocked by visible cards, how many pair combos remain?", answer: ctx.combos.pairs, unit: "combos" },
    ],
    explanation: `${nPairs} pair classes × 6 = ${nPairs * 6}, minus ${nPairs * 6 - ctx.combos.pairs} blocked = ${ctx.combos.pairs}.`,
  };
}

function genTotal(ctx: QuizContext): Quiz {
  const c = ctx.combos;
  return {
    topic: "combos_total",
    prompt: "How many total combos are in villain's range?",
    answer: c.total,
    unit: "combos",
    tolerance: 0,
    steps: [
      { prompt: "How many pair combos does villain have (after blockers)?", answer: c.pairs, unit: "combos" },
      { prompt: "How many suited combos?", answer: c.suited, unit: "combos" },
      { prompt: "How many offsuit combos?", answer: c.offsuit, unit: "combos" },
      { prompt: `Add them: ${c.pairs} + ${c.suited} + ${c.offsuit} = ?`, answer: c.total, unit: "combos" },
    ],
    explanation: `Pairs ${c.pairs} + suited ${c.suited} + offsuit ${c.offsuit} = ${c.total} total combos.`,
  };
}

function genClassCount(ctx: QuizContext): Quiz | null {
  // pick a pocket pair present in villain's range, preferring one that's blocked
  const dead = deadSet(ctx);
  const pairClasses = ALL_CLASSES.filter(
    (c) => (ctx.villainRange[c] ?? 0) > 0 && comboType(c) === "pair"
  );
  if (pairClasses.length === 0) return null;
  let pick = pairClasses[0];
  for (const c of pairClasses) {
    if (liveClassCombos(c, dead).length < 6) {
      pick = c;
      break;
    }
  }
  const rank = parseClass(pick).hi;
  const visible = [...dead].filter((card) => rankOf(card) === rank).length;
  const remaining = choose2(4 - visible);
  return {
    topic: "class_count",
    prompt: `How many combos of ${pick} are in villain's range, given the visible cards?`,
    answer: remaining,
    unit: "combos",
    tolerance: 0,
    steps: [
      { prompt: `A pocket pair like ${pick} has how many combos in a full deck?`, answer: 6, unit: "combos" },
      { prompt: `How many ${RANK_PLURAL[rank]} are visible (in your hand or on the board)?`, answer: visible, unit: "combos" },
      { prompt: `With ${4 - visible} of that rank left, combos = C(${4 - visible},2) = ?`, answer: remaining, unit: "combos" },
    ],
    explanation: `${visible} ${RANK_PLURAL[rank]} are dead, leaving ${4 - visible} → C(${4 - visible},2) = ${remaining} combos of ${pick}.`,
  };
}

function genPotOdds(ctx: QuizContext): Quiz | null {
  if (ctx.toCall <= 0) return null;
  const need = potOdds(ctx.toCall, ctx.pot) * 100;
  return {
    topic: "pot_odds",
    prompt: `You face ${fmtBb(ctx.toCall)} to call into a ${fmtBb(ctx.pot)} pot. What equity % do you need to break even?`,
    answer: need,
    unit: "%",
    tolerance: 1.5,
    steps: [
      { prompt: "If you call, how many bb do you put in?", answer: ctx.toCall, unit: "bb" },
      { prompt: "What is the total pot after your call (pot + your call)?", answer: ctx.pot + ctx.toCall, unit: "bb" },
      { prompt: "Break-even equity = your call ÷ total pot. As a %?", answer: need, unit: "%" },
    ],
    explanation: `${fmtBb(ctx.toCall)} ÷ ${fmtBb(ctx.pot + ctx.toCall)} = ${need.toFixed(1)}% equity needed to call.`,
  };
}

function genMdf(ctx: QuizContext): Quiz | null {
  const bet = ctx.betInPlay;
  const before = ctx.potBeforeBet;
  if (!bet || before === undefined) return null;
  const m = mdf(bet, before) * 100;
  return {
    topic: "mdf",
    prompt: `Facing a bet of ${fmtBb(bet)} into ${fmtBb(before)}, what's the minimum defense frequency?`,
    answer: m,
    unit: "%",
    tolerance: 2,
    steps: [
      { prompt: "MDF = pot ÷ (pot + bet). What's the pot before the bet?", answer: before, unit: "bb" },
      { prompt: "Add the bet: pot + bet = ?", answer: before + bet, unit: "bb" },
      { prompt: `MDF = ${fmtBb(before)} ÷ ${fmtBb(before + bet)}. As a %?`, answer: m, unit: "%" },
    ],
    explanation: `MDF = ${before.toFixed(1)} ÷ ${(before + bet).toFixed(1)} = ${m.toFixed(1)}%. Defend at least this often or bluffs print.`,
  };
}

function genAlpha(ctx: QuizContext): Quiz | null {
  const bet = ctx.betInPlay;
  const before = ctx.potBeforeBet;
  if (!bet || before === undefined) return null;
  const a = alpha(bet, before) * 100;
  return {
    topic: "alpha",
    prompt: `If you bluff ${fmtBb(bet)} into ${fmtBb(before)}, how often must villain fold for it to break even?`,
    answer: a,
    unit: "%",
    tolerance: 2,
    steps: [
      { prompt: `You risk ${fmtBb(bet)} trying to win ${fmtBb(before)}.` },
      { prompt: "Required fold equity = bet ÷ (bet + pot). As a %?", answer: a, unit: "%" },
    ],
    explanation: `α = ${bet.toFixed(1)} ÷ ${(bet + before).toFixed(1)} = ${a.toFixed(1)}%. Villain must fold at least this often.`,
  };
}

function genEquity(ctx: QuizContext): Quiz {
  const e = ctx.equity * 100;
  return {
    topic: "equity",
    prompt: "Estimate your equity vs villain's range (%).",
    answer: e,
    unit: "%",
    tolerance: 8,
    steps: [
      { prompt: "Do you have a made hand, a draw, or air? For draws use the rule of 2 and 4 (outs × 4 on the flop, × 2 on the turn)." },
      { prompt: "Weigh how often you're ahead now vs how often you improve. Your best estimate, %?", answer: e, unit: "%" },
    ],
    explanation: `The engine's Monte-Carlo equity here is ${e.toFixed(1)}%. Within ±8% is a strong read.`,
  };
}

const GENERATORS: Record<TopicId, (ctx: QuizContext) => Quiz | null> = {
  combos_suited: genSuited,
  combos_pairs: genPairs,
  combos_total: genTotal,
  class_count: genClassCount,
  pot_odds: genPotOdds,
  mdf: genMdf,
  alpha: genAlpha,
  equity: genEquity,
};

export function applicableTopics(ctx: QuizContext): TopicId[] {
  const out: TopicId[] = [];
  for (const id of Object.keys(GENERATORS) as TopicId[]) {
    if (GENERATORS[id](ctx)) out.push(id);
  }
  return out;
}

export function generateQuiz(ctx: QuizContext, topic: TopicId): Quiz | null {
  return GENERATORS[topic](ctx);
}

export function fmtAnswer(n: number, unit: Unit): string {
  if (unit === "combos") return `${Math.round(n)}`;
  if (unit === "%") return `${n.toFixed(1)}%`;
  return `${n.toFixed(1)}bb`;
}
function fmtBb(x: number): string {
  return `${x.toFixed(1)}bb`;
}
export { cardStr };
