// Basket 1v1's screen: the gym's half court, hoop at the top, the same for both players. The attacker drives and
// shoots on a release meter; the defender guesses or reacts, jumps at the shot, and both race for rebounds.
// The screen only measures (the release, the reaction times); the rules (rules.ts) decide every play.
import { connect, type Turn } from '@kampuse/games-kit'
import { BOX_OUT, CONTEST_MS, DRIVES, POINTS, REACT, SHOTS, SWEET, shotChance, type Drive, type Move, type Play, type Shot, type View } from './rules'
import { buzz, callout, confetti, escape, finale, laneKey, myTurn, paintStatus, reducedMotion, sayer, seat, sfx, shake, stopwatch, swingMeter, TONES, wireCommon, type Award, type Meter } from './ui'

const TURN_SECONDS = 12
const WORDS = {
  tr: {
    you: 'Sen', ball: 'topta', hot: 'alev aldı', left2: 'kalktı', to: "{n}'E",
    drive: 'Hücum: hareketini yap', guess: 'Savunma: tahmin mi, refleks mi?', react: 'KAYDIR!', shoot: 'Şut: iğneyi yakala', contest: 'ZIPLA!', board: 'RİBAUNT!',
    hintDrive: 'Rakip doğru tahmin ederse top çalınabilir.', hintGuess: 'Doğru tahmin: %40 top çalma. Yanlış: boşa düşer. Beklersen refleksle kayarsın.',
    hintReact: 'Gittiği yöne bas! (← ↓ → ya da A S D)', hintShoot: 'İğne yeşilken şutunu seç. Kapanmışsan zor.', hintContest: 'Şut kalktı: hemen zıpla! (boşluk)', hintBoard: 'Topa ilk sen uzan! (boşluk)',
    putback: 'Ribaunt senin: tekrar dene!', waiting: '{name} hamlesini yapıyor…', chose: 'Seçimin: {what}', watching: 'İzliyorsun', theyAct: '{name} tepki veriyor…',
    left: 'Sola sür', right: 'Sağa sür', step: 'Geri adım', guessLeft: 'Sol tahmin', guessRight: 'Sağ tahmin', guessStep: 'Geri tahmin', wait: 'Bekle, refleksle oku',
    slideLeft: 'Sola', slideRight: 'Sağa', slideStep: 'Geri',
    layup: 'Turnike', jumper: 'Orta mesafe', three: 'Üçlük', chance: '~%{p} · {pts} sayı', jump: 'ZIPLA', grab: 'TOPU KAP',
    open: 'Boşta!', trail: 'Geriden geliyor', tight: 'Yapıştı!', steal: 'Top çalındı!', make: '+{pts}!', putbackMade: 'Tamamladı +{pts}', miss: 'Kaçtı', block: 'Blok!', boardWon: 'Hücum ribaundu!', rebound: 'Savunma ribaundu',
    ms: '{ms} ms', toldDrive: '{att}: {drive} · {def}: {how}', toldShot: '{att}: {shot} (%{p}) · {def}: {how}', toldBoard: 'Ribaunt: {a} {am} ms · {d} {dm} ms (+{box} kutulama)',
    guessed: '{what} tahmini', noJump: 'zıplamadı', slid: '{ms} ms kaydı', late: 'yetişemedi',
    perfect: 'Kusursuz bırakış!', goodRelease: 'İyi bırakış', badRelease: 'Kötü bırakış…',
    youWon: 'Saha senin!', won: '{name} kazandı', watchText: 'Ne maçtı!', wonText: 'Potalar senin. Bir el daha?', lostText: 'Rövanş için masaya otur.',
    leave: 'Sahadan çık', matchPoint: 'MAÇ SAYISI',
    awardSteals: 'Top çalma', awardBlocks: 'Blok', awardThrees: 'Üçlük', awardBoards: 'Ribaunt', awardQuick: 'En hızlı savunma', quickBy: '{name} · {ms} ms',
    'Pick a move.': 'Bir hareket seç.', 'Guess the move, or wait.': 'Tahmin et ya da bekle.', 'Slide left, right or back.': 'Sola, sağa ya da geri kay.',
    'Pick a shot.': 'Bir şut seç.', 'Release first.': 'Önce bırak.', 'Tap in time.': 'Zamanında bas.',
    'You have already chosen.': 'Zaten seçtin.', 'Not your turn.': 'Sıra sende değil.', 'The game is over.': 'Maç bitti.',
  },
  en: {
    you: 'You', ball: 'on the ball', hot: 'on fire', left2: 'left', to: 'TO {n}',
    drive: 'Offense: make your move', guess: 'Defense: guess or react?', react: 'SLIDE!', shoot: 'Shoot: catch the needle', contest: 'JUMP!', board: 'REBOUND!',
    hintDrive: 'If they guess right, they may steal it.', hintGuess: 'Right guess: 40% steal. Wrong: beaten. Wait to react on reflex.',
    hintReact: 'Slide the way they go! (← ↓ → or A S D)', hintShoot: 'Pick your shot while the needle is green. Covered is hard.', hintContest: 'The shot is up: jump now! (space)', hintBoard: 'Get a hand on it first! (space)',
    putback: 'Your rebound: go back up!', waiting: '{name} is making a move…', chose: 'Your pick: {what}', watching: 'Watching', theyAct: '{name} is reacting…',
    left: 'Drive left', right: 'Drive right', step: 'Step back', guessLeft: 'Guess left', guessRight: 'Guess right', guessStep: 'Guess back', wait: 'Wait, read it',
    slideLeft: 'Left', slideRight: 'Right', slideStep: 'Back',
    layup: 'Layup', jumper: 'Jumper', three: 'Three', chance: '~{p}% · {pts} pts', jump: 'JUMP', grab: 'GRAB IT',
    open: 'Wide open!', trail: 'Trailing', tight: 'Locked up!', steal: 'Stolen!', make: '+{pts}!', putbackMade: 'Putback +{pts}', miss: 'Missed', block: 'Blocked!', boardWon: 'Offensive board!', rebound: 'Defensive board',
    ms: '{ms} ms', toldDrive: '{att}: {drive} · {def}: {how}', toldShot: '{att}: {shot} ({p}%) · {def}: {how}', toldBoard: 'Rebound: {a} {am} ms · {d} {dm} ms (+{box} box-out)',
    guessed: 'guessed {what}', noJump: 'no jump', slid: 'slid in {ms} ms', late: 'too late',
    perfect: 'Perfect release!', goodRelease: 'Good release', badRelease: 'Bad release…',
    youWon: 'You own this court!', won: '{name} won', watchText: 'What a game!', wonText: 'The hoop is yours. Another one?', lostText: 'Sit down again for a rematch.',
    leave: 'Leave the court', matchPoint: 'GAME POINT',
    awardSteals: 'Steals', awardBlocks: 'Blocks', awardThrees: 'Threes', awardBoards: 'Rebounds', awardQuick: 'Quickest defender', quickBy: '{name} · {ms} ms',
    'Pick a move.': 'Pick a move.', 'Guess the move, or wait.': 'Guess the move, or wait.', 'Slide left, right or back.': 'Slide left, right or back.',
    'Pick a shot.': 'Pick a shot.', 'Release first.': 'Release first.', 'Tap in time.': 'Tap in time.',
    'You have already chosen.': 'You have already chosen.', 'Not your turn.': 'Not your turn.', 'The game is over.': 'The game is over.',
  },
}
const ICONS: Record<Drive | Shot, string> = { left: '⬅︎', right: '➡︎', step: '⬇︎', layup: '🏀', jumper: '🎯', three: '③' }
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
/** The release meter's sweep (ms there and back). */
const RELEASE_MS = 1300
/** After the cue has passed, the screen answers for you (so nobody waits for the turn clock). */
const GIVE_UP = { react: REACT.limit + 250, contest: CONTEST_MS + 250, board: 1500 }
const GOOD_RELEASE = 60

