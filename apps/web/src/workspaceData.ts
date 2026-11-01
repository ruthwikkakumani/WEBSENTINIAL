import { prepare } from './origin'
import type { Assessment } from './types'

/** Team integration: CaseWorkspace.tsx exports CaseWorkspace, WatchWorkspace,
 * BatchWorkspace and imports its CSS. Metadata is browser-local, keyed by id.
 * BatchWorkspace calls assess sequentially and onComplete after a finished/cancelled run.
 * Checks: npm test -- --run src/workspaceData.test.ts; npx tsc --noEmit.
 */
export type CaseStatus = 'open' | 'reviewed' | 'escalated'
export type CaseMetadata = { notes: string; status: CaseStatus; tags: string[] }
export type RiskTone = 'low' | 'suspicious' | 'high'
export const METADATA_KEY = 'websentinel.cases.v1'
export const MAX_BATCH = 10
export const MAX_BATCH_INPUT = 20000
export const EMPTY_METADATA: CaseMetadata = { notes: '', status: 'open', tags: [] }
export type StoragePort = Pick<Storage, 'getItem' | 'setItem'>

export function riskTone(score: number): RiskTone {
  return score < 24 ? 'low' : score < 59 ? 'suspicious' : 'high'
}
export function riskLabel(score: number): string {
  return { low: 'Low signals', suspicious: 'Suspicious', high: 'High risk' }[riskTone(score)]
}
export function normalizeMetadata(value: unknown): CaseMetadata {
  const v = value && typeof value === 'object' ? value as Partial<CaseMetadata> : {}
  return {
    notes: typeof v.notes === 'string' ? v.notes.slice(0, 8000) : '',
    status: v.status === 'reviewed' || v.status === 'escalated' ? v.status : 'open',
    tags: Array.isArray(v.tags) ? [...new Set(v.tags.filter((t): t is string => typeof t === 'string').map(t => t.trim().slice(0, 40)).filter(Boolean))].slice(0, 12) : [],
  }
}
function browserStorage(): StoragePort | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage } catch { return undefined }
}
export function readCaseMetadata(storage: StoragePort | undefined = browserStorage()): Record<string, CaseMetadata> {
  try {
    const data: unknown = JSON.parse(storage?.getItem(METADATA_KEY) || '{}')
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    return Object.fromEntries(Object.entries(data).slice(0, 5000).map(([id, value]) => [id, normalizeMetadata(value)]))
  } catch { return {} }
}
export function saveCaseMetadata(id: string, metadata: CaseMetadata, storage: StoragePort | undefined = browserStorage()): Record<string, CaseMetadata> {
  if (!storage) throw new Error('Browser storage is unavailable. Notes have not been saved.')
  if (!id) throw new Error('This assessment has no identifier; notes cannot be saved.')
  const next = { ...readCaseMetadata(storage), [id]: normalizeMetadata(metadata) }
  try { storage.setItem(METADATA_KEY, JSON.stringify(next)) }
  catch { throw new Error('Browser storage could not save these notes. Keep a copy before leaving.') }
  return next
}
export type BatchEntry = { origin: string; discarded: boolean; line: number }
export type BatchIssue = { line: number; message: string }
export type BatchParse = { entries: BatchEntry[]; errors: BatchIssue[]; duplicates: number }
/** One address per line. Never expose the raw line in errors or persist it. */
export function parseBatch(input: string): BatchParse {
  const result: BatchParse = { entries: [], errors: [], duplicates: 0 }
  if (input.length > MAX_BATCH_INPUT) {
    result.errors.push({ line: 0, message: `Input is too long. Keep it under ${MAX_BATCH_INPUT.toLocaleString()} characters.` })
    return result
  }
  const seen = new Set<string>()
  const lines = input.split(/\r?\n/)
  if (lines.length > 200) {
    result.errors.push({ line: 0, message: 'Too many lines. Enter up to 10 distinct addresses, one per line.' })
    return result
  }
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    try {
      const value = prepare(lines[i])
      if (seen.has(value.url)) { result.duplicates++; continue }
      seen.add(value.url)
      if (result.entries.length >= MAX_BATCH) {
        result.errors.push({ line: i + 1, message: 'Batch limit is 10 distinct origins. Remove extra addresses before running.' })
        continue
      }
      result.entries.push({ origin: value.url, discarded: value.discarded, line: i + 1 })
    } catch (error) {
      result.errors.push({ line: i + 1, message: error instanceof Error ? error.message : 'Invalid website address.' })
    }
  }
  return result
}
export function latestForOrigin(items: Assessment[], origin: string): Assessment[] {
  return items.filter(item => item.origin === origin).sort((a, b) => Date.parse(b.assessedAt) - Date.parse(a.assessedAt))
}
export function csvCell(value: unknown): string {
  let text = String(value ?? '')
  // Protect spreadsheet consumers from formula injection, including leading whitespace.
  if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}
export type ExportFormat = 'json' | 'csv' | 'text'
export function exportCases(items: Assessment[], metadata: Record<string, CaseMetadata>, format: ExportFormat): string {
  const rows = items.map(assessment => ({ assessment, metadata: normalizeMetadata(metadata[assessment.id]) }))
  if (format === 'json') return JSON.stringify({ schemaVersion: 1, notice: 'Local case export. Low scores do not establish safety. Notes are included.', cases: rows }, null, 2)
  if (format === 'text') return rows.map(({ assessment: a, metadata: m }) => [
    `${a.origin} — ${riskLabel(a.advisoryScore)} (${a.advisoryScore})`,
    `Assessment: ${a.id} | ${a.assessedAt}`, `Rule score: ${a.ruleScore} | Status: ${m.status}`,
    a.summary, `Tags: ${m.tags.join(', ') || 'None'}`, `Notes: ${m.notes || 'None'}`,
    'Low scores do not establish safety.',
  ].join('\n')).join('\n\n---\n\n')
  const headers = ['id', 'origin', 'assessed_at', 'advisory_score', 'rule_score', 'signal_band', 'status', 'tags', 'notes', 'summary']
  return [headers.map(csvCell).join(','), ...rows.map(({ assessment: a, metadata: m }) =>
    [a.id, a.origin, a.assessedAt, a.advisoryScore, a.ruleScore, riskLabel(a.advisoryScore), m.status, m.tags.join('; '), m.notes, a.summary].map(csvCell).join(','))].join('\r\n')
}
export function downloadCases(items: Assessment[], metadata: Record<string, CaseMetadata>, format: ExportFormat): void {
  const mime = { json: 'application/json', csv: 'text/csv', text: 'text/plain' }[format]
  const blob = new Blob([exportCases(items, metadata, format)], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `websentinel-cases-${new Date().toISOString().slice(0, 10)}.${format === 'text' ? 'txt' : format}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
