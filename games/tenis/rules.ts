// Tenis: a rally played with your thumbs on a three-lane court. Nothing is rolled: every point is won or lost by
// running and timing.
//   - The ball flies to a lane on your side. Tap your half to run there (a lane takes RUN_MS), tap their half to hit:
//     where you tap is where the ball goes, when you tap is how well you hit it.
//   - Timing, against the moment the ball reaches you: perfect is a fast drive, good a rally ball, weak a slow lob.
//     A weak hit aimed at a side lane sails out. A perfect hit on a lob is a smash.
//   - The serve: toss the ball, then tap a lane as it peaks. Off the mark is a fault; two are a point.
//   - Before the ball is even hit you may start running on a hunch: right, you reach anything; wrong, you are stranded.
// The rally speeds up with every shot. No-ad scoring, first to three games.
// The screen measures the taps (when you ran, when you swung); the table's clock keeps the times honest.
import { defineRules, refuse, type Ctx } from '@kampuse/games-kit/rules'

export const LANES = 3
export const MIDDLE = 1
export const GAMES_TO_WIN = 3
/** Points in a game: 0, 15, 30, 40, then the next point wins it (no-ad, so 40-40 is a deciding point). */
export const POINTS_TO_WIN = 4

export type Quality = 'perfect' | 'good' | 'weak'
/** How a ball flies, fastest first. */
export type Kind = 'smash' | 'drive' | 'rally' | 'lob'

/** How far off a swing may be (ms from the ball's arrival, early or late) and still be that good, on an unhurried ball. */
export const TIMING: Record<Quality, number> = { perfect: 65, good: 140, weak: 230 }
/** A faster ball is harder to time: the margins shrink with its flight below UNHURRIED_MS, down to TIGHTEST of themselves. */
const UNHURRIED_MS = 700
const TIGHTEST = 0.5
/** A ball's flight to the other baseline (ms) as a point starts, and the fastest it gets. */
export const FLIGHT: Record<Kind, { start: number; floor: number }> = {
  smash: { start: 500, floor: 400 },
  drive: { start: 700, floor: 480 },
  rally: { start: 900, floor: 600 },
  lob: { start: 1250, floor: 1000 },
}
/** Every shot of a rally takes this much off the flight; past MARATHON shots even the floor gives way. */
const PER_SHOT = 18
const MARATHON = 30
const FASTEST = 260
/** The serve: the toss peaks at this many ms, and the serve flies this long, by how it was struck. */
export const TOSS_PEAK = 650
export const SERVE: Record<Quality, number> = { perfect: 740, good: 900, weak: 1150 }
/** Running one lane, and how late you may arrive and still get a racket on it (stretched: a weak ball at best). */
export const RUN_MS = 220
export const STRETCH_MS = 90
/** The most runs one ball can take (there, back, and a change of mind). */
export const MAX_RUNS = 4
/** The most the network may add to a swing's time, and the slack on the other side. */
export const LAG_MS = 1000
const SLACK_MS = 80
const LONGEST_MS = 60_000

type Side = 0 | 1
export type Run = { lane: number; at: number }
export type Move = { to: number; swing: number; runs?: Run[] }

/** The ball in the air: what the player it flies to has to answer. */
export type Ball = { n: number; serve: boolean; hitter: Side; from: number; to: number; kind: Kind; ms: number }

/** What just happened, for the screens: a shot went over, or the point ended. */
export type Event = {
  n: number
  kind: 'serve' | 'hit' | 'fault' | 'double' | 'ace' | 'winner' | 'whiff' | 'out'
  /** Whose swing (or missing swing) this was. */
  by: Side
  quality: Quality | 'smash' | null
  /** How far off the swing was (ms; negative is early), when there was one. */
  delta: number | null
  /** Where it was aimed, and where that player stood in the end. */
  to: number | null
  at: number
  /** Who won the point with it, or null while the rally goes on. */
  point: Side | null
  /** Shots in the point so far. */
  rally: number
}

/** The match in numbers, for the end card: the longest rally, and each side's perfect hits, aces, clean winners and smashes. */
export type Stats = { longest: number; perfect: [number, number]; aces: [number, number]; clean: [number, number]; smashes: [number, number] }

export type State = {
  points: [number, number]
  games: [number, number]
  server: Side
  phase: 'serve' | 'rally'
  serveTry: 1 | 2
  /** Where each player stands (lane). */
  pos: [number, number]
  ball: Ball | null
  /** When the ball was struck (ctx.now), to check the answer's timing against. */
  sentAt: number
  rally: number
  last: Event | null
  count: number
  stats: Stats
  winners: Side[] | null
}

export type View = Omit<State, 'sentAt'>

const other = (side: Side): Side => (side === 0 ? 1 : 0)
const isLane = (lane: unknown): lane is number => typeof lane === 'number' && Number.isInteger(lane) && lane >= 0 && lane < LANES
const isTime = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= LONGEST_MS

