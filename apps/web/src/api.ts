import type { Assessment, Health } from './types'
import { prepare } from './origin'

export class CheckError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

export const ASSESS_TIMEOUT_MS = 35_000
const SERVICE_TIMEOUT_MS = 8_000
const invalidResponse = () => new CheckError('The checker returned an incomplete response. Retry after restarting the local services.', 'invalid_response')

// Keep caller cancellation distinct from a timeout; release listeners even on JSON failure.
async function request(path: string, init: RequestInit = {}, timeout = SERVICE_TIMEOUT_MS): Promise<unknown> {
  const external = init.signal
  if (external?.aborted) throw external.reason ?? new DOMException('Cancelled', 'AbortError')
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort(external?.reason)
  external?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeout)
  try {
    const res = await fetch(path, { ...init, signal: controller.signal, credentials: 'omit' })
    if (external?.aborted) throw external.reason ?? new DOMException('Cancelled', 'AbortError')
    const data: unknown = res.status === 204 ? null : await res.json().catch(() => null)
    if (external?.aborted) throw external.reason ?? new DOMException('Cancelled', 'AbortError')
    if (!res.ok) {
      // Do not echo arbitrary server text (which could include input or internals).
      const code = isRecord(data) && typeof data.code === 'string' ? data.code : 'unavailable'
      const messages: Record<string, string> = {
        private_address: 'That host resolves to a private or local address. It was not contacted.',
        invalid_url: 'Enter a public http or https origin.',
        unsupported_scheme: 'Only http and https addresses can be assessed.',
        rate_limited: 'Too many checks. Wait briefly, then retry.',
      }
      throw new CheckError(messages[code] ?? 'The local checker could not complete this request. Check service health and retry.', code)
    }
    return data
  } catch (error) {
    if (external?.aborted) throw external.reason ?? new DOMException('Cancelled', 'AbortError')
    if (timedOut) throw new CheckError('The local checker took too long. Check service health, then retry.', 'timeout')
    if (error instanceof CheckError) throw error
    throw new CheckError('Cannot reach the local checker. Start the local services with ./scripts/dev.sh, then retry.', 'offline')
  } finally {
    clearTimeout(timer)
    external?.removeEventListener('abort', abort)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function fields(value: Record<string, unknown>, strings: string[], numbers: string[] = [], booleans: string[] = []): void {
  if (strings.some(k => typeof value[k] !== 'string') || numbers.some(k => typeof value[k] !== 'number' || !Number.isFinite(value[k])) || booleans.some(k => typeof value[k] !== 'boolean')) throw invalidResponse()
}
function stringArray(value: unknown): string[] {
  if (value == null) return [] // Go encodes empty slices as null.
  if (!Array.isArray(value) || value.some(x => typeof x !== 'string')) throw invalidResponse()
  return value
}
function optionalFields(value: Record<string, unknown>, keys: string[]): void {
  if (keys.some(k => value[k] != null && typeof value[k] !== 'string')) throw invalidResponse()
}

export function parseAssessment(value: unknown): Assessment {
  if (!isRecord(value)) throw invalidResponse()
  fields(value, ['id', 'assessedAt', 'origin', 'scheme', 'hostname', 'registrableDomain', 'verdict', 'verdictLabel', 'summary', 'disclaimer'], ['ruleScore', 'advisoryScore'], ['discardedPath'])
  if (!value.id || !Number.isFinite(Date.parse(value.assessedAt as string))) throw invalidResponse()
  try { if (prepare(value.origin as string).url !== value.origin) throw invalidResponse() } catch { throw invalidResponse() }
  optionalFields(value, ['connectedTo'])
  const result = { ...value }
  for (const key of ['checked', 'notChecked', 'limitations']) result[key] = stringArray(value[key])
  if (value.findings != null && !Array.isArray(value.findings)) throw invalidResponse()
  result.findings = ((value.findings ?? []) as unknown[]).map(item => {
    if (!isRecord(item)) throw invalidResponse()
    fields(item, ['id', 'signal', 'severity', 'title', 'detail'], ['weight'], ['rule'])
    optionalFields(item, ['evidence'])
    return { ...item }
  })
  for (const key of ['certificate', 'dns', 'registration', 'page']) {
    const data = value[key]
    if (data == null) { delete result[key]; continue }
    if (!isRecord(data)) throw invalidResponse()
    const copy = { ...data }
    if (key === 'certificate') {
      fields(data, [], ['daysLeft', 'nameCount'], ['checked', 'valid', 'selfSigned'])
      optionalFields(data, ['error', 'protocol', 'cipher', 'issuer', 'subject', 'notBefore', 'notAfter'])
      copy.names = stringArray(data.names)
    } else if (key === 'dns') {
      optionalFields(data, ['error'])
      for (const flag of ['hasSpf', 'hasDmarc']) if (data[flag] != null && typeof data[flag] !== 'boolean') throw invalidResponse()
      for (const field of ['addresses', 'nameservers', 'mailServers', 'text', 'pointers']) copy[field] = stringArray(data[field])
    } else if (key === 'registration') {
      fields(data, [], [], ['found', 'dnssec', 'dnssecKnown'])
      optionalFields(data, ['source', 'registrar', 'registered', 'updated', 'expires', 'age', 'error'])
      for (const field of ['statuses', 'nameservers']) copy[field] = stringArray(data[field])
    } else {
      fields(data, [], [], ['crossSite'])
      optionalFields(data, ['finalOrigin', 'title', 'error', 'blockedRedirect'])
      if (data.headers != null && (!isRecord(data.headers) || Object.values(data.headers).some(x => typeof x !== 'string'))) throw invalidResponse()
      if (data.hops != null && !Array.isArray(data.hops)) throw invalidResponse()
      copy.hops = ((data.hops ?? []) as unknown[]).map(hop => {
        if (!isRecord(hop)) throw invalidResponse()
        fields(hop, ['origin'], ['status'])
        return { ...hop }
      })
    }
    result[key] = copy
  }
  return result as Assessment
}

export async function assess(url: string, signal?: AbortSignal): Promise<Assessment> {
  const prepared = prepare(url) // Every caller gets the origin-only boundary.
  return parseAssessment(await request('/api/v1/assess', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: prepared.url }), signal,
  }, ASSESS_TIMEOUT_MS))
}

export async function fetchHealth(signal?: AbortSignal): Promise<Health | null> {
  try {
    const value = await request('/api/v1/health', { signal })
    if (!isRecord(value)) return null
    fields(value, ['status', 'bind', 'rdap', 'version'])
    return value as Health
  } catch (error) {
    if (signal?.aborted) throw error
    return null
  }
}

export async function fetchHistory(signal?: AbortSignal): Promise<Assessment[]> {
  const value = await request('/api/v1/history', { signal })
  if (value === null) return []
  if (!Array.isArray(value)) throw invalidResponse()
  return value.map(parseAssessment)
}

export async function clearHistory(signal?: AbortSignal): Promise<void> {
  await request('/api/v1/history', { method: 'DELETE', signal })
}