const kampuse = await connect<View>('basket')
const say = sayer(WORDS[kampuse.lang])
const me = (kampuse.watching ? 0 : kampuse.me.side) as 0 | 1
const them = (1 - me) as 0 | 1

// ---------- the half court ----------
const W = 300
const H = 330
const HOOP = { x: 150, y: 46 }
type Pt = { x: number; y: number }
const SPOT: Record<string, Pt> = {
  home: { x: 150, y: 270 }, guard: { x: 150, y: 205 },
  left: { x: 84, y: 120 }, right: { x: 216, y: 120 }, step: { x: 150, y: 262 },
  layup: { x: 150, y: 92 },
}

const app = document.getElementById('app')!
app.innerHTML = `
  <header class="board" aria-label="score"></header>
  <section class="court-wrap" aria-label="court">
    <svg class="court" viewBox="0 0 ${W} ${H}" role="img" aria-label="half court">
      <defs>
        <pattern id="parquet" width="60" height="14" patternUnits="userSpaceOnUse">
          <rect width="60" height="14" fill="#c7925a"/><rect y="13" width="60" height="1" fill="#a87442"/><rect x="38" width="1" height="14" fill="#b07d4a"/>
        </pattern>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#parquet)"/>
      <g class="zones">
        <path class="zone z-three" d="M 14 14 H 286 V ${H - 10} H 14 Z M 30 14 V 60 A 120 120 0 0 0 270 60 V 14 Z" fill-rule="evenodd"/>
        <path class="zone z-jumper" d="M 30 14 V 60 A 120 120 0 0 0 270 60 V 14 H 195 V 150 H 105 V 14 Z"/>
        <rect class="zone z-layup" x="105" y="14" width="90" height="136"/>
      </g>
      <g fill="none" stroke="#f3efe6" stroke-width="3" pointer-events="none">
        <rect x="14" y="14" width="${W - 28}" height="${H - 24}"/>
        <rect x="105" y="14" width="90" height="136" fill="rgb(230 57 70 / 0.35)"/>
        <circle cx="150" cy="150" r="34"/>
        <path d="M 30 14 V 60 A 120 120 0 0 0 270 60 V 14"/>
        <path d="M 120 46 A 30 30 0 0 0 180 46" stroke-width="2"/>
      </g>
      <g pointer-events="none">
        <rect x="120" y="22" width="60" height="5" fill="#f3efe6" stroke="#0b0c0e" stroke-width="2"/>
        <circle cx="${HOOP.x}" cy="${HOOP.y}" r="10" fill="none" stroke="#ff6b1a" stroke-width="4"/>
      </g>
      <g class="token def"><ellipse class="shadow" rx="16" ry="6" cy="12"/><circle class="arms" r="24"/><circle class="body" r="15"/><text dy="5"></text></g>
      <g class="token att"><ellipse class="shadow" rx="16" ry="6" cy="12"/><circle class="body" r="15"/><text dy="5"></text></g>
      <g class="ball"><circle r="7"/><path d="M -7 0 H 7 M 0 -7 V 7" stroke="#5a2a08" stroke-width="1.2" fill="none"/></g>
      <text class="cue" x="150" y="196" text-anchor="middle"></text>
    </svg>
  </section>
  <p class="told" aria-live="polite"></p>
  <div class="status"></div>
  <div class="tape"></div>
  <section class="controls" aria-label="choices">
    <div class="swing hidden"><div class="track"></div><p class="grade" aria-live="polite"></p></div>
    <div class="pads choices"></div>
    <div class="extra"></div>
  </section>
  ${kampuse.watching ? '' : `<button class="leave">${say('leave')}</button>`}`

