// Ağırlık Kapışması's rules, tested without a browser: `npm test`.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fuzz, startGame } from '@kampuse/games-kit/testing'
import { isRefusal, type Ctx } from '@kampuse/games-kit/rules'
import rules, { BURST, CLOSES_MS, COUNT_MS, FIRST, GROW, KG_PER_TAP, LIFT_MS, LIVES, MAX_TAPS, PACES, STAGES, STEP, ahead, kgOf, needWith, type Batch, type Lifter, type State } from './rules'

/** A meet whose dice always roll `roll`: at 0.5 the ladder is 12, 16, 20, 25, 30, 36, 43, 51, 60 and 69 taps. */
const start = (players: number, roll = 0.5) => rules.setup({ players, now: 1000, random: () => roll })
/** A table clock at the end of an honest lift: every tap could have happened by now, and the bar is not closed yet. */
const late = (state: State): Ctx => ({ players: state.lifters.length, now: state.openedAt + 12_000, random: () => 0.5 })
/** `n` taps spread evenly over the lift, the last one as the time runs out. */
const spread = (n: number) => Array.from({ length: n }, (_, i) => Math.round(((i + 1) * LIFT_MS) / n))
/** A whole lift in one batch: so many taps spread over it, or the taps themselves. */
const lift = (state: State, taps: number | number[], more: Partial<Batch> = {}): Batch => ({ round: state.round, taps: typeof taps === 'number' ? spread(taps) : taps, done: true, ...more })
/** Everyone still lifting sends their lift (so many taps, or the taps themselves); the state after the round. */
function bar(state: State, hands: (number | number[])[]): State {
  let s = state
  for (const side of rules.turn(s)) {
    const out = rules.move(s, side, lift(s, hands[side]), late(s))
    assert.ok(!isRefusal(out), JSON.stringify(out))
    s = out
  }
  return s
}

test('the ladder is drawn when the meet starts: a random first stage, every stage a few taps more, and steeper as it climbs', () => {
  assert.deepEqual(start(2).ladder, [12, 16, 20, 25, 30, 36, 43, 51, 60, 69])
  const low = start(2, 0).ladder
  const high = start(2, 0.999).ladder
  assert.deepEqual([low[0], low[1] - low[0], high[0], high[1] - high[0]], [FIRST.min, STEP.min + GROW[0], FIRST.max, STEP.max + GROW[0]])
  assert.deepEqual([low.length, high.length], [STAGES, STAGES])
  // The last step up is a bigger one than the first, whatever the dice.
  assert.ok(low[STAGES - 1] - low[STAGES - 2] > high[1] - high[0])
  // Nobody's thumbs get to the top of even the easiest ladder: eleven taps a second would not.
  assert.ok(low[STAGES - 1] > (11 * LIFT_MS) / 1000)
  // Hands can make every stage in the time there is: the top of the hardest ladder too.
  assert.ok(high[STAGES - 1] <= (LIFT_MS / BURST.ms) * BURST.taps)
  assert.equal(kgOf(12), 12 * KG_PER_TAP)
  // Two tables, two different ladders.
  const ladders = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => startGame(rules, { players: 2, seed }).view(0).ladder.join()))
  assert.ok(ladders.size > 1)
  // Everyone starts at the bottom, with all their lives.
  assert.deepEqual(start(3).lifters.map((l) => [l.stage, l.lives, l.out]), [[0, LIVES, false], [0, LIVES, false], [0, LIVES, false]])
})

test('a stage is its taps: get them all in before the time is up and the bar locks out with the last one', () => {
  const s = start(2)
  const go = (taps: number[]) => {
    const out = rules.move(structuredClone(s), 0, { round: 0, taps, done: true }, late(s))
    assert.ok(!isRefusal(out))
    return out.lifts[0]
  }
  assert.equal(go(spread(13)).lockedAt, Math.round((12 * LIFT_MS) / 13))
  assert.equal(go(spread(11)).lockedAt, null) // one short
  // Taps after the time is up are no taps.
  const tooLate = go([...spread(10), LIFT_MS + 100, LIFT_MS + 200])
  assert.deepEqual([tooLate.taps.length, tooLate.lockedAt], [10, null])
})

