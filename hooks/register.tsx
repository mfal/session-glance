import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Glance, Item, Section, SectionTone, Tone } from '../types'

const PLUGIN = 'session-glance'
const PANE = 'session-glance'
const TOOL = `mcp__${PLUGIN}__update`
const TITLE = 'Glance'
const EMPTY: Glance = { sections: [] }
const collapsed = atom({ plugin: 'session-glance', key: 'collapsed' } as const, {} as Record<string, boolean>, { shape: 'collapsed-1' })
const usage = atom({ plugin: 'session-glance', key: 'usage' } as const, { calls: 0, chars: 0 }, { shape: 'usage-1' })
const glance = atom({ plugin: 'session-glance', key: 'glance' } as const, EMPTY, { shape: 'glance-1' })

const TONES: Tone[] = ['success', 'error', 'warning', 'suggestion', 'muted']
const SECTION_TONES: SectionTone[] = ['success', 'error', 'warning', 'suggestion', 'merged', 'claude']
const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined)
const url = (v: unknown) => {
  const s = str(v)
  return s && /^https?:\/\/\S+$/.test(s) ? s : undefined
}

const parseSections = (v: unknown): Section[] =>
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

// A long goal with a colon splits into headline and subline.
const headline = (goal: string): [string, string | undefined] => {
  const i = goal.indexOf(':')
  return goal.length > 60 && i > 0 && i < 60 ? [goal.slice(0, i), goal.slice(i + 1).trim()] : [goal, undefined]
}

// Pane title and status line: time of the last update and estimated tokens spent on the tool.
const titleFor = (g: Glance, u: { calls: number; chars: number }) => {
  const parts = [TITLE]
  if (g.updatedAt) parts.push(g.updatedAt)
  if (u.calls > 0) {
    const tokens = Math.max(100, Math.round(u.chars / 3.5 / 100) * 100)
    parts.push(tokens < 1000 ? `~${tokens} tokens` : `${Number((tokens / 1000).toFixed(1))}k tokens`)
  }
  return parts.join(' · ')
}

const hasContent = (g: Glance) => Boolean(g.goal) || g.sections.length > 0

const GUIDE = [
  'Glance pane beside the chat: the current state of the session topic, not the path taken. Put in: results, findings, decisions with their reason, values, open points, next step. Leave out: your own work steps, attempts, changed files; procedures only when they are the topic. Running work the user waits on (sessions, jobs, agents) belongs in: section "Running", tone suggestion, one item per job; once its result is in, drop the item and place the result. Write in the language the user writes in, no Markdown.',
  'When to call: once at the end of a turn, before wrap_up, whenever the state changed, including when a waiting point appears or is resolved. Also right after starting work the user will wait on (agent, session, Codex or other background job), so it shows under "Running" at once. Not for turns with nothing new or a session that is a single factual question.',
  'Links: when an item is about something with its own URL (MR, PR, issue, commit, pipeline, website, docs, artifact, dashboard) and exactly that URL already appeared in this session (tool output, user message, your own reply), set link to it; the item text becomes clickable. Only URLs you have seen, never invent them or build them from IDs; no known URL, no link. Never put URLs into text or sub; one link per item (split items with several targets).',
  'Every call replaces everything: resend what stays (collapsed sections too). Always write fresh: replace stale items instead of appending, restructure sections when the topic moves; keep rejected options only when worth knowing. 2–6 sections, most important first, at most 5 items each.',
].join('\n')

// wrap_up without a glance update in the same turn is refused once, so the pane does not go stale.
const WRAP_UP = 'mcp__ccd_turn__wrap_up'
const NUDGE = `This turn has not updated the glance pane yet. If the state changed, call ${TOOL} first, then call wrap_up again; if nothing changed, just call wrap_up again.`

