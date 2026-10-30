/**
 * Explicit desktop invocation, the way Codex's `@Computer` works.
 *
 * The model's own "this needs a GUI" judgement is the weak link: it can be lazy in one
 * direction or over-eager in the other. A marker in the *user's* message is the one signal
 * that comes from the person rather than from the model, so the bridge reads the session
 * log itself instead of trusting a tool argument.
 *
 * The marker set is deliberately narrow: `@` alone is DSH's file-reference syntax, so only
 * names that cannot be mistaken for a path are accepted.
 */

const MARKERS = [
  /@(computer|desktop|gui|screen)\b/i,
  /@(电脑|桌面|屏幕)/,
  /(?:^|\s)\/(desktop|computer)\b/i,
]

/** Concatenated text of one message's content blocks. */
function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

/**
 * Whether the newest user message asks for the desktop explicitly.
 * Fail-closed: any unreadable shape reads as "not explicit", so a broken log can never
 * widen the gate.
 * @param {unknown} agent live Agent, whose `session.events` holds the transcript.
 * @returns {{ text: string } | undefined} the matched message text, or undefined.
 */
export function explicitDesktopRequest(agent) {
  try {
    const events = agent?.session?.events
    if (!Array.isArray(events)) return undefined
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]
      if (event?.type !== 'user/message') continue
      const message = event.data
      const kind = message?.source?.kind
      // Injected context also lands as user-role messages; only a real typed turn counts.
      if (kind !== undefined && kind !== 'user') continue
      const text = textOf(message?.content)
      if (text === '') return undefined
      return MARKERS.some((pattern) => pattern.test(text)) ? { text: text.slice(0, 400) } : undefined
    }
    return undefined
  } catch {
    return undefined
  }
}

/** The marker syntax, for prompts and error messages. */
export const MARKER_HINT = '@computer (or @desktop)'
