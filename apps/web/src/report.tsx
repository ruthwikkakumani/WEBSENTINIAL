import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { advice, cautionNote } from './advice'
import { splitHost } from './origin'
import { isWatched, toggleWatch } from './watch'
import type { Assessment, Certificate, DNS, Finding, PageInfo, Registration } from './types'

/* ── Variants ── */

const pageTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
}

const container = {
  animate: { transition: { staggerChildren: 0.05 } },
}

const slideIn = {
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.25 } },
}

const tabContent = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.15 } },
}

export function Report({ assessment, discarded }: { assessment: Assessment; discarded: boolean }) {
  const scored = assessment.findings.filter((item) => item.weight !== 0)
  const notes = assessment.findings.filter((item) => item.weight === 0)
  const same = assessment.ruleScore === assessment.advisoryScore
  const next = advice(assessment)
  const [tab, setTab] = useState<'do' | 'why' | 'record'>('do')
  const [watched, setWatched] = useState(() => isWatched(assessment.origin))

  return (
    <motion.section variants={pageTransition} initial="initial" animate="animate" exit="exit">
      <motion.article
        className={`report glass-panel ${assessment.verdict}`}
        id="result"
        aria-live="polite"
      >
        <header className="action">
          <div className="flex-1 min-w-0">
            <p className="kicker">
              {assessment.verdictLabel}
              <span className="mx-1.5 opacity-40">·</span>
              {assessment.id}
              <span className="mx-1.5 opacity-40">·</span>
              {formatWhen(assessment.assessedAt)}
            </p>
            <h2 id="verdict-title" tabIndex={-1} className="text-xl font-semibold mt-1">
              {next.title}
            </h2>
            <p className="summary text-ink-muted mt-2">{assessment.summary}</p>
            <ol className="steps mt-3 space-y-1">
              {next.steps.map((step) => (
                <li key={step} className="flex items-start gap-2">
                  <span className="text-accent mt-0.5 shrink-0">→</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <ScoreCircle score={assessment.advisoryScore} rule={assessment.ruleScore} same={same} />
        </header>

        <NameAnatomy host={assessment.hostname} registrable={assessment.registrableDomain} origin={assessment.origin} />
        {discarded && (
          <p className="discarded px-3 py-2 rounded-lg bg-glass border border-glass-border text-sm">
            Anything after the host was discarded in this browser and was not checked.
          </p>
        )}
        <p className="disclaimer text-ink-dim text-sm mt-2">{assessment.disclaimer}</p>

        <div className="tabs" role="tablist" aria-label="Case file">
          {(['do', 'why', 'record'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`tab-btn ${tab === t ? 'active' : ''}`}>
              {t === 'do' ? 'Do this' : t === 'why' ? 'Why' : 'Record'}
            </button>
          ))}
        </div>

        <div className="tab-content-wrapper" style={{ position: 'relative' }}>
          {tab === 'do' && (
            <motion.div key="do" variants={tabContent} initial="initial" animate="animate" exit="exit">
              <p className="quiet text-ink-dim text-sm">The steps above are the action. The number is uncalibrated. Open Why for the signals that moved it.</p>
            </motion.div>
          )}

          {tab === 'why' && (
            <motion.div key="why" variants={tabContent} initial="initial" animate="animate" exit="exit">
              <section>
                {scored.length === 0 ? (
                  <p className="quiet text-ink-dim text-sm">No scored warning fired. The notes below are still part of the case file.</p>
                ) : (
                  <motion.ol className="findings space-y-2" variants={container} initial="initial" animate="animate">
                    {scored.map((item) => (
                      <FindingRow key={item.id} item={item} />
                    ))}
                  </motion.ol>
                )}
                {notes.length > 0 && (
                  <details className="fold mt-4" open>
                    <summary className="text-sm font-medium cursor-pointer text-ink-dim hover:text-ink transition-colors">Also observed, and not scored</summary>
                    <motion.ol className="findings notes mt-2 space-y-2" variants={container} initial="initial" animate="animate">
                      {notes.map((item) => (
                        <FindingRow key={item.id} item={item} />
                      ))}
                    </motion.ol>
                  </details>
                )}
              </section>
            </motion.div>
          )}

          {tab === 'record' && (
            <motion.div key="record" variants={tabContent} initial="initial" animate="animate" exit="exit">
              <section className="facts grid grid-cols-1 md:grid-cols-2 gap-3">
                <Fact title="Certificate" body={<CertBody cert={assessment.certificate} />} />
                <Fact title="Registration" body={<RegBody reg={assessment.registration} />} />
                <Fact title="DNS" body={<DnsBody dns={assessment.dns} connected={assessment.connectedTo} />} />
                <Fact title="Page" body={<PageBody page={assessment.page} />} />
              </section>
              <details className="fold mt-4" open>
                <summary className="text-sm font-medium cursor-pointer text-ink-dim hover:text-ink transition-colors">What this file does not claim</summary>
                <div className="bounds grid grid-cols-2 gap-4 mt-2">
                  <div className="glass-panel p-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-dim mb-2">Checked</h3>
                    <ul className="space-y-0.5 text-sm">
                      {assessment.checked.map((item) => (
                        <li key={item} className="flex items-center gap-1.5"><span className="text-accent">✓</span>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="glass-panel p-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-dim mb-2">Not checked</h3>
                    <ul className="space-y-0.5 text-sm">
                      {assessment.notChecked.map((item) => (
                        <li key={item} className="flex items-center gap-1.5"><span className="text-warning">○</span>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                {assessment.limitations.length > 0 && (
                  <ul className="limits mt-3 space-y-0.5 text-sm text-ink-dim">
                    {assessment.limitations.map((item) => (
                      <li key={item} className="flex items-start gap-1.5"><span className="text-warning shrink-0">!</span>{item}</li>
                    ))}
                  </ul>
                )}
              </details>
            </motion.div>
          )}
        </div>

        <div className="actions flex flex-wrap gap-2 mt-6 pt-4 border-t border-glass-border">
          <Share assessment={assessment} />
          <button type="button" className="btn btn-ghost text-sm" onClick={() => setWatched(toggleWatch(assessment.origin).includes(assessment.origin))}>
            {watched ? 'Watching' : 'Watch origin'}
          </button>
          <button type="button" className="btn btn-ghost text-sm" onClick={() => download(assessment)}>
            Download case file
          </button>
          <button type="button" className="btn btn-ghost text-sm" onClick={() => window.print()}>
            Print report
          </button>
        </div>
      </motion.article>
    </motion.section>
  )
}

/* ── Animated score circle ── */

function ScoreCircle({ score, rule, same }: { score: number; rule: number; same: boolean }) {
  const r = 54
  const circ = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, score))
  const offset = circ - (clamped / 100) * circ
  const color = score >= 60 ? '#22c55e' : score >= 30 ? '#eab308' : '#ef4444'

  return (
    <motion.div
      className="scorecircle shrink-0"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <svg width="160" height="136" viewBox="0 0 160 136" className="drop-shadow-glow">
        {/* Background ring */}
        <circle cx="80" cy="68" r={r} fill="none" stroke="#222" strokeWidth="6" />
        {/* Foreground animated ring */}
        <motion.circle
          cx="80" cy="68" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
          transform="rotate(-90 80 68)"
        />
        <motion.text
          x="80" y="64" textAnchor="middle" fill="currentColor"
          className="text-2xl font-bold" fontSize="26" fontWeight="700"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.6 }}
        >
          {score}
        </motion.text>
        <text x="80" y="82" textAnchor="middle" fill="oklch(1 0 0 / 0.4)" className="text-[10px]" fontSize="10">
          Advisory
        </text>
      </svg>
      <p className="text-xs text-center mt-1 text-ink-dim">
        Rule {rule}
        {same ? ' · matches rules' : ' · adjusted'}
      </p>
    </motion.div>
  )
}

/* ── Sub-components ── */

function Share({ assessment }: { assessment: Assessment }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" className="btn btn-ghost text-sm" onClick={async () => {
      const note = cautionNote(assessment)
      try {
        await navigator.clipboard.writeText(note)
        setDone(true)
        window.setTimeout(() => setDone(false), 2000)
      } catch { window.prompt('Copy this caution', note) }
    }}>
      {done ? 'Copied' : 'Copy a caution for chat'}
    </button>
  )
}

function NameAnatomy({ host, registrable, origin }: { host: string; registrable: string; origin: string }) {
  const parts = splitHost(host, registrable)
  return (
    <section className="anatomy glass-panel p-4 my-3" aria-label="Which part of the name is registered">
      <p className="kicker text-xs font-semibold uppercase tracking-wider text-ink-dim mb-2">The name, taken apart</p>
      {parts.kind === 'ip' ? (
        <>
          <p className="anatomy-name text-lg font-mono">{host}</p>
          <p className="text-sm text-ink-muted mt-1">There is no domain name. This is a raw network address, which is easy to swap and hard to recognise.</p>
        </>
      ) : parts.prefix ? (
        <>
          <p className="anatomy-name text-lg font-mono">
            <span className="costume">{parts.prefix}</span>
            <span className="dot text-ink-dim">.</span>
            <span className="owner">{parts.owner}</span>
          </p>
          <p className="text-sm text-ink-muted mt-1">
            The marked part is the name that was registered. Everything in front of it was chosen by that registrant.
            {parts.prefix === 'www' ? ' A leading www is ordinary.' : ''} Checked as {origin}.
          </p>
          <p className="legend flex gap-4 mt-2 text-xs">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-accent" /> Registered domain</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-warning" /> Label in front</span>
          </p>
        </>
      ) : (
        <>
          <p className="anatomy-name text-lg font-mono">
            <span className="owner">{parts.owner}</span>
          </p>
          <p className="text-sm text-ink-muted mt-1">The whole name is the registered domain. There is no extra label in front of the owner. Checked as {origin}.</p>
          <p className="legend flex gap-4 mt-2 text-xs">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-accent" /> Registered domain</span>
          </p>
        </>
      )}
    </section>
  )
}

function FindingRow({ item }: { item: Finding }) {
  return (
    <motion.li
      className={`finding glass-panel p-3 flex gap-3 items-start ${item.severity}`}
      variants={slideIn}
    >
      <div className="weight shrink-0 text-center min-w-[48px]">
        <span className="text-sm font-bold block">
          {item.weight > 0 ? `+${item.weight}` : item.weight < 0 ? `−${Math.abs(item.weight)}` : 'Note'}
        </span>
        {item.rule && <small className="text-[10px] text-ink-dim uppercase tracking-wider">Rule</small>}
      </div>
      <div className="min-w-0">
        <p className="signal text-xs font-semibold uppercase tracking-wider text-ink-dim">{item.signal}</p>
        <h4 className="text-sm font-medium mt-0.5">{item.title}</h4>
        <p className="text-sm text-ink-muted mt-0.5">{item.detail}</p>
        {item.evidence && <p className="evidence text-xs text-ink-dim mt-1 font-mono">{item.evidence}</p>}
      </div>
    </motion.li>
  )
}

function Fact({ title, body }: { title: string; body: ReactNode }) {
  return (
    <section className="fact glass-panel p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-dim mb-2">{title}</h3>
      {body}
    </section>
  )
}

function CertBody({ cert }: { cert?: Certificate }) {
  if (!cert) return <p className="quiet text-sm text-ink-dim">No certificate result.</p>
  if (!cert.checked) return <p className="text-sm text-ink-dim">{cert.error === 'not contacted' ? 'The site was not contacted.' : cert.error || 'The handshake did not finish.'}</p>
  return (
    <dl className="text-sm space-y-1">
      <Dt>Result</Dt><Dd>{cert.valid ? 'Verifies' : 'Did not verify'}</Dd>
      {cert.issuer && <><Dt>Issuer</Dt><Dd>{cert.issuer}</Dd></>}
      {cert.subject && <><Dt>Subject</Dt><Dd>{cert.subject}</Dd></>}
      {cert.protocol && <><Dt>Protocol</Dt><Dd>{cert.protocol}{cert.cipher ? ` · ${cert.cipher}` : ''}</Dd></>}
      {cert.notBefore && <><Dt>Validity</Dt><Dd>{shortDate(cert.notBefore)} – {shortDate(cert.notAfter)} · {cert.daysLeft < 0 ? 'expired' : `${cert.daysLeft} days left`}</Dd></>}
      {cert.selfSigned && <><Dt>Self-signed</Dt><Dd>Yes</Dd></>}
      {cert.names && cert.names.length > 0 && <><Dt>Names</Dt><Dd>{cert.names.join(', ')}{cert.nameCount > cert.names.length ? ` · ${cert.nameCount - cert.names.length} more` : ''}</Dd></>}
      {!cert.valid && cert.error && <><Dt>Verifier</Dt><Dd>{cert.error}</Dd></>}
    </dl>
  )
}

function RegBody({ reg }: { reg?: Registration }) {
  if (!reg) return <p className="quiet text-sm text-ink-dim">No registry result.</p>
  if (!reg.found) return <p className="text-sm text-ink-dim">{reg.error || 'No registration record was available.'}</p>
  return (
    <dl className="text-sm space-y-1">
      {reg.registrar && <><Dt>Registrar</Dt><Dd>{reg.registrar}</Dd></>}
      {reg.age && <><Dt>Age</Dt><Dd>{reg.age}</Dd></>}
      {reg.registered && <><Dt>Registered</Dt><Dd>{shortDate(reg.registered)}</Dd></>}
      {reg.updated && <><Dt>Updated</Dt><Dd>{shortDate(reg.updated)}</Dd></>}
      {reg.expires && <><Dt>Expires</Dt><Dd>{shortDate(reg.expires)}</Dd></>}
      <Dt>DNSSEC</Dt><Dd>{reg.dnssecKnown ? (reg.dnssec ? 'Signed' : 'Not signed') : 'Not stated'}</Dd>
      {reg.statuses && reg.statuses.length > 0 && <><Dt>Status</Dt><Dd>{reg.statuses.join(', ')}</Dd></>}
      {reg.nameservers && reg.nameservers.length > 0 && <><Dt>NS</Dt><Dd>{reg.nameservers.join(', ')}</Dd></>}
    </dl>
  )
}

function DnsBody({ dns, connected }: { dns?: DNS; connected?: string }) {
  if (!dns) return <p className="quiet text-sm text-ink-dim">No DNS result.</p>
  if (dns.error && !(dns.addresses && dns.addresses.length)) return <p className="text-sm text-ink-dim">{dns.error}</p>
  return (
    <dl className="text-sm space-y-1">
      {connected && <><Dt>Connected to</Dt><Dd>{connected}</Dd></>}
      {dns.addresses && dns.addresses.length > 0 && <><Dt>Addresses</Dt><Dd>{dns.addresses.join(', ')}</Dd></>}
      {dns.nameservers && dns.nameservers.length > 0 && <><Dt>NS</Dt><Dd>{dns.nameservers.join(', ')}</Dd></>}
      {dns.mailServers && dns.mailServers.length > 0 && <><Dt>MX</Dt><Dd>{dns.mailServers.join(', ')}</Dd></>}
      {dns.pointers && dns.pointers.length > 0 && <><Dt>PTR</Dt><Dd>{dns.pointers.join(', ')}</Dd></>}
      {dns.text && dns.text.length > 0 && <><Dt>TXT</Dt><Dd>{dns.text.join(' · ')}</Dd></>}
      {dns.error && <><Dt>Note</Dt><Dd>{dns.error}</Dd></>}
    </dl>
  )
}

function PageBody({ page }: { page?: PageInfo }) {
  if (!page) return <p className="quiet text-sm text-ink-dim">No page result.</p>
  if (page.blockedRedirect) return <p className="text-sm text-ink-dim">A redirect toward {page.blockedRedirect} was refused.</p>
  if (page.error && page.error !== 'not contacted') return <p className="text-sm text-ink-dim">{page.error}</p>
  if (page.error === 'not contacted') return <p className="text-sm text-ink-dim">The page was not requested.</p>
  const headers = page.headers ? Object.entries(page.headers) : []
  return (
    <dl className="text-sm space-y-1">
      {page.finalOrigin && <><Dt>Final origin</Dt><Dd>{page.finalOrigin}</Dd></>}
      {page.title && <><Dt>Title</Dt><Dd>{page.title}</Dd></>}
      {page.hops.length > 0 && (
        <><Dt>Redirects</Dt><Dd>
          <span className="flex flex-col gap-0.5">{page.hops.map((hop) => (<span key={`${hop.status}-${hop.origin}`} className="text-xs">{hop.status} {hop.origin}</span>))}</span>
        </Dd></>
      )}
      <Dt>Headers</Dt>
      <Dd>{headers.length === 0
        ? 'No common security headers were observed. That is a note, not a score.'
        : <span className="flex flex-col gap-0.5">{headers.map(([k, v]) => (<span key={k} className="text-xs">{k}: {v}</span>))}</span>
      }</Dd>
    </dl>
  )
}

/* ── Helpers ── */

function Dt({ children }: { children: string }) {
  return <dt className="text-ink-dim text-[11px] font-semibold uppercase tracking-wider mt-1.5 first:mt-0">{children}</dt>
}
function Dd({ children }: { children: ReactNode }) {
  return <dd className="text-ink">{children}</dd>
}

function download(assessment: Assessment) {
  const blob = new Blob([JSON.stringify(assessment, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `websentinel-${assessment.hostname}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function formatWhen(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

function shortDate(iso?: string) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-GB', { dateStyle: 'medium' })
}