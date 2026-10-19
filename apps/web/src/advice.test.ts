import { describe, expect, it } from 'vitest'
import { advice, cautionNote } from './advice'
import type { Assessment } from './types'

const base: Assessment = {
  id: 'WS-1',
  assessedAt: '2026-10-18T12:00:00Z',
  origin: 'https://sbi.example.com',
  scheme: 'https',
  hostname: 'sbi.example.com',
  registrableDomain: 'example.com',
  discardedPath: false,
  ruleScore: 0,
  advisoryScore: 52,
  verdict: 'suspicious',
  verdictLabel: 'Suspicious',
  summary: 'Look again.',
  disclaimer: 'Advisory.',
  findings: [
    { id: 'brand_lookalike', signal: 'Hostname', severity: 'risk', weight: 28, rule: false, title: 'Brand', detail: '' },
  ],
  checked: [],
  notChecked: [],
  limitations: [],
}

describe('advice', () => {
  it('tells a high-risk case to stop', () => {
    const got = advice({ ...base, verdict: 'high_risk', findings: [{ ...base.findings[0], weight: 59 }] })
    expect(got.title).toBe('Do not continue.')
  })

  it('tells a brand lookalike to pause even if rules are 0', () => {
    expect(advice(base).title).toBe('Pause before you type anything.')
  })

  it('does not treat Safe as permission to type an OTP', () => {
    const got = advice({ ...base, verdict: 'safe', findings: [] })
    expect(got.title).toContain('caution line')
    expect(got.steps[0]).toMatch(/OTP/)
  })

  it('keeps advice in English', () => {
    expect(advice(base).title).toBe('Pause before you type anything.')
    expect(cautionNote(base)).toContain('A low score is not proof of safety.')
  })
})

describe('cautionNote', () => {
  it('is short enough to paste into a chat', () => {
    const note = cautionNote(base)
    expect(note).toContain('https://sbi.example.com')
    expect(note).toContain('Suspicious')
    expect(note.split('\n').length).toBeLessThan(8)
  })
})
