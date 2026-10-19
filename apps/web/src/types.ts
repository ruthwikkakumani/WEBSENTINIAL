export type Finding = {
  id: string
  signal: string
  severity: string
  weight: number
  rule: boolean
  title: string
  detail: string
  evidence?: string
}

export type Hop = {
  origin: string
  status: number
}

export type Certificate = {
  checked: boolean
  valid: boolean
  error?: string
  protocol?: string
  cipher?: string
  issuer?: string
  subject?: string
  notBefore?: string
  notAfter?: string
  daysLeft: number
  names?: string[]
  nameCount: number
  selfSigned: boolean
}

export type DNS = {
  addresses?: string[]
  nameservers?: string[]
  mailServers?: string[]
  text?: string[]
  pointers?: string[]
  hasSpf?: boolean
  hasDmarc?: boolean
  error?: string
}

export type Registration = {
  found: boolean
  source?: string
  registrar?: string
  statuses?: string[]
  nameservers?: string[]
  registered?: string
  updated?: string
  expires?: string
  age?: string
  dnssec: boolean
  dnssecKnown: boolean
  error?: string
}

export type PageInfo = {
  finalOrigin?: string
  hops: Hop[]
  crossSite: boolean
  title?: string
  headers?: Record<string, string>
  error?: string
  blockedRedirect?: string
}

export type Assessment = {
  id: string
  assessedAt: string
  origin: string
  scheme: string
  hostname: string
  registrableDomain: string
  discardedPath: boolean
  connectedTo?: string
  ruleScore: number
  advisoryScore: number
  verdict: string
  verdictLabel: string
  summary: string
  disclaimer: string
  findings: Finding[]
  checked: string[]
  notChecked: string[]
  limitations: string[]
  certificate?: Certificate
  dns?: DNS
  registration?: Registration
  page?: PageInfo
}

export type Health = {
  status: string
  bind: string
  rdap: string
  version: string
}
