import { create } from "zustand";
import { persist } from "zustand/middleware";
import { HandState, DecisionView, DecisionRecord, Street } from "../game/types";
import { newHand, heroDecision, applyHeroAction } from "../game/engine";
import { Level, Verdict, verdict } from "../engine/coach";
import { Quiz, applicableTopics, generateQuiz } from "../quiz/questions";
import { TopicId } from "../quiz/topics";
import { TopicMastery, updateMastery, emptyMastery } from "../quiz/mastery";

const QUIZ_PROB = 0.7;

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

export type Screen = "play" | "dashboard";

interface StoreState {
  // persisted
  level: Level;
  testMe: boolean;
  coach: boolean; // show live reads + recommended action in the side panel
  guard: boolean; // intervene with a Socratic warning before a clearly-bad action
  stats: Stats;
  mastery: Partial<Record<TopicId, TopicMastery>>;
  history: DecisionRecord[];
  onboarded: boolean;

  // transient
  screen: Screen;
  hand: HandState | null;
  decision: DecisionView | null;
  lastVerdict: Verdict | null;
  lastRecord: DecisionRecord | null;
  quiz: Quiz | null;

  // settings actions
  setLevel: (l: Level) => void;
  toggleTestMe: () => void;
  toggleCoach: () => void;
  toggleGuard: () => void;
  setScreen: (s: Screen) => void;
  finishOnboarding: () => void;
  resetStats: () => void;

  // game actions
  startHand: () => void;
  act: (idx: number) => void;
  nextHand: () => void;

  // quiz actions
  answerQuiz: (topic: TopicId, correct: boolean) => void;
  skipQuiz: () => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      level: "beginner",
      testMe: true,
      coach: true,
      guard: true,
      stats: emptyStats(),
      mastery: {},
      history: [],
      onboarded: false,

      screen: "play",
      hand: null,
      decision: null,
      lastVerdict: null,
      lastRecord: null,
      quiz: null,

      setLevel: (l) => set({ level: l }),
      toggleTestMe: () => set((s) => ({ testMe: !s.testMe })),
      toggleCoach: () => set((s) => ({ coach: !s.coach })),
      toggleGuard: () => set((s) => ({ guard: !s.guard })),
      setScreen: (screen) => set({ screen }),
      finishOnboarding: () => set({ onboarded: true }),
      resetStats: () => set({ stats: emptyStats(), mastery: {}, history: [] }),

      startHand: () => {
        const hand = newHand();
        const decision = heroDecision(hand);
        set({ hand, decision, lastVerdict: null, lastRecord: null, quiz: null, screen: "play" });
        maybeQuiz(get, set, decision);
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
          set({ hand: state, decision: null, lastVerdict: v, lastRecord: record, quiz: null, stats, history });
        } else {
          const next = heroDecision(state);
          set({ hand: state, decision: next, lastVerdict: v, lastRecord: record, stats, history });
          maybeQuiz(get, set, next);
        }
      },

      nextHand: () => get().startHand(),

      answerQuiz: (topic, correct) => {
        const mastery = { ...get().mastery };
        mastery[topic] = updateMastery(mastery[topic] ?? emptyMastery(), correct);
        const stats = cloneStats(get().stats);
        stats.quizAttempts += 1;
        if (correct) stats.quizCorrect += 1;
        set({ mastery, stats, quiz: null });
      },

      skipQuiz: () => set({ quiz: null }),
    }),
    {
      name: "quant-poker-v1",
      partialize: (s) => ({
        level: s.level,
        testMe: s.testMe,
        coach: s.coach,
        guard: s.guard,
        stats: s.stats,
        mastery: s.mastery,
        history: s.history,
        onboarded: s.onboarded,
      }),
    }
  )
);

function maybeQuiz(
  get: () => StoreState,
  set: (partial: Partial<StoreState>) => void,
  decision: DecisionView
) {
  if (!get().testMe || Math.random() > QUIZ_PROB) {
    set({ quiz: null });
    return;
  }
  const topics = applicableTopics(decision.quizCtx);
  // weak-topic weighting
  const mastery = get().mastery;
  const weights = topics.map((id) => 0.12 + (1 - (mastery[id]?.ewma ?? emptyMastery().ewma)));
  const total = weights.reduce((a, b) => a + b, 0);
  let x = Math.random() * total;
  let topic: TopicId | null = topics[0] ?? null;
  for (let i = 0; i < topics.length; i++) {
    x -= weights[i];
    if (x <= 0) {
      topic = topics[i];
      break;
    }
  }
  const q = topic ? generateQuiz(decision.quizCtx, topic) : null;
  set({ quiz: q });
}
