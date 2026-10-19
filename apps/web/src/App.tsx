import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { assess, CheckError, fetchHealth, fetchHistory } from './api'
import { Compare } from './compare'
import { HistoryPage } from './history'
import { Method } from './method'
import { PrepareError, prepare, previewHost } from './origin'
import { Report } from './report'
import { WatchPage } from './watchPage'
import { About } from './About'
import type { Assessment, Health } from './types'

/* ── Inline SVG icons ── */
function Seal() {
  return (
    <svg className="seal" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M11 6H7v20h4M21 6h4v20h-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="2.1" fill="currentColor" />
    </svg>
  )
}
function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a12 12 0 0 0-8.5 3A12 12 0 0 0 12 21a12 12 0 0 0 8.5-18A12 12 0 0 0 12 3Z"/><path d="m9 12 2 2 4-4"/></svg>
  )
}
function IconBook() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 19.5Z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/></svg>
  )
}
function IconClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
  )
}
function IconEye() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
  )
}
function IconGitBranch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
  )
}

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
} as const

const stories = [
  { title: 'example.com', detail: 'Old name, certificate verifies.', url: 'https://example.com' },
  { title: 'neverssl.com', detail: 'The address itself is plain HTTP.', url: 'http://neverssl.com' },
  { title: 'expired.badssl.com', detail: 'A certificate a browser would reject.', url: 'https://expired.badssl.com' },
  { title: '127.0.0.1', detail: 'Local. Must be refused.', url: 'http://127.0.0.1/' },
  { title: 'sbi.example.com', detail: 'Bank word on someone else’s domain. Constructed.', url: 'https://sbi.example.com/' },
  { title: 'kyc-otp.tk', detail: 'KYC word on a cheap TLD. Constructed.', url: 'https://kyc-otp.tk/' },
]

const ticks = ['Certificate · 443', 'Registry date', 'Public DNS']

const refusals: Record<string, { title: string; body: string }> = {
  private_address: {
    title: 'We refused to open this.',
    body: 'The address points at this computer, a private network, or a cloud metadata service. It was not contacted. Do not open it in your browser either.',
  },
  blocked_host: {
    title: 'We refused to open this.',
    body: 'That name is reserved for a local network. It was not contacted.',
  },
  embedded_credentials: {
    title: 'A password was in the link.',
    body: 'It stayed in this browser and was not sent. Remove the username and password, then check the host on its own.',
  },
  unsupported_scheme: {
    title: 'That is not a website link.',
    body: 'Only ordinary http and https addresses can be checked.',
  },
  bad_port: {
    title: 'That port was not opened.',
    body: 'Only the ordinary web ports, 80 and 443, are contacted.',
  },
  single_label: {
    title: 'That is not a public website name.',
    body: 'A single-word host usually belongs to a local network, so it was not contacted.',
  },
  invalid_url: {
    title: 'That is not a website address.',
    body: 'Paste the whole link from the message, or type the host yourself.',
  },
}

