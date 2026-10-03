// The window statistics behind the stats cards: pure functions over the
// request ledger and the percentage samples, no engine calls.

import { CODE, FAMILIES, familyOfCode, usdPerToken } from './prices'
import type { Family, Mix } from './prices'

// ---------- the ledger ----------

// One minute of one model family's requests in one session:
// [minute since epoch, family code, input, output, cache read, cache write, usd]
export type Row = [number, string, number, number, number, number, number]

export const MINUTE = 60_000
// Rows older than this are dropped: a 7d window and a day to spare
export const KEEP_MS = 8 * 86400_000

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number }

// Adds a request's tokens to the ledger, in the row of its minute and family
export function addTokens(rows: Row[], now: number, code: string, u: Usage): Row {
  const min = Math.floor(now / MINUTE)
  const row = findRow(rows, min, code)
  row[2] += u.input
  row[3] += u.output
  row[4] += u.cacheRead
  row[5] += u.cacheWrite
  return row
}

// Adds dollars to the given row, else the latest if it is recent, else a new
// one for this minute
export function addUsd(rows: Row[], now: number, usd: number, row?: Row): void {
  if (!(usd > 0)) return
  const min = Math.floor(now / MINUTE)
  const last = rows[rows.length - 1]
  const into = row ?? (last && last[0] >= min - 1 ? last : findRow(rows, min, last ? last[1] : 'x'))
  into[6] = Math.round((into[6] + usd) * 1e6) / 1e6
}

function findRow(rows: Row[], min: number, code: string): Row {
  for (let i = rows.length - 1; i >= 0 && rows[i]![0] >= min; i--) {
    const r = rows[i]!
    if (r[0] === min && r[1] === code) return r
  }
  const row: Row = [min, code, 0, 0, 0, 0, 0]
  rows.push(row)
  return row
}

export function prune(rows: Row[], now: number): Row[] {
  const oldest = Math.floor((now - KEEP_MS) / MINUTE)
  return rows.filter(r => r[0] >= oldest)
}

export function isRow(r: unknown): r is Row {
  return (
    Array.isArray(r) &&
    r.length === 7 &&
    typeof r[1] === 'string' &&
    [0, 2, 3, 4, 5, 6].every(i => typeof r[i] === 'number' && Number.isFinite(r[i]))
  )
}

// ---------- percentage samples ----------

// [seconds since epoch, percent used]
export type Sample = [number, number]
export type SampleLog = { resetsAt: number; pts: Sample[]; prev?: { resetsAt: number; pts: Sample[] } }

// Two readings of one window may disagree on its reset by a few seconds
const SAME_WINDOW_MS = 10 * MINUTE
const MAX_SAMPLES = 400

// The log with a new reading in it, or null when the reading adds nothing
export function addSample(
  log: SampleLog | undefined,
  resetsAt: number,
  now: number,
  pct: number,
  minGapMs: number,
): SampleLog | null {
  let next: SampleLog
  if (!log || Math.abs(log.resetsAt - resetsAt) > SAME_WINDOW_MS) {
    // a reading of an older window, from a session that has not caught up
    if (log && log.resetsAt > resetsAt) return null
    next = {
      resetsAt,
      pts: [],
      ...(log && log.pts.length ? { prev: { resetsAt: log.resetsAt, pts: log.pts } } : log?.prev ? { prev: log.prev } : {}),
    }
  } else {
    next = { ...log, pts: [...log.pts] }
  }
  const sec = Math.round(now / 1000)
  const last = next.pts[next.pts.length - 1]
  if (last && (sec <= last[0] || (last[1] === pct && (sec - last[0]) * 1000 < minGapMs))) return null
  next.pts.push([sec, pct])
  if (next.pts.length > MAX_SAMPLES) next.pts = next.pts.filter((_, i) => i % 2 === 0 || i === next.pts.length - 1)
  return next
}

export function isSampleLog(v: unknown): v is SampleLog {
  const o = v as SampleLog | null
  return !!o && typeof o === 'object' && typeof o.resetsAt === 'number' && Array.isArray(o.pts)
}

// ---------- one window ----------

export type WindowKind = 'five_hour' | 'seven_day'

export const SPAN: Record<WindowKind, number> = { five_hour: 5 * 3600_000, seven_day: 7 * 86400_000 }

