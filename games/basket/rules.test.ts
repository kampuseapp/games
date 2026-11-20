// Basket 1v1's rules, tested without a browser: `npm test`.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fuzz, startGame } from '@kampuse/games-kit/testing'
import { isRefusal, type Ctx } from '@kampuse/games-kit/rules'
import rules, { BOX_OUT, LAG_MS, REACT, TARGET, shotChance, type Move, type State } from './rules'

/** A table whose clock moves only when told, with rolls in order (0.5 once they run out). Side 0 attacks first. */
function table(...rolls: number[]) {
  const ctx: Ctx = { players: 2, now: 0, random: () => rolls.shift() ?? 0.5 }
  let state = rules.setup({ ...ctx, random: () => 0.1 })
  const play = (side: number, move: Move, after = 0) => {
    ctx.now += after
    const out = rules.move(state, side, move, ctx)
    assert.ok(!isRefusal(out), JSON.stringify(out))
    state = out
    return state
  }
  return { ctx, play, get state(): State { return state } }
}

test('a waiting defender has to slide the right way, fast', () => {
  const t = table()
  t.play(0, { drive: 'left' })
  t.play(1, { guess: null })
  assert.equal(t.state.phase, 'react')
  assert.equal(rules.view(t.state, 1).drive, 'left')
  t.play(1, { drive: 'left', ms: 400 }, 400)
  assert.equal(t.state.last?.outcome, 'tight')
  assert.equal(t.state.phase, 'shoot')

  const slow = table()
  slow.play(0, { drive: 'step' })
  slow.play(1, { guess: null })
  slow.play(1, { drive: 'step', ms: REACT.tight + 50 }, REACT.tight + 50)
  assert.equal(slow.state.last?.outcome, 'trail')

  const wrong = table()
  wrong.play(0, { drive: 'right' })
  wrong.play(1, { guess: null })
  wrong.play(1, { drive: 'left', ms: 200 }, 200)
  assert.equal(wrong.state.last?.outcome, 'open')
})

test('the drive stays hidden while the defender guesses; a right guess may steal, a wrong one is beaten', () => {
  const game = startGame(rules, { players: 2, seed: 2 })
  const att = game.view(0).attacker
  game.move(att, { drive: 'right' })
  assert.equal(game.view(1 - att).drive, null)
  assert.equal(game.view(1 - att).mine, null)
  assert.equal(JSON.stringify(game.view(1 - att)).includes('right'), false)

  const steal = table(0.0)
  steal.play(0, { drive: 'left' })
  steal.play(1, { guess: 'left' })
  assert.equal(steal.state.last?.outcome, 'steal')
  assert.equal(steal.state.attacker, 1)

  const beaten = table()
  beaten.play(0, { drive: 'left' })
  beaten.play(1, { guess: 'step' })
  assert.equal(beaten.state.last?.outcome, 'open')
})

test('a lightning slide can steal it', () => {
  const t = table(0.0)
  t.play(0, { drive: 'left' })
  t.play(1, { guess: null })
  t.play(1, { drive: 'left', ms: 150 }, 150)
  assert.equal(t.state.last?.outcome, 'steal')
  assert.deepEqual([t.state.stats.steals, t.state.stats.quickest], [[0, 1], [0, 150]])
})

test('a made three counts three, heats you up, and the ball changes hands', () => {
  const t = table(0.0)
  t.play(0, { drive: 'step' })
  t.play(1, { guess: 'left' })
  t.play(0, { shot: 'three', aim: 100 })
  assert.equal(t.state.phase, 'contest')
  assert.equal(rules.view(t.state, 1).shot, 'three')
  t.play(1, { ms: 500 }, 500)
  assert.equal(t.state.last?.outcome, 'make')
  assert.deepEqual(t.state.score, [3, 0])
  assert.equal(t.state.streak[0], 1)
  assert.equal(t.state.attacker, 1)
  assert.deepEqual(t.state.stats.threes, [1, 0])
})

test('a quick jump on a tight layup can block it', () => {
  const t = table(0.0)
  t.play(0, { drive: 'left' })
  t.play(1, { guess: null })
  t.play(1, { drive: 'left', ms: 400 }, 400)
  t.play(0, { shot: 'layup', aim: 100 })
  t.play(1, { ms: 200 }, 200)
  assert.equal(t.state.last?.outcome, 'block')
  assert.equal(t.state.attacker, 1)
  assert.deepEqual(t.state.stats.blocks, [0, 1])
})

test('a miss is a race for the ball: the defender has the box-out', () => {
  const t = table(0.99)
  t.play(0, { drive: 'step' })
  t.play(1, { guess: 'left' })
  t.play(0, { shot: 'three', aim: 0 })
  t.play(1, { ms: 300 }, 300)
  assert.equal(t.state.last?.outcome, 'miss')
  assert.equal(t.state.phase, 'board')
  // The attacker is quicker, but not by more than the box-out.
  t.play(0, { ms: 300 }, 300)
  t.play(1, { ms: 300 + BOX_OUT - 10 })
  assert.equal(t.state.last?.outcome, 'rebound')
  assert.equal(t.state.attacker, 1)
  assert.deepEqual(t.state.stats.boards, [0, 1])
})

