// @vitest-environment jsdom
// Runtime contract tests only. These fixtures are not scans, product data, or safety claims.
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Compare } from './compare'
import { HistoryPage } from './history'
import { BatchWorkspace, CaseWorkspace, WatchWorkspace } from './CaseWorkspace'
import { WatchPage } from './watchPage'
import type { Assessment } from './types'
import { METADATA_KEY } from './workspaceData'

// TEST FIXTURES: reserved .invalid origins; deliberately chosen wire verdicts/scores.
// fetch is always replaced, including in tests that must dispatch no request.
function contractFixture(id: string, hostname: string, verdict = 'safe', score = 0): Assessment {
  return {
    id, origin: `https://${hostname}`, hostname, scheme: 'https', registrableDomain: hostname,
    assessedAt: '2026-10-25T00:00:00Z', discardedPath: false,
    ruleScore: 0, advisoryScore: score, verdict, verdictLabel: 'Test contract only',
    summary: `Contract fixture ${id}; not a real assessment`, disclaimer: 'Test fixture; does not establish safety',
    findings: [], checked: [], notChecked: ['Live collectors not run in this test'], limitations: ['Fixture only'],
  }
}
const FIXTURES = {
  low: contractFixture('fixture-low', 'low.example.invalid'),
  high: contractFixture('fixture-high', 'high.example.invalid', 'high_risk', 80),
  secondHigh: contractFixture('fixture-high-other', 'other.example.invalid', 'high_risk', 65),
  unknown: contractFixture('fixture-unknown', 'unknown.example.invalid', 'unknown', 80),
}
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
})
let container: HTMLDivElement
let root: Root
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  // Node 26 exposes an undefined global localStorage without a backing file;
  // use jsdom's origin-scoped Storage instead, not a fake storage implementation.
  const storageWindow = document.defaultView as unknown as { _localStorage: Storage }
  vi.stubGlobal('localStorage', storageWindow._localStorage)
  localStorage.clear()
  fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('Unexpected test network request'))
  vi.stubGlobal('fetch', fetcher)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  localStorage.clear()
  vi.unstubAllGlobals()
})
async function render(node: ReactNode) {
  await act(async () => { root.render(<MemoryRouter><MotionConfig reducedMotion="always">{node}</MotionConfig></MemoryRouter>) })
}
function element<T extends Element = HTMLElement>(selector: string): T {
  const found = container.querySelector<T>(selector)
  expect(found, `Missing real control: ${selector}`).not.toBeNull()
  return found!
}
function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(node => node.textContent?.trim() === label || node.getAttribute('aria-label') === label)
  expect(found, `Missing real button: ${label}`).toBeDefined()
  return found!
}
async function click(node: HTMLElement) { await act(async () => { node.click() }) }
async function enter(node: HTMLInputElement | HTMLTextAreaElement, value: string) {
  // Use the native setter so React's value tracker sees an actual DOM input event.
  const prototype = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function eventually(assertion: () => void) {
  // Keep act strictly serial; waitFor's timer callbacks can overlap async act.
  const deadline = Date.now() + 2500
  while (true) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    try { assertion(); return } catch (error) { if (Date.now() >= deadline) throw error }
  }
}
async function compareInputs(first: string, second: string) {
  await enter(element<HTMLInputElement>('input[aria-label="URL 1"]'), first)
  await enter(element<HTMLInputElement>('input[aria-label="URL 2"]'), second)
}
const noop = () => {}

