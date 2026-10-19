const key = 'websentinel.watch'
let memory: string[] = []

function read(): string[] {
  try {
    if (typeof localStorage === 'undefined') return memory
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && /^https?:\/\//.test(item))
  } catch {
    return memory
  }
}

function write(next: string[]) {
  memory = next
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

export function listWatch(): string[] {
  return read()
}

export function isWatched(origin: string): boolean {
  return read().includes(origin)
}

export function toggleWatch(origin: string): string[] {
  const current = read()
  const next = current.includes(origin) ? current.filter((item) => item !== origin) : [origin, ...current].slice(0, 40)
  write(next)
  return next
}
