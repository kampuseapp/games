// Ağırlık Kapışması's screen: a ladder of stages, everyone climbing it at once, and two big pads to hammer. A stage is
// a number of taps: get them all in before the time is up and you are on the next one; miss it and it costs a life
// and comes again. There is nothing to choose but when to chalk up. The screen records the taps and sends them in
// small batches, so everyone watches everyone's count climb; the rules (rules.ts) count them and decide every bar.
import { connect, type Turn } from '@kampuse/games-kit'
import { LIFT_MS, LIVES, STAGES, ahead, counts, kgOf, needWith, type Batch, type Round, type View } from './rules'
import { barbell } from './plates'
import { buzz, callout, confetti, escape, finale, myTurn, paintStatus, reducedMotion, sayer, sfx, shake, stopwatch, toast, TONES, wireCommon, type Award } from './ui'

const TURN_SECONDS = 16
const WORDS = {
  tr: {
    stage: 'AŞAMA {n}', taps: '{n} TIK', tapsSmall: '{n} tık', kg: '{kg} kg', next: 'sonraki {n} tık', top: 'son aşama', done: 'YARIŞMA BİTTİ', ladder: 'Aşamalar',
    left2: 'kalktı', out: 'ELENDİ', lives: '{n} hak', made: '{n} aşama',
    pad: 'VUR', padHint: 'iki parmakla', lock: 'KİLİT', cut: 'Kaldırışın yarıda kesildi', and: ' ve ',
    getReady: 'Aşama {stage}: {n} tık', hintReady: '{s} saniyede {n} tık, saniyede ~{rate}. Kaçırırsan bir hak gider.', hintLast: '{s} saniyede {n} tık, saniyede ~{rate}. Son hak: kaçırırsan elenirsin!',
    again: 'TEKRAR', lastLife: 'SON HAK',
    go: 'VUR! VUR! VUR!', hintGo: '{left} tık kaldı',
    waitOthers: 'Diğerleri kaldırıyor…', youAreOut: 'Elendin, izliyorsun', watching: 'İzliyorsun',
    shoutGo: 'VUR!', locked: 'KİLİT!', missed: 'OLMADI', passed: 'GEÇTİN!', lostLife: 'KAÇTI · {n} HAK KALDI', lastLeft: 'KAÇTI · SON HAK!', youOut: 'ELENDİN',
    toldUp: 'Geçti: {names}', toldMiss: 'Kaçırdı: {names}', toldOut: 'Elendi: {names}',
    chalk: 'Tebeşir ×{n}', chalkOn: 'Tebeşirli: {n} tık az', chalkHint: 'Geri sayımda dokun: sıradaki bar senden %10 az tık ister (maçta bir kez)',
    keys: 'Klavye: herhangi bir harf ya da boşluk tuşu',
    youWon: 'Kazandın!', won: '{name} kazandı', draw: 'Berabere!',
    wonMine: '{n} aşama geçtin · en ağır barın {taps} tık ({kg} kg)', wonText: '{n} aşama geçti · en ağır barı {taps} tık ({kg} kg)',
    wonFirst: 'Aşamalar eşit: {n}. aşamayı önce geçen kazandı', wonShared: 'Aynı aşama, aynı tur, aynı an: birincilik ortak', wonTop: 'Merdivenin tepesi: {n} aşamanın hepsi geçildi!', drawText: 'Kimse öne geçemedi', wonLeft: 'Diğerleri salondan çıktı',
    awardHigh: 'En ağır bar', barBy: '{name} · {n} tık ({kg} kg)', awardHands: 'En hızlı eller', perSecond: '{name} · {rate} tık/sn', awardClutch: 'Son hakta geçti', timesBy: '{name} · ×{n}',
    leave: 'Salondan çık',
    'Tap to lift.': 'Kaldırmak için vur.', 'Chalk up before the bar moves.': 'Tebeşir bar kalkmadan sürülür.', 'No chalk left.': 'Tebeşirin bitti.',
    // A batch that crossed with the end of the bar is nothing to tell anyone about.
    'That bar is over.': '', 'You have lifted this bar.': '', 'Not your turn.': '', 'The game is over.': '',
  },
  en: {
    stage: 'STAGE {n}', taps: '{n} TAPS', tapsSmall: '{n} taps', kg: '{kg} kg', next: 'next {n} taps', top: 'last stage', done: 'MEET OVER', ladder: 'Stages',
    left2: 'left', out: 'OUT', lives: 'lives: {n}', made: 'cleared {n}',
    pad: 'TAP', padHint: 'both thumbs', lock: 'LOCKOUT', cut: 'Your lift was cut short', and: ' and ',
    getReady: 'Stage {stage}: {n} taps', hintReady: '{n} taps in {s} seconds, ~{rate} a second. A miss costs a life.', hintLast: '{n} taps in {s} seconds, ~{rate} a second. Last life: miss it and you are out!',
    again: 'AGAIN', lastLife: 'LAST LIFE',
    go: 'TAP! TAP! TAP!', hintGo: '{left} to go',
    waitOthers: 'The others are lifting…', youAreOut: 'You are out, watching', watching: 'Watching',
    shoutGo: 'TAP!', locked: 'LOCKED!', missed: 'NO LIFT', passed: 'STAGE UP!', lostLife: 'MISSED · {n} LIVES LEFT', lastLeft: 'MISSED · LAST LIFE!', youOut: 'YOU ARE OUT',
    toldUp: 'Up: {names}', toldMiss: 'Missed: {names}', toldOut: 'Out: {names}',
    chalk: 'Chalk ×{n}', chalkOn: 'Chalk on: {n} fewer', chalkHint: 'Tap during the count: the coming bar asks you for 10% fewer taps (once a meet)',
    keys: 'Keys: any letter or the space bar',
    youWon: 'You won!', won: '{name} won', draw: 'A tie!',
    wonMine: 'Stages cleared: {n} · your heaviest bar {taps} taps ({kg} kg)', wonText: 'Stages cleared: {n} · heaviest bar {taps} taps ({kg} kg)',
    wonFirst: 'Level on stages: first to clear stage {n} won', wonShared: 'Same stage, same round, same instant: the win is shared', wonTop: 'Top of the ladder: all {n} stages cleared!', drawText: 'Nobody got ahead', wonLeft: 'Everyone else left',
    awardHigh: 'Heaviest bar', barBy: '{name} · {n} taps ({kg} kg)', awardHands: 'Fastest hands', perSecond: '{name} · {rate} taps/s', awardClutch: 'Made it on the last life', timesBy: '{name} · ×{n}',
    leave: 'Leave the gym',
    'Tap to lift.': 'Tap to lift.', 'Chalk up before the bar moves.': 'Chalk up before the bar moves.', 'No chalk left.': 'No chalk left.',
    'That bar is over.': '', 'You have lifted this bar.': '', 'Not your turn.': '', 'The game is over.': '',
  },
}
/** Before a bar: a moment to read what it asks, then three beats, then go (ms). */
const LOOK_MS = 900
const BEAT_MS = 500
const BEATS = 3
/** The first bar comes a little after the screen opens; later ones after the last round's result has been read (ms). */
const FIRST_MS = 700
const RESULT_MS = 1800
/** How often the taps so far go to the table while a lift is on (ms): often enough for the others to see the count climb. */
const BATCH_MS = 300
/** The whole count before a lift, and how much of the turn clock must be left over after a first batch could go (ms). */
const COUNT_IN_MS = LOOK_MS + BEATS * BEAT_MS
const CLOCK_SLACK_MS = 1500
/** How far the bar on the platform travels from the floor to lockout (px in its own drawing). */
const BAR_TRAVEL = 34

