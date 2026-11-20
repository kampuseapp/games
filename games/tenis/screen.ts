// Tenis's screen: an indoor court from above, you at the bottom, and the court itself is the controller.
// Tap your half to run to a lane; tap their half to hit there, as the ring closes on the ball. To serve, tap your
// half to toss the ball and their half as it peaks. The screen only measures the taps (when you ran, when you
// swung); the rules (rules.ts) decide every shot, and everything shown here is something they confirmed.
import { connect, type Turn } from '@kampuse/games-kit'
import { MAX_RUNS, MIDDLE, RUN_MS, TIMING, TOSS_PEAK, marginFor, type Ball, type Event, type Run, type View } from './rules'
import { buzz, callout, confetti, escape, finale, floatText, myTurn, paintStatus, reducedMotion, sayer, seat, sfx, shake, stopwatch, TONES, wireCommon, type Award } from './ui'

const TURN_SECONDS = 15
const WORDS = {
  tr: {
    you: 'Sen', serving: 'servis', left2: 'kalktı', watching: 'İzliyorsun',
    toss: 'Servis sende', toss2: '2. servis', hintToss: 'Kendi sahana dokun: top havaya kalkar.',
    swing: 'ŞİMDİ VUR!', hintSwing: 'Top tepedeyken rakip sahada bir şeride dokun.',
    receive: 'Top sende!', hintReceive: 'Koş: kendi sahana dokun · Vur: çember kapanırken rakip sahaya dokun.',
    away: 'Top rakipte', theyServe: '{name} servis atıyor', hintHunch: 'Nereye vuracağını sezdin mi? Şimdiden o yana dokun.',
    keys: 'Klavye: A S D koş · J K L vur · boşluk servis',
    golden: 'ALTIN SAYI', gamePoint: 'OYUN SAYISI', matchPoint: 'MAÇ SAYISI', rally: 'RALLİ {n}',
    perfect: 'KUSURSUZ', good: 'İYİ', weak: 'ZAYIF', smash: 'SMAÇ!', early: '{ms} ms erken', late: '{ms} ms geç', tooEarly: 'çok erken',
    fault: 'Hata!', double: 'Çift hata', ace: 'ACE!', winner: 'Sayı!', whiff: 'Iska!', out: 'Out!',
    toldFault: '{name}: servis hatası, bir hakkı daha var', toldDouble: '{name} çift hata yaptı', toldAce: '{name} servisi karşılayamadı',
    toldWinner: '{n} vuruşluk ralli · {name} topa yetişemedi', toldWhiff: '{n} vuruşluk ralli · {name} ıskaladı', toldOut: '{n} vuruşluk ralli · {name} zayıf vurup dışarı attı',
    youWon: 'Maç senin!', won: '{name} kazandı', watchText: 'Ne maçtı!', wonText: 'Kort seni alkışlıyor.', lostText: 'Rövanş? Tekrar masaya otur.',
    awardRally: 'En uzun ralli', shots: '{n} vuruş', awardPerfect: 'Kusursuz vuruş', awardAces: 'Ace', awardSmash: 'Smaç', awardClean: 'Yetişilemeyen top',
    leave: 'Kortu terk et',
    'Tap a lane to hit.': 'Vurmak için bir şeride dokun.', 'Swing at the ball.': 'Topa vur.', 'Too many runs.': 'Çok fazla koşu.', 'Run to a lane.': 'Bir şeride koş.',
    'Not your turn.': 'Sıra sende değil.', 'The game is over.': 'Maç bitti.',
  },
  en: {
    you: 'You', serving: 'serving', left2: 'left', watching: 'Watching',
    toss: 'Your serve', toss2: 'Second serve', hintToss: 'Tap your half: the ball goes up.',
    swing: 'HIT IT NOW!', hintSwing: 'Tap a lane on their half as the ball peaks.',
    receive: 'Your ball!', hintReceive: 'Run: tap your half · Hit: tap their half as the ring closes.',
    away: 'Ball is theirs', theyServe: '{name} is serving', hintHunch: 'A hunch where it goes? Tap that side now.',
    keys: 'Keys: A S D run · J K L hit · space serves',
    golden: 'DECIDING POINT', gamePoint: 'GAME POINT', matchPoint: 'MATCH POINT', rally: 'RALLY {n}',
    perfect: 'PERFECT', good: 'GOOD', weak: 'WEAK', smash: 'SMASH!', early: '{ms} ms early', late: '{ms} ms late', tooEarly: 'too early',
    fault: 'Fault!', double: 'Double fault', ace: 'ACE!', winner: 'Winner!', whiff: 'Missed!', out: 'Out!',
    toldFault: '{name}: a fault, one more try', toldDouble: '{name} double-faulted', toldAce: '{name} could not return the serve',
    toldWinner: 'A rally of {n} · {name} could not reach it', toldWhiff: 'A rally of {n} · {name} missed the ball', toldOut: 'A rally of {n} · {name} hit it weakly and wide',
    youWon: 'Match is yours!', won: '{name} won', watchText: 'What a match!', wonText: 'The court applauds.', lostText: 'Rematch? Sit down again.',
    awardRally: 'Longest rally', shots: '{n} shots', awardPerfect: 'Perfect hits', awardAces: 'Aces', awardSmash: 'Smashes', awardClean: 'Unreachable balls',
    leave: 'Leave the court',
    'Tap a lane to hit.': 'Tap a lane to hit.', 'Swing at the ball.': 'Swing at the ball.', 'Too many runs.': 'Too many runs.', 'Run to a lane.': 'Run to a lane.',
    'Not your turn.': 'Not your turn.', 'The game is over.': 'The match is over.',
  },
}
const POINTS = ['0', '15', '30', '40']
/** A breath after every point before the next serve may go up (ms): time to see what happened. */
const REST_MS = 1100
/** How long the ball keeps flying past the player once it has arrived: the late half of the swing's timing. */
const TAIL_MS = TIMING.weak + 80
/** How far from the ball's arrival a swing still touches it: less for a fast ball, as the rules have it. */
const reach = (ball: Ball) => TIMING.weak * marginFor(ball.ms)
/** A rally this long is worth counting out loud on the court. */
const RALLY_SHOWN = 4

