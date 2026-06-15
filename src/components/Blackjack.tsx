// Blackjack card-counting trainer.
//  - Deal real 6-deck hands; every decision is graded against perfect basic strategy.
//  - After each hand you're asked for the Hi-Lo running count.
//  - A bankroll + bet ramp teaches you to size your bet by the true count.
import { useRef, useState } from "react";
import { Card } from "../engine/cards";
import { PlayingCard } from "./PlayingCard";
import { useStore, BJ_UNIT } from "../store/useStore";
import {
  Shoe,
  newShoe,
  draw,
  needsShuffle,
  handTotal,
  isBlackjack,
  isPair,
  cardValue,
  basicStrategy,
  dealerShouldHit,
  settleHand,
  recommendedUnits,
  trueCount,
  decksRemaining,
  Move,
  MOVE_LABEL,
  Outcome,
} from "../engine/blackjack";

interface PlayerHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  done: boolean;
  splitAces: boolean;
  outcome?: Outcome;
  net?: number;
}

type Phase = "bet" | "act" | "count" | "done";

interface BJState {
  phase: Phase;
  dealer: Card[];
  hideHole: boolean;
  hands: PlayerHand[];
  active: number;
  bet: number;
  lastDecision?: { yours: Move; correct: Move; ok: boolean };
  shuffled?: boolean;
  countAtEnd: number;
  trueAtEnd: number;
  countFeedback?: { yours: number; actual: number; ok: boolean };
  banner?: string;
}

const BET_UNITS = [1, 2, 4, 6, 8, 12];

