// Every text Claude reads from this mod, and nothing else: no schema, no logic,
// no imports. Changing how Claude fills the pane means changing this file.

// Description of the `update` tool: what belongs in the pane and when to call it.
export const GUIDE = [
  // What goes in, what stays out
  'Glance pane beside the chat: the current state of the session topic, not the path taken. Put in: results, findings, decisions with their reason, values, open points, next step. Leave out: your own work steps, attempts, changed files; procedures only when they are the topic. Running work the user waits on (sessions, jobs, agents) belongs in: section "Running", tone suggestion, one item per job; once its result is in, drop the item and place the result. Write in the language the user writes in, no Markdown.',
  // When to call
  'When to call: once at the end of a turn whenever the state changed, including when a waiting point appears or is resolved. Never send it as a message of its own: put it in the same message as wrap_up, as a parallel tool call placed before wrap_up. Also when starting work the user will wait on (agent, session, Codex or other background job), so it shows under "Running" at once: then in the same message as the call that starts it. Not for turns with nothing new or a session that is a single factual question.',
  // Links
  'Links: when an item is about something with its own URL (MR, PR, issue, commit, pipeline, website, docs, artifact, dashboard) and exactly that URL already appeared in this session (tool output, user message, your own reply), set link to it; the item text becomes clickable. Only URLs you have seen, never invent them or build them from IDs; no known URL, no link. Never put URLs into text or sub; one link per item (split items with several targets).',
  // Replace, don't append
  'Every call replaces everything: resend what stays (collapsed sections too). Always write fresh: replace stale items instead of appending, restructure sections when the topic moves; keep rejected options only when worth knowing. 2–6 sections, most important first, at most 5 items each.',
].join('\n')

// Descriptions of the `update` tool's input fields.
export const FIELDS = {
  goal: 'Topic, at most 8 words, no list, no colon',
  section: {
    title: '1–2 words, keep stable (the user\'s collapse state is keyed on it)',
    tone: 'only when the color means something: success done, error problem/risk/rejected, warning open, suggestion next step, merged variants; never claude',
    parent: 'Title of the parent section when this section is a subtopic; shown indented inside it',
    collapsed: 'true only for side matters (rejected, background, earlier done work): starts collapsed, only such sections can be toggled; never for open or current items',
  },
  item: {
    text: 'a few words',
    sub: 'at most ~60 characters: the reason, value or consequence, terse, no full sentence needed; only when it adds something text does not say',
    link: 'https URL of the external target the item is about, only if it already appeared in this session; makes text clickable',
    icon: '✓ done, ✗ rejected/problem, → next step, ○ open, ? question',
    tone: 'colors the icon; muted also dims the text',
    notable: 'true for surprises or high impact; at most 3 in the pane, none in collapsed sections',
    waiting: 'true when the user must decide, approve, answer or act; write text as a question or task ("Approve commit"); shown in the box at the top. Open points not involving the user stay without waiting',
    choices: 'Only with waiting: 1–4 answer buttons, 1–3 words each, recommended first ("Commit", "Not yet"; "Variant A", "Variant B"). A click sends "<text> → <choice>" as the user\'s next prompt. Omit when the answer is free text',
  },
}

// Result of the `update` tool.
export const UPDATED = 'Glance updated.'

// Reminder added after a wrap_up in a turn that has not updated the pane yet.
export const nudge = (tool: string) =>
  `This turn has not updated the glance pane yet. If the state changed, call ${tool} now, before your closing message; do not call wrap_up again. If nothing changed, just write your closing message. Next time send ${tool} in the same message as wrap_up.`

// Context added to the prompt when the user types just "glance".
export const fillRequest = (tool: string) =>
  `The user typed "glance": call ${tool} now with the complete current state of this session (status quo, results rather than process), then reply with one short sentence only.`

// The /glance command: its description in the command list and its answer.
export const COMMAND_DESCRIPTION = 'Open the session glance pane'
export const COMMAND_ANSWER = 'Glance pane opened.'
