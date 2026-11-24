import '@fontsource/cormorant-garamond/300.css'
import '@fontsource/cormorant-garamond/400.css'
import '@fontsource/cormorant-garamond/500.css'
import '@fontsource/cormorant-garamond/300-italic.css'
import '@fontsource/cormorant-garamond/400-italic.css'
import './style.css'
import memories from '../stars.json'
import { buildUniverse } from './layout.js'
import { createSky } from './sky.js'

const $ = (selector) => document.querySelector(selector)
const els = {
  universe: $('.universe'),
  canvas: $('.sky'),
  title: $('.title'),
  hint: $('.hint'),
  labels: $('.labels'),
  closing: $('.closing'),
  home: $('.home'),
  memory: $('.memory'),
  scroll: $('.memory-scroll'),
  close: $('.memory-close'),
  back: $('.memory-return'),
  date: $('.memory-date'),
  memoryTitle: $('.memory-title'),
  photo: $('.memory-photo'),
  img: $('.memory-photo img'),
  text: $('.memory-text'),
  probe: $('.safe-probe'),
}

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const coarsePointer = window.matchMedia('(pointer: coarse)').matches
const SEEN_KEY = 'our-little-universe:stars-seen'

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
const lerp = (a, b, t) => a + (b - a) * t
const easeOut = (t) => 1 - Math.pow(1 - t, 3)
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]

/* ---------- Memories from stars.json ---------- */

function readMemories(list) {
  if (!Array.isArray(list)) {
    console.warn('stars.json should contain a list of memories: [ { ... }, { ... } ]')
    return []
  }
  const text = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
  return list
    .filter((m) => m && typeof m === 'object' && text(m.title))
    .map((m) => ({ title: text(m.title), text: text(m.text), image: text(m.image), date: text(m.date) }))
}

function photoUrl(image) {
  if (/^(https?:)?\/\//.test(image)) return image
  const path = image.replace(/^\/?(public\/)?(photos\/)?/, '')
  return `${import.meta.env.BASE_URL}photos/${path.split('/').map(encodeURIComponent).join('/')}`
}

/* ---------- State ---------- */

const entries = readMemories(memories)
const sky = createSky(els.canvas)

const view = {
  W: 0,
  H: 0,
  cam: { x: 0, y: 0, z: 1 },
  home: { x: 0, y: 0, z: 1 },
  homeZ: 1,
  minZ: 0.3,
  maxZ: 3,
  stars: [],
  edges: [],
  waiting: [],
  dust: [],
  bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
  dim: 0,
  focus: 0,
  focusIndex: -1,
  hover: -1,
  warp: 0,
  glare: 1,
  reveal: 0,
  reduce: motionQuery.matches,
}

let portrait = window.innerHeight >= window.innerWidth
let safe = { top: 0, right: 0, bottom: 0, left: 0 }
let titleSize = { w: 300, h: 120 }
let closingSize = { w: 300, h: 44 }
let titleAnchor = { x: 0, y: 0 }
let placedAtZ = 0
let placedAt = { x: 0, y: 0 }
let interacted = false
let flight = null
let velocity = { x: 0, y: 0 }
let lastMoveAt = 0
let openIndex = -1
let memoryShown = false
let memoryShowAt = 0
let closingMemory = false
let savedCam = null
let focusTarget = 0
let dimTarget = 0
let returnFocus = null
let pendingHashStar = parseStarHash()
let introStart = performance.now() / 1000
let lastFrame = introStart
let lastStarAt = 0

motionQuery.addEventListener('change', (e) => (view.reduce = e.matches))
els.hint.textContent = coarsePointer ? 'Berühre einen Stern' : 'Klicke auf einen Stern'

/* ---------- Building the universe ---------- */

function build() {
  const previous = view.stars
  Object.assign(view, buildUniverse(entries, portrait))
  view.stars.forEach((s, i) => {
    const old = previous[i]
    if (old) Object.assign(s, { el: old.el, at: old.at, newborn: old.newborn, w: old.w, h: old.h })
  })
}

function createLabels() {
  els.labels.replaceChildren()
  for (const s of view.stars) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'star-label'
    const span = document.createElement('span')
    span.textContent = s.title
    button.append(span)
    button.addEventListener('click', () => openMemory(s.index))
    button.addEventListener('focus', () => bringIntoView(s))
    s.el = button
    s.transform = ''
    s.visible = false
    els.labels.append(button)
  }
}