test('whoever makes their stage goes up one: the next bar is the next rung of the ladder', () => {
  let s = bar(start(3), [20, 20, 20])
  assert.deepEqual([s.round, s.lifters.map((l) => l.stage), s.lifts.map((l) => l.need)], [1, [1, 1, 1], [16, 16, 16]])
  assert.deepEqual(rules.turn(s), [0, 1, 2])
  assert.deepEqual(s.last?.results.map((r) => [r.stage, r.ok, r.count, r.need, r.lives]), [[0, true, 12, 12, 3], [0, true, 12, 12, 3], [0, true, 12, 12, 3]])
  s = bar(s, [20, 20, 20])
  assert.deepEqual(s.lifts.map((l) => l.need), [20, 20, 20])
})

test('a miss costs a life and the same stage comes again, while the others climb on', () => {
  let s = bar(start(2), [12, 11])
  assert.deepEqual(s.lifters.map((l) => [l.stage, l.lives, l.out]), [[1, 3, false], [0, 2, false]])
  // Everyone lifts in the same round, each at their own bar.
  assert.deepEqual([rules.turn(s), s.lifts.map((l) => l.need)], [[0, 1], [16, 12]])
  assert.deepEqual(s.last?.results[1], { side: 1, stage: 0, ok: false, count: 11, need: 12, at: LIFT_MS, chalk: false, lives: 2, out: false })
  s = bar(s, [17, 12])
  assert.deepEqual(s.lifters.map((l) => [l.stage, l.lives]), [[2, 3], [1, 2]])
  assert.equal(rules.result(s), null)
})

test('three misses and a lifter is out; the last one still lifting wins', () => {
  // Hands good for 37 taps and for 27: the ladder stops them at its seventh stage and its fifth.
  let s = start(2)
  for (let round = 0; round < 6; round++) s = bar(s, [37, 27])
  assert.deepEqual(s.lifters.map((l) => [l.stage, l.lives, l.out]), [[6, 3, false], [4, 1, false]])
  assert.equal(rules.result(s), null)
  s = bar(s, [37, 27])
  assert.deepEqual(s.lifters.map((l) => [l.stage, l.lives, l.out]), [[6, 2, false], [4, 0, true]])
  assert.deepEqual([rules.result(s), rules.turn(s)], [{ winners: [0] }, []])
})

test('a lifter who is out watches; the meet goes on while two are still lifting', () => {
  let s = start(3)
  for (let round = 0; round < 3; round++) s = bar(s, [30, 30, 0])
  assert.deepEqual([s.lifters[2].out, rules.turn(s), rules.result(s), s.last?.results.length], [true, [0, 1], null, 3])
  s = bar(s, [30, 30, 0])
  assert.deepEqual([s.last?.results.length, s.lifters.map((l) => l.stage)], [2, [4, 4, 0]])
})

test('level on stages: whoever got there in an earlier round wins; in the same round, whoever locked it out sooner', () => {
  const meet = (first: (number | number[])[], rest: (number | number[])[]) => {
    let s = bar(start(2), first)
    while (!s.winners) s = bar(s, rest)
    return s
  }
  // The first lifter slips at the start; both stop at the fourth stage and go out together. The one who never slipped was there a round sooner.
  const slipped = meet([0, 22], [22, 22])
  assert.deepEqual([slipped.lifters.map((l) => [l.stage, l.reached?.round]), rules.result(slipped)], [[[3, 3], [3, 2]], { winners: [1] }])
  // Nobody slips: the third stage is made in the same round, one of them a tenth of a second sooner.
  const sooner = spread(22).map((t) => t - 100)
  assert.deepEqual(rules.result(meet([spread(22), sooner], [spread(22), sooner])), { winners: [1] })
  // Level on all of it is a draw.
  assert.deepEqual(rules.result(meet([22, 22], [22, 22])), { winners: [] })
})

