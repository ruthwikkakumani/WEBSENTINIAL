import { describe, expect, it } from 'vitest'
import type { Assessment } from './types'
import { csvCell, exportCases, latestForOrigin, MAX_BATCH_INPUT, METADATA_KEY, normalizeMetadata, parseBatch, readCaseMetadata, riskTone, saveCaseMetadata } from './workspaceData'
import type { StoragePort } from './workspaceData'

function storage(initial = '{}'): StoragePort {
  const values = new Map([[METADATA_KEY, initial]])
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) } }
}
function assessment(id: string, origin = 'https://example.com', assessedAt = '2026-10-21T10:00:00Z'): Assessment {
  return { id, origin, assessedAt, hostname: 'example.com', scheme: 'https', registrableDomain: 'example.com', discardedPath: false, ruleScore: 12, advisoryScore: 23, verdict: 'safe', verdictLabel: 'Safe', summary: 'Few observed signals', disclaimer: 'Uncalibrated', findings: [], checked: [], notChecked: [], limitations: [] }
}
describe('risk bands', () => {
  it('uses exact advisory boundaries without asserting safety', () => {
    expect([0, 23, 23.99, 24, 58, 58.99, 59, 100].map(riskTone)).toEqual(['low', 'low', 'low', 'suspicious', 'suspicious', 'suspicious', 'high', 'high'])
  })
})
describe('browser-local case metadata', () => {
  it('persists by assessment id without replacing another case', () => {
    const port = storage()
    saveCaseMetadata('a', { notes: 'Review DNS', status: 'reviewed', tags: ['DNS'] }, port)
    saveCaseMetadata('b', { notes: 'Investigate', status: 'escalated', tags: [] }, port)
    expect(readCaseMetadata(port)).toEqual({ a: { notes: 'Review DNS', status: 'reviewed', tags: ['DNS'] }, b: { notes: 'Investigate', status: 'escalated', tags: [] } })
  })
  it('recovers from corrupt data and bounds untrusted metadata', () => {
    expect(readCaseMetadata(storage('not json'))).toEqual({})
    expect(readCaseMetadata(storage('[]'))).toEqual({})
    expect(normalizeMetadata({ status: 'invalid', notes: 44, tags: [' A ', 'A', 4, '', 'x'.repeat(80)] })).toEqual({ status: 'open', notes: '', tags: ['A', 'x'.repeat(40)] })
    expect(normalizeMetadata({ notes: 'a'.repeat(9000), tags: Array.from({ length: 20 }, (_, i) => `tag${i}`) }).notes).toHaveLength(8000)
    expect(normalizeMetadata({ tags: Array.from({ length: 20 }, (_, i) => `tag${i}`) }).tags).toHaveLength(12)
  })
  it('surfaces storage write failures instead of claiming a save', () => {
    expect(() => saveCaseMetadata('a', normalizeMetadata(null), { getItem: () => null, setItem: () => { throw new Error('quota') } })).toThrow(/could not save/)
    expect(() => saveCaseMetadata('', normalizeMetadata(null), storage())).toThrow(/identifier/)
  })
  it('handles prototype-shaped keys as data', () => {
    const port = storage('{"__proto__":{"notes":"test","status":"reviewed"}}')
    expect(readCaseMetadata(port).__proto__.notes).toBe('test')
    expect({}.hasOwnProperty('notes')).toBe(false)
  })
})
describe('bounded batch parsing', () => {
  it('sanitizes, canonicalizes, and deduplicates origins', () => {
    const result = parseBatch(' EXAMPLE.com/path?token=hidden#secret\r\nhttps://example.com/another\n\nhttp://example.com')
    expect(result.entries).toEqual([{ origin: 'https://example.com', discarded: true, line: 1 }, { origin: 'http://example.com', discarded: false, line: 4 }])
    expect(result.duplicates).toBe(1)
    expect(result.errors).toEqual([])
    expect(JSON.stringify(result)).not.toMatch(/hidden|secret/)
  })
  it('rejects credentials, private addresses, and non-web schemes without leaking raw input', () => {
    const result = parseBatch('https://u:secret@example.com\nhttp://127.0.0.1\nftp://example.com')
    expect(result.entries).toEqual([])
    expect(result.errors.map(e => e.line)).toEqual([1, 2, 3])
    expect(JSON.stringify(result.errors)).not.toContain('secret')
  })
  it('never accepts more than ten distinct origins and reports overflow', () => {
    const result = parseBatch(Array.from({ length: 12 }, (_, i) => `https://host${i}.example.com`).join('\n'))
    expect(result.entries).toHaveLength(10)
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0].line).toBe(11)
  })
  it('bounds input and line count, with clear empty behavior', () => {
    expect(parseBatch('x'.repeat(MAX_BATCH_INPUT + 1)).errors[0].message).toMatch(/too long/)
    expect(parseBatch('\n'.repeat(201)).errors[0].message).toMatch(/Too many lines/)
    expect(parseBatch(' \n')).toEqual({ entries: [], errors: [], duplicates: 0 })
  })
})
describe('case exports and history', () => {
  it('quotes CSV and neutralizes formulas including leading whitespace', () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"')
    for (const value of ['=SUM(1,1)', '+1', '-1', '@cmd', '  =cmd', '\tcmd']) expect(csvCell(value)).toBe(`"'${value}"`)
  })
  it('includes local metadata and caveat in JSON/text, prevents notes formula injection in CSV', () => {
    const item = assessment('a')
    const metadata = { a: { notes: '=CMD()', status: 'reviewed' as const, tags: ['review'] } }
    const json = JSON.parse(exportCases([item], metadata, 'json'))
    expect(json.cases[0].metadata.status).toBe('reviewed')
    expect(json.notice).toMatch(/do not establish safety/)
    expect(exportCases([item], metadata, 'text')).toMatch(/Low signals/)
    expect(exportCases([item], metadata, 'csv')).toContain('"\'=CMD()"')
  })
  it('sorts a copy to expose latest and previous assessments for one origin', () => {
    const items = [assessment('old', undefined, '2026-10-20T10:00:00Z'), assessment('other', 'https://other.com'), assessment('new')]
    expect(latestForOrigin(items, 'https://example.com').map(a => a.id)).toEqual(['new', 'old'])
    expect(items.map(a => a.id)).toEqual(['old', 'other', 'new'])
  })
})
