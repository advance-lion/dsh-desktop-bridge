import assert from 'node:assert/strict'
import test from 'node:test'

import { explicitDesktopRequest, MARKER_HINT } from '../lib/trigger.js'

function agentWith(messages) {
  return {
    id: 'session-1',
    session: {
      header: { agentPreset: 'standard' },
      events: messages.map((message, index) => ({
        type: 'user/message',
        seq: index,
        time: index,
        data: {
          source: message.source ?? { kind: 'user' },
          content: [{ type: 'text', text: message.text }],
        },
      })),
    },
  }
}

test('recognises the documented markers', () => {
  for (const text of ['@computer 打开计算器', '@desktop 帮我点一下', '@GUI take over', '@电脑 看一下', '@桌面 帮我操作', 'please /desktop this']) {
    assert.ok(explicitDesktopRequest(agentWith([{ text }])), `should match: ${text}`)
  }
})

test('a file reference is not a desktop request', () => {
  const agent = agentWith([{ text: '看看 @docs/PRD.md 里的验收用例' }])
  assert.equal(explicitDesktopRequest(agent), undefined)
})

test('only the newest user message counts', () => {
  const agent = agentWith([{ text: '@computer 打开计算器' }, { text: '算了，直接告诉我 7×8 等于几' }])
  assert.equal(explicitDesktopRequest(agent), undefined)
})

test('injected context is ignored even when it repeats the marker', () => {
  const agent = agentWith([{ text: '@computer 打开计算器', source: { kind: 'system-prompt' } }])
  assert.equal(explicitDesktopRequest(agent), undefined)
})

test('an unreadable transcript reads as not explicit', () => {
  assert.equal(explicitDesktopRequest(undefined), undefined)
  assert.equal(explicitDesktopRequest({}), undefined)
  assert.equal(explicitDesktopRequest({ session: { events: 'nope' } }), undefined)
  assert.equal(explicitDesktopRequest({ session: { events: [null, { type: 'turn/end' }] } }), undefined)
})

test('an empty user message reads as not explicit', () => {
  assert.equal(explicitDesktopRequest(agentWith([{ text: '' }])), undefined)
})

test('the marker hint names the syntax', () => {
  assert.match(MARKER_HINT, /@computer/)
})