const kampuse = await connect<View>('agirlik')
const say = sayer(WORDS[kampuse.lang])
const me = kampuse.watching ? -1 : kampuse.me.side
const decimal = (n: number, digits = 1) => (Number.isInteger(n) ? String(n) : n.toFixed(digits)).replace('.', kampuse.lang === 'tr' ? ',' : '.')
const nameOf = (side: number) => kampuse.players[side]?.name ?? ''
/** The taps the stage a lifter is on asks for, before any chalk. */
const rungOf = (v: View, side: number) => v.ladder[Math.min(v.lifters[side].stage, STAGES - 1)]
const lifts = (v: View, side: number) => !!v.lifters[side] && !v.lifters[side].out && !v.lifters[side].gone

const app = document.getElementById('app')!
app.innerHTML = `
  <header class="meet" aria-live="polite"></header>
  <section class="lifters" aria-label="lifters"></section>
  <section class="platform" aria-label="platform">
    <div class="gauge" role="meter" aria-valuemin="0" aria-label="bar">
      <span class="fill"></span>
      <span class="lock"><small>${say('lock')}</small></span>
    </div>
    <svg class="bar" viewBox="0 0 320 120" role="img" aria-label="barbell"></svg>
    <p class="shout" aria-live="assertive"></p>
    <b class="count led"></b>
  </section>
  <div class="time"><span></span></div>
  <p class="told" aria-live="polite"></p>
  <div class="status"></div>
  <section class="hands" aria-label="tap">
    <button class="hand" data-hand="l"><b>${say('pad')}</b><small>${say('padHint')}</small></button>
    <button class="hand" data-hand="r"><b>${say('pad')}</b><small>${say('padHint')}</small></button>
  </section>
  <p class="keys">${say('keys')}</p>
  <footer class="foot">
    ${kampuse.watching ? '' : `<button class="chalk" aria-pressed="false"></button><button class="leave">${say('leave')}</button>`}
  </footer>`

