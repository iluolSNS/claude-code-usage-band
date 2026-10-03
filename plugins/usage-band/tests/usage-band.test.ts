import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { addSample, addTokens, addUsd, windowStats } from '../hooks/stats'
import type { Row } from '../hooks/stats'
import { tokensFor } from '../hooks/stats'

// Within half a unit of the given decimal place, as toBeCloseTo would be
function near(got: number, want: number, digits: number): void {
  const ok = Math.abs(got - want) < 0.5 * 10 ** -digits
  if (!ok) throw new Error(`expected ${got} to be close to ${want}`)
}

const MIN = 60_000
const HOUR = 3600_000
const DAY = 86400_000
const NOW = Date.UTC(2026, 9, 3, 12, 0, 0)

// A window's dollars spread evenly over its minutes so far
function spread(from: number, to: number, usd: number, tokens: number, code = 'o'): Row[] {
  const rows: Row[] = []
  const n = Math.round((to - from) / MIN)
  for (let i = 0; i < n; i++) {
    const t = tokens / n
    rows.push([Math.floor(from / MIN) + i, code, t * 0.005, t * 0.03, t * 0.925, t * 0.04, usd / n])
  }
  return rows
}

describe('window stats', () => {
  test('a 5h window on pace to finish under the limit', () => {
    const resetsAt = NOW + 73 * MIN
    const start = resetsAt - 5 * HOUR
    const w = windowStats({
      kind: 'five_hour',
      pct: 51,
      resetsAt,
      now: NOW,
      rows: spread(start, NOW, 90.19, 269.5e6),
      since: start - DAY,
    })
    expect(w.isPartial).toBe(false)
    near(w.value!, 90.19 / 0.51, 1)
    expect(w.status.kind).toBe('pace')
    if (w.status.kind === 'pace') near(w.status.projected, 51 + (51 / 227) * 73, 1)
    near(w.avgRate!, (90.19 / 227) * 60, 1)
    near(w.allowedRate!, ((90.19 / 0.51) * 0.49 * 60) / 73, 1)
    near(w.used.opus, 269.5e6, -3)
    expect(w.ref).toBe('opus')
    // the curve ends at now, at the reading
    expect(w.curve[w.curve.length - 1]).toEqual([w.frac, 51])
  })

  test('a 7d window heading past the limit before it resets', () => {
    const resetsAt = NOW + 6 * DAY + 7 * HOUR
    const start = resetsAt - 7 * DAY
    const w = windowStats({
      kind: 'seven_day',
      pct: 12,
      resetsAt,
      now: NOW,
      rows: spread(start, NOW, 151, 464.1e6),
      since: start - DAY,
    })
    expect(w.status.kind).toBe('hit')
    if (w.status.kind === 'hit') {
      near(w.status.hitIn, (88 / 12) * 17 * HOUR, -4)
      near(w.status.beforeReset, w.remaining - w.status.hitIn, 0)
    }
    near(w.allowedRate!, ((151 / 0.12) * 0.88) / ((6 * DAY + 7 * HOUR) / DAY), 0)
  })

  test('a window the ledger joined late counts from its first reading', () => {
    const resetsAt = NOW + 2 * HOUR
    const start = resetsAt - 5 * HOUR
    const since = start + HOUR
    const firstSec = Math.round((since + 5 * MIN) / 1000)
    const w = windowStats({
      kind: 'five_hour',
      pct: 40,
      resetsAt,
      now: NOW,
      rows: spread(since + 5 * MIN, NOW, 30, 1e8),
      since,
      samples: { resetsAt, pts: [[firstSec, 20]] },
    })
    expect(w.isPartial).toBe(true)
    // $30 moved it 20 points: the window is worth $150
    near(w.value!, 150, 0)
    expect(w.untracked).not.toBeNull()
  })

  test('no value until the window has moved', () => {
    const resetsAt = NOW + 4 * HOUR
    const w = windowStats({ kind: 'five_hour', pct: 0, resetsAt, now: NOW, rows: [], since: 0 })
    expect(w.value).toBeNull()
    expect(w.status.kind).toBe('early')
  })

  test('tokens left per model follow each model’s price', () => {
    const mix = { input: 1, output: 0, cacheRead: 0, cacheWrite: 0 }
    near(tokensFor(10, 'opus', mix), 2.5e6, 0)
    near(tokensFor(10, 'haiku', mix), 10e6, 0)
  })
})

