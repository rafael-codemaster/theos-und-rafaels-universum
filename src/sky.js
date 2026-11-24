import { random } from './layout.js'

const TAU = Math.PI * 2
const STAR_COLORS = ['255,255,255', '214,224,255', '255,238,214', '206,196,255']
const NEBULA_COLORS = ['118,72,196', '52,84,200', '30,44,128', '150,76,170', '82,56,160']
const LAYERS = [0.03, 0.08, 0.16]
const TILE_MARGIN = 120

function sprite(size, stops) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const r = size / 2
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  for (const [offset, color] of stops) grad.addColorStop(offset, color)
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return c
}

/** A soft four-pointed sparkle laid over each memory star. */
function flareSprite(size) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const r = size / 2
  for (const horizontal of [true, false]) {
    const grad = horizontal ? g.createLinearGradient(0, r, size, r) : g.createLinearGradient(r, 0, r, size)
    grad.addColorStop(0, 'rgba(255,236,200,0)')
    grad.addColorStop(0.5, 'rgba(255,246,228,0.9)')
    grad.addColorStop(1, 'rgba(255,236,200,0)')
    g.fillStyle = grad
    if (horizontal) g.fillRect(0, r - 0.75, size, 1.5)
    else g.fillRect(r - 0.75, 0, 1.5, size)
  }
  return c
}

function makeNebula() {
  const clouds = [
    { x: -340, y: -460, spread: 380, n: 7 },
    { x: 460, y: 260, spread: 440, n: 7 },
    { x: -220, y: 640, spread: 360, n: 6 },
    { x: 820, y: -720, spread: 380, n: 5 },
    { x: -980, y: 160, spread: 420, n: 6 },
    { x: 120, y: -1100, spread: 400, n: 5 },
  ]
  const blobs = []
  let seed = 5000
  for (const c of clouds) {
    for (let i = 0; i < c.n; i++) {
      blobs.push({
        x: c.x + (random(seed++) - 0.5) * c.spread * 2,
        y: c.y + (random(seed++) - 0.5) * c.spread * 1.6,
        r: 160 + random(seed++) * 320,
        color: Math.floor(random(seed++) * NEBULA_COLORS.length),
        a: 0.08 + random(seed++) * 0.13,
        phase: random(seed++) * TAU,
      })
    }
  }
  // A faint diagonal band, like a distant milky way.
  for (let i = 0; i < 14; i++) {
    const f = i / 13 - 0.5
    blobs.push({
      x: f * 2600 + (random(seed++) - 0.5) * 160,
      y: f * 1900 + (random(seed++) - 0.5) * 160,
      r: 160 + random(seed++) * 200,
      color: i % 2 ? 1 : 2,
      a: 0.035 + random(seed++) * 0.04,
      phase: random(seed++) * TAU,
    })
  }
  return blobs
}

