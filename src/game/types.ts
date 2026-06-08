import { Card } from "../engine/cards";
import { Combo, Range, ComboCounts } from "../engine/combos";
import { Candidate, EVResult } from "../engine/ev";
import { CoachContext, Street, Tone } from "../engine/coach";
import { QuizContext } from "../quiz/questions";

export type { Street };

export interface HandResult {
  heroDelta: number; // chips won/lost this hand (bb)
  showdown: boolean; // true if decided at showdown, false if ended by a fold
  wonByFold: boolean;
  heroWon: boolean | "split";
  reason: string;
  villainCombo: Combo;
  board: Card[]; // final 5-card board (run out even on a fold)
  heroHandLabel: string;
  villainHandLabel: string;
  showdownWinner: "hero" | "villain" | "split"; // who'd win at showdown on this runout
}

export interface HandState {
  id: string;
  street: Street;
  board: Card[];
  pot: number;
  heroStack: number;
  villainStack: number;
  hero: Combo;
  villain: Combo; // hidden from UI until showdown
  villainRange: Range; // current narrowed range
  toCall: number;
  betInPlay?: number;
  potBeforeBet?: number;
  heroInPosition: boolean;
  villainChecked: boolean; // villain has checked to hero this street
  awaiting: "hero" | "done";
  log: string[];
  result?: HandResult;
}

export interface DecisionView {
  candidates: Candidate[];
  evResult: EVResult;
  equity: number;
  combos: ComboCounts;
  facingBet: boolean;
  coachCtx: CoachContext;
  quizCtx: QuizContext;
}

export interface DecisionRecord {
  handId: string;
  street: Street;
  actionLabel: string;
  bestLabel: string;
  evLoss: number;
  equity: number;
  tone: Tone;
  matchedBest: boolean;
}
