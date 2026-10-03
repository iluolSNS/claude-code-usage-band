// API list prices, US dollars per million tokens. Cache writes are the
// 5-minute rate (1.25x input).

export type Family = 'fable' | 'opus' | 'sonnet' | 'haiku'

export const FAMILIES: readonly Family[] = ['fable', 'opus', 'sonnet', 'haiku']

export const MODEL_NAME: Record<Family, string> = {
  fable: 'Fable 5.1',
  opus: 'Opus 5.5',
  sonnet: 'Sonnet 5.5',
  haiku: 'Haiku 4.5',
}

// Short names for the "≈ 65.5M Opus" equivalents
export const MODEL_SHORT: Record<Family, string> = {
  fable: 'Fable',
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
}

export type Price = { input: number; output: number; cacheRead: number; cacheWrite: number }

export const PRICE: Record<Family, Price> = {
  fable: { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  opus: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  sonnet: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  haiku: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
}

// One letter per family in the ledger; `x` for a model we cannot place
export type Code = 'f' | 'o' | 's' | 'h' | 'x'

export const CODE: Record<Family, Code> = { fable: 'f', opus: 'o', sonnet: 's', haiku: 'h' }

export function familyOfCode(c: string): Family | null {
  return c === 'f' ? 'fable' : c === 'o' ? 'opus' : c === 's' ? 'sonnet' : c === 'h' ? 'haiku' : null
}

export function codeOf(model: string): Code {
  const m = model.toLowerCase()
  if (m.includes('fable') || m.includes('mythos')) return 'f'
  if (m.includes('opus')) return 'o'
  if (m.includes('sonnet')) return 's'
  if (m.includes('haiku')) return 'h'
  return 'x'
}

export type Mix = { input: number; output: number; cacheRead: number; cacheWrite: number }

// When nothing is tracked yet: roughly what a Claude Code session sends
export const DEFAULT_MIX: Mix = { input: 0.005, output: 0.03, cacheRead: 0.925, cacheWrite: 0.04 }

// Dollars per token for a family, at a given split of token kinds
export function usdPerToken(f: Family, mix: Mix): number {
  const total = mix.input + mix.output + mix.cacheRead + mix.cacheWrite
  const m = total > 0 ? mix : DEFAULT_MIX
  const t = total > 0 ? total : 1
  const p = PRICE[f]
  return (m.input * p.input + m.output * p.output + m.cacheRead * p.cacheRead + m.cacheWrite * p.cacheWrite) / t / 1e6
}

// What a request cost at list price, for hosts that keep no cost ledger
export function listCost(code: string, u: Mix): number {
  const p = PRICE[familyOfCode(code) ?? 'opus']
  return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) / 1e6
}
