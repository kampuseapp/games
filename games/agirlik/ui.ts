// What every gym game's screen shares: words in two languages, the LED scoreboard, the turn clock,
// call-outs, toasts and the end card. Each game carries its own copy (a game may use only its own folder).
import type { Kampuse, Player, Turn } from '@kampuse/games-kit'

export type Words = Record<string, string>

/** Text by key, with {name} filled in. Unknown keys come back as they are (refusal reasons are keys too). */
export function sayer(words: Words) {
  return (key: string, vars: Record<string, string | number> = {}) =>
    (words[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
}

export const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** The players' colours: the competition plates. */
export const TONES = ['var(--p0)', 'var(--p1)', 'var(--p2)', 'var(--p3)']

/** Whether it is my move now. */
export const myTurn = (kampuse: Kampuse<unknown>, turn: Turn<unknown> | null) =>
  !kampuse.watching && !!turn && !turn.over && turn.turn.includes(kampuse.me.side)

/** A seat on the scoreboard. */
export function seat(player: Player, opts: { now: boolean; right?: boolean; note: string }): string {
  return `
    <div class="seat${opts.right ? ' right' : ''}${opts.now ? ' now' : ''}${player.in ? '' : ' gone'}" style="--tone:${TONES[player.side]}">
      <img src="${escape(player.avatar)}" alt="">
      <div class="who"><b>${escape(player.name)}</b><small>${opts.note}</small></div>
    </div>`
}

/** The ring that counts down the turn. */
export function clockHtml(turn: Turn<unknown> | null, turnSeconds: number): string {
  if (!turn || turn.ends === null || turn.over) return ''
  const left = Math.max(0, (turn.ends - Date.now()) / 1000)
  return `<span class="clock${left < 5 ? ' low' : ''}" style="--p:${Math.min(1, left / turnSeconds).toFixed(3)}"><span>${Math.ceil(left)}</span></span>`
}

/**
 * The status line: the text (announced to screen readers, so only rewritten when it changes) and the clock beside it
 * (redrawn as often as you like).
 */
export function paintStatus(el: HTMLElement, text: string, turn: Turn<unknown> | null, turnSeconds: number) {
  let textEl = el.querySelector<HTMLElement>('.status-text')
  if (!textEl) {
    el.innerHTML = '<div class="status-text" aria-live="polite"></div><span class="clock-slot"></span>'
    textEl = el.querySelector<HTMLElement>('.status-text')!
  }
  if (textEl.dataset.src !== text) {
    textEl.dataset.src = text
    textEl.innerHTML = text
  }
  el.querySelector<HTMLElement>('.clock-slot')!.innerHTML = clockHtml(turn, turnSeconds)
}

let toastTimer = 0
export function toast(text: string) {
  document.querySelector('.toast')?.remove()
  const el = document.createElement('div')
  el.className = 'toast'
  el.setAttribute('role', 'status')
  el.textContent = text
  document.body.append(el)
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el.remove(), 1800)
}

/** A stamped word over the field ("ACE!"), there for a moment. */
export function callout(host: HTMLElement, text: string, tone: 'good' | 'bad' | 'hot' | '' = '', ms = 1100) {
  host.querySelector('.callout')?.remove()
  const el = document.createElement('div')
  el.className = `callout ${tone}`
  el.setAttribute('aria-live', 'polite')
  el.textContent = text
  host.append(el)
  if (!reducedMotion())
    el.animate(
      [
        { opacity: 0, transform: 'translate(-50%, -50%) rotate(-4deg) scale(1.6)' },
        { opacity: 1, transform: 'translate(-50%, -50%) rotate(-4deg) scale(1)', offset: 0.18 },
        { opacity: 1, transform: 'translate(-50%, -50%) rotate(-4deg) scale(1)', offset: 0.8 },
        { opacity: 0, transform: 'translate(-50%, -60%) rotate(-4deg) scale(0.96)' },
      ],
      { duration: ms, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
    )
  window.setTimeout(() => el.remove(), ms)
}

/** A line of the end card's awards: who earned what in this game. */
export type Award = { icon: string; label: string; value: string }

/** The end of the game, over everything: a medal, who won, the final score, and the game's awards. */
export function finale(host: HTMLElement, opts: { medal: string; title: string; text: string; score: string; awards?: Award[] }) {
  let el = host.querySelector<HTMLElement>('.finale')
  if (!el) {
    el = document.createElement('div')
    el.className = 'finale'
    host.append(el)
    if (!reducedMotion()) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' })
  }
  const awards = (opts.awards ?? []).map((a) => `<li><span class="icon">${a.icon}</span><span>${escape(a.label)}</span><b>${escape(a.value)}</b></li>`).join('')
  el.innerHTML = `<div class="card" role="dialog" aria-label="${escape(opts.title)}"><div class="medal">${opts.medal}</div><h1>${escape(opts.title)}</h1><p>${escape(opts.text)}</p><div class="score">${opts.score}</div>${awards ? `<ul class="awards">${awards}</ul>` : ''}</div>`
}

/** The parts every screen wires the same way: the leave button and refusals as toasts. */
export function wireCommon(kampuse: Kampuse<unknown>, say: (key: string) => string, leaveButton: HTMLElement | null) {
  // Upper-case text follows the page's language: Turkish turns "i" into "İ", English must not.
  document.documentElement.lang = kampuse.lang
  leaveButton?.addEventListener('click', () => kampuse.leave())
  // A refusal is told in the player's language; one a game maps to nothing is not worth a toast.
  kampuse.on('refused', (reason) => {
    const text = say(reason)
    if (text) toast(text)
  })
  wireSound(kampuse, leaveButton)
}

// ---------- reflexes: the screen measures them, the rules judge them ----------

/** A swing meter: a needle sweeping a track. Stop it on the sweet spot in the middle for 100, at either end for 0. */
export type Meter = { aim(): number; destroy(): void }

export function swingMeter(track: HTMLElement, periodMs: number): Meter {
  track.classList.add('meter')
  track.innerHTML = '<span class="sweet"></span><span class="needle"></span>'
  const needle = track.querySelector<HTMLElement>('.needle')!
  const began = performance.now()
  let frame = 0
  /** Where the needle is now, 0 to 1 and back. */
  const at = () => {
    const t = ((performance.now() - began) % periodMs) / periodMs
    return t < 0.5 ? t * 2 : 2 - t * 2
  }
  const paint = () => {
    needle.style.transform = `translateX(${(at() * track.clientWidth).toFixed(1)}px)`
    frame = requestAnimationFrame(paint)
  }
  paint()
  return {
    aim: () => Math.round(100 * Math.max(0, 1 - Math.abs(at() - 0.5) * 2)),
    destroy: () => cancelAnimationFrame(frame),
  }
}

/** A stopwatch for one reaction: started when the cue shows, read when the player answers (whole ms). */
export function stopwatch() {
  const began = performance.now()
  return () => Math.max(0, Math.round(performance.now() - began))
}

/** Keys as a second pair of hands: arrows or A/S/D for the three lanes, space for the big button. */
export function laneKey(e: KeyboardEvent): number | null {
  const k = e.key.toLowerCase()
  return k === 'arrowleft' || k === 'a' || k === '1' ? 0 : k === 'arrowdown' || k === 'arrowup' || k === 's' || k === '2' ? 1 : k === 'arrowright' || k === 'd' || k === '3' ? 2 : null
}

// ---------- feel: sound, a buzz in the hand, a shake, confetti ----------
// Feedback only: it shows what the rules decided and never changes it. All of it can be switched off with the
// sound button, motion follows the system's "reduce motion", and nothing here needs a file: sounds are synthesised.

let audio: AudioContext | null = null
let feedbackOn = true
/** Put away (the app closed for a moment): not a sound until it is back. */
let putAway = false

/** The sound engine, if this device has one and sound is on. (Every sound has a visual twin, so none is fine.) */
function audioNow(): AudioContext | null {
  if (!feedbackOn || putAway || !audio) return null
  if (audio.state === 'suspended') void audio.resume()
  return audio
}

type Note = { f: number; to?: number; ms: number; type?: OscillatorType; gain?: number; at?: number }
/** One synthesised note: a pitch (maybe sliding to another), a length, a quick fade. */
function note(n: Note) {
  const ac = audioNow()
  if (!ac) return
  const t = ac.currentTime + (n.at ?? 0) / 1000
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = n.type ?? 'triangle'
  osc.frequency.setValueAtTime(n.f, t)
  if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t + n.ms / 1000)
  gain.gain.setValueAtTime(n.gain ?? 0.12, t)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + n.ms / 1000)
  osc.connect(gain).connect(ac.destination)
  osc.start(t)
  osc.stop(t + n.ms / 1000 + 0.02)
}