function fmt(n: number): string {
  return (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(0);
}

const OUTCOME_STYLE: Record<Outcome, { label: string; cls: string }> = {
  blackjack: { label: "BLACKJACK", cls: "text-amber-200 border-gold-glow/50 bg-gold-glow/10" },
  win: { label: "WIN", cls: "text-emerald-200 border-emerald-glow/50 bg-emerald-glow/10" },
  push: { label: "PUSH", cls: "text-white/70 border-white/20 bg-white/5" },
  lose: { label: "LOSE", cls: "text-rose-200 border-rose-400/50 bg-rose-500/10" },
};

export function Blackjack() {
  const bankroll = useStore((s) => s.bankroll);
  const bjStats = useStore((s) => s.bjStats);
  const addToBankroll = useStore((s) => s.bjAddToBankroll);
  const recordDecision = useStore((s) => s.bjRecordDecision);
  const recordCount = useStore((s) => s.bjRecordCount);
  const handPlayed = useStore((s) => s.bjHandPlayed);
  const bjReset = useStore((s) => s.bjReset);

  const shoeRef = useRef<Shoe>(newShoe());
  const [hint, setHint] = useState(false);
  const [countInput, setCountInput] = useState("");
  const tcNow = trueCount(shoeRef.current);
  const recUnits = recommendedUnits(tcNow);
  const [st, setSt] = useState<BJState>(() => ({
    phase: "bet",
    dealer: [],
    hideHole: true,
    hands: [],
    active: 0,
    bet: BJ_UNIT,
    countAtEnd: 0,
    trueAtEnd: 0,
  }));

  const totalStake = (hands: PlayerHand[]) => hands.reduce((a, h) => a + h.bet, 0);
  const affordable = (hands: PlayerHand[], extra: number) => totalStake(hands) + extra <= bankroll;

  // ---- deal ----
  function deal(bet: number) {
    let shoe = shoeRef.current;
    let shuffled = false;
    if (needsShuffle(shoe)) {
      shoe = newShoe();
      shoeRef.current = shoe;
      shuffled = true;
    }
    const p1 = draw(shoe);
    const up = draw(shoe);
    const p2 = draw(shoe);
    const hole = draw(shoe);
    const hand: PlayerHand = { cards: [p1, p2], bet, doubled: false, done: false, splitAces: false };
    const dealer = [up, hole];

    const playerBJ = isBlackjack(hand.cards);
    const dealerBJ = isBlackjack(dealer);
    setCountInput("");

    if (playerBJ || dealerBJ) {
      const r = settleHand(hand.cards, dealer, bet, playerBJ, dealerBJ);
      hand.done = true;
      hand.outcome = r.outcome;
      hand.net = r.net;
      addToBankroll(r.net);
      handPlayed();
      setSt({
        phase: "count",
        dealer,
        hideHole: false,
        hands: [hand],
        active: 0,
        bet,
        shuffled,
        countAtEnd: shoe.running,
        trueAtEnd: trueCount(shoe),
        banner: playerBJ && dealerBJ ? "Both blackjack — push." : playerBJ ? "Blackjack! Paid 3:2." : "Dealer blackjack.",
      });
      return;
    }

    setSt({
      phase: "act",
      dealer,
      hideHole: true,
      hands: [hand],
      active: 0,
      bet,
      shuffled,
      countAtEnd: 0,
      trueAtEnd: 0,
    });
  }

  // ---- player action ----
  function act(move: Move) {
    const shoe = shoeRef.current;
    const hands = st.hands.map((h) => ({ ...h, cards: [...h.cards] }));
    const active = st.active;
    const h = hands[active];

    const canDouble = h.cards.length === 2 && !h.splitAces && affordable(hands, h.bet);
    const canSplit = isPair(h.cards) && hands.length < 4 && !h.splitAces && affordable(hands, h.bet);
    const correct = basicStrategy(h.cards, st.dealer[0], { canDouble, canSplit });
    const ok = move === correct;
    recordDecision(ok);

    if (move === "H") {
      h.cards.push(draw(shoe));
      const t = handTotal(h.cards).total;
      if (t >= 21) h.done = true;
    } else if (move === "S") {
      h.done = true;
    } else if (move === "D") {
      addToBankroll(0); // stake settled at end
      h.bet *= 2;
      h.doubled = true;
      h.cards.push(draw(shoe));
      h.done = true;
    } else if (move === "P") {
      const [c1, c2] = h.cards;
      const aces = cardValue(c1) === 11;
      const h1: PlayerHand = { cards: [c1, draw(shoe)], bet: h.bet, doubled: false, done: aces, splitAces: aces };
      const h2: PlayerHand = { cards: [c2, draw(shoe)], bet: h.bet, doubled: false, done: aces, splitAces: aces };
      if (!aces) {
        if (handTotal(h1.cards).total >= 21) h1.done = true;
        if (handTotal(h2.cards).total >= 21) h2.done = true;
      }
      hands.splice(active, 1, h1, h2);
    }

    const next = hands.findIndex((hh) => !hh.done);
    const lastDecision = { yours: move, correct, ok };
    if (next === -1) {
      resolveDealer(hands, shoe, lastDecision);
    } else {
      setSt({ ...st, hands, active: next, lastDecision });
    }
  }

  function resolveDealer(hands: PlayerHand[], shoe: Shoe, lastDecision: BJState["lastDecision"]) {
    const dealer = [...st.dealer];
    const anyAlive = hands.some((h) => handTotal(h.cards).total <= 21);
    if (anyAlive) while (dealerShouldHit(dealer)) dealer.push(draw(shoe));

    let net = 0;
    const settled = hands.map((h) => {
      const r = settleHand(h.cards, dealer, h.bet, false, false);
      net += r.net;
      return { ...h, done: true, outcome: r.outcome, net: r.net };
    });
    addToBankroll(net);
    handPlayed();
    setSt({
      phase: "count",
      dealer,
      hideHole: false,
      hands: settled,
      active: 0,
      bet: st.bet,
      lastDecision,
      countAtEnd: shoe.running,
      trueAtEnd: trueCount(shoe),
    });
  }

  function submitCount() {
    const yours = parseInt(countInput, 10);
    if (Number.isNaN(yours)) return;
    const ok = yours === st.countAtEnd;
    recordCount(ok);
    setSt({ ...st, phase: "done", countFeedback: { yours, actual: st.countAtEnd, ok } });
  }

  function nextHand() {
    const tc = trueCount(shoeRef.current);
    const units = recommendedUnits(tc);
    const wanted = Math.min(units * BJ_UNIT, Math.max(BJ_UNIT, bankroll));
    setSt((s) => ({ ...s, phase: "bet", hands: [], dealer: [], bet: wanted, lastDecision: undefined, countFeedback: undefined, banner: undefined }));
    setCountInput("");
  }

  const netThisHand = st.hands.reduce((a, h) => a + (h.net ?? 0), 0);
  const bsPct = bjStats.bsTotal ? Math.round((bjStats.bsCorrect / bjStats.bsTotal) * 100) : 0;
  const ctPct = bjStats.countTotal ? Math.round((bjStats.countCorrect / bjStats.countTotal) * 100) : 0;

  return (
    <div className="mx-auto max-w-[1100px] p-5">
      {/* header strip */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-widest text-white/40">
          Blackjack · 6 decks · dealer stands soft 17 · Hi-Lo count
        </div>
        <div className="flex items-center gap-2.5">
          <Stat label="Bankroll" value={fmt(bankroll)} accent="#10B981" />
          <Stat label="Strategy" value={`${bsPct}%`} sub={`${bjStats.bsCorrect}/${bjStats.bsTotal}`} accent="#22D3EE" />
          <Stat label="Count" value={`${ctPct}%`} sub={`${bjStats.countCorrect}/${bjStats.countTotal}`} accent="#8B5CF6" />
          <button onClick={bjReset} className="rounded-full border border-white/10 bg-ink-800/80 px-3 py-1.5 text-[11px] text-white/45 hover:text-white/80">
            Reset
          </button>
        </div>
      </div>

      <div className="felt-surface relative overflow-hidden rounded-[2rem] px-6 py-7">
        {st.shuffled && st.phase !== "bet" && (
          <div className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wider text-amber-200/80">
            ♻ New shoe shuffled — count reset to 0
          </div>
        )}

        {/* Dealer */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-white/40">
            Dealer{!st.hideHole && st.dealer.length > 0 && ` · ${handTotal(st.dealer).total}`}
          </span>
          <div className="flex gap-2">
            {st.dealer.length === 0 ? (
              <>
                <PlayingCard faceDown size="md" index={0} />
                <PlayingCard faceDown size="md" index={1} />
              </>
            ) : (
              st.dealer.map((c, i) =>
                i === 1 && st.hideHole ? (
                  <PlayingCard key="hole" faceDown size="md" index={i} />
                ) : (
                  <PlayingCard key={`${c}-${i}`} card={c} size="md" index={i} />
                )
              )
            )}
          </div>
        </div>

        {/* Player hands */}
        <div className="mt-7 flex flex-wrap items-start justify-center gap-6">
          {st.hands.length === 0 ? (
            <div className="text-sm text-white/40">Place your bet to deal.</div>
          ) : (
            st.hands.map((h, i) => (
              <HandView key={i} hand={h} active={st.phase === "act" && i === st.active} showOutcome={st.phase === "count" || st.phase === "done"} />
            ))
          )}
        </div>

        {/* Net result */}
        {(st.phase === "count" || st.phase === "done") && (
          <div className="mt-5 text-center">
            {st.banner && <div className="mb-1 text-sm font-semibold text-white/80">{st.banner}</div>}
            <span className={`chip-num text-lg font-bold ${netThisHand > 0 ? "text-emerald-200" : netThisHand < 0 ? "text-rose-200" : "text-white/70"}`}>
              {netThisHand >= 0 ? "+" : ""}
              {fmt(netThisHand)}
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="glass mt-4 rounded-2xl p-4">
        {st.phase === "bet" && <BetControls bankroll={bankroll} tc={tcNow} recUnits={recUnits} bet={st.bet} onDeal={deal} hint={hint} setHint={setHint} />}

        {st.phase === "act" && (
          <ActControls
            state={st}
            hint={hint}
            setHint={setHint}
            canDouble={st.hands[st.active].cards.length === 2 && !st.hands[st.active].splitAces && affordable(st.hands, st.hands[st.active].bet)}
            canSplit={isPair(st.hands[st.active].cards) && st.hands.length < 4 && !st.hands[st.active].splitAces && affordable(st.hands, st.hands[st.active].bet)}
            onAct={act}
          />
        )}

        {st.phase === "count" && (
          <CountQuiz value={countInput} setValue={setCountInput} onSubmit={submitCount} />
        )}

        {st.phase === "done" && st.countFeedback && (
          <CountResult fb={st.countFeedback} trueCount={st.trueAtEnd} decksLeft={decksRemaining(shoeRef.current)} onNext={nextHand} />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-ink-800/70 px-3 py-1.5 text-center">
      <div className="chip-num text-sm font-bold" style={{ color: accent }}>
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-wide text-white/40">
        {label}
        {sub ? ` · ${sub}` : ""}
      </div>
    </div>
  );
}

function HandView({ hand, active, showOutcome }: { hand: PlayerHand; active: boolean; showOutcome: boolean }) {
  const { total, soft } = handTotal(hand.cards);
  const bust = total > 21;
  return (
    <div className={`flex flex-col items-center gap-2 rounded-2xl border p-3 transition ${active ? "border-emerald-glow/60 bg-emerald-glow/5 shadow-glow" : "border-transparent"}`}>
      <div className="flex gap-2">
        {hand.cards.map((c, i) => (
          <PlayingCard key={`${c}-${i}`} card={c} size="md" index={i} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className={`chip-num text-sm font-bold ${bust ? "text-rose-300" : "text-white/85"}`}>
          {bust ? "BUST" : soft && total < 21 ? `${total - 10}/${total}` : total}
        </span>
        <span className="chip-num text-[10px] text-white/40">{fmt(hand.bet)}{hand.doubled ? " ⋅2" : ""}</span>
      </div>
      {showOutcome && hand.outcome && (
        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${OUTCOME_STYLE[hand.outcome].cls}`}>
          {OUTCOME_STYLE[hand.outcome].label}
        </span>
      )}
    </div>
  );
}

function BetControls({
  bankroll,
  tc,
  recUnits,
  bet,
  onDeal,
  hint,
  setHint,
}: {
  bankroll: number;
  tc: number;
  recUnits: number;
  bet: number;
  onDeal: (bet: number) => void;
  hint: boolean;
  setHint: (v: boolean) => void;
}) {
  const [chosen, setChosen] = useState(bet);
  const tcLabel = tc >= 0 ? `+${tc.toFixed(1)}` : tc.toFixed(1);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-white/70">
          True count <span className="chip-num font-bold text-cyan-200">{tcLabel}</span> → bet ramp says{" "}
          <span className="font-bold text-emerald-200">{recUnits} unit{recUnits > 1 ? "s" : ""}</span> ({fmt(recUnits * BJ_UNIT)})
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-white/50">
          <input type="checkbox" checked={hint} onChange={(e) => setHint(e.target.checked)} /> strategy hints
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {BET_UNITS.map((u) => {
          const amt = u * BJ_UNIT;
          const rec = u === recUnits;
          const disabled = amt > bankroll;
          return (
            <button
              key={u}
              disabled={disabled}
              onClick={() => setChosen(amt)}
              className={`btn min-w-[4.5rem] flex-col border !py-2 ${
                chosen === amt
                  ? "border-emerald-glow/60 bg-emerald-glow/15 text-emerald-100"
                  : "border-white/10 bg-ink-800/70 text-white/60 hover:text-white"
              } ${disabled ? "opacity-30" : ""}`}
            >
              <span className="text-sm font-bold">{fmt(amt)}</span>
              <span className="text-[9px] uppercase tracking-wide text-white/40">{u}u{rec ? " ★" : ""}</span>
            </button>
          );
        })}
      </div>
      <button
        onClick={() => onDeal(Math.min(chosen, Math.max(BJ_UNIT, bankroll)))}
        className="btn bg-gradient-to-r from-emerald-glow to-cyan-glow font-bold text-ink-900"
      >
        Deal — bet {fmt(chosen)}
      </button>
    </div>
  );
}

function ActControls({
  state,
  hint,
  setHint,
  canDouble,
  canSplit,
  onAct,
}: {
  state: BJState;
  hint: boolean;
  setHint: (v: boolean) => void;
  canDouble: boolean;
  canSplit: boolean;
  onAct: (m: Move) => void;
}) {
  const h = state.hands[state.active];
  const correct = basicStrategy(h.cards, state.dealer[0], { canDouble, canSplit });
  const moves: Move[] = ["H", "S"];
  if (canDouble) moves.push("D");
  if (canSplit) moves.push("P");
  return (
    <div className="flex flex-col gap-3">
      {state.lastDecision && (
        <div className={`rounded-lg border px-3 py-2 text-xs ${state.lastDecision.ok ? "border-emerald-glow/40 bg-emerald-glow/10 text-emerald-200" : "border-rose-400/40 bg-rose-500/10 text-rose-200"}`}>
          {state.lastDecision.ok
            ? `✓ ${MOVE_LABEL[state.lastDecision.yours]} — correct basic strategy.`
            : `✗ You chose ${MOVE_LABEL[state.lastDecision.yours]}; basic strategy is ${MOVE_LABEL[state.lastDecision.correct]}.`}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {moves.map((m) => (
            <button
              key={m}
              onClick={() => onAct(m)}
              className={`btn min-w-[5rem] border ${
                hint && m === correct
                  ? "border-emerald-glow/60 bg-emerald-glow/20 text-emerald-100"
                  : "border-white/10 bg-ink-800/70 text-white/80 hover:bg-white/10"
              }`}
            >
              {MOVE_LABEL[m]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-white/50">
          <input type="checkbox" checked={hint} onChange={(e) => setHint(e.target.checked)} /> strategy hints
        </label>
      </div>
      {hint && <div className="text-[11px] text-white/40">Hint: basic strategy says <span className="font-bold text-emerald-200">{MOVE_LABEL[correct]}</span>.</div>}
    </div>
  );
}

function CountQuiz({ value, setValue, onSubmit }: { value: string; setValue: (v: string) => void; onSubmit: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-semibold text-white/85">What's the running count now?</div>
      <div className="text-[11px] text-white/45">Hi-Lo: 2–6 = +1 · 7–9 = 0 · 10–A = −1. Count every card dealt this shoe.</div>
      <div className="flex gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^-0-9]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          inputMode="numeric"
          placeholder="e.g. -2"
          className="chip-num w-28 rounded-lg border border-white/15 bg-ink-900/60 px-3 py-2 text-center text-lg font-bold text-white outline-none focus:border-cyan-glow/60"
        />
        <button onClick={onSubmit} className="btn bg-violet-glow/20 border border-violet-glow/40 text-violet-100">
          Submit count
        </button>
      </div>
    </div>
  );
}

function CountResult({
  fb,
  trueCount: tc,
  decksLeft,
  onNext,
}: {
  fb: { yours: number; actual: number; ok: boolean };
  trueCount: number;
  decksLeft: number;
  onNext: () => void;
}) {
  const units = recommendedUnits(tc);
  const tcLabel = tc >= 0 ? `+${tc.toFixed(1)}` : tc.toFixed(1);
  return (
    <div className="flex flex-col gap-3">
      <div className={`rounded-lg border px-3 py-2 text-sm ${fb.ok ? "border-emerald-glow/40 bg-emerald-glow/10 text-emerald-200" : "border-rose-400/40 bg-rose-500/10 text-rose-200"}`}>
        {fb.ok ? (
          <>✓ Running count is <b>{fb.actual >= 0 ? `+${fb.actual}` : fb.actual}</b> — correct.</>
        ) : (
          <>✗ You said {fb.yours >= 0 ? `+${fb.yours}` : fb.yours}; running count is <b>{fb.actual >= 0 ? `+${fb.actual}` : fb.actual}</b>.</>
        )}
      </div>
      <div className="text-sm text-white/70">
        True count = running ÷ {decksLeft.toFixed(1)} decks ≈ <span className="chip-num font-bold text-cyan-200">{tcLabel}</span> →
        next bet <span className="font-bold text-emerald-200">{units} unit{units > 1 ? "s" : ""}</span> ({fmt(units * BJ_UNIT)}).
      </div>
      <button onClick={onNext} className="btn bg-gradient-to-r from-emerald-glow to-cyan-glow font-bold text-ink-900">
        Next hand →
      </button>
    </div>
  );
}
