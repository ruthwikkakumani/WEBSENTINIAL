import { describe, expect, it } from 'vitest'
import { prepare, previewHost } from './origin'

describe('scanner early private-address boundary', () => {
  it.each(['[::]', '[::1]', '[0:0:0:0:0:0:0:1]', '[fc00::1]', '[fdff::1]', '[fe80::1]', '[febf::1]', '[ff02::1]', '[::ffff:127.0.0.1]', '[::ffff:7f00:1]', '[::ffff:10.0.0.1]', '[::ffff:192.168.1.1]', '[::ffff:169.254.169.254]', 'localhost.', '127.1', '2130706433', '224.0.0.1', '255.255.255.255'])('rejects %s', host => {
    expect(() => prepare(`http://${host}/secret`)).toThrow(/not contacted/)
  })
  it.each(['[2606:4700:4700::1111]', '[::ffff:8.8.8.8]', 'example.com'])('allows a public literal/name %s for Go validation', host => {
    expect(prepare(`https://${host}/path?q=secret#fragment`).url).toBe(`https://${new URL(`https://${host}`).host}`)
  })
  it('never previews credentials or sensitive suffixes', () => {
    expect(previewHost('https://user:secret@example.com')).toBeNull()
    expect(JSON.stringify(previewHost('https://example.com/secret?token=private'))).not.toMatch(/secret|private/)
  })
})