/** A short burst of filtered noise: the thwack of a racket, a ball on the floor, chalk. */
function thud(ms: number, cutoff: number, gain = 0.2, at = 0) {
  const ac = audioNow()
  if (!ac) return
  const t = ac.currentTime + at / 1000
  const frames = Math.max(1, Math.floor((ac.sampleRate * ms) / 1000))
  const buffer = ac.createBuffer(1, frames, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
  const src = ac.createBufferSource()
  src.buffer = buffer
  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = cutoff
  const g = ac.createGain()
  g.gain.value = gain
  src.connect(filter).connect(g).connect(ac.destination)
  src.start(t)
}

/** A little drift in pitch, so a sound heard twenty times stays alive. */
const vary = (f: number, by = 0.06) => f * (1 + (Math.random() * 2 - 1) * by)

/** The gym's sounds. Each has a look that says the same thing, so the game plays the same with the sound off. */
export const sfx = {
  /** A light tap: a button, a step. `up` (0 to 1) raises the pitch: a bar rising, a rally heating up. */
  tap: (up = 0) => note({ f: vary(320 + 520 * up, 0.03), ms: 55, type: 'square', gain: 0.05 }),
  /** Racket or hand on ball: `power` 0 (a touch) to 1 (a smash). */
  hit(power = 0.5) {
    thud(60 + 50 * power, 1400 + 2600 * power, 0.16 + 0.2 * power)
    note({ f: vary(150 + 90 * power), to: 70, ms: 90, type: 'sine', gain: 0.2 })
  },
  bounce: () => thud(45, 700, 0.12),
  swish: () => thud(220, 5200, 0.1),
  rim: () => note({ f: vary(410), to: 380, ms: 160, type: 'square', gain: 0.07 }),
  whoosh: () => note({ f: 520, to: 180, ms: 160, type: 'sawtooth', gain: 0.04 }),
  perfect() {
    note({ f: 880, ms: 90, gain: 0.1 })
    note({ f: 1320, ms: 160, gain: 0.1, at: 70 })
  },
  good: () => note({ f: vary(660, 0.02), ms: 120, gain: 0.09 }),
  bad: () => note({ f: 190, to: 110, ms: 260, type: 'sawtooth', gain: 0.08 }),
  tick: () => note({ f: 1000, ms: 40, type: 'square', gain: 0.05 }),
  go: () => note({ f: 1400, ms: 220, type: 'square', gain: 0.07 }),
  /** A point, a basket, a good lift: three notes up. */
  score: () => [523, 659, 784].forEach((f, i) => note({ f, ms: 130, gain: 0.1, at: i * 80 })),
  clank() {
    thud(180, 900, 0.22)
    note({ f: 95, to: 60, ms: 260, type: 'sine', gain: 0.22 })
  },
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => note({ f, ms: 220, gain: 0.11, at: i * 110 })),
  lose: () => [392, 330, 262].forEach((f, i) => note({ f, ms: 240, type: 'sine', gain: 0.1, at: i * 150 })),
}

