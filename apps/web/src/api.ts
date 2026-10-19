import type { Assessment, Health } from './types'

export class CheckError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

export async function assess(url: string, signal?: AbortSignal): Promise<Assessment> {
  const res = await fetch('/api/v1/assess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const message = data && typeof data.error === 'string' ? data.error : 'The check could not be completed.'
    const code = data && typeof data.code === 'string' ? data.code : 'unavailable'
    throw new CheckError(message, code)
  }
  return data as Assessment
}

export async function fetchHealth(): Promise<Health | null> {
  try {
    const res = await fetch('/api/v1/health')
    if (!res.ok) return null
    return (await res.json()) as Health
  } catch {
    return null
  }
}

export async function fetchHistory(): Promise<Assessment[]> {
  const res = await fetch('/api/v1/history')
  if (!res.ok) throw new Error('History could not be read.')
  return (await res.json()) as Assessment[]
}

export async function clearHistory(): Promise<void> {
  const res = await fetch('/api/v1/history', { method: 'DELETE' })
  if (!res.ok) throw new Error('History could not be cleared.')
}