export const register: Register = on => {
  // Module variables: a reload resets them, which at worst skips the gate for one turn.
  let isUpdatedThisTurn = false
  let isNudgedThisTurn = false

  on('turn.start', async (_, e, next) => {
    if (e.agentId === undefined) {
      isUpdatedThisTurn = false
      isNudgedThisTurn = false
    }

    return next(e)
  })

  on('tool.call', { tool: WRAP_UP }, async (_, e, next) => {
    if (isUpdatedThisTurn || isNudgedThisTurn) return next(e)
    isNudgedThisTurn = true

    return { deny: NUDGE }
  })

  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'update',
      isDeferred: false,
      description: GUIDE,
      inputSchema: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'Topic, at most 8 words, no list, no colon' },
          sections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: '1–2 words, keep stable (the user\'s collapse state is keyed on it)' },
                tone: { type: 'string', enum: SECTION_TONES, description: 'only when the color means something: success done, error problem/risk/rejected, warning open, suggestion next step, merged variants; never claude' },
                parent: { type: 'string', description: 'Title of the parent section when this section is a subtopic; shown indented inside it' },
                collapsed: { type: 'boolean', description: 'true only for side matters (rejected, background, earlier done work): starts collapsed, only such sections can be toggled; never for open or current items' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      text: { type: 'string', description: 'a few words' },
                      sub: { type: 'string', description: 'one concrete sentence, about twice as long as text: reason, value or consequence; almost always set' },
                      link: { type: 'string', description: 'https URL of the external target the item is about, only if it already appeared in this session; makes text clickable' },
                      icon: { type: 'string', description: '✓ done, ✗ rejected/problem, → next step, ○ open, ? question' },
                      tone: { type: 'string', enum: TONES, description: 'colors the icon; muted also dims the text' },
                      notable: { type: 'boolean', description: 'true for surprises or high impact; at most 3 in the pane, none in collapsed sections' },
                      waiting: { type: 'boolean', description: 'true when the user must decide, approve, answer or act; write text as a question or task ("Approve commit"); shown in the box at the top. Open points not involving the user stay without waiting' },
                      choices: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'Only with waiting: 1–4 answer buttons, 1–3 words each, recommended first ("Commit", "Not yet"; "Variant A", "Variant B"). A click sends "<text> → <choice>" as the user\'s next prompt. Omit when the answer is free text' },
                    },
                    required: ['text'],
                  },
                },
              },
              required: ['title', 'items'],
            },
          },
        },
      },
    })
    await $.command.register({ name: 'glance', description: 'Open the session glance pane' })
    const saved = await read($, glance)
    if (hasContent(saved)) void $.ui.open({ id: PANE, title: titleFor(saved, await read($, usage)) })

    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    isUpdatedThisTurn = true
    const input = e as unknown as Record<string, unknown>
    const sent = JSON.stringify({ goal: input.goal, sections: input.sections }).length
    await update($, usage, u => ({ calls: u.calls + 1, chars: u.chars + sent }))
    const next: Glance = {
      goal: str(input.goal),
      sections: parseSections(input.sections),
      updatedAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    }
    await update($, glance, () => next)
    const title = titleFor(next, await read($, usage))
    $.ui.status(title)
    if (hasContent(next)) await $.ui.open({ id: PANE, title })

    return { result: 'Glance updated.' }
  })

  // Typing just "glance" asks Claude to fill the pane with the full current state.
  on('prompt.submit', async ($, e, next) => {
    const word = e.text.trim().toLowerCase().replace(/[.!?]+$/, '')
    if (word !== 'glance') return next(e)
    void $.ui.open({ id: PANE, title: titleFor(await read($, glance), await read($, usage)) })

    return next({
      ...e,
      context: [
        ...(e.context ?? []),
        `The user typed "glance": call ${TOOL} now with the complete current state of this session (status quo, results rather than process), then reply with one short sentence only.`,
      ],
    })
  })

  on('command.run', { command: 'glance' }, async $ => {
    await $.ui.open({ id: PANE, title: titleFor(await read($, glance), await read($, usage)) })

    return { text: 'Glance pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const label = (item: Item) => (item.link ? <Link href={item.link}>{item.text}</Link> : item.text)
    const g = await read($, glance)
    const closed = await read($, collapsed)

    if (!hasContent(g)) return <Text dimColor>Nothing yet. Type "glance" to fill it.</Text>

    // ↩ puts the item as a quote into the chat draft at the cursor, for a follow-up question.
    const ask = (section: string, item: Item) => async () => {
      const { text, cursor } = await $.prompt.read()
      const lead = cursor > 0 && text[cursor - 1] !== '\n' ? '\n' : ''
      const quote = `> ${section} · ${item.text}${item.sub ? ` — ${item.sub}` : ''}\n\n`
      const { isFilled } = await $.prompt.fill({ text: lead + quote, mode: 'insert' })
      if (!isFilled) $.ui.toast('Chat input not available right now.')
    }
    const askButton = (section: string, item: Item) => (
      <Box flexShrink={0}>
        <Button key={`ask:${section}:${item.text}`} label="↩" plain dimColor onPress={ask(section, item)} />
      </Box>
    )

    const row = (section: string) => (item: Item) => {
      const color = item.tone && item.tone !== 'muted' ? item.tone : undefined
      const isMuted = item.tone === 'muted'

      return (
        <Box flexDirection="row" gap={1}>
          <Box width={2} flexShrink={0}>
            <Text color={color} dimColor={!color} weight="bold">{item.icon ?? '·'}</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            <Text dimColor={isMuted && !item.isNotable} weight={item.isNotable ? 'semibold' : undefined}>
              {label(item)}
              {item.isNotable && <Text color="claude" weight="bold">  ★</Text>}
            </Text>
            {item.sub && <Text size="footnote" dimColor={!item.isNotable}>{item.sub}</Text>}
          </Box>
          {askButton(section, item)}
        </Box>
      )
    }

    // A choice button answers the waiting item: it sends the answer as the next prompt and marks the item answered.
    const choose = (section: string, item: Item, choice: string) => async () => {
      await update($, glance, g => ({
        ...g,
        sections: g.sections.map(s =>
          s.title !== section ? s : { ...s, items: s.items.map(i => (i.text === item.text && i.isWaiting ? { ...i, answer: choice } : i)) },
        ),
      }))
      void $.prompt.submit({ text: `${item.text} → ${choice}` })
    }
    const choiceRow = (section: string, item: Item) =>
      item.answer ? (
        <Text size="footnote" dimColor>↳ {item.answer}</Text>
      ) : (
        item.choices && (
          <Box flexDirection="row" gap={1} flexWrap="wrap" marginTop={1}>
            {item.choices.map((c, n) => (
              <Button key={`choice:${section}:${item.text}:${c}`} label={c} variant={n === 0 ? 'primary' : 'secondary'} onPress={choose(section, item, c)} />
            ))}
          </Box>
        )
      )

    const toggle = (title: string, isOpen: boolean) => () => update($, collapsed, map => ({ ...map, [title]: isOpen }))

    const waiting = g.sections.flatMap(s => s.items.filter(i => i.isWaiting).map(item => ({ section: s.title, item })))
    const all = g.sections.map(s => ({ ...s, items: s.items.filter(i => !i.isWaiting) }))
    const titles = new Set(all.map(s => s.title))
    const childrenOf = (title?: string) =>
      all.filter(s => (title === undefined ? !s.parent || !titles.has(s.parent) || s.parent === s.title : s.parent === title && s.title !== title))
    const hasContentDeep = (s: Section, depth = 0): boolean =>
      s.items.length > 0 || (depth < 3 && childrenOf(s.title).some(c => hasContentDeep(c, depth + 1)))

    const renderSection = (s: Section, depth: number): ReturnType<typeof h> => {
      const override = closed[s.title]
      const isOpen = !s.isCollapsed || override === false
      const kids = depth < 2 ? childrenOf(s.title).filter(c => hasContentDeep(c)) : []

      return (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={s.tone ?? 'subtle'}
          borderDimColor={!s.tone}
          paddingX={1}
        >
          {s.isCollapsed ? (
            <Button key={`sec:${s.title}`} plain dimColor={!isOpen} onPress={toggle(s.title, isOpen)}>
              <Text size="footnote" weight="semibold" color={s.tone}>{isOpen ? '▾' : '▸'} {s.title.toUpperCase()}</Text>
            </Button>
          ) : (
            <Text size="footnote" weight="semibold" color={s.tone}>{s.title.toUpperCase()}</Text>
          )}
          {isOpen && s.items.length > 0 && (
            <Box flexDirection="column" gap={1} marginTop={1}>
              {s.items.map(row(s.title))}
            </Box>
          )}
          {isOpen && kids.length > 0 && (
            <Box flexDirection="column" gap={1} marginTop={1} marginLeft={1}>
              {kids.map(c => renderSection(c, depth + 1))}
            </Box>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column" paddingX={1}>
          {g.goal && <Text size="title" weight="bold">{headline(g.goal)[0]}</Text>}
          {g.goal && headline(g.goal)[1] && <Text size="footnote" dimColor>{headline(g.goal)[1]}</Text>}
        </Box>
        {waiting.length > 0 && (
          <Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1} gap={1}>
            <Text size="footnote" weight="semibold" color="warning">
              ● WAITING ON YOU
            </Text>
            {waiting.map(({ section, item }) => (
              <Box key={`wait:${section}:${item.text}`} flexDirection="row" gap={1}>
                <Box width={2} flexShrink={0}>
                  <Text color="warning" weight="bold">{item.icon ?? '?'}</Text>
                </Box>
                <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                  <Text weight="semibold">
                    {label(item)}
                    {item.isNotable && <Text color="claude" weight="bold">  ★</Text>}
                  </Text>
                  {item.sub && <Text size="footnote" dimColor>{item.sub}</Text>}
                  {choiceRow(section, item)}
                </Box>
                {askButton(section, item)}
              </Box>
            ))}
          </Box>
        )}
        {childrenOf(undefined).filter(s => hasContentDeep(s)).map(s => renderSection(s, 0))}
      </Box>
    )
  })
}
