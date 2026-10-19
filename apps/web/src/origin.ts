export class PrepareError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

export type Prepared = {
  url: string
  discarded: boolean
}

// prepare keeps path, query, fragment, and credentials on this page.
// Only the origin is returned for the checker.
export function prepare(input: string): Prepared {
  const raw = input.trim()
  if (!raw) {
    throw new PrepareError('Enter a website address.', 'invalid_url')
  }
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `https://${raw}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new PrepareError('Enter a website address.', 'invalid_url')
  }
  if (url.username || url.password) {
    throw new PrepareError('This address contains a username or password. Remove them and try the host on its own. They were not sent.', 'embedded_credentials')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PrepareError('Only http and https addresses can be assessed.', 'unsupported_scheme')
  }
  if (privateHost(url.hostname)) {
    throw new PrepareError('That host is local, private, or a cloud metadata address. It was not contacted.', 'private_address')
  }
  const discarded = (url.pathname !== '/' && url.pathname !== '') || url.search !== '' || url.hash !== ''
  return { url: url.origin, discarded }
}

function privateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.localhost') || h.endsWith('.internal')) return true
  if (h === '::1' || h.startsWith('fe80:')) return true
  const ip = h.match(/^(\d{1,3})(?:\.(\d{1,3})){3}$/)
  if (!ip) return false
  const p = h.split('.').map(Number)
  if (p[0] === 127 || p[0] === 10 || p[0] === 0) return true
  if (p[0] === 192 && p[1] === 168) return true
  if (p[0] === 169 && p[1] === 254) return true
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true
  return false
}

const multiLabels = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'co.in', 'ac.in', 'gov.in', 'com.au', 'net.au', 'org.au',
  'co.nz', 'co.za', 'com.br', 'com.mx', 'co.jp', 'com.sg', 'com.hk', 'com.tr', 'co.kr', 'com.ar',
])

export type NamePreview = {
  origin: string
  prefix: string
  owner: string
  discarded: boolean
}

// previewHost is a local estimate so the name can be taken apart before any request.
// The registry result replaces it.
export function previewHost(input: string): NamePreview | null {
  if (input.trim().length < 4) return null
  try {
    const prepared = prepare(input)
    const host = new URL(prepared.url).hostname
    if (!host.includes('.') && !host.includes(':')) return null
    const owner = roughRegistrable(host)
    const suffix = `.${owner}`
    const prefix = host !== owner && host.endsWith(suffix) ? host.slice(0, -suffix.length) : ''
    return { origin: prepared.url, prefix, owner, discarded: prepared.discarded }
  } catch {
    return null
  }
}

export function splitHost(host: string, registrable: string): { kind: 'ip' | 'name'; prefix: string; owner: string } {
  if (host.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return { kind: 'ip', prefix: '', owner: host }
  }
  const owner = registrable || host
  const suffix = `.${owner}`
  if (host !== owner && host.endsWith(suffix)) {
    return { kind: 'name', prefix: host.slice(0, -suffix.length), owner }
  }
  return { kind: 'name', prefix: '', owner: host }
}

function roughRegistrable(host: string): string {
  if (host.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host
  const labels = host.toLowerCase().split('.')
  if (labels.length < 2) return host
  const lastTwo = labels.slice(-2).join('.')
  if (labels.length >= 3 && multiLabels.has(lastTwo)) return labels.slice(-3).join('.')
  return lastTwo
}