const meetEl = app.querySelector<HTMLElement>('.meet')!
const liftersEl = app.querySelector<HTMLElement>('.lifters')!
const platformEl = app.querySelector<HTMLElement>('.platform')!
const gaugeEl = app.querySelector<HTMLElement>('.gauge')!
const fillEl = app.querySelector<HTMLElement>('.gauge .fill')!
const barEl = app.querySelector<SVGSVGElement>('.bar')!
const shoutEl = app.querySelector<HTMLElement>('.shout')!
const countEl = app.querySelector<HTMLElement>('.count')!
const timeEl = app.querySelector<HTMLElement>('.time span')!
const toldEl = app.querySelector<HTMLElement>('.told')!
const statusEl = app.querySelector<HTMLElement>('.status')!
const handsEl = app.querySelector<HTMLElement>('.hands')!
const chalkBtn = app.querySelector<HTMLButtonElement>('.chalk')
wireCommon(kampuse, say, app.querySelector('.leave'))
if (kampuse.watching) handsEl.classList.add('hidden')

// ---------- what my hands are doing ----------
/** idle: nothing for me to do. prep: a bar is coming, the count is on. lift: hammering. done: my lift is over. */
type Phase = 'idle' | 'prep' | 'lift' | 'done'
let phase: Phase = 'idle'
function setPhase(next: Phase) {
  phase = next
  app.dataset.phase = next
}
/** The round my hands were last given: its count has started, or its lift was closed. */
let handled = -1
/** Chalk for the coming bar: armed with one tap before the count ends. */
let armed = false
/** Put away: nothing starts and nothing sounds until the player is back. */
let paused = false
let prepTimers: number[] = []
/** The lift under way: what the bar asks of me, every tap, how many have gone to the table, and its clock and timers. */
type Lifting = { round: number; need: number; taps: number[]; sent: number; chalk: boolean; chalkSent: boolean; elapsed: () => number; batch: number; end: number; over: boolean; locked: boolean; closed: boolean }
let lift: Lifting | null = null

type Tone = 'good' | 'bad' | ''
/** The big word over the platform: what the bar asks, the count, GO, how it ended; `over` is a small line above it. With `ms`, it clears itself after that long. */
let shoutTimer = 0
function shout(text: string, tone: Tone = '', ms = 0, over = '') {
  clearTimeout(shoutTimer)
  if (ms) shoutTimer = window.setTimeout(() => shoutEl.replaceChildren(), ms)
  const small = document.createElement('small')
  small.textContent = over
  shoutEl.replaceChildren(...(over ? [small] : []), ...(text ? [text] : []))
  shoutEl.className = `shout ${tone}`
  if (text && !reducedMotion()) shoutEl.animate([{ transform: 'translate(-50%, -50%) scale(1.5)', opacity: 0.4 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 }], { duration: 160, easing: 'ease-out' })
}

function cancelPrep() {
  prepTimers.forEach((t) => clearTimeout(t))
  prepTimers = []
}

