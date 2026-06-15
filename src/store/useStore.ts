import { create } from "zustand";
import { persist } from "zustand/middleware";
import { HandState, DecisionView, DecisionRecord, Street } from "../game/types";
import { newHand, heroDecision, applyHeroAction } from "../game/engine";
import { Level, Verdict, verdict } from "../engine/coach";
import { TopicId } from "../quiz/topics";
import { TopicMastery, updateMastery, emptyMastery } from "../quiz/mastery";

interface StreetStat {
  decisions: number;
  matched: number;
  evLoss: number;
}
const emptyStreet = (): StreetStat => ({ decisions: 0, matched: 0, evLoss: 0 });

export interface Stats {
  hands: number;
  decisions: number;
  matched: number;
  evLossTotal: number;
  netBb: number;
  quizAttempts: number;
  quizCorrect: number;
  byStreet: Record<Street, StreetStat>;
}

const emptyStats = (): Stats => ({
  hands: 0,
  decisions: 0,
  matched: 0,
  evLossTotal: 0,
  netBb: 0,
  quizAttempts: 0,
  quizCorrect: 0,
  byStreet: { preflop: emptyStreet(), flop: emptyStreet(), turn: emptyStreet(), river: emptyStreet() },
});

function cloneStats(s: Stats): Stats {
  return {
    ...s,
    byStreet: {
      preflop: { ...s.byStreet.preflop },
      flop: { ...s.byStreet.flop },
      turn: { ...s.byStreet.turn },
      river: { ...s.byStreet.river },
    },
  };
}

export type Screen = "play" | "train" | "blackjack" | "dashboard";

export interface BlackjackStats {
  hands: number;
  bsCorrect: number; // basic-strategy decisions matched
  bsTotal: number;
  countCorrect: number; // correct running-count answers
  countTotal: number;
}
const emptyBjStats = (): BlackjackStats => ({ hands: 0, bsCorrect: 0, bsTotal: 0, countCorrect: 0, countTotal: 0 });
export const BJ_START_BANKROLL = 1000;
export const BJ_UNIT = 10; // $ per betting unit

interface StoreState {
  // persisted
  level: Level;
  coach: boolean; // show live reads + recommended action in the side panel
  guard: boolean; // intervene with a Socratic warning before a clearly-bad action
  revealEquity: boolean; // show the "your equity" vs "equity to call" readout (hide to self-test)
  stats: Stats;
  mastery: Partial<Record<TopicId, TopicMastery>>;
  history: DecisionRecord[];
  onboarded: boolean;

  // blackjack card-counting trainer (persisted)
  bankroll: number;
  bjStats: BlackjackStats;

  // transient
  screen: Screen;
  hand: HandState | null;
  decision: DecisionView | null;
  lastVerdict: Verdict | null;
  lastRecord: DecisionRecord | null;

  // settings actions
  setLevel: (l: Level) => void;
  toggleCoach: () => void;
  toggleGuard: () => void;
  toggleRevealEquity: () => void;
  setScreen: (s: Screen) => void;
  finishOnboarding: () => void;
  resetStats: () => void;

  // game actions
  startHand: () => void;
  act: (idx: number) => void;
  nextHand: () => void;

  // training actions (used by the Train tab)
  answerQuiz: (topic: TopicId, correct: boolean) => void;

  // blackjack actions
  bjAddToBankroll: (delta: number) => void;
  bjRecordDecision: (correct: boolean) => void;
  bjRecordCount: (correct: boolean) => void;
  bjHandPlayed: () => void;
  bjReset: () => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      level: "beginner",
      coach: true,
      guard: true,
      revealEquity: true,
      stats: emptyStats(),
      mastery: {},
      history: [],
      onboarded: false,

      bankroll: BJ_START_BANKROLL,
      bjStats: emptyBjStats(),

      screen: "play",
      hand: null,
      decision: null,
      lastVerdict: null,
      lastRecord: null,

      setLevel: (l) => set({ level: l }),
      toggleCoach: () => set((s) => ({ coach: !s.coach })),
      toggleGuard: () => set((s) => ({ guard: !s.guard })),
      toggleRevealEquity: () => set((s) => ({ revealEquity: !s.revealEquity })),
      setScreen: (screen) => set({ screen }),
      finishOnboarding: () => set({ onboarded: true }),
      resetStats: () => set({ stats: emptyStats(), mastery: {}, history: [] }),

      startHand: () => {
        const hand = newHand();
        const decision = hand.awaiting === "hero" ? heroDecision(hand) : null;
        set({ hand, decision, lastVerdict: null, lastRecord: null, screen: "play" });
      },

      act: (idx) => {
        const { hand, decision, level } = get();
        if (!hand || !decision || hand.awaiting !== "hero") return;

        const v = verdict(decision.coachCtx, idx, level);
        const { state, record } = applyHeroAction(hand, decision, idx);

        // update aggregate stats
        const stats = cloneStats(get().stats);
        stats.decisions += 1;
        stats.evLossTotal += record.evLoss;
        if (record.matchedBest) stats.matched += 1;
        const ss = stats.byStreet[record.street];
        ss.decisions += 1;
        ss.evLoss += record.evLoss;
        if (record.matchedBest) ss.matched += 1;

        const history = [record, ...get().history].slice(0, 250);

        if (state.awaiting === "done") {
          stats.hands += 1;
          stats.netBb += state.result ? state.result.heroDelta : 0;
          set({ hand: state, decision: null, lastVerdict: v, lastRecord: record, stats, history });
        } else {
          const next = heroDecision(state);
          set({ hand: state, decision: next, lastVerdict: v, lastRecord: record, stats, history });
        }
      },

      nextHand: () => get().startHand(),

      answerQuiz: (topic, correct) => {
        const mastery = { ...get().mastery };
        mastery[topic] = updateMastery(mastery[topic] ?? emptyMastery(), correct);
        const stats = cloneStats(get().stats);
        stats.quizAttempts += 1;
        if (correct) stats.quizCorrect += 1;
        set({ mastery, stats });
      },

      bjAddToBankroll: (delta) => set((s) => ({ bankroll: Math.round((s.bankroll + delta) * 100) / 100 })),
      bjRecordDecision: (correct) =>
        set((s) => ({ bjStats: { ...s.bjStats, bsTotal: s.bjStats.bsTotal + 1, bsCorrect: s.bjStats.bsCorrect + (correct ? 1 : 0) } })),
      bjRecordCount: (correct) =>
        set((s) => ({ bjStats: { ...s.bjStats, countTotal: s.bjStats.countTotal + 1, countCorrect: s.bjStats.countCorrect + (correct ? 1 : 0) } })),
      bjHandPlayed: () => set((s) => ({ bjStats: { ...s.bjStats, hands: s.bjStats.hands + 1 } })),
      bjReset: () => set({ bankroll: BJ_START_BANKROLL, bjStats: emptyBjStats() }),
    }),
    {
      name: "quant-poker-v1",
      partialize: (s) => ({
        level: s.level,
        coach: s.coach,
        guard: s.guard,
        revealEquity: s.revealEquity,
        stats: s.stats,
        mastery: s.mastery,
        history: s.history,
        onboarded: s.onboarded,
        bankroll: s.bankroll,
        bjStats: s.bjStats,
      }),
    }
  )
);
