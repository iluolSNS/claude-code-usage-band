// The stats cards as one SVG: a card per rate-limit window, drawn as a
// chart of the window or as what is left of it per model.

import { FAMILIES, MODEL_NAME, MODEL_SHORT } from './prices'
import type { Family } from './prices'
import { tokensFor } from './stats'
import type { WindowStats } from './stats'
import { esc, fmtBig, fmtLeft, fmtRate, fmtUsd, fmtUsdWhole, themeCss } from './format'
import type { Theme } from './format'
import type { StatsView } from '../types'

export type View = StatsView

export const CARD_W = 540
export const CARD_H = 334
export const CARD_GAP = 16

const SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`

const MODEL_COLOR: Record<Family, string> = {
  fable: '#7b6ee6',
  opus: '#dd5f32',
  sonnet: '#1d9e6f',
  haiku: '#8e8e93',
}

const LIGHT = `
  text{font-family:${SANS}}
  .card{fill:#fff;stroke:#d4d4d8;stroke-width:1.5}
  .t1{fill:#1d1d1f}.t2{fill:#6e6e73}
  .rule{stroke:#e4e4e7;stroke-width:1.5}
  .red{fill:#c62828}.reds{stroke:#c62828}.redf{fill:#c62828}
  .ok{fill:#2e8b57}
  .track{fill:#ececef}
  .prev{stroke:#a1a1aa;fill:none}
  .ring{stroke:#fff}
  .w5 .af{fill:#2e8b57}.w5 .as{stroke:#2e8b57}.w5 .tint{fill:#eaf4ee}.w5 .area{fill:#2e8b57;fill-opacity:.14}
  .w7 .af{fill:#6a55d8}.w7 .as{stroke:#6a55d8}.w7 .tint{fill:#efecfb}.w7 .area{fill:#6a55d8;fill-opacity:.14}
`
const DARK = `
  .card{fill:#232427;stroke:#3f3f46}
  .t1{fill:#f4f4f5}.t2{fill:#a1a1aa}
  .rule{stroke:#3a3a40}
  .red{fill:#f47171}.reds{stroke:#f47171}.redf{fill:#f47171}
  .ok{fill:#5cc48a}
  .track{fill:#3a3a40}
  .prev{stroke:#71717a}
  .ring{stroke:#232427}
  .w5 .af{fill:#5cc48a}.w5 .as{stroke:#5cc48a}.w5 .tint{fill:#1f3329}.w5 .area{fill:#5cc48a;fill-opacity:.16}
  .w7 .af{fill:#a594ff}.w7 .as{stroke:#a594ff}.w7 .tint{fill:#2b2745}.w7 .area{fill:#a594ff;fill-opacity:.18}
`

function t(x: number, y: number, s: string, cls: string, size: number, extra = ''): string {
  return `<text x="${x}" y="${y}" class="${cls}" style="font-size:${size}px" ${extra}>${s}</text>`
}

const unitLabel = (w: WindowStats) => (w.unit === 'h' ? '/h' : '/day')

function header(w: WindowStats): string {
  const W = CARD_W
  let out = `<rect class="card" x="1" y="1" width="${W - 2}" height="${CARD_H - 2}" rx="16"/>`
  const title =
    w.value === null ? `${w.label} window` : `${w.label} window ≈ ${fmtUsdWhole(w.value)} at API prices`
  out += t(28, 46, esc(title), 't1', 21, 'font-weight="500"')
  const parts = [`used ${Math.round(w.pct)}%`]
  if (w.spent !== null) parts.push((w.isPartial ? '≈' : '') + fmtUsd(w.spent))
  if (w.tokens > 0) parts.push(`${fmtBig(w.tokens)} tokens`)
  if (w.isPartial) parts.push(`tracked ${fmtLeft(w.now - Math.max(w.start, trackedFrom(w)))}`)
  else if (w.value === null) parts.push('measuring API value…')
  out += t(28, 80, esc(parts.join(' · ')), 't2', 16.5)
  return out
}

// where the drawn curve begins: the window's start, or the ledger's
function trackedFrom(w: WindowStats): number {
  return w.untracked ? w.start + w.untracked[1]![0] * w.span : w.start
}

// ---------- chart view ----------

function chartCard(w: WindowStats): string {
  const W = CARD_W
  let out = header(w)
  const s = w.status
  const reset = fmtLeft(w.remaining)

  // the verdict
  let left: string
  let right: string
  if (s.kind === 'pace') {
    left = t(28, 124, `On pace to finish at <tspan class="ok">${Math.round(s.projected)}%</tspan>`, 't1', 17.5, 'font-weight="600"')
    right = t(W - 26, 124, `reset in ${reset}`, 'ok', 15.5, 'text-anchor="end" font-weight="600"')
  } else if (s.kind === 'hit') {
    left = t(28, 124, `Limit hit in ${fmtLeft(s.hitIn)}`, 'red', 17.5, 'font-weight="600"')
    right = t(W - 26, 124, `${fmtLeft(s.beforeReset)} before reset`, 'red', 15.5, 'text-anchor="end" font-weight="600"')
  } else if (s.kind === 'reached') {
    left = t(28, 124, 'Limit reached', 'red', 17.5, 'font-weight="600"')
    right = t(W - 26, 124, `reset in ${reset}`, 't2', 15.5, 'text-anchor="end" font-weight="600"')
  } else {
    left = t(28, 124, 'Too early to tell the pace', 't1', 17.5, 'font-weight="600"')
    right = t(W - 26, 124, `reset in ${reset}`, 't2', 15.5, 'text-anchor="end" font-weight="600"')
  }
  out += left + right
  out += `<line class="rule" x1="16" y1="136" x2="${W - 16}" y2="136"/>`

  // the two rates
  const equiv = (rate: number | null) =>
    rate === null ? '' : `≈ ${fmtBig(tokensFor(rate, w.ref, w.mix))} ${MODEL_SHORT[w.ref]}`
  const rateText = (rate: number | null) => (rate === null ? '—' : fmtRate(rate) + unitLabel(w))
  out += t(28, 162, 'Average so far', 't1', 16.5)
  out += t(W - 165, 162, rateText(w.avgRate), 't1', 18, 'text-anchor="end" font-weight="500"')
  out += t(W - 26, 162, esc(equiv(w.avgRate)), 't2', 15, 'text-anchor="end"')
  const isHit = s.kind === 'hit'
  out += `<rect class="tint" x="16" y="178" width="${W - 32}" height="34" rx="9"/>`
  out += t(28, 201, isHit ? 'Slow down to' : 'Spend up to', 't1', 16.5)
  out += t(W - 165, 201, rateText(w.allowedRate), isHit ? 'red' : 't1', 18.5, 'text-anchor="end" font-weight="600"')
  out += t(W - 26, 201, esc(equiv(w.allowedRate)), 't2', 15, 'text-anchor="end"')

  out += chart(w)

  // the window before
  if (w.prev) {
    const name = w.kind === 'seven_day' ? 'Last week' : 'Last 5h window'
    out += `<line class="prev" x1="28" y1="310" x2="48" y2="310" stroke-width="2"/>`
    out += t(58, 316, `${name}: ${Math.round(w.prev.atNow)}% by now, ${Math.round(w.prev.atEnd)}% at reset`, 't2', 15.5)
  } else {
    out += t(28, 316, `No previous ${w.label} window to compare`, 't2', 15.5)
  }
  return out
}

function chart(w: WindowStats): string {
  const x0 = 28
  const x1 = CARD_W - 78
  const yTop = 224
  const yBot = 286
  const yMax = 108
  const X = (f: number) => (x0 + f * (x1 - x0)).toFixed(1)
  const Y = (p: number) => (yBot - (Math.min(p, yMax) / yMax) * (yBot - yTop)).toFixed(1)
  const yLimit = Y(100)
  const line = (pts: ReadonlyArray<[number, number]>) => pts.map(([f, p]) => `${X(f)},${Y(p)}`).join(' ')
  let out = ''

  out += `<line class="rule" x1="${x0}" y1="${yBot}" x2="${x1}" y2="${yBot}"/>`
  out += `<line class="reds" x1="${x0}" y1="${yLimit}" x2="${x1}" y2="${yLimit}" stroke-width="1.6" stroke-dasharray="3 4"/>`
  out += t(x1 + 10, Number(yLimit) + 5, 'limit', 'red', 15)

  if (w.prev) out += `<polyline class="prev" points="${line(w.prev.curve)}" stroke-width="1.8" stroke-linejoin="round"/>`

  const c = w.curve
  if (c.length >= 2) {
    const area = `${X(c[0]![0])},${yBot} ${line(c)} ${X(c[c.length - 1]![0])},${yBot}`
    out += `<polygon class="area" points="${area}"/>`
    out += `<polyline class="as" points="${line(c)}" fill="none" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>`
  }
  if (w.untracked) {
    out += `<polyline class="as" points="${line(w.untracked)}" fill="none" stroke-width="1.6" stroke-dasharray="2 4" opacity=".6"/>`
  }

  const nf = w.frac
  const np = w.pct
  const s = w.status
  // the budget: from now to the limit at the reset
  if (np < 100) {
    out += `<polyline class="as" points="${X(nf)},${Y(np)} ${X(1)},${yLimit}" fill="none" stroke-width="1.8" opacity=".4"/>`
  }
  // the projection at the pace so far
  if (s.kind === 'pace') {
    out += `<polyline class="as" points="${X(nf)},${Y(np)} ${X(1)},${Y(s.projected)}" fill="none" stroke-width="2.4" stroke-dasharray="6 4"/>`
  } else if (s.kind === 'hit') {
    const fh = nf + s.hitIn / w.span
    out += `<polyline class="reds" points="${X(nf)},${Y(np)} ${X(fh)},${yLimit}" fill="none" stroke-width="2.4" stroke-dasharray="6 4"/>`
    out += `<circle class="redf" cx="${X(fh)}" cy="${yLimit}" r="4.5"/>`
  }
  out += `<circle class="af ring" cx="${X(nf)}" cy="${Y(np)}" r="5" stroke-width="2"/>`
  return out
}

// ---------- by-model view ----------

function modelCard(w: WindowStats): string {
  const W = CARD_W
  let out = header(w)
  const colC = W - 148
  out += `<rect class="tint" x="${colC - 60}" y="102" width="120" height="190" rx="10"/>`
  out += t(28, 128, 'If you use only…', 't1', 16.5)
  out += t(colC, 128, 'tokens left', 'af', 16.5, 'text-anchor="middle" font-weight="600"')
  out += t(W - 26, 128, 'used', 't2', 16.5, 'text-anchor="end"')
  out += `<line class="rule" x1="16" y1="140" x2="${W - 16}" y2="140"/>`

  const left = FAMILIES.map(f => (w.left === null ? null : tokensFor(w.left, f, w.mix)))
  const max = Math.max(1, ...left.map(v => v ?? 0))
  const barX = 152
  const barW = colC - 60 - 22 - barX
  FAMILIES.forEach((f, i) => {
    const y = 168 + i * 36
    const v = left[i] ?? null
    out += `<circle cx="36" cy="${y - 6}" r="6.5" fill="${MODEL_COLOR[f]}"/>`
    out += t(52, y, MODEL_NAME[f], 't1', 16.5)
    out += `<rect class="track" x="${barX}" y="${y - 10}" width="${barW}" height="8" rx="4"/>`
    if (v !== null && v > 0) {
      out += `<rect x="${barX}" y="${y - 10}" width="${Math.max(4, (v / max) * barW).toFixed(1)}" height="8" rx="4" fill="${MODEL_COLOR[f]}"/>`
    }
    out += t(colC, y + 1, v === null ? '—' : fmtBig(v), 't1', 18.5, 'text-anchor="middle" font-weight="600"')
    out += t(W - 26, y, w.used[f] > 0 ? fmtBig(w.used[f]) : 'none', 't2', 15.5, 'text-anchor="end"')
  })

  const foot =
    w.left === null
      ? 'Measuring this window’s API value…'
      : `Same ${fmtUsd(w.left)} left, spent at each model’s price`
  out += t(28, 318, esc(foot), 't2', 15.5)
  return out
}

// ---------- the drawing ----------

export function statsSvg(
  windows: readonly WindowStats[],
  view: View,
  theme: Theme,
  isStacked: boolean,
): { svg: string; width: number; height: number; alt: string } {
  const n = windows.length
  const width = isStacked ? CARD_W : n * CARD_W + (n - 1) * CARD_GAP
  const height = isStacked ? n * CARD_H + (n - 1) * CARD_GAP : CARD_H
  let body = ''
  windows.forEach((w, i) => {
    const x = isStacked ? 0 : i * (CARD_W + CARD_GAP)
    const y = isStacked ? i * (CARD_H + CARD_GAP) : 0
    const cls = w.kind === 'five_hour' ? 'w5' : 'w7'
    body += `<g class="${cls}" transform="translate(${x},${y})">${view === 'chart' ? chartCard(w) : modelCard(w)}</g>`
  })
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<style>${themeCss(LIGHT, DARK, theme)}</style>${body}</svg>`
  return { svg, width, height, alt: windows.map(w => statsAlt(w, view)).join(' ') }
}

// The cards in words: the alt text, and the terminal's lines
export function statsAlt(w: WindowStats, view: View): string {
  const head =
    w.value === null
      ? `${w.label} window: ${Math.round(w.pct)}% used, API value not measured yet.`
      : `${w.label} window ≈ ${fmtUsdWhole(w.value)} at API prices, ${Math.round(w.pct)}% used.`
  if (view === 'model') {
    if (w.left === null) return head
    const per = FAMILIES.map(f => `${MODEL_SHORT[f]} ${fmtBig(tokensFor(w.left!, f, w.mix))}`).join(', ')
    return `${head} Tokens left if you use only: ${per}.`
  }
  return `${head} ${verdict(w)}.`
}

export function verdict(w: WindowStats): string {
  const s = w.status
  const u = unitLabel(w)
  if (s.kind === 'reached') return `Limit reached, resets in ${fmtLeft(w.remaining)}`
  if (s.kind === 'early') return `Too early to tell, resets in ${fmtLeft(w.remaining)}`
  const avg = w.avgRate === null ? '' : `, average ${fmtRate(w.avgRate)}${u}`
  if (s.kind === 'pace') {
    const up = w.allowedRate === null ? '' : `, spend up to ${fmtRate(w.allowedRate)}${u}`
    return `On pace to finish at ${Math.round(s.projected)}%${avg}${up}`
  }
  const down = w.allowedRate === null ? '' : `, slow down to ${fmtRate(w.allowedRate)}${u}`
  return `Limit hit in ${fmtLeft(s.hitIn)}, ${fmtLeft(s.beforeReset)} before reset${avg}${down}`
}