/** Stars appear one by one; memories added since the last visit are born last. */
function scheduleIntro() {
  const n = view.stars.length
  let seen = null
  try {
    const stored = window.localStorage.getItem(SEEN_KEY)
    if (stored !== null) seen = Number(stored)
    window.localStorage.setItem(SEEN_KEY, String(n))
  } catch {
    /* Private browsing: every star simply appears normally. */
  }
  const known = seen === null || !Number.isFinite(seen) ? n : Math.min(seen, n)
  const step = Math.min(0.26, 2.2 / Math.max(known, 1))
  view.stars.forEach((s, i) => {
    s.newborn = i >= known
    s.at = view.reduce ? 0.2 : s.newborn ? 1.1 + known * step + 0.9 + (i - known) * 0.8 : 1.1 + i * step
    s.appear = 0
    s.line = 0
    s.born = 0
  })
  lastStarAt = view.stars.reduce((m, s) => Math.max(m, s.at), 0.8)
}

function measure() {
  const cs = getComputedStyle(els.probe)
  safe = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  }
  const h1 = els.title.querySelector('h1')
  titleSize = { w: Math.min(view.W, h1.offsetWidth + 24), h: els.title.offsetHeight }
  closingSize = { w: els.closing.offsetWidth, h: els.closing.offsetHeight }
  for (const s of view.stars) {
    s.w = s.el.offsetWidth
    s.h = s.el.offsetHeight
  }
}

/** The resting view: every memory in sight, below the title. */
function computeHome() {
  const { W, H, bounds: b } = view
  const short = H < 500
  const top = safe.top + 18 + titleSize.h + (short ? 40 : 58)
  const bottom = safe.bottom + (short ? 84 : 120)
  const side = 18 + 40
  const availW = Math.max(80, W - safe.left - safe.right - side * 2)
  const availH = Math.max(80, H - top - bottom)
  const bw = b.maxX - b.minX
  const bh = b.maxY - b.minY
  const fit = Math.min(bw ? availW / bw : Infinity, bh ? availH / bh : Infinity)
  const z = clamp(fit, 0.45, 1.25)
  const centerX = safe.left + (W - safe.left - safe.right) / 2
  const centerY = top + availH / 2
  const home = {
    x: (b.minX + b.maxX) / 2 - (centerX - W / 2) / z,
    y: (b.minY + b.maxY) / 2 - (centerY - H / 2) / z,
    z,
  }
  view.home = home
  view.homeZ = z
  view.minZ = Math.max(0.16, Math.min(z * 0.6, fit * 0.85))
  view.maxZ = Math.max(3, z * 3.2)
  titleAnchor = { x: home.x, y: home.y + (safe.top + 18 + titleSize.h - H / 2) / z }
}

function resize() {
  const W = window.innerWidth
  const H = window.innerHeight
  view.W = W
  view.H = H
  sky.resize(W, H)

  const nowPortrait = H >= W
  const turned = nowPortrait !== portrait
  if (turned) {
    portrait = nowPortrait
    build()
  }
  measure()
  computeHome()
  if (openIndex !== -1) {
    flight = null
    view.cam = memoryCamera(view.stars[openIndex])
    savedCam = { ...view.home }
  } else if (!interacted || turned) {
    flight = null
    view.cam = { ...view.home }
  }
  clampCamera()
  placeLabels()
}

/* ---------- Camera ---------- */