export type WindowInput = {
  kind: WindowKind
  pct: number
  resetsAt: number
  now: number
  rows: readonly Row[]
  // when the ledger began: a window that started earlier is only partly tracked
  since: number
  samples?: SampleLog
}

export type Status =
  | { kind: 'early' }
  | { kind: 'pace'; projected: number }
  | { kind: 'hit'; hitIn: number; beforeReset: number }
  | { kind: 'reached' }

export type WindowStats = {
  kind: WindowKind
  label: '5h' | '7d'
  span: number
  start: number
  now: number
  end: number
  pct: number
  // how far through the window, 0 to 1
  frac: number
  remaining: number
  // the ledger began after the window did, at this time
  isPartial: boolean
  trackedSince: number
  // dollars and tokens the ledger saw in the window
  usd: number
  tokens: number
  used: Record<Family, number>
  mix: Mix
  // the whole window at API prices, once there is enough to tell
  value: number | null
  spent: number | null
  left: number | null
  // per hour for 5h, per day for 7d
  unit: 'h' | 'day'
  avgRate: number | null
  allowedRate: number | null
  // the same two in points of the limit, known without dollars
  avgPctRate: number | null
  allowedPctRate: number | null
  // the family most of the dollars went to
  ref: Family
  status: Status
  // [fraction of the window, percent], oldest first, ending now
  curve: Array<[number, number]>
  // the stretch before the ledger began, drawn faint
  untracked: Array<[number, number]> | null
  prev: { curve: Array<[number, number]>; atNow: number; atEnd: number } | null
}

// The pace needs this much of the window behind it
const MIN_PACE_FRAC = 0.03
// and the value this many points of the limit
const MIN_VALUE_PCT = 1