/** A buzz in the hand, where the phone can do it (many can't: the sound and the picture already said it). */
export function buzz(pattern: number | number[]) {
  if (!feedbackOn || putAway) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // not supported here
  }
}

/** A short, fading shake of an element: for the rare big moments only. Still for anyone who asked for less motion. */
export function shake(el: Element, px = 6) {
  if (reducedMotion()) return
  const frames = [0, 1, -0.8, 0.6, -0.4, 0.2, 0].map((k, i) => ({ transform: `translate(${(k * px).toFixed(1)}px, ${(i % 2 ? -k : k) * px * 0.4}px)` }))
  el.animate(frames, { duration: 280, easing: 'ease-out' })
}

/** A small word that floats up from a spot and fades: "PERFECT", "+2". `x` and `y` are percentages of the host. */
export function floatText(host: HTMLElement, text: string, x: number, y: number, tone: 'good' | 'bad' | 'hot' | '' = '') {
  const el = document.createElement('div')
  el.className = `float ${tone}`
  el.textContent = text
  el.style.left = `${x}%`
  el.style.top = `${y}%`
  host.append(el)
  const still = reducedMotion()
  el.animate(
    still ? [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }] : [{ opacity: 0, transform: 'translate(-50%, 0) scale(0.8)' }, { opacity: 1, transform: 'translate(-50%, -14px) scale(1)', offset: 0.2 }, { opacity: 0, transform: 'translate(-50%, -38px) scale(1)' }],
    { duration: 900, easing: 'ease-out', fill: 'forwards' },
  )
  window.setTimeout(() => el.remove(), 920)
}

