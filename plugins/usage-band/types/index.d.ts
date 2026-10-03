export type Totals = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

// Output tokens per second: estimated while a response streams, exact once it ends
export type Speed = { tps: number; isLive: boolean }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { totals: Totals; speed: Speed | null; charsPerToken: number }
  }
}