const kampuse = await connect<View>('tenis')
const say = sayer(WORDS[kampuse.lang])
/** I'm at the bottom; a watcher sees side 0 at the bottom. */
const me = (kampuse.watching ? 0 : kampuse.me.side) as 0 | 1
const them = (1 - me) as 0 | 1
/** Lanes as I see them: side 1 looks at the court from the other end. (Its own inverse.) */
const shown = (lane: number) => (me === 0 ? lane : 2 - lane)

// ---------- the court ----------
const W = 300
const H = 470
const LANE_X = [70, 150, 230]
const NET_Y = H / 2
/** Where the players stand, and where each meets the ball. */
const Y = { mine: { token: 416, contact: 392 }, them: { token: 54, contact: 78 } }
type Pt = { x: number; y: number }

const zone = (kind: 'hit' | 'run', i: number) =>
  `<rect class="zone ${kind}" data-${kind}="${i}" x="${30 + i * 80}" y="${kind === 'hit' ? 22 : NET_Y}" width="80" height="${NET_Y - 22}"/>`

const app = document.getElementById('app')!
app.innerHTML = `
  <header class="board" aria-label="score"></header>
  <section class="court-wrap" aria-label="court">
    <svg class="court" viewBox="0 0 ${W} ${H}" role="img" aria-label="court">
      <defs>
        <pattern id="wood" width="40" height="12" patternUnits="userSpaceOnUse">
          <rect width="40" height="12" fill="#b9864f"/><rect y="11" width="40" height="1" fill="#9c6c3b"/><rect x="26" width="1" height="12" fill="#a67443"/>
        </pattern>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#wood)"/>
      <rect x="22" y="14" width="${W - 44}" height="${H - 28}" rx="4" fill="#2b5d8a"/>
      <g class="zones">${[0, 1, 2].map((i) => zone('hit', i) + zone('run', i)).join('')}</g>
      <g fill="none" stroke="#f3efe6" stroke-width="3" pointer-events="none">
        <rect x="30" y="22" width="${W - 60}" height="${H - 44}"/>
        <line x1="110" y1="22" x2="110" y2="${H - 22}" stroke-dasharray="2 7" stroke-width="1.5" opacity="0.45"/>
        <line x1="190" y1="22" x2="190" y2="${H - 22}" stroke-dasharray="2 7" stroke-width="1.5" opacity="0.45"/>
        <line x1="30" y1="130" x2="${W - 30}" y2="130"/><line x1="30" y1="${H - 130}" x2="${W - 30}" y2="${H - 130}"/>
        <line x1="150" y1="130" x2="150" y2="${H - 130}"/>
      </g>
      <text class="rally" x="150" y="${NET_Y - 14}" text-anchor="middle" pointer-events="none"></text>
      <g pointer-events="none">
        <rect x="14" y="${NET_Y - 3}" width="${W - 28}" height="6" fill="#0b0c0e"/>
        <rect x="14" y="${NET_Y - 1}" width="${W - 28}" height="2" fill="#f3efe6" opacity="0.8"/>
      </g>
      <g pointer-events="none">
        <circle class="hunch hidden" r="19"/>
        <g class="token them"><ellipse class="shadow" rx="16" ry="6" cy="12"/><circle class="body" r="15"/><text dy="5"></text></g>
        <g class="token mine"><ellipse class="shadow" rx="16" ry="6" cy="12"/><circle class="body" r="15"/><text dy="5"></text></g>
        <g class="cue hidden"><circle class="ring" r="10"/></g>
        <g class="ball hidden"><ellipse class="ball-shadow" rx="6" ry="2.5" cy="9"/><circle class="ball-body" r="6"/></g>
      </g>
    </svg>
  </section>
  <p class="told" aria-live="polite"></p>
  <div class="status"></div>
  <div class="tape"></div>
  <p class="keys">${say('keys')}</p>
  ${kampuse.watching ? '' : `<button class="leave">${say('leave')}</button>`}`

