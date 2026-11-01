/* ═══════════════════════════════════════════════════════════════
   WebSentinel — Immersive Particle & Glow Background System
   ═══════════════════════════════════════════════════════════════
   Creates an animated field of floating particles, cursor-reactive
   glow, and orbital accent circles for depth.
   ═══════════════════════════════════════════════════════════════ */

interface Particle {
  el: HTMLDivElement
  x: number
  y: number
  vx: number
  vy: number
  size: number
  opacity: number
  life: number
  maxLife: number
}

const PARTICLE_COUNT = 35
const CURSOR_RADIUS = 180
const PARTICLE_INTERVAL_MS = 320

let particles: Particle[] = []
let container: HTMLDivElement | null = null
let cursorX = -1000
let cursorY = -1000
let animFrame = 0
let spawnTimer: ReturnType<typeof setInterval> | null = null

/* ── Create a single particle ── */

function createParticle(): Particle {
  const el = document.createElement('div')
  el.className = 'particle'
  const size = 1.5 + Math.random() * 3.5
  el.style.width = `${size}px`
  el.style.height = `${size}px`
  const colors = [
    'rgba(0, 229, 190, 0.6)',
    'rgba(124, 138, 255, 0.5)',
    'rgba(183, 148, 244, 0.4)',
    'rgba(0, 229, 190, 0.3)',
  ]
  el.style.background = colors[Math.floor(Math.random() * colors.length)]
  el.style.boxShadow = `0 0 ${6 + size * 3}px ${el.style.background}`
  el.style.borderRadius = '50%'
  el.style.position = 'absolute'
  el.style.pointerEvents = 'none'
  el.style.willChange = 'transform, opacity'

  const p: Particle = {
    el,
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3 - 0.15,
    size,
    opacity: 0.2 + Math.random() * 0.3,
    life: 0,
    maxLife: 200 + Math.random() * 300,
  }

  el.style.opacity = '0'
  el.style.transform = `translate(${p.x}px, ${p.y}px) scale(0)`
  return p
}

/* ── Spawn a particle (fade in) ── */

function spawnParticle() {
  if (!container || particles.length >= PARTICLE_COUNT) return
  const p = createParticle()
  container.appendChild(p.el)
  particles.push(p)

  // fade in
  requestAnimationFrame(() => {
    p.el.style.transition = 'opacity 1.2s ease-out, transform 1.2s ease-out'
    p.el.style.opacity = String(p.opacity)
    p.el.style.transform = `translate(${p.x}px, ${p.y}px) scale(1)`
  })
}

/* ── Animation loop ── */

function animate() {
  if (!container) return

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.life++

    // Drift
    p.x += p.vx
    p.y += p.vy

    // Wrap edges
    if (p.x < -20) p.x = window.innerWidth + 20
    if (p.x > window.innerWidth + 20) p.x = -20
    if (p.y < -20) p.y = window.innerHeight + 20
    if (p.y > window.innerHeight + 20) p.y = -20

    // Cursor repulsion
    const dx = p.x - cursorX
    const dy = p.y - cursorY
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < CURSOR_RADIUS) {
      const force = (CURSOR_RADIUS - dist) / CURSOR_RADIUS
      p.x += (dx / dist) * force * 3
      p.y += (dy / dist) * force * 3
      p.el.style.opacity = String(Math.min(p.opacity * 1.4, 0.9))
      p.el.style.transform = `translate(${p.x}px, ${p.y}px) scale(${1 + force * 0.3})`
    } else {
      p.el.style.transform = `translate(${p.x}px, ${p.y}px) scale(1)`
    }

    // Fade out and die
    if (p.life > p.maxLife) {
      p.el.style.opacity = '0'
      p.el.style.transition = 'opacity 0.8s ease-out'
      setTimeout(() => {
        p.el.remove()
        particles.splice(i, 1)
      }, 800)
    }
  }

  animFrame = requestAnimationFrame(animate)
}

/* ── Cursor tracker ── */

function onMouseMove(e: MouseEvent) {
  cursorX = e.clientX
  cursorY = e.clientY
}

