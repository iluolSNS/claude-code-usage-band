import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Speed, Totals } from '../types'

const ZERO: Totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
const totals = atom({ plugin: 'usage-band', key: 'totals' } as const, ZERO)
const speed = atom({ plugin: 'usage-band', key: 'speed' } as const, null as Speed | null)
// Streamed characters per output token, learned from finished responses
const charsPerToken = atom({ plugin: 'usage-band', key: 'charsPerToken' } as const, 3)
// How often the live rate is redrawn while a response streams
const LIVE_MS = 400

const WINDOW_MS: Record<string, number> = {
  five_hour: 5 * 3600_000,
  seven_day: 7 * 86400_000,
}

// ---------- formatting ----------

function fmtTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return (n / 1000).toFixed(1) + 'k'
  return (n / 1_000_000).toFixed(2) + 'M'
}

// 84k, 1.2M: no decimals unless they matter
function fmtShort(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return Math.round(n / 1000) + 'k'
  const m = n / 1_000_000
  return (Number.isInteger(m) ? m : m.toFixed(1)) + 'M'
}

function fmtLeft(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

type Window = { label: string; pct: number; elapsed: number | null; left: string | null; isContext?: boolean }

function toWindow(r: SessionRateLimit | undefined, label: string, now: number): Window | null {
  if (!r) return null
  const span = WINDOW_MS[r.kind]
  let elapsed: number | null = null
  let left: string | null = null
  if (r.resetsAt) {
    const remaining = Date.parse(r.resetsAt) - now
    left = fmtLeft(remaining)
    if (span) elapsed = Math.min(1, Math.max(0, 1 - remaining / span))
  }
  return { label, pct: r.percentUsed, elapsed, left }
}

// ---------- SVG pills ----------

const FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace'
// px per monospace char, by font size
const ch = (fs: number) => fs * 0.614
const H = 30
const PX_PER_COL = 7.9 // desktop: CSS px per band cell, measured

type Tone = 'teal' | 'violet' | 'red' | 'green' | 'cyan' | 'blue' | 'gold' | 'slate'

const STYLE = `
<style>
  .t{font-family:${FONT};font-size:14px;fill:#3b4440}
  .b{font-weight:700;fill:#1f2523}
  .d{fill:#6b7571}
  .ic{fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
  .track{fill:#00000018}
  .tick{fill:#2a302d}
  .sep{fill:#00000022}
  .teal .bg{fill:#dcebe5}.teal .ic{stroke:#3f8f73}
  .violet .bg{fill:#e7e2f6}.violet .ic{stroke:#7a5cc7}
  .red .bg{fill:#f6ddd7}.red .ic{stroke:#c4553f}
  .green .bg{fill:#dcebdb}.green .ic{stroke:#4f9a52}
  .cyan .bg{fill:#d8eef1}.cyan .ic{stroke:#2a8fa3}
  .blue .bg{fill:#dde3f7}.blue .ic{stroke:#4b63c9}
  .gold .bg{fill:#f3eacf}.gold .ic{stroke:#b58a1c}.gold .coin{fill:#b58a1c}
  .slate .bg{fill:#e3e7eb}.slate .ic{stroke:#5b6875}
  .red .lb{fill:#c4553f}.green .lb{fill:#4f9a52}.blue .lb{fill:#4b63c9}
  @media (prefers-color-scheme: dark){
    .t{fill:#d6dcd9}.b{fill:#f3f6f4}.d{fill:#9aa4a0}
    .track{fill:#ffffff22}.tick{fill:#eef2f0}.sep{fill:#ffffff26}
    .teal .bg{fill:#1f3a31}.teal .ic{stroke:#6cc3a2}
    .violet .bg{fill:#2e2747}.violet .ic{stroke:#a98ff0}
    .red .bg{fill:#43241e}.red .ic{stroke:#ec8a74}
    .green .bg{fill:#213a22}.green .ic{stroke:#7cc77f}
    .cyan .bg{fill:#1b3a40}.cyan .ic{stroke:#6ccadc}
    .blue .bg{fill:#232c4c}.blue .ic{stroke:#8ea0f0}
    .gold .bg{fill:#3d3218}.gold .ic{stroke:#e0b94a}.gold .coin{fill:#e0b94a}
    .slate .bg{fill:#2b3138}.slate .ic{stroke:#a9b5c1}
    .red .lb{fill:#ec8a74}.green .lb{fill:#7cc77f}.blue .lb{fill:#8ea0f0}
  }
</style>`

const ICON = {
  gauge: '<path d="M2.8 11.5a5.5 5.5 0 1 1 10.4 0"/><path d="M8 10.5l2.6-3"/>',
  calendar:
    '<rect x="2.5" y="3.5" width="11" height="10" rx="1.6"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/><path d="M6.5 8.6h3l-1.8 3.4"/>',
  clock: '<path d="M2.6 6.2A5.6 5.6 0 1 1 3.4 11"/><path d="M2.4 3.4v2.9h2.9"/><path d="M8 5.2V8l2 1.4"/>',
  coin: '<circle cx="8" cy="8" r="5.8"/>',
  bolt: '<path d="M9 1.8 3.6 9h4l-.8 5.2L12.4 7h-4z"/>',
  doc: '<rect x="2.6" y="2.4" width="10.8" height="11.2" rx="2"/><path d="M5.2 5.8h5.6M5.2 8.2h5.6M5.2 10.6h3.2"/>',
}

function icon(name: keyof typeof ICON, x: number): string {
  const extra =
    name === 'coin'
      ? `<text x="8" y="11.2" text-anchor="middle" class="coin" style="font:700 9px ${FONT}">$</text>`
      : ''
  return `<g transform="translate(${x},${(H - 16) / 2})"><g class="ic">${ICON[name]}</g>${extra}</g>`
}

function text(s: string, x: number, cls = 't'): string {
  return `<text x="${x}" y="${H / 2 + 4.8}" class="${cls}">${s}</text>`
}

function barColor(w: Window): string {
  if (w.isContext) return w.pct >= 80 ? '#d0573f' : w.pct >= 60 ? '#d9a23b' : '#8db36b'
  if (w.pct >= 90) return '#d0573f'
  if (w.elapsed !== null && w.pct / 100 > w.elapsed + 0.15) return '#d9a23b'
  return '#8db36b'
}

// How much room each piece takes, from roomiest to tightest
// fs: font size; ig: the gap after an icon, the others derived from it
type Tier = { bar: number; clock: boolean; tight: boolean; pad: number; gap: number; fs: number; ig: number }
const TIERS: Tier[] = [
  { bar: 64, clock: true, tight: false, pad: 10, gap: 8, fs: 14, ig: 8 },
  { bar: 52, clock: true, tight: false, pad: 9, gap: 7, fs: 14, ig: 7 },
  { bar: 44, clock: false, tight: true, pad: 9, gap: 6, fs: 14, ig: 7 },
  { bar: 40, clock: false, tight: true, pad: 8, gap: 5, fs: 13, ig: 6 },
  { bar: 30, clock: false, tight: true, pad: 7, gap: 4, fs: 12.5, ig: 5 },
  { bar: 0, clock: false, tight: true, pad: 7, gap: 4, fs: 12.5, ig: 5 },
]
// A tier may be up to this much wider than the room: the SVG scales it down
const MAX_SHRINK = 0.97
// Of the room a window pill is given, how much its bar may take
const MAX_BAR_GROW = 90

// A pill drawn at x = 0, placed later
type Pill = { tone: Tone; width: number; body: string; alt: string }
// A pill at a tier, `grow` px wider than its content needs
type Spec = (t: Tier, grow: number) => Pill

function windowPill(w: Window, tone: Tone, iconName: 'gauge' | 'calendar' | 'doc'): Spec {
  return (t, grow) => {
    const pct = `${Math.round(w.pct)}%`
    const bar = t.bar > 0 ? t.bar + Math.min(grow, MAX_BAR_GROW) : 0
    const pad = t.pad + (grow - (bar > 0 ? bar - t.bar : 0)) / 2
    const CH = ch(t.fs)
    let x = pad
    let body = icon(iconName, x)
    x += 16 + t.ig - 1
    body += text(w.label, x, 't d')
    x += w.label.length * CH + t.ig + 1
    if (bar > 0) {
      const fill = Math.max(0, Math.min(1, w.pct / 100)) * bar
      body += `<rect class="track" x="${x}" y="${H / 2 - 3.5}" width="${bar}" height="7" rx="3.5"/>`
      body += `<rect x="${x}" y="${H / 2 - 3.5}" width="${fill}" height="7" rx="3.5" fill="${barColor(w)}"/>`
      if (w.elapsed !== null) {
        body += `<rect class="tick" x="${x + w.elapsed * bar - 1}" y="${H / 2 - 8}" width="2" height="16" rx="1"/>`
      }
      x += bar + t.ig + 2
    }
    body += text(pct, x, 't b')
    x += pct.length * CH
    // when tight, the context pill keeps its percentage alone
    const left = w.isContext && t.tight ? null : w.left && t.tight ? w.left.replace(' ', '') : w.left
    if (left) {
      x += t.ig + 1
      body += `<rect class="sep" x="${x}" y="8" width="1" height="${H - 16}"/>`
      x += 1 + t.ig + 1
      if (t.clock && !w.isContext) {
        body += icon('clock', x)
        x += 16 + t.ig - 1
      }
      body += text(left, x, 't d')
      x += left.length * CH
    }
    x += pad + 2
    const alt = w.isContext
      ? `Context window ${pct} full${w.left ? ` (${w.left} tokens)` : ''}`
      : `${w.label} limit ${pct} used${w.left ? `, resets in ${w.left}` : ''}`
    return { tone, width: x, body, alt }
  }
}

// minChars reserves room for that many characters, so a changing label keeps its width
function simplePill(iconName: keyof typeof ICON, tone: Tone, label: string, alt: string, minChars = 0): Spec {
  return (t, grow) => {
    const CH = ch(t.fs)
    const slot = Math.max(label.length, minChars) * CH
    const pad = t.pad + grow / 2
    let x = pad
    let body = icon(iconName, x)
    x += 16 + t.ig
    body += text(label, x + (slot - label.length * CH) / 2)
    x += slot + pad + 2
    return { tone, width: x, body, alt }
  }
}

// A dim word, then the value: a pill that names itself instead of an icon
function labelPill(label: string, tone: Tone, value: string, alt: string): Spec {
  return (t, grow) => {
    const CH = ch(t.fs)
    const pad = t.pad + 2 + grow / 2
    let x = pad
    let body = `<text x="${x}" y="${H / 2 + 4.8}" class="t lb">${label}</text>`
    x += label.length * CH + t.ig
    body += text(value, x)
    x += value.length * CH + pad
    return { tone, width: x, body, alt }
  }
}

// One row of pills tiled across `room` px: the tightest tier that fits, the
// spare width shared out among the pills; if even the last tier is wider,
// the SVG keeps its viewBox and the surface scales it down.
function band(specs: Spec[], room: number): { svg: string; width: number; alt: string } {
  let tier = TIERS[0]
  let need = 0
  for (const t of TIERS) {
    tier = t
    need = specs.reduce((s, spec) => s + spec(t, 0).width, 0) + (specs.length - 1) * t.gap
    if (need * MAX_SHRINK <= room) break
  }
  const grow = Math.max(0, room - need) / specs.length
  const pills = specs.map(spec => spec(tier, grow))
  const width = Math.ceil(Math.max(room, need))

  let x = 0
  let body = ''
  for (const p of pills) {
    body +=
      `<g class="${p.tone}" transform="translate(${x.toFixed(1)},0)">` +
      `<rect class="bg" width="${p.width.toFixed(1)}" height="${H}" rx="${H / 2}"/>${p.body}</g>`
    x += p.width + tier.gap
  }
  const alt = pills.map(p => p.alt).join('; ')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}">` +
    STYLE + `<style>.t{font-size:${tier.fs}px}</style>` + body + `</svg>`
  return { svg, width, alt }
}

