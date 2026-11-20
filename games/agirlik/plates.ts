// A loaded barbell as SVG: a 20 kg bar and competition plates in their colours, the heaviest inside.
export const BAR_KG = 20

type Plate = { kg: number; color: string; h: number; w: number }
/** Competition plates: 25 red, 20 blue, 15 yellow, 10 green, then the small change. */
export const PLATES: Plate[] = [
  { kg: 25, color: '#d62828', h: 104, w: 11 },
  { kg: 20, color: '#1d4ed8', h: 104, w: 10 },
  { kg: 15, color: '#f4b400', h: 92, w: 9 },
  { kg: 10, color: '#1f9d55', h: 78, w: 8 },
  { kg: 5, color: '#f3efe6', h: 60, w: 7 },
  { kg: 2.5, color: '#1b1d21', h: 48, w: 6 },
  { kg: 1.25, color: '#b8c0c8', h: 40, w: 5 },
]

/** The plates on one side for a total load, heaviest first. */
export function platesFor(total: number): Plate[] {
  let side = Math.max(0, (total - BAR_KG) / 2)
  const out: Plate[] = []
  for (const p of PLATES)
    while (side >= p.kg - 1e-9) {
      out.push(p)
      side -= p.kg
    }
  return out
}

const MID = 60
/** Where the inner collars stand: plates go on outside them. */
const COLLAR = { left: 96, right: 224 }

/** The inside of the platform's <svg viewBox="0 0 320 120">. */
export function barbell(total: number): string {
  const plates = platesFor(total)
  const side = (dir: -1 | 1) => {
    let x = dir < 0 ? COLLAR.left : COLLAR.right
    return plates
      .map((p) => {
        const left = dir < 0 ? x - p.w : x
        x += dir * (p.w + 1)
        return `<rect x="${left}" y="${MID - p.h / 2}" width="${p.w}" height="${p.h}" rx="2" fill="${p.color}" stroke="#0b0c0e" stroke-width="1.5"/>`
      })
      .join('')
  }
  return `
    <rect x="8" y="${MID - 3}" width="304" height="6" rx="3" fill="#9aa3ad" stroke="#0b0c0e" stroke-width="1.5"/>
    <rect x="${COLLAR.left}" y="${MID - 9}" width="6" height="18" rx="1" fill="#6b737d" stroke="#0b0c0e" stroke-width="1.5"/>
    <rect x="${COLLAR.right - 6}" y="${MID - 9}" width="6" height="18" rx="1" fill="#6b737d" stroke="#0b0c0e" stroke-width="1.5"/>
    <g>${side(-1)}</g><g>${side(1)}</g>
    <path d="M 140 ${MID} h 40" stroke="#c7cdd4" stroke-width="2" stroke-dasharray="1 2"/>`
}
