// Tenis's rules, tested without a browser: `npm test`.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fuzz, startGame } from '@kampuse/games-kit/testing'
import { isRefusal, type Ctx } from '@kampuse/games-kit/rules'
import rules, { FLIGHT, GAMES_TO_WIN, LAG_MS, RUN_MS, SERVE, STRETCH_MS, TIMING, TOSS_PEAK, flightMs, grade, marginFor, runTo, type Move, type Run, type State } from './rules'

/** A table whose clock moves with every swing, so the times a screen claims are the times the table saw. Side 0 serves. */
function table() {
  const ctx: Ctx = { players: 2, now: 0, random: () => 0.1 }
  let state = rules.setup(ctx)
  const play = (side: number, move: Move, late = 0) => {
    // A serve's time is the screen's own business; an answer's is checked against the clock.
    if (state.ball) ctx.now += move.swing + late
    const out = rules.move(state, side, move, ctx)
    assert.ok(!isRefusal(out), JSON.stringify(out))
    state = out
    return state
  }
  /** A perfect serve to `to`. */
  const serve = (to = 1) => play(state.server, { to, swing: TOSS_PEAK })
  /** The receiver answers the ball in the air: `off` ms from perfect, aimed at `to`, running there in time if need be. */
  const hit = (to = 1, off = 0, runs?: Run[]) => {
    const ball = state.ball!
    const side = 1 - ball.hitter
    return play(side, { to, swing: ball.ms + off, runs: runs ?? (state.pos[side] === ball.to ? [] : [{ lane: ball.to, at: 0 }]) })
  }
  return { ctx, play, serve, hit, get state(): State { return state } }
}

test('a swing is graded by how far it was from the moment the ball arrived', () => {
  assert.equal(grade(0), 'perfect')
  assert.equal(grade(-TIMING.perfect), 'perfect')
  assert.equal(grade(TIMING.perfect + 1), 'good')
  assert.equal(grade(-TIMING.good - 1), 'weak')
  assert.equal(grade(TIMING.weak + 1), null)
})

test('a faster ball is harder to time: the same swing is worth less, down to half the margin', () => {
  assert.equal(marginFor(900), 1)
  assert.ok(marginFor(500) < 1 && marginFor(500) > marginFor(350))
  assert.equal(marginFor(100), 0.5)
  assert.equal(grade(TIMING.perfect, 900), 'perfect')
  assert.equal(grade(TIMING.perfect, 450), 'good')
  assert.equal(grade(TIMING.good, 350), null)
})

test('the serve: on the peak it flies fast, off the mark is a fault, two faults a point', () => {
  const t = table()
  t.serve(2)
  assert.deepEqual([t.state.last?.kind, t.state.last?.quality, t.state.ball?.ms, t.state.ball?.to], ['serve', 'perfect', SERVE.perfect, 2])
  assert.deepEqual(rules.turn(t.state), [1])

  const f = table()
  f.play(0, { to: 1, swing: TOSS_PEAK + TIMING.weak + 50 })
  assert.equal(f.state.last?.kind, 'fault')
  assert.equal(f.state.serveTry, 2)
  // A weak serve down the middle is in; aimed wide it is a fault.
  f.play(0, { to: 0, swing: TOSS_PEAK + TIMING.good + 20 })
  assert.equal(f.state.last?.kind, 'double')
  assert.deepEqual(f.state.points, [0, 1])
  f.play(0, { to: 1, swing: TOSS_PEAK + TIMING.good + 20 })
  assert.deepEqual([f.state.last?.kind, f.state.ball?.kind], ['serve', 'lob'])
})

test('timing decides the ball you send back: a drive, a rally ball, a lob', () => {
  for (const [off, kind] of [[0, 'drive'], [TIMING.perfect + 20, 'rally'], [-(TIMING.good + 20), 'lob']] as const) {
    const t = table()
    t.serve()
    t.hit(1, off)
    assert.equal(t.state.last?.kind, 'hit')
    assert.equal(t.state.ball?.kind, kind)
    assert.equal(t.state.ball?.hitter, 1)
    assert.equal(t.state.rally, 2)
  }
})