const boardEl = app.querySelector<HTMLElement>('.board')!
const courtWrap = app.querySelector<HTMLElement>('.court-wrap')!
const svg = app.querySelector<SVGSVGElement>('.court')!
const att = app.querySelector<SVGGElement>('.token.att')!
const def = app.querySelector<SVGGElement>('.token.def')!
const ball = app.querySelector<SVGGElement>('.ball')!
const cueEl = app.querySelector<SVGTextElement>('.cue')!
const toldEl = app.querySelector<HTMLElement>('.told')!
const statusEl = app.querySelector<HTMLElement>('.status')!
const swingEl = app.querySelector<HTMLElement>('.swing')!
const trackEl = app.querySelector<HTMLElement>('.track')!
const gradeEl = app.querySelector<HTMLElement>('.grade')!
const choicesEl = app.querySelector<HTMLElement>('.choices')!
const extraEl = app.querySelector<HTMLElement>('.extra')!
wireCommon(kampuse, say, app.querySelector('.leave'))

const nameOf = (side: number) => kampuse.players[side]?.name ?? ''
/** Where each token stands (kept, so the ball can follow the attacker). */
const at = { att: SPOT.home, def: SPOT.guard }
function moveTo(who: 'att' | 'def', p: Pt) {
  at[who] = p
  ;(who === 'att' ? att : def).style.transform = `translate(${p.x}px, ${p.y}px)`
  if (who === 'att') carry()
}
/** The ball sits in the attacker's hands between plays. */
function carry() {
  ball.getAnimations().forEach((a) => a.cancel())
  ball.style.transform = `translate(${at.att.x + 13}px, ${at.att.y - 8}px)`
}
function dress(attacker: number) {
  for (const [el, side] of [[att, attacker], [def, 1 - attacker]] as const) {
    el.style.setProperty('--tone', TONES[side])
    el.querySelector('text')!.textContent = nameOf(side).slice(0, 1).toUpperCase()
  }
}
/** Where the defender ends up after a drive: in front, a step behind, or left for dead. */
function defenderAt(spot: Pt, cover: string | null): Pt {
  const lag = cover === 'open' ? 54 : cover === 'trail' ? 30 : 16
  return { x: spot.x + (spot.x < 150 ? lag : spot.x > 150 ? -lag : 0), y: spot.y + (spot.y > 200 ? -lag : lag * 0.5) }
}
/** The players' spots for the phase now. */
function stand(v: View) {
  if (v.phase === 'drive') {
    moveTo('att', SPOT.home)
    moveTo('def', SPOT.guard)
  } else if (v.putback) {
    moveTo('att', SPOT.layup)
    moveTo('def', { x: 150, y: 124 })
  } else if (v.drive) {
    moveTo('att', SPOT[v.drive])
    moveTo('def', defenderAt(SPOT[v.drive], v.cover))
  }
}

