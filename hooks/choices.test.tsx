import { expect, test } from 'claude-code/testing'

const TOOL = 'mcp__session-glance__update'
const PANE = {
  plugin: 'session-glance',
  component: 'Pane',
  requestId: 'session-glance',
  props: {
    title: 'Glance',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const INPUT = {
  goal: 'Test',
  sections: [
    {
      title: 'Open',
      items: [
        { text: 'Commit files?', waiting: true, choices: ['Commit', 'Not yet'] },
        { text: 'No buttons here', choices: ['Ignored'] },
      ],
    },
  ],
}

test('a choice button sends the answer and marks the item', async ($, on) => {
  const sent: string[] = []
  on('tool.register', () => ({ value: {} }))
  on('command.register', () => ({ value: { command: 'glance' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: {} }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: TOOL, ...INPUT } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ key: 'choice:Open:Commit files?:Commit' })).toBeTruthy()
    expect(await ui.find({ key: 'choice:Open:Commit files?:Not yet' })).toBeTruthy()
    expect(await ui.find({ key: 'choice:Open:No buttons here:Ignored' })).toBeFalsy()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'choice:Open:Commit files?:Not yet' })
  expect(sent).toEqual(['Commit files? → Not yet'])
  expect((await ui.find({ type: 'Text', text: /↳ Not yet/ }))?.text).toBe('↳ Not yet')
  expect(await ui.find({ key: 'choice:Open:Commit files?:Commit' })).toBeFalsy()
  await ui.unmount()
})