const boardEl = app.querySelector<HTMLElement>('.board')!
const courtWrap = app.querySelector<HTMLElement>('.court-wrap')!
const svg = app.querySelector<SVGSVGElement>('.court')!
const tokens = { mine: app.querySelector<SVGGElement>('.token.mine')!, them: app.querySelector<SVGGElement>('.token.them')! }
const ballEl = app.querySelector<SVGGElement>('.ball')!
const ballBody = app.querySelector<SVGCircleElement>('.ball-body')!
const cueEl = app.querySelector<SVGGElement>('.cue')!
const ringEl = app.querySelector<SVGCircleElement>('.ring')!
const hunchEl = app.querySelector<SVGCircleElement>('.hunch')!
const rallyEl = app.querySelector<SVGTextElement>('.rally')!
const toldEl = app.querySelector<HTMLElement>('.told')!
const statusEl = app.querySelector<HTMLElement>('.status')!
wireCommon(kampuse, say, app.querySelector('.leave'))

const nameOf = (side: number) => kampuse.players[side]?.name ?? ''
const who = (side: number) => (side === me ? 'mine' : 'them')
for (const side of [me, them]) {
  tokens[who(side)].style.setProperty('--tone', TONES[side])
  tokens[who(side)].querySelector('text')!.textContent = nameOf(side).slice(0, 1).toUpperCase()
}

/** A player's token goes to a lane, taking `ms` to get there. */
function place(side: number, lane: number, ms = 0) {
  const el = tokens[who(side)]
  el.style.transitionDuration = `${ms}ms`
  el.style.transform = `translate(${LANE_X[shown(lane)]}px, ${Y[who(side)].token}px)`
}
/** Where a player meets the ball in a lane, on my screen. */
const contact = (side: number, lane: number): Pt => ({ x: LANE_X[shown(lane)], y: Y[who(side)].contact })
/** A spot on the court as percentages of the wrap, for words that float there. */
const percent = (p: Pt) => ({ x: (p.x / W) * 100, y: (p.y / H) * 100 })

// ---------- the ball and its ring ----------
let bounceTimer = 0
let hideTimer = 0

