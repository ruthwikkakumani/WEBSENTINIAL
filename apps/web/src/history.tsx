/* ═══════════════════════════════════════════════════════════════
   WebSentinel Enterprise — Security Log / Case File History
   Forensics-inspired timeline of past URL assessments
   ═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { CaseWorkspace, BatchWorkspace } from './CaseWorkspace'
import { recheckOrigin } from './ScanPreview'
import {
  Clock,
  Search,
  Trash2,
  Filter,
  FileText,
  AlertTriangle,
  CheckCircle,
  Shield,
} from 'lucide-react'
import { clearHistory, fetchHistory } from './api'
import { recall, recallLine } from './historyRecall'
import { Report } from './report'
import type { Assessment } from './types'

/* ────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────── */

type RiskLevel = 'safe' | 'suspicious' | 'high-risk' | 'unknown'

type DateGroup = 'today' | 'yesterday' | 'older'

type FilterMode = 'all' | 'safe' | 'suspicious' | 'high-risk'

/* ────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────── */

function getDateGroup(date: Date): DateGroup {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86_400_000)
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (target.getTime() === today.getTime()) return 'today'
  if (target.getTime() === yesterday.getTime()) return 'yesterday'
  return 'older'
}

function dateGroupLabel(group: DateGroup): string {
  switch (group) {
    case 'today':
      return 'Today'
    case 'yesterday':
      return 'Yesterday'
    case 'older':
      return 'Older Records'
  }
}

function riskLevel(verdict: string): RiskLevel {
  if (verdict === 'safe') return 'safe'
  if (verdict === 'suspicious') return 'suspicious'
  if (verdict === 'high_risk' || verdict === 'high-risk') return 'high-risk'
  return 'unknown'
}

function riskColor(level: RiskLevel): string {
  switch (level) {
    case 'safe':
      return 'var(--safe)'
    case 'suspicious':
      return 'var(--warn)'
    case 'high-risk':
      return 'var(--risk)'
    case 'unknown':
      return 'var(--text-muted)'
  }
}

function riskBadgeClass(level: RiskLevel): string {
  switch (level) {
    case 'safe':
      return 'badge badge-safe'
    case 'suspicious':
      return 'badge badge-suspicious'
    case 'high-risk':
      return 'badge badge-high-risk'
    case 'unknown':
      return 'badge'
  }
}

function riskLabel(level: RiskLevel): string {
  switch (level) {
    case 'safe':
      return 'Low observed risk'
    case 'suspicious':
      return 'Suspicious'
    case 'high-risk':
      return 'High Risk'
    case 'unknown':
      return 'Unclassified'
  }
}

function scoreColor(score: number): string {
  if (score <= 2) return 'var(--safe)'
  if (score <= 5) return 'var(--warn)'
  return 'var(--risk)'
}

function signalTags(findings: Assessment['findings']): string[] {
  const tags: string[] = []
  const seen = new Set<string>()

  for (const f of findings) {
    if (f.weight !== 0 && !seen.has(f.signal)) {
      tags.push(f.signal)
      seen.add(f.signal)
      if (tags.length >= 3) break
    }
  }

  if (tags.length === 0) {
    const lower = findings.map((f) => f.signal.toLowerCase())
    if (lower.includes('certificate')) tags.push('Certificate')
    else if (lower.includes('domain') || lower.includes('registration')) tags.push('Registration')
    else if (lower.includes('redirect')) tags.push('Redirect')
    else if (lower.includes('dns')) tags.push('DNS')
  }

  return tags.length > 0 ? tags : ['Checked']
}

function truncate(url: string, max = 42): string {
  if (url.length <= max) return url
  return url.slice(0, max - 3) + '...'
}

function formatTimestamp(date: Date): string {
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)

  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/* ────────────────────────────────────────────────
   Animations
   ──────────────────────────────────────────────── */

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.05 },
  },
}

const cardVariants: Variants = {
  hidden: { opacity: 0, x: -24, scale: 0.97 },
  show: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    x: 24,
    scale: 0.97,
    transition: { duration: 0.2 },
  },
}

const sectionLabelVariants: Variants = {
  hidden: { opacity: 0, y: -6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
}

const panelVariants: Variants = {
  hidden: { opacity: 0, height: 0 },
  show: {
    opacity: 1,
    height: 'auto',
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: { duration: 0.2 },
  },
}

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
}

/* ────────────────────────────────────────────────
   Empty State Component
   ──────────────────────────────────────────────── */

