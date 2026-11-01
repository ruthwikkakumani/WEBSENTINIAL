import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, RefreshCw, Search, Plus, X, GitCompareArrows, FolderOpen, Eye, ListChecks } from 'lucide-react'
import { assess } from './api'
import { prepare } from './origin'
import { listWatch, toggleWatch } from './watch'
import type { Assessment } from './types'
import { downloadCases, EMPTY_METADATA, latestForOrigin, normalizeMetadata, parseBatch, readCaseMetadata, riskLabel, riskTone, saveCaseMetadata } from './workspaceData'
import type { CaseMetadata, CaseStatus, ExportFormat } from './workspaceData'
import './CaseWorkspace.css'

export type CaseWorkspaceProps = { items: Assessment[]; onOpen: (a: Assessment) => void; onRecheck: (origin: string) => void; refresh: () => void; notify: (s: string) => void }
const statuses: CaseStatus[] = ['open', 'reviewed', 'escalated']
const dateLabel = (value: string) => Number.isNaN(Date.parse(value)) ? 'Date unavailable' : new Date(value).toLocaleString()
function Score({ item }: { item: Assessment }) {
  return <span className={`cw-score cw-score-${riskTone(item.advisoryScore)}`}><strong>{item.advisoryScore}</strong> {riskLabel(item.advisoryScore)}</span>
}
function CaseEditor({ item, metadata, save, onOpen, onRecheck }: { item: Assessment; metadata: CaseMetadata; save: (value: CaseMetadata) => void; onOpen: (a: Assessment) => void; onRecheck: (origin: string) => void }) {
  const id = useId()
  const [draft, setDraft] = useState(metadata)
  const [tags, setTags] = useState(metadata.tags.join(', '))
  useEffect(() => { setDraft(metadata); setTags(metadata.tags.join(', ')) }, [metadata])
  return <div className="cw-details">
    <div className="cw-evidence"><h3>Assessment details</h3><p>{item.summary}</p>
      <dl className="cw-facts"><div><dt>Assessed</dt><dd>{dateLabel(item.assessedAt)}</dd></div><div><dt>Rule score</dt><dd>{item.ruleScore}</dd></div><div><dt>Advisory score</dt><dd>{item.advisoryScore}</dd></div><div><dt>Registered domain</dt><dd>{item.registrableDomain || 'Unavailable'}</dd></div></dl>
      <h4>Findings ({item.findings?.length || 0})</h4><ul className="cw-findings">{item.findings?.map(f => <li key={f.id}><strong>{f.title}</strong><p>{f.detail}</p>{f.evidence && <code>{f.evidence}</code>}</li>)}</ul>
      {!item.findings?.length && <p className="cw-muted">No findings were reported. This does not establish safety.</p>}
      {item.notChecked?.length > 0 && <p className="cw-muted">Not checked: {item.notChecked.join(', ')}</p>}
      {item.limitations?.length > 0 && <ul className="cw-muted">{item.limitations.map((text, i) => <li key={i}>{text}</li>)}</ul>}
      <div className="cw-actions"><button type="button" onClick={() => onOpen(item)}>Open full report</button><button type="button" onClick={() => onRecheck(item.origin)}><RefreshCw size={14} aria-hidden="true" /> Recheck origin</button></div>
    </div>
    <form className="cw-editor" onSubmit={e => { e.preventDefault(); save(normalizeMetadata({ ...draft, tags: tags.split(',') })) }}>
      <h3>Local case notes</h3><p className="cw-muted">Saved only in this browser, not sent to the checker. Exports include your notes; avoid entering secrets.</p>
      <label htmlFor={`${id}-status`}>Review status</label><select id={`${id}-status`} value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as CaseStatus })}>{statuses.map(s => <option key={s} value={s}>{s}</option>)}</select>
      <label htmlFor={`${id}-tags`}>Tags <span className="cw-muted">(comma-separated, up to 12)</span></label><input id={`${id}-tags`} value={tags} maxLength={600} onChange={e => setTags(e.target.value)} />
      <label htmlFor={`${id}-notes`}>Analyst notes</label><textarea id={`${id}-notes`} rows={6} maxLength={8000} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} />
      <button type="submit" className="cw-primary">Save case notes</button>
    </form>
  </div>
}
export function CaseWorkspace({ items, onOpen, onRecheck, refresh, notify }: CaseWorkspaceProps) {
  const id = useId()
  const [metadata, setMetadata] = useState(readCaseMetadata)
  const [search, setSearch] = useState('')
  const [verdict, setVerdict] = useState('all')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState('')
  useEffect(() => { const sync = () => setMetadata(readCaseMetadata()); window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync) }, [])
  const filtered = useMemo(() => items.filter(a => {
    const m = normalizeMetadata(metadata[a.id])
    return (verdict === 'all' || riskTone(a.advisoryScore) === verdict) && (status === 'all' || m.status === status) &&
      [a.origin, a.id, a.summary, m.notes, ...m.tags].join(' ').toLowerCase().includes(search.toLowerCase().trim())
  }), [items, metadata, search, verdict, status])
  const compared = items.filter(item => selected.includes(item.id)).slice(0, 3)
  function select(item: Assessment) {
    if (selected.includes(item.id)) { setSelected(selected.filter(s => s !== item.id)); setError(''); return }
    if (selected.length >= 3) { setError('Compare up to three assessments. Remove one selection first.'); return }
    setSelected([...selected, item.id]); setError('')
  }
  function exportVisible(format: ExportFormat) {
    try { downloadCases(compared.length ? compared : filtered, metadata, format); notify(`Exported ${compared.length || filtered.length} cases. Notes are included.`) }
    catch { setError('Export could not be downloaded. Browser download access may be unavailable.') }
  }
  return <section className="cw-workspace" aria-labelledby={`${id}-title`}>
    <header className="cw-heading"><div><span className="cw-eyebrow"><FolderOpen size={14} aria-hidden="true" /> Investigation desk</span><h2 id={`${id}-title`}>Case workspace</h2><p className="cw-muted">Search assessments, record decisions, and compare evidence. Low scores do not establish safety.</p></div><button type="button" onClick={() => { setMetadata(readCaseMetadata()); refresh() }}><RefreshCw size={15} aria-hidden="true" /> Refresh cases</button></header>
    <div className="cw-toolbar"><div className="cw-search"><Search size={16} aria-hidden="true" /><label className="cw-sr" htmlFor={`${id}-search`}>Search cases, notes and tags</label><input id={`${id}-search`} placeholder="Search origins, notes, tags…" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <label>Signal band<select value={verdict} onChange={e => setVerdict(e.target.value)}><option value="all">All bands</option><option value="low">Low signals</option><option value="suspicious">Suspicious</option><option value="high">High risk</option></select></label>
      <label>Case status<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option>{statuses.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
    </div>
    <div className="cw-resultbar"><span>{filtered.length} {filtered.length === 1 ? 'case' : 'cases'} · {compared.length} selected</span><div className="cw-actions"><span className="cw-muted">Export {compared.length ? 'selected' : 'filtered'}:</span>{(['csv', 'json', 'text'] as const).map(format => <button key={format} type="button" disabled={!(compared.length || filtered.length)} onClick={() => exportVisible(format)}><ArrowDownToLine size={14} aria-hidden="true" />{format.toUpperCase()}</button>)}</div></div>
    {error && <p className="cw-error" role="alert">{error}</p>}
    {compared.length > 0 && <section className="cw-comparison" aria-label="Selected assessment comparison"><div className="cw-resultbar"><h3><GitCompareArrows size={16} aria-hidden="true" /> Side-by-side comparison</h3><button type="button" onClick={() => { setSelected([]); setError('') }}>Clear selection</button></div><div className="cw-comparegrid">{compared.map(a => <article className="cw-comparecard" key={a.id}><button className="cw-icon" type="button" aria-label={`Remove ${a.origin} from comparison`} onClick={() => select(a)}><X size={16} aria-hidden="true" /></button><h4>{a.origin}</h4><Score item={a} /><p className="cw-muted">{dateLabel(a.assessedAt)}</p><dl className="cw-facts"><div><dt>Rule points</dt><dd>{a.ruleScore}</dd></div><div><dt>Findings</dt><dd>{a.findings?.length || 0}</dd></div><div><dt>Status</dt><dd>{normalizeMetadata(metadata[a.id]).status}</dd></div><div><dt>TLS certificate</dt><dd>{a.certificate?.checked ? a.certificate.valid ? 'Valid at check time' : 'Not verified' : 'Not checked'}</dd></div></dl><p>{a.summary}</p><button type="button" onClick={() => onOpen(a)}>Open report</button></article>)}</div></section>}
    <div className="cw-caselist">{filtered.map(a => <article className="cw-case" key={a.id}><div className="cw-caserow"><label className="cw-select"><input type="checkbox" checked={selected.includes(a.id)} onChange={() => select(a)} aria-label={`Compare ${a.origin}, assessed ${dateLabel(a.assessedAt)}`} /></label><div className="cw-caseidentity"><strong>{a.origin}</strong><span>{dateLabel(a.assessedAt)} · {normalizeMetadata(metadata[a.id]).status}</span></div><Score item={a} /></div><details><summary>Details & case notes</summary><CaseEditor item={a} metadata={metadata[a.id] || EMPTY_METADATA} save={value => { try { setMetadata(saveCaseMetadata(a.id, value)); setError(''); notify('Case notes saved in this browser.') } catch (e) { setError(e instanceof Error ? e.message : 'Notes could not be saved.') } }} onOpen={onOpen} onRecheck={onRecheck} /></details></article>)}</div>
    {!filtered.length && <div className="cw-empty"><FolderOpen size={30} aria-hidden="true" /><h3>{items.length ? 'No matching cases' : 'No assessments yet'}</h3><p>{items.length ? 'Change your search or filters to find a case.' : 'Run a website assessment or a batch to start your investigation.'}</p></div>}
  </section>
}

