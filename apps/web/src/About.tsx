import { motion } from 'framer-motion'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
}

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.12 } },
}

const items = [
  { title: 'Decentralised Architecture', body: 'Go talks to the site. Java talks to the registry. This page explains it all. No link leaves your browser without being stripped of credentials, path, and query.' },
  { title: 'Server-Client Separation', body: 'The client (this UI) never makes direct TCP connections. The Go daemon handles certificate, DNS, and HTTPS checks inside a sandboxed environment you control.' },
  { title: 'Privacy-First by Design', body: 'Every paste is parsed on-device. Only the origin (scheme + host) is sent to the checkers. Path, query, password, and fragment stay in this browser window and are never transmitted.' },
  { title: 'RDAP Registry Lookups', body: 'Registration data comes from public RDAP servers — the same authoritative source registrars use. No cache, no middleman, no stale WHOIS proxies.' },
  { title: 'Phishing Signal Analysis', body: 'Over 50 heuristics score the host against known phishing patterns: lookalike domains, suspicious TLDs, mismatched certificate names, young registrations, and more.' },
  { title: 'Open Source Foundation', body: 'WebSentinel is built entirely on open standards: Go standard library, Java RDAP client, and a plain web UI. No proprietary engines, no black boxes.' },
]

export function About() {
  return (
    <motion.section className="about" variants={stagger} initial="hidden" animate="show">
      <motion.p className="kicker" variants={fadeUp}>About</motion.p>
      <motion.h1 variants={fadeUp}>Built for the <span className="text-gradient">real web.</span></motion.h1>
      <motion.p className="lede" variants={fadeUp} style={{ marginBottom: '2rem' }}>
        WebSentinel checks one thing: whether a link you received points at who it claims to.
        It does not crawl, index, or track. Every assessment is independent, auditable, and ephemeral.
      </motion.p>

      <motion.div variants={fadeUp} className="glass-panel" style={{ padding: '2rem' }}>
        <h2 style={{ marginBottom: '0.75rem' }}>The stack</h2>
        <div className="steps" style={{ maxWidth: '100%' }}>
          {[
            'Paste a link in the browser UI. Path and credentials are stripped immediately — only the origin stays.',
            'A Go daemon on your machine connects to the origin over HTTPS and validates the TLS certificate chain.',
            'A Java process queries public RDAP servers for the domain‘s registration record: registrar, creation date, statuses.',
            'DNS records are resolved from the system resolver — no third-party DNS API.',
            'The advisory engine compares 50+ signals against the domain profile and assigns a safety score.',
            'Results are displayed in a tabbed report with findings, score breakdown, and raw evidence you can export as JSON.',
          ].map((step, i) => (
            <li key={i} style={{ borderBottom: '1px solid var(--line)', padding: '0.75rem 0', margin: 0 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--ink-dim)' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ lineHeight: 1.7 }}>{step}</span>
            </li>
          ))}
        </div>
      </motion.div>

      <motion.div className="about-section" variants={fadeUp}>
        <h2 className="kicker" style={{ fontSize: '0.75rem', color: 'var(--ink-dim)' }}>Architecture</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
          {items.map((item) => (
            <div key={item.title} className="glass-panel" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '0.9375rem', marginBottom: '0.5rem' }}>{item.title}</h3>
              <p style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', lineHeight: 1.7 }}>{item.body}</p>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div className="about-section" variants={fadeUp} style={{ padding: '2rem', borderTop: '1px solid var(--line)', marginTop: '2.5rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Security & Integrity</h2>
        <p style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', lineHeight: 1.7 }}>
          WebSentinel does not collect telemetry, analytics, or session data. Assessment results live only in memory and your local history.
          No results are uploaded or shared. The Go daemon binds to <code style={{ color: 'var(--ink)' }}>127.0.0.1:9950</code> by default — localhost only.
          Registry queries go directly to IANA‘s authoritative RDAP bootstrap, never through a proxy.
        </p>
      </motion.div>
    </motion.section>
  )
}