// ---------- the data both views draw ----------

type Snapshot = {
  five: Window | null
  seven: Window | null
  input: number
  output: number
  cache: number
  usd: number | undefined
  tps: Speed | null
  ctx: Window | null
  isEmpty: boolean
}

// The window /context measures against: the model's, or a smaller auto-compact
// window. A local estimate (no API call) but not free, so read now and then.
let compactWindow: number | null = null
let compactWindowAt = 0
const COMPACT_WINDOW_TTL = 5 * 60_000

async function loadCompactWindow($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  if (compactWindow !== null && now - compactWindowAt < COMPACT_WINDOW_TTL) return
  compactWindowAt = now
  try {
    const u = await $.session.usage({ breakdown: 'summary' })
    compactWindow = u.context.breakdown?.rawMaxTokens ?? null
  } catch {
    compactWindow = null
  }
}

async function snapshot($: EngineInterface): Promise<Snapshot> {
  const usage = await $.session.usage()
  const t = await read($, totals)
  const raw = await read($, speed)
  // a value an older version of this mod left behind is not a Speed
  const tps = raw && typeof raw === 'object' && Number.isFinite(raw.tps) ? raw : null
  const now = await $.clock.now()
  const five = toWindow(usage.rateLimits.find(r => r.kind === 'five_hour'), '5h', now)
  const seven = toWindow(usage.rateLimits.find(r => r.kind === 'seven_day'), '7d', now)
  const usd = usage.cost?.usd
  const hasTokens = t.input + t.output + t.cacheRead + t.cacheWrite > 0
  const c = usage.context
  // measured against the auto-compact window (autoCompactWindow) when one is set
  const limit = compactWindow ?? c.window
  const ctx: Window | null =
    c.tokens === undefined
      ? null
      : {
          label: 'ctx',
          pct: Math.round((c.tokens / limit) * 1000) / 10,
          elapsed: null,
          left: `${fmtShort(c.tokens)}/${fmtShort(limit)}`,
          isContext: true,
        }
  return {
    five,
    seven,
    input: t.input + t.cacheWrite,
    output: t.output,
    cache: t.cacheRead,
    usd,
    tps,
    ctx,
    isEmpty: !five && !seven && usd === undefined && !hasTokens,
  }
}

