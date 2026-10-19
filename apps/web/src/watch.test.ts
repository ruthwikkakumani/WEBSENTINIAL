import { describe, expect, it } from 'vitest'
import { isWatched, toggleWatch } from './watch'

describe('watch', () => {
  it('stores origin only', () => {
    if (isWatched('https://sbi.example.com')) toggleWatch('https://sbi.example.com')
    toggleWatch('https://sbi.example.com')
    expect(isWatched('https://sbi.example.com')).toBe(true)
    toggleWatch('https://sbi.example.com')
    expect(isWatched('https://sbi.example.com')).toBe(false)
  })
})