export function createSky(canvas) {
  const ctx = canvas.getContext('2d')
  const glow = sprite(128, [
    [0, 'rgba(255,250,240,1)'],
    [0.07, 'rgba(255,238,206,0.92)'],
    [0.2, 'rgba(240,202,140,0.38)'],
    [0.5, 'rgba(220,176,112,0.08)'],
    [1, 'rgba(220,176,112,0)'],
  ])
  const coolGlow = sprite(64, [
    [0, 'rgba(240,244,255,0.85)'],
    [0.22, 'rgba(196,206,255,0.25)'],
    [1, 'rgba(170,180,255,0)'],
  ])
  const nebulaSprites = NEBULA_COLORS.map((c) =>
    sprite(256, [
      [0, `rgba(${c},1)`],
      [0.35, `rgba(${c},0.55)`],
      [0.7, `rgba(${c},0.14)`],
      [1, `rgba(${c},0)`],
    ]),
  )
  const flare = flareSprite(128)
  const blobs = makeNebula()

  let W = 0
  let H = 0
  let background = null
  let bgStars = []
  const shooting = []
  let nextShootingStar = 0

  function resize(width, height) {
    W = width
    H = height
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    background = ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.9)
    background.addColorStop(0, '#0a0e26')
    background.addColorStop(0.5, '#05071a')
    background.addColorStop(1, '#010106')

    const tw = W + TILE_MARGIN * 2
    const th = H + TILE_MARGIN * 2
    const count = Math.min(520, Math.round((tw * th) / 2300))
    bgStars = Array.from({ length: count }, (_, i) => {
      const layer = i % 6 === 0 ? 2 : i % 3 === 0 ? 1 : 0
      const bright = layer === 2 && Math.random() < 0.22
      return {
        x: Math.random() * tw,
        y: Math.random() * th,
        layer,
        r: bright ? 1.1 + Math.random() * 0.5 : 0.3 + layer * 0.3 + Math.random() * 0.45,
        a: 0.35 + Math.random() * 0.55,
        twinkle: Math.random() < 0.4 ? 0.4 + Math.random() * 0.5 : 0.08 + Math.random() * 0.2,
        speed: 0.4 + Math.random() * 1.6,
        phase: Math.random() * TAU,
        color: bright ? 0 : Math.floor(Math.random() * STAR_COLORS.length),
        bright,
      }
    }).sort((a, b) => a.color - b.color)
  }

  function drawNebula(v, t, alpha) {
    const k = Math.pow(v.cam.z / v.homeZ, 0.28)
    const ox = v.cam.x * v.homeZ * 0.3
    const oy = v.cam.y * v.homeZ * 0.3
    ctx.globalCompositeOperation = 'lighter'
    for (const b of blobs) {
      const drift = v.reduce ? 0 : Math.sin(t * 0.05 + b.phase) * 14
      const x = W / 2 + (b.x - ox + drift) * k
      const y = H / 2 + (b.y - oy + drift * 0.6) * k
      const r = b.r * k
      if (x + r < 0 || x - r > W || y + r < 0 || y - r > H) continue
      ctx.globalAlpha = b.a * alpha
      ctx.drawImage(nebulaSprites[b.color], x - r, y - r, r * 2, r * 2)
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  function drawBackgroundStars(v, t, alpha) {
    const tw = W + TILE_MARGIN * 2
    const th = H + TILE_MARGIN * 2
    const cx = W / 2
    const cy = H / 2
    const zoom = v.cam.z / v.homeZ
    const layers = LAYERS.map((p) => ({
      ox: v.cam.x * v.homeZ * p * 3,
      oy: v.cam.y * v.homeZ * p * 3,
      k: Math.min(1.6, Math.max(0.92, 1 + (zoom - 1) * p * 1.5)),
    }))
    const warp = v.warp
    let color = -1
    ctx.lineCap = 'round'
    for (const s of bgStars) {
      const L = layers[s.layer]
      let x = (((s.x - L.ox) % tw) + tw) % tw - TILE_MARGIN
      let y = (((s.y - L.oy) % th) + th) % th - TILE_MARGIN
      x = cx + (x - cx) * L.k
      y = cy + (y - cy) * L.k
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue

      const tw0 = Math.sin(t * s.speed + s.phase)
      const depth = v.reduce ? s.twinkle * 0.3 : s.twinkle
      const a = s.a * (1 - depth * (0.5 + 0.5 * tw0)) * alpha
      if (a < 0.02) continue

      if (s.color !== color) {
        color = s.color
        ctx.fillStyle = `rgb(${STAR_COLORS[color]})`
        ctx.strokeStyle = ctx.fillStyle
      }
      ctx.globalAlpha = a
      if (warp > 0.02) {
        const len = warp * (0.12 + s.layer * 0.1)
        ctx.lineWidth = s.r * 1.4
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + (x - cx) * len, y + (y - cy) * len)
        ctx.stroke()
      } else if (s.r < 0.9) {
        ctx.fillRect(x - s.r, y - s.r, s.r * 2, s.r * 2)
      } else {
        ctx.beginPath()
        ctx.arc(x, y, s.r, 0, TAU)
        ctx.fill()
      }
      if (s.bright) {
        const g = 10 + tw0 * 2.5
        ctx.globalAlpha = a * 0.7
        ctx.drawImage(coolGlow, x - g, y - g, g * 2, g * 2)
      }
    }
    ctx.globalAlpha = 1
  }

  function drawShootingStars(v, t, dt) {
    const allowed = !v.reduce && v.dim < 0.05 && v.warp < 0.02 && v.reveal > 0.9
    if (allowed && t > nextShootingStar) {
      if (nextShootingStar) {
        const fromLeft = Math.random() < 0.5
        const angle = fromLeft ? 0.35 + Math.random() * 0.35 : Math.PI - 0.35 - Math.random() * 0.35
        const speed = 420 + Math.random() * 260
        shooting.push({
          x: fromLeft ? Math.random() * W * 0.55 : W * (0.45 + Math.random() * 0.55),
          y: Math.random() * H * 0.45,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          age: 0,
          life: 1.1 + Math.random() * 0.7,
          length: 90 + Math.random() * 90,
        })
      }
      nextShootingStar = t + 6 + Math.random() * 10
    }
    for (let i = shooting.length - 1; i >= 0; i--) {
      const s = shooting[i]
      s.age += dt
      s.x += s.vx * dt
      s.y += s.vy * dt
      const p = s.age / s.life
      if (p >= 1) {
        shooting.splice(i, 1)
        continue
      }
      const fade = (p < 0.15 ? p / 0.15 : 1 - Math.pow((p - 0.15) / 0.85, 2)) * (1 - v.dim)
      const speed = Math.hypot(s.vx, s.vy)
      const tx = s.x - (s.vx / speed) * s.length
      const ty = s.y - (s.vy / speed) * s.length
      const grad = ctx.createLinearGradient(s.x, s.y, tx, ty)
      grad.addColorStop(0, `rgba(255,248,232,${0.9 * fade})`)
      grad.addColorStop(0.3, `rgba(228,197,140,${0.4 * fade})`)
      grad.addColorStop(1, 'rgba(228,197,140,0)')
      ctx.strokeStyle = grad
      ctx.lineWidth = 1.4
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(tx, ty)
      ctx.stroke()
      ctx.globalAlpha = fade
      ctx.drawImage(coolGlow, s.x - 9, s.y - 9, 18, 18)
      ctx.globalAlpha = 1
    }
  }

  function drawMemoryStar(x, y, scale, alpha, t, phase, reduce) {
    const pulse = reduce ? 1 : 1 + 0.09 * Math.sin(t * 1.25 + phase)
    const r = 28 * scale * pulse
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = alpha * 0.95
    ctx.drawImage(glow, x - r, y - r, r * 2, r * 2)
    const f = r * (1.15 + (reduce ? 0 : 0.12 * Math.sin(t * 0.7 + phase * 2)))
    ctx.globalAlpha = alpha * 0.5
    ctx.drawImage(flare, x - f, y - f, f * 2, f * 2)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = alpha
    ctx.fillStyle = '#fffaf0'
    ctx.beginPath()
    ctx.arc(x, y, 1.9 * scale, 0, TAU)
    ctx.fill()
  }

  function draw(v, t, dt) {
    const { cam } = v
    const z = cam.z
    const sx = (wx) => (wx - cam.x) * z + W / 2
    const sy = (wy) => (wy - cam.y) * z + H / 2
    const scale = Math.min(1.9, Math.max(0.75, Math.sqrt(z / v.homeZ)))

    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = background
    ctx.fillRect(0, 0, W, H)

    drawNebula(v, t, v.reveal)
    drawBackgroundStars(v, t, v.reveal)
    drawShootingStars(v, t, dt)

    // Tiny distant stars: memories we have yet to make.
    for (const d of v.dust) {
      const x = sx(d.x)
      const y = sy(d.y)
      if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue
      const a = d.a * (v.reduce ? 0.85 : 0.6 + 0.4 * Math.sin(t * d.speed + d.phase)) * v.reveal
      const r = d.r * Math.min(1.6, scale)
      ctx.globalAlpha = a
      ctx.fillStyle = d.warm ? 'rgb(255,226,180)' : 'rgb(222,226,255)'
      ctx.beginPath()
      ctx.arc(x, y, r, 0, TAU)
      ctx.fill()
    }

    // The quiet places where our next memories will appear.
    ctx.globalCompositeOperation = 'lighter'
    for (const w of v.waiting) {
      const x = sx(w.x)
      const y = sy(w.y)
      if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue
      const a = (v.reduce ? 0.16 : 0.1 + 0.08 * Math.sin(t * 0.45 + w.phase)) * v.reveal
      const r = 11 * scale
      ctx.globalAlpha = a
      ctx.drawImage(glow, x - r, y - r, r * 2, r * 2)
    }
    ctx.globalCompositeOperation = 'source-over'

    // Golden constellation lines.
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.min(1.4, 0.85 * scale)
    for (const [ai, bi] of v.edges) {
      const a = v.stars[ai]
      const b = v.stars[bi]
      const p = Math.min(a.appear, b.line)
      if (p <= 0) continue
      const ax = sx(a.x)
      const ay = sy(a.y)
      const bx = sx(b.x)
      const by = sy(b.y)
      const len = Math.hypot(bx - ax, by - ay)
      if (len < 24) continue
      const gap = Math.min(10 * scale, len * 0.2)
      const ux = (bx - ax) / len
      const uy = (by - ay) / len
      const x1 = ax + ux * gap
      const y1 = ay + uy * gap
      const x2 = x1 + (bx - ux * gap - x1) * p
      const y2 = y1 + (by - uy * gap - y1) * p
      const shimmer = v.reduce ? 1 : 0.85 + 0.15 * Math.sin(t * 0.6 + ai + bi)
      ctx.globalAlpha = 0.34 * shimmer
      ctx.strokeStyle = 'rgb(232,196,132)'
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }

    // Memory stars.
    for (const s of v.stars) {
      if (s.appear <= 0 || s.index === v.focusIndex) continue
      const x = sx(s.x)
      const y = sy(s.y)
      if (x < -60 || x > W + 60 || y < -60 || y > H + 60) continue
      const hover = s.index === v.hover ? 1.22 : 1
      drawMemoryStar(x, y, scale * hover * (0.4 + 0.6 * s.appear), s.appear, t, s.phase, v.reduce)
      if (s.born > 0 && s.born < 1) {
        ctx.globalAlpha = (1 - s.born) * 0.6
        ctx.strokeStyle = 'rgb(236,204,146)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(x, y, 8 + s.born * 70 * scale, 0, TAU)
        ctx.stroke()
      }
    }

    // The rest of the universe fades away while a memory is open.
    if (v.dim > 0.001) {
      ctx.globalAlpha = v.dim * 0.8
      ctx.fillStyle = 'rgb(3,4,11)'
      ctx.fillRect(0, 0, W, H)
    }

    const focused = v.stars[v.focusIndex]
    if (focused && focused.appear > 0) {
      const x = sx(focused.x)
      const y = sy(focused.y)
      const halo = 90 * scale * v.focus
      if (halo > 1) {
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 0.22 * v.focus * v.glare
        ctx.drawImage(glow, x - halo, y - halo, halo * 2, halo * 2)
        ctx.globalCompositeOperation = 'source-over'
      }
      drawMemoryStar(x, y, scale * (1 + v.focus * 0.9), focused.appear * v.glare, t, focused.phase, v.reduce)
    }

    ctx.globalAlpha = 1
  }

  return { resize, draw }
}
