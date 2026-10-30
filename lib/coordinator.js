/**
 * Pure desktop-scheduling primitives.
 *
 * The scheduler owns one logical desktop. A task holds the desktop from the moment it
 * is admitted until its worker session settles, so two sessions cannot interleave
 * "open window → type → submit" fragments. Waiting is a FIFO queue; nothing preempts.
 */

export class DesktopBusyError extends Error {
  constructor(position, waitedMs) {
    super(
      `The desktop is in use by another task. This task waited ${Math.round(waitedMs / 1000)}s` +
        (position > 0 ? `, and ${position} task(s) are still ahead` : ', and the holder has not finished') +
        '. Do not retry immediately: report the wait to the user, or finish what does not need the desktop.',
    )
    this.name = 'DesktopBusyError'
  }
}

export class DesktopAbortedError extends Error {
  constructor() {
    super('The desktop task was cancelled before it obtained the desktop.')
    this.name = 'DesktopAbortedError'
  }
}

const noop = () => {}

export class DesktopScheduler {
  #holder = null
  #queue = []
  #seq = 0
  #now

  constructor(options = {}) {
    this.#now = options.now ?? Date.now
  }

  get busy() {
    return this.#holder !== null
  }

  get holderTaskId() {
    return this.#holder?.taskId
  }

  get queueLength() {
    return this.#queue.length
  }

  snapshot() {
    return {
      busy: this.#holder !== null,
      holder: this.#holder ? { ...this.#holder } : undefined,
      waiting: this.#queue.map((entry) => ({ taskId: entry.taskId, sessionId: entry.sessionId })),
    }
  }

  /**
   * Wait for exclusive use of the desktop.
   * @param {{ taskId: string, sessionId: string, maxWaitMs?: number, signal?: AbortSignal, onQueued?: (info: { position: number }) => void }} request
   * @returns {Promise<{ waitedMs: number, position: number }>}
   */
  async acquire({ taskId, sessionId, maxWaitMs = 300_000, signal, onQueued = noop }) {
    if (signal?.aborted) throw new DesktopAbortedError()
    if (this.#holder === null) {
      this.#holder = { taskId, sessionId, since: this.#now() }
      return { waitedMs: 0, position: 0 }
    }

    const queuedAt = this.#now()
    const position = this.#queue.length + 1
    onQueued({ position })

    await new Promise((resolve, reject) => {
      const entry = { taskId, sessionId, queuedAt, seq: ++this.#seq, resolve, reject, signal: undefined }
      entry.timer = setTimeout(() => {
        this.#detach(entry)
        reject(new DesktopBusyError(this.#queue.length, this.#now() - queuedAt))
      }, maxWaitMs)
      entry.timer.unref?.()
      if (signal) {
        entry.signal = signal
        signal.addEventListener('abort', entry.onAbort = () => {
          this.#detach(entry)
          reject(new DesktopAbortedError())
        }, { once: true })
      }
      this.#queue.push(entry)
    })

    return { waitedMs: this.#now() - queuedAt, position }
  }

  /** Release the desktop; the next waiting task is admitted in FIFO order. */
  release(taskId) {
    if (this.#holder === null || this.#holder.taskId !== taskId) return
    this.#holder = null
    const next = this.#queue.shift()
    if (next === undefined) return
    this.#detach(next)
    this.#holder = { taskId: next.taskId, sessionId: next.sessionId, since: this.#now() }
    next.resolve()
  }

  /** Drop a waiting task without touching the holder. */
  cancelQueued(taskId) {
    for (const entry of [...this.#queue]) {
      if (entry.taskId !== taskId) continue
      this.#detach(entry)
      entry.reject(new DesktopAbortedError())
    }
  }

  #detach(entry) {
    const index = this.#queue.indexOf(entry)
    if (index >= 0) this.#queue.splice(index, 1)
    clearTimeout(entry.timer)
    entry.timer = undefined
    if (entry.signal && entry.onAbort) entry.signal.removeEventListener('abort', entry.onAbort)
    entry.signal = undefined
  }
}