export type WatchWorkspaceProps = { items: Assessment[]; onRecheck: (origin: string) => void; notify: (s: string) => void }
export function WatchWorkspace({ items, onRecheck, notify }: WatchWorkspaceProps) {
  const id = useId()
  const [origins, setOrigins] = useState(listWatch)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { const sync = () => setOrigins(listWatch()); window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync) }, [])
  function add() {
    try {
      const prepared = prepare(input)
      const current = listWatch()
      if (current.includes(prepared.url)) { setError('This origin is already on your watchlist.'); return }
      if (current.length >= 40) { setError('Watchlist limit is 40 origins. Remove one before adding another.'); return }
      setOrigins(toggleWatch(prepared.url)); setInput(''); setError(''); notify(prepared.discarded ? 'Origin added. Path, query and fragment were discarded.' : 'Origin added to this browser’s watchlist.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add that origin.') }
  }
  return <section className="cw-workspace" aria-labelledby={`${id}-title`}><header className="cw-heading"><div><span className="cw-eyebrow"><Eye size={14} aria-hidden="true" /> Manual observation</span><h2 id={`${id}-title`}>Origin watchlist</h2><p className="cw-muted">Local saved origins, not automatic background monitoring. Recheck explicitly to collect fresh evidence.</p></div><button type="button" onClick={() => setOrigins(listWatch())}><RefreshCw size={14} aria-hidden="true" /> Refresh watchlist</button></header>
    <form className="cw-addform" onSubmit={e => { e.preventDefault(); add() }}><label htmlFor={`${id}-origin`}>Website to watch</label><div className="cw-inputrow"><input id={`${id}-origin`} type="text" placeholder="example.com" maxLength={2000} value={input} onChange={e => setInput(e.target.value)} aria-describedby={error ? `${id}-error` : undefined} /><button type="submit" className="cw-primary"><Plus size={15} aria-hidden="true" />Add origin</button></div></form>
    {error && <p id={`${id}-error`} className="cw-error" role="alert">{error}</p>}
    <div className="cw-watchgrid">{origins.map(origin => { const [latest, previous] = latestForOrigin(items, origin); const delta = latest && previous ? latest.advisoryScore - previous.advisoryScore : null; return <article className="cw-watchcard" key={origin}><h3>{origin}</h3>{latest ? <><Score item={latest} /><p className="cw-muted">Last assessed {dateLabel(latest.assessedAt)}</p><p className="cw-delta">{delta === null ? 'No previous assessment to compare.' : delta === 0 ? 'No score change from previous assessment.' : `${delta > 0 ? '+' : ''}${delta} advisory points from previous assessment.`}</p><p>{latest.summary}</p></> : <p className="cw-muted">Not assessed in the loaded history. Run a manual check.</p>}<div className="cw-actions"><button type="button" onClick={() => onRecheck(origin)}><RefreshCw size={14} aria-hidden="true" />Recheck</button><button type="button" aria-label={`Remove ${origin} from watchlist`} onClick={() => { if (listWatch().includes(origin)) setOrigins(toggleWatch(origin)); else setOrigins(listWatch()); notify('Origin removed from watchlist.') }}><X size={14} aria-hidden="true" />Remove</button></div></article> })}</div>
    {!origins.length && <div className="cw-empty"><Eye size={30} aria-hidden="true" /><h3>No watched origins</h3><p>Add a public website origin to revisit its assessments here.</p></div>}
  </section>
}

