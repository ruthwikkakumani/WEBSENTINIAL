import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { clearHistory, fetchHistory } from './api'
import { recall, recallLine } from './historyRecall'
import { Report } from './report'
import type { Assessment } from './types'

const rowVariants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as any } },
} as const

const panelVariants = {
  hidden: { opacity: 0, height: 0 },
  show: { opacity: 1, height: 'auto', transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as any } },
  exit: { opacity: 0, height: 0, transition: { duration: 0.2 } },
}

export function HistoryPage() {
  const [items, setItems] = useState<Assessment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  async function load() {
    try {
      setItems(await fetchHistory())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'History could not be read.')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function clear() {
    await clearHistory()
    setOpen(null)
    await load()
  }

  const selected = items?.find((item) => item.id === open) ?? null
  const seen = selected && items ? recall(items, selected.origin) : null
  const line = seen ? recallLine(seen) : null
  const q = query.trim().toLowerCase()
  const visible = items?.filter((item) => !q || item.hostname.toLowerCase().includes(q) || item.origin.toLowerCase().includes(q))

  return (
    <motion.section className="history" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as any }}>
      <div className="history-head">
        <div>
          <p className="eyebrow">On this computer</p>
          <h1>Assessment history</h1>
          <p className="lede">Origins, scores, and reasons. Paths and queries were never stored, because they were never sent. Opening a file shows whether this machine has seen that origin before.</p>
        </div>
        {items && items.length > 0 && (
          <motion.button type="button" className="ghost" onClick={() => void clear()} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            Clear history
          </motion.button>
        )}
      </div>
      {items && items.length > 0 && (
        <label className="filter">
          <span className="sr">Filter by host</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by host" />
        </label>
      )}
      {error && <motion.p className="banner" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{error}</motion.p>}
      {items && items.length === 0 && <motion.p className="quiet" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>No assessments yet. They stay on this machine once you run one.</motion.p>}
      {visible && visible.length === 0 && items && items.length > 0 && <p className="quiet">No case file on this computer matches that name.</p>}
      {visible && visible.length > 0 && (
        <>
          <div className="ledger-head" aria-hidden="true">
            <span>When</span>
            <span>Host</span>
            <span>Rules</span>
            <span>Advisory</span>
            <span>Verdict</span>
          </div>
          <motion.ul className="cases" variants={{ show: { transition: { staggerChildren: 0.03 } } }} initial="hidden" animate="show">
            <AnimatePresence>
              {visible.map((item, i) => (
                <motion.li key={item.id} custom={i} variants={rowVariants} layout>
                  <button
                    type="button"
                    className={`row ${item.verdict}`}
                    aria-expanded={open === item.id}
                    onClick={() => setOpen(open === item.id ? null : item.id)}
                  >
                    <span className="case-when">{new Date(item.assessedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    <span className="case-host">{item.hostname}</span>
                    <span className="case-score">{item.ruleScore}</span>
                    <span className="case-score">{item.advisoryScore}</span>
                    <span className="case-verdict">{item.verdictLabel}</span>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        </>
      )}
      <AnimatePresence>
        {selected && (
          <motion.div key={selected.id} variants={panelVariants} initial="hidden" animate="show" exit="exit">
            {line && <p className="banner">{line}</p>}
            <Report assessment={selected} discarded={selected.discardedPath} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}