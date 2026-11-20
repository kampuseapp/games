// Basket 1v1: half-court streetball, first to 11, played on reflexes. A possession:
//   1. the drive: the attacker drives left, right or steps back. The defender may gamble on a guess (right: a good
//      chance to steal; wrong: beaten) or wait and react.
//   2. the reaction: a waiting defender sees the move and has to slide the same way, fast. Quick and right: in their
//      face (maybe a steal). Slow: trailing. Wrong or too slow: beaten.
//   3. the shot: a layup, a jumper or a three, released on a moving meter (the screen measures `aim`, 0 to 100).
//   4. the contest: the defender jumps as the ball goes up. Quick jumps hurt the shot, and in close they block it.
//   5. a miss: both go for the rebound at once; the faster hand wins it (the defender has the box-out).
// The screen measures the reflexes; the table's clock keeps them honest.
import { defineRules, refuse, type Ctx } from '@kampuse/games-kit/rules'

export const TARGET = 11

export const DRIVES = ['left', 'right', 'step'] as const
export const SHOTS = ['layup', 'jumper', 'three'] as const
export type Drive = (typeof DRIVES)[number]
export type Shot = (typeof SHOTS)[number]
/** How well the defender stayed with the drive. */
export type Cover = 'open' | 'trail' | 'tight'

export const POINTS: Record<Shot, number> = { layup: 2, jumper: 2, three: 3 }
/** Chance to score at a perfect release, nobody near. */
const BASE: Record<Shot, number> = { layup: 0.66, jumper: 0.52, three: 0.4 }
/** Beating the defender: a drive opens the rim, a step-back the outside. */
const OPEN: Record<'drive' | 'step', Record<Shot, number>> = {
  drive: { layup: 0.18, jumper: 0.08, three: 0 },
  step: { layup: 0, jumper: 0.08, three: 0.14 },
}
const COVER: Record<Cover, number> = { open: 0, trail: -0.04, tight: -0.12 }
/** A perfect contest takes this much off, less when the defender is a step behind. */
const JUMP = { most: 0.16, reach: { open: 0.35, trail: 0.7, tight: 1 } as Record<Cover, number> }
const HOT = { streak: 2, bonus: 0.07 }

/** The defender's reflexes (ms). */
export const REACT = { limit: 800, steal: 280, tight: 550 }
export const CONTEST_MS = 650
export const BLOCK = { ms: 300, chance: 0.35 }
/** Steals: a right guess, or a lightning-fast slide. */
export const STEAL = { guess: 0.4, quick: 0.25 }
/** The defender's head start on a rebound (ms). */
export const BOX_OUT = 150
/** Faster than this is a guess, not a reaction: it counts as this. */
export const HUMAN_MS = 120
/** The most the network may add to an answer. */
export const LAG_MS = 1000
/** The release meter: a shot this good is perfect. */
export const SWEET = 90

type Side = 0 | 1
export type Phase = 'drive' | 'react' | 'shoot' | 'contest' | 'board'
export type Move =
  | { drive: Drive }
  | { guess: Drive | null }
  | { drive: Drive; ms: number }
  | { shot: Shot; aim: number }
  | { ms: number }

export type Outcome = 'open' | 'trail' | 'tight' | 'steal' | 'make' | 'putback' | 'miss' | 'block' | 'board' | 'rebound'

/** One thing that happened, for the screens to show. */
export type Play = {
  n: number
  attacker: Side
  outcome: Outcome
  drive: Drive | null
  /** The defender's guess (null: waited), and their reaction time (ms) when they had one. */
  guess: Drive | null
  ms: number | null
  shot: Shot | null
  aim: number | null
  chance: number | null
  points: number
  /** On a rebound: both hands' times (ms), by side. */
  hands: [number, number] | null
}

/** The game in numbers, for the end card: each side's steals, blocks, threes, rebounds and quickest slide (ms; 0: none yet). */
export type Stats = { steals: [number, number]; blocks: [number, number]; threes: [number, number]; boards: [number, number]; quickest: [number, number] }