/** How much of the timing margins a ball that flies `ms` leaves: all of them when unhurried, fewer the faster it comes. */
export const marginFor = (ms: number) => Math.min(1, Math.max(TIGHTEST, ms / UNHURRIED_MS))

/** How good a swing is that came `delta` ms from the right moment, at a ball that flew `ms`; null: it missed the ball. */
export function grade(delta: number, ms = UNHURRIED_MS): Quality | null {
  const off = Math.abs(delta) / marginFor(ms)
  return off <= TIMING.perfect ? 'perfect' : off <= TIMING.good ? 'good' : off <= TIMING.weak ? 'weak' : null
}

/** How long a ball of this kind flies, this deep into a rally. */
export function flightMs(kind: Kind, rally: number): number {
  const paced = Math.max(FLIGHT[kind].floor, FLIGHT[kind].start - PER_SHOT * rally)
  return Math.max(FASTEST, paced - Math.max(0, rally - MARATHON) * PER_SHOT)
}

/** Where a player's runs leave them at `until`: the lane they are in or running to, and when they get (or got) there. */
export function runTo(start: number, runs: Run[], until: number): { lane: number; free: number } {
  let lane = start
  let free = 0
  for (const run of runs) {
    if (run.at > until) break
    // A run tapped while still running starts when the last one ends.
    free = Math.max(run.at, free) + Math.abs(run.lane - lane) * RUN_MS
    lane = run.lane
  }
  return { lane, free }
}

/** The ball a clean hit sends back: a perfect answer to a lob is a smash. */
const kindOf = (quality: Quality, incoming: Kind | null): Kind =>
  quality === 'perfect' ? (incoming === 'lob' ? 'smash' : 'drive') : quality === 'good' ? 'rally' : 'lob'

/** A point to `side`: the score, the games, maybe the match, and the next serve. */
function scorePoint(state: State, side: Side): void {
  state.stats.longest = Math.max(state.stats.longest, state.rally)
  state.points[side]++
  if (state.points[side] >= POINTS_TO_WIN) {
    state.games[side]++
    state.points = [0, 0]
    state.server = other(state.server)
    if (state.games[side] >= GAMES_TO_WIN) state.winners = [side]
  }
  Object.assign(state, { phase: 'serve', serveTry: 1, pos: [MIDDLE, MIDDLE], ball: null, rally: 0 })
}

function tell(state: State, event: Omit<Event, 'n' | 'rally'>): void {
  state.count++
  state.last = { n: state.count, rally: state.rally, ...event }
  if (event.point !== null) scorePoint(state, event.point)
}

/** A ball leaves the racket: the event that tells of it (told next) carries the same number. */
function launch(state: State, ball: Omit<Ball, 'n'>, ctx: Ctx): void {
  state.ball = { n: state.count + 1, ...ball }
  state.phase = 'rally'
  state.rally++
  state.sentAt = ctx.now
}

/** The serve: struck `swing` ms after the toss (null: never struck). */
function serve(state: State, to: number, swing: number | null, ctx: Ctx): State {
  const server = state.server
  const delta = swing === null ? null : swing - TOSS_PEAK
  const quality = delta === null ? null : grade(delta)
  // Off the mark, or a weak one aimed wide: a fault.
  if (!quality || (quality === 'weak' && to !== MIDDLE)) {
    const double = state.serveTry === 2
    if (!double) state.serveTry = 2
    tell(state, { kind: double ? 'double' : 'fault', by: server, quality, delta, to, at: state.pos[server], point: double ? other(server) : null })
    return state
  }
  if (quality === 'perfect') state.stats.perfect[server]++
  launch(state, { serve: true, hitter: server, from: state.pos[server], to, kind: kindOf(quality, null), ms: SERVE[quality] }, ctx)
  tell(state, { kind: 'serve', by: server, quality, delta, to, at: state.pos[server], point: null })
  return state
}

