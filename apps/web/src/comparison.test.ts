import { describe, expect, it } from 'vitest'
import { categoryCoverage, classifyFinding, comparisonResults, prepareComparison, riskBand, signalSummary, verdictPresentation } from './comparison'
import type { Assessment, Finding } from './types'

// Test fixtures only; comparison UI never receives synthetic assessments.
const finding = (weight: number, rule: boolean, signal = 'TLS'): Finding => ({
  id: `${signal}-${weight}`, signal, severity: 'risk', weight, rule, title: 'Test', detail: 'Test fixture',
})
const assessment = (input: Partial<Assessment> = {}): Assessment => ({
  id: 'fixture', origin: 'https://example.com', hostname: 'example.com', discardedPath: false,
  registrableDomain: 'example.com', scheme: 'https', assessedAt: '2026-10-25T00:00:00Z',
  ruleScore: 0, advisoryScore: 0, verdict: 'safe', verdictLabel: 'Low observed risk', summary: 'Fixture', disclaimer: 'Fixture',
  findings: [], checked: [], notChecked: [],
  limitations: [], ...input,
})

describe('comparison preparation', () => {
  it('canonicalizes, strips private URL parts and deduplicates origins in input order', () => {
    expect(prepareComparison(['HTTPS://EXAMPLE.COM:443/login?token=test#fragment', 'example.com/other', ' example.org ', ''])).toEqual({
      origins: ['https://example.com', 'https://example.org'], discarded: true,
    })
  })
  it('requires two distinct origins after deduplication', () => {
    expect(() => prepareComparison(['example.com/a', 'https://example.com/b'])).toThrow(/between 2 and 4 distinct/)
    expect(() => prepareComparison(['', 'example.com'])).toThrow(/between 2 and 4 distinct/)
  })
  it('accepts four distinct origins but rejects five', () => {
    expect(prepareComparison(['example.com', 'example.org', 'example.net', 'example.edu']).origins).toHaveLength(4)
    expect(() => prepareComparison(['example.com', 'example.org', 'example.net', 'example.edu', 'example.gov'])).toThrow(/4 distinct/)
  })
  it.each(['http://127.0.0.1/a', 'http://169.254.169.254', 'https://user:password@example.org', 'file:///private'])('validates the entire batch before a request: %s', (bad) => {
    expect(() => prepareComparison(['example.com', bad])).toThrow()
  })
})

describe('risk semantics', () => {
  it.each([[0, 'safe'], [23, 'safe'], [24, 'suspicious'], [58, 'suspicious'], [59, 'high_risk'], [100, 'high_risk']])('score %s uses backend verdict %s', (score, verdict) => {
    expect(riskBand(score as number).verdict).toBe(verdict)
    expect(riskBand(score as number).label).not.toBe('Safe')
  })
  it('uses correct high_risk spelling and never trusts a legacy Safe label', () => {
    expect(verdictPresentation('high_risk', 59).label).toBe('High risk')
    expect(verdictPresentation('safe', 0).label).toBe('Low observed risk')
    expect(verdictPresentation('safe', 80).label).toBe('High risk')
  })
})

describe('evidence separation and coverage', () => {
  it('keeps documented weights separate from extra advisory observations', () => {
    const result = signalSummary([finding(20, true), finding(-10, true), finding(8, false), finding(-2, false), finding(0, false)])
    expect(result.ruleWeight).toBe(10)
    expect(result.observationWeight).toBe(6)
    expect(result.signalCount).toBe(4)
  })
  it('does not infer checked collectors from findings or the absence of findings', () => {
    expect(categoryCoverage(assessment({ findings: [finding(10, true)] }), 'identity').label).toBe('Not checked / unavailable')
    expect(categoryCoverage(assessment(), 'network').checked).toEqual([])
  })
  it('maps only reported coverage, leaving page scripts and unknown observations unassessed', () => {
    const a = assessment({ checked: ['Scheme and origin', 'Hostname shape', 'TLS certificate', 'Public DNS records', 'Registry record (RDAP)', 'HTTP headers and redirects'], notChecked: ['Page scripts, layout, and images'] })
    for (const id of ['identity', 'network', 'reputation', 'content'] as const) expect(categoryCoverage(a, id).label).toBe('Checked')
    expect(categoryCoverage(a, 'other').label).toBe('Not checked / unavailable')
    expect(classifyFinding(finding(5, false, 'New collector'))).toBe('other')
  })
})

describe('partial comparison outcomes', () => {
  it('keeps completed assessments and per-origin errors in original input order', () => {
    const a = assessment()
    const b = assessment({ id: 'second', origin: 'https://example.org' })
    const result = comparisonResults(['https://example.com', 'https://example.net', 'https://example.org'], [
      { origin: 'https://example.org', status: 'fulfilled', assessment: b },
      { origin: 'https://example.net', status: 'rejected', message: 'Timeout' },
      { origin: 'https://example.com', status: 'fulfilled', assessment: a },
    ])
    expect(result.assessments).toEqual([a, b])
    expect(result.failures).toEqual([{ origin: 'https://example.net', message: 'Timeout' }])
  })
  it('does not prematurely label pending origins as failures', () => {
    expect(comparisonResults(['https://example.com'], [])).toEqual({ assessments: [], failures: [] })
  })
  it('keeps completed results alongside explicit cancelled origins', () => {
    const a = assessment()
    const result = comparisonResults(['https://example.com', 'https://example.org'], [
      { origin: 'https://example.com', status: 'fulfilled', assessment: a },
      { origin: 'https://example.org', status: 'rejected', message: 'Cancelled' },
    ])
    expect(result.assessments).toEqual([a])
    expect(result.failures[0].message).toBe('Cancelled')
  })
})