export type State = {
  score: [number, number]
  attacker: Side
  phase: Phase
  drive: Drive | null
  /** The defender's guess, once in (null inside: waiting to react). */
  guess: { guess: Drive | null } | null
  cover: Cover | null
  shot: { shot: Shot; aim: number } | null
  putback: boolean
  /** Rebound times, as they come in. */
  hands: [number | null, number | null]
  /** When the cue went out (ctx.now): the drive, the shot or the miss. */
  sentAt: number
  streak: [number, number]
  last: Play | null
  count: number
  stats: Stats
  winners: Side[] | null
}

export type View = {
  score: [number, number]
  attacker: Side
  phase: Phase
  /** The drive, once the defender gets to react to it (and after). */
  drive: Drive | null
  cover: Cover | null
  /** The shot going up, for the defender to contest. */
  shot: Shot | null
  putback: boolean
  streak: [number, number]
  ready: [boolean, boolean]
  /** Your own hidden choice in the drive phase. */
  mine: Move | null
  last: Play | null
  stats: Stats
  winners: Side[] | null
  target: number
}

const other = (side: Side): Side => (side === 0 ? 1 : 0)
const clamp = (p: number) => Math.min(0.95, Math.max(0.03, p))
const isDrive = (v: unknown): v is Drive => typeof v === 'string' && (DRIVES as readonly string[]).includes(v)
const isShot = (v: unknown): v is Shot => typeof v === 'string' && (SHOTS as readonly string[]).includes(v)
const isWhole = (n: unknown, max: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max
const NEVER = 60_000

/** The chance a shot goes in. */
export function shotChance(shot: Shot, aim: number, cover: Cover, drive: Drive | null, jump: number, streak: number): number {
  const release = 0.6 + (0.5 * Math.min(aim, SWEET)) / SWEET
  let p = BASE[shot] * release + COVER[cover] - jump * JUMP.most * JUMP.reach[cover]
  if (cover === 'open' && drive) p += OPEN[drive === 'step' ? 'step' : 'drive'][shot]
  if (streak >= HOT.streak) p += HOT.bonus
  return clamp(p)
}

/** A reaction time from a phone, kept honest by the table's clock. */
const honest = (claimed: number, state: State, ctx: Ctx) => Math.round(Math.max(claimed, HUMAN_MS, ctx.now - state.sentAt - LAG_MS))

function record(state: State, play: Partial<Play> & { outcome: Outcome }): Play {
  state.count++
  state.last = { n: state.count, attacker: state.attacker, drive: state.drive, guess: null, ms: null, shot: null, aim: null, chance: null, points: 0, hands: null, ...play }
  return state.last
}

/** The ball goes to `side` for a fresh possession. */
function newPossession(state: State, side: Side) {
  Object.assign(state, { attacker: side, phase: 'drive', drive: null, guess: null, cover: null, shot: null, putback: false, hands: [null, null] })
}

function steal(state: State, play: Partial<Play>) {
  record(state, { ...play, outcome: 'steal' })
  state.stats.steals[other(state.attacker)]++
  state.streak[state.attacker] = 0
  newPossession(state, other(state.attacker))
}

function toShoot(state: State, cover: Cover, play: Partial<Play>) {
  state.cover = cover
  state.phase = 'shoot'
  record(state, { ...play, outcome: cover })
}

/** Both are in for the drive: a guess settles it at once; a wait means a reaction. */
function drive(state: State, ctx: Ctx): State {
  const guess = (state.guess as { guess: Drive | null }).guess
  if (guess === null) {
    state.phase = 'react'
    state.sentAt = ctx.now
    return state
  }
  if (guess !== state.drive) toShoot(state, 'open', { guess })
  else if (ctx.random() < STEAL.guess) steal(state, { guess })
  else toShoot(state, 'tight', { guess })
  return state
}

function react(state: State, slide: Drive | null, claimed: number, ctx: Ctx): State {
  const ms = slide === null ? null : honest(claimed, state, ctx)
  const right = ms !== null && slide === state.drive && ms <= REACT.limit
  const play = { ms }
  const defender = other(state.attacker)
  if (right && (state.stats.quickest[defender] === 0 || ms < state.stats.quickest[defender])) state.stats.quickest[defender] = ms
  if (!right) toShoot(state, 'open', play)
  else if (ms <= REACT.steal && ctx.random() < STEAL.quick) steal(state, play)
  else toShoot(state, ms <= REACT.tight ? 'tight' : 'trail', play)
  return state
}

function contest(state: State, claimed: number | null, ctx: Ctx): State {
  const attacker = state.attacker
  const { shot, aim } = state.shot as { shot: Shot; aim: number }
  const cover = state.cover as Cover
  const ms = claimed === null ? null : honest(claimed, state, ctx)
  const jump = ms === null ? 0 : Math.max(0, 1 - ms / CONTEST_MS)
  const play = { shot, aim, ms }
  if (ms !== null && shot !== 'three' && cover === 'tight' && ms <= BLOCK.ms && ctx.random() < BLOCK.chance) {
    record(state, { ...play, outcome: 'block' })
    state.stats.blocks[other(attacker)]++
    state.streak[attacker] = 0
    newPossession(state, other(attacker))
    return state
  }
  const chance = shotChance(shot, aim, cover, state.putback ? null : state.drive, jump, state.streak[attacker])
  const made = ctx.random() < chance
  record(state, { ...play, chance: Math.round(chance * 100) / 100, outcome: made ? (state.putback ? 'putback' : 'make') : 'miss', points: made ? POINTS[shot] : 0 })
  if (!made) {
    state.streak[attacker] = 0
    Object.assign(state, { phase: 'board', shot: null, hands: [null, null], sentAt: ctx.now })
    return state
  }
  state.score[attacker] += POINTS[shot]
  if (shot === 'three') state.stats.threes[attacker]++
  state.streak[attacker]++
  if (state.score[attacker] >= TARGET) state.winners = [attacker]
  else newPossession(state, other(attacker))
  return state
}

/** Both hands are in: the quicker one has the ball (the defender boxed out). */
function board(state: State): State {
  const attacker = state.attacker
  const hands = state.hands as [number, number]
  const offense = hands[attacker] < hands[other(attacker)] - BOX_OUT
  record(state, { outcome: offense ? 'board' : 'rebound', hands })
  state.stats.boards[offense ? attacker : other(attacker)]++
  if (!offense) newPossession(state, other(attacker))
  else Object.assign(state, { phase: 'shoot', cover: 'trail', shot: null, putback: true, hands: [null, null] })
  return state
}

const AIMS = [20, 60, 100]
const TIMES = [200, 450, 700, 1000]

function movesFor(state: State, side: number): Move[] {
  if (state.winners) return []
  const attacking = side === state.attacker
  switch (state.phase) {
    case 'drive':
      if (attacking) return state.drive ? [] : DRIVES.map((d) => ({ drive: d }))
      return state.guess ? [] : [{ guess: null }, ...DRIVES.map((d) => ({ guess: d }))]
    case 'react':
      return attacking ? [] : DRIVES.flatMap((d) => TIMES.map((ms) => ({ drive: d, ms })))
    case 'shoot':
      return attacking ? SHOTS.flatMap((shot) => AIMS.map((aim) => ({ shot, aim }))) : []
    case 'contest':
      return attacking ? [] : TIMES.map((ms) => ({ ms }))
    case 'board':
      return state.hands[side] !== null ? [] : TIMES.map((ms) => ({ ms }))
  }
}

function whoseTurn(state: State): Side[] {
  if (state.winners) return []
  const att = state.attacker
  const def = other(att)
  switch (state.phase) {
    case 'drive':
      return ([0, 1] as Side[]).filter((s) => (s === att ? state.drive === null : state.guess === null))
    case 'react':
    case 'contest':
      return [def]
    case 'shoot':
      return [att]
    case 'board':
      return ([0, 1] as Side[]).filter((s) => state.hands[s] === null)
  }
}

/** A move from a phone, checked: null when fine, or why not. */
function check(state: State, side: Side, m: Record<string, unknown>): string | null {
  const keys = Object.keys(m).sort().join(',')
  const attacking = side === state.attacker
  switch (state.phase) {
    case 'drive':
      if (attacking) return keys === 'drive' && isDrive(m.drive) ? null : 'Pick a move.'
      return keys === 'guess' && (m.guess === null || isDrive(m.guess)) ? null : 'Guess the move, or wait.'
    case 'react':
      return keys === 'drive,ms' && isDrive(m.drive) && isWhole(m.ms, NEVER) ? null : 'Slide left, right or back.'
    case 'shoot':
      if (keys !== 'aim,shot' || !isShot(m.shot)) return 'Pick a shot.'
      return isWhole(m.aim, 100) ? null : 'Release first.'
    case 'contest':
    case 'board':
      return keys === 'ms' && isWhole(m.ms, NEVER) ? null : 'Tap in time.'
  }
}

function apply(state: State, side: Side, m: Record<string, unknown>, ctx: Ctx): State {
  switch (state.phase) {
    case 'drive':
      if (side === state.attacker) state.drive = m.drive as Drive
      else state.guess = { guess: m.guess as Drive | null }
      return state.drive && state.guess ? drive(state, ctx) : state
    case 'react':
      return react(state, m.drive as Drive, m.ms as number, ctx)
    case 'shoot':
      state.shot = { shot: m.shot as Shot, aim: m.aim as number }
      state.phase = 'contest'
      state.sentAt = ctx.now
      return state
    case 'contest':
      return contest(state, m.ms as number, ctx)
    case 'board':
      state.hands[side] = honest(m.ms as number, state, ctx)
      return state.hands.every((h) => h !== null) ? board(state) : state
  }
}

export default defineRules<State, Move, View>({
  setup: (ctx) => ({
    score: [0, 0], attacker: ctx.random() < 0.5 ? 0 : 1, phase: 'drive', drive: null, guess: null, cover: null, shot: null, putback: false,
    hands: [null, null], sentAt: 0, streak: [0, 0], last: null, count: 0, winners: null,
    stats: { steals: [0, 0], blocks: [0, 0], threes: [0, 0], boards: [0, 0], quickest: [0, 0] },
  }),

  turn: whoseTurn,

  move(state, side, move, ctx) {
    if (!whoseTurn(state).includes(side as Side)) return refuse('You have already chosen.')
    const m = typeof move === 'object' && move !== null && !Array.isArray(move) ? (move as Record<string, unknown>) : {}
    const reason = check(state, side as Side, m)
    return reason ? refuse(reason) : apply(state, side as Side, m, ctx)
  },

  moves: movesFor,

  view(state, side) {
    const hidden = state.phase === 'drive'
    const att = state.attacker
    const mine: Move | null = !hidden ? null : side === att ? (state.drive ? { drive: state.drive } : null) : side === other(att) ? state.guess : null
    const ready = ([0, 1] as Side[]).map((s) => !whoseTurn(state).includes(s)) as [boolean, boolean]
    return {
      score: state.score, attacker: att, phase: state.phase, drive: hidden ? null : state.drive, cover: state.cover,
      shot: state.phase === 'contest' ? (state.shot?.shot ?? null) : null, putback: state.putback, streak: state.streak,
      ready, mine, last: state.last, stats: state.stats, winners: state.winners, target: TARGET,
    }
  },

  result: (state) => (state.winners ? { winners: state.winners } : null),

  // Out of time: a step-back, waiting, no slide, a lazy jumper, no jump, no hand on the ball.
  timeout(state, side, ctx) {
    switch (state.phase) {
      case 'drive':
        return apply(state, side as Side, side === state.attacker ? { drive: 'step' } : { guess: null }, ctx)
      case 'react':
        return react(state, null, NEVER, ctx)
      case 'shoot':
        return apply(state, side as Side, { shot: 'jumper', aim: 40 }, ctx)
      case 'contest':
        return contest(state, null, ctx)
      case 'board':
        state.hands[side] = NEVER
        return state.hands.every((h) => h !== null) ? board(state) : state
    }
  },

  leave(state, side) {
    state.winners = [other(side as Side)]
    return state
  },
})