test('a weak hit aimed wide goes out; a swing far off the ball is a whiff', () => {
  const out = table()
  out.serve()
  out.hit(2, TIMING.good + 30)
  assert.deepEqual([out.state.last?.kind, out.state.last?.point], ['out', 0])

  const rally = table()
  rally.serve()
  rally.hit(1)
  rally.hit(0, TIMING.weak + 40)
  assert.deepEqual([rally.state.last?.kind, rally.state.last?.point], ['whiff', 1])
  assert.deepEqual(rally.state.points, [0, 1])
})

test('a perfect answer to a lob is a smash', () => {
  const t = table()
  t.serve()
  t.hit(1, TIMING.good + 30) // side 1 lobs it back
  t.hit(2, 0)
  assert.equal(t.state.last?.quality, 'smash')
  assert.equal(t.state.ball?.kind, 'smash')
  assert.equal(t.state.stats.smashes[0], 1)
  assert.ok(t.state.ball!.ms < flightMs('drive', 3))
})

test('you have to get to the ball: running takes time, and arriving late is a stretch', () => {
  // The serve goes two lanes away from a receiver who never runs: an ace.
  const ace = table()
  ace.serve(0)
  ace.hit(1, 0, [])
  assert.deepEqual([ace.state.last?.kind, ace.state.last?.point, ace.state.stats.aces[0]], ['ace', 0, 1])

  // In a rally, running too late for a far ball: a clean winner.
  const late = table()
  late.serve()
  late.hit(0)
  const ball = late.state.ball!
  late.hit(1, 0, [{ lane: ball.to, at: ball.ms - RUN_MS + STRETCH_MS + 20 }])
  assert.deepEqual([late.state.last?.kind, late.state.last?.at, late.state.stats.clean[1]], ['winner', 0, 1])

  // Arriving just after the swing: stretched, so even perfect timing is a lob.
  const stretch = table()
  stretch.serve()
  stretch.hit(0)
  const b = stretch.state.ball!
  stretch.hit(1, 0, [{ lane: b.to, at: b.ms - RUN_MS + STRETCH_MS - 20 }])
  assert.deepEqual([stretch.state.last?.kind, stretch.state.ball?.kind], ['hit', 'lob'])
  assert.equal(stretch.state.pos[0], 0)
})

test('a ball left alone by a player standing right there is a miss, not an unreachable ball', () => {
  const t = table()
  t.serve()
  t.hit(1)
  // Side 0 stands in the ball's lane and the clock runs out on them.
  t.ctx.now += 15_000
  const out = rules.timeout!(t.state, 0, t.ctx)
  assert.deepEqual([out.last?.kind, out.last?.point, out.stats.clean], ['whiff', 1, [0, 0]])
})

test('runs: one lane takes RUN_MS, a run tapped mid-run waits its turn, a wrong guess costs the way back', () => {
  assert.deepEqual(runTo(1, [], 500), { lane: 1, free: 0 })
  assert.deepEqual(runTo(1, [{ lane: 2, at: 100 }], 500), { lane: 2, free: 100 + RUN_MS })
  // A hunch to the left at the very start, then all the way right once the ball shows.
  assert.deepEqual(runTo(1, [{ lane: 0, at: 0 }, { lane: 2, at: 60 }], 900), { lane: 2, free: RUN_MS + 2 * RUN_MS })
  // A run tapped after the swing never happened.
  assert.deepEqual(runTo(1, [{ lane: 0, at: 700 }], 600), { lane: 1, free: 0 })
})

test('the rally speeds up shot by shot, down to a floor', () => {
  assert.ok(flightMs('rally', 10) < flightMs('rally', 1))
  assert.equal(flightMs('drive', 30), FLIGHT.drive.floor)
  assert.ok(flightMs('drive', 60) < FLIGHT.drive.floor) // a marathon gets faster still
  const t = table()
  t.serve()
  for (let i = 0; i < 12; i++) t.hit(1)
  assert.equal(t.state.rally, 13)
  assert.equal(t.state.last?.point, null)
})

test('the table clock keeps a claimed swing honest', () => {
  const t = table()
  t.serve()
  const ball = t.state.ball!
  // Claims perfect timing, but the swing reached the table 3 s after the ball should have been hit.
  t.play(1, { to: 1, swing: ball.ms }, 3000)
  assert.equal(t.state.last?.delta, 3000 - LAG_MS)
  assert.equal(t.state.last?.kind, 'ace')
  // And a swing can't be claimed later than the table's own clock allows.
  const early = table()
  early.serve()
  early.ctx.now += 100
  const out = rules.move(early.state, 1, { to: 1, swing: early.state.ball!.ms }, early.ctx)
  assert.ok(!isRefusal(out))
  assert.equal(out.last?.kind, 'ace')
})

