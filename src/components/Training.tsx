// Training lab: standalone scenario drills, separated from the live table.
// Each scenario is a real engine-dealt spot (so ranges, pot geometry, and blockers are all
// genuine); the question is picked from the topics that apply, weighted toward weak topics.
import { useMemo, useState } from "react";
import { newHand, heroDecision, applyHeroAction } from "../game/engine";
import { HandState, DecisionView } from "../game/types";
import { applicableTopics, generateQuiz, Quiz } from "../quiz/questions";
import { TopicId, TOPICS } from "../quiz/topics";
import { pickWeakTopic, TopicMastery } from "../quiz/mastery";
import { useStore } from "../store/useStore";
import { QuizCard } from "./QuizCard";
import { RangeGrid } from "./RangeGrid";
import { PlayingCard, CardSlot } from "./PlayingCard";
import { countCombos } from "../engine/combos";

interface Scenario {
  hand: HandState;
  decision: DecisionView;
  quiz: Quiz;
  key: number;
}

let scenarioCounter = 0;

// Deal a hand and fast-forward 0–2 reasonable hero actions so drills cover all streets.
function dealSpot(): HandState | null {
  let s = newHand();
  const steps = Math.floor(Math.random() * 3);
  for (let i = 0; i < steps; i++) {
    if (s.awaiting !== "hero") break;
    const d = heroDecision(s, 300);
    const c = d.candidates;
    let idx = c.findIndex((x) => x.kind === "check");
    if (idx < 0) idx = c.findIndex((x) => x.kind === "call");
    if (Math.random() < 0.35) {
      const b = c.findIndex((x) => (x.kind === "bet" || x.kind === "raise") && x.label !== "All-in");
      if (b >= 0) idx = b;
    }
    if (idx < 0) break;
    s = applyHeroAction(s, d, idx).state;
  }
  return s.awaiting === "hero" ? s : null;
}

function makeScenario(mastery: Partial<Record<TopicId, TopicMastery>>): Scenario | null {
  for (let tries = 0; tries < 12; tries++) {
    const hand = dealSpot();
    if (!hand) continue;
    const decision = heroDecision(hand, 800);
    const topic = pickWeakTopic(applicableTopics(decision.quizCtx), mastery);
    if (!topic) continue;
    const quiz = generateQuiz(decision.quizCtx, topic);
    if (quiz) return { hand, decision, quiz, key: ++scenarioCounter };
  }
  return null;
}

function SpotReadout({ hand }: { hand: HandState }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-ink-800/80 border border-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/70">
        {hand.street}
      </span>
      <span className="rounded-full bg-ink-800/80 border border-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/70">
        you're {hand.heroIsButton ? "BTN (IP)" : "BB (OOP)"}
      </span>
      <span className="chip-num rounded-full bg-black/40 border border-white/10 px-3 py-1 text-xs font-bold text-white">
        pot {hand.pot.toFixed(1)}bb
      </span>
      {hand.toCall > 0 && (
        <span className="chip-num rounded-full bg-rose-500/15 border border-rose-400/30 px-3 py-1 text-xs font-bold text-rose-200">
          to call {hand.toCall.toFixed(1)}bb
        </span>
      )}
    </div>
  );
}

export function Training() {
  const mastery = useStore((s) => s.mastery);
  const answerQuiz = useStore((s) => s.answerQuiz);
  const stats = useStore((s) => s.stats);
  const [scenario, setScenario] = useState<Scenario | null>(() => makeScenario(mastery));
  const [streak, setStreak] = useState(0);

  const next = () => setScenario(makeScenario(useStore.getState().mastery));

  const dead = useMemo(
    () => (scenario ? [scenario.hand.hero[0], scenario.hand.hero[1], ...scenario.hand.board] : []),
    [scenario]
  );

  return (
    <div className="mx-auto grid max-w-[1500px] gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      {/* Scenario */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between px-1">
          <div className="text-xs uppercase tracking-widest text-white/40">Training lab · scenario drills</div>
          <div className="chip-num text-xs text-white/40">
            streak <span className="text-emerald-200 font-bold">{streak}</span> · lifetime{" "}
            {stats.quizCorrect}/{stats.quizAttempts}
          </div>
        </div>

        {scenario ? (
          <div className="felt-surface relative overflow-hidden rounded-[2rem] px-6 py-7">
            <div className="flex flex-col items-center gap-5">
              <SpotReadout hand={scenario.hand} />

              <div className="flex gap-2">
                {[0, 1, 2, 3, 4].map((i) =>
                  scenario.hand.board[i] !== undefined ? (
                    <PlayingCard key={scenario.hand.board[i]} card={scenario.hand.board[i]} size="lg" index={i} />
                  ) : (
                    <CardSlot key={`slot-${i}`} size="lg" />
                  )
                )}
              </div>

              <div className="flex flex-col items-center gap-1.5">
                <div className="flex gap-2">
                  <PlayingCard card={scenario.hand.hero[0]} size="lg" index={0} />
                  <PlayingCard card={scenario.hand.hero[1]} size="lg" index={1} />
                </div>
                <span className="text-[10px] uppercase tracking-widest text-white/40">your hand</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass grid place-items-center rounded-2xl p-10">
            <button onClick={next} className="btn bg-emerald-glow/20 border border-emerald-glow/40 text-emerald-100">
              Deal a scenario
            </button>
          </div>
        )}

        {scenario && (
          <div className="glass rounded-2xl p-4">
            <RangeGrid
              range={scenario.hand.villainRange}
              dead={dead}
              combos={countCombos(scenario.hand.villainRange, dead)}
            />
          </div>
        )}
      </section>

      {/* Question + mastery */}
      <aside className="flex flex-col gap-4">
        {scenario && (
          <QuizCard
            key={scenario.key}
            quiz={scenario.quiz}
            onAnswer={(topic, correct) => {
              answerQuiz(topic, correct);
              setStreak((s) => (correct ? s + 1 : 0));
              next();
            }}
            onSkip={next}
          />
        )}

        <div className="glass rounded-2xl p-4">
          <div className="mb-2 text-sm font-semibold text-white/90">Topic mastery</div>
          <div className="space-y-2">
            {TOPICS.map((t) => {
              const m = mastery[t.id];
              const v = m?.ewma ?? 0;
              const attempts = m?.attempts ?? 0;
              return (
                <div key={t.id} title={t.blurb}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-white/70">{t.label}</span>
                    <span className="chip-num text-[10px] text-white/40">
                      {attempts > 0 ? `${Math.round(v * 100)}%` : "—"}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-glow to-cyan-glow"
                      style={{ width: `${Math.round(v * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}