describe('Compare real controls', () => {
  it('rejects duplicate origins before any network request', async () => {
    await render(<Compare />)
    await compareInputs('https://low.example.invalid/account?test=discard#discard', 'https://low.example.invalid/other')
    await click(button('Compare Now'))
    expect(container.textContent).toContain('distinct public origins')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each(['http://127.0.0.1/path', 'http://169.254.169.254/latest', 'http://[::ffff:127.0.0.1]/'])('rejects private input %s before the entire batch is sent', async privateInput => {
    await render(<Compare />)
    await compareInputs(FIXTURES.low.origin, privateInput)
    await click(button('Compare Now'))
    expect(container.textContent).toContain('It was not contacted')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('keeps a successful sibling when another origin fails and transmits origins only', async () => {
    fetcher.mockImplementation(async (_url, init) => {
      const { url } = JSON.parse(String(init?.body)) as { url: string }
      return url === FIXTURES.low.origin ? reply(FIXTURES.low) : reply({ code: 'rate_limited' }, 429)
    })
    await render(<Compare />)
    await compareInputs(`${FIXTURES.low.origin}/account?fixture=discard#discard`, `${FIXTURES.high.origin}/other`)
    await click(button('Compare Now'))
    await eventually(() => {
      expect(element('.compare-results-section').textContent).toContain('low.example.invalid')
      expect(element('[role="status"]').textContent).toContain(FIXTURES.high.origin)
      expect(element('[role="status"]').textContent).toContain('Too many checks')
      expect(button('Compare Now').disabled).toBe(false)
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls.map(([url, init]) => [url, init?.body, init?.credentials])).toEqual([
      ['/api/v1/assess', JSON.stringify({ url: FIXTURES.low.origin }), 'omit'],
      ['/api/v1/assess', JSON.stringify({ url: FIXTURES.high.origin }), 'omit'],
    ])
    expect(element<HTMLInputElement>('input[aria-label="URL 1"]').value).toBe(FIXTURES.low.origin)
  })
})

describe('History real controls', () => {
  beforeEach(() => { fetcher.mockResolvedValue(reply(Object.values(FIXTURES))) })
  it('filters the actual high_risk wire verdict and combines case-insensitive domain search', async () => {
    await render(<HistoryPage />)
    await eventually(() => expect(container.querySelectorAll('.history-card')).toHaveLength(4))
    await click(button('High Risk'))
    await eventually(() => expect(container.querySelectorAll('.history-card')).toHaveLength(2))
    expect(element('.history-timeline').textContent).not.toContain('unknown.example.invalid')
    await enter(element<HTMLInputElement>('input[aria-label="Search history by origin or domain"]'), ' HIGH.EXAMPLE.INVALID ')
    await eventually(() => expect(container.querySelectorAll('.history-card')).toHaveLength(1))
    expect(element('.history-card').textContent).toContain('high.example.invalid')
    await enter(element<HTMLInputElement>('input[aria-label="Search history by origin or domain"]'), 'missing.example.invalid')
    await eventually(() => expect(container.querySelectorAll('.history-card')).toHaveLength(0))
    expect(container.textContent).toContain('No case files match')
    await click(button('Clear filters'))
    await eventually(() => expect(container.querySelectorAll('.history-card')).toHaveLength(4))
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('cancels clear confirmation without DELETE or losing loaded records/local notes', async () => {
    localStorage.setItem(METADATA_KEY, JSON.stringify({ 'fixture-low': { notes: 'Local contract note', status: 'reviewed', tags: [] } }))
    const before = localStorage.getItem(METADATA_KEY)
    await render(<HistoryPage />)
    await eventually(() => expect(container.querySelectorAll('.history-card')).toHaveLength(4))
    await click(button('Clear history'))
    expect(container.textContent).toContain('Permanently delete all 4 history records?')
    expect(button('Confirm deletion')).toBeDefined()
    await click(button('Cancel'))
    expect(container.querySelectorAll('.history-card')).toHaveLength(4)
    expect(button('Clear history')).toBeDefined()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'DELETE')).toBe(true)
    expect(localStorage.getItem(METADATA_KEY)).toBe(before)
  })
})

describe('Case and watch workspace controls', () => {
  it('keeps analyst notes local and passes only the fixture origin to recheck', async () => {
    const onRecheck = vi.fn()
    const notify = vi.fn()
    await render(<CaseWorkspace items={[FIXTURES.low]} onOpen={noop} onRecheck={onRecheck} refresh={noop} notify={notify} />)
    await click(element('summary'))
    await enter(element<HTMLTextAreaElement>('.cw-editor textarea'), 'Contract-only analyst note /path?local=only#local')
    await click(button('Save case notes'))
    expect(JSON.parse(localStorage.getItem(METADATA_KEY)!)[FIXTURES.low.id].notes).toBe('Contract-only analyst note /path?local=only#local')
    expect(notify).toHaveBeenCalledWith('Case notes saved in this browser.')
    await click(button('Recheck origin'))
    expect(onRecheck).toHaveBeenCalledExactlyOnceWith(FIXTURES.low.origin)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('sanitizes batch workspace inputs before dispatching to the real API wrapper', async () => {
    fetcher.mockResolvedValue(reply(FIXTURES.low))
    const onComplete = vi.fn()
    await render(<BatchWorkspace onComplete={onComplete} notify={noop} />)
    const input = element<HTMLTextAreaElement>('.cw-batchform textarea')
    await enter(input, `${FIXTURES.low.origin}/account?fixture=discard#discard\n${FIXTURES.low.origin}/duplicate`)
    expect(container.textContent).toContain('1 duplicate lines ignored')
    await click(button('Run batch'))
    await eventually(() => expect(container.textContent).toContain('Batch finished: 1 completed, 0 failed'))
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/v1/assess', expect.objectContaining({ body: JSON.stringify({ url: FIXTURES.low.origin }), credentials: 'omit' }))
    expect(input.value).toBe(FIXTURES.low.origin)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
  it('adds only an origin, rejects duplicates/private inputs, and persists removal through remounts', async () => {
    const onRecheck = vi.fn()
    const notify = vi.fn()
    const view = () => <WatchWorkspace items={[]} onRecheck={onRecheck} notify={notify} />
    await render(view())
    await enter(element<HTMLInputElement>('.cw-addform input'), `${FIXTURES.low.origin}/account?fixture=discard#discard`)
    await click(button('Add origin'))
    expect(localStorage.getItem('websentinel.watch')).toBe(JSON.stringify([FIXTURES.low.origin]))
    expect(element<HTMLInputElement>('.cw-addform input').value).toBe('')
    expect(notify).toHaveBeenCalledWith('Origin added. Path, query and fragment were discarded.')
    await enter(element<HTMLInputElement>('.cw-addform input'), `${FIXTURES.low.origin}/another`)
    await click(button('Add origin'))
    expect(element('[role="alert"]').textContent).toContain('already on your watchlist')
    await enter(element<HTMLInputElement>('.cw-addform input'), 'http://127.0.0.1/private')
    await click(button('Add origin'))
    expect(element('[role="alert"]').textContent).toContain('It was not contacted')
    expect(localStorage.getItem('websentinel.watch')).toBe(JSON.stringify([FIXTURES.low.origin]))
    await render(null)
    await render(view())
    expect(element('.cw-watchcard h3').textContent).toBe(FIXTURES.low.origin)
    await click(button('Recheck'))
    expect(onRecheck).toHaveBeenCalledExactlyOnceWith(FIXTURES.low.origin)
    await click(button(`Remove ${FIXTURES.low.origin} from watchlist`))
    expect(localStorage.getItem('websentinel.watch')).toBe('[]')
    await render(null)
    await render(view())
    expect(container.querySelectorAll('.cw-watchcard')).toHaveLength(0)
    expect(container.textContent).toContain('No watched origins')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('legacy watch page reads the same persisted origins and removes them locally', async () => {
    localStorage.setItem('websentinel.watch', JSON.stringify([FIXTURES.low.origin]))
    const onCheck = vi.fn()
    await render(<WatchPage onCheck={onCheck} />)
    await click(button('Check'))
    expect(onCheck).toHaveBeenCalledExactlyOnceWith(FIXTURES.low.origin)
    await click(button('Remove'))
    expect(localStorage.getItem('websentinel.watch')).toBe('[]')
    expect(container.textContent).toContain('Nothing is watched yet')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