test('the taps on a bar nobody made decide nothing: the stages do', () => {
  let s = start(2)
  const sooner = spread(22).map((t) => t - 100)
  for (let round = 0; round < 3; round++) s = bar(s, [spread(22), sooner])
  // 25 asked, three times: the first lifter gets 24 of them every time, the second none at all.
  for (let round = 0; round < 3; round++) s = bar(s, [24, 0])
  assert.deepEqual([s.lifters.map((l) => l.stage), rules.result(s)], [[3, 3], { winners: [1] }])
})

test('whoever clears the last stage has won the meet', () => {
  let s = start(2)
  for (let stage = 0; stage < STAGES - 1; stage++) s = bar(s, [75, 75])
  assert.equal(rules.result(s), null)
  // 69 asked: the first lifter's 69th tap comes before the second's.
  s = bar(s, [75, 69])
  assert.deepEqual([s.lifters.map((l) => l.stage), rules.result(s), rules.turn(s)], [[STAGES, STAGES], { winners: [0] }, []])
})

test('a lift comes in batches, everyone sees the count climb, and the last tap ends it at once', () => {
  let s = start(2)
  const taps = spread(20)
  const send = (from: number, to: number) => {
    const out = rules.move(s, 0, { round: 0, taps: taps.slice(from, to) }, late(s))
    assert.ok(!isRefusal(out))
    s = out
  }
  send(0, 4)
  assert.deepEqual(rules.view(s, 1).lifts[0], { chalk: false, need: 12, count: 4, lockedAt: null, done: false })
  assert.deepEqual(rules.turn(s), [0, 1])
  send(4, 9)
  assert.equal(rules.view(s, 1).lifts[0].count, 9)
  // The rest: the twelfth tap locks the bar out, and the lift is over without a word.
  send(9, taps.length)
  const done = rules.view(s, 1).lifts[0]
  assert.deepEqual([done.done, done.count, done.lockedAt], [true, 12, taps[11]])
  assert.deepEqual(rules.turn(s), [1])
  assert.deepEqual(rules.move(structuredClone(s), 0, lift(s, 20), late(s)), { refused: 'You have lifted this bar.' })
})

test('only taps hands could have made count: no machine-gun bursts, and none later than the table clock', () => {
  const s = start(2)
  const at = (ms: number): Ctx => ({ players: 2, now: s.openedAt + ms, random: () => 0.5 })
  const counted = (taps: number[], ctx = at(12_000)) => {
    const out = rules.move(structuredClone(s), 0, { round: 0, taps }, ctx)
    assert.ok(!isRefusal(out))
    return out.lifts[0].taps.length
  }
  // Two thumbs landing together are two taps.
  assert.equal(counted([100, 100, 300, 300]), 4)
  // A hundred taps in half a second: no more than a burst in each stretch of time.
  assert.equal(counted(Array.from({ length: 100 }, (_, i) => i * 5)), BURST.taps * 2)
  // A whole lift sent one second after the count could have ended: only the first second happened.
  assert.equal(counted(spread(50), at(COUNT_MS + 1000)), 10)
  // And nobody gets to the bar before the count is over.
  assert.equal(counted(spread(50), at(COUNT_MS - 100)), 0)
  // Nobody has the hands for more than this in the time there is.
  assert.ok((LIFT_MS / BURST.ms) * BURST.taps < MAX_TAPS)
})

