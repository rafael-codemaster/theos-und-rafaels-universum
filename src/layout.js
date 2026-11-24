const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/** Distance between neighbouring memories, in universe units. */
const SPACING = 100

/** How many empty places, waiting for future memories, are hinted at. */
const WAITING = 5

/** Stable pseudo-random number in [0, 1) for a given seed. */
export function random(seed) {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/**
 * Where the memory with this index lives. A star's place only depends on its
 * own index, so adding memories never moves the ones that already exist.
 * Stars spiral outwards from the first memory, like a growing galaxy.
 */
function positionOf(index, portrait) {
  const shape = portrait ? { x: 0.65, y: 1.2 } : { x: 1.15, y: 0.8 }
  const r = SPACING * Math.sqrt(index + (index ? 0.35 : 0))
  const a = index * GOLDEN_ANGLE + 1.1
  return {
    x: Math.cos(a) * r * shape.x + (random(index) - 0.5) * 0.4 * SPACING,
    y: Math.sin(a) * r * shape.y + (random(index + 50) - 0.5) * 0.4 * SPACING,
  }
}

export function buildUniverse(memories, portrait) {
  const stars = memories.map((memory, index) => ({
    ...memory,
    index,
    ...positionOf(index, portrait),
    phase: random(index + 7) * Math.PI * 2,
  }))

  // Each new star links to the closest older star, occasionally to a second
  // one, so existing constellation lines never change.
  const edges = []
  for (let i = 1; i < stars.length; i++) {
    const near = stars
      .slice(0, i)
      .map((s) => ({ s, d: Math.hypot(s.x - stars[i].x, s.y - stars[i].y) }))
      .sort((a, b) => a.d - b.d)
    edges.push([near[0].s.index, i])
    if (i % 3 === 0 && near[1] && near[1].d < near[0].d * 1.35) edges.push([near[1].s.index, i])
  }

  const waiting = Array.from({ length: WAITING }, (_, k) => {
    const p = positionOf(stars.length + k, portrait)
    return { ...p, phase: random(stars.length + k + 3) * Math.PI * 2 }
  })

  const xs = stars.map((s) => s.x)
  const ys = stars.map((s) => s.y)
  const bounds = stars.length
    ? { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
    : { minX: 0, maxX: 0, minY: 0, maxY: 0 }

  // Tiny faint stars: the memories we have yet to make.
  const dust = []
  const reach = 650 + SPACING * Math.sqrt(stars.length + WAITING) * 1.4
  for (let i = 0; dust.length < 260 && i < 900; i++) {
    const a = random(i * 3 + 1000) * Math.PI * 2
    const r = Math.sqrt(random(i * 3 + 1001)) * reach
    const x = Math.cos(a) * r * (portrait ? 0.75 : 1.2)
    const y = Math.sin(a) * r * (portrait ? 1.25 : 0.85)
    const tooClose = stars.some((s) => Math.hypot(s.x - x, s.y - y) < 34)
    if (tooClose) continue
    dust.push({
      x,
      y,
      r: 0.45 + random(i * 3 + 1002) * 0.8,
      a: 0.16 + random(i + 1500) * 0.34,
      speed: 0.3 + random(i + 1600) * 0.9,
      phase: random(i + 1700) * Math.PI * 2,
      warm: random(i + 1800) < 0.3,
    })
  }

  return { stars, edges, waiting, dust, bounds }
}