const toScreenX = (x) => (x - view.cam.x) * view.cam.z + view.W / 2
const toScreenY = (y) => (y - view.cam.y) * view.cam.z + view.H / 2

function clampCamera() {
  const { cam, bounds: b, W, H } = view
  cam.z = clamp(cam.z, view.minZ, view.maxZ)
  const mx = 220 + (W * 0.3) / cam.z
  const my = 220 + (H * 0.3) / cam.z
  cam.x = clamp(cam.x, b.minX - mx, b.maxX + mx)
  cam.y = clamp(cam.y, b.minY - my, b.maxY + my)
}

function pan(dx, dy) {
  view.cam.x -= dx / view.cam.z
  view.cam.y -= dy / view.cam.z
  clampCamera()
}

function zoomAt(px, py, factor) {
  const { cam, W, H } = view
  const wx = cam.x + (px - W / 2) / cam.z
  const wy = cam.y + (py - H / 2) / cam.z
  cam.z = clamp(cam.z * factor, view.minZ, view.maxZ)
  cam.x = wx - (px - W / 2) / cam.z
  cam.y = wy - (py - H / 2) / cam.z
  clampCamera()
}

function fly(to, duration, onDone, delay = 0) {
  flight = {
    from: { ...view.cam },
    to: { ...to },
    start: performance.now() / 1000 + delay,
    duration,
    onDone,
  }
}

function updateFlight(now) {
  if (!flight) return
  const p = clamp((now - flight.start) / flight.duration, 0, 1)
  const e = easeInOut(p)
  const { from, to } = flight
  view.cam.z = Math.exp(lerp(Math.log(from.z), Math.log(to.z), e))
  view.cam.x = lerp(from.x, to.x, e)
  view.cam.y = lerp(from.y, to.y, e)
  if (p >= 1) {
    const done = flight.onDone
    flight = null
    done?.()
  }
}

function stopMotion() {
  velocity = { x: 0, y: 0 }
  if (flight && openIndex === -1) flight = null
}

function goHome() {
  interacted = true
  stopMotion()
  if (view.reduce) view.cam = { ...view.home }
  else fly(view.home, 1.4)
}

function bringIntoView(s) {
  if (openIndex !== -1) return
  const x = toScreenX(s.x)
  const y = toScreenY(s.y)
  const m = 90
  if (x > m && x < view.W - m && y > m && y < view.H - m) return
  stopMotion()
  const to = { x: s.x, y: s.y, z: Math.max(view.cam.z, view.homeZ) }
  if (view.reduce) view.cam = to
  else fly(to, 0.9)
}

/* ---------- Labels: never overlapping ---------- */

function placeLabels() {
  const { cam, stars, bounds: b, W } = view
  const z = cam.z
  placedAtZ = z
  placedAt = { x: cam.x, y: cam.y }
  const centerX = W / 2
  const scale = clamp(Math.sqrt(z / view.homeZ), 0.75, 1.9)
  const gap = 12 + 7 * scale
  const rel = (x, y) => [(x - cam.x) * z, (y - cam.y) * z]

  const [tx, ty] = rel(titleAnchor.x, titleAnchor.y)
  const [cx, cy] = rel((b.minX + b.maxX) / 2, b.maxY)
  const obstacles = [
    [tx - titleSize.w / 2, ty - titleSize.h, tx + titleSize.w / 2, ty],
    [cx - closingSize.w / 2, cy + 62, cx + closingSize.w / 2, cy + 62 + closingSize.h],
  ]
  const points = stars.map((s) => rel(s.x, s.y))
  const dots = points.map(([x, y]) => [x - 9, y - 9, x + 9, y + 9])

  const candidatesFor = (s) => {
    const { w, h } = s
    return [
      { dx: -w / 2, dy: gap, align: 'center' },
      { dx: -w / 2, dy: -gap - h, align: 'center' },
      { dx: gap + 2, dy: -h / 2, align: 'left' },
      { dx: -gap - 2 - w, dy: -h / 2, align: 'right' },
      { dx: -w * 0.18, dy: gap - 2, align: 'left' },
      { dx: -w * 0.82, dy: gap - 2, align: 'right' },
      { dx: -w * 0.18, dy: -gap + 2 - h, align: 'left' },
      { dx: -w * 0.82, dy: -gap + 2 - h, align: 'right' },
    ]
  }

  const arrange = (order) => {
    const placed = []
    const result = new Array(stars.length).fill(null)
    for (const i of order) {
      const s = stars[i]
      const [x, y] = points[i]
      for (const c of candidatesFor(s)) {
        const r = [x + c.dx - 5, y + c.dy - 3, x + c.dx + s.w + 5, y + c.dy + s.h + 3]
        if (r[0] + centerX < 2 || r[2] + centerX > W - 2) continue
        if (placed.some((o) => overlaps(o, r))) continue
        if (obstacles.some((o) => overlaps(o, r))) continue
        if (dots.some((d) => overlaps(d, r))) continue
        result[i] = c
        placed.push(r)
        break
      }
    }
    return result
  }

  // Older memories get first choice; a few other orders are tried in case
  // they let more labels fit.
  const byIndex = stars.map((_, i) => i)
  const orders = [byIndex]
  if (stars.length <= 60) {
    orders.push(
      [...byIndex].reverse(),
      [...byIndex].sort((a, b) => points[a][1] - points[b][1]),
      [...byIndex].sort((a, b) => points[b][1] - points[a][1]),
      [...byIndex].sort((a, b) => points[a][0] - points[b][0]),
    )
  }
  let best = null
  let bestCount = -1
  for (const order of orders) {
    const result = arrange(order)
    const count = result.filter(Boolean).length
    if (count > bestCount) {
      best = result
      bestCount = count
    }
  }

  stars.forEach((s, i) => {
    s.place = best[i]
    if (s.place && s.el.dataset.align !== s.place.align) s.el.dataset.align = s.place.align
  })
}

function hitTest(px, py) {
  const radius = coarsePointer ? 32 : 22
  let best = -1
  let bestScore = Infinity
  for (const s of view.stars) {
    if (s.appear < 0.5) continue
    const x = toScreenX(s.x)
    const y = toScreenY(s.y)
    const d = Math.hypot(px - x, py - y)
    let score = d < radius ? d : Infinity
    if (s.visible && s.place) {
      const lx = x + s.place.dx
      const ly = y + s.place.dy
      if (px > lx - 8 && px < lx + s.w + 8 && py > ly - 8 && py < ly + s.h + 8) score = Math.min(score, radius * 0.6)
    }
    if (score < bestScore) {
      bestScore = score
      best = s.index
    }
  }
  return best
}

/* ---------- A memory ---------- */

function memoryCamera(s) {
  const z = clamp(Math.max(view.cam.z * 1.7, view.homeZ * 2.9), view.homeZ * 2, 4.2)
  const starY = safe.top + view.H * 0.12 + 34
  return { x: s.x, y: s.y - (starY - view.H / 2) / z, z }
}

function fillMemory(s) {
  els.date.textContent = s.date
  els.memoryTitle.textContent = s.title
  const paragraphs = s.text.split(/\n\s*\n/).filter((p) => p.trim())
  els.text.replaceChildren(
    ...paragraphs.map((p) => {
      const el = document.createElement('p')
      el.textContent = p.trim()
      return el
    }),
  )
  const lines = s.text.split('\n')
  const verse = lines.length > 1 && lines.every((line) => line.length <= 64)
  els.text.classList.toggle('is-short', verse || (s.text.length < 160 && !s.text.includes('\n')))

  els.photo.classList.remove('is-loaded')
  if (s.image) {
    els.photo.hidden = false
    els.img.alt = s.title
    els.img.src = photoUrl(s.image)
    if (els.img.complete && els.img.naturalWidth) els.photo.classList.add('is-loaded')
  } else {
    els.photo.hidden = true
    els.img.removeAttribute('src')
  }
}