export function windowStats(w: WindowInput): WindowStats {
  const span = SPAN[w.kind]
  const end = w.resetsAt
  const start = end - span
  const now = Math.min(Math.max(w.now, start), end)
  const elapsed = now - start
  const remaining = end - now
  const frac = elapsed / span
  const pct = w.pct
  const isPartial = w.since > start

  // the ledger's view of the window
  const used: Record<Family, number> = { fable: 0, opus: 0, sonnet: 0, haiku: 0 }
  const usdBy: Record<string, number> = {}
  const mix: Mix = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  const startMin = Math.floor(start / MINUTE)
  const inWindow = w.rows.filter(r => r[0] >= startMin).sort((a, b) => a[0] - b[0])
  let usd = 0
  for (const r of inWindow) {
    const tokens = r[2] + r[3] + r[4] + r[5]
    const f = familyOfCode(r[1])
    if (f) used[f] += tokens
    mix.input += r[2]
    mix.output += r[3]
    mix.cacheRead += r[4]
    mix.cacheWrite += r[5]
    usd += r[6]
    usdBy[r[1]] = (usdBy[r[1]] ?? 0) + r[6]
  }
  const tokens = mix.input + mix.output + mix.cacheRead + mix.cacheWrite
  const ref =
    FAMILIES.map(f => [f, usdBy[CODE[f]] ?? 0] as const).sort((a, b) => b[1] - a[1]).find(([, v]) => v > 0)?.[0] ??
    'opus'

  // the value: dollars over the share of the limit they used. A partly
  // tracked window counts from the first reading after the ledger began.
  let value: number | null = null
  let base: [number, number] = [start, 0]
  if (isPartial) {
    const first = (w.samples && Math.abs(w.samples.resetsAt - end) < SAME_WINDOW_MS ? w.samples.pts : []).find(
      p => p[0] * 1000 >= w.since,
    )
    base = first ? [first[0] * 1000, first[1]] : [now, pct]
  }
  const baseMin = Math.floor(base[0] / MINUTE)
  const usdSinceBase = isPartial ? inWindow.filter(r => r[0] >= baseMin).reduce((s, r) => s + r[6], 0) : usd
  const pctSinceBase = pct - base[1]
  if (pctSinceBase >= MIN_VALUE_PCT && usdSinceBase > 0) value = usdSinceBase / (pctSinceBase / 100)

  const spent = value === null ? null : (value * pct) / 100
  const left = value === null ? null : Math.max(0, (value * (100 - pct)) / 100)
  const unitMs = w.kind === 'five_hour' ? 3600_000 : 86400_000
  const avgRate = spent === null || elapsed <= 0 ? null : (spent / elapsed) * unitMs
  const allowedRate = left === null || remaining <= 0 ? null : (left / remaining) * unitMs
  const avgPctRate = elapsed <= 0 ? null : (pct / elapsed) * unitMs
  const allowedPctRate = remaining <= 0 ? null : (Math.max(0, 100 - pct) / remaining) * unitMs

  let status: Status
  if (pct >= 100) status = { kind: 'reached' }
  else if (frac < MIN_PACE_FRAC || pct <= 0) status = { kind: 'early' }
  else {
    const rate = pct / elapsed
    const projected = pct + rate * remaining
    if (projected <= 100) status = { kind: 'pace', projected }
    else {
      const hitIn = (100 - pct) / rate
      status = { kind: 'hit', hitIn, beforeReset: remaining - hitIn }
    }
  }

  // the curve: the ledger's spending shape scaled to the readings
  const toFrac = (t: number) => Math.min(1, Math.max(0, (t - start) / span))
  let curve: Array<[number, number]> = []
  const from = base[0]
  const span0 = pct - base[1]
  const sinceBase = inWindow.filter(r => r[0] >= baseMin)
  const total = sinceBase.reduce((s, r) => s + r[6], 0)
  if (total > 0 && span0 > 0) {
    curve.push([toFrac(from), base[1]])
    let cum = 0
    for (const r of sinceBase) {
      cum += r[6]
      const t = Math.max(from, (r[0] + 1) * MINUTE)
      curve.push([toFrac(Math.min(t, now)), base[1] + (span0 * cum) / total])
    }
  } else {
    // no dollars to shape it: the readings themselves
    const pts = w.samples && Math.abs(w.samples.resetsAt - end) < SAME_WINDOW_MS ? w.samples.pts : []
    curve = pts.filter(p => p[0] * 1000 >= from).map(p => [toFrac(p[0] * 1000), p[1]] as [number, number])
    if (!curve.length || curve[0]![0] > toFrac(from)) curve.unshift([toFrac(from), base[1]])
  }
  curve.push([frac, pct])
  curve = thin(curve)
  const untracked: Array<[number, number]> | null = isPartial && from > start ? [[0, 0], [toFrac(from), base[1]]] : null

  // the window before, by the same fraction of its time
  let prev: WindowStats['prev'] = null
  const p = w.samples?.prev
  if (p && p.pts.length >= 2 && p.resetsAt < end - SAME_WINDOW_MS) {
    const pStart = p.resetsAt - span
    const pc = p.pts
      .map(([t, v]) => [(t * 1000 - pStart) / span, v] as [number, number])
      .filter(([f]) => f >= 0 && f <= 1)
    if (pc.length >= 2) {
      prev = { curve: thin([[0, 0], ...pc]), atNow: valueAt([[0, 0], ...pc], frac), atEnd: pc[pc.length - 1]![1] }
    }
  }

  return {
    kind: w.kind,
    label: w.kind === 'five_hour' ? '5h' : '7d',
    span,
    start,
    now,
    end,
    pct,
    frac,
    remaining,
    isPartial,
    trackedSince: Math.max(start, w.since),
    usd,
    tokens,
    used,
    mix,
    value,
    spent,
    left,
    unit: w.kind === 'five_hour' ? 'h' : 'day',
    avgRate,
    allowedRate,
    avgPctRate,
    allowedPctRate,
    ref,
    status,
    curve,
    untracked,
    prev,
  }
}

// Linear between the points either side; the last value past the end
export function valueAt(pts: ReadonlyArray<[number, number]>, f: number): number {
  if (!pts.length) return 0
  if (f <= pts[0]![0]) return pts[0]![1]
  for (let i = 1; i < pts.length; i++) {
    const [f1, v1] = pts[i]!
    if (f <= f1) {
      const [f0, v0] = pts[i - 1]!
      return f1 === f0 ? v1 : v0 + ((v1 - v0) * (f - f0)) / (f1 - f0)
    }
  }
  return pts[pts.length - 1]![1]
}

// At most one point per 1/200 of the window, keeping the last
function thin(pts: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && p[0] - last[0] < 0.005) out[out.length - 1] = [last[0], p[1]]
    else out.push(p)
  }
  const lastPt = pts[pts.length - 1]
  if (lastPt && out[out.length - 1] !== lastPt) out[out.length - 1] = lastPt
  return out
}

// Tokens a sum of dollars buys of one family, at the window's split of kinds
export function tokensFor(usd: number, f: Family, mix: Mix): number {
  return usd / usdPerToken(f, mix)
}
