import { describe, expect, it } from 'vitest'
import { recall, recallLine } from './historyRecall'

describe('recall', () => {
  it('says when a later check changed the verdict', () => {
    const next = recall(
      [
        { origin: 'https://example.com', verdictLabel: 'Suspicious' },
        { origin: 'https://example.com', verdictLabel: 'Safe' },
      ],
      'https://example.com',
    )
    expect(next.changed).toBe(true)
    expect(recallLine(next)).toBe('This origin was Safe on this computer. It is Suspicious now.')
  })

  it('stays quiet for a first check', () => {
    expect(recallLine(recall([{ origin: 'https://example.com', verdictLabel: 'Safe' }], 'https://example.com'))).toBeNull()
  })
})