/** The ball flies from one spot to another in `ms`, and on past it for a moment (the late half of a swing). */
function fly(from: Pt, to: Pt, ms: number, kind: string) {
  clearTimeout(bounceTimer)
  clearTimeout(hideTimer)
  ballEl.getAnimations({ subtree: true }).forEach((a) => a.cancel())
  ballEl.classList.remove('hidden')
  ballEl.dataset.kind = kind
  const past = TAIL_MS / ms
  const beyond = { x: to.x + (to.x - from.x) * past, y: to.y + (to.y - from.y) * past }
  const at = (p: Pt) => `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`
  // The flight is the cue, so it plays whatever the motion setting; only the arc over the net is decoration.
  ballEl.animate([{ transform: at(from) }, { transform: at(to), offset: ms / (ms + TAIL_MS) }, { transform: at(beyond) }], { duration: ms + TAIL_MS, easing: 'linear', fill: 'forwards' })
  if (!reducedMotion()) {
    const lift = kind === 'lob' ? 2.1 : kind === 'smash' ? 1.25 : 1.6
    ballBody.animate([{ transform: 'scale(1)' }, { transform: `scale(${lift})`, offset: 0.42 }, { transform: 'scale(1)', offset: 0.72 }, { transform: 'scale(1.25)', offset: 0.86 }, { transform: 'scale(1)' }], { duration: ms, easing: 'ease-in-out' })
  }
  bounceTimer = window.setTimeout(() => sfx.bounce(), ms * 0.72)
}

/** The ring closes on a spot over `ms`: swing when it meets the ball. Mine is bright, theirs dim. */
function ring(at: Pt, ms: number, mine: boolean) {
  cueEl.classList.remove('hidden')
  cueEl.classList.toggle('dim', !mine)
  cueEl.style.transform = `translate(${at.x}px, ${at.y}px)`
  ringEl.getAnimations().forEach((a) => a.cancel())
  ringEl.animate([{ transform: 'scale(4.6)', opacity: 0.2 }, { transform: 'scale(1)', opacity: 1, offset: ms / (ms + TAIL_MS) }, { transform: 'scale(0.6)', opacity: 0 }], { duration: ms + TAIL_MS, easing: 'linear', fill: 'forwards' })
}
function clearBall(after = 0) {
  clearTimeout(bounceTimer)
  clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => {
    ballEl.classList.add('hidden')
    cueEl.classList.add('hidden')
  }, after)
}

// ---------- what my hands are doing ----------
/** toss: my serve, ball in hand. swing: the toss is up. receive: a ball is coming at me. idle: anything else. */
type Mode = 'toss' | 'swing' | 'receive' | 'idle'
let mode: Mode = 'idle'
/** The court shows what a tap does now (and which lanes are live), the moment it changes. */
function setMode(next: Mode) {
  mode = next
  svg.dataset.mode = next
}
/** The toss in the air: its stopwatch, and the timer that lets it drop. */
let toss: { elapsed: () => number; giveUp: number } | null = null
/** The ball I have to answer: its stopwatch, my runs so far, where they leave me and when I get there. */
let rx: { ball: Ball; elapsed: () => number; runs: Run[]; lane: number; free: number; giveUp: number } | null = null
/** A hunch: the lane I tapped before the ball was struck. I set off the moment it is. */
let hunch: number | null = null
/** When the next serve may go up (performance.now): a breath after each point. */
let serveOpenAt = 0
let lastTooEarly = 0

function showHunch() {
  hunchEl.classList.toggle('hidden', hunch === null)
  if (hunch !== null) hunchEl.style.transform = `translate(${LANE_X[shown(hunch)]}px, ${Y.mine.token}px)`
}

function stopToss() {
  if (toss) clearTimeout(toss.giveUp)
  toss = null
}
function stopReceiving() {
  if (rx) clearTimeout(rx.giveUp)
  rx = null
}

/** The swing every player sees at once: the thwack is mine to hear before the table answers. */
function swingFx() {
  sfx.hit(0.5)
  buzz(10)
  if (!reducedMotion()) tokens.mine.querySelector('.body')!.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 180, easing: 'ease-out' })
}