test('chalk asks for a tenth fewer taps, once a meet, and only before the bar moves', () => {
  const s = start(2)
  assert.equal(needWith(12, true), 11)
  // 11 taps: not enough dry, enough chalked.
  const dry = rules.move(structuredClone(s), 0, lift(s, 11), late(s))
  const chalked = rules.move(structuredClone(s), 0, lift(s, 11, { chalk: true }), late(s))
  assert.ok(!isRefusal(dry) && !isRefusal(chalked))
  assert.deepEqual([dry.lifts[0].lockedAt === null, chalked.lifts[0].lockedAt === null, chalked.lifts[0].need, chalked.lifters[0].chalk], [true, false, 11, 0])
  const moved = rules.move(structuredClone(s), 0, { round: 0, taps: [100] }, late(s))
  assert.ok(!isRefusal(moved))
  assert.deepEqual(rules.move(moved, 0, { round: 0, taps: [300], chalk: true }, late(s)), { refused: 'Chalk up before the bar moves.' })
  // The next stage is dry again, and there is no more chalk.
  const next = bar(chalked, [0, 20])
  assert.equal(next.lifts[0].need, 16)
  assert.deepEqual(rules.move(structuredClone(next), 0, lift(next, 30, { chalk: true }), late(next)), { refused: 'No chalk left.' })
  assert.ok(rules.moves!(next, 0).every((m) => !m.chalk))
})

test('nobody can hold a round open: a batch that comes long after the bar went on closes the lift', () => {
  const s = start(2)
  const at = (ms: number): Ctx => ({ players: 2, now: s.openedAt + ms, random: () => 0.5 })
  const inTime = rules.move(structuredClone(s), 0, { round: 0, taps: [100] }, at(CLOSES_MS - 1000))
  assert.ok(!isRefusal(inTime))
  assert.equal(inTime.lifts[0].done, false)
  const closed = rules.move(structuredClone(s), 0, { round: 0, taps: [100] }, at(CLOSES_MS + 1))
  assert.ok(!isRefusal(closed))
  assert.deepEqual([closed.lifts[0].done, rules.turn(closed)], [true, [1]])
  // And a batch with nothing in it is no move at all.
  assert.deepEqual(rules.move(structuredClone(s), 0, { round: 0, taps: [] }, at(1000)), { refused: 'Tap to lift.' })
})

test('bad batches are refused, and one for a bar that is over says so', () => {
  const s = start(2)
  const refused = (move: unknown) => rules.move(structuredClone(s), 0, move as never, late(s))
  assert.deepEqual(refused({ round: 3, taps: [100] }), { refused: 'That bar is over.' })
  assert.deepEqual(refused('lift'), { refused: 'That bar is over.' })
  assert.deepEqual(refused({ round: 0, taps: 40 }), { refused: 'Tap to lift.' })
  assert.deepEqual(refused({ round: 0, taps: [300, 200] }), { refused: 'Tap to lift.' })
  assert.deepEqual(refused({ round: 0, taps: [1.5] }), { refused: 'Tap to lift.' })
  assert.deepEqual(refused({ round: 0, taps: Array(MAX_TAPS + 1).fill(10) }), { refused: 'Tap to lift.' })
  assert.deepEqual(refused({ round: 0, taps: [100], kg: 500 }), { refused: 'Tap to lift.' })
  assert.deepEqual(refused({ round: 0, taps: [100], done: 'yes' }), { refused: 'Tap to lift.' })
  // A stand-in lift is one of the listed paces and nothing else.
  assert.deepEqual(refused({ round: 0, pace: 99 }), { refused: 'Tap to lift.' })
  assert.deepEqual(refused({ round: 0, pace: PACES[0], taps: [100] }), { refused: 'Tap to lift.' })
  assert.deepEqual(refused({ round: 0 }), { refused: 'Tap to lift.' })
})