/** The answer to a ball in the air: the runs, the swing and the aim (null: no swing at all). */
function answer(state: State, side: Side, move: { to: number; swing: number; runs: Run[] } | null, ctx: Ctx): State {
  const ball = state.ball as Ball
  const hitter = ball.hitter
  // The screen says when the swing came; it can't have come after now, or long before the table heard of it.
  const elapsed = ctx.now - state.sentAt
  const swing = move ? Math.round(Math.min(Math.max(move.swing, elapsed - LAG_MS), elapsed + SLACK_MS)) : null
  const stood = runTo(state.pos[side], move?.runs ?? [], swing ?? ball.ms)
  const reached = swing !== null && stood.lane === ball.to && stood.free <= swing + STRETCH_MS
  const delta = swing === null ? null : swing - ball.ms
  const timed = delta === null ? null : grade(delta, ball.ms)
  // Still running as the racket came through: a stretched ball is weak at best.
  const quality: Quality | null = reached && timed ? (stood.free > (swing as number) ? 'weak' : timed) : null
  const base = { by: side, delta, to: move?.to ?? null, at: stood.lane }
  if (!quality) {
    // Right there and it still went by (a mistimed swing, or none at all): a miss. Not there: a clean winner.
    const there = stood.lane === ball.to && stood.free <= (swing ?? ball.ms) + STRETCH_MS
    const kind = ball.serve ? 'ace' : there ? 'whiff' : 'winner'
    if (kind !== 'whiff') state.stats[kind === 'ace' ? 'aces' : 'clean'][hitter]++
    tell(state, { ...base, kind, quality: null, point: hitter })
    return state
  }
  const to = (move as { to: number }).to
  if (quality === 'weak' && to !== MIDDLE) {
    tell(state, { ...base, kind: 'out', quality, point: hitter })
    return state
  }
  const kind = kindOf(quality, ball.kind)
  if (quality === 'perfect') state.stats.perfect[side]++
  if (kind === 'smash') state.stats.smashes[side]++
  state.pos[side] = ball.to
  launch(state, { serve: false, hitter: side, from: ball.to, to, kind, ms: flightMs(kind, state.rally) }, ctx)
  tell(state, { ...base, kind: 'hit', quality: kind === 'smash' ? 'smash' : quality, point: null })
  return state
}

/** A move from a phone, checked: null when fine, or why not. */
function check(state: State, m: Record<string, unknown>): string | null {
  const keys = Object.keys(m).sort().join(',')
  const known = state.phase === 'serve' ? keys === 'swing,to' : keys === 'swing,to' || keys === 'runs,swing,to'
  if (!known || !isLane(m.to)) return 'Tap a lane to hit.'
  if (!isTime(m.swing)) return 'Swing at the ball.'
  const runs = m.runs ?? []
  if (!Array.isArray(runs) || runs.length > MAX_RUNS) return 'Too many runs.'
  let last = 0
  for (const run of runs as unknown[]) {
    const r = (typeof run === 'object' && run !== null ? run : {}) as Record<string, unknown>
    if (Object.keys(r).sort().join(',') !== 'at,lane' || !isLane(r.lane) || !isTime(r.at) || r.at < last) return 'Run to a lane.'
    last = r.at
  }
  return null
}

const turnOf = (state: State): Side[] => (state.winners ? [] : [state.ball ? other(state.ball.hitter) : state.server])

/** Swings for bots and fuzzing: on the dot, a little off, well off, and a miss. */
const OFFSETS = [0, 100, 200, 400]

function movesFor(state: State, side: number): Move[] {
  if (!turnOf(state).includes(side as Side)) return []
  const lanes = Array.from({ length: LANES }, (_, lane) => lane)
  const ball = state.ball
  if (!ball) return lanes.flatMap((to) => OFFSETS.map((off) => ({ to, swing: TOSS_PEAK + off })))
  const runs = ball.to === state.pos[side] ? [] : [{ lane: ball.to, at: 0 }]
  const answers = lanes.flatMap((to) => OFFSETS.map((off) => ({ to, swing: ball.ms + off, runs })))
  // And standing still when the ball goes elsewhere.
  return runs.length ? [...answers, { to: MIDDLE, swing: ball.ms, runs: [] }] : answers
}

export default defineRules<State, Move, View>({
  setup(ctx) {
    const server: Side = ctx.random() < 0.5 ? 0 : 1
    return {
      points: [0, 0], games: [0, 0], server, phase: 'serve', serveTry: 1, pos: [MIDDLE, MIDDLE], ball: null, sentAt: 0, rally: 0,
      last: null, count: 0, stats: { longest: 0, perfect: [0, 0], aces: [0, 0], clean: [0, 0], smashes: [0, 0] }, winners: null,
    }
  },

  turn: turnOf,

  move(state, side, move, ctx) {
    if (!turnOf(state).includes(side as Side)) return refuse('Not your turn.')
    const m = (typeof move === 'object' && move !== null && !Array.isArray(move) ? move : {}) as Record<string, unknown>
    const reason = check(state, m)
    if (reason) return refuse(reason)
    if (state.phase === 'serve') return serve(state, m.to as number, m.swing as number, ctx)
    return answer(state, side as Side, { to: m.to as number, swing: m.swing as number, runs: (m.runs ?? []) as Run[] }, ctx)
  },

  moves: movesFor,

  // Nothing is hidden on a tennis court; only the table's own clock stays behind.
  view(state) {
    const { sentAt, ...shown } = state
    void sentAt
    return shown
  },

  result: (state) => (state.winners ? { winners: state.winners } : null),

  // Out of time: the serve was never struck (a fault), or the ball went by.
  timeout: (state, side, ctx) => (state.phase === 'serve' ? serve(state, MIDDLE, null, ctx) : answer(state, side as Side, null, ctx)),

  leave(state, side) {
    state.winners = [other(side as Side)]
    return state
  },
})
