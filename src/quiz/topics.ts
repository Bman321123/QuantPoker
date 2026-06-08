// The concept taxonomy the trainer tests and tracks mastery on.
// Coverage mirrors the quantitative fundamentals of modern GTO theory.
export type TopicId =
  | "combos_suited"
  | "combos_total"
  | "combos_pairs"
  | "class_count"
  | "pot_odds"
  | "mdf"
  | "alpha"
  | "equity";

export interface Topic {
  id: TopicId;
  label: string;
  blurb: string;
}

export const TOPICS: Topic[] = [
  { id: "combos_suited", label: "Suited combos", blurb: "Counting suited holdings in a range, after blockers." },
  { id: "combos_total", label: "Total combos", blurb: "Summing pair + suited + offsuit combos in a range." },
  { id: "combos_pairs", label: "Pair combos", blurb: "Counting pocket-pair combos, before and after blockers." },
  { id: "class_count", label: "Blockers", blurb: "How many combos of a specific hand remain given dead cards." },
  { id: "pot_odds", label: "Pot odds", blurb: "Break-even equity needed to call a bet." },
  { id: "mdf", label: "MDF", blurb: "Minimum defense frequency vs a bet." },
  { id: "alpha", label: "Alpha / fold equity", blurb: "Required fold equity for a bluff to break even." },
  { id: "equity", label: "Equity", blurb: "Estimating your share of the pot vs a range." },
];

export const TOPIC_LABEL: Record<TopicId, string> = TOPICS.reduce(
  (m, t) => ((m[t.id] = t.label), m),
  {} as Record<TopicId, string>
);
