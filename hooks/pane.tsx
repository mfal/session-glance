// The pane: draws the glance and handles its buttons (quote into the draft,
// answer a waiting item, toggle a collapsed section).

import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Item, Section } from '../types'
import { EMPTY, PANE, hasContent, headline } from './glance'

const glance = atom({ plugin: 'session-glance', key: 'glance' } as const, EMPTY, { shape: 'glance-1' })
const collapsed = atom({ plugin: 'session-glance', key: 'collapsed' } as const, {} as Record<string, boolean>, { shape: 'collapsed-1' })

export const registerPane = (on: Parameters<Register>[0]) => {
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