function EmptyState() {
  return (
    <motion.div
      className="history-empty"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="empty-illustration">
        <div className="empty-shield">
          <Shield size={48} strokeWidth={1.2} />
        </div>
        <div className="empty-ring empty-ring-1" />
        <div className="empty-ring empty-ring-2" />
        <div className="empty-ring empty-ring-3" />
        <div className="empty-dots">
          {[...Array(5)].map((_, i) => (
            <span key={i} className="empty-dot" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
      <h2 className="empty-title gradient-text">No Case Files</h2>
      <p className="empty-lede">
        No origins have been assessed on this machine yet.
        <br />
        Run a check and it will appear here as a forensic record.
      </p>
      <div className="empty-hint">
        <span className="empty-hint-line" />
        <span className="empty-hint-text">All data stays on this device</span>
        <span className="empty-hint-line" />
      </div>
    </motion.div>
  )
}

/* ────────────────────────────────────────────────
   Filter Bar Component
   ──────────────────────────────────────────────── */

function FilterBar({
  query,
  onQueryChange,
  filterMode,
  onFilterChange,
  count,
  onClear,
  clearing,
}: {
  query: string
  onQueryChange: (v: string) => void
  filterMode: FilterMode
  onFilterChange: (v: FilterMode) => void
  count: number
  onClear: () => Promise<boolean>
  clearing: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const filters: { mode: FilterMode; label: string; icon: React.ReactNode }[] = [
    { mode: 'all', label: 'All', icon: <FileText size={12} /> },
    { mode: 'safe', label: 'Low observed risk', icon: <CheckCircle size={12} /> },
    { mode: 'suspicious', label: 'Suspicious', icon: <AlertTriangle size={12} /> },
    { mode: 'high-risk', label: 'High Risk', icon: <Shield size={12} /> },
  ]

  return (
    <motion.div
      className="history-controls"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="search-row">
        <div className="search-wrap">
          <Search size={15} className="search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Search by origin or domain…"
            aria-label="Search history by origin or domain"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              className="search-clear"
              onClick={() => {
                onQueryChange('')
                inputRef.current?.focus()
              }}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <div className="clear-btn-wrap">
          {confirming ? (
            <motion.div
              className="confirm-clear"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <span className="confirm-text">Permanently delete all {count} history records? Browser-local case notes are not deleted.</span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={clearing}
                onClick={async () => {
                  if (await onClear()) setConfirming(false)
                }}
              >
                {clearing ? 'Clearing…' : 'Confirm deletion'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={clearing}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </motion.div>
          ) : (
            <button
              type="button"
              className="btn btn-ghost clear-btn"
              disabled={clearing}
              onClick={() => setConfirming(true)}
            >
              <Trash2 size={14} />
              <span>Clear history</span>
            </button>
          )}
        </div>
      </div>

      <div className="filter-row">
        <Filter size={13} className="filter-icon-label" />
        <div className="filter-chips">
          {filters.map((f) => (
            <button
              key={f.mode}
              type="button"
              className={`filter-chip ${filterMode === f.mode ? 'active' : ''}`}
              onClick={() => onFilterChange(f.mode)}
              aria-pressed={filterMode === f.mode}
            >
              {f.icon}
              <span>{f.label}</span>
            </button>
          ))}
        </div>
        {count > 0 && (
          <span className="record-count">
            {count} case file{count !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN HISTORY PAGE COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export function HistoryPage() {
  const navigate = useNavigate()
  const loadingRef = useRef(false)
  const clearingRef = useRef(false)
  const mounted = useRef(true)
  const reportRef = useRef<HTMLDivElement>(null)
  const focusReport = useRef(false)
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [clearError, setClearError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [items, setItems] = useState<Assessment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')

  /* ── Load data ── */

  const load = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const history = await fetchHistory()
      if (mounted.current) setItems(history)
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'History could not be read.')
    } finally {
      loadingRef.current = false
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    void load()
    return () => { mounted.current = false }
  }, [load])

  useEffect(() => {
    if (focusReport.current && openId && reportRef.current) {
      reportRef.current.scrollIntoView({ block: 'start' })
      reportRef.current.focus({ preventScroll: true })
      focusReport.current = false
    }
  }, [openId, query, filterMode])

  async function handleClear(): Promise<boolean> {
    if (clearingRef.current || loadingRef.current) return false
    clearingRef.current = true
    setClearing(true)
    setClearError(null)
    try {
      await clearHistory()
      if (mounted.current) {
        setOpenId(null)
        setItems([])
        setQuery('')
        setFilterMode('all')
        setNotice('History cleared. Browser-local case notes were not deleted.')
        await load()
      }
      return true
    } catch (err) {
      if (mounted.current) setClearError(err instanceof Error ? err.message : 'History could not be cleared. Reload history to confirm its current state.')
      return false
    } finally {
      clearingRef.current = false
      if (mounted.current) setClearing(false)
    }
  }

  function handleRecheck(raw: string) {
    const origin = recheckOrigin({ origin: raw })
    if (origin) navigate('/', { state: { origin } })
    else setNotice('This record has no valid public origin to recheck. No request was sent.')
  }

  function openReport(item: Assessment) {
    focusReport.current = true
    setQuery('')
    setFilterMode('all')
    setOpenId(item.id)
    // Also focus when the requested report is already expanded.
    if (openId === item.id && reportRef.current) {
      reportRef.current.scrollIntoView({ block: 'start' })
      reportRef.current.focus({ preventScroll: true })
      focusReport.current = false
    }
  }

  /* ── Filter & group ── */

  const q = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!items) return null

    let result = items

    // Risk filter
    if (filterMode !== 'all') {
      result = result.filter((item) => riskLevel(item.verdict) === filterMode)
    }

    // Text search
    if (q) {
      result = result.filter(
        (item) =>
          item.hostname.toLowerCase().includes(q) ||
          item.origin.toLowerCase().includes(q) ||
          item.registrableDomain.toLowerCase().includes(q),
      )
    }

    return result
  }, [items, q, filterMode])

  const grouped = useMemo(() => {
    if (!filtered) return null

    const groups: { group: DateGroup; label: string; items: Assessment[] }[] = []

    const today: Assessment[] = []
    const yesterday: Assessment[] = []
    const older: Assessment[] = []

    for (const item of filtered) {
      const g = getDateGroup(new Date(item.assessedAt))
      if (g === 'today') today.push(item)
      else if (g === 'yesterday') yesterday.push(item)
      else older.push(item)
    }

    if (today.length) groups.push({ group: 'today', label: dateGroupLabel('today'), items: today })
    if (yesterday.length) groups.push({ group: 'yesterday', label: dateGroupLabel('yesterday'), items: yesterday })
    if (older.length) groups.push({ group: 'older', label: dateGroupLabel('older'), items: older })

    return groups
  }, [filtered])

  const selected = items?.find((item) => item.id === openId) ?? null
  const seen = selected && items ? recall(items, selected.origin) : null
  const line = seen ? recallLine(seen) : null

  const showEmpty = items && items.length === 0
  const showNoResults = filtered && filtered.length === 0 && items && items.length > 0

  return (
    <motion.section
      className="history-page"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* ── Page Header ── */}
      <motion.div
        className="history-header"
        variants={staggerItem}
        initial="hidden"
        animate="show"
      >
        <div className="history-header-content">
          <div className="history-eyebrow">
            <Shield size={12} className="eyebrow-icon" />
            <span>Forensic Log · Local Only</span>
          </div>
          <h1 className="history-title gradient-text">Security Log</h1>
          <p className="history-lede">
            Every origin you check becomes a case file — timestamped, scored, and kept on this
            machine. Search, filter, or review the forensic record of any past assessment.
          </p>
        </div>
        <div className="history-header-glow" />
      </motion.div>

      {/* ── Controls ── */}
      {items && items.length > 0 && (
        <FilterBar
          query={query}
          onQueryChange={setQuery}
          filterMode={filterMode}
          onFilterChange={setFilterMode}
          count={items.length}
          onClear={handleClear}
          clearing={clearing || loading}
        />
      )}

      {loading && <p role="status">{items ? 'Refreshing history…' : 'Loading history…'}</p>}
      {notice && <p role="status">{notice}</p>}
      {clearError && <div className="history-error" role="alert"><span>Clear failed: {clearError} Reload history to confirm the current records before retrying.</span><button type="button" className="btn btn-ghost btn-sm" disabled={loading || clearing} onClick={() => void load()}>Reload history</button></div>}

      {/* ── Error Banner ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="history-error"
            role="alert"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <AlertTriangle size={14} />
            <span>{error}{items ? ' Showing previously loaded records.' : ''}</span>
            <button type="button" className="btn btn-ghost btn-sm" disabled={loading || clearing} onClick={() => void load()}>Retry loading history</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Empty State ── */}
      {showEmpty && <EmptyState />}

      {/* ── No Results ── */}
      {showNoResults && (
        <motion.div
          className="history-no-results"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Search size={20} className="no-results-icon" />
          <p>
            No case files match <strong>"{query}"</strong> with the selected filter.
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setQuery('')
              setFilterMode('all')
            }}
          >
            Clear filters
          </button>
        </motion.div>
      )}

      {/* ── Timeline ── */}
      {grouped && grouped.length > 0 && (
        <div className="history-timeline">
          <div className="timeline-rail" aria-hidden="true" />

          {grouped.map((section) => (
            <motion.div
              key={section.group}
              className="timeline-section"
              variants={sectionLabelVariants}
              initial="hidden"
              animate="show"
            >
              <div className="timeline-section-label">
                <div className="section-label-line" />
                <span className="section-label-text">{section.label}</span>
                <span className="section-label-count">{section.items.length}</span>
                <div className="section-label-line" />
              </div>

              <motion.div
                className="timeline-cards"
                variants={containerVariants}
                initial="hidden"
                animate="show"
              >
                <AnimatePresence mode="popLayout">
                  {section.items.map((item) => {
                    const level = riskLevel(item.verdict)
                    const borderColor = riskColor(level)
                    const sc = scoreColor(item.ruleScore)
                    const tags = signalTags(item.findings)
                    const isOpen = openId === item.id

                    return (
                      <motion.div
                        key={item.id}
                        className="history-card-wrap"
                        variants={cardVariants}
                        layout
                        exit="exit"
                      >
                        <div
                          className={`history-card glass-panel ${isOpen ? 'card-open' : ''} ${item.verdict}`}
                          style={
                            {
                              '--card-border-color': borderColor,
                              '--card-score-color': sc,
                            } as React.CSSProperties
                          }
                        >
                          {/* Left accent border */}
                          <div className="card-accent" style={{ background: borderColor }} />

                          {/* Main clickable area */}
                          <button
                            type="button"
                            className="card-trigger"
                            aria-expanded={isOpen}
                            onClick={() => setOpenId(isOpen ? null : item.id)}
                          >
                            {/* Top row: timestamp + risk badge */}
                            <div className="card-header">
                              <div className="card-timestamp">
                                <Clock size={11} className="timestamp-icon" />
                                <span className="timestamp-text">
                                  {formatTimestamp(new Date(item.assessedAt))}
                                </span>
                                <span className="timestamp-full">
                                  {new Date(item.assessedAt).toLocaleString('en-GB', {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                  })}
                                </span>
                              </div>
                              <span className={riskBadgeClass(level)}>
                                {level === 'safe' && <CheckCircle size={10} />}
                                {level === 'suspicious' && <AlertTriangle size={10} />}
                                {level === 'high-risk' && <Shield size={10} />}
                                {riskLabel(level)}
                              </span>
                            </div>

                            {/* Middle: URL + Score */}
                            <div className="card-body">
                              <div className="card-url-section">
                                <span className="card-scheme">{item.scheme}://</span>
                                <span className="card-hostname">{item.hostname}</span>
                                {item.registrableDomain && (
                                  <span className="card-domain-tag">{item.registrableDomain}</span>
                                )}
                                <span className="card-url-full" title={item.origin}>
                                  {truncate(item.origin, 50)}
                                </span>
                              </div>
                              <div className="card-score-section">
                                <span className="card-score-value">{item.ruleScore}</span>
                                <span className="card-score-label">Rule points</span>
                              </div>
                            </div>

                            {/* Bottom: signal tags */}
                            <div className="card-footer">
                              <div className="card-tags">
                                {tags.map((tag) => (
                                  <span key={tag} className="card-tag">
                                    {tag}
                                  </span>
                                ))}
                                <span className="card-summary">{item.summary}</span>
                              </div>
                              <div
                                className={`card-expand-indicator ${isOpen ? 'expanded' : ''}`}
                                aria-hidden="true"
                              >
                                <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                                  <path
                                    d="M1 1L5 5L9 1"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </div>
                            </div>
                          </button>

                          {/* Expanded report panel */}
                          <AnimatePresence>
                            {isOpen && (
                              <motion.div
                                className="card-report"
                                ref={reportRef}
                                tabIndex={-1}
                                variants={panelVariants}
                                initial="hidden"
                                animate="show"
                                exit="exit"
                              >
                                <div className="card-report-inner">
                                  {line && (
                                    <div className="recall-banner">
                                      <Clock size={12} />
                                      <span>{line}</span>
                                    </div>
                                  )}
                                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleRecheck(item.origin)}>Recheck origin</button>
                                  <Report
                                    assessment={item}
                                    discarded={item.discardedPath}
                                  />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Card glow effect (decorative, behind card) */}
                        <div
                          className="card-glow"
                          style={{ '--glow-color': borderColor } as React.CSSProperties}
                        />
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Existing workspaces share the loaded history; the timeline filters remain independent. */}
      {items && <CaseWorkspace
        items={items}
        onOpen={openReport}
        onRecheck={handleRecheck}
        refresh={() => { if (!clearingRef.current) void load() }}
        notify={setNotice}
      />}
      <BatchWorkspace onComplete={() => void load()} notify={setNotice} />

      {/* ── Footer note ── */}
      {items && items.length > 0 && (
        <motion.div
          className="history-footer-note"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div className="footer-note-line" />
          <span className="footer-note-text">
            End of log · {items.length} case file{items.length !== 1 ? 's' : ''} on this device
          </span>
          <div className="footer-note-line" />
        </motion.div>
      )}
    </motion.section>
  )
}