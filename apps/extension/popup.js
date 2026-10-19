const hostEl = document.querySelector('#host')
const statusEl = document.querySelector('#status')
const resultEl = document.querySelector('#result')
const button = document.querySelector('#go')
const manual = document.querySelector('#manual')
const manualInput = document.querySelector('#manual-url')

const API = 'http://127.0.0.1:8080/api/v1/assess'
const SITE = 'http://127.0.0.1:5173/?check='
const phases = [
  'Reading the certificate on port 443.',
  'Asking the registry for the creation date.',
  'Reading public DNS.',
]

let origin = ''
let last = null
const inExtension = typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query

if (!inExtension) {
  manual.hidden = false
  button.textContent = 'Check'
  hostEl.textContent = 'Paste a link. This preview is outside Chrome.'
} else {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0]
    readTab(tab && tab.url)
  })
}

button.addEventListener('click', () => {
  if (!inExtension) {
    const next = originFrom(manualInput.value)
    if (!next.ok) {
      showRefusal(next.title, next.body)
      return
    }
    origin = next.origin
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

resultEl.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-caution]')
  if (!target || !last) return
  const note = cautionNote(last)
  try {
    await navigator.clipboard.writeText(note)
    target.textContent = 'Copied'
    window.setTimeout(() => {
      target.textContent = 'Copy a caution for chat'
    }, 2000)
  } catch {
    window.prompt('Copy this caution', note)
  }
})

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

function readTab(raw) {
  const next = originFrom(raw)
  if (!next.ok) {
    hostEl.textContent = next.title
    button.disabled = true
    return
  }
  origin = next.origin
  hostEl.textContent = origin
}

async function check() {
  button.disabled = true
  resultEl.hidden = true
  last = null
  let step = 0
  statusEl.textContent = phases[0]
  const timer = window.setInterval(() => {
    step = (step + 1) % phases.length
    statusEl.textContent = phases[step]
  }, 1100)
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: origin }),
    })
    const data = await res.json()
    if (!res.ok) {
      showRefusal(refusalTitle(data.code), data.error || 'This link could not be checked.')
      return
    }
    last = data
    statusEl.textContent = ''
    resultEl.hidden = false
    resultEl.innerHTML = render(data)
  } catch {
    statusEl.textContent = ''
    showRefusal('The checker is not running.', 'Start WebSentinel on this computer, then check the tab again.')
  } finally {
    window.clearInterval(timer)
    button.disabled = false
  }
}

function render(data) {
  const next = advice(data)
  const reasons = (data.findings || [])
    .filter((item) => item.weight !== 0)
    .slice(0, 3)
    .map((item) => `<li><strong>${item.weight > 0 ? '+' : '−'}${Math.abs(item.weight)}</strong> ${escapeHtml(item.title)}</li>`)
    .join('')
  const file = `${SITE}${encodeURIComponent(data.origin || origin)}`
  return `<article class="card ${escapeHtml(data.verdict)}">
    <p class="kicker">${escapeHtml(data.verdictLabel || '')}</p>
    <h2>${escapeHtml(next.title)}</h2>
    <div class="scoreline"><b>${Number(data.advisoryScore) || 0}</b><span>Advisory · rules ${Number(data.ruleScore) || 0}</span></div>
    ${nameLine(data.hostname, data.registrableDomain)}
    <ol>${next.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
    ${reasons ? `<ul>${reasons}</ul>` : ''}
    <button type="button" class="copy" data-caution>Copy a caution for chat</button>
    <a class="full" href="${escapeHtml(file)}" target="_blank" rel="noreferrer">Open the full case file</a>
  </article>`
}

function showRefusal(title, body) {
  statusEl.textContent = ''
  resultEl.hidden = false
  resultEl.innerHTML = `<article class="card refusal"><p class="kicker">Not contacted</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p></article>`
}

function refusalTitle(code) {
  if (code === 'private_address' || code === 'blocked_host' || code === 'single_label') return 'We refused to open this.'
  if (code === 'embedded_credentials') return 'A password was in the link.'
  if (code === 'unsupported_scheme') return 'That is not a website link.'
  return 'This link could not be checked.'
}

function advice(data) {
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

function cautionNote(data) {
  const next = advice(data)
  return [
    `WebSentinel caution for ${data.origin}`,
    `${data.verdictLabel}. Advisory ${data.advisoryScore}, documented rules ${data.ruleScore}.`,
    next.title,
    next.steps[0],
    'A low score is not proof of safety.',
  ].join('\n')
}

function nameLine(host, registrable) {
  if (!host) return ''
  const owner = registrable || host
  if (host !== owner && host.endsWith(`.${owner}`)) {
    const prefix = host.slice(0, -(owner.length + 1))
    return `<p class="name"><span class="costume">${escapeHtml(prefix)}</span>.<span class="owner">${escapeHtml(owner)}</span></p>`
  }
  return `<p class="name"><span class="owner">${escapeHtml(host)}</span></p>`
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}