/* ── Init / Destroy ── */

export function initParticles() {
  if (container) return // already running

  container = document.createElement('div')
  container.className = 'particle-container'
  container.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    pointer-events: none; z-index: 0; overflow: hidden;
  `
  document.body.appendChild(container)

  // Spawn initial burst
  for (let i = 0; i < 18; i++) {
    spawnParticle()
  }

  // Periodic spawn
  spawnTimer = setInterval(spawnParticle, PARTICLE_INTERVAL_MS)

  document.addEventListener('mousemove', onMouseMove, { passive: true })
  animate()
}

export function destroyParticles() {
  if (spawnTimer) { clearInterval(spawnTimer); spawnTimer = null }
  document.removeEventListener('mousemove', onMouseMove)
  cancelAnimationFrame(animFrame)
  particles.forEach(p => p.el.remove())
  particles = []
  if (container) { container.remove(); container = null }
}

/* ── Cursor glow orb (reactive ambient light) ── */

let glowEl: HTMLDivElement | null = null

export function initCursorGlow() {
  if (glowEl) return
  glowEl = document.createElement('div')
  glowEl.className = 'cursor-glow'
  glowEl.style.cssText = `
    position: fixed; pointer-events: none; z-index: 0;
    width: 400px; height: 400px; border-radius: 50%;
    background: radial-gradient(circle, rgba(0, 229, 190, 0.04) 0%, transparent 70%);
    transform: translate(-50%, -50%);
    transition: opacity 0.3s;
    will-change: transform;
  `
  document.body.appendChild(glowEl)

  let raf = 0
  let mx = -200, my = -200

  const move = (e: MouseEvent) => {
    mx = e.clientX
    my = e.clientY
  }

  const tick = () => {
    if (glowEl) {
      glowEl.style.left = `${mx}px`
      glowEl.style.top = `${my}px`
    }
    raf = requestAnimationFrame(tick)
  }

  document.addEventListener('mousemove', move, { passive: true })
  raf = requestAnimationFrame(tick)

  return () => {
    cancelAnimationFrame(raf)
    document.removeEventListener('mousemove', move)
    if (glowEl) { glowEl.remove(); glowEl = null }
  }
}

/* ── Canvas-based starfield for behind hero ── */

let starCanvas: HTMLCanvasElement | null = null
let starCtx: CanvasRenderingContext2D | null = null
let starRaf = 0
let stars: { x: number; y: number; r: number; a: number; da: number }[] = []

export function initStarfield() {
  if (starCanvas) return

  starCanvas = document.createElement('canvas')
  starCanvas.className = 'starfield-canvas'
  starCanvas.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    pointer-events: none; z-index: 0;
  `
  document.body.prepend(starCanvas)
  starCtx = starCanvas.getContext('2d')!

  const resize = () => {
    if (!starCanvas) return
    starCanvas.width = window.innerWidth
    starCanvas.height = window.innerHeight
    stars = Array.from({ length: 120 }, () => ({
      x: Math.random() * starCanvas!.width,
      y: Math.random() * starCanvas!.height,
      r: 0.3 + Math.random() * 1.2,
      a: 0.1 + Math.random() * 0.5,
      da: 0.002 + Math.random() * 0.006,
    }))
  }
  resize()
  window.addEventListener('resize', resize)

  const draw = () => {
    if (!starCtx || !starCanvas) return
    starCtx.clearRect(0, 0, starCanvas.width, starCanvas.height)

    for (const s of stars) {
      s.a += s.da * (Math.random() > 0.5 ? 1 : -1)
      s.a = Math.max(0.05, Math.min(0.7, s.a))
      starCtx.beginPath()
      starCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      starCtx.fillStyle = `rgba(200, 210, 255, ${s.a})`
      starCtx.fill()
    }

    starRaf = requestAnimationFrame(draw)
  }
  draw()

  return () => {
    cancelAnimationFrame(starRaf)
    window.removeEventListener('resize', resize)
    if (starCanvas) { starCanvas.remove(); starCanvas = null; starCtx = null }
  }
}