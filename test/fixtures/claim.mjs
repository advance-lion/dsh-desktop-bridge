import { claimDesktopControl } from '../../lib/control-channel.js'

const holdMs = Number(process.argv[2] ?? 0)
const control = await claimDesktopControl()
console.log(`${process.pid} ${control.owner ? 'OWNER' : `REFUSED:${control.reason}`}`)
if (holdMs > 0) await new Promise((resolve) => setTimeout(resolve, holdMs))
if (control.owner) await control.dispose()
process.exit(0)
