import { describe, expect, it } from 'vitest'
import { PrepareError, prepare, previewHost, splitHost } from './origin'

describe('prepare', () => {
  it('keeps only the origin', () => {
    const got = prepare('https://example.com/login?token=supersecret#frag')
    expect(got.url).toBe('https://example.com')
    expect(got.discarded).toBe(true)
  })

  it('refuses a password in the link', () => {
    expect(() => prepare('https://user:s3cret@example.com/a')).toThrow(PrepareError)
  })

  it('refuses loopback before anything is posted', () => {
    expect(() => prepare('http://127.0.0.1/admin?token=supersecret')).toThrow(/not contacted/)
  })

  it('refuses cloud metadata', () => {
    expect(() => prepare('http://169.254.169.254/latest/meta-data')).toThrow(/not contacted/)
  })
})

describe('previewHost', () => {
  it('marks the registered domain', () => {
    const got = previewHost('https://login.paypal.example.com/verify?otp=1')
    expect(got?.owner).toBe('example.com')
    expect(got?.prefix).toBe('login.paypal')
    expect(got?.discarded).toBe(true)
  })
})

describe('splitHost', () => {
  it('splits a brand label from the registered domain', () => {
    expect(splitHost('sbi.example.com', 'example.com')).toEqual({
      kind: 'name',
      prefix: 'sbi',
      owner: 'example.com',
    })
  })

  it('treats a raw address as an IP, not a name', () => {
    expect(splitHost('203.0.113.10', '')).toEqual({ kind: 'ip', prefix: '', owner: '203.0.113.10' })
  })
})