/** A bar is coming: the stage and what it asks (a second go at it, or the last life, said out loud), three beats, go. */
function startPrep(v: View, wait: number) {
  cancelPrep()
  const round = v.round
  const lifter = v.lifters[me]
  handled = round
  setPhase('prep')
  timeEl.getAnimations().forEach((a) => a.cancel())
  const again = !!v.last?.results.some((r) => r.side === me && !r.ok)
  const last = lifter.lives === 1
  const over = `${say('stage', { n: lifter.stage + 1 })}${last ? ` · ${say('lastLife')}` : again ? ` · ${say('again')}` : ''}`
  const at = (ms: number, fn: () => void) => prepTimers.push(window.setTimeout(fn, ms))
  at(wait, () => shout(say('taps', { n: needWith(rungOf(v, me), armed) }), last ? 'bad' : '', 0, over))
  for (let beat = 0; beat < BEATS; beat++)
    at(wait + LOOK_MS + beat * BEAT_MS, () => {
      shout(String(BEATS - beat))
      sfx.tick()
    })
  at(wait + COUNT_IN_MS, () => startLift(round))
}

function startLift(round: number) {
  const turn = kampuse.last
  const lifter = turn?.view.lifters[me]
  if (!turn || !lifter || turn.view.round !== round || !myTurn(kampuse, turn)) return setPhase('idle')
  // Chalk the table already has on this bar (this screen was reloaded after chalking up) is not asked for twice.
  const table = turn.view.lifts[me]
  const chalk = table.chalk || (armed && lifter.chalk > 0)
  armed = false
  const need = table.chalk ? table.need : needWith(rungOf(turn.view, me), chalk)
  const now: Lifting = { round, need, taps: [], sent: 0, chalk, chalkSent: table.chalk, elapsed: stopwatch(), batch: 0, end: 0, over: false, locked: false, closed: false }
  lift = now
  setPhase('lift')
  // GO steps aside quickly: the count is what to watch.
  shout(say('shoutGo'), 'good', 600)
  sfx.go()
  buzz(20)
  timeEl.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: LIFT_MS, easing: 'linear', fill: 'forwards' })
  now.batch = window.setInterval(() => sendBatch(now, false), BATCH_MS)
  now.end = window.setTimeout(() => endLift(now), LIFT_MS)
  paintBar()
  drawStatus(turn)
  drawChalk(turn.view)
}

/** The taps since the last batch go to the table (with the chalk on the first one, and `done` on the last). */
function sendBatch(l: Lifting, done: boolean) {
  const taps = l.taps.slice(l.sent)
  if (!taps.length && !done) return
  const move: Batch = { round: l.round, taps }
  if (l.chalk && !l.chalkSent) move.chalk = true
  if (done) {
    move.done = true
    l.closed = true
  }
  l.chalkSent = true
  l.sent = l.taps.length
  kampuse.move(move)
}

function stopTimers(l: Lifting) {
  l.over = true
  clearInterval(l.batch)
  clearTimeout(l.end)
  timeEl.getAnimations().forEach((a) => a.pause())
}

/** The lift is over, locked out or out of time: the last taps go in, and the bar shows how it ended. */
function endLift(l: Lifting) {
  if (l.over) return
  stopTimers(l)
  sendBatch(l, true)
  setPhase('done')
  if (!l.locked) {
    shout(say('missed'), 'bad')
    sfx.clank()
    buzz([20, 40, 20])
  }
  paintBar()
  if (kampuse.last) drawStatus(kampuse.last)
}

/** One tap: one more on the bar. */
function tap() {
  const l = lift
  if (phase !== 'lift' || !l || l.over) return
  const at = l.elapsed()
  // The same test the rules make: what this screen counts is what the table will.
  if (!counts(l.taps, at)) return
  l.taps.push(at)
  // The pitch climbs with the count: you hear how close you are.
  sfx.tap(l.taps.length / l.need)
  paintBar()
  if (kampuse.last) drawStatus(kampuse.last)
  if (l.taps.length < l.need) return
  l.locked = true
  shout(say('locked'), 'good')
  sfx.score()
  buzz(40)
  shake(platformEl, 4)
  endLift(l)
}