test('the stand-in lifts the rules list are whole lifts whatever the clock says: a bot climbs the ladder too', () => {
  const s = start(3)
  // A bot moves as soon as the bar goes on, long before the count is over.
  const early: Ctx = { players: 3, now: s.openedAt + 700, random: () => 0.5 }
  const listed = rules.moves!(s, 1)
  assert.equal(listed.length, PACES.length * 2)
  for (const move of listed) assert.ok(!isRefusal(rules.move(structuredClone(s), 1, move, early)))
  const slowest = rules.move(structuredClone(s), 1, { round: 0, pace: Math.min(...PACES) }, early)
  assert.ok(!isRefusal(slowest))
  assert.deepEqual([slowest.lifts[1].done, slowest.lifts[1].lockedAt !== null, rules.moves!(slowest, 1)], [true, true, []])
  // The slowest of them makes the first stage of the hardest ladder; the fastest stops well short of the top.
  assert.ok((Math.min(...PACES) * LIFT_MS) / 1000 >= FIRST.max)
  assert.ok((Math.max(...PACES) * LIFT_MS) / 1000 < start(3, 0).ladder[STAGES - 2])
  // A lift that is under way can only be closed.
  const begun = rules.move(structuredClone(s), 1, { round: 0, taps: [100] }, late(s))
  assert.ok(!isRefusal(begun))
  assert.deepEqual(rules.moves!(begun, 1), [{ round: 0, taps: [], done: true }])
  assert.deepEqual(rules.move(structuredClone(begun), 1, { round: 0, pace: PACES[0] }, late(s)), { refused: 'Tap to lift.' })
  // A table of nothing but bots gets up the ladder and ends with somebody ahead.
  const game = startGame(rules, { players: 2, seed: 4 })
  for (let n = 0; !game.over && n < 100; n++) {
    const side = game.turn[0]
    const moves = game.moves(side)
    assert.deepEqual(game.move(side, moves[(n * 7) % moves.length]), { ok: true })
  }
  assert.ok(game.over)
  assert.ok(Math.max(...game.view(null).lifters.map((l) => l.stage)) >= 2)
  assert.ok(game.replays())
})

test('a lifter who leaves is out of it; the meet goes on, and the last one at the table wins', () => {
  let s = start(3)
  const first = rules.move(s, 0, lift(s, 20), late(s))
  assert.ok(!isRefusal(first))
  s = rules.leave!(first, 2, late(first))
  assert.deepEqual([rules.turn(s), rules.result(s), s.lifters[2].gone], [[1], null, true])
  // The round is settled without them, and the other two lift on.
  s = bar(s, [20, 20])
  assert.deepEqual([s.round, rules.turn(s), s.last?.results.length], [1, [0, 1], 2])
  s = rules.leave!(s, 0, late(s))
  assert.deepEqual(rules.result(s), { winners: [1] })
})

test('when the one lifter still at the bar leaves, the round is settled for the others', () => {
  let s = start(3)
  for (const side of [0, 1]) {
    const out = rules.move(s, side, lift(s, 20), late(s))
    assert.ok(!isRefusal(out))
    s = out
  }
  assert.deepEqual(rules.turn(s), [2])
  s = rules.leave!(s, 2, late(s))
  assert.deepEqual([s.round, rules.turn(s), s.lifters.map((l) => l.stage), rules.result(s)], [1, [0, 1], [1, 1, 0], null])
})

test('two level at the top of three share the win: only a table level all round is a draw', () => {
  let s = start(3)
  // Two lifters with the very same hands, and a third who never makes a bar.
  while (!s.winners) s = bar(s, [22, 22, 0])
  assert.deepEqual([s.lifters.map((l) => l.stage), rules.result(s)], [[3, 3, 0], { winners: [0, 1] }])
})

test('the view shows the counts, never the taps themselves or the table clock', () => {
  const s = start(2)
  const out = rules.move(s, 0, { round: 0, taps: [100, 300] }, late(s))
  assert.ok(!isRefusal(out))
  const liftKeys = ['chalk', 'count', 'done', 'lockedAt', 'need']
  for (const side of [0, 1, null]) {
    const view = rules.view(out, side) as unknown as Record<string, object[]>
    assert.deepEqual(Object.keys(view).sort(), ['ladder', 'last', 'lifters', 'lifts', 'round', 'winners'])
    assert.deepEqual(view.lifts.map((l) => Object.keys(l).sort()), [liftKeys, liftKeys])
  }
})

