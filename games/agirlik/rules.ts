// Ağırlık Kapışması: a ladder of stages for 2 to 4, climbed side by side. A stage is a number of taps: get that many
// in before the time is up and you are on the next one.
//   - The ladder is drawn when the meet starts: the first stage asks for a number of taps picked at random, and
//     every stage after it a few more (picked at random too), and more of them the higher it goes. Each tap is
//     2.5 kg on the bar.
//   - Everyone lifts at the same time, each at the stage they are on. Make it and you go up; miss it and it costs
//     one of three lives, and the same stage comes again.
//   - Out of lives, out of the meet. The last lifter still in wins; so does whoever clears the top of the ladder.
//   - Taps on a bar that was missed decide nothing. Level on stages, whoever got to theirs first is ahead: in an
//     earlier round, or in the same round with an earlier lockout.
//   - Once a meet you may chalk up before a bar: it asks you for a tenth fewer taps.
// The screen records when each tap came and sends the taps in small batches while the lift is on, so everyone sees
// everyone's count climb; the rules count them, and the table's clock keeps them honest.
import { defineRules, refuse, type Ctx } from '@kampuse/games-kit/rules'

/** Misses a lifter may have: the next one puts them out. */
export const LIVES = 3
export const CHALKS = 1
/** The lift: this long to get every tap in. */
export const LIFT_MS = 5000
/** The first stage asks for a number of taps from this range; every stage after it a few more, from STEP. */
export const FIRST = { min: 10, max: 14 }
export const STEP = { min: 3, max: 5 }
/**
 * The ladder gets steeper as it climbs: on top of the dice, each step up adds this many taps more. The first stages
 * are a warm-up anyone makes; the last ones are past what two thumbs do, so a meet ends on the ladder, not at its top.
 */
export const GROW = [0, 0, 1, 1, 2, 3, 4, 5, 5]
/** The rungs of the ladder: whoever clears the last has won. */
export const STAGES = GROW.length + 1
/** What a tap is worth on the bar: a stage of 40 taps weighs 100 kg. */
export const KG_PER_TAP = 2.5
const CHALK_EASE = 0.9
/**
 * What hands can do: no more than this many taps in any stretch this long. Two thumbs landing together are two
 * taps; sixteen a second, kept up, is more than two thumbs manage.
 */
export const BURST = { taps: 4, ms: 250 }
/** And no lift has more taps than this. */
export const MAX_TAPS = 100
/**
 * A lift is closed for good this long after its bar went on (the count, the lift and some slack): a batch that
 * reaches the table later ends that lifter's go, whatever it says. Nobody can hold a round open.
 */
export const CLOSES_MS = 15_000
/**
 * Every screen counts a bar in before the lift starts, and never for less than this. So a tap can't be older than the
 * time since the bar went on, less this: nobody gets to the bar before the count is over.
 */
export const COUNT_MS = 2500
/**
 * Stand-in lifts, in taps a second: what a bot plays, since a bot moves the moment the bar goes on and has no hands
 * to tap with. Slow on purpose: the best of them stops halfway up the ladder, so standing in is never worth more
 * than lifting.
 */
export const PACES = [3, 5, 7]
/** The fastest hands are measured over at least this many taps: a real stretch, not two lucky ones. */
const RATE_TAPS = 8

/**
 * What a phone sends, again and again while the lift is on: the taps since its last batch (ms from the start of its
 * lift), for the bar of `round`. `chalk` goes with the first batch; `done` with the last.
 */
export type Batch = { round: number; taps: number[]; chalk?: true; done?: true }
/** A whole lift at one of PACES, for a seat with no hands. */
export type StandIn = { round: number; pace: number; chalk?: true }
export type Move = Batch | StandIn

/** One lifter's go at their bar this round, as it stands. */
export type Lift = { taps: number[]; chalk: boolean; need: number; lockedAt: number | null; done: boolean }
/** The same without the taps themselves: what everyone may see while it happens. */
export type LiftView = { chalk: boolean; need: number; count: number; lockedAt: number | null; done: boolean }

