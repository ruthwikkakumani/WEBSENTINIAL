import { useState, useMemo, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import {
  GitCompare,
  Plus,
  Trash2,
  AlertTriangle,
  Globe,
  Shield,
  ShieldAlert,
  ArrowUpDown,
  BarChart3,
  Search,
  X,
  Zap,
  Network,
  Activity,
} from 'lucide-react'
import { assess, CheckError } from './api'
import { PrepareError } from './origin'
import type { Assessment } from './types'
import { MIN_URLS, MAX_URLS, prepareComparison, riskPresentation, verdictPresentation, classifyFinding, signalSummary, categoryCoverage, comparisonResults, type SignalCategoryId, type ComparisonOutcome } from './comparison'

/* ──────────────────────────────────────────────────────────────
   Variants (shared staggered system)
   ────────────────────────────────────────────────────────────── */

const container: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

const slideUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
}

const fadeIn: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
}

/* ──────────────────────────────────────────────────────────────
   Signal categories for the threat matrix
   ────────────────────────────────────────────────────────────── */

type SignalCategory = {
  id: SignalCategoryId
  label: string
  icon: ReactNode
}

const SIGNAL_CATEGORIES: SignalCategory[] = [
  { id: 'identity', label: 'Origin & Certificate', icon: <Shield size={14} /> },
  { id: 'network', label: 'Network & DNS', icon: <Network size={14} /> },
  { id: 'reputation', label: 'Registry Record', icon: <Globe size={14} /> },
  { id: 'content', label: 'Headers & Redirects', icon: <Activity size={14} /> },
  { id: 'other', label: 'Other Observations', icon: <Activity size={14} /> },
]

/* ──────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────── */

const gaugeColor = (score: number) => riskPresentation(score).color
const gaugeLabel = (score: number) => riskPresentation(score).label

function formatWhen(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

/* ──────────────────────────────────────────────────────────────
   Empty state — animated CSS illustration
   ────────────────────────────────────────────────────────────── */

function EmptyState() {
  return (
    <motion.div
      className="compare-empty-state"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="empty-illustration">
        {/* Rotating orbit rings (CSS animation) */}
        <div className="orbit-ring ring-outer" />
        <div className="orbit-ring ring-inner" />
        <div className="orbit-core">
          <ShieldAlert size={28} className="orbit-shield" />
        </div>
        {/* Dots on orbits */}
        <div className="orbit-dot dot-1" />
        <div className="orbit-dot dot-2" />
        <div className="orbit-dot dot-3" />
      </div>
      <h3 className="gradient-text" style={{ fontSize: '1.35rem', fontWeight: 700, marginTop: '1.5rem' }}>
        Threat Matrix Empty
      </h3>
      <p className="section-subtitle" style={{ textAlign: 'center', margin: '0.5rem auto 0' }}>
        Add two or more URLs below to compare their security posture side by side.
      </p>
      <div className="empty-hints">
        <span className="badge">
          <Plus size={12} /> Add URL
        </span>
        <span className="badge">
          <GitCompare size={12} /> Compare
        </span>
        <span className="badge">
          <BarChart3 size={12} /> Review Differences
        </span>
      </div>
    </motion.div>
  )
}

/* ──────────────────────────────────────────────────────────────
   Animated Circular Gauge
   ────────────────────────────────────────────────────────────── */

function CircularGauge({ score, size = 120 }: { score: number; size?: number }) {
  const clamped = Math.max(0, Math.min(100, score))
  const strokeWidth = size * 0.075
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clamped / 100) * circumference
  const color = gaugeColor(clamped)
  const center = size / 2
  const fontSize = size * 0.22

  return (
    <div className="circular-gauge" style={{ width: size, height: size, position: 'relative' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(124,138,255,0.06)"
          strokeWidth={strokeWidth}
        />
        {/* Animated arc */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference, opacity: 0 }}
          animate={{ strokeDashoffset: offset, opacity: 1 }}
          transition={{ duration: 1, delay: 0.25, ease: 'easeOut' }}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ filter: `drop-shadow(0 0 8px ${color}40)` }}
        />
        {/* Glow ring */}
        <circle
          cx={center}
          cy={center}
          r={radius * 0.85}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth * 0.3}
          opacity={0.08}
        />
        {/* Score number */}
        <motion.text
          x={center}
          y={center - fontSize * 0.08}
          textAnchor="middle"
          fill={color}
          fontSize={fontSize}
          fontWeight="700"
          fontFamily="'Inter', sans-serif"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.3 }}
        >
          {clamped}
        </motion.text>
        <motion.text
          x={center}
          y={center + fontSize * 0.65}
          textAnchor="middle"
          fill="oklch(1 0 0 / 0.35)"
          fontSize={fontSize * 0.38}
          fontWeight="500"
          fontFamily="'Inter', sans-serif"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55, duration: 0.3 }}
        >
          ADVISORY RISK
        </motion.text>
      </svg>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
   Comparison Card
   ────────────────────────────────────────────────────────────── */

