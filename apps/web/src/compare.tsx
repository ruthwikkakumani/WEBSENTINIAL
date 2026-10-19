import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { assess, CheckError } from './api'
import { PrepareError, prepare } from './origin'
import { Report } from './report'
import type { Assessment } from './types'

export function Compare() {
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [a, setA] = useState<Assessment | null>(null)
  const [b, setB] = useState<Assessment | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runBoth() {
    setBusy(true)
    setError(null)
    try {
      const one = prepare(left)
      const two = prepare(right)
      const [first, second] = await Promise.all([assess(one.url), assess(two.url)])
      setA(first)
      setB(second)
    } catch (err) {
      setA(null)
      setB(null)
      if (err instanceof CheckError || err instanceof PrepareError) setError(err.message)
      else setError('Both origins could not be checked.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.section className="compare" variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } }} initial="hidden" animate="show">
      <motion.p className="eyebrow" variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } }}>Two origins</motion.p>
      <motion.h1 variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } }}>Compare only the hosts.</motion.h1>
      <motion.p className="lede" variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } }}>
        Each side sends an origin, never a path. Use this when two links look alike and you need the case files next to each other.
      </motion.p>
      <motion.form
        className="pair-form glass-panel"
        variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } } }}
        onSubmit={(event) => { event.preventDefault(); if (!busy) void runBoth() }}
      >
        <label>
          <span className="kicker">Left</span>
          <input value={left} onChange={(event) => setLeft(event.target.value)} placeholder="https://" spellCheck={false} />
        </label>
        <label>
          <span className="kicker">Right</span>
          <input value={right} onChange={(event) => setRight(event.target.value)} placeholder="https://" spellCheck={false} />
        </label>
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? 'Reading…' : 'Compare'}
        </button>
      </motion.form>
      <AnimatePresence mode="wait">
        {error && (
          <motion.p className="banner" key="error" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            {error}
          </motion.p>
        )}
        {a && b && (
          <motion.div key="results" variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.15 } } }} initial="hidden" animate="show">
            <motion.p className="compare-readout" variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
              {a.origin === b.origin
                ? 'These are the same origin.'
                : `${a.verdictLabel} ${a.advisoryScore} vs ${b.verdictLabel} ${b.advisoryScore}. Documented rules ${a.ruleScore} vs ${b.ruleScore}.`}
            </motion.p>
            <motion.div className="pair" variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}>
              <Report assessment={a} discarded={a.discardedPath} />
              <Report assessment={b} discarded={b.discardedPath} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}