els.img.addEventListener('load', () => els.photo.classList.add('is-loaded'))
els.img.addEventListener('error', () => {
  if (els.img.getAttribute('src')) {
    console.warn(`Photo not found: ${els.img.getAttribute('src')} — is it inside public/photos/?`)
    els.photo.hidden = true
  }
})

function openMemory(index, { fromHash = false } = {}) {
  const s = view.stars[index]
  if (!s || openIndex !== -1) return
  interacted = true
  els.hint.classList.remove('is-visible')
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  savedCam = flight && !closingMemory ? { ...flight.to } : { ...view.cam }
  velocity = { x: 0, y: 0 }
  openIndex = index
  memoryShown = false
  view.focusIndex = index
  view.hover = -1
  focusTarget = 1
  dimTarget = 1
  fillMemory(s)
  if (!fromHash) history.pushState({ star: index }, '', `#star-${index + 1}`)

  const target = memoryCamera(s)
  const now = performance.now() / 1000
  if (view.reduce) {
    flight = null
    view.cam = target
    memoryShowAt = now
  } else {
    fly(target, 2.1)
    memoryShowAt = now + 1.25
  }
}

function showMemory() {
  memoryShown = true
  els.scroll.scrollTop = 0
  view.glare = 1
  els.memory.classList.add('is-open')
  els.memory.setAttribute('aria-hidden', 'false')
  els.memory.inert = false
  els.universe.inert = true
  els.memory.focus({ preventScroll: true })
}

function closeMemory() {
  if (openIndex === -1 || closingMemory) return
  closingMemory = true
  memoryShown = false
  view.glare = 1
  els.memory.classList.remove('is-open')
  els.memory.setAttribute('aria-hidden', 'true')
  els.memory.inert = true
  els.universe.inert = false
  focusTarget = 0
  dimTarget = 0
  if (/^#star-\d+$/.test(window.location.hash)) {
    history.replaceState(null, '', window.location.pathname + window.location.search)
  }

  const finish = () => {
    openIndex = -1
    closingMemory = false
    if (returnFocus?.classList.contains('star-label')) returnFocus.focus({ preventScroll: true })
    returnFocus = null
  }
  const back = savedCam ?? view.home
  if (view.reduce) {
    flight = null
    view.cam = { ...back }
    finish()
  } else {
    fly(back, 1.7, finish, 0.2)
  }
}

/** Closing through the browser history keeps the iPhone back-swipe working. */
function requestClose() {
  if (history.state && typeof history.state.star === 'number') history.back()
  else closeMemory()
}

window.addEventListener('popstate', () => {
  if (openIndex !== -1) closeMemory()
})

function parseStarHash() {
  const match = /^#star-(\d+)$/.exec(window.location.hash)
  return match ? Number(match[1]) - 1 : -1
}

els.scroll.addEventListener('scroll', () => {
  view.glare = 1 - clamp(els.scroll.scrollTop / 240, 0, 0.8)
})

els.close.addEventListener('click', requestClose)
els.back.addEventListener('click', requestClose)
els.home.addEventListener('click', goHome)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openIndex !== -1) requestClose()
})

/* ---------- Touch, mouse and trackpad ---------- */

const pointers = new Map()
let gesture = null
let lastTap = { t: 0, x: 0, y: 0 }

function onTap(x, y) {
  const hit = hitTest(x, y)
  if (hit !== -1) {
    openMemory(hit)
    return
  }
  const now = performance.now()
  if (now - lastTap.t < 330 && Math.hypot(x - lastTap.x, y - lastTap.y) < 40) {
    lastTap.t = 0
    goHome()
  } else {
    lastTap = { t: now, x, y }
  }
}

