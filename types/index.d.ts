export type Tone = 'success' | 'error' | 'warning' | 'suggestion' | 'muted'
export type Item = { text: string; sub?: string; icon?: string; link?: string; tone?: Tone; isWaiting?: boolean; isNotable?: boolean; choices?: string[]; answer?: string }
export type SectionTone = 'success' | 'error' | 'warning' | 'suggestion' | 'merged' | 'claude'
export type Section = { title: string; tone?: SectionTone; items: Item[]; isCollapsed?: boolean; parent?: string }
export type Glance = {
  goal?: string
  sections: Section[]
  updatedAt?: string
}

declare module 'claude-code' {
  interface PluginState {
    'session-glance': { glance: Shaped<Glance>; collapsed: Shaped<Record<string, boolean>>; usage: Shaped<{ calls: number; chars: number }> }
  }
}
