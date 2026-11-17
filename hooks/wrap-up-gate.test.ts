import { expect, test } from 'claude-code/testing'

const TOOL = 'mcp__session-glance__update'
const WRAP_UP = 'mcp__ccd_turn__wrap_up'

const start = async ($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1]) => {
  on('tool.register', () => ({ value: {} }))
  on('command.register', () => ({ value: { command: 'glance' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: {} }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', () => ({ turnId: 't' }))
  on('tool.call', () => ({ result: 'ok' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
}

test('wrap_up without a glance update passes with a reminder once per turn', async ($, on) => {
  await start($, on)
  await $.turn.start({ prompt: 'do it' } as never)

  const first = await $.tool.call({ tool: WRAP_UP, recap: 'r' } as never)
  expect(first.deny).toBeUndefined()
  expect(first.result).toBe('ok')
  expect(first.context?.join('\n')).toMatch(/glance pane/)
  const second = await $.tool.call({ tool: WRAP_UP, recap: 'r' } as never)
  expect(second.deny).toBeUndefined()
  expect(second.context ?? []).toEqual([])

  await $.turn.start({ prompt: 'next' } as never)
  expect((await $.tool.call({ tool: WRAP_UP, recap: 'r' } as never)).context?.join('\n')).toMatch(/glance pane/)
})

test('wrap_up after a glance update passes', async ($, on) => {
  await start($, on)
  await $.turn.start({ prompt: 'do it' } as never)
  await $.tool.call({ tool: TOOL, goal: 'Test', sections: [] } as never)

  const answered = await $.tool.call({ tool: WRAP_UP, recap: 'r' } as never)
  expect(answered.deny).toBeUndefined()
  expect(answered.context ?? []).toEqual([])
})

test('a subagent turn does not reset the gate', async ($, on) => {
  await start($, on)
  await $.turn.start({ prompt: 'do it' } as never)
  await $.tool.call({ tool: TOOL, goal: 'Test', sections: [] } as never)
  await $.turn.start({ prompt: 'sub', agentId: 'a1' } as never)

  expect((await $.tool.call({ tool: WRAP_UP, recap: 'r' } as never)).context ?? []).toEqual([])
})