els.universe.addEventListener('pointerdown', (e) => {
  if (openIndex !== -1 || e.target.closest('.home')) return
  if (e.pointerType === 'mouse' && e.button !== 0) return
  try {
    els.universe.setPointerCapture(e.pointerId)
  } catch {
    /* The pointer may already be gone. */
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  stopMotion()
  if (pointers.size === 1) {
    gesture = { x: e.clientX, y: e.clientY, moved: false, multi: false }
  } else if (gesture) {
    gesture.multi = true
  }
})

els.universe.addEventListener('pointermove', (e) => {
  if (openIndex !== -1) return
  const prev = pointers.get(e.pointerId)

  if (!prev) {
    if (e.pointerType === 'mouse') {
      view.hover = hitTest(e.clientX, e.clientY)
      els.universe.style.cursor = view.hover === -1 ? 'grab' : 'pointer'
    }
    return
  }

  if (pointers.size === 1) {
    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (!gesture.moved) {
      const threshold = e.pointerType === 'touch' ? 9 : 4
      if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) < threshold) return
      gesture.moved = true
      interacted = true
      view.hover = -1
      if (e.pointerType === 'mouse') els.universe.style.cursor = 'grabbing'
    }
    pan(dx, dy)
    const now = performance.now()
    const dt = Math.max(1, now - lastMoveAt) / 1000
    lastMoveAt = now
    velocity.x = lerp(velocity.x, dx / dt, 0.35)
    velocity.y = lerp(velocity.y, dy / dt, 0.35)
    return
  }

  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    const prevMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const prevDist = Math.hypot(a.x - b.x, a.y - b.y)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const [c, d] = [...pointers.values()]
    const mid = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 }
    const dist = Math.hypot(c.x - d.x, c.y - d.y)
    if (prevDist > 0) zoomAt(mid.x, mid.y, dist / prevDist)
    pan(mid.x - prevMid.x, mid.y - prevMid.y)
    gesture.moved = true
    interacted = true
    velocity = { x: 0, y: 0 }
  }
})

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return
  pointers.delete(e.pointerId)
  if (pointers.size > 0 || !gesture) return
  if (!gesture.moved && !gesture.multi && e.type === 'pointerup') {
    onTap(e.clientX, e.clientY)
  } else if (view.reduce || gesture.multi || performance.now() - lastMoveAt > 90) {
    velocity = { x: 0, y: 0 }
  }
  if (e.pointerType === 'mouse') els.universe.style.cursor = 'grab'
  gesture = null
}

els.universe.addEventListener('pointerup', endPointer)
els.universe.addEventListener('pointercancel', endPointer)
els.universe.addEventListener('pointerleave', () => {
  if (!pointers.size) view.hover = -1
})

els.universe.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault()
    if (openIndex !== -1) return
    const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? view.H : 1
    const factor = Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.012 : 0.0016))
    stopMotion()
    interacted = true
    zoomAt(e.clientX, e.clientY, factor)
  },
  { passive: false },
)

for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false })
}

/* ---------- Every frame ---------- */

function updateIntro(elapsed) {
  view.reveal = easeOut(clamp(elapsed / 2.4, 0, 1))
  for (const s of view.stars) {
    const p = elapsed - s.at
    s.appear = easeOut(clamp(p / 0.9, 0, 1))
    s.line = view.reduce ? (p > 0 ? 1 : 0) : easeInOut(clamp((p - 0.1) / 1.2, 0, 1))
    s.born = s.newborn && !view.reduce ? clamp(p / 2.4, 0, 1) : 0
  }
}