// Taps count on pointerdown (two thumbs never wait for each other to lift); every key is a tap too.
handsEl.addEventListener('pointerdown', (e) => {
  const pad = (e.target as Element).closest<HTMLElement>('.hand')
  if (!pad) return
  e.preventDefault()
  tap()
  if (phase !== 'lift' || reducedMotion()) return
  pad.animate([{ transform: 'translateY(5px) scale(0.98)', filter: 'brightness(1.5)' }, { transform: 'none', filter: 'none' }], { duration: 90, easing: 'ease-out' })
})
document.addEventListener('keydown', (e) => {
  if (e.repeat || phase !== 'lift' || e.metaKey || e.ctrlKey || e.altKey || (e.key.length !== 1 && !e.key.startsWith('Arrow'))) return
  e.preventDefault()
  tap()
})
chalkBtn?.addEventListener('click', () => {
  const turn = kampuse.last
  if (!turn || phase === 'lift' || (turn.view.lifters[me]?.chalk ?? 0) <= 0) return
  armed = !armed
  sfx.tap(armed ? 0.6 : 0)
  drawChalk(turn.view)
  drawStatus(turn)
})

// ---------- drawing ----------
/** Whose bar the platform and the header show: mine while I am in it, otherwise the lifter standing highest of those still lifting (-1: nobody). */
function focusOf(v: View): number {
  if (me >= 0 && lifts(v, me)) return me
  const going = v.lifters.map((_, side) => side).filter((side) => lifts(v, side))
  return going.length ? going.reduce((top, side) => (ahead(v.lifters[side], v.lifters[top]) < 0 ? side : top)) : -1
}

/** The count the platform shows, and of how many: my own lift, tap by tap; otherwise what the table has for the bar in focus. */
function shown(v: View): { count: number; need: number } {
  if (lift && lift.round === v.round && me >= 0 && lifts(v, me)) return { count: Math.min(lift.taps.length, lift.need), need: lift.need }
  const side = focusOf(v)
  return side < 0 ? { count: 0, need: v.ladder[0] } : { count: v.lifts[side].count, need: v.lifts[side].need }
}

let shownKg = -1
function paintBar() {
  const v = kampuse.last?.view
  if (!v) return
  const { count, need } = shown(v)
  const kg = kgOf(need)
  if (kg !== shownKg) {
    shownKg = kg
    barEl.innerHTML = barbell(kg)
  }
  const height = Math.min(1, count / need)
  barEl.style.transform = `translateY(${(-BAR_TRAVEL * height).toFixed(1)}px)`
  fillEl.style.transform = `scaleY(${height.toFixed(3)})`
  gaugeEl.setAttribute('aria-valuenow', String(count))
  gaugeEl.setAttribute('aria-valuemax', String(need))
  countEl.textContent = v.winners ? '' : `${count} / ${need}`
  countEl.dataset.done = String(count >= need)
}

const livesText = (n: number) => '●'.repeat(Math.max(0, n)) + '○'.repeat(Math.max(0, LIVES - n))
function setText(el: HTMLElement, text: string) {
  if (el.textContent !== text) el.textContent = text
}

/**
 * The lifters, a lane each: the stage they are on, the lives they have left, and how far along this bar they are,
 * as a number and as a fill. The lanes are built when someone goes out or a seat changes; between those only the
 * numbers and fills move (views come several times a second while everyone is hammering).
 */
let chipsKey = ''
function drawLifters(turn: Turn<View>) {
  const v = turn.view
  const key = JSON.stringify(v.lifters.map((l, side) => [l.out, l.gone, kampuse.players[side]?.name, kampuse.players[side]?.avatar]))
  if (key !== chipsKey) {
    chipsKey = key
    liftersEl.innerHTML = v.lifters
      .map((lifter, side) => {
        const p = kampuse.players[side]
        return `
        <div class="chip${side === me ? ' me' : ''}${lifter.out || lifter.gone ? ' gone' : ''}" style="--tone:${TONES[side]}">
          <span class="lane"></span>
          <img src="${escape(p?.avatar ?? '')}" alt="">
          <span class="who"><b>${escape(p?.name ?? '')}</b><small><span class="on"></span><span class="lives"></span></small></span>
          <span class="state"></span>
        </div>`
      })
      .join('')
  }
  v.lifters.forEach((lifter, side) => {
    const chip = liftersEl.children[side] as HTMLElement | undefined
    const l = v.lifts[side]
    if (!chip) return
    const going = lifts(v, side) && !v.winners
    // My own lane runs ahead of the table: it shows the taps as I make them.
    const mine = side === me && lift && lift.round === v.round ? Math.min(lift.taps.length, lift.need) : l.count
    const state = lifter.gone ? say('left2') : lifter.out ? say('out') : v.winners ? '' : l.done ? (l.lockedAt !== null ? '✓' : '✗') : `${mine}/${l.need}`
    const el = chip.querySelector<HTMLElement>('.state')!
    if (el.textContent !== state) {
      el.textContent = state
      el.className = `state ${going && l.done ? (l.lockedAt !== null ? 'ok' : 'no') : ''}`
    }
    // The stage they are on (or, once it is over for them, how many they made), and their lives as pips.
    setText(chip.querySelector<HTMLElement>('.on')!, going ? say('stage', { n: Math.min(lifter.stage + 1, STAGES) }) : say('made', { n: lifter.stage }))
    const lives = chip.querySelector<HTMLElement>('.lives')!
    setText(lives, lifter.gone ? '' : livesText(lifter.lives))
    lives.setAttribute('aria-label', say('lives', { n: lifter.lives }))
    lives.classList.toggle('last', going && lifter.lives === 1)
    chip.querySelector<HTMLElement>('.lane')!.style.transform = `scaleX(${going ? Math.min(1, mine / l.need).toFixed(3) : 0})`
  })
}