export type BatchWorkspaceProps = { onComplete: () => void; notify: (s: string) => void }
type BatchRow = { origin: string; state: 'queued' | 'checking' | 'complete' | 'error' | 'cancelled'; assessment?: Assessment; error?: string }
export function BatchWorkspace({ onComplete, notify }: BatchWorkspaceProps) {
  const id = useId()
  const [input, setInput] = useState('')
  const parsed = useMemo(() => parseBatch(input), [input])
  const [rows, setRows] = useState<BatchRow[]>([])
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState('')
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort() } }, [])
  async function run() {
    if (controller.current || !parsed.entries.length || parsed.errors.length) return
    const abort = new AbortController(); controller.current = abort
    const next: BatchRow[] = parsed.entries.map(entry => ({ origin: entry.origin, state: 'queued' }))
    setRows([...next]); setRunning(true); setMessage('Checking origins sequentially…'); setInput(parsed.entries.map(entry => entry.origin).join('\n'))
    let completed = 0
    let failed = 0
    try {
      for (let i = 0; i < next.length; i++) {
        if (abort.signal.aborted) break
        next[i] = { ...next[i], state: 'checking' }; if (mounted.current) setRows([...next])
        try {
          const result = await assess(next[i].origin, abort.signal)
          if (abort.signal.aborted) break
          next[i] = { ...next[i], state: 'complete', assessment: result }; completed++
        } catch (error) {
          if (abort.signal.aborted) break
          next[i] = { ...next[i], state: 'error', error: error instanceof Error ? error.message : 'Assessment could not be completed.' }; failed++
        }
        if (mounted.current) setRows([...next])
      }
    } finally {
      for (let i = 0; i < next.length; i++) if (next[i].state === 'queued' || next[i].state === 'checking') next[i] = { ...next[i], state: 'cancelled' }
      controller.current = null
      if (mounted.current) {
        setRows([...next]); setRunning(false)
        const text = `${abort.signal.aborted ? 'Batch cancelled' : 'Batch finished'}: ${completed} completed, ${failed} failed${abort.signal.aborted ? `, ${next.filter(row => row.state === 'cancelled').length} cancelled` : ''}.`
        setMessage(text); notify(text); onComplete()
      }
    }
  }
  return <section className="cw-workspace" aria-labelledby={`${id}-title`}><header className="cw-heading"><div><span className="cw-eyebrow"><ListChecks size={14} aria-hidden="true" /> Bounded, origin-only checks</span><h2 id={`${id}-title`}>Batch assessment</h2><p className="cw-muted">Up to 10 distinct origins, one address per line. Checks run sequentially against the real checker; no synthetic results.</p></div></header>
    <form onSubmit={e => { e.preventDefault(); void run() }} className="cw-batchform"><label htmlFor={`${id}-batch`}>Website addresses</label><textarea id={`${id}-batch`} rows={7} maxLength={20000} disabled={running} placeholder={'example.com\nhttps://another.example'} value={input} onChange={e => setInput(e.target.value)} aria-invalid={parsed.errors.length > 0} aria-describedby={`${id}-help ${id}-errors`} /><p id={`${id}-help`} className="cw-muted">Only origins are sent. Paths, query strings and fragments are discarded; embedded credentials and private addresses are rejected.</p>
      <div id={`${id}-errors`}>{parsed.errors.length > 0 && <ul className="cw-error" role="alert">{parsed.errors.map((error, i) => <li key={i}>{error.line > 0 ? `Line ${error.line}: ` : ''}{error.message}</li>)}</ul>}</div>
      <div className="cw-resultbar"><span>{parsed.entries.length}/10 origins{parsed.duplicates > 0 ? ` · ${parsed.duplicates} duplicate lines ignored` : ''}</span><div className="cw-actions"><button className="cw-primary" type="submit" disabled={running || !parsed.entries.length || parsed.errors.length > 0}><ListChecks size={15} aria-hidden="true" />Run batch</button>{running && <button type="button" onClick={() => { controller.current?.abort(); setMessage('Cancellation requested. Completed assessments remain in history.') }}>Cancel batch</button>}</div></div>
    </form>
    {!running && parsed.entries.length > 0 && <div className="cw-preview"><h3>Origin-only preview</h3><ul>{parsed.entries.map(entry => <li key={entry.origin}><code>{entry.origin}</code>{entry.discarded && <span className="cw-muted"> · extra URL data discarded</span>}</li>)}</ul></div>}
    <p className="cw-live" role="status" aria-live="polite">{message}</p>
    {rows.length > 0 && <ol className="cw-batchrows" aria-label="Batch progress">{rows.map(row => <li key={row.origin}><div className="cw-batchrow"><strong>{row.origin}</strong><span className={`cw-state cw-state-${row.state}`}>{row.state}</span>{row.assessment && <Score item={row.assessment} />}</div>{row.error && <p className="cw-error">{row.error}</p>}{row.assessment && <p className="cw-muted">{row.assessment.summary}</p>}</li>)}</ol>}
    {!rows.length && !input && <div className="cw-empty"><ListChecks size={30} aria-hidden="true" /><h3>Build a small assessment queue</h3><p>Paste public website addresses above, review their sanitized origins, then run.</p></div>}
  </section>
}
