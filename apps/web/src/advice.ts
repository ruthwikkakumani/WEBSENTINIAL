import type { Assessment } from './types'

export type Advice = {
  title: string
  steps: string[]
}

const copy: Record<'high_risk' | 'suspicious' | 'safe', Advice> = {
  high_risk: {
    title: 'Do not continue.',
    steps: [
      'Do not enter a password, OTP, UPI PIN, or card number.',
      'Do not download or install anything from this page.',
      'If a person sent the link, call them on a number you already have.',
    ],
  },
  suspicious: {
    title: 'Pause before you type anything.',
    steps: [
      'Open the official app, or type the address yourself. Do not follow this link into a login.',
      'Look at which part of the name is actually registered. Words on the left are chosen by whoever owns the name on the right.',
      'A lock icon only means the connection can be private.',
    ],
  },
  safe: {
    title: 'Nothing here crossed the caution line.',
    steps: [
      'That is not permission to enter an OTP, a UPI PIN, or a password.',
      'If the page asks for money or a code, leave and use a channel you already trust.',
      'A valid certificate proves a private connection, not who runs the site.',
    ],
  },
}

export function advice(assessment: Pick<Assessment, 'verdict' | 'findings'>): Advice {
  const serious = assessment.findings.some((item) => item.severity === 'risk' && item.weight > 0)
  if (assessment.verdict === 'high_risk') return copy.high_risk
  if (assessment.verdict === 'suspicious' || serious) return copy.suspicious
  return copy.safe
}

export function cautionNote(assessment: Assessment): string {
  const next = advice(assessment)
  return [
    `WebSentinel caution for ${assessment.origin}`,
    `${assessment.verdictLabel}. Advisory ${assessment.advisoryScore}, documented rules ${assessment.ruleScore}.`,
    next.title,
    next.steps[0],
    'A low score is not proof of safety.',
  ].join('\n')
}