export type Lifter = {
  chalk: number
  /** Stages cleared: the bar they face next is that rung of the ladder. */
  stage: number
  lives: number
  /** Out of lives: out of the meet. */
  out: boolean
  /** Left the table. */
  gone: boolean
  /** When they got to the stage they are on: the round, and how far into that lift the bar locked out (ms). */
  reached: { round: number; at: number } | null
  /** Stages made on the last life, and the fastest hands so far (taps a second over a lift): for the end card. */
  clutch: number
  rate: number
}

/** A lifter's bar in a finished round: the stage it was, the taps they got in of how many, and what it left them with. */
export type Result = { side: number; stage: number; ok: boolean; count: number; need: number; at: number; chalk: boolean; lives: number; out: boolean }
export type Round = { n: number; round: number; results: Result[] }

export type State = {
  /** Rounds lifted so far: the number every batch carries. */
  round: number
  /** The taps each stage asks for, bottom to top. */
  ladder: number[]
  lifters: Lifter[]
  lifts: Lift[]
  /** When this round's bars went on the platform (ctx.now): no tap can be later than the time since. */
  openedAt: number
  last: Round | null
  winners: number[] | null
}

export type View = Omit<State, 'lifts' | 'openedAt'> & { lifts: LiftView[] }

export const kgOf = (taps: number): number => taps * KG_PER_TAP
/** The taps a bar asks of a lifter: a tenth fewer with chalk on the hands. */
export const needWith = (need: number, chalk: boolean): number => (chalk ? Math.ceil(need * CHALK_EASE) : need)
/** Whether a tap at `at` counts on top of these: in time, in order, and no faster than hands are. */
export function counts(taps: number[], at: number): boolean {
  const last = taps[taps.length - 1]
  if (at > LIFT_MS || (last !== undefined && at < last)) return false
  return taps.length < BURST.taps || at - taps[taps.length - BURST.taps] >= BURST.ms
}
/**
 * Who stands higher (negative: `a`): more stages; level on those, whoever got there in an earlier round; in the
 * same round, whoever locked it out sooner. Zero: level on all of it.
 */
export function ahead(a: Lifter, b: Lifter): number {
  if (a.stage !== b.stage) return b.stage - a.stage
  if (!a.reached || !b.reached) return 0
  return a.reached.round - b.reached.round || a.reached.at - b.reached.at
}

/** A whole number from a range, drawn with the table's own dice. */
const draw = (range: { min: number; max: number }, ctx: Ctx) => range.min + Math.floor(ctx.random() * (range.max - range.min + 1))
const rung = (state: State, stage: number) => state.ladder[Math.min(stage, STAGES - 1)]
const fresh = (need: number, done = false): Lift => ({ taps: [], chalk: false, need, lockedAt: null, done })
/** Still at the table; and of those, still with a life. */
const present = (state: State) => state.lifters.flatMap((l, side) => (l.gone ? [] : [side]))
const inPlay = (state: State) => present(state).filter((side) => !state.lifters[side].out)
const lifting = (state: State) => (state.winners ? [] : inPlay(state).filter((side) => !state.lifts[side].done))

/** Taps a second over a lift, to one decimal (0 when there were too few to say). */
function rateOf(taps: number[]): number {
  const span = taps.length >= RATE_TAPS ? taps[taps.length - 1] - taps[0] : 0
  return span > 0 ? Math.round(((taps.length - 1) / span) * 10_000) / 10 : 0
}

/**
 * Whether the meet is settled: the top of the ladder was cleared, or nobody is lifting any more, or one lifter is,
 * and stands higher than everyone who is not (which is how it goes unless somebody was put out without three misses).
 */
