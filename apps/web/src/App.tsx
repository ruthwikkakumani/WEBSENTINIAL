/* ════════════════════════════════════════════════════════
   WebSentinel Enterprise — App root & Landing page
   ════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { Routes, Route, Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  Shield,
  Search,
  Activity,
  Menu,
  X,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  Globe,
  Server,
  Lock,
  Layers,
  ArrowRight,
} from 'lucide-react'

import { assess, CheckError, fetchHealth } from './api'
import { PrepareError, prepare } from './origin'
import { Report } from './report'
import { ScanPreview, healthLabel, recheckOrigin } from './ScanPreview'

const HistoryPage = lazy(() => import('./history').then(m => ({ default: m.HistoryPage })))
const Compare = lazy(() => import('./compare').then(m => ({ default: m.Compare })))
const About = lazy(() => import('./About').then(m => ({ default: m.About })))
const Clients = lazy(() => import('./clients').then(m => ({ default: m.Clients })))
const Method = lazy(() => import('./method').then(m => ({ default: m.Method })))
const Signals = lazy(() => import('./signals').then(m => ({ default: m.Signals })))
const Limits = lazy(() => import('./limits').then(m => ({ default: m.Limits })))
const WatchPage = lazy(() => import('./watchPage').then(m => ({ default: m.WatchPage })))

import type { Assessment, Health } from './types'

/* ── Page transition variants ── */

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
}

/* ── Checker input state ── */

type CheckState =
  | { phase: 'idle'; cancelled?: boolean }
  | { phase: 'preparing' }
  | { phase: 'assessing'; startedAt: number }
  | { phase: 'done'; assessment: Assessment; discarded: boolean }
  | { phase: 'error'; message: string; code: string }

/* ── Nav items ── */

const NAV = [
  { to: '/', label: 'Check' },
  { to: '/history', label: 'History' },
  { to: '/compare', label: 'Compare' },
  { to: '/watch', label: 'Watch' },
  { to: '/method', label: 'Method' },
  { to: '/about', label: 'About' },
]

/* ════════════════════════════════════════════════════════
   NAVBAR
   ════════════════════════════════════════════════════════ */

function Navbar() {
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const isHome = location.pathname === '/'
  const menuRef = useRef<HTMLButtonElement>(null)
  const mobileRef = useRef<HTMLElement>(null)

  useEffect(() => { setOpen(false) }, [location.pathname])
  useEffect(() => {
    if (open) mobileRef.current?.querySelector<HTMLAnchorElement>('a')?.focus()
  }, [open])

  return (
    <header className={`navbar ${isHome ? 'home' : ''}`}>
      <div className="navbar-inner">
        <Link to="/" className="logo" aria-label="WebSentinel home">
          <Shield size={22} className="logo-icon" strokeWidth={2.2} />
          <span className="logo-text">WebSentinel</span>
          <span className="logo-badge">Local</span>
        </Link>

        <nav className="nav-desktop" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <button ref={menuRef} type="button" className="menu-toggle btn btn-ghost" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="mobile-navigation">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            className="nav-mobile"
            id="mobile-navigation"
            ref={mobileRef}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault(); setOpen(false); menuRef.current?.focus()
              }
              if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                const links = Array.from(mobileRef.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])
                const index = links.indexOf(document.activeElement as HTMLAnchorElement)
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1 :
                  (index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length
                event.preventDefault(); links[next]?.focus()
              }
            }}
            initial={reduced ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: reduced ? 0 : 0.16 }}
            aria-label="Mobile navigation"
          >
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                {n.label}
              </NavLink>
            ))}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}

/* ════════════════════════════════════════════════════════
   FOOTER
   ════════════════════════════════════════════════════════ */

function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Shield size={16} strokeWidth={2} className="footer-icon" />
          <span>WebSentinel</span>
        </div>
        <div className="footer-links">
          <Link to="/about">About</Link>
          <Link to="/method">Method</Link>
          <Link to="/signals">Signal weights</Link>
          <Link to="/limits">Privacy & limits</Link>
          <Link to="/clients">Companion apps</Link>
          <a href="https://github.com/ruthwikkakumani/websentinel" target="_blank" rel="noopener noreferrer">
            GitHub <ExternalLink size={12} />
          </a>
        </div>
        <p className="footer-legal">No login. No tracking. This page never contacts the site you paste.</p>
      </div>
    </footer>
  )
}