export function App() {
  const [path, setPath] = useState(window.location.pathname)
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null)
  const [discarded, setDiscarded] = useState(false)
  const [report, setReport] = useState<Assessment | null>(null)
  const [health, setHealth] = useState<Health | null | undefined>(undefined)
  const [phase, setPhase] = useState(0)
  const [help, setHelp] = useState(false)
  const [recents, setRecents] = useState<string[]>([])
  const inflight = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const runRef = useRef<(input: string) => Promise<void>>(async () => {})

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    let stop = false
    const read = () => {
      fetchHealth().then((next) => {
        if (!stop) setHealth(next)
      })
    }
    read()
    const id = window.setInterval(read, 20000)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [])

  function go(next: string) {
    window.history.pushState({}, '', next)
    setPath(next)
    window.scrollTo(0, 0)
  }

  useEffect(() => {
    if (!loading) {
      setPhase(0)
      return
    }
    const id = window.setInterval(() => setPhase((n) => Math.min(n + 1, 2)), 900)
    return () => window.clearInterval(id)
  }, [loading])

  useEffect(() => {
    if (!report && !failure) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const target = document.getElementById('verdict-title') ?? document.getElementById('result')
    target?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    if (target instanceof HTMLElement) target.focus({ preventScroll: true })
  }, [report, failure])

  async function run(input: string) {
    inflight.current?.abort()
    const controller = new AbortController()
    inflight.current = controller
    setLoading(true)
    setFailure(null)
    setReport(null)
    try {
      const prepared = prepare(input)
      setValue(prepared.url)
      const result = await assess(prepared.url, controller.signal)
      if (controller.signal.aborted) return
      setDiscarded(prepared.discarded)
      setReport(result)
    } catch (err) {
      if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return
      setReport(null)
      if (err instanceof CheckError || err instanceof PrepareError) {
        setFailure({ code: err.code, message: err.message })
      } else {
        setFailure({ code: 'unavailable', message: 'The checker on this computer did not answer.' })
      }
    } finally {
      if (inflight.current === controller) setLoading(false)
    }
  }
  runRef.current = run

  function another() {
    inflight.current?.abort()
    setLoading(false)
    setFailure(null)
    setReport(null)
    setValue('')
    setDiscarded(false)
    inputRef.current?.focus()
  }

  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    const check = new URLSearchParams(window.location.search).get('check')
    if (!check) return
    booted.current = true
    void run(check)
  }, [])

  useEffect(() => {
    fetchHistory()
      .then((items) => {
        const seen = new Set<string>()
        const origins: string[] = []
        for (const item of items) {
          if (seen.has(item.origin)) continue
          seen.add(item.origin)
          origins.push(item.origin)
          if (origins.length === 6) break
        }
        setRecents(origins)
      })
      .catch(() => setRecents([]))
  }, [report])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault()
        setHelp((on) => !on)
      }
      if (event.key === 'Escape') {
        setHelp(false)
        another()
      }
      if (event.key === '/' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault()
        go('/')
        inputRef.current?.focus()
      }
    }
    function onPaste(event: ClipboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const text = event.clipboardData?.getData('text').trim()
      if (!text) return
      event.preventDefault()
      go('/')
      void runRef.current(text)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('paste', onPaste)
    }
  }, [])

  const page =
    path === '/method'
      ? 'method'
      : path === '/history'
        ? 'history'
        : path === '/compare'
          ? 'compare'
          : path === '/watch'
            ? 'watch'
          : path === '/about'
            ? 'about'
            : 'assess'
  const idle = page === 'assess' && !report && !failure && !loading
  const root = [
    'app',
    page,
    idle ? 'idle' : '',
    loading ? 'busy' : '',
    page === 'assess' && failure ? 'refused' : '',
    page === 'assess' && report ? `verdict-${report.verdict}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={root}>
      <a className="skip" href="#main">
        Skip to the check
      </a>
      <aside className="sidebar">
        <button className="sidebar-brand" type="button" onClick={() => go('/')}>
          <Seal />
          <span>WebSentinel</span>
        </button>
        <nav className="sidebar-nav" aria-label="Primary">
          {[
            { p: 'assess', label: 'Check', icon: IconShield },
            { p: 'method', label: 'Method', icon: IconBook },
            { p: 'history', label: 'History', icon: IconClock },
            { p: 'watch', label: 'Watch', icon: IconEye },
            { p: 'compare', label: 'Compare', icon: IconGitBranch },
            { p: 'about', label: 'About', icon: IconBook },
          ].map(({ p, label, icon: Icon }) => (
            <button key={p} type="button" aria-current={page === p ? 'page' : undefined} onClick={() => go(p === 'assess' ? '/' : `/${p}`)}>
              <Icon /> {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Status health={health} />
          <p className="text-xs text-ink-dim leading-relaxed">
            Go talks to the site. Java talks to the registry. This page only explains. Press <kbd className="px-1 py-0.5 border border-glass-border rounded font-mono text-[11px]">?</kbd> for keys.
          </p>
        </div>
      </aside>

      <div className="stage">
        <main id="main">
          <AnimatePresence mode="wait">
            <motion.div key={page} variants={pageVariants} initial="initial" animate="animate" exit="exit">
              {page === 'method' && <Method />}
              {page === 'history' && <HistoryPage />}
              {page === 'watch' && <WatchPage onCheck={(origin) => { go('/'); void run(origin) }} />}
              {page === 'compare' && <Compare />}
              {page === 'about' && <About />}
              {page === 'assess' && (
                <section className={idle ? 'idle-stage' : ''}>
                  <div className="well">
                    {idle && <p className="prompt">Paste the link before the OTP.</p>}
                    <form className="composer" aria-busy={loading} onSubmit={(event) => { event.preventDefault(); if (!loading) void run(value) }}>
                      <label className="sr" htmlFor="url">Link from the message</label>
                      <input ref={inputRef} id="url" name="url" value={value} autoFocus autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="https://" onChange={(event) => setValue(event.target.value)} onPaste={(event) => { const text = event.clipboardData.getData('text').trim(); if (!text) return; event.preventDefault(); setValue(text); void run(text) }} />
                      <button type="submit" disabled={loading}>{loading ? 'Reading' : 'Check'}</button>
                    </form>
                    <p className="hint">
                      Path, query, and password stay here. Only the host is sent.{' '}
                      <button type="button" className="text-btn" onClick={async () => { try { const text = (await navigator.clipboard.readText()).trim(); if (text) void run(text) } catch { inputRef.current?.focus() } }}>Paste from clipboard</button>
                    </p>
                    {(report || failure) && <p className="again"><button type="button" className="btn btn-ghost" onClick={another}>Check another</button></p>}
                    <LiveName input={value} hidden={Boolean(report)} loading={loading} phase={phase} />
                  </div>
                  {idle && recents.length > 0 && (
                    <p className="recents" aria-label="Recent origins">
                      {recents.map((origin) => (<button key={origin} type="button" onClick={() => void run(origin)}>{origin.replace(/^https?:\/\//, '')}</button>))}
                    </p>
                  )}
                  {idle && (
                    <details className="lab"><summary>Constructed examples</summary>
                      <ul>{stories.map((s) => (<li key={s.url}><button type="button" onClick={() => void run(s.url)}><code>{s.title}</code><span>{s.detail}</span></button></li>))}</ul>
                    </details>
                  )}
                  {failure && <Refusal failure={failure} />}
                  {report && <Report assessment={report} discarded={discarded || report.discardedPath} />}
                </section>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      {help && (
        <div className="help" role="dialog" aria-label="Keyboard">
          <p className="kicker">Keys</p>
          <ul>
            <li><kbd>/</kbd> Focus the paste field</li>
            <li><kbd>Esc</kbd> Check another</li>
            <li><kbd>?</kbd> Close this</li>
          </ul>
          <p>Paste anywhere on the page. Only the host is sent.</p>
        </div>
      )}
    </div>
  )
}

function LiveName({
  input,
  hidden,
  loading,
  phase,
}: {
  input: string
  hidden: boolean
  loading: boolean
  phase: number
}) {
  const preview = hidden ? null : previewHost(input)
  if (!preview && !loading) return null
  return (
    <div className="specimen" aria-live="polite">
      {preview && (
        <>
          <p className="kicker">Sent as origin</p>
          <p className="anatomy-name">
            {preview.prefix ? (
              <>
                <span className="costume">{preview.prefix}</span>
                <span className="dot">.</span>
                <span className="owner">{preview.owner}</span>
              </>
            ) : (
              <span className="owner">{preview.owner}</span>
            )}
          </p>
          <p className="specimen-note">
            {preview.prefix
              ? `${preview.owner} is the likely registered domain. ${preview.prefix} sits in front of it.`
              : 'This whole name is the likely registered domain.'}{' '}
            {preview.discarded ? 'The path will not be sent.' : 'Nothing after the host will be sent.'}
          </p>
        </>
      )}
      {loading && (
        <ol className="ticks" role="status">
          {ticks.map((label, index) => (
            <li key={label} className={index < phase ? 'done' : index === phase ? 'now' : ''}>
              {label}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function Refusal({ failure }: { failure: { code: string; message: string } }) {
  const known = refusals[failure.code]
  return (
    <motion.section className="refusal" id="result" role="alert" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <p className="kicker">Not contacted</p>
      <h2 id="verdict-title" tabIndex={-1}>{known ? known.title : 'This link could not be checked.'}</h2>
      <p>{known ? known.body : failure.message}</p>
    </motion.section>
  )
}

function Status({ health }: { health: Health | null | undefined }) {
  const state = health === undefined ? 'wait' : health === null ? 'down' : health.rdap === 'ok' ? 'ok' : 'warn'
  const label =
    state === 'wait'
      ? 'Services…'
      : state === 'down'
        ? 'Checker offline'
        : state === 'ok'
          ? 'Checker ready'
          : 'Registry offline'
  return (
    <p className={`status-indicator ${state}`}>
      <span className="status-dot" aria-hidden="true" /> {label}
    </p>
  )
}
