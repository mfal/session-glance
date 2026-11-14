// Entry point: wires the hooks. The prompt text lives in ./prompts, state and
// parsing in ./glance, the drawing in ./pane.

import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Glance } from '../types'
import { EMPTY, INPUT_SCHEMA, PANE, TOOL, WRAP_UP, hasContent, parseSections, str, titleFor } from './glance'
import { registerPane } from './pane'
import { COMMAND_ANSWER, COMMAND_DESCRIPTION, GUIDE, UPDATED, fillRequest, nudge } from './prompts'

const glance = atom({ plugin: 'session-glance', key: 'glance' } as const, EMPTY, { shape: 'glance-1' })
const usage = atom({ plugin: 'session-glance', key: 'usage' } as const, { calls: 0, chars: 0 }, { shape: 'usage-1' })

export const register: Register = on => {
  // --- wrap_up gate ---------------------------------------------------------
  // wrap_up without a glance update in the same turn is refused once, so the pane does not go stale.
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

    return { deny: nudge(TOOL) }
  })

  // --- Tool and command -----------------------------------------------------
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'update',
      isDeferred: false,
      description: GUIDE,
      inputSchema: INPUT_SCHEMA,
    })
    await $.command.register({ name: 'glance', description: COMMAND_DESCRIPTION })
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

    return { result: UPDATED }
  })

  // --- Opening the pane -----------------------------------------------------
  // Typing just "glance" asks Claude to fill the pane with the full current state.
  on('prompt.submit', async ($, e, next) => {
    const word = e.text.trim().toLowerCase().replace(/[.!?]+$/, '')
    if (word !== 'glance') return next(e)
    void $.ui.open({ id: PANE, title: titleFor(await read($, glance), await read($, usage)) })

    return next({
      ...e,
      context: [
        ...(e.context ?? []),
        fillRequest(TOOL),
      ],
    })
  })

  on('command.run', { command: 'glance' }, async $ => {
    await $.ui.open({ id: PANE, title: titleFor(await read($, glance), await read($, usage)) })

    return { text: COMMAND_ANSWER }
  })

  // --- Pane -----------------------------------------------------------------
  registerPane(on)
}
