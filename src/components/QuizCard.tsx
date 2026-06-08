import { useState } from "react";
import { motion } from "framer-motion";
import { Quiz, fmtAnswer, Unit } from "../quiz/questions";
import { TopicId } from "../quiz/topics";
import { TOPIC_LABEL } from "../quiz/topics";

function tol(unit: Unit, base: number): number {
  if (unit === "combos") return 0.5;
  if (unit === "%") return Math.max(2, base);
  return 0.6;
}

function StepInput({
  answer,
  unit,
  onResolve,
}: {
  answer: number;
  unit: Unit;
  onResolve: (correct: boolean) => void;
}) {
  const [val, setVal] = useState("");
  const [state, setState] = useState<"idle" | "right" | "wrong">("idle");

  const check = () => {
    const n = parseFloat(val);
    if (isNaN(n)) return;
    const ok = Math.abs(n - answer) <= tol(unit, 1.5);
    setState(ok ? "right" : "wrong");
  };

  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        type="number"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && check()}
        placeholder="?"
        className="chip-num w-20 rounded-lg bg-ink-900 border border-white/10 px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-glow/50"
      />
      <span className="text-xs text-white/40">{unit === "combos" ? "combos" : unit}</span>
      {state === "idle" ? (
        <button onClick={check} className="btn !py-1.5 !px-3 bg-white/5 border border-white/10 text-white/80 text-xs">
          Check
        </button>
      ) : state === "right" ? (
        <button onClick={() => onResolve(true)} className="btn !py-1.5 !px-3 bg-emerald-glow/20 border border-emerald-glow/40 text-emerald-100 text-xs">
          ✓ Next
        </button>
      ) : (
        <button onClick={() => onResolve(false)} className="btn !py-1.5 !px-3 bg-rose-500/15 border border-rose-400/30 text-rose-100 text-xs">
          It's {fmtAnswer(answer, unit)} · Next
        </button>
      )}
    </div>
  );
}

export function QuizCard({
  quiz,
  onAnswer,
  onSkip,
}: {
  quiz: Quiz;
  onAnswer: (topic: TopicId, correct: boolean) => void;
  onSkip: () => void;
}) {
  const [showSteps, setShowSteps] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [mainVal, setMainVal] = useState("");
  const [graded, setGraded] = useState<null | boolean>(null);

  const submitMain = () => {
    const n = parseFloat(mainVal);
    if (isNaN(n)) return;
    setGraded(Math.abs(n - quiz.answer) <= quiz.tolerance);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="rounded-2xl border border-violet-glow/30 bg-gradient-to-b from-violet-glow/10 to-ink-800/80 p-4 shadow-glow-violet"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-violet-glow animate-pulseGlow" />
          <span className="text-xs font-bold uppercase tracking-wider text-violet-200">
            Test yourself · {TOPIC_LABEL[quiz.topic]}
          </span>
        </div>
        <button onClick={onSkip} className="text-xs text-white/40 hover:text-white/70">
          skip
        </button>
      </div>

      <p className="mt-2 text-sm font-medium leading-relaxed text-white/90">{quiz.prompt}</p>

      {graded === null && (
        <>
          {!showSteps && (
            <button
              onClick={() => setShowSteps(true)}
              className="mt-2 text-xs font-semibold text-cyan-200/90 hover:text-cyan-100"
            >
              Walk me through it →
            </button>
          )}

          {showSteps && (
            <div className="mt-3 space-y-3 border-l-2 border-violet-glow/30 pl-3">
              {quiz.steps.slice(0, stepIdx + 1).map((step, i) => (
                <div key={i} className={i < stepIdx ? "opacity-50" : ""}>
                  <p className="text-xs leading-relaxed text-white/75">{step.prompt}</p>
                  {i === stepIdx &&
                    (step.answer !== undefined ? (
                      <StepInput
                        answer={step.answer}
                        unit={step.unit ?? "combos"}
                        onResolve={() => setStepIdx((s) => s + 1)}
                      />
                    ) : (
                      <button
                        onClick={() => setStepIdx((s) => s + 1)}
                        className="btn mt-1.5 !py-1 !px-3 bg-white/5 border border-white/10 text-white/80 text-xs"
                      >
                        Got it →
                      </button>
                    ))}
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              value={mainVal}
              onChange={(e) => setMainVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitMain()}
              placeholder="your answer"
              className="chip-num w-28 rounded-lg bg-ink-900 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-violet-glow/60"
            />
            <span className="text-xs text-white/40">{quiz.unit === "combos" ? "combos" : quiz.unit}</span>
            <button
              onClick={submitMain}
              className="btn !py-2 bg-violet-glow/25 border border-violet-glow/50 text-violet-50"
            >
              Submit
            </button>
          </div>
        </>
      )}

      {graded !== null && (
        <div className="mt-3">
          <div
            className={`rounded-lg border px-3 py-2 ${
              graded
                ? "border-emerald-glow/40 bg-emerald-glow/10 text-emerald-100"
                : "border-rose-400/40 bg-rose-500/10 text-rose-100"
            }`}
          >
            <div className="text-sm font-bold">
              {graded ? "Correct!" : `Answer: ${fmtAnswer(quiz.answer, quiz.unit)}`}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-white/70">{quiz.explanation}</p>
          </div>
          <button
            onClick={() => onAnswer(quiz.topic, graded)}
            className="btn mt-2 w-full bg-white/5 border border-white/10 text-white/80"
          >
            Continue
          </button>
        </div>
      )}
    </motion.div>
  );
}