test('a quick offensive board is a putback chance', () => {
  const t = table(0.99, 0.0)
  t.play(0, { drive: 'step' })
  t.play(1, { guess: 'left' })
  t.play(0, { shot: 'three', aim: 0 })
  t.play(1, { ms: 300 }, 300)
  t.play(0, { ms: 200 })
  t.play(1, { ms: 600 })
  assert.equal(t.state.last?.outcome, 'board')
  assert.equal(t.state.phase, 'shoot')
  assert.equal(t.state.putback, true)
  t.play(0, { shot: 'layup', aim: 100 })
  t.play(1, { ms: 900 })
  assert.equal(t.state.last?.outcome, 'putback')
  assert.deepEqual(t.state.score, [2, 0])
})

test('shot chances: a good release, an open look and a hot hand help; a tight, quick contest hurts', () => {
  assert.ok(shotChance('jumper', 100, 'open', 'left', 0, 0) > shotChance('jumper', 20, 'open', 'left', 0, 0))
  assert.ok(shotChance('layup', 80, 'open', 'left', 0, 0) > shotChance('layup', 80, 'tight', 'left', 0, 0))
  assert.ok(shotChance('three', 80, 'open', 'step', 0, 0) > shotChance('three', 80, 'open', 'left', 0, 0))
  assert.ok(shotChance('jumper', 80, 'tight', null, 1, 0) < shotChance('jumper', 80, 'tight', null, 0, 0))
  assert.ok(shotChance('jumper', 80, 'trail', null, 0, 2) > shotChance('jumper', 80, 'trail', null, 0, 0))
})

test('the table clock keeps a claimed reaction honest', () => {
  const t = table()
  t.play(0, { drive: 'left' })
  t.play(1, { guess: null })
  t.play(1, { drive: 'left', ms: 150 }, 2500)
  assert.equal(t.state.last?.ms, 2500 - LAG_MS)
  assert.equal(t.state.last?.outcome, 'open')
})

test(`the first to ${TARGET} wins`, () => {
  const t = table()
  t.ctx.random = () => 0.0 // every shot goes in
  while (!t.state.winners) {
    const att = t.state.attacker
    t.play(att, { drive: 'step' })
    t.play(1 - att, { guess: null })
    t.play(1 - att, { drive: 'left', ms: 300 }, 300)
    t.play(att, { shot: 'three', aim: 100 })
    t.play(1 - att, { ms: 600 }, 600)
  }
  assert.deepEqual(rules.result(t.state), { winners: [0] })
  assert.deepEqual(t.state.score, [12, 9])
  assert.deepEqual(rules.turn(t.state), [])
})

test('bad moves are refused', () => {
  const t = table()
  const s = () => structuredClone(t.state)
  assert.deepEqual(rules.move(s(), 0, { drive: 'up' } as never, t.ctx), { refused: 'Pick a move.' })
  assert.deepEqual(rules.move(s(), 1, { guess: 'up' } as never, t.ctx), { refused: 'Guess the move, or wait.' })
  assert.deepEqual(rules.move(s(), 1, { guess: null, ms: 3 } as never, t.ctx), { refused: 'Guess the move, or wait.' })
  t.play(0, { drive: 'left' })
  assert.deepEqual(rules.move(s(), 0, { drive: 'left' }, t.ctx), { refused: 'You have already chosen.' })
  t.play(1, { guess: null })
  assert.deepEqual(rules.move(s(), 1, { drive: 'left', ms: 1.5 }, t.ctx), { refused: 'Slide left, right or back.' })
  t.play(1, { drive: 'right', ms: 300 })
  assert.deepEqual(rules.move(s(), 0, { shot: 'dunk', aim: 5 } as never, t.ctx), { refused: 'Pick a shot.' })
  assert.deepEqual(rules.move(s(), 0, { shot: 'layup', aim: 300 }, t.ctx), { refused: 'Release first.' })
  t.play(0, { shot: 'layup', aim: 50 })
  assert.deepEqual(rules.move(s(), 1, { ms: 'soon' } as never, t.ctx), { refused: 'Tap in time.' })
})

test('timeouts play on, leaving gives the game away', () => {
  const game = startGame(rules, { players: 2, seed: 5 })
  for (let i = 0; i < 12 && !game.over; i++) for (const side of game.turn) game.timeout(side)
  assert.deepEqual(game.notes, [])
  assert.ok(game.replays())
  game.leave(0)
  assert.deepEqual(game.over, { winners: [1] })
})

test('500 random games all end, with no problems', () => {
  const report = fuzz(rules, { games: 500, players: 2 })
  // A busy machine can make one call look slow; only real problems count here (check-game times the calls itself).
  assert.deepEqual(report.problems.filter((p) => !/ took \d+ ms\./.test(p.text)), [])
  assert.equal(report.ended, 500)
})
