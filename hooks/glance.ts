// The glance itself: names, session state, parsing of the tool input and the
// small helpers that derive what the pane shows from it. No prompt text, no UI.

import type { Glance, Item, Section, SectionTone, Tone } from '../types'
import { FIELDS } from './prompts'

// --- Names -----------------------------------------------------------------

const PLUGIN = 'session-glance'
export const PANE = 'session-glance'
export const TOOL = `mcp__${PLUGIN}__update`
export const WRAP_UP = 'mcp__ccd_turn__wrap_up'
const TITLE = 'Glance'

// --- Session state ---------------------------------------------------------
// The atoms are declared in the file that reads or writes them (register.tsx,
// pane.tsx): the engine only accepts an atom that is a const of the same file.

export const EMPTY: Glance = { sections: [] }

// --- Tool input ------------------------------------------------------------
// Shape of the `update` tool's input; the field descriptions live in ./prompts.

export const TONES: Tone[] = ['success', 'error', 'warning', 'suggestion', 'muted']
export const SECTION_TONES: SectionTone[] = ['success', 'error', 'warning', 'suggestion', 'merged', 'claude']

export const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    goal: { type: 'string', description: FIELDS.goal },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: FIELDS.section.title },
          tone: { type: 'string', enum: SECTION_TONES, description: FIELDS.section.tone },
          parent: { type: 'string', description: FIELDS.section.parent },
          collapsed: { type: 'boolean', description: FIELDS.section.collapsed },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: FIELDS.item.text },
                sub: { type: 'string', description: FIELDS.item.sub },
                link: { type: 'string', description: FIELDS.item.link },
                icon: { type: 'string', description: FIELDS.item.icon },
                tone: { type: 'string', enum: TONES, description: FIELDS.item.tone },
                notable: { type: 'boolean', description: FIELDS.item.notable },
                waiting: { type: 'boolean', description: FIELDS.item.waiting },
                choices: { type: 'array', items: { type: 'string' }, maxItems: 4, description: FIELDS.item.choices },
              },
              required: ['text'],
            },
          },
        },
        required: ['title', 'items'],
      },
    },
  },
}

// --- Parsing the tool input ------------------------------------------------

export const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined)
const url = (v: unknown) => {
  const s = str(v)
  return s && /^https?:\/\/\S+$/.test(s) ? s : undefined
}

export const parseSections = (v: unknown): Section[] =>
  (Array.isArray(v) ? v : []).flatMap(raw => {
    const s = raw as Record<string, unknown>
    const title = str(s?.title)
    if (!title) return []
    const items = (Array.isArray(s.items) ? s.items : []).flatMap(rawItem => {
      const i = rawItem as Record<string, unknown>
      const text = str(i?.text)
      if (!text) return []
      const tone = TONES.find(t => t === i.tone)
      const isWaiting = i.waiting === true
      const choices = isWaiting && Array.isArray(i.choices) ? i.choices.flatMap(c => str(c) ?? []).slice(0, 4) : []
      const item: Item = { text, sub: str(i.sub), icon: str(i.icon), link: url(i.link), tone, isWaiting, isNotable: i.notable === true, choices: choices.length > 0 ? choices : undefined }
      return [item]
    })
    const tone = SECTION_TONES.find(t => t === s.tone)
    return [{ title, tone, items, isCollapsed: s.collapsed === true, parent: str(s.parent) }]
  })

// --- Derived values --------------------------------------------------------

export const hasContent = (g: Glance) => Boolean(g.goal) || g.sections.length > 0

// A long goal with a colon splits into headline and subline.
export const headline = (goal: string): [string, string | undefined] => {
  const i = goal.indexOf(':')
  return goal.length > 60 && i > 0 && i < 60 ? [goal.slice(0, i), goal.slice(i + 1).trim()] : [goal, undefined]
}

// Pane title and status line: time of the last update and estimated tokens spent on the tool.
export const titleFor = (g: Glance, u: { calls: number; chars: number }) => {
  const parts = [TITLE]
  if (g.updatedAt) parts.push(g.updatedAt)
  if (u.calls > 0) {
    const tokens = Math.max(100, Math.round(u.chars / 3.5 / 100) * 100)
    parts.push(tokens < 1000 ? `~${tokens} tokens` : `${Number((tokens / 1000).toFixed(1))}k tokens`)
  }
  return parts.join(' · ')
}
