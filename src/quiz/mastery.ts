// Per-topic mastery + weak-topic-weighted selection (lightweight spaced repetition).
import { TopicId } from "./topics";

export interface TopicMastery {
  attempts: number;
  correct: number;
  ewma: number; // exponentially-weighted recent correctness, 0..1
}

export function emptyMastery(): TopicMastery {
  return { attempts: 0, correct: 0, ewma: 0.35 }; // unseen topics start "weak" so they surface
}

export function updateMastery(m: TopicMastery, correct: boolean): TopicMastery {
  const ALPHA = 0.3;
  return {
    attempts: m.attempts + 1,
    correct: m.correct + (correct ? 1 : 0),
    ewma: (1 - ALPHA) * m.ewma + ALPHA * (correct ? 1 : 0),
  };
}

export function masteryScore(m: TopicMastery | undefined): number {
  return m ? m.ewma : emptyMastery().ewma;
}

// Pick a topic, weighting toward weaker mastery. Weakest topics get sampled most.
export function pickWeakTopic(
  applicable: TopicId[],
  mastery: Partial<Record<TopicId, TopicMastery>>,
  rng: () => number = Math.random
): TopicId | null {
  if (applicable.length === 0) return null;
  const weights = applicable.map((id) => {
    const s = masteryScore(mastery[id]);
    return 0.12 + (1 - s); // even mastered topics retain a small chance
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let x = rng() * total;
  for (let i = 0; i < applicable.length; i++) {
    x -= weights[i];
    if (x <= 0) return applicable[i];
  }
  return applicable[applicable.length - 1];
}