/** A stray touch long before the ball is there is not a swing: say so, and let them try again. */
function tooEarly(at: Pt) {
  if (performance.now() - lastTooEarly < 500) return
  lastTooEarly = performance.now()
  const p = percent(at)
  floatText(courtWrap, say('tooEarly'), p.x, p.y)
}

function startToss() {
  if (mode !== 'toss' || performance.now() < serveOpenAt) return
  const view = kampuse.last?.view
  if (!view) return
  setMode('swing')
  const elapsed = stopwatch()
  const at = contact(me, view.pos[me])
  // Nobody hit it: the ball drops, a fault.
  const giveUp = window.setTimeout(() => {
    if (mode !== 'swing' || !toss) return
    stopToss()
    setMode('idle')
    kampuse.move({ to: MIDDLE, swing: elapsed() })
  }, TOSS_PEAK + TIMING.weak + 60)
  toss = { elapsed, giveUp }
  clearTimeout(hideTimer)
  ballEl.getAnimations({ subtree: true }).forEach((a) => a.cancel())
  ballEl.classList.remove('hidden')
  ballEl.dataset.kind = 'toss'
  ballEl.style.transform = `translate(${at.x}px, ${at.y}px)`
  // Seen from above, a ball going up comes closer: it grows to the peak, then falls away.
  ballBody.animate([{ transform: 'scale(1)' }, { transform: 'scale(2.4)', offset: 0.5 }, { transform: 'scale(1)' }], { duration: TOSS_PEAK * 2, easing: 'ease-in-out' })
  ring(at, TOSS_PEAK, true)
  sfx.whoosh()
  if (kampuse.last) drawStatus(kampuse.last)
}

/** A tap on my half (lane as the rules count it): toss, run, or a hunch for the next ball. */
function onRun(lane: number) {
  if (mode === 'toss') return startToss()
  if (mode === 'swing') return
  if (!rx) {
    const view = kampuse.last?.view
    if (!view || view.winners || kampuse.watching) return
    hunch = lane === hunch || (lane === view.pos[me] && hunch === null) ? null : lane
    showHunch()
    sfx.tap()
    return
  }
  if (lane === rx.lane || rx.runs.length >= MAX_RUNS) return
  const at = rx.elapsed()
  // A run tapped mid-run waits for the last one to end, here as in the rules.
  rx.free = Math.max(at, rx.free) + Math.abs(lane - rx.lane) * RUN_MS
  rx.runs.push({ lane, at })
  rx.lane = lane
  place(me, lane, rx.free - at)
  sfx.tap(0.25)
}

/** A tap on their half (lane as the rules count it): the swing, aimed there. */
function onHit(to: number) {
  if (mode === 'swing' && toss) {
    const swing = toss.elapsed()
    if (swing < TOSS_PEAK - TIMING.weak) return tooEarly(contact(them, to))
    stopToss()
    setMode('idle')
    kampuse.move({ to, swing })
    swingFx()
  } else if (mode === 'receive' && rx) {
    const swing = rx.elapsed()
    if (swing < rx.ball.ms - reach(rx.ball)) return tooEarly(contact(them, to))
    const runs = rx.runs
    stopReceiving()
    setMode('idle')
    kampuse.move({ to, swing, runs })
    swingFx()
  }
}

/** A ball is coming at me: the stopwatch runs from now, and a hunch sets me off at once. */
function receive(ball: Ball, standing: number) {
  stopReceiving()
  const elapsed = stopwatch()
  // It went by untouched: say so, rather than make everyone wait for the clock.
  const giveUp = window.setTimeout(() => {
    if (!rx || rx.ball.n !== ball.n) return
    const late = { to: MIDDLE, swing: elapsed(), runs: rx.runs }
    stopReceiving()
    setMode('idle')
    kampuse.move(late)
  }, ball.ms + reach(ball) + 60)
  rx = { ball, elapsed, runs: [], lane: standing, free: 0, giveUp }
  setMode('receive')
  const guess = hunch
  hunch = null
  showHunch()
  if (guess !== null) onRun(guess)
}