// ---------- what this screen is doing now ----------
type Mode = 'drive' | 'guess' | 'react' | 'shoot' | 'contest' | 'board' | 'idle'
let mode: Mode = 'idle'
let modeKey = ''
let meter: Meter | null = null
/** The cue I'm reacting to: its stopwatch and the give-up timer. */
let reaction: { elapsed: () => number; giveUp: number } | null = null

function modeOf(turn: Turn<View>): Mode {
  const v = turn.view
  if (kampuse.watching || v.winners || !myTurn(kampuse, turn) || v.mine) return 'idle'
  if (v.phase === 'drive') return v.attacker === me ? 'drive' : 'guess'
  return v.phase
}

function stopReaction() {
  if (reaction) clearTimeout(reaction.giveUp)
  reaction = null
}
function startReaction(kind: 'react' | 'contest' | 'board') {
  stopReaction()
  const elapsed = stopwatch()
  // The cue went by: answer late rather than make everyone wait for the clock.
  const giveUp = window.setTimeout(() => mode === kind && act(kind === 'react' ? 'step' : 'late'), GIVE_UP[kind])
  reaction = { elapsed, giveUp }
}
function stopMeter() {
  meter?.destroy()
  meter = null
}

/** The shot, released where the needle is now. */
function release(shot: Shot): Move | null {
  if (!meter) return null
  const aim = meter.aim()
  stopMeter()
  trackEl.classList.add('frozen')
  const grade = aim >= SWEET ? 'hot' : aim >= GOOD_RELEASE ? 'good' : 'bad'
  gradeEl.className = `grade ${grade}`
  gradeEl.textContent = say(grade === 'hot' ? 'perfect' : grade === 'good' ? 'goodRelease' : 'badRelease')
  return { shot, aim }
}

