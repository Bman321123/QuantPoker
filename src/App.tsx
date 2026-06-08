import { useEffect, useState } from "react";
import { useStore } from "./store/useStore";
import { TopBar } from "./components/TopBar";
import { Table } from "./components/Table";
import { ActionBar } from "./components/ActionBar";
import { CoachPanel } from "./components/CoachPanel";
import { RangeGrid } from "./components/RangeGrid";
import { QuizCard } from "./components/QuizCard";
import { Dashboard } from "./components/Dashboard";
import { Onboarding } from "./components/Onboarding";
import { countCombos } from "./engine/combos";

export default function App() {
  const {
    onboarded,
    finishOnboarding,
    hand,
    decision,
    lastVerdict,
    level,
    quiz,
    screen,
    setScreen,
    startHand,
    act,
    nextHand,
    answerQuiz,
    skipQuiz,
  } = useStore();

  const [rangeOpen, setRangeOpen] = useState(true);

  useEffect(() => {
    if (onboarded && !hand) startHand();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboarded]);

  if (!onboarded) {
    return (
      <Onboarding
        onStart={() => {
          finishOnboarding();
          startHand();
        }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar />

      {screen === "dashboard" ? (
        <div className="flex-1 overflow-auto">
          <Dashboard />
        </div>
      ) : !hand ? (
        <div className="grid flex-1 place-items-center">
          <button onClick={startHand} className="btn bg-emerald-glow/20 border border-emerald-glow/40 text-emerald-100">
            Deal a hand
          </button>
        </div>
      ) : (
        <main className="flex-1 overflow-auto">
          <div className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[1fr_360px]">
            <section className="flex flex-col gap-4">
              <div className="flex items-center justify-between px-1">
                <div className="text-xs uppercase tracking-widest text-white/40">
                  {hand.street} · 100bb deep · BTN vs BB
                </div>
                <div className="chip-num text-xs text-white/30">{hand.id.split("_")[0]}</div>
              </div>

              <Table hand={hand} />

              <div className="glass rounded-2xl p-4">
                {hand.awaiting === "hero" && decision ? (
                  <ActionBar decision={decision} onAct={act} />
                ) : hand.awaiting === "done" ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={nextHand}
                      className="btn bg-gradient-to-r from-emerald-glow to-cyan-glow text-ink-900 font-bold"
                    >
                      Next hand →
                    </button>
                    <button
                      onClick={() => setScreen("dashboard")}
                      className="btn bg-white/5 border border-white/10 text-white/70"
                    >
                      View progress
                    </button>
                  </div>
                ) : null}
              </div>
            </section>

            <aside className="flex flex-col gap-4">
              {quiz && <QuizCard quiz={quiz} onAnswer={answerQuiz} onSkip={skipQuiz} />}

              <div className="glass rounded-2xl p-4">
                <CoachPanel decision={decision} verdict={lastVerdict} level={level} hand={hand} />
              </div>

              <div className="glass rounded-2xl p-4">
                <button
                  onClick={() => setRangeOpen((o) => !o)}
                  className="mb-1 flex w-full items-center justify-between text-sm font-semibold text-white/90"
                >
                  <span>Range explorer</span>
                  <span className="text-white/40">{rangeOpen ? "▾" : "▸"}</span>
                </button>
                {rangeOpen && (
                  <RangeGrid
                    range={hand.villainRange}
                    dead={[hand.hero[0], hand.hero[1], ...hand.board]}
                    combos={
                      decision
                        ? decision.combos
                        : countCombos(hand.villainRange, [hand.hero[0], hand.hero[1], ...hand.board])
                    }
                  />
                )}
              </div>
            </aside>
          </div>
        </main>
      )}
    </div>
  );
}