// Taps count on pointerdown: a swing shouldn't wait for the finger to lift.
svg.addEventListener('pointerdown', (e) => {
  const target = (e.target as Element).closest<SVGElement>('.zone')
  if (!target) return
  if (target.dataset.run !== undefined) onRun(shown(Number(target.dataset.run)))
  else onHit(shown(Number(target.dataset.hit)))
})
const RUN_KEYS: Record<string, number> = { a: 0, s: 1, d: 2, arrowleft: 0, arrowdown: 1, arrowright: 2 }
const HIT_KEYS: Record<string, number> = { j: 0, k: 1, l: 2, 1: 0, 2: 1, 3: 2 }
document.addEventListener('keydown', (e) => {
  if (e.repeat || (e.target as Element).closest?.('button')) return
  const key = e.key.toLowerCase()
  if (key === ' ' && mode === 'toss') startToss()
  else if (key in RUN_KEYS) onRun(shown(RUN_KEYS[key]))
  else if (key in HIT_KEYS) onHit(shown(HIT_KEYS[key]))
  else return
  e.preventDefault()
})

// ---------- the scoreboard and status ----------
/** What is riding on the next point, if anything. */
function stakes(v: View): string {
  const at = (side: number) => v.points[side] === 3
  if (!at(0) && !at(1)) return ''
  const match = ([0, 1] as const).some((s) => at(s) && v.games[s] === 2)
  return match ? say('matchPoint') : at(0) && at(1) ? say('golden') : say('gamePoint')
}

function drawBoard(turn: Turn<View>) {
  const v = turn.view
  const note = (side: 0 | 1) =>
    [side === kampuse.me.side ? say('you') : kampuse.players[side]?.in === false ? say('left2') : '', v.server === side ? `🎾 ${say('serving')}` : ''].filter(Boolean).join(' · ')
  const riding = v.winners ? '' : stakes(v)
  boardEl.innerHTML = `
    ${seat(kampuse.players[me], { now: turn.turn.includes(me), note: note(me) })}
    <div class="led${riding ? ' tense' : ''}" aria-label="${v.games[me]} - ${v.games[them]}">${v.games[me]}<span class="dim">:</span>${v.games[them]}
      <small>${POINTS[v.points[me]]} — ${POINTS[v.points[them]]}${riding ? `<b>${riding}</b>` : ''}</small></div>
    ${seat(kampuse.players[them], { now: turn.turn.includes(them), right: true, note: note(them) })}`
}

function statusText(turn: Turn<View>): string {
  const v = turn.view
  if (v.winners) return ''
  if (kampuse.watching) return `<span class="say">${say('watching')}</span>`
  const line = (title: string, hint: string) => `<span class="say">${title}</span><span class="hint">${hint}</span>`
  if (mode === 'toss') return line(say(v.serveTry === 2 ? 'toss2' : 'toss'), say('hintToss'))
  if (mode === 'swing') return line(say('swing'), say('hintSwing'))
  if (mode === 'receive') return line(say('receive'), say('hintReceive'))
  const title = v.ball ? say('away') : say('theyServe', { name: escape(nameOf(them)) })
  return line(title, say('hintHunch'))
}
const drawStatus = (turn: Turn<View>) => paintStatus(statusEl, statusText(turn), turn, TURN_SECONDS)

function drawRally(v: View) {
  const text = v.rally >= RALLY_SHOWN ? say('rally', { n: v.rally }) : ''
  if (rallyEl.textContent === text) return
  rallyEl.textContent = text
  rallyEl.dataset.heat = v.rally >= 12 ? 'hot' : v.rally >= 8 ? 'warm' : ''
  if (text && !reducedMotion()) rallyEl.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' })
}

// ---------- what the table confirmed ----------
const POINT_TONE: Record<string, 'good' | 'bad' | 'hot'> = { ace: 'hot', winner: 'hot', whiff: 'bad', out: 'bad', double: 'bad', fault: 'bad' }
const HIT_POWER: Record<string, number> = { smash: 1, perfect: 0.75, good: 0.5, weak: 0.25 }

