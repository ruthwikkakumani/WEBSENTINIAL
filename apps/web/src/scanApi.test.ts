import { afterEach, describe, expect, it, vi } from 'vitest'
import { assess, ASSESS_TIMEOUT_MS, clearHistory, fetchHealth, fetchHistory } from './api'

// Contract fixture only: no scan or detection result is claimed.
const record = () => ({ id: 'fixture', assessedAt: '2026-10-25T00:00:00Z', origin: 'https://example.com', scheme: 'https', hostname: 'example.com', registrableDomain: 'example.com', discardedPath: false, ruleScore: 0, advisoryScore: 0, verdict: 'unknown', verdictLabel: 'Test contract', summary: 'Fixture', disclaimer: 'Not a real assessment', findings: null, checked: null, notChecked: null, limitations: null })
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('scanner API', () => {
  it('prepares all callers before transmitting and normalises nullable Go slices', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(record())); vi.stubGlobal('fetch', fetcher)
    const result = await assess('https://example.com/account?secret=private#otp')
    expect(fetcher.mock.calls[0][1].body).toBe('{"url":"https://example.com"}')
    expect(fetcher.mock.calls[0][1].credentials).toBe('omit')
    expect(result.findings).toEqual([]); expect(result.checked).toEqual([])
  })
  it.each(['https://user:password@example.com', 'http://[::ffff:127.0.0.1]/'])('rejects %s before network', async raw => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(assess(raw)).rejects.toBeInstanceOf(Error); expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([null, {}, { ...record(), advisoryScore: '0' }, { ...record(), origin: 'https://example.com/private' }, { ...record(), findings: [{}] }, { ...record(), checked: [42] }, { ...record(), dns: { addresses: [1] } }, { ...record(), page: { crossSite: false, hops: [{ origin: 'https://example.com', status: '200' }] } }])('rejects malformed success %j', async data => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(data)))
    await expect(assess('example.com')).rejects.toMatchObject({ code: 'invalid_response' })
  })
  it('normalises nested nullable arrays', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ ...record(), dns: { addresses: null }, page: { crossSite: false, hops: null } })))
    const result = await assess('example.com'); expect(result.dns?.addresses).toEqual([]); expect(result.page?.hops).toEqual([])
  })
  it('reports offline with an actionable message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(assess('example.com')).rejects.toMatchObject({ code: 'offline', message: expect.stringContaining('Start the local services') })
  })
  it('preserves an already-aborted caller without networking', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    const ctrl = new AbortController(); const reason = new DOMException('Cancelled', 'AbortError'); ctrl.abort(reason)
    await expect(assess('example.com', ctrl.signal)).rejects.toBe(reason); expect(fetcher).not.toHaveBeenCalled()
  })
  it('propagates cancellation and clears its timer', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))))
    const ctrl = new AbortController(); const promise = assess('example.com', ctrl.signal)
    ctrl.abort(); await expect(promise).rejects.toMatchObject({ name: 'AbortError' }); expect(vi.getTimerCount()).toBe(0)
  })
  it('bounds assessment time and identifies timeout separately from cancel', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))))
    const checked = expect(assess('example.com')).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(ASSESS_TIMEOUT_MS); await checked; expect(vi.getTimerCount()).toBe(0)
  })
  it('does not echo untrusted backend error text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ code: 'unavailable', error: 'user:password?secret' }, 503)))
    await expect(assess('example.com')).rejects.toMatchObject({ code: 'unavailable', message: expect.not.stringContaining('password') })
  })
  it('validates health and preserves down RDAP explicitly', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply({ status: 'ok', bind: '127.0.0.1', rdap: 'down', version: 'v1' })).mockResolvedValueOnce(reply({ status: 'ok' }))
    vi.stubGlobal('fetch', fetcher); expect((await fetchHealth())?.rdap).toBe('down'); expect(await fetchHealth()).toBeNull()
  })
  it('handles null history and rejects malformed records', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(null)).mockResolvedValueOnce(reply([{}])))
    expect(await fetchHistory()).toEqual([]); await expect(fetchHistory()).rejects.toMatchObject({ code: 'invalid_response' })
  })
  it('clears history with DELETE and supports empty success', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetcher)
    await clearHistory(); expect(fetcher.mock.calls[0][1].method).toBe('DELETE')
  })
})
