import { prepare, PrepareError } from './origin'
import type { Health } from './types'

// Router state is never trusted as an address or copied back into the input verbatim.
export function recheckOrigin(state: unknown): string | null {
  if (!state || typeof state !== 'object' || !('origin' in state) || typeof state.origin !== 'string') return null
  try { return prepare(state.origin).url } catch { return null }
}

export function ScanPreview({ input }: { input: string }) {
  if (!input.trim()) return <p id="origin-preview" className="origin-preview">Only the public origin is sent. No path, query, fragment, or credentials.</p>
  try {
    const prepared = prepare(input)
    return <p id="origin-preview" className="origin-preview">
      Origin to check: <code>{prepared.url}</code>
      {prepared.discarded && <span> · Path, query, and fragment will be discarded locally.</span>}
      <span> · Preview only; nothing sent yet.</span>
    </p>
  } catch (error) {
    return <p id="origin-preview" className="origin-preview origin-preview-error">
      {error instanceof PrepareError ? error.message : 'Enter a public website origin.'}
    </p>
  }
}

export function healthLabel(health: Health | null, checking = false): string {
  if (checking) return 'Checking local service status…'
  if (!health || health.status !== 'ok') return 'Checker offline — start the local services and retry.'
  if (health.rdap === 'ok') return 'Checker ready · RDAP ready'
  return `Checker reachable · RDAP ${health.rdap === 'down' ? 'unavailable' : 'not confirmed'} — registration signals may be missing`
}