/** What a tapped pad (or key) means in this mode. */
function moveFor(value: string): Move | null {
  switch (mode) {
    case 'drive':
      return { drive: value as Drive }
    case 'guess':
      return { guess: value === 'wait' ? null : (value as Drive) }
    case 'react':
      return reaction && { drive: value as Drive, ms: reaction.elapsed() }
    case 'contest':
    case 'board':
      return reaction && { ms: reaction.elapsed() }
    case 'shoot':
      return release(value as Shot)
    default:
      return null
  }
}

function act(value: string) {
  const turn = kampuse.last
  const move = turn && moveFor(value)
  if (!turn || !move) return
  // Every press answers at once, before the table does: a tap, or the ball leaving the hands.
  if ('shot' in move) sfx.whoosh()
  else sfx.tap(0.3)
  buzz(8)
  mode = 'idle'
  stopReaction()
  kampuse.move(move)
  drawControls(turn, true)
}

type Option = { value: string; label: string; hint?: string; icon: string }
function options(v: View): Option[] {
  switch (mode) {
    case 'drive':
      return DRIVES.map((d) => ({ value: d, label: say(d), icon: ICONS[d] }))
    case 'guess':
      return DRIVES.map((d) => ({ value: d, label: say(`guess${cap(d)}`), icon: ICONS[d] }))
    case 'react':
      return DRIVES.map((d) => ({ value: d, label: say(`slide${cap(d)}`), icon: ICONS[d] }))
    case 'shoot':
      return SHOTS.map((s) => {
        const p = shotChance(s, SWEET, v.cover ?? 'trail', v.putback ? null : v.drive, 0.4, v.streak[me])
        return { value: s, label: say(s), hint: say('chance', { p: Math.round(p * 100), pts: POINTS[s] }), icon: ICONS[s] }
      })
    default:
      return []
  }
}

function drawControls(turn: Turn<View>, force = false) {
  const v = turn.view
  const next = force ? mode : modeOf(turn)
  const key = `${next}/${v.phase}/${v.last?.n ?? 0}/${v.attacker}`
  if (key === modeKey && !force) return
  const fresh = key !== modeKey
  modeKey = key
  mode = next
  // The release meter: a fresh sweep for every shot of mine; frozen where it stopped until the next view.
  if (mode === 'shoot' && fresh) {
    stopMeter()
    trackEl.classList.remove('frozen')
    gradeEl.textContent = ''
    meter = swingMeter(trackEl, RELEASE_MS)
  } else if (mode !== 'shoot') stopMeter()
  if (!force) trackEl.classList.remove('frozen')
  swingEl.classList.toggle('hidden', mode !== 'shoot' && !trackEl.classList.contains('frozen'))
  // Reflex cues start counting the moment they show.
  if (fresh && (mode === 'react' || mode === 'contest' || mode === 'board')) startReaction(mode)

  choicesEl.classList.toggle('big', mode === 'react')
  choicesEl.innerHTML = options(v)
    .map((o) => `<button class="pad choice" data-value="${o.value}"><span class="icon">${o.icon}</span>${o.label}${o.hint ? `<small>${o.hint}</small>` : ''}</button>`)
    .join('')
  extraEl.innerHTML =
    mode === 'guess' ? `<button class="pad wide" data-value="wait"><span class="icon">⏳</span>${say('wait')}</button>`
    : mode === 'contest' ? `<button class="pad wide huge" data-value="jump"><span class="icon">🙌</span>${say('jump')}</button>`
    : mode === 'board' ? `<button class="pad wide huge" data-value="grab"><span class="icon">✋</span>${say('grab')}</button>`
    : ''
}