/** Confetti over the end card, in the players' colours: once a game, for the winner. */
export function confetti(host: HTMLElement) {
  if (reducedMotion()) return
  for (let i = 0; i < 28; i++) {
    const bit = document.createElement('i')
    bit.className = 'confetti'
    bit.style.left = `${Math.random() * 100}%`
    bit.style.background = TONES[i % TONES.length]
    host.append(bit)
    const drift = (Math.random() * 2 - 1) * 60
    bit.animate([{ transform: 'translate(0, -20px) rotate(0)', opacity: 1 }, { transform: `translate(${drift}px, 105vh) rotate(${540 + Math.random() * 360}deg)`, opacity: 0.9 }], { duration: 1500 + Math.random() * 1200, delay: Math.random() * 350, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)', fill: 'forwards' })
    window.setTimeout(() => bit.remove(), 3200)
  }
}

/** The sound button beside "leave", the first touch that lets the browser play sound, and silence while put away. */
function wireSound(kampuse: Kampuse<unknown>, leaveButton: HTMLElement | null) {
  // The engine is built now, while the page loads, never on a tap: building it can stall the page for a moment, and
  // in a timing game a tap must not wait. It stays silent until the first touch lets the browser play sound.
  try {
    audio = new AudioContext()
  } catch {
    audio = null
  }
  const unlock = () => void audioNow()
  document.addEventListener('pointerdown', unlock, { once: true })
  document.addEventListener('keydown', unlock, { once: true })
  kampuse.on('pause', () => {
    putAway = true
    void audio?.suspend()
  })
  kampuse.on('resume', () => {
    putAway = false
    if (feedbackOn) void audio?.resume()
  })
  const button = document.createElement('button')
  button.className = 'sound'
  const label = { tr: ['Ses ve titreşim açık', 'Ses ve titreşim kapalı'], en: ['Sound and buzz on', 'Sound and buzz off'] }[kampuse.lang]
  const paint = () => {
    button.textContent = feedbackOn ? '🔊' : '🔇'
    button.setAttribute('aria-label', label[feedbackOn ? 0 : 1])
    button.setAttribute('aria-pressed', String(feedbackOn))
    button.title = label[feedbackOn ? 0 : 1]
  }
  button.addEventListener('click', () => {
    feedbackOn = !feedbackOn
    if (!feedbackOn) void audio?.suspend()
    paint()
    if (feedbackOn) sfx.tap()
  })
  paint()
  ;(leaveButton?.parentElement ?? document.body).append(button)
}