const tpsText = (s: Speed | null) => (s ? `${s.isLive ? '~' : ''}${Math.round(s.tps)} t/s` : '– t/s')

// ---------- the status line ----------

function miniBar(pct: number): string {
  const n = Math.round(Math.max(0, Math.min(1, pct / 100)) * 5)
  return '▰'.repeat(n) + '▱'.repeat(5 - n)
}

function statusLine(s: Snapshot): string {
  const parts: string[] = []
  for (const w of [s.five, s.seven]) {
    if (w) parts.push(`${w.label} ${miniBar(w.pct)} ${Math.round(w.pct)}%${w.left ? ` ↻${w.left.replace(' ', '')}` : ''}`)
  }
  let tokens = `in ${fmtTokens(s.input)}  out ${fmtTokens(s.output)}`
  tokens += `  ⚡${tpsText(s.tps)}`
  tokens += `  cache ${fmtTokens(s.cache)}`
  parts.push(tokens)
  if (s.usd !== undefined) parts.push('$' + s.usd.toFixed(2))
  if (s.ctx) parts.push(`ctx ${miniBar(s.ctx.pct)} ${Math.round(s.ctx.pct)}%`)
  return parts.join('  ·  ')
}

// ---------- the mod ----------

type Mode = 'band' | 'status'
let mode: Mode = 'band'