function decided(state: State): boolean {
  const here = present(state)
  const playing = inPlay(state)
  if (here.length <= 1 || !playing.length) return true
  if (here.some((side) => state.lifters[side].stage >= STAGES)) return true
  const [last] = playing
  return playing.length === 1 && here.every((side) => side === last || ahead(state.lifters[last], state.lifters[side]) < 0)
}

/** The meet is over: whoever stands highest of those still at the table wins (everyone level is a draw). */
function end(state: State): State {
  const here = present(state)
  const top = here.filter((a) => here.every((b) => ahead(state.lifters[a], state.lifters[b]) <= 0))
  state.winners = top.length === here.length && here.length > 1 ? [] : top
  return state
}

/** Everyone still in has finished their bar: up a stage or down a life, and then the next round (or the end). */
function resolve(state: State, ctx: Ctx): State {
  const results = inPlay(state).map((side): Result => {
    const lifter = state.lifters[side]
    const lift = state.lifts[side]
    const ok = lift.lockedAt !== null
    const count = Math.min(lift.taps.length, lift.need)
    const stage = lifter.stage
    lifter.rate = Math.max(lifter.rate, rateOf(lift.taps))
    if (lift.lockedAt !== null) {
      if (lifter.lives === 1) lifter.clutch++
      lifter.stage++
      lifter.reached = { round: state.round, at: lift.lockedAt }
    } else {
      lifter.lives--
      lifter.out = lifter.lives <= 0
    }
    return { side, stage, ok, count, need: lift.need, at: lift.lockedAt ?? lift.taps[count - 1] ?? 0, chalk: lift.chalk, lives: lifter.lives, out: lifter.out }
  })
  state.last = { n: (state.last?.n ?? 0) + 1, round: state.round, results }
  if (decided(state)) return end(state)
  state.round++
  state.lifts = state.lifters.map((l) => fresh(rung(state, l.stage), l.out || l.gone))
  state.openedAt = ctx.now
  return state
}

/** A lifter's go at this bar is over (locked out, out of time, or they said so): maybe the round is too. */
function finish(state: State, side: number, ctx: Ctx): State {
  state.lifts[side].done = true
  return lifting(state).length ? state : resolve(state, ctx)
}

const KEYS = ['round', 'taps', 'pace', 'chalk', 'done']
const inOrder = (t: unknown, i: number, all: unknown[]) => typeof t === 'number' && Number.isInteger(t) && t >= 0 && (i === 0 || t >= (all[i - 1] as number))

/** A move from a phone (or a bot), checked: null when fine, or why not. */
function check(state: State, side: number, m: Record<string, unknown>): string | null {
  if (Object.keys(m).some((k) => !KEYS.includes(k))) return 'Tap to lift.'
  if (m.round !== state.round) return 'That bar is over.'
  if ((m.chalk !== undefined && m.chalk !== true) || (m.done !== undefined && m.done !== true)) return 'Tap to lift.'
  const lift = state.lifts[side]
  if (m.pace !== undefined) {
    // A stand-in lift is the whole lift: one of the paces, nothing with it, and only on a bar nobody has touched.
    if (m.taps !== undefined || m.done !== undefined || !PACES.includes(m.pace as number) || lift.taps.length) return 'Tap to lift.'
  } else {
    const taps = m.taps
    if (!Array.isArray(taps) || taps.length > MAX_TAPS || !taps.every(inOrder)) return 'Tap to lift.'
    // A batch has something in it: taps, or the word that the lift is over.
    if (!taps.length && !m.done) return 'Tap to lift.'
  }
  if (m.chalk && lift.taps.length) return 'Chalk up before the bar moves.'
  if (m.chalk && !lift.chalk && state.lifters[side].chalk <= 0) return 'No chalk left.'
  return null
}

/** The batch's taps join the lift: only those hands could have made, and none later than the table's clock allows. */
function add(lift: Lift, taps: number[], latest: number): void {
  for (const at of taps) {
    if (at > latest || lift.taps.length >= MAX_TAPS) break
    if (counts(lift.taps, at)) lift.taps.push(at)
  }
  // The bar locks out with the tap that completes it.
  lift.lockedAt = lift.taps.length >= lift.need ? lift.taps[lift.need - 1] : null
}