/** The header: the stage in focus and what it asks, and under it the whole ladder, with where everyone is on it. */
let meetKey = ''
function drawMeet(v: View) {
  const side = focusOf(v)
  const mine = me >= 0 ? v.lifters[me] : null
  const pips = v.ladder
    .map((need, i) => {
      const on = !!mine && lifts(v, me) && !v.winners && i === mine.stage
      const dots = v.lifters.map((l, s) => (s !== me && !l.gone && Math.min(l.stage, STAGES - 1) === i ? `<i class="${l.out ? 'out' : ''}" style="--tone:${TONES[s]}"></i>` : '')).join('')
      return `<li class="${mine && i < mine.stage ? 'made' : ''}${on ? ' on' : ''}"${on ? ' aria-current="step"' : ''} title="${say('tapsSmall', { n: need })}"><b>${i + 1}</b><span class="dots">${dots}</span></li>`
    })
    .join('')
  let now = `<p class="now led">${say('done')}</p>`
  if (!v.winners && side >= 0) {
    const need = rungOf(v, side)
    const next = v.ladder[v.lifters[side].stage + 1]
    now = `<p class="now led">${say('stage', { n: v.lifters[side].stage + 1 })}<span class="dim">/${STAGES} ·</span> <b>${say('taps', { n: need })}</b><small>${say('kg', { kg: decimal(kgOf(need)) })} · ${next ? say('next', { n: next }) : say('top')}</small></p>`
  }
  const html = `${now}<ol class="ladder" aria-label="${say('ladder')}">${pips}</ol>`
  if (html === meetKey) return
  meetKey = html
  meetEl.innerHTML = html
}

function drawChalk(v: View) {
  if (!chalkBtn) return
  const lifter = v.lifters[me]
  const left = lifter?.chalk ?? 0
  const on = armed || !!(lift && lift.round === v.round && lift.chalk)
  const need = lifter ? rungOf(v, me) : v.ladder[0]
  chalkBtn.textContent = `🧂 ${on ? say('chalkOn', { n: need - needWith(need, true) }) : say('chalk', { n: left })}`
  chalkBtn.title = say('chalkHint')
  chalkBtn.setAttribute('aria-pressed', String(on))
  chalkBtn.disabled = phase === 'lift' || !!v.winners || (left <= 0 && !on) || !lifts(v, me)
}

function statusText(turn: Turn<View>): string {
  const v = turn.view
  if (v.winners) return ''
  if (kampuse.watching) return `<span class="say">${say('watching')}</span>`
  const lifter = v.lifters[me]
  if (!lifts(v, me)) return `<span class="say">${say('youAreOut')}</span>`
  if (phase === 'lift' && lift) return `<span class="say">${say('go')}</span><span class="hint">${say('hintGo', { left: Math.max(0, lift.need - lift.taps.length) })}</span>`
  if (phase === 'prep') {
    const need = needWith(rungOf(v, me), armed)
    const hint = say(lifter.lives === 1 ? 'hintLast' : 'hintReady', { n: need, s: LIFT_MS / 1000, rate: decimal(Math.round((need / (LIFT_MS / 1000)) * 10) / 10) })
    return `<span class="say">${say('getReady', { stage: lifter.stage + 1, n: need })}</span><span class="hint">${hint}</span>`
  }
  return `<span class="say">${say('waitOthers')}</span>`
}
const drawStatus = (turn: Turn<View>) => paintStatus(statusEl, statusText(turn), turn, TURN_SECONDS)

