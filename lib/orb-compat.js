/**
 * The only two things this plugin knows about dsh-orb.
 *
 * 1. A preset id that supplies the GUI tool surface (`computer-use` by default).
 * 2. The process-global screen-owner record, so the floating ball yields the desktop.
 *
 * Neither is a published interface, so both are probed instead of assumed: a renamed or
 * missing preset produces a clear refusal, not a confusing failure deep inside a child
 * session. The plugin imports no dsh-orb code, so an orb upgrade cannot break it at load.
 */

/** The record dsh-orb publishes; writes are only meaningful when orb reads the same key. */
export const SCREEN_OWNER = Symbol.for('dsh-orb.screen-owner')

/**
 * @param {object} ctx Cordis context (may or may not provide `agentPresets`).
 * @param {string} presetId preset id to require.
 * @returns {Promise<{ available: boolean, reason: string, presets?: string[] }>}
 */
export async function probeWorkerPreset(ctx, presetId) {
  const presets = ctx.get?.('agentPresets')
  if (!presets || typeof presets.list !== 'function') {
    return { available: false, reason: 'preset-service-missing' }
  }
  try {
    const listed = await presets.list()
    const ids = listed
      .map((preset) => preset?.id ?? preset?.name)
      .filter((id) => typeof id === 'string' && id !== '')
    if (ids.includes(presetId)) return { available: true, reason: 'ok', presets: ids }
    return { available: false, reason: 'preset-missing', presets: ids }
  } catch (error) {
    return {
      available: false,
      reason: 'preset-probe-failed',
      presets: [],
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

/** Human-readable refusal for a missing worker preset. */
export function missingPresetMessage(presetId, presetIdConfigured, probe) {
  const hint =
    probe.reason === 'preset-service-missing'
      ? 'This profile has no agent-preset service, so a Computer Use worker cannot be composed.'
      : `No agent preset named "${presetId}" is registered. Install and enable dsh-orb (it supplies that preset), ` +
        'or point `workerPreset` at the preset that provides the GUI tools.'
  const seen = probe.presets?.length ? ` Registered presets: ${probe.presets.join(', ')}.` : ''
  return `Desktop delegation is unavailable: ${hint}${seen}`
}