test('leaving cannot win: those who stay settle it between them, whatever stage the leaver was on', () => {
  let s = start(3)
  // After three rounds: the first has made three stages, the second one (and has one life left), the third is out.
  for (let round = 0; round < 3; round++) s = bar(s, [20, 12, 0])
  assert.deepEqual(s.lifters.map((l) => [l.stage, l.lives, l.out]), [[3, 3, false], [1, 1, false], [0, 0, true]])
  s = rules.leave!(s, 0, late(s))
  // One lifter still in, and ahead of the one who is out: it is theirs.
  assert.deepEqual(rules.result(s), { winners: [1] })
})

test('out of time: the bar stays where the taps left it, and a lifter who never touched it is out of the meet', () => {
  let s = start(2)
  const some = rules.move(s, 0, { round: 0, taps: [200, 400, 600] }, late(s))
  assert.ok(!isRefusal(some))
  s = rules.timeout!(some, 0, late(some))
  assert.deepEqual([rules.turn(s), s.lifts[0].done], [[1], true])
  s = rules.timeout!(s, 1, late(s))
  // A miss for the one who was lifting; the one who was not there at all does not hold the table up twice more.
  assert.deepEqual(s.lifters.map((l) => [l.stage, l.lives, l.out]), [[0, 2, false], [0, 0, true]])
  // Level on stages with the one who is out, so not the winner yet: a stage has to be made.
  assert.deepEqual([rules.result(s), rules.turn(s)], [null, [0]])
  assert.deepEqual(rules.result(bar(structuredClone(s), [12])), { winners: [0] })
  let never = structuredClone(s)
  while (!never.winners) never = bar(never, [0])
  assert.deepEqual(rules.result(never), { winners: [] })
  // The same at a table with its own clock and dice: nobody there is a draw, and it replays the same.
  const game = startGame(rules, { players: 2, seed: 3 })
  game.timeout(0)
  game.timeout(1)
  assert.deepEqual(game.over, { winners: [] })
  assert.deepEqual(game.notes, [])
  assert.ok(game.replays())
})

test('standing: more stages first, then the earlier round, then the sooner lockout', () => {
  const on = (stage: number, round = 0, at = 0): Lifter => ({ ...start(2).lifters[0], stage, reached: stage ? { round, at } : null })
  assert.ok(ahead(on(3, 5, 4000), on(2, 1, 100)) < 0)
  assert.ok(ahead(on(2, 1, 100), on(3, 5, 4000)) > 0)
  assert.ok(ahead(on(3, 2, 4000), on(3, 3, 100)) < 0)
  assert.ok(ahead(on(3, 2, 3000), on(3, 2, 3100)) < 0)
  assert.equal(ahead(on(3, 2, 3000), on(3, 2, 3000)), 0)
  assert.equal(ahead(on(0), on(0)), 0)
})

test('the end card has its numbers: the fastest hands, and the stages made on the last life', () => {
  let s = start(2)
  s = bar(s, [0, 20])
  s = bar(s, [0, 20])
  // Down to the last life, the first lifter makes the stage.
  s = bar(s, [12, 20])
  assert.deepEqual([s.lifters[0].lives, s.lifters[0].clutch, s.lifters[0].reached], [1, 1, { round: 2, at: LIFT_MS }])
  assert.deepEqual([s.lifters[1].clutch, s.lifters[1].rate], [0, 4])
})

for (const players of [2, 3, 4])
  test(`300 random meets for ${players} all end, with no problems`, () => {
    const report = fuzz(rules, { games: 300, players })
    // A busy machine can make one call look slow; only real problems count here (check-game times the calls itself).
    assert.deepEqual(report.problems.filter((p) => !/ took \d+ ms\./.test(p.text)), [])
    assert.equal(report.ended, 300)
    // The bots lift: nearly every meet ends with somebody ahead, not with everyone level at the bottom.
    assert.ok(report.draws < 45, `${report.draws} draws`)
  })