function ComparisonCard({ assessment, index }: { assessment: Assessment; index: number }) {
  const { label: riskLabel, className: riskClass } = verdictPresentation(assessment.verdict, assessment.advisoryScore)
  const { ruleWeight, observationWeight, signalCount, categories } = signalSummary(assessment.findings)
  const scoredFindings = assessment.findings.filter((f) => f.weight !== 0)

  return (
    <motion.div
      className="glass-panel compare-card"
      variants={fadeIn}
      transition={{ delay: 0.05 * index }}
    >
      {/* Card header */}
      <div className="compare-card-header">
        <div className="compare-card-meta">
          <span className={`verdict-badge ${riskClass}`}>
            <AlertTriangle size={12} />
            {riskLabel}
          </span>
          <span className="card-index">#{index + 1}</span>
        </div>
        <div className="compare-card-origin" title={assessment.origin}>
          <Globe size={13} className="origin-icon" />
          <span className="origin-text">{assessment.origin}</span>
        </div>
      </div>

      {/* Gauge */}
      <div className="compare-card-gauge">
        <CircularGauge score={assessment.advisoryScore} size={110} />
        <div className="gauge-legend">
          <span className="gauge-rule" style={{ color: gaugeColor(assessment.ruleScore) }}>
            Rule {assessment.ruleScore}
          </span>
          <span className="gauge-label">{gaugeLabel(assessment.advisoryScore)}</span>
          <span className="gauge-time">{formatWhen(assessment.assessedAt)}</span>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="compare-card-metrics">
        <div className="metric-tile">
          <span className="metric-value" style={{ color: gaugeColor(assessment.ruleScore) }}>
            {ruleWeight > 0 ? `+${ruleWeight}` : ruleWeight}
          </span>
          <span className="metric-label">Documented rule points</span>
        </div>
        <div className="metric-tile">
          <span className="metric-value text-ink">{observationWeight > 0 ? `+${observationWeight}` : observationWeight}</span>
          <span className="metric-label">Extra observation points</span>
        </div>
        <div className="metric-tile">
          <span className="metric-value text-ink">{categories}</span>
          <span className="metric-label">Categories</span>
        </div>
      </div>

      {/* Findings threat matrix */}
      <div className="compare-card-findings">
        <p className="findings-title">Key Signals · {signalCount} scored</p>
        {scoredFindings.length === 0 ? (
          <p className="findings-none">No scored signals.</p>
        ) : (
          <div className="findings-list">
            {scoredFindings.slice(0, 4).map((finding) => (
              <div key={finding.id} className={`finding-row severity-${finding.severity}`}>
                <div className="finding-indicator" />
                <span className="finding-severity">
                  {finding.weight > 0 ? `+${finding.weight}` : `−${Math.abs(finding.weight)}`}
                </span>
                <span className="finding-name" title={`${finding.title}: ${finding.detail}`}>{finding.signal} · {finding.rule ? 'Rule' : 'Extra'}</span>
              </div>
            ))}
            {scoredFindings.length > 4 && (
              <p className="findings-more">+{scoredFindings.length - 4} more</p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ──────────────────────────────────────────────────────────────
   Differences Summary Panel
   ────────────────────────────────────────────────────────────── */

function DifferencesPanel({ assessments }: { assessments: Assessment[] }) {
  const diffs = useMemo(() => {
    if (assessments.length < 2) return null

    const result: {
      field: string
      values: (string | number)[]
      significant: boolean
    }[] = []

    // Score difference
    const scores = assessments.map((a) => a.advisoryScore)
    const maxDiff = Math.max(...scores) - Math.min(...scores)
    if (maxDiff > 0) {
      result.push({
        field: 'Advisory Score',
        values: scores,
        significant: maxDiff >= 25,
      })
    }

    // Verdict difference
    const verdicts = assessments.map((a) => verdictPresentation(a.verdict, a.advisoryScore).label)
    if (new Set(verdicts).size > 1) {
      result.push({
        field: 'Verdict',
        values: verdicts,
        significant: true,
      })
    }

    // Origin difference
    const origins = assessments.map((a) => a.origin)
    if (new Set(origins).size > 1) {
      result.push({
        field: 'Origin',
        values: origins,
        significant: false,
      })
    }

    // Rule score difference
    const ruleScores = assessments.map((a) => a.ruleScore)
    if (new Set(ruleScores).size > 1) {
      result.push({
        field: 'Rule Score',
        values: ruleScores,
        significant: Math.max(...ruleScores) - Math.min(...ruleScores) >= 20,
      })
    }

    // Finding count difference
    const findCounts = assessments.map((a) => a.findings.filter((f) => f.weight !== 0).length)
    if (new Set(findCounts).size > 1) {
      result.push({
        field: 'Active Signals',
        values: findCounts,
        significant: true,
      })
    }

    // Severity distribution
    const verdictKinds = assessments.map((a) => a.verdict)
    if (new Set(verdictKinds).size > 1) {
      result.push({
        field: 'Risk Level',
        values: assessments.map((a) => verdictPresentation(a.verdict, a.advisoryScore).label),
        significant: true,
      })
    }

    return result
  }, [assessments])

  if (!diffs || diffs.length === 0) return null

  return (
    <motion.div
      className="glass-panel differences-panel"
      variants={slideUp}
    >
      <div className="differences-header">
        <ArrowUpDown size={16} />
        <span>Differences Summary</span>
        <span className="differences-count">{diffs.length} diff{diffs.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="differences-grid">
        {diffs.map((diff) => (
          <div key={diff.field} className={`diff-row ${diff.significant ? 'significant' : ''}`}>
            <span className="diff-field">{diff.field}</span>
            <div className="diff-values">
              {diff.values.map((val, i) => (
                <span key={i} className="diff-value">
                  <span className="diff-index">{i + 1}</span>
                  {String(val)}
                </span>
              ))}
            </div>
            {diff.significant && (
              <span className="diff-badge">Notable</span>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  )
}

/* ──────────────────────────────────────────────────────────────
   Main Compare Component
   ────────────────────────────────────────────────────────────── */

export function Compare() {
  const [urlInputs, setUrlInputs] = useState<string[]>(['', ''])
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasCompared, setHasCompared] = useState(false)
  const [failures, setFailures] = useState<{ origin: string; error: string }[]>([])
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => {
    const controller = controllerRef.current
    controllerRef.current = null
    controller?.abort()
  }, [])

  const cancelCompare = useCallback(() => controllerRef.current?.abort(), [])

  const updateUrl = useCallback((index: number, value: string) => {
    setUrlInputs((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }, [])

  const addUrlInput = useCallback(() => {
    setUrlInputs((prev) => (prev.length < MAX_URLS ? [...prev, ''] : prev))
  }, [])

  const removeUrlInput = useCallback((index: number) => {
    setUrlInputs((prev) => (prev.length > MIN_URLS ? prev.filter((_, i) => i !== index) : prev))
  }, [])

  const runCompare = useCallback(async () => {
    if (controllerRef.current) return
    let prepared: ReturnType<typeof prepareComparison>
    try {
      prepared = prepareComparison(urlInputs)
    } catch (err) {
      setError(err instanceof PrepareError ? err.message : 'Enter two to four public origins.')
      return
    }
    const controller = new AbortController()
    controllerRef.current = controller
    setBusy(true)
    setError(null)
    setAssessments([])
    setFailures([])
    setHasCompared(true)
    setUrlInputs(prepared.origins)
    const outcomes: (ComparisonOutcome | undefined)[] = prepared.origins.map(() => undefined)
    const publish = () => {
      if (controllerRef.current !== controller) return
      const result = comparisonResults(prepared.origins, outcomes.filter((item): item is ComparisonOutcome => item !== undefined))
      setAssessments(result.assessments)
      setFailures(result.failures.map(item => ({ origin: item.origin, error: item.message })))
    }
    try {
      await Promise.all(prepared.origins.map(async (origin, index) => {
        try {
          const assessment = await assess(origin, controller.signal)
          outcomes[index] = { origin, status: 'fulfilled', assessment }
        } catch (err) {
          outcomes[index] = {
            origin,
            status: 'rejected',
            message: controller.signal.aborted ? 'Cancelled — this origin was not fully checked.'
              : err instanceof CheckError ? err.message : 'This origin could not be checked.',
          }
        }
        publish()
      }))
    } finally {
      if (controllerRef.current === controller) {
        publish()
        controllerRef.current = null
        setBusy(false)
        if (controller.signal.aborted) setError('Comparison cancelled. Completed results have been kept.')
      }
    }
  }, [urlInputs])

  const clearAll = useCallback(() => {
    const controller = controllerRef.current
    controllerRef.current = null
    controller?.abort()
    setBusy(false)
    setAssessments([])
    setFailures([])
    setHasCompared(false)
    setError(null)
  }, [])

  const validCount = urlInputs.filter((u) => u.trim().length > 0).length

  return (
    <motion.section
      className="compare-page"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* ── Header ── */}
      <motion.div className="compare-page-header" variants={slideUp}>
        <div className="compare-eyebrow">
          <GitCompare size={16} />
          <span>Security Comparison</span>
        </div>
        <h1 className="section-title gradient-text" style={{ marginBottom: '0.5rem' }}>
          Threat Matrix
        </h1>
        <p className="section-subtitle">
          Compare security postures across multiple URLs. Identify diverging risk signals and make informed decisions.
        </p>
      </motion.div>

      {/* ── Input Section (left-aligned split feel) ── */}
      <motion.div className="compare-input-section" variants={slideUp}>
        <div className="glass-panel compare-input-panel">
          <div className="input-panel-header">
            <div className="input-panel-title">
              <Search size={14} />
              <span>URL Targets</span>
            </div>
            <div className="input-panel-actions">
              {assessments.length > 0 && (
                <button type="button" className="btn btn-ghost" onClick={clearAll} style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}>
                  <X size={12} /> Clear
                </button>
              )}
              {urlInputs.length < MAX_URLS && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={addUrlInput}
                  disabled={busy}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                >
                  <Plus size={12} /> Add
                </button>
              )}
            </div>
          </div>

          <div className="compare-url-list">
            {urlInputs.map((url, i) => (
              <motion.div
                key={`input-${i}`}
                className="compare-url-row"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <span className="url-index">{i + 1}</span>
                <input
                  className="input"
                  value={url}
                  disabled={busy}
                  aria-label={`URL ${i + 1}`}
                  autoComplete="off"
                  onChange={(e) => updateUrl(i, e.target.value)}
                  placeholder={`https://example${i + 1}.com`}
                  spellCheck={false}
                />
                {urlInputs.length > MIN_URLS && (
                  <button
                    type="button"
                    className="btn btn-ghost url-remove"
                    onClick={() => removeUrlInput(i)}
                    disabled={busy}
                    aria-label={`Remove URL ${i + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </motion.div>
            ))}
          </div>

          <div className="compare-input-footer">
            <span className="url-count">
              {validCount} of {urlInputs.length} filled · Only origins are sent
            </span>
            {busy && <button type="button" className="btn btn-ghost" onClick={cancelCompare}>Cancel comparison</button>}
            <button
              type="button"
              className="btn btn-primary btn-lg"
              disabled={busy || validCount < MIN_URLS}
              onClick={runCompare}
            >
              {busy ? (
                <>
                  <motion.div
                    style={{ display: 'inline-flex' }}
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  >
                    <Zap size={16} />
                  </motion.div>
                  Scanning…
                </>
              ) : (
                <>
                  <GitCompare size={16} />
                  Compare Now
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── Error Banner ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="compare-error-banner"
            initial={{ opacity: 0, y: -12, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -12, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <AlertTriangle size={14} />
            <span>{error}</span>
            <button type="button" className="btn btn-ghost" onClick={() => setError(null)} style={{ padding: '0.2rem 0.5rem', marginLeft: 'auto' }}>
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {failures.length > 0 && (
        <div className="glass-panel" role="status" aria-live="polite" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <h3>Origins not completed</h3>
          <ul>{failures.map((failure) => <li key={failure.origin}><strong>{failure.origin}</strong>: {failure.error}</li>)}</ul>
        </div>
      )}

      {/* ── Results Section ── */}
      <AnimatePresence mode="wait">
        {!hasCompared || assessments.length === 0 ? (
          hasCompared ? (
            <div key="waiting" className="glass-panel" role="status" style={{ padding: '1.5rem' }}>
              {busy ? 'Checking origins… completed results will appear here.' : 'No completed assessments. Review the origin errors above and retry.'}
            </div>
          ) : <EmptyState key="empty" />
        ) : (
          <motion.div
            key="results"
            className="compare-results-section"
            variants={container}
            initial="hidden"
            animate="show"
          >
            {/* Results toolbar */}
            <motion.div className="compare-results-toolbar" variants={slideUp}>
              <div className="toolbar-left">
                <Shield size={14} />
                <span>
                  Completed <strong>{assessments.length}</strong> URL{assessments.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="toolbar-right">
                <button type="button" className="btn btn-ghost" onClick={clearAll} style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}>
                  <X size={12} /> New Comparison
                </button>
              </div>
            </motion.div>

            {/* Comparison cards grid */}
            <motion.div
              className="compare-cards-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
                gap: '1.25rem',
              }}
              variants={container}
              initial="hidden"
              animate="show"
            >
              {assessments.map((assessment, i) => (
                <ComparisonCard key={assessment.id} assessment={assessment} index={i} />
              ))}
            </motion.div>

            {/* Differences Summary */}
            <DifferencesPanel assessments={assessments} />

            {/* Threat Matrix: detailed signal comparison */}
            <motion.div className="glass-panel threat-matrix-panel" variants={slideUp}>
              <div className="threat-matrix-header">
                <BarChart3 size={16} />
                <span>Signal Comparison Matrix</span>
              </div>

              <div className="threat-matrix-scroll">
                <table className="threat-matrix-table">
                  <thead>
                    <tr>
                      <th className="matrix-signal-header">Signal</th>
                      {assessments.map((a, i) => (
                        <th key={a.id} className="matrix-assessment-header">
                          <span className="matrix-url-label" title={a.origin}>
                            URL {i + 1}
                          </span>
                          <span className={`matrix-verdict ${verdictPresentation(a.verdict, a.advisoryScore).className}`}>
                            {a.advisoryScore}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SIGNAL_CATEGORIES.map((cat) => {
                      const catFindings = assessments.map((a) =>
                        a.findings
                          .filter((f) => f.weight !== 0 && classifyFinding(f) === cat.id)
                          .sort((x, y) => Math.abs(y.weight) - Math.abs(x.weight))
                      )
                      return (
                        <tr key={cat.id}>
                          <td className="matrix-category-cell">
                            <span className="matrix-category-icon">{cat.icon}</span>
                            <span className="matrix-category-label">{cat.label}</span>
                          </td>
                          {catFindings.map((findings, i) => (
                            <td key={i} className="matrix-data-cell">
                              <span className="matrix-none" title={categoryCoverage(assessments[i], cat.id).checked.join(', ') || 'No completed collector reported in this category'}>
                                {categoryCoverage(assessments[i], cat.id).label}
                              </span>
                              {findings.length === 0 ? (
                                <span className="matrix-none"> · No scored observations</span>
                              ) : (
                                <div className="matrix-findings-stack">
                                  {findings.slice(0, 3).map((f) => (
                                    <span
                                      key={f.id}
                                      className={`matrix-finding-chip severity-${f.severity}`}
                                      title={`${f.title}: ${f.detail}`}
                                    >
                                      <span className="matrix-chip-weight">
                                        {f.weight > 0 ? `+${f.weight}` : `−${Math.abs(f.weight)}`}
                                      </span>
                                      <span className="matrix-chip-name">{f.signal} · {f.rule ? 'Rule' : 'Extra'}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                    <tr>
                      <td className="matrix-category-cell">Not assessed</td>
                      {assessments.map((a) => <td key={a.id} className="matrix-data-cell">{a.notChecked.length ? a.notChecked.join('; ') : 'Not reported'}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
            </motion.div>

            {/* Assessment summaries */}
            <motion.div className="compare-summaries" variants={slideUp}>
              {assessments.map((assessment, i) => (
                <motion.div
                  key={assessment.id}
                  className="glass-panel compare-summary-card"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                >
                  <div className="summary-card-header">
                    <span className="card-index">#{i + 1}</span>
                    <span className={`verdict-badge ${verdictPresentation(assessment.verdict, assessment.advisoryScore).className}`}>
                      {verdictPresentation(assessment.verdict, assessment.advisoryScore).label}
                    </span>
                  </div>
                  <p className="summary-card-verdict">{gaugeLabel(assessment.advisoryScore)} based on available observations. A low score is not proof of safety.</p>
                  <p className="summary-card-disclaimer text-ink-dim">{assessment.disclaimer}</p>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}