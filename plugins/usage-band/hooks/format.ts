import type { Theme } from '../types'

export type { Theme }

// A stylesheet that follows the theme: the system's under `auto`, else forced.
// The SVG is drawn as an image, so `auto` follows the OS, not the app.
export function themeCss(light: string, dark: string, theme: Theme): string {
  if (theme === 'light') return light
  if (theme === 'dark') return light + dark
  return `${light}@media (prefers-color-scheme: dark){${dark}}`
}

export function fmtLeft(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function grouped(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// $1,256 · $177 · $90.19
export function fmtUsd(n: number): string {
  return n >= 100 ? '$' + grouped(n) : '$' + n.toFixed(2)
}

// The headline figure: whole dollars
export function fmtUsdWhole(n: number): string {
  return n >= 10 ? '$' + grouped(n) : '$' + n.toFixed(2)
}

// $24 · $3.4
export function fmtRate(n: number): string {
  return n >= 10 ? '$' + grouped(n) : '$' + n.toFixed(1)
}

// 7.24B · 269.5M · 32.1k
export function fmtBig(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k'
  return String(Math.round(n))
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