/** The words of the last event, for the line under the court (and for anyone listening instead of looking). */
function tell(e: Event) {
  const name = escape(nameOf(e.by))
  const key = { fault: 'toldFault', double: 'toldDouble', ace: 'toldAce', winner: 'toldWinner', whiff: 'toldWhiff', out: 'toldOut' }[e.kind as string]
  if (key) toldEl.innerHTML = say(key, { name, n: e.rally })
  else if (e.kind === 'serve') toldEl.textContent = ''
}

/** A shot went over, or a point ended: show it, sound it. Only ever for something the rules just confirmed. */
function react(e: Event) {
  const mine = e.by === me && !kampuse.watching
  if (e.kind === 'serve' || e.kind === 'hit') {
    const quality = e.quality ?? 'good'
    const spot = percent({ x: LANE_X[shown(e.at)], y: Y[who(e.by)].token - (e.by === me ? 44 : -34) })
    const off = mine && e.delta !== null && quality !== 'perfect' && quality !== 'smash' ? ` · ${say(e.delta < 0 ? 'early' : 'late', { ms: Math.abs(e.delta) })}` : ''
    floatText(courtWrap, `${say(quality)}${off}`, spot.x, spot.y, quality === 'weak' ? '' : quality === 'good' ? 'good' : 'hot')
    // My own swing already sounded when I tapped; theirs sounds now.
    if (!mine) sfx.hit(HIT_POWER[quality])
    if (mine && (quality === 'perfect' || quality === 'smash')) sfx.perfect()
    if (quality === 'smash') {
      shake(svg, 5)
      buzz([18, 30, 18])
    }
    return
  }
  callout(courtWrap, say(e.kind), POINT_TONE[e.kind], 1000)
  if (e.kind === 'out' || e.kind === 'fault' || e.kind === 'double') {
    // The ball that went wrong: off the side, or long down the middle.
    const from = contact(e.by, e.at)
    const lane = shown(e.to ?? MIDDLE)
    const far = e.by === me ? Y.them.contact : Y.mine.contact
    fly(from, { x: LANE_X[lane] + (lane === 0 ? -58 : lane === 2 ? 58 : 0), y: lane === 1 ? (e.by === me ? 4 : H - 4) : far }, 380, 'out')
  }
  clearBall(600)
  if (e.point === null) return void (mine && sfx.bad())
  // Where the player who lost the point ended up: stranded, or right there and too late.
  place(e.by, e.at, 120)
  if (kampuse.watching) return sfx.good()
  if (e.point === me) {
    sfx.score()
    buzz(30)
  } else sfx.bad()
}

/** A new ball is in the air: it flies, the ring closes where it will be met, and whoever it flies to gets going. */
function launchBall(ball: Ball, turn: Turn<View>, returning: boolean) {
  const v = turn.view
  const to = 1 - ball.hitter
  const mine = to === me && myTurn(kampuse, turn)
  // Back from a reload or from being put away, to a ball struck a while ago: it has long gone by, and the rules
  // count from when it was struck. Say so at once instead of offering a swing that can only be late.
  const age = returning && turn.ends !== null ? TURN_SECONDS * 1000 - (turn.ends - Date.now()) : 0
  if (mine && age > ball.ms + reach(ball)) {
    clearBall()
    return void kampuse.move({ to: MIDDLE, swing: Math.round(age) })
  }
  const from = contact(ball.hitter, ball.from)
  const target = contact(to, ball.to)
  place(ball.hitter, ball.from)
  fly(from, target, ball.ms, ball.kind)
  ring(target, ball.ms, to === me && !kampuse.watching)
  if (mine) return receive(ball, v.pos[me])
  // The other player runs for it; if they don't make it, the rules will say where they ended up.
  place(to, v.pos[to])
  const lanes = Math.abs(ball.to - v.pos[to])
  if (lanes) window.setTimeout(() => kampuse.last?.view.ball?.n === ball.n && place(to, ball.to, lanes * RUN_MS), Math.max(0, Math.min(ball.ms * 0.3, ball.ms - lanes * RUN_MS)))
}

