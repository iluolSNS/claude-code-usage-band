export type Totals = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

// Output tokens per second: estimated while a response streams, exact once it ends
export type Speed = { tps: number; isLive: boolean }

// What the stats cards show: the window's pace as a chart, or what is left per model
export type StatsView = 'chart' | 'model'

// Which window's card shows when there is room for one only
export type StatsWindow = 'five_hour' | 'seven_day'

// The SVGs' colors: the system's, or forced light or dark
export type Theme = 'auto' | 'light' | 'dark'

declare module 'claude-code' {
  interface PluginState {
    'usage-band': {
      totals: Totals
      speed: Speed | null
      charsPerToken: number
      statsOpen: boolean
      statsView: StatsView
      statsWindow: StatsWindow
      theme: Theme
    }
  }
}