// Pads answer on pointerdown: a reaction shouldn't wait for the finger to lift. Enter/space work too.
const valueOf = (e: Event) => (e.target as Element).closest<HTMLElement>('[data-value]')?.dataset.value
for (const el of [choicesEl, extraEl]) {
  el.addEventListener('pointerdown', (e) => {
    const value = valueOf(e)
    if (value && mode !== 'idle') act(value)
  })
  el.addEventListener('keydown', (e) => {
    const value = valueOf(e)
    if (!value || (e.key !== 'Enter' && e.key !== ' ') || mode === 'idle') return
    e.preventDefault()
    act(value)
  })
}
// Hovering or focusing a shot lights its zone on the court.
const light = (e: Event) => (svg.dataset.zone = mode === 'shoot' ? (valueOf(e) ?? '') : '')
choicesEl.addEventListener('pointerover', light)
choicesEl.addEventListener('focusin', light)
choicesEl.addEventListener('pointerleave', () => (svg.dataset.zone = ''))
// Keys: arrows or A/S/D for moves and shots, space to jump or grab.
document.addEventListener('keydown', (e) => {
  if (mode === 'idle' || e.repeat || (e.target as Element).closest?.('button')) return
  const lane = laneKey(e)
  const space = e.key === ' ' || e.key === 'Enter'
  let value: string | null = null
  if ((mode === 'contest' || mode === 'board') && space) value = 'go'
  else if (lane !== null && (mode === 'drive' || mode === 'guess' || mode === 'react')) value = ['left', 'step', 'right'][lane]
  else if (lane !== null && mode === 'shoot') value = SHOTS[lane]
  if (value === null) return
  e.preventDefault()
  act(value)
})

// ---------- the scoreboard and status ----------
function note(v: View, side: 0 | 1) {
  const parts = [side === kampuse.me.side ? say('you') : kampuse.players[side]?.in === false ? say('left2') : '']
  if (v.attacker === side) parts.push(`🏀 ${say('ball')}`)
  if (v.streak[side] >= 2) parts.push(`🔥 ${say('hot')}`)
  if (v.ready[side] && (v.phase === 'drive' || v.phase === 'board') && !v.winners) parts.push('<span class="tick">✓</span>')
  return parts.filter(Boolean).join(' · ')
}

function drawBoard(turn: Turn<View>) {
  const v = turn.view
  const two = (n: number) => String(n).padStart(2, '0')
  boardEl.innerHTML = `
    ${seat(kampuse.players[me], { now: turn.turn.includes(me), note: note(v, me) })}
    <div class="led" aria-label="${v.score[me]} - ${v.score[them]}">${two(v.score[me])}<span class="dim">:</span>${two(v.score[them])}
      <small>${Math.max(v.score[0], v.score[1]) >= v.target - 2 && !v.winners ? `<b>${say('matchPoint')}</b>` : say('to', { n: v.target })}</small></div>
    ${seat(kampuse.players[them], { now: turn.turn.includes(them), right: true, note: note(v, them) })}`
}

const STATUS: Record<Exclude<Mode, 'idle'>, [string, string]> = {
  drive: ['drive', 'hintDrive'], guess: ['guess', 'hintGuess'], react: ['react', 'hintReact'],
  shoot: ['shoot', 'hintShoot'], contest: ['contest', 'hintContest'], board: ['board', 'hintBoard'],
}
function statusText(turn: Turn<View>): string {
  const v = turn.view
  if (v.winners) return ''
  if (kampuse.watching) return `<span class="say">${say('watching')}</span>`
  const live = modeOf(turn)
  if (live !== 'idle') {
    const [title, hint] = STATUS[live]
    return `<span class="say">${say(title)}</span><span class="hint">${say(live === 'shoot' && v.putback ? 'putback' : hint)}</span>`
  }
  const other = escape(nameOf(them))
  if (v.mine) {
    const what = 'drive' in v.mine ? say(v.mine.drive) : 'guess' in v.mine ? (v.mine.guess ? say(`guess${cap(v.mine.guess)}`) : say('wait')) : ''
    return `<span class="say">${say('waiting', { name: other })}</span><span class="hint">${say('chose', { what })}</span>`
  }
  const reacting = v.phase === 'react' || v.phase === 'contest' || v.phase === 'board'
  return `<span class="say">${say(reacting ? 'theyAct' : 'waiting', { name: other })}</span>`
}
const drawStatus = (turn: Turn<View>) => paintStatus(statusEl, statusText(turn), turn, TURN_SECONDS)

