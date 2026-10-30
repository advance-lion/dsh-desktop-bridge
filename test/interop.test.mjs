import assert from 'node:assert/strict'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

process.env.DSH_DESKTOP_BRIDGE_CHANNEL = `dsh-desktop-bridge.test.${process.pid}`
const { apply } = await import('../lib/index.js')

/**
 * The real dsh-orb build the running host loads. Using the shipped module (not a copy)
 * proves our writer and its reader share one record.
 */
const ORB_SCREEN_OWNER = 'C:/Users/ORiSUNG/.dsh/profiles/desktop/node_modules/dsh-orb/dist/computer-use/screen-owner-D3XnT8Ff.js'

const SCHEDULER_KEY = Symbol.for('dsh-desktop-bridge.scheduler')
const OWNER_KEY = Symbol.for('dsh-orb.screen-owner')

function reset() {
  delete globalThis[SCHEDULER_KEY]
  delete globalThis[OWNER_KEY]
}

function makeContext() {
  const tools = new Map()
  const activations = []
  const ctx = {
    tools: {
      register(definition) {
        tools.set(definition.name, definition)
        return () => tools.delete(definition.name)
      },
    },
    subagents: {
      async startActivation() {
        let settle
        const result = new Promise((resolve) => {
          settle = resolve
        })
        const childId = `child-${activations.length + 1}`
        const activation = { childId, result, dispose: async () => {} }
        activations.push({ activation, settle })
        return activation
      },
      interrupt() {},
    },
    on: () => () => {},
    effect: (fn) => fn(),
    get: (service) =>
      service === 'agentPresets' ? { list: async () => [{ id: 'standard' }, { id: 'computer-use' }] } : undefined,
  }
  return { ctx, tools, activations }
}

const agent = (id, preset) => ({ id, session: { header: { agentPreset: preset } } })
const exec = (a) => ({ agent: a, signal: new AbortController().signal, callId: 'c' })

test('a floating-ball conversation loses the desktop while a bridge worker holds it', async () => {
  reset()
  const orb = await import(pathToFileURL(ORB_SCREEN_OWNER).href)
  const { desktopToolDenial, setScreenOwner } = {
    desktopToolDenial: orb.r,
    setScreenOwner: orb.c,
  }

  // Baseline: a ball conversation owns the screen and may click.
  setScreenOwner('ball-session-1')
  assert.equal(desktopToolDenial('ball-session-1', 'click', 'computer-use'), undefined)
  // A background ball conversation is already refused by orb itself.
  assert.equal(typeof desktopToolDenial('ball-background', 'click', 'computer-use'), 'string')

  // Our bridge takes the screen for a worker.
  const { ctx, tools } = makeContext()
  apply(ctx, {})
  await tools.get('computer_task').execute(
    { goal: 'click Export', stop_condition: 'the dialog appears', justification: 'no_structured_interface' },
    exec(agent('s1', 'standard')),
  )

  assert.equal(globalThis[OWNER_KEY].ownerId, 'child-1', 'the bridge must publish its worker as the screen owner')
  assert.equal(
    typeof desktopToolDenial('ball-session-1', 'click', 'computer-use'),
    'string',
    'the ball conversation must be refused while the worker holds the desktop',
  )
  assert.equal(desktopToolDenial('ball-session-1', 'bash', 'computer-use'), desktopToolDenial('ball-session-1', 'bash', 'computer-use'))
  assert.equal(typeof desktopToolDenial('ball-session-1', 'input_text', 'computer-use'), 'string')
  // The worker itself is allowed, and ordinary sessions were never restricted.
  assert.equal(desktopToolDenial('child-1', 'click', 'computer-use'), undefined)
  assert.equal(desktopToolDenial('s1', 'click', 'standard'), undefined)
})

test('releasing the worker gives the desktop back to the ball conversation', async () => {
  reset()
  const orb = await import(pathToFileURL(ORB_SCREEN_OWNER).href)
  const setScreenOwner = orb.c
  const desktopToolDenial = orb.r

  setScreenOwner('ball-session-1')
  const { ctx, tools, activations } = makeContext()
  apply(ctx, {})
  await tools.get('computer_task').execute(
    { goal: 'click Export', stop_condition: 'the dialog appears', justification: 'no_structured_interface' },
    exec(agent('s1', 'standard')),
  )
  assert.equal(typeof desktopToolDenial('ball-session-1', 'click', 'computer-use'), 'string')

  activations[0].settle({ stopReason: 'completed', output: [] })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(globalThis[OWNER_KEY].ownerId, 'ball-session-1')
  assert.equal(desktopToolDenial('ball-session-1', 'click', 'computer-use'), undefined)
})