/** A round is settled: say who went up, who missed, who is out. Only ever what the rules just confirmed. */
function showResult(r: Round) {
  const names = (list: typeof r.results) => list.map((x) => escape(nameOf(x.side))).join(', ')
  const groups: [string, typeof r.results][] = [
    ['toldUp', r.results.filter((x) => x.ok)],
    ['toldMiss', r.results.filter((x) => !x.ok && !x.out)],
    ['toldOut', r.results.filter((x) => x.out)],
  ]
  toldEl.innerHTML = groups.flatMap(([key, list]) => (list.length ? [say(key, { names: names(list) })] : [])).join(' · ')
  const mine = r.results.find((x) => x.side === me)
  if (!mine) return void (r.results.some((x) => x.ok) ? sfx.good() : sfx.bad())
  if (mine.ok) return callout(platformEl, say('passed'), 'good', 1100)
  if (!mine.out) return callout(platformEl, mine.lives === 1 ? say('lastLeft') : say('lostLife', { n: mine.lives }), 'bad', 1300)
  callout(platformEl, say('youOut'), 'bad', 1400)
  sfx.lose()
}

/** Why it ended as it did: the others left, the top of the ladder, more stages, or the same stage reached first. */
function winText(v: View, winners: number[], side: number, best: (side: number) => number): string {
  if (!winners.length) return say('drawText')
  const winner = v.lifters[side]
  const rivals = v.lifters.filter((l, s) => !winners.includes(s) && !l.gone)
  if (!rivals.length || !winner.stage) return say('wonLeft')
  if (winners.length > 1) return say('wonShared')
  if (winner.stage >= STAGES) return say('wonTop', { n: STAGES })
  if (rivals.some((l) => l.stage === winner.stage)) return say('wonFirst', { n: winner.stage })
  return say(side === me ? 'wonMine' : 'wonText', { n: winner.stage, taps: best(side), kg: decimal(kgOf(best(side))) })
}

function showFinale(turn: Turn<View>) {
  const v = turn.view
  const winners = turn.over?.winners ?? []
  const sides = v.lifters.map((_, side) => side)
  const byStanding = (a: number, b: number) => ahead(v.lifters[a], v.lifters[b])
  const stayed = sides.filter((s) => !v.lifters[s].gone)
  // The standings: the winners (in a draw, the lifters level at the top, who shake hands instead of taking medals),
  // then those who stayed as they stood on the ladder, then whoever left: leaving takes no medal.
  const first = winners.length ? winners : stayed.filter((a) => stayed.every((b) => byStanding(a, b) <= 0))
  const rest = stayed.filter((s) => !first.includes(s)).sort(byStanding)
  const left = sides.filter((s) => v.lifters[s].gone).sort(byStanding)
  const order = [...first, ...rest, ...left]
  const medals = ['🥇', '🥈', '🥉', '4.']
  const medal = (s: number) => (left.includes(s) ? '🚪' : first.includes(s) ? (winners.length ? medals[0] : '🤝') : medals[first.length + rest.indexOf(s)])
  const made = (s: number) => (v.lifters[s].gone ? say('left2') : v.lifters[s].stage ? say('made', { n: v.lifters[s].stage }) : '—')
  const podium = order.map((s) => `<span>${medal(s)} ${escape(nameOf(s))}</span><b>${made(s)}</b>`).join('')
  const mineWon = winners.includes(me)
  const top = (score: (side: number) => number) => order.reduce((a, b) => (score(b) > score(a) ? b : a), order[0])
  /** The heaviest bar a lifter made: the rung under the stage they are on. */
  const best = (side: number) => (v.lifters[side].stage ? v.ladder[v.lifters[side].stage - 1] : 0)
  const high = top(best)
  const hands = top((s) => v.lifters[s].rate)
  const clutch = top((s) => v.lifters[s].clutch)
  const awards: Award[] = []
  if (best(high)) awards.push({ icon: '🏋️', label: say('awardHigh'), value: say('barBy', { name: nameOf(high), n: best(high), kg: decimal(kgOf(best(high))) }) })
  if (v.lifters[hands].rate) awards.push({ icon: '⚡', label: say('awardHands'), value: say('perSecond', { name: nameOf(hands), rate: decimal(v.lifters[hands].rate) }) })
  if (v.lifters[clutch].clutch) awards.push({ icon: '🧊', label: say('awardClutch'), value: say('timesBy', { name: nameOf(clutch), n: v.lifters[clutch].clutch }) })
  finale(app, {
    medal: mineWon ? '🏆' : winners.length === 0 ? '🤝' : '🏋️',
    title: winners.length === 0 ? say('draw') : mineWon ? say('youWon') : say('won', { name: winners.map(nameOf).join(say('and')) }),
    text: winText(v, winners, mineWon ? me : winners[0], best),
    score: `<div class="podium">${podium}</div>`,
    awards,
  })
  if (mineWon || kampuse.watching) {
    sfx.win()
    confetti(app)
  } else sfx.lose()
}

