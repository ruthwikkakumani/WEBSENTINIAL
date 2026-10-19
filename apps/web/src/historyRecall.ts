import type { Assessment } from './types'

export type Recall = {
  count: number
  labels: string[]
  changed: boolean
  previousLabel: string | null
  latestLabel: string | null
}

export function recall(items: Pick<Assessment, 'origin' | 'verdictLabel'>[], origin: string): Recall {
  const same = items.filter((item) => item.origin === origin)
  const labels = [...new Set(same.map((item) => item.verdictLabel))]
  return {
    count: same.length,
    labels,
    changed: labels.length > 1,
    latestLabel: same[0]?.verdictLabel ?? null,
    previousLabel: same[1]?.verdictLabel ?? null,
  }
}

export function recallLine(next: Recall): string | null {
  if (next.count < 2) return null
  if (next.changed && next.previousLabel && next.latestLabel) {
    return `This origin was ${next.previousLabel} on this computer. It is ${next.latestLabel} now.`
  }
  return `This origin has been checked ${next.count} times on this computer. Earlier verdicts: ${next.labels.join(', ')}.`
}