// ---------- what happened ----------
const TONE: Partial<Record<Play['outcome'], 'good' | 'bad' | 'hot'>> = { open: 'good', tight: 'bad', steal: 'bad', make: 'hot', putback: 'hot', miss: 'bad', block: 'bad', board: 'good' }
const SAY_OUTCOME: Record<Play['outcome'], string> = {
  open: 'open', trail: 'trail', tight: 'tight', steal: 'steal', make: 'make', putback: 'putbackMade', miss: 'miss', block: 'block', board: 'boardWon', rebound: 'rebound',
}

function tell(p: Play) {
  const a = escape(nameOf(p.attacker))
  const d = escape(nameOf(1 - p.attacker))
  if (p.hands) {
    toldEl.innerHTML = say('toldBoard', { a, am: p.hands[p.attacker], d, dm: p.hands[1 - p.attacker], box: BOX_OUT })
    return
  }
  if (p.shot) {
    const how = p.ms === null ? say('noJump') : say('ms', { ms: p.ms })
    toldEl.innerHTML = say('toldShot', { att: a, shot: say(p.shot), p: Math.round((p.chance ?? 0) * 100), def: d, how })
    return
  }
  const how = p.guess ? say('guessed', { what: say(`slide${cap(p.guess)}`) }) : p.ms === null ? say('late') : say('slid', { ms: p.ms })
  toldEl.innerHTML = say('toldDrive', { att: a, drive: p.drive ? say(p.drive) : '', def: d, how })
}

/** The shot flies to the rim over `ms`: through it, off it, or (null) still in the air. */
function shootBall(from: Pt, made: boolean | null, ms: number) {
  const start = `translate(${from.x + 10}px, ${from.y - 14}px)`
  const peak = `translate(${(from.x + HOOP.x) / 2}px, ${Math.min(from.y, HOOP.y) - 40}px) scale(1.25)`
  const rim = `translate(${HOOP.x}px, ${HOOP.y - 4}px)`
  const frames: Keyframe[] = [{ transform: start }, { transform: peak, offset: 0.55 }, { transform: rim }]
  if (made !== null) frames.push({ transform: made ? `translate(${HOOP.x}px, ${HOOP.y + 26}px) scale(0.9)` : `translate(${HOOP.x + 46}px, ${HOOP.y + 40}px)` })
  ball.getAnimations().forEach((a) => a.cancel())
  ball.animate(frames, { duration: ms, easing: 'ease-in-out', fill: 'forwards' })
}

