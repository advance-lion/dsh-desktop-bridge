import assert from 'node:assert/strict'
import test from 'node:test'

import { DesktopScheduler, DesktopAbortedError, DesktopBusyError } from '../lib/coordinator.js'

const tick = () => new Promise((resolve) => setImmediate(resolve))

test('the first task takes the desktop immediately', async () => {
  const scheduler = new DesktopScheduler()
  const grant = await scheduler.acquire({ taskId: 'a', sessionId: 's1' })
  assert.equal(grant.waitedMs, 0)
  assert.equal(scheduler.holderTaskId, 'a')
  assert.equal(scheduler.queueLength, 0)
})

test('a second task waits, and runs only after the first releases', async () => {
  const scheduler = new DesktopScheduler()
  await scheduler.acquire({ taskId: 'a', sessionId: 's1' })

  let admitted = false
  const second = scheduler.acquire({ taskId: 'b', sessionId: 's2' }).then(() => {
    admitted = true
  })

  await tick()
  assert.equal(admitted, false)
  assert.equal(scheduler.queueLength, 1)

  scheduler.release('a')
  await second
  assert.equal(admitted, true)
  assert.equal(scheduler.holderTaskId, 'b')
})

test('waiters are admitted in FIFO order', async () => {
  const scheduler = new DesktopScheduler()
  await scheduler.acquire({ taskId: 'a', sessionId: 's1' })
  const order = []
  const second = scheduler.acquire({ taskId: 'b', sessionId: 's2' }).then(() => order.push('b'))
  const third = scheduler.acquire({ taskId: 'c', sessionId: 's3' }).then(() => order.push('c'))
  await tick()

  scheduler.release('a')
  await second
  scheduler.release('b')
  await third

  assert.deepEqual(order, ['b', 'c'])
})

test('a waiting task times out with a busy error instead of preempting', async () => {
  const scheduler = new DesktopScheduler()
  await scheduler.acquire({ taskId: 'a', sessionId: 's1' })
  await assert.rejects(
    scheduler.acquire({ taskId: 'b', sessionId: 's2', maxWaitMs: 10 }),
    (error) => error instanceof DesktopBusyError,
  )
  assert.equal(scheduler.holderTaskId, 'a')
  assert.equal(scheduler.queueLength, 0)
})

test('cancelling a waiting task does not touch the holder', async () => {
  const scheduler = new DesktopScheduler()
  await scheduler.acquire({ taskId: 'a', sessionId: 's1' })
  const controller = new AbortController()
  const waiting = scheduler.acquire({
    taskId: 'b',
    sessionId: 's2',
    signal: controller.signal,
  })
  await tick()
  controller.abort()
  await assert.rejects(waiting, (error) => error instanceof DesktopAbortedError)
  assert.equal(scheduler.holderTaskId, 'a')
  assert.equal(scheduler.queueLength, 0)
})

test('a stale release does not free another task’s desktop', async () => {
  const scheduler = new DesktopScheduler()
  await scheduler.acquire({ taskId: 'a', sessionId: 's1' })
  scheduler.release('b')
  assert.equal(scheduler.holderTaskId, 'a')
})

test('the scheduler is shared through one process-global record', async () => {
  const key = Symbol.for('dsh-desktop-bridge.scheduler')
  assert.equal(globalThis[key], undefined)
  globalThis[key] ??= new DesktopScheduler()
  assert.equal(globalThis[key], globalThis[key])
  delete globalThis[key]
})