// the status line is pushed, not drawn: refresh it whenever a figure moves
async function refresh($: EngineInterface): Promise<void> {
  if (mode === 'status') {
    const s = await snapshot($)
    $.ui.status(s.isEmpty ? undefined : statusLine(s))
  } else {
    $.ui.invalidate('ui.render')
  }
}

export const register: Register = on => {

  on('session.start', async ($, e, next) => {
    mode = (await $.store.get('mode')) === 'status' ? 'status' : 'band'
    await $.command.register({
      name: 'usage-band',
      description: 'Switch the usage display: above the prompt (band) or the status line (status)',
      argumentHint: '[band|status]',
      immediate: true,
    })
    // keep the reset countdowns fresh
    $.clock.every(60_000, () => void refresh($))
    void loadCompactWindow($).then(() => refresh($))
    return next(e)
  })

  on('command.run', { command: 'usage-band' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const want: Mode | null =
      arg === '' ? (mode === 'band' ? 'status' : 'band') : arg === 'band' || arg === 'status' ? arg : null
    if (!want) return { text: 'Usage: /usage-band [band|status] (no argument toggles)' }
    mode = want
    await $.store.set('mode', mode)
    if (mode === 'band') $.ui.status(undefined)
    $.ui.invalidate('ui.render')
    await refresh($)
    return {
      text: mode === 'band' ? 'Usage now shows as pills above the prompt.' : 'Usage now shows on the status line.',
    }
  })

  // rate limits or cost moved
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) await loadCompactWindow($)
    await refresh($)
    return next(e)
  })

  // every model request (main and subagents): add its tokens;
  // on the main thread, also show its tokens per second as it streams
  on('turn.step', async function* ($, e, next) {
    const isMain = !e.agentId
    const stream = next(e)
    let firstAt = 0
    let chars = 0
    let ticker: { cancel: () => void } | null = null
    try {
      for await (const chunk of stream) {
        if (chunk.kind === 'text' || chunk.kind === 'thinking') chars += chunk.text.length
        else if (chunk.kind === 'input') chars += chunk.json.length
        if (!firstAt && chunk.kind !== 'engine') {
          firstAt = await $.clock.now()
          if (isMain) {
            const ratio = await read($, charsPerToken)
            // live estimate: the characters so far over the learned ratio
            ticker = $.clock.every(LIVE_MS, async () => {
              const seconds = ((await $.clock.now()) - firstAt) / 1000
              if (seconds < 0.5 || chars === 0) return
              await update($, speed, () => ({ tps: chars / ratio / seconds, isLive: true }))
              if (mode === 'status') await refresh($)
            })
          }
        }
        yield chunk
      }
    } finally {
      ticker?.cancel()
    }
    const r = await stream.result
    const u = r.usage
    if (u) {
      await update($, totals, t => ({
        input: t.input + u.input_tokens,
        output: t.output + u.output_tokens,
        cacheRead: t.cacheRead + u.cache_read_input_tokens,
        cacheWrite: t.cacheWrite + u.cache_creation_input_tokens,
      }))
    }
    if (isMain) {
      const seconds = firstAt ? ((await $.clock.now()) - firstAt) / 1000 : 0
      // too short a response gives a meaningless rate: keep the last one, settled
      if (u && u.output_tokens >= 20 && seconds >= 0.3) {
        await update($, speed, () => ({ tps: u.output_tokens / seconds, isLive: false }))
        if (chars > 0 && u.output_tokens >= 50) {
          const seen = chars / u.output_tokens
          await update($, charsPerToken, old => old * 0.6 + seen * 0.4)
        }
      } else {
        await update($, speed, old => (old ? { ...old, isLive: false } : old))
      }
    }
    if (mode === 'status') await refresh($)
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (mode !== 'band' || e.props.hasSurvey) return next(e)

    const s = await snapshot($)
    if (s.isEmpty) return next(e)
    const tpsLabel = tpsText(s.tps)

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      const bar = (w: Window) => {
        const n = Math.round(Math.min(1, w.pct / 100) * 8)
        return '█'.repeat(n) + '░'.repeat(8 - n)
      }
      const win = (w: Window | null, color: string) =>
        w && (
          <Text color={color}>
            {w.label} {bar(w)} <Text bold>{Math.round(w.pct)}%</Text>
            {w.left ? ` ↻ ${w.left}` : ''}
            {'  '}
          </Text>
        )
      return (
        <Box flexWrap="wrap">
          {win(s.five, 'green')}
          {win(s.seven, 'magenta')}
          <Text color="red">in {fmtTokens(s.input)}  </Text>
          <Text color="green">out {fmtTokens(s.output)}  </Text>
          <Text color="cyan">⚡ {tpsLabel}  </Text>
          <Text color="blue">cache {fmtTokens(s.cache)}  </Text>
          {s.usd !== undefined && <Text color="yellow">$ {s.usd.toFixed(2)}  </Text>}
          {s.ctx && <Text dimColor>ctx {Math.round(s.ctx.pct)}%</Text>}
        </Box>
      )
    }

    if (e.surface !== 'desktop' && e.surface !== 'vscode' && e.surface !== 'mobile') return next(e)
    const { Box, Svg } = $.ui.resolve(e)

    // Room for the row, in CSS px, estimated from the band's cell width
    const room = Math.max(320, e.props.bodyColumns * PX_PER_COL)

    const specs: Spec[] = [
      ...(s.five ? [windowPill(s.five, 'teal', 'gauge')] : []),
      ...(s.seven ? [windowPill(s.seven, 'violet', 'calendar')] : []),
      labelPill('in', 'red', fmtTokens(s.input), `Input tokens ${s.input} (incl. cache writes)`),
      labelPill('out', 'green', fmtTokens(s.output), `Output tokens ${s.output}`),
      simplePill(
        'bolt',
        'cyan',
        tpsLabel,
        !s.tps ? 'No response timed yet' : s.tps.isLive ? `Streaming at about ${tpsLabel}` : `Last response: ${tpsLabel}`,
        8,
      ),
      labelPill('cache', 'blue', fmtTokens(s.cache), `Cache read tokens ${s.cache}`),
      ...(s.usd !== undefined
        ? [simplePill('coin', 'gold', '$' + s.usd.toFixed(2), `Session cost $${s.usd.toFixed(2)}`)]
        : []),
      ...(s.ctx ? [windowPill(s.ctx, 'slate', 'doc')] : []),
    ]
    const row = band(specs, room)

    // No width: the SVG takes its own width, scaled down if the slot is narrower
    return (
      <Box flexDirection="row">
        <Svg key="band" source={row.svg} alt={row.alt} />
      </Box>
    )
  })
}