test('four points make a game, three games the match; the serve changes hands and the stats add up', () => {
  const t = table()
  for (let g = 0; g < GAMES_TO_WIN; g++) {
    assert.equal(t.state.server, g % 2)
    for (let p = 0; p < 4; p++) {
      // Side 0 wins every point: its serves are never reached, and it returns side 1's serves for winners.
      if (t.state.server === 0) {
        t.serve(0)
        t.hit(1, 0, [])
      } else {
        t.serve(1)
        t.hit(2)
        t.hit(1, 0, [])
      }
    }
  }
  assert.deepEqual(rules.result(t.state), { winners: [0] })
  assert.deepEqual(rules.turn(t.state), [])
  assert.deepEqual(t.state.games, [3, 0])
  assert.deepEqual([t.state.stats.aces[0], t.state.stats.clean[0], t.state.stats.longest], [8, 4, 2])
})

test('bad moves are refused', () => {
  const t = table()
  const s = () => structuredClone(t.state)
  assert.deepEqual(rules.move(s(), 1, { to: 1, swing: 600 }, t.ctx), { refused: 'Not your turn.' })
  assert.deepEqual(rules.move(s(), 0, { to: 3, swing: 600 }, t.ctx), { refused: 'Tap a lane to hit.' })
  assert.deepEqual(rules.move(s(), 0, { to: 1, swing: -5 }, t.ctx), { refused: 'Swing at the ball.' })
  assert.deepEqual(rules.move(s(), 0, { to: 1, swing: 600, runs: [] }, t.ctx), { refused: 'Tap a lane to hit.' })
  assert.deepEqual(rules.move(s(), 0, { to: 1, swing: 600, power: 9 } as never, t.ctx), { refused: 'Tap a lane to hit.' })
  t.serve()
  assert.deepEqual(rules.move(s(), 1, { to: 1, swing: 700, runs: [{ lane: 7, at: 0 }] }, t.ctx), { refused: 'Run to a lane.' })
  assert.deepEqual(rules.move(s(), 1, { to: 1, swing: 700, runs: [{ lane: 2, at: 300 }, { lane: 1, at: 100 }] }, t.ctx), { refused: 'Run to a lane.' })
  assert.deepEqual(rules.move(s(), 1, { to: 1, swing: 700, runs: Array(5).fill({ lane: 1, at: 0 }) }, t.ctx), { refused: 'Too many runs.' })
  assert.deepEqual(rules.move(s(), 1, 'smash' as never, t.ctx), { refused: 'Tap a lane to hit.' })
})

test('every move the rules list is one they accept, and the view hides only the table clock', () => {
  const t = table()
  for (const move of rules.moves!(t.state, 0)) assert.ok(!isRefusal(rules.move(structuredClone(t.state), 0, move as Move, t.ctx)))
  t.serve(2)
  for (const move of rules.moves!(t.state, 1)) assert.ok(!isRefusal(rules.move(structuredClone(t.state), 1, move as Move, t.ctx)))
  assert.deepEqual(rules.moves!(t.state, 0), [])
  assert.equal('sentAt' in rules.view(t.state, 0), false)
  assert.equal(rules.view(t.state, null).ball?.to, 2)
})

test('running out of time: an unstruck serve is a fault, a ball left alone goes by; leaving loses', () => {
  const game = startGame(rules, { players: 2, seed: 9 })
  const server = game.view(0).server
  game.timeout(server)
  assert.equal(game.view(0).last?.kind, 'fault')
  game.timeout(server)
  assert.equal(game.view(0).last?.kind, 'double')
  game.move(server, { to: 1, swing: TOSS_PEAK })
  game.timeout(1 - server)
  assert.equal(game.view(0).last?.kind, 'ace')
  assert.deepEqual(game.notes, [])
  assert.ok(game.replays())
  game.leave(1)
  assert.deepEqual(game.over, { winners: [0] })
})

test('500 random matches all end, with no problems', () => {
  const report = fuzz(rules, { games: 500, players: 2 })
  // A busy machine can make one call look slow; only real problems count here (check-game times the calls itself).
  assert.deepEqual(report.problems.filter((p) => !/ took \d+ ms\./.test(p.text)), [])
  assert.equal(report.ended, 500)
})