function awards(v: View): Award[] {
  const both = (pair: [number, number]) => `${nameOf(me)} ${pair[me]} · ${nameOf(them)} ${pair[them]}`
  const list: Award[] = [{ icon: '🎾', label: say('awardRally'), value: say('shots', { n: v.stats.longest }) }, { icon: '🎯', label: say('awardPerfect'), value: both(v.stats.perfect) }]
  if (v.stats.aces[0] + v.stats.aces[1]) list.push({ icon: '🚀', label: say('awardAces'), value: both(v.stats.aces) })
  if (v.stats.smashes[0] + v.stats.smashes[1]) list.push({ icon: '💥', label: say('awardSmash'), value: both(v.stats.smashes) })
  if (v.stats.clean[0] + v.stats.clean[1]) list.push({ icon: '🏃', label: say('awardClean'), value: both(v.stats.clean) })
  return list
}

function showFinale(turn: Turn<View>) {
  const v = turn.view
  const [winner] = turn.over?.winners ?? []
  const mineWon = winner === kampuse.me.side
  finale(app, {
    medal: mineWon ? '🏆' : winner === undefined ? '🤝' : '🎾',
    title: mineWon ? say('youWon') : say('won', { name: nameOf(winner ?? 0) }),
    text: kampuse.watching ? say('watchText') : mineWon ? say('wonText') : say('lostText'),
    score: `${v.games[me]} – ${v.games[them]}`,
    awards: awards(v),
  })
  if (mineWon || kampuse.watching) {
    sfx.win()
    confetti(app)
  } else sfx.lose()
}

// ---------- drawing ----------
let seenEvent = -1
let seenBall = -1
/** Just back from being put away: a ball in the air may be an old one. */
let resumed = false
let finished = false
function draw(turn: Turn<View> | null) {
  if (!turn) return
  const v = turn.view
  const loading = seenEvent < 0
  const fresh = !!v.last && v.last.n > seenEvent
  if (v.last && fresh && !loading) react(v.last)
  if (v.last && (fresh || loading)) tell(v.last)
  seenEvent = v.last?.n ?? 0

  if (v.ball && v.ball.n !== seenBall) {
    seenBall = v.ball.n
    launchBall(v.ball, turn, loading || resumed)
    resumed = false
  } else if (!v.ball) {
    // Between points: everyone walks back to the middle, and the next serve waits a breath.
    stopReceiving()
    if (fresh && v.last?.point !== null && v.last !== null) {
      serveOpenAt = performance.now() + (loading ? 0 : REST_MS)
      hunch = null
      showHunch()
      window.setTimeout(() => !kampuse.last?.view.ball && (place(0, MIDDLE, 380), place(1, MIDDLE, 380)), loading ? 0 : 650)
    } else if (loading) {
      place(0, v.pos[0])
      place(1, v.pos[1])
    }
  }
  if (loading && v.ball) {
    place(0, v.pos[0])
    place(1, v.pos[1])
  }

  // What my hands are for now. A toss already in the air stays in the air.
  const mine = !v.winners && myTurn(kampuse, turn)
  if (mine && v.phase === 'serve') setMode(mode === 'swing' ? 'swing' : 'toss')
  else {
    stopToss()
    setMode(mine && rx ? 'receive' : 'idle')
  }

  drawBoard(turn)
  drawRally(v)
  drawStatus(turn)
  if (turn.over && !finished) {
    finished = true
    stopReceiving()
    stopToss()
    window.setTimeout(() => showFinale(turn), reducedMotion() || loading ? 0 : 1300)
  }
}

kampuse.on('view', draw)
kampuse.on('players', () => kampuse.last && drawBoard(kampuse.last))
// Put away: nothing swings or gives up for you. Back: a fresh ball is yours to answer, an old one has gone by.
kampuse.on('pause', () => {
  stopReceiving()
  stopToss()
  setMode('idle')
})
kampuse.on('resume', () => {
  seenBall = -1
  resumed = true
  draw(kampuse.last)
})
// The clock ticks between views.
window.setInterval(() => {
  const turn = kampuse.last
  if (turn && !turn.over) drawStatus(turn)
}, 250)
