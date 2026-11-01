import { prepare, PrepareError } from './origin'
import type { Assessment, Finding } from './types'

export const MIN_URLS = 2
export const MAX_URLS = 4

// Validate the entire batch locally before starting any request. Keep only origins.
export function prepareComparison(inputs: string[]) {
  const origins = new Set<string>()
  let discarded = false
  for (const input of inputs) {
    if (!input.trim()) continue
    const prepared = prepare(input)
    origins.add(prepared.url)
    discarded ||= prepared.discarded
  }
  if (origins.size < MIN_URLS || origins.size > MAX_URLS) {
    throw new PrepareError('Enter between 2 and 4 distinct public origins. Paths on the same origin count once.', 'comparison_count')
  }
  return { origins: [...origins], discarded }
}

export function riskBand(score: number) {
  if (!Number.isFinite(score)) return { verdict: 'unknown', label: 'Risk unavailable', className: 'text-ink-muted', color: '#7c8aff' }
  if (score >= 59) return { verdict: 'high_risk', label: 'High risk', className: 'text-high-risk', color: '#ff4757' }
  if (score >= 24) return { verdict: 'suspicious', label: 'Suspicious', className: 'text-suspicious', color: '#f5a623' }
  return { verdict: 'safe', label: 'Low observed risk', className: 'text-safe', color: '#00e5be' }
}

export const riskPresentation = riskBand

// Labels follow the score bands, not legacy backend display copy (including "Safe").
export function verdictPresentation(_verdict: string, score: number) {
  return riskBand(score)
}

export type SignalCategoryId = 'identity' | 'network' | 'reputation' | 'content' | 'other'
export function classifyFinding(finding: Finding): SignalCategoryId {
  const signal = finding.signal.toLowerCase()
  if (/regist|whois|age|dnssec|reput/.test(signal)) return 'reputation'
  if (/cert|tls|ssl|identity|issuer|subject|handshake|protocol|hostname/.test(signal)) return 'identity'
  if (/dns|mx|nameserver|spf|dmarc|address|network/.test(signal)) return 'network'
  if (/page|content|redirect|header/.test(signal)) return 'content'
  return 'other'
}

export function signalSummary(findings: Finding[]) {
  let ruleWeight = 0
  let observationWeight = 0
  let signalCount = 0
  const categories = new Set<SignalCategoryId>()
  for (const finding of findings) {
    if (finding.rule) ruleWeight += finding.weight
    else observationWeight += finding.weight
    if (finding.weight !== 0) {
      signalCount++
      categories.add(classifyFinding(finding))
    }
  }
  return { ruleWeight, observationWeight, signalCount, categories: categories.size }
}

// Coverage comes from the backend's checked list, never from absence of alerts.
const coveragePatterns: Record<SignalCategoryId, RegExp> = {
  identity: /scheme and origin|hostname shape|tls certificate/i,
  network: /public dns records/i,
  reputation: /registry record/i,
  content: /http headers and redirects/i,
  other: /$^/,
}
export function categoryCoverage(assessment: Pick<Assessment, 'checked'>, category: SignalCategoryId) {
  const checked = assessment.checked.filter(item => coveragePatterns[category].test(item))
  return { checked, label: checked.length ? 'Checked' : 'Not checked / unavailable' }
}

export type ComparisonOutcome =
  | { origin: string; status: 'fulfilled'; assessment: Assessment }
  | { origin: string; status: 'rejected'; message: string }

// Retain successful siblings and order both results and failures by submitted origin.
export function comparisonResults(origins: string[], outcomes: ComparisonOutcome[]) {
  const ordered = origins.flatMap(origin => {
    const outcome = outcomes.find(item => item.origin === origin)
    return outcome ? [outcome] : []
  })
  return {
    assessments: ordered.flatMap(item => item.status === 'fulfilled' ? [item.assessment] : []),
    failures: ordered.flatMap(item => item.status === 'rejected' ? [{ origin: item.origin, message: item.message }] : []),
  }
}