function updateDom(elapsed) {
  const { W } = view
  const calm = openIndex === -1 && view.dim < 0.03

  els.title.classList.toggle('is-visible', calm && elapsed > 0.3)
  els.title.style.transform = `translate3d(${(toScreenX(titleAnchor.x) - W / 2).toFixed(1)}px, ${(
    toScreenY(titleAnchor.y) - titleSize.h
  ).toFixed(1)}px, 0)`

  const b = view.bounds
  els.closing.classList.toggle('is-visible', calm && elapsed > lastStarAt + 2.2)
  els.closing.style.transform = `translate3d(${(toScreenX((b.minX + b.maxX) / 2) - closingSize.w / 2).toFixed(
    1,
  )}px, ${(toScreenY(b.maxY) + 62).toFixed(1)}px, 0)`

  if (!interacted && elapsed > lastStarAt + 1.4) els.hint.classList.add('is-visible')
  if (interacted && els.hint.classList.contains('is-visible') && openIndex === -1) {
    els.hint.classList.remove('is-visible')
  }

  for (const s of view.stars) {
    const visible = calm && !!s.place && s.appear > 0.6
    if (visible !== s.visible) {
      s.visible = visible
      s.el.classList.toggle('is-visible', visible)
    }
    s.el.classList.toggle('is-hover', s.index === view.hover)
    if (!s.place) continue
    const transform = `translate3d(${(toScreenX(s.x) + s.place.dx).toFixed(1)}px, ${(
      toScreenY(s.y) + s.place.dy
    ).toFixed(1)}px, 0)`
    if (transform !== s.transform) {
      s.transform = transform
      s.el.style.transform = transform
    }
  }

  const { cam, home, homeZ, H } = view
  const dx = (home.x - cam.x) * cam.z
  const dy = (home.y - cam.y) * cam.z
  const ratio = cam.z / homeZ
  const lost = Math.abs(dx) > W * 0.42 || Math.abs(dy) > H * 0.36 || ratio < 0.55 || ratio > 2.3
  els.home.classList.toggle('is-visible', calm && !flight && lost)
}

function frame(ms) {
  const now = ms / 1000
  const dt = clamp(now - lastFrame, 0, 0.05)
  lastFrame = now
  const elapsed = now - introStart
  const prevZ = view.cam.z

  updateIntro(elapsed)
  updateFlight(now)

  if (!flight && !pointers.size && Math.abs(velocity.x) + Math.abs(velocity.y) > 4) {
    pan(velocity.x * dt, velocity.y * dt)
    const decay = Math.exp(-dt * 4.2)
    velocity.x *= decay
    velocity.y *= decay
  }

  if (pendingHashStar !== -1 && elapsed > (view.reduce ? 0.3 : 1.6)) {
    const index = pendingHashStar
    pendingHashStar = -1
    if (view.stars[index]) openMemory(index, { fromHash: true })
  }
  if (openIndex !== -1 && !memoryShown && !closingMemory && now >= memoryShowAt) showMemory()

  const k = view.reduce ? 8 : dimTarget > view.dim ? 1.5 : 2.2
  view.dim += (dimTarget - view.dim) * (1 - Math.exp(-dt * k))
  view.focus += (focusTarget - view.focus) * (1 - Math.exp(-dt * (view.reduce ? 8 : 1.6)))
  if (openIndex === -1 && view.focus < 0.01) view.focusIndex = -1

  const zoomRate = dt > 0 ? Math.abs(Math.log(view.cam.z / prevZ)) / dt : 0
  const warpTarget = flight && !view.reduce ? clamp(zoomRate * 0.5, 0, 1) : 0
  view.warp += (warpTarget - view.warp) * Math.min(1, dt * 7)

  const drift = Math.abs(view.cam.x - placedAt.x) * view.cam.z
  if (Math.abs(Math.log(view.cam.z / placedAtZ)) > 0.04 || drift > 24) placeLabels()

  sky.draw(view, now, dt)
  updateDom(elapsed)
  requestAnimationFrame(frame)
}

/* ---------- Begin ---------- */

build()
createLabels()
scheduleIntro()
resize()
window.addEventListener('resize', resize)
document.fonts?.ready.then(() => {
  measure()
  computeHome()
  if (!interacted && openIndex === -1) view.cam = { ...view.home }
  placeLabels()
})
requestAnimationFrame((ms) => {
  introStart = ms / 1000
  lastFrame = introStart
  frame(ms)
})