let seenResult = -1
let finished = false
function draw(turn: Turn<View> | null) {
  if (!turn) return
  const v = turn.view
  const loading = seenResult < 0
  const settled = !!v.last && v.last.n > seenResult
  if (v.last && settled && !loading && !paused) showResult(v.last)
  seenResult = v.last?.n ?? 0

  // What my hands are for now.
  const mine = v.lifts[me]
  const lifting = !!mine && !v.winners && lifts(v, me) && !mine.done
  if (!lifting) {
    const counting = phase === 'prep'
    cancelPrep()
    // The table closed my lift (the clock ran out, or the meet ended): the hammering stops.
    if (lift && !lift.over) stopTimers(lift)
    setPhase(mine?.done && lifts(v, me) && !v.winners ? 'done' : 'idle')
    if (phase === 'idle') shout('')
    // A lift this screen never made (a bot has the seat, or the clock closed it): the bar still says how it went.
    else if (counting) shout(say(mine.lockedAt !== null ? 'locked' : 'missed'), mine.lockedAt !== null ? 'good' : 'bad')
  } else if (handled !== v.round && !paused) {
    const wait = settled && !loading ? RESULT_MS : FIRST_MS
    // Back too late (a reload, or the screen was put away): a lift of mine is under way that this screen knows
    // nothing of, or the turn clock would run out before a count could end and a first tap reach the table. The
    // lift is closed here and now, as a miss: left to the clock, a bar nobody touched puts its lifter out.
    const left = turn.ends === null ? Infinity : turn.ends - Date.now()
    if (mine.count > 0 || left < wait + COUNT_IN_MS + BATCH_MS + CLOCK_SLACK_MS) {
      handled = v.round
      kampuse.move({ round: v.round, taps: [], done: true })
      setPhase('done')
      toast(say('cut'))
    } else startPrep(v, wait)
  }

  drawMeet(v)
  drawLifters(turn)
  drawChalk(v)
  drawStatus(turn)
  paintBar()
  if (turn.over && !finished) {
    finished = true
    window.setTimeout(() => showFinale(turn), loading || reducedMotion() ? 0 : 1500)
  }
}

kampuse.on('view', draw)
kampuse.on('players', () => kampuse.last && drawLifters(kampuse.last))
// Put away: the count stops and nothing is sent for me. Back: a lift that was cut off is closed with the taps it
// had; a bar I never started gets its count again.
kampuse.on('pause', () => {
  paused = true
  cancelPrep()
  if (lift && !lift.over) stopTimers(lift)
  setPhase('idle')
})
kampuse.on('resume', () => {
  paused = false
  const turn = kampuse.last
  if (!turn) return
  // My lift of this round, if this screen started one: closed now unless its last batch has already gone.
  const mine = lift && lift.round === turn.view.round && myTurn(kampuse, turn) ? lift : null
  if (mine && !mine.closed) {
    sendBatch(mine, true)
    toast(say('cut'))
  }
  if (mine) setPhase('done')
  else handled = -1
  draw(turn)
})
window.setInterval(() => {
  const turn = kampuse.last
  if (turn && !turn.over) drawStatus(turn)
}, 250)