/** Steady hands: `rate` taps a second, evenly spaced over the whole lift. */
const steady = (rate: number) => Array.from({ length: Math.floor((LIFT_MS / 1000) * rate) }, (_, i) => Math.round(((i + 1) * 1000) / rate))

export default defineRules<State, Move, View>({
  setup(ctx) {
    const ladder = [draw(FIRST, ctx)]
    for (const more of GROW) ladder.push(ladder[ladder.length - 1] + draw(STEP, ctx) + more)
    const lifter = (): Lifter => ({ chalk: CHALKS, stage: 0, lives: LIVES, out: false, gone: false, reached: null, clutch: 0, rate: 0 })
    return {
      round: 0,
      ladder,
      lifters: Array.from({ length: ctx.players }, lifter),
      lifts: Array.from({ length: ctx.players }, () => fresh(ladder[0])),
      openedAt: ctx.now,
      last: null,
      winners: null,
    }
  },

  turn: lifting,

  move(state, side, move, ctx) {
    if (!lifting(state).includes(side)) return refuse('You have lifted this bar.')
    const m = (typeof move === 'object' && move !== null && !Array.isArray(move) ? move : {}) as Record<string, unknown>
    const reason = check(state, side, m)
    if (reason) return refuse(reason)
    const lift = state.lifts[side]
    if (m.chalk && !lift.chalk) {
      lift.chalk = true
      lift.need = needWith(lift.need, true)
      state.lifters[side].chalk--
    }
    if (typeof m.pace === 'number') {
      // No hands, no clock to check them against: the lift is made up whole, at that pace.
      add(lift, steady(m.pace), LIFT_MS)
      return finish(state, side, ctx)
    }
    const sinceOpen = ctx.now - state.openedAt
    add(lift, m.taps as number[], sinceOpen - COUNT_MS)
    return lift.lockedAt !== null || m.done || sinceOpen > CLOSES_MS ? finish(state, side, ctx) : state
  },

  // What a seat with no hands can play: a whole stand-in lift, or, if the bar has been touched, only the end of it.
  moves(state, side) {
    if (!lifting(state).includes(side)) return []
    if (state.lifts[side].taps.length) return [{ round: state.round, taps: [], done: true }]
    const dry = PACES.map((pace): StandIn => ({ round: state.round, pace }))
    const chalked = state.lifters[side].chalk > 0 ? dry.map((m): StandIn => ({ ...m, chalk: true })) : []
    return [...dry, ...chalked]
  },

  // Nothing is hidden: the counts climb where everyone can see. Only the raw taps and the table's clock stay behind.
  view: (state) => ({
    round: state.round,
    ladder: state.ladder,
    lifters: state.lifters,
    lifts: state.lifts.map((l) => ({ chalk: l.chalk, need: l.need, count: Math.min(l.taps.length, l.need), lockedAt: l.lockedAt, done: l.done })),
    last: state.last,
    winners: state.winners,
  }),

  result: (state) => (state.winners ? { winners: state.winners } : null),

  // Out of time: the bar stays where the taps so far left it. A screen that is there always ends its own lift, so a
  // bar nobody touched and nobody closed means nobody is there: that lifter is out, not kept waiting for twice more.
  timeout(state, side, ctx) {
    if (!lifting(state).includes(side)) return state
    if (!state.lifts[side].taps.length) state.lifters[side].lives = 1
    return finish(state, side, ctx)
  },

  // Leaving: out of it, whatever stage they were on. Those who stay settle it between them.
  leave(state, side, ctx) {
    state.lifters[side].gone = true
    state.lifts[side].done = true
    if (state.winners) return state
    if (decided(state)) return end(state)
    return lifting(state).length ? state : resolve(state, ctx)
  },
})