describe('ledger and samples', () => {
  test('requests in one minute and family share a row; dollars follow them', () => {
    const rows: Row[] = []
    const u = { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 }
    const a = addTokens(rows, NOW, 'o', u)
    addTokens(rows, NOW + 1000, 's', u)
    addTokens(rows, NOW + 2000, 'o', u)
    addUsd(rows, NOW + 2000, 0.5, a)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual([Math.floor(NOW / MIN), 'o', 2, 4, 6, 8, 0.5])
  })

  test('a new window keeps the last one as the one to compare with', () => {
    const r1 = NOW + HOUR
    let log = addSample(undefined, r1, NOW, 10, 10 * MIN)!
    log = addSample(log, r1, NOW + 20 * MIN, 30, 10 * MIN)!
    // an unchanged reading soon after adds nothing
    expect(addSample(log, r1, NOW + 21 * MIN, 30, 10 * MIN)).toBeNull()
    const next = addSample(log, r1 + 5 * HOUR, NOW + 2 * HOUR, 2, 10 * MIN)!
    expect(next.pts).toHaveLength(1)
    expect(next.prev?.pts).toHaveLength(2)
    // a lagging session's reading of the old window is ignored
    expect(addSample(next, r1, NOW + 2 * HOUR + MIN, 31, 10 * MIN)).toBeNull()
  })
})

// ---------- the band, through the engine ----------

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 40,
  bodyColumns: 200,
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}

function world(on: On) {
  mock.clock(on, { now: NOW })
  const fiveReset = NOW + 73 * MIN
  const sevenReset = NOW + 6 * DAY + 7 * HOUR
  mock.store(on, {
    since: NOW - 8 * DAY,
    // another session's requests in both windows
    'ledger:other': { rows: spread(fiveReset - 5 * HOUR, NOW, 90.19, 269.5e6) },
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.id', () => ({ value: 'me' }))
  on('session.usage', () => ({ value: {
    startedAt: NOW - HOUR,
    context: { window: 200_000, tokens: 50_000 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 51, resetsAt: new Date(fiveReset).toISOString() },
      { kind: 'seven_day', percentUsed: 12, resetsAt: new Date(sevenReset).toISOString() },
    ],
    cost: { usd: 51.46 },
  } }))
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: the stats open from the band and switch views`, async ($, on) => {
    world(on)
    await $.session.start({ cwd: '/tmp' } as never)
    const ui = await $.ui.mount({ plugin: 'usage-band', surface, component: 'AbovePrompt', props: PROPS })
    expect(await ui.find({ key: 'view-chart' })).toBeUndefined()

    await ui.press({ key: 'stats' })
    expect(await ui.find({ key: 'view-chart' })).toBeDefined()
    if (surface === 'desktop') {
      const svg = await ui.find({ type: 'Svg' })
      const source = String(svg?.props.source)
      expect(source).toContain('5h window ≈ $177 at API prices')
      expect(source).toContain('On pace to finish at')
      expect(source).toContain('Spend up to')
    } else {
      expect(await ui.find({ text: /5h window ≈ \$177 at API prices/ })).toBeDefined()
    }

    await ui.press({ key: 'view-model' })
    if (surface === 'desktop') {
      const source = String((await ui.find({ type: 'Svg' }))?.props.source)
      expect(source).toContain('tokens left')
      expect(source).toContain('Fable 5.1')
      expect(source).toContain('spent at each model’s price')
    } else {
      expect(await ui.find({ text: /Tokens left if you use only/ })).toBeDefined()
    }

    await ui.press({ key: 'stats' })
    expect(await ui.find({ key: 'view-chart' })).toBeUndefined()
  })
}

test('desktop: both cards side by side, however narrow the band', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/tmp' } as never)
  for (const bodyColumns of [80, 200]) {
    const ui = await $.ui.mount({
      plugin: 'usage-band',
      surface: 'desktop',
      component: 'AbovePrompt',
      props: { ...PROPS, bodyColumns },
    })
    if (!(await ui.find({ key: 'view-chart' }))) await ui.press({ key: 'stats' })
    const source = String((await ui.find({ type: 'Svg' }))?.props.source)
    expect(source).toContain('5h window')
    expect(source).toContain('7d window')
    await ui.unmount()
  }
})

test('desktop: a window the ledger has not measured says what it waits for', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on, { since: NOW })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.id', () => ({ value: 'me' }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: { window: 200_000 },
      rateLimits: [{ kind: 'seven_day', percentUsed: 61, resetsAt: new Date(NOW + 3 * DAY).toISOString() }],
      cost: { usd: 0 },
    },
  }))
  await $.session.start({ cwd: '/tmp' } as never)
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  await ui.press({ key: 'stats' })
  await ui.press({ key: 'view-model' })
  const source = String((await ui.find({ type: 'Svg' }))?.props.source)
  expect(source).toContain('needs about 1% more use')
  expect(source).not.toContain('—')
})