/* ════════════════════════════════════════════════════════
   APP ROOT
   ════════════════════════════════════════════════════════ */

export function App() {
  const location = useLocation()
  const reduced = useReducedMotion()
  const previousPath = useRef(location.pathname)
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const label = NAV.find(n => n.to === location.pathname)?.label ?? ({ '/signals': 'Signal weights', '/limits': 'Privacy & limits', '/clients': 'Companion apps' } as Record<string, string>)[location.pathname] ?? 'Page not found'
    document.title = `WebSentinel — ${label}`
    if (previousPath.current !== location.pathname) {
      previousPath.current = location.pathname
      mainRef.current?.focus({ preventScroll: true })
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [location.pathname])
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Navbar />
      <main className="app-main" id="main-content" tabIndex={-1} ref={mainRef}>
        <Suspense fallback={<div className="route-loading" role="status"><span>Loading page…</span><div className="loading-line" /><div className="loading-block" /></div>}>
        <motion.div className="route-shell" key={location.pathname} initial={reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.18 }}>
          <Routes location={location}>
            <Route path="/" element={<HomePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/watch" element={<WatchRoute />} />
            <Route path="/method" element={<Method />} />
            <Route path="/about" element={<About />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/signals" element={<Signals />} />
            <Route path="/limits" element={<Limits />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </motion.div>
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}

/* ════════════════════════════════════════════════════════
   HOME PAGE — Hero + Checker + Feature Sections
   ════════════════════════════════════════════════════════ */

function WatchRoute() {
  const navigate = useNavigate()
  return <WatchPage onCheck={(raw) => {
    const origin = recheckOrigin({ origin: raw })
    if (origin) navigate('/', { state: { origin } })
  }} />
}

function HomePage() {
  const reduced = useReducedMotion()
  const resultRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const location = useLocation()
  const [input, setInput] = useState(() => recheckOrigin(location.state) ?? '')
  const [state, setState] = useState<CheckState>({ phase: 'idle' })
  const [health, setHealth] = useState<Health | null>(null)
  const navigate = useNavigate()
  const abortRef = useRef<AbortController | null>(null)

  const healthAbortRef = useRef<AbortController | null>(null)
  const [healthChecking, setHealthChecking] = useState(true)

  const refreshHealth = useCallback(async () => {
    healthAbortRef.current?.abort()
    const ctrl = new AbortController()
    healthAbortRef.current = ctrl
    setHealthChecking(true)
    try {
      const result = await fetchHealth(ctrl.signal)
      if (!ctrl.signal.aborted) setHealth(result)
    } catch { /* Unmount/replacement abort is deliberately silent. */ }
    finally { if (!ctrl.signal.aborted) setHealthChecking(false) }
  }, [])

  useEffect(() => {
    void refreshHealth()
    return () => { abortRef.current?.abort(); healthAbortRef.current?.abort() }
  }, [refreshHealth])

  const runCheck = useCallback(async (raw: string) => {
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setState({ phase: 'preparing' })
    try {
      const prepared = prepare(raw)
      setInput(prepared.url)
      setState({ phase: 'assessing', startedAt: Date.now() })
      const assessment = await assess(prepared.url, ctrl.signal)
      if (!ctrl.signal.aborted) {
        setState({ phase: 'done', assessment, discarded: prepared.discarded })
      }
    } catch (err) {
      if (ctrl.signal.aborted) return
      if (err instanceof CheckError || err instanceof PrepareError) {
        setState({ phase: 'error', message: err.message, code: err.code })
      } else {
        setState({ phase: 'error', message: 'The check could not be completed.', code: 'unavailable' })
      }
    }
  }, [])

  useEffect(() => {
    const origin = recheckOrigin(location.state)
    if (!origin) return
    setInput(origin)
    navigate('/', { replace: true, state: null })
    void runCheck(origin)
  }, [location.state, navigate, runCheck])

  useEffect(() => {
    if (state.phase === 'done') {
      resultRef.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
      resultRef.current?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' })
    }
  }, [state.phase, reduced])

  const cancelCheck = () => {
    abortRef.current?.abort()
    setState({ phase: 'idle', cancelled: true })
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (state.phase === 'assessing') return
    void runCheck(input)
  }

  return (
    <div>
      <section className="hero" aria-labelledby="check-title">
        <div className="hero-content check-desk">
          <div className="desk-intro">
            <p className="hero-badge"><Lock size={13} aria-hidden="true" /> Local checker · public signals only</p>
            <h1 className="hero-title" id="check-title">Pause before<br />you <span className="hero-emphasis">trust a link.</span></h1>
            <p className="hero-lede">A certificate is not a promise. Read a website’s public signals, understand what is missing, and decide your next step with a clear case file.</p>
            <div className="desk-links"><Link to="/method">See how a check works <ArrowRight size={15} aria-hidden="true" /></Link><Link to="/limits">Know the limits</Link></div>
            <dl className="scope-grid">
              <div className="scope-item"><dt><Shield size={16} aria-hidden="true" /> Public evidence</dt><dd>Certificate, registration, DNS and redirects.</dd></div>
              <div className="scope-item"><dt><Lock size={16} aria-hidden="true" /> Origin only</dt><dd>Your path, query and fragment stay here.</dd></div>
              <div className="scope-item"><dt><Layers size={16} aria-hidden="true" /> Explainable scores</dt><dd>Documented rules and extra observations, separate.</dd></div>
              <div className="scope-item"><dt><Activity size={16} aria-hidden="true" /> Advisory, not certainty</dt><dd>A low score is never proof of safety.</dd></div>
            </dl>
          </div>
          <div className="desk-console">
            <div className="console-heading"><p className="console-kicker">01 / Check an origin</p><h2>Assess a public origin</h2><p className="console-meta">Paste a link. Review exactly what will be sent.</p></div>
          <form className="check-form hero-form" onSubmit={handleSubmit} aria-busy={state.phase === 'assessing' || state.phase === 'preparing'}>
            <label className="scan-label" htmlFor="origin-input">Website address</label>
            <div className="check-input-wrap">
              <Search size={16} className="input-icon" />
              <input
                type="text"
                id="origin-input"
                inputMode="url"
                enterKeyHint="go"
                autoCapitalize="none"
                ref={inputRef}
                aria-describedby="origin-preview"
                aria-invalid={state.phase === 'error' && ['invalid_url', 'private_address', 'embedded_credentials', 'unsupported_scheme'].includes(state.code)}
                className="check-input"
                placeholder="https://example.com"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  if (state.phase === 'error' && ['invalid_url', 'private_address', 'embedded_credentials', 'unsupported_scheme'].includes(state.code)) setState({ phase: 'idle' })
                }}
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary check-submit"
              disabled={state.phase === 'assessing' || state.phase === 'preparing'}
            >
              {state.phase === 'assessing' ? (
                <span className="btn-loading">
                  <span className="spinner" />
                  Assessing…
                </span>
              ) : state.phase === 'preparing' ? (
                'Preparing…'
              ) : (
                <span className="btn-label">
                  Check origin <ArrowRight size={14} />
                </span>
              )}
            </button>
          </form>
          <ScanPreview input={input} />
          {(state.phase === 'assessing' || state.phase === 'preparing') && (
            <div className="scan-progress" role="status">
              <span>Checking public signals. This may take up to 35 seconds.</span>
              <button type="button" className="btn btn-ghost" onClick={cancelCheck}>Cancel check</button>
            </div>
          )}
          {state.phase === 'idle' && state.cancelled && <p role="status">Check cancelled. No result was added here.</p>}

          {state.phase === 'error' && (
            <motion.div
              className="banner banner-error"
              role="alert"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <AlertTriangle size={14} />
              <span>{state.message}</span>
              {!['invalid_url', 'private_address', 'embedded_credentials', 'unsupported_scheme'].includes(state.code) &&
                <button type="button" className="btn btn-ghost" onClick={() => { void refreshHealth(); void runCheck(input) }}>Retry check</button>}
            </motion.div>
          )}

          {/* Health indicator */}
          <div className="health-indicator">
            <span className={health?.status === 'ok' && health.rdap === 'ok' ? 'health-ok' : 'health-offline'} role="status">
              {health?.status === 'ok' && health.rdap === 'ok' ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
              {healthLabel(health, healthChecking)}
              {!healthChecking && !health && <span className="health-detail"> — run <code>./scripts/dev.sh</code></span>}
            </span>
            <button type="button" className="btn btn-ghost" onClick={() => void refreshHealth()} disabled={healthChecking}>Refresh service status</button>
          </div>
          <p className="scope-note">No login, no exploit, no private-network scan. Confirm requests for money or codes through a channel you already trust.</p>
          </div>
        </div>
      </section>

      {/* ── Result area ── */}
      <AnimatePresence mode="wait">
        {state.phase === 'done' && (
          <motion.div
            key="result"
            ref={resultRef}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            transition={{ duration: reduced ? 0 : 0.22 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="result-section"
          >
            <Report assessment={state.assessment} discarded={state.discarded} />
            <div className="result-actions">
              <button className="btn btn-ghost" onClick={() => { setState({ phase: 'idle' }); setInput(''); inputRef.current?.focus(); inputRef.current?.scrollIntoView({ block: 'center', behavior: reduced ? 'instant' : 'smooth' }) }}>
                Check another origin
              </button>
              <button className="btn btn-ghost" onClick={() => navigate('/history')}>
                View history
              </button>
              <button className="btn btn-ghost" onClick={() => navigate('/compare')}>
                Compare origins
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="features-section" aria-labelledby="evidence-title">
      <div className="home-section-header"><p className="eyebrow">02 / The evidence behind the number</p><h2 id="evidence-title">Less guesswork. More context.</h2><p>Every assessment records the signals checked, the warnings found, and the limits of the result.</p></div>
      <div className="features-grid">
        <FeatureCard
          icon={<Shield size={22} />}
          title="Origin-only contract"
          body="Only scheme and host leave this page. Path, query, fragment, cookies, and credentials are stripped before anything is sent."
        />
        <FeatureCard
          icon={<Layers size={22} />}
          title="Three-process architecture"
          body="React explains the result, Go checks the assessed host, and Java looks up public registration records. Each has a separate responsibility."
        />
        <FeatureCard
          icon={<Server size={22} />}
          title="Private by default"
          body="Loopback, RFC1918, link-local, cloud-metadata addresses are refused. The checker cannot be turned into a network scanner."
        />
        <FeatureCard
          icon={<Activity size={22} />}
          title="Advisory, not a verdict"
          body="Score is an advisory index of public signals. Not a detection rate. Confirm anything that asks for money on a channel you already trust."
        />
      </div>
      </section>

      {/* ── How it works ── */}
      <section className="how-section">
        <p className="eyebrow">03 / Your next step</p>
        <h2 className="section-title">From a link to an informed decision.</h2>
        <div className="steps-row">
          <Step number={1} title="Paste a link" body="Paste an HTTP or HTTPS link. Path, query and fragment are discarded locally; embedded credentials are refused." />
          <Step number={2} title="We check public signals" body="Certificate, RDAP registration, DNS records, redirect chain. No login, no exploit, no script." />
          <Step number={3} title="Read your case file" body="Advisory score, documented rules, extra observations, and actionable steps — all in one place." />
        </div>
      </section>

      <aside className="trust-section"><p>Understand the number before relying on it.</p><div className="desk-links"><Link to="/signals">Read the signal weights <ArrowRight size={15} aria-hidden="true" /></Link><Link to="/limits">What a check cannot tell you</Link></div></aside>
    </div>
  )
}

/* ── Feature card ── */

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  const reduced = useReducedMotion()
  return (
    <motion.article
      className="feature-card glass-panel"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: reduced ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
    >
      <div className="feature-icon">{icon}</div>
      <h3 className="feature-title">{title}</h3>
      <p className="feature-body">{body}</p>
    </motion.article>
  )
}

/* ── How-it-works step ── */

function Step({ number, title, body }: { number: number; title: string; body: string }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      className="step-card"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: reduced ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
    >
      <span className="step-number">{number}</span>
      <h3 className="step-title">{title}</h3>
      <p className="step-body">{body}</p>
    </motion.div>
  )
}

/* ── 404 page ── */

function NotFound() {
  return (
    <motion.section className="not-found" variants={pageVariants} initial="initial" animate="animate" exit="exit">
      <div className="not-found-content">
        <Globe size={48} className="not-found-icon" />
        <h1>No such page</h1>
        <p>This page does not exist. Return to the checker to assess a public origin.</p>
        <Link to="/" className="btn btn-primary">Go to checker</Link>
      </div>
    </motion.section>
  )
}
