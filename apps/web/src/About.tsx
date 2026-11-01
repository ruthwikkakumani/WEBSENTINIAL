import { motion, type Variants } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Shield, Lock, Globe, Server, BookOpen, Code2, Smartphone, ExternalLink } from 'lucide-react'

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

const principles = [
  { icon: Shield, title: 'Evidence, not a guarantee', text: 'A low score is not proof of safety. WebSentinel explains observable warning signs and unavailable checks so you can decide what to do next.' },
  { icon: Lock, title: 'Less data leaves your device', text: 'The browser removes paths, queries, fragments, and credentials before sending an origin to your local checker. Cookies, passwords, and form bodies are not sent.' },
  { icon: BookOpen, title: 'Rules you can inspect', text: 'Documented rule weights are kept separate from additional observations. No detection accuracy, recall, or F1 is claimed without a completed evaluation.' },
]
const architecture = [
  { icon: Globe, name: 'React website', role: 'Prepare & explain', text: 'TypeScript validates and reduces your input to an origin. The interface presents findings and keeps case history on this device; it never contacts the assessed host.' },
  { icon: Server, name: 'Go checker', role: 'Collect & assess', text: 'The only process allowed to contact the assessed host. It checks public-host boundaries and collects advisory evidence without logging in or testing credentials.' },
  { icon: Code2, name: 'Java RDAP', role: 'Registry evidence', text: 'Accepts a domain name, not a URL, and requests public registration records. Missing registry evidence is a limitation, not evidence that a site is safe.' },
  { icon: Smartphone, name: 'Kotlin & extension', role: 'Other client surfaces', text: 'The Android app and Chrome extension follow the same origin-only contract and send checks to the local checker rather than the assessed site.' },
]

export function About() {
  return (
    <article className="about-page">
      <motion.header className="about-hero" variants={containerVariants} initial="hidden" animate="show">
        <div className="about-hero__bg-orb about-hero__bg-orb--1" aria-hidden="true" />
        <motion.div className="about-hero__badge" variants={itemVariants}><Shield size={16} aria-hidden="true" /> About WebSentinel</motion.div>
        <motion.h1 className="about-hero__title" variants={itemVariants}>Understand the link.<br /><span className="gradient-text">See the limits.</span></motion.h1>
        <motion.p className="about-hero__subtitle" variants={itemVariants}>An advisory website checker built around explainable evidence, minimal disclosure, and a clear boundary between checking a host and trusting it.</motion.p>
        <motion.div className="about-hero__meta" variants={itemVariants}>
          <span className="about-meta-chip"><Lock size={15} aria-hidden="true" /> Origin-only requests</span>
          <span className="about-meta-chip"><BookOpen size={15} aria-hidden="true" /> Inspectable rules</span>
          <span className="about-meta-chip"><Server size={15} aria-hidden="true" /> Local services</span>
        </motion.div>
      </motion.header>
      <div className="about-page__sections">
        <section className="about-mission" aria-labelledby="mission-heading">
          <div className="about-section-label">01 / The purpose</div>
          <h2 id="mission-heading" className="about-section-title">A reason you can act on.</h2>
          <div className="glass-panel about-mission__card">
            <div className="about-mission__icon"><Shield size={30} aria-hidden="true" /></div>
            <div className="about-mission__body">
              <p>Suspicious links rarely come with an explanation. WebSentinel brings host, certificate, DNS, and registration observations into one report, with practical next steps instead of a promise that a website is legitimate.</p>
              <p>The assessment is advisory. It cannot establish who operates a site, what every page contains, or whether a future interaction will be safe. Unavailable evidence remains visible.</p>
            </div>
          </div>
          <div className="about-principles">
            {principles.map(({ icon: Icon, title, text }) => (
              <section className="about-principle glass-panel" key={title}>
                <div className="about-principle__icon"><Icon size={23} aria-hidden="true" /></div>
                <h3 className="about-principle__title">{title}</h3>
                <p className="about-principle__text">{text}</p>
              </section>
            ))}
          </div>
        </section>
        <section className="about-tech" aria-labelledby="architecture-heading">
          <div className="about-section-label">02 / The architecture</div>
          <h2 id="architecture-heading" className="about-section-title">Separate responsibilities.<br />Reviewable boundaries.</h2>
          <p className="about-section-subtitle">The repository separates the client, host checker, and registry service according to which network requests each is allowed to make.</p>
          <div className="about-tech__grid">
            {architecture.map(({ icon: Icon, name, role, text }) => (
              <section className="about-tech__card glass-panel" key={name}>
                <div className="about-tech__card-header"><div className="about-tech__card-icon"><Icon size={24} aria-hidden="true" /></div><span className="about-tech__card-name">{name}</span></div>
                <p className="about-tech__role">{role}</p>
                <p className="about-tech__card-desc">{text}</p>
              </section>
            ))}
          </div>
        </section>
        <section className="about-oss" aria-labelledby="inspect-heading">
          <div className="glass-panel about-oss__card">
            <div className="about-oss__icon"><Code2 size={32} aria-hidden="true" /></div>
            <div className="about-oss__body">
              <div className="about-section-label">03 / Inspect the approach</div>
              <h2 id="inspect-heading" className="about-oss__title">Understand what the report means.</h2>
              <p className="about-oss__text">The source and architecture decisions live in this repository. Read the methodology for the scoring boundaries, or explore the companion clients and their setup.</p>
              <div className="about-oss__actions">
                <Link to="/method" className="btn btn-primary"><BookOpen size={17} aria-hidden="true" /> Read the methodology</Link>
                <Link to="/clients" className="btn btn-secondary">Explore clients <ExternalLink size={16} aria-hidden="true" /></Link>
              </div>
            </div>
          </div>
        </section>
        <aside className="about-caution glass-panel"><Shield size={22} aria-hidden="true" /><p><strong>A check is not permission to trust.</strong> Avoid entering credentials, making payments, or downloading files when you cannot independently verify the destination.</p></aside>
      </div>
    </article>
  )
}