/** The cue a defender reacts to: a flash of where the attacker went, or that the shot is up. */
function flashCue(text: string) {
  cueEl.textContent = text
  cueEl.getAnimations().forEach((a) => a.cancel())
  cueEl.animate([{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: 700, fill: 'forwards' })
}

function animate(p: Play, v: View) {
  const still = reducedMotion()
  if (p.outcome === 'make' || p.outcome === 'putback' || p.outcome === 'miss') {
    if (!still) shootBall(at.att, p.outcome !== 'miss', 700)
  } else if ((p.outcome === 'open' || p.outcome === 'trail' || p.outcome === 'tight') && p.drive) {
    moveTo('att', SPOT[p.drive])
    moveTo('def', defenderAt(SPOT[p.drive], p.outcome))
  }
  window.setTimeout(() => {
    callout(courtWrap, say(SAY_OUTCOME[p.outcome], { pts: p.points }), TONE[p.outcome] ?? '')
    sound(p)
  }, still ? 0 : p.shot ? 550 : 150)
  // A new possession or a putback: everyone to their spots, unless something newer came in meanwhile.
  if (v.phase === 'drive' || v.putback)
    window.setTimeout(() => {
      const now = kampuse.last
      if (now && !now.over && now.view.last?.n === p.n && now.view.phase === v.phase) stand(now.view)
    }, still ? 0 : 1300)
}

/** What a confirmed play sounds like. Good news for me rings; bad news thuds. */
function sound(p: Play) {
  const mine = !kampuse.watching && (p.outcome === 'steal' || p.outcome === 'block' || p.outcome === 'rebound' ? p.attacker !== me : p.attacker === me)
  switch (p.outcome) {
    case 'make':
    case 'putback':
      sfx.swish()
      if (mine || kampuse.watching) sfx.score()
      if (mine) buzz(30)
      break
    case 'miss':
      sfx.rim()
      break
    case 'block':
      sfx.hit(1)
      shake(svg, 4)
      if (mine) buzz([15, 30, 15])
      break
    case 'steal':
    case 'board':
    case 'rebound':
      if (mine || kampuse.watching) sfx.good()
      else sfx.bad()
      break
    default:
      sfx.bounce()
  }
}

/** The end card's numbers: who stole, blocked, hit from deep, owned the glass, and slid quickest. */
function awards(v: View): Award[] {
  const both = (pair: [number, number]) => `${nameOf(me)} ${pair[me]} · ${nameOf(them)} ${pair[them]}`
  const some = (pair: [number, number]) => pair[0] + pair[1] > 0
  const list: Award[] = []
  if (some(v.stats.threes)) list.push({ icon: '🎯', label: say('awardThrees'), value: both(v.stats.threes) })
  if (some(v.stats.steals)) list.push({ icon: '🖐️', label: say('awardSteals'), value: both(v.stats.steals) })
  if (some(v.stats.blocks)) list.push({ icon: '🚫', label: say('awardBlocks'), value: both(v.stats.blocks) })
  if (some(v.stats.boards)) list.push({ icon: '💪', label: say('awardBoards'), value: both(v.stats.boards) })
  const quick = ([0, 1] as const).filter((s) => v.stats.quickest[s] > 0).sort((a, b) => v.stats.quickest[a] - v.stats.quickest[b])[0]
  if (quick !== undefined) list.push({ icon: '⚡', label: say('awardQuick'), value: say('quickBy', { name: nameOf(quick), ms: v.stats.quickest[quick] }) })
  return list
}

/** A cue just showed up: the drive to react to, or the ball going up. */
function cue(v: View) {
  if (v.phase === 'react' && v.drive) {
    moveTo('att', SPOT[v.drive])
    flashCue(ICONS[v.drive])
  } else if (v.phase === 'contest') {
    if (!reducedMotion()) shootBall(at.att, null, CONTEST_MS)
    flashCue('⬆︎')
  }
}

let seen = -1
let seenPhase = ''
let finished = false
function draw(turn: Turn<View> | null) {
  if (!turn) return
  const v = turn.view
  const last = v.last
  // The colours follow the ball at once: whoever attacks now wears the attacker's token.
  dress(v.attacker)
  if (seen < 0) stand(v)
  else if (last && last.n > seen) animate(last, v)
  if (last && last.n !== seen) tell(last)
  seen = last?.n ?? 0
  const phaseKey = `${v.phase}/${seen}`
  if (phaseKey !== seenPhase) cue(v)
  seenPhase = phaseKey
  drawBoard(turn)
  drawStatus(turn)
  drawControls(turn)
  if (turn.over) {
    stopMeter()
    stopReaction()
    const [winner] = turn.over.winners
    const mineWon = winner === kampuse.me.side
    if (finished) return
    finished = true
    window.setTimeout(() => {
      finale(app, {
        medal: mineWon ? '🏆' : '🏀',
        title: mineWon ? say('youWon') : say('won', { name: nameOf(winner ?? 0) }),
        text: kampuse.watching ? say('watchText') : mineWon ? say('wonText') : say('lostText'),
        score: `${v.score[me]} – ${v.score[them]}`,
        awards: awards(v),
      })
      if (mineWon || kampuse.watching) {
        sfx.win()
        confetti(app)
      } else sfx.lose()
    }, reducedMotion() ? 0 : 1600)
  }
}

kampuse.on('view', draw)
kampuse.on('players', () => draw(kampuse.last))
// Put away: nothing runs or answers for you. Back: the controls (and any reaction) start fresh.
kampuse.on('pause', () => {
  stopReaction()
  stopMeter()
  mode = 'idle'
  modeKey = ''
})
kampuse.on('resume', () => kampuse.last && drawControls(kampuse.last))
window.setInterval(() => {
  const turn = kampuse.last
  if (turn && !turn.over) drawStatus(turn)
}, 250)
