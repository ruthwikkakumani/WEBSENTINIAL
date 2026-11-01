// WebSentinel Guard — Popup Script
// ===================================
// Opens a port to background.js for real-time results,
// shows cached result immediately, rechecks, renders animated
// score ring, and handles copy-caution with visual feedback.

(function () {
  'use strict'

  const API = 'http://127.0.0.1:8080/api/v1/assess'
  const SITE = 'http://127.0.0.1:5173/?check='
  const PHASES = [
    'Reading the certificate on port 443.',
    'Asking the registry for the creation date.',
    'Reading public DNS.',
    'Checking certificate transparency logs.',
  ]
  const RING_CIRCUMFERENCE = 326.73 // 2 * π * 52

  // ---- DOM refs ----
  const hostEl = document.getElementById('host')
  const statusEl = document.getElementById('status')
  const statusDot = document.getElementById('statusDot')
  const resultEl = document.getElementById('result')
  const button = document.getElementById('go')
  const manual = document.getElementById('manual')
  const manualInput = document.getElementById('manual-url')
  const ringFill = document.getElementById('ringFill')
  const ringScore = document.getElementById('ringScore')
  const verdictBadge = document.getElementById('verdictBadge')
  const costumePart = document.getElementById('costumePart')
  const ownerPart = document.getElementById('ownerPart')
  const findingsList = document.getElementById('findingsList')
  const copyBtn = document.getElementById('copyCaution')
  const caseFileLink = document.getElementById('openCaseFile')
  const settingsLink = document.getElementById('settingsLink')

  let origin = ''
  let lastResult = null
  let inExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id
  let bgPort = null
  let animationFrame = null

  // ---- Initialisation ----
  init()

  function init() {
    if (!inExtension) {
      manual.hidden = false
      button.querySelector('span').textContent = 'Check'
      hostEl.textContent = 'Paste a link. This preview is outside Chrome.'
      return
    }

    // Connect to background service worker
    connectBackground()

    // Read active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0]
      readTab(tab && tab.url)
      // Show cached result immediately if available
      if (tab && tab.url) {
        try {
          const u = new URL(tab.url)
          chrome.storage.local.get(`cache:${u.origin}`, (data) => {
            if (data && data[`cache:${u.origin}`]) {
              const cached = data[`cache:${u.origin}`]
              // Don't show stale cached results older than 10 min
              if (Date.now() - cached.ts < 600000) {
                lastResult = cached.result
                renderResult(cached.result)
              }
            }
          })
        } catch (_) { /* ignore */ }
      }
    })
  }

  // ---- Port connection to background.js ----
  function connectBackground() {
    try {
      bgPort = chrome.runtime.connect({ name: 'popup' })
      bgPort.onMessage.addListener((msg) => {
        if (msg.type === 'cache_update' && msg.origin === origin && msg.result) {
          lastResult = msg.result
          renderResult(msg.result)
          statusEl.textContent = 'Updated'
          statusDot.className = 'status-dot alive'
        }
      })
      bgPort.onDisconnect.addListener(() => {
        bgPort = null
      })
    } catch (_) {
      bgPort = null
    }
  }

  // ---- Tab / URL reading ----
  button.addEventListener('click', () => {
    if (!inExtension) {
      const next = originFrom(manualInput ? manualInput.value : '')
      if (!next.ok) {
        showRefusal(next.title, next.body)
        return
      }
      origin = next.origin
      hostEl.textContent = origin
    }
    if (!origin) return
    void check()
  })

  if (manualInput) {
    manualInput.addEventListener('paste', (event) => {
      const text = event.clipboardData.getData('text').trim()
      if (!text) return
      event.preventDefault()
      manualInput.value = text
      const next = originFrom(text)
      if (!next.ok) {
        showRefusal(next.title, next.body)
        return
      }
      origin = next.origin
      hostEl.textContent = origin
      void check()
    })
  }

  // Keyboard shortcut (Ctrl+Enter) in manual input
  if (manualInput) {
    manualInput.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        button.click()
      }
    })
  }

  function readTab(raw) {
    const next = originFrom(raw)
    if (!next.ok) {
      hostEl.textContent = next.title
      button.disabled = true
      return
    }
    origin = next.origin
    hostEl.textContent = origin
    // Auto-check on open
    void check()
  }

  function originFrom(raw) {
    const trimmed = String(raw || '').trim()
    if (!trimmed) {
      return { ok: false, title: 'That is not a website address.', body: 'Paste the whole link from the message, or type the host yourself.' }
    }
    try {
      const url = new URL(/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`)
      if (url.username || url.password) {
        return { ok: false, title: 'A password was in the link.', body: 'It stayed here and was not sent. Remove the username and password, then check the host on its own.' }
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { ok: false, title: 'That is not a website link.', body: 'Only ordinary http and https addresses can be checked.' }
      }
      return { ok: true, origin: url.origin }
    } catch {
      return { ok: false, title: 'That is not a website address.', body: 'Paste the whole link from the message, or type the host yourself.' }
    }
  }

  // ---- Check (API call) ----
  async function check() {
    button.disabled = true
    statusEl.textContent = PHASES[0]
    statusDot.className = 'status-dot checking'
    lastResult = null

    // Animated phase text
    let step = 0
    const timer = setInterval(() => {
      step = (step + 1) % PHASES.length
      statusEl.textContent = PHASES[step]
    }, 1200)

    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: origin }),
      })
      const data = await res.json()
      if (!res.ok) {
        showRefusal(refusalTitle(data.code), data.error || 'This link could not be checked.')
        statusDot.className = 'status-dot error'
        return
      }
      lastResult = data
      statusDot.className = 'status-dot alive'
      statusEl.textContent = 'Assessment complete'
      renderResult(data)

      // Tell background to cache this
      if (bgPort) {
        try {
          bgPort.postMessage({ type: 'result', origin, result: data })
        } catch (_) { /* ignore */ }
      }
    } catch (err) {
      statusEl.textContent = ''
      statusDot.className = 'status-dot error'
      showRefusal('The checker is not running.', 'Start WebSentinel on this computer, then check the tab again.')
    } finally {
      clearInterval(timer)
      button.disabled = false
    }
  }

  // ---- Render result with animated score ring ----
  function renderResult(data) {
    if (!data) return
    const score = Number(data.advisoryScore) || 0
    const clamped = Math.max(0, Math.min(100, score))
    const offset = RING_CIRCUMFERENCE - (clamped / 100) * RING_CIRCUMFERENCE

    // Animate ring
    animateRing(offset, clamped)

    // Verdict badge
    const v = (data.verdict || 'safe').toLowerCase()
    const label = data.verdictLabel || 'Safe'
    verdictBadge.textContent = label
    verdictBadge.className = 'verdict-badge ' + v

    // Domain display
    renderDomain(data)

    // Findings
    renderFindings(data)

    // Case file link
    const file = `${SITE}${encodeURIComponent(data.origin || origin)}`
    caseFileLink.href = file
    caseFileLink.style.display = ''

    // Show result panel with transition
    resultEl.hidden = false
    resultEl.style.opacity = '0'
    resultEl.style.transform = 'translateY(8px)'
    requestAnimationFrame(() => {
      resultEl.style.transition = 'opacity 0.35s ease, transform 0.35s ease'
      resultEl.style.opacity = '1'
      resultEl.style.transform = 'translateY(0)'
    })
  }

  function animateRing(targetOffset, score) {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame)
      animationFrame = null
    }
    const startOffset = parseFloat(ringFill.getAttribute('stroke-dashoffset')) || RING_CIRCUMFERENCE
    const duration = 600
    const startTime = performance.now()

    // Set ring colour based on score
    const color = score >= 70 ? 'var(--accent-green)' : score >= 40 ? 'var(--accent-amber)' : 'var(--accent-red)'
    ringFill.style.stroke = color

    function step(now) {
      const t = Math.min((now - startTime) / duration, 1)
      // ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3)
      const current = startOffset + (targetOffset - startOffset) * ease
      ringFill.setAttribute('stroke-dashoffset', String(current))
      ringScore.textContent = Math.round(score * ease)
      if (t < 1) {
        animationFrame = requestAnimationFrame(step)
      } else {
        ringScore.textContent = score
        animationFrame = null
      }
    }
    animationFrame = requestAnimationFrame(step)
  }

  function renderDomain(data) {
    const hostname = data.hostname || data.origin || ''
    const registrable = data.registrableDomain || ''
    if (hostname && registrable && hostname !== registrable && hostname.endsWith(`.${registrable}`)) {
      const prefix = hostname.slice(0, -(registrable.length + 1))
      costumePart.textContent = prefix
      ownerPart.textContent = registrable
      costumePart.style.display = ''
    } else {
      costumePart.style.display = 'none'
      ownerPart.textContent = hostname || registrable || ''
    }
  }

  function renderFindings(data) {
    const items = (data.findings || []).filter((item) => item.weight !== 0).slice(0, 3)
    if (items.length === 0) {
      findingsList.innerHTML = '<li class="no-findings">No notable findings</li>'
      return
    }
    findingsList.innerHTML = items.map((item) => {
      const sign = item.weight > 0 ? '+' : '−'
      const cls = item.weight > 0 ? 'finding-risk' : 'finding-positive'
      // Pick severity icon
      let icon = ''
      if (item.severity === 'risk' || item.weight > 10) {
        icon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
      } else {
        icon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>'
      }
      return `<li class="${cls}"><span class="finding-icon">${icon}</span><span class="finding-weight">${sign}${Math.abs(item.weight)}</span><span class="finding-text">${escapeHtml(item.title)}</span></li>`
    }).join('')
  }

  // ---- Refusal / error state ----
  function showRefusal(title, body) {
    statusEl.textContent = ''
    resultEl.hidden = false
    resultEl.style.opacity = '1'
    resultEl.style.transform = 'translateY(0)'
    ringFill.setAttribute('stroke-dashoffset', String(RING_CIRCUMFERENCE))
    ringScore.textContent = '—'
    verdictBadge.textContent = 'Error'
    verdictBadge.className = 'verdict-badge error'
    costumePart.textContent = ''
    ownerPart.textContent = ''
    findingsList.innerHTML = `<li class="no-findings">${escapeHtml(title)}</li>`
    caseFileLink.style.display = 'none'

    const actions = document.querySelector('.actions')
    if (actions) actions.style.display = 'none'
  }

  function refusalTitle(code) {
    if (code === 'private_address' || code === 'blocked_host' || code === 'single_label') return 'We refused to open this.'
    if (code === 'embedded_credentials') return 'A password was in the link.'
    if (code === 'unsupported_scheme') return 'That is not a website link.'
    return 'This link could not be checked.'
  }

  // ---- Copy caution (with visual feedback) ----
  copyBtn.addEventListener('click', async (event) => {
    const btn = event.currentTarget
    if (!lastResult) return
    const note = cautionNote(lastResult)
    try {
      await navigator.clipboard.writeText(note)
      btn.classList.add('copied')
      const originalText = btn.innerHTML
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied`
      window.setTimeout(() => {
        btn.classList.remove('copied')
        btn.innerHTML = originalText
      }, 2200)
    } catch {
      window.prompt('Copy this caution', note)
    }
  })

  function cautionNote(data) {
    const next = adviceText(data)
    return [
      `WebSentinel caution for ${data.origin || origin}`,
      `${data.verdictLabel || ''}. Advisory ${data.advisoryScore || '?'}, documented rules ${data.ruleScore || '?'}.`,
      next.title,
      ...next.steps,
      'A low score is not proof of safety.',
    ].join('\n')
  }

  function adviceText(data) {
    const serious = (data.findings || []).some((item) => item.severity === 'risk' && item.weight > 0)
    if (data.verdict === 'high_risk') {
      return {
        title: 'Do not continue.',
        steps: ['Do not enter a password, OTP, or UPI PIN.', 'If someone sent this, call them on a number you already have.'],
      }
    }
    if (data.verdict === 'suspicious' || serious) {
      return {
        title: 'Pause before you type anything.',
        steps: ['Open the official app, or type the address yourself.', 'A lock icon only means the connection can be private.'],
      }
    }
    return {
      title: 'Nothing here crossed the caution line.',
      steps: ['That is not permission to enter an OTP or a password.', 'A valid certificate does not prove who runs the site.'],
    }
  }

  // ---- Settings link ----
  settingsLink.addEventListener('click', (e) => {
    e.preventDefault()
    if (chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage()
    }
  })

  // ---- Helpers ----
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
  }
})()