/**
 * 절차적 PBR 텍스처 — 실사화 레이어
 *
 * 규칙 하나: 텍스처는 전부 중성 회색으로 굽는다. 색은 재질의 color 로 곱한다.
 * 그래서 재질군 11개만 구우면 캠퍼스 전체 색 팔레트를 그대로 쓸 수 있다.
 *
 * campus.js textures.js에서 포팅. Canvas 2D → THREE.CanvasTexture.
 */
import * as THREE from 'three'

const SIZE = 512

const rnd = (s: number) => {
  let x = s
  return () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296)
}

function cv(size = SIZE) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

function wrap(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, draw: (a: number, b: number) => void) {
  const S = ctx.canvas.width
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx && Math.abs(x + dx * S - S / 2) > S / 2 + r) continue
      if (dy && Math.abs(y + dy * S - S / 2) > S / 2 + r) continue
      draw(x + dx * S, y + dy * S)
    }
  }
}

const g = (v: number) => `rgb(${v | 0},${v | 0},${v | 0})`
const ga = (v: number, a: number) => `rgba(${v | 0},${v | 0},${v | 0},${a})`

/* ── 재질군별 알베도 ── */

function terrazzo(seed: number) {
  const c = cv(), x = c.getContext('2d')!, R = rnd(seed)
  x.fillStyle = g(188); x.fillRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < 5200; i++) {
    const v = R()
    x.fillStyle = v > 0.8 ? ga(96, 0.3) : v > 0.5 ? ga(232, 0.22) : ga(162, 0.16)
    const s = 3 + R() * 3
    x.fillRect(R() * SIZE, R() * SIZE, s, s)
  }
  for (let i = 0; i < 760; i++) {
    const px = R() * SIZE, py = R() * SIZE, r = 2.4 + R() * 6
    wrap(x, px, py, r, (a, b) => {
      x.fillStyle = ga(R() < 0.45 ? 108 : 236, 0.3); x.beginPath()
      x.ellipse(a, b, r, r * (0.6 + R() * 0.7), R() * 3.14, 0, 6.283); x.fill()
    })
  }
  x.strokeStyle = ga(118, 0.55); x.lineWidth = 2.4
  for (const p of [0, SIZE / 2]) { x.beginPath(); x.moveTo(p, 0); x.lineTo(p, SIZE); x.moveTo(0, p); x.lineTo(SIZE, p); x.stroke() }
  for (let i = 0; i < 16; i++) {
    const px = R() * SIZE, py = R() * SIZE, r = 30 + R() * 70
    const grd = x.createRadialGradient(px, py, 0, px, py, r)
    grd.addColorStop(0, ga(206, 0.07)); grd.addColorStop(1, ga(206, 0))
    x.fillStyle = grd; x.fillRect(px - r, py - r, r * 2, r * 2)
  }
  return c
}

function plank(seed: number) {
  const c = cv(), x = c.getContext('2d')!, R = rnd(seed)
  const rows = 4, h = SIZE / rows
  for (let r0 = 0; r0 < rows; r0++) {
    const base = 168 + R() * 34
    x.fillStyle = g(base); x.fillRect(0, r0 * h, SIZE, h)
    for (let i = 0; i < 220; i++) {
      const y = r0 * h + R() * h
      x.strokeStyle = ga(base + (R() - 0.5) * 46, 0.32); x.lineWidth = 0.6 + R() * 1.4
      x.beginPath(); x.moveTo(0, y)
      for (let px = 0; px <= SIZE; px += 32) x.lineTo(px, y + Math.sin(px * 0.02 + r0) * 1.6 + (R() - 0.5) * 1.2)
      x.stroke()
    }
    x.strokeStyle = ga(112, 0.75); x.lineWidth = 1.6
    x.beginPath(); x.moveTo(0, r0 * h); x.lineTo(SIZE, r0 * h); x.stroke()
    const jx = R() * SIZE
    x.strokeStyle = ga(120, 0.5); x.lineWidth = 1.2
    x.beginPath(); x.moveTo(jx, r0 * h); x.lineTo(jx, r0 * h + h); x.stroke()
  }
  return c
}

function tile(seed: number) {
  const c = cv(), x = c.getContext('2d')!, R = rnd(seed)
  const n = 8, s = SIZE / n
  x.fillStyle = g(150); x.fillRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      x.fillStyle = g(196 + R() * 32)
      x.fillRect(i * s + 1.6, j * s + 1.6, s - 3.2, s - 3.2)
      const grd = x.createLinearGradient(i * s, j * s, i * s + s, j * s + s)
      grd.addColorStop(0, ga(255, 0.1)); grd.addColorStop(1, ga(120, 0.08))
      x.fillStyle = grd; x.fillRect(i * s + 1.6, j * s + 1.6, s - 3.2, s - 3.2)
    }
  }
  return c
}

function paint(seed: number) {
  const c = cv(), x = c.getContext('2d')!, R = rnd(seed)
  x.fillStyle = g(198); x.fillRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < 190; i++) {
    const px = R() * SIZE, py = R() * SIZE, r = 30 + R() * 110
    const grd = x.createRadialGradient(px, py, 0, px, py, r)
    const v = R() < 0.5 ? 186 : 210
    grd.addColorStop(0, ga(v, 0.2)); grd.addColorStop(1, ga(v, 0))
    x.fillStyle = grd; x.fillRect(px - r, py - r, r * 2, r * 2)
  }
  for (let i = 0; i < 900; i++) {
    const py = R() * SIZE
    x.strokeStyle = ga(190 + R() * 22, 0.14); x.lineWidth = 0.7
    x.beginPath(); x.moveTo(0, py); x.lineTo(SIZE, py + (R() - 0.5) * 3); x.stroke()
  }
  const d = x.getImageData(0, 0, SIZE, SIZE)
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (R() - 0.5) * 9
    d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n
  }
  x.putImageData(d, 0, 0)
  return c
}

function concrete(seed: number) {
  const c = cv(), x = c.getContext('2d')!, R = rnd(seed)
  x.fillStyle = g(176); x.fillRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < 420; i++) {
    const px = R() * SIZE, py = R() * SIZE, r = 12 + R() * 90
    const grd = x.createRadialGradient(px, py, 0, px, py, r)
    const v = 150 + R() * 60
    grd.addColorStop(0, ga(v, 0.24)); grd.addColorStop(1, ga(v, 0))
    x.fillStyle = grd; x.fillRect(px - r, py - r, r * 2, r * 2)
  }
  for (let i = 0; i < 1400; i++) {
    const px = R() * SIZE, py = R() * SIZE, r = 0.6 + R() * 2.2
    wrap(x, px, py, r, (a, b) => { x.fillStyle = ga(132, 0.45); x.beginPath(); x.arc(a, b, r, 0, 6.283); x.fill() })
  }
  return c
}

function ceiltile(seed: number) {
  const c = cv(), x = c.getContext('2d')!, R = rnd(seed)
  const n = 4, s = SIZE / n
  x.fillStyle = g(206); x.fillRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      x.fillStyle = g(200 + R() * 16)
      x.fillRect(i * s + 3, j * s + 3, s - 6, s - 6)
    }
  }
  for (let i = 0; i < 5200; i++) {
    const px = R() * SIZE, py = R() * SIZE
    x.fillStyle = ga(176, 0.5); x.beginPath(); x.arc(px, py, 0.9, 0, 6.283); x.fill()
  }
  x.strokeStyle = ga(160, 0.9); x.lineWidth = 3
  for (let i = 0; i <= n; i++) {
    x.beginPath(); x.moveTo(i * s, 0); x.lineTo(i * s, SIZE); x.stroke()
    x.beginPath(); x.moveTo(0, i * s); x.lineTo(SIZE, i * s); x.stroke()
  }
  return c
}

function metal(seed: number) {
  const c = cv(), x = c.getContext('2d')!, R = rnd(seed)
  x.fillStyle = g(196); x.fillRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < 2800; i++) {
    const px = R() * SIZE, y0 = R() * SIZE, len = 40 + R() * 260
    x.strokeStyle = ga(R() > 0.5 ? 255 : 118, 0.03 + R() * 0.07)
    x.lineWidth = 0.5 + R()
    x.beginPath(); x.moveTo(px, y0); x.lineTo(px, y0 + len); x.stroke()
  }
  x.strokeStyle = ga(140, 0.4); x.lineWidth = 2
  x.beginPath(); x.moveTo(SIZE / 2, 0); x.lineTo(SIZE / 2, SIZE); x.stroke()
  return c
}

function woodgrain(seed: number) {
  const c = cv(), x = c.getContext('2d')!, R = rnd(seed)
  x.fillStyle = g(182); x.fillRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < 700; i++) {
    const px = R() * SIZE
    x.strokeStyle = ga(150 + R() * 60, 0.2); x.lineWidth = 0.7 + R() * 2
    x.beginPath(); x.moveTo(px, 0)
    for (let py = 0; py <= SIZE; py += 24) x.lineTo(px + Math.sin(py * 0.014 + i) * 3.2, py)
    x.stroke()
  }
  return c
}

function asphalt(seed: number) {
  const c = cv(), x = c.getContext('2d')!, R = rnd(seed)
  x.fillStyle = g(168); x.fillRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < 9000; i++) {
    const px = R() * SIZE, py = R() * SIZE, r = 0.8 + R() * 3
    wrap(x, px, py, r, (a, b) => {
      x.fillStyle = ga(R() < 0.5 ? 138 : 202, 0.5); x.beginPath(); x.arc(a, b, r, 0, 6.283); x.fill()
    })
  }
  return c
}

function grass(seed: number) {
  const c = cv(), x = c.getContext('2d')!, R = rnd(seed)
  x.fillStyle = g(170); x.fillRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < 14000; i++) {
    const px = R() * SIZE, py = R() * SIZE, l = 2 + R() * 6
    x.strokeStyle = ga(120 + R() * 110, 0.42); x.lineWidth = 0.8
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + (R() - 0.5) * 2, py - l); x.stroke()
  }
  for (let i = 0; i < 90; i++) {
    const px = R() * SIZE, py = R() * SIZE, r = 20 + R() * 80
    const grd = x.createRadialGradient(px, py, 0, px, py, r)
    grd.addColorStop(0, ga(R() < 0.5 ? 140 : 200, 0.2)); grd.addColorStop(1, ga(170, 0))
    x.fillStyle = grd; x.fillRect(px - r, py - r, r * 2, r * 2)
  }
  return c
}

function fabric(_seed: number) {
  const c = cv(), x = c.getContext('2d')!
  x.fillStyle = g(184); x.fillRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < SIZE; i += 3) {
    x.strokeStyle = ga(166, 0.5); x.lineWidth = 1
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, SIZE); x.stroke()
    x.strokeStyle = ga(204, 0.4)
    x.beginPath(); x.moveTo(0, i); x.lineTo(SIZE, i); x.stroke()
  }
  return c
}

/* ── 파생 맵 ── */

function grayData(canvas: HTMLCanvasElement) {
  const x = canvas.getContext('2d')!
  const d = x.getImageData(0, 0, canvas.width, canvas.height).data
  const n = canvas.width
  const out = new Float32Array(n * n)
  for (let i = 0; i < n * n; i++) out[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255
  return out
}

function normalFrom(canvas: HTMLCanvasElement, strength: number) {
  const n = canvas.width, h = grayData(canvas)
  const c = cv(n), x = c.getContext('2d')!
  const img = x.createImageData(n, n)
  const at = (i: number, j: number) => h[((j + n) % n) * n + ((i + n) % n)]
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const dx = (at(i + 1, j) - at(i - 1, j)) * strength
      const dy = (at(i, j + 1) - at(i, j - 1)) * strength
      let nx = -dx, ny = -dy, nz = 1
      const l = Math.hypot(nx, ny, nz)
      nx /= l; ny /= l; nz /= l
      const k = (j * n + i) * 4
      img.data[k] = (nx * 0.5 + 0.5) * 255
      img.data[k + 1] = (ny * 0.5 + 0.5) * 255
      img.data[k + 2] = (nz * 0.5 + 0.5) * 255
      img.data[k + 3] = 255
    }
  }
  x.putImageData(img, 0, 0)
  return c
}

function roughFrom(canvas: HTMLCanvasElement, base: number, range: number) {
  const n = canvas.width, h = grayData(canvas)
  const c = cv(n), x = c.getContext('2d')!
  const img = x.createImageData(n, n)
  for (let i = 0; i < n * n; i++) {
    const v = Math.max(0, Math.min(1, base + (0.5 - h[i]) * range)) * 255
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  x.putImageData(img, 0, 0)
  return c
}

/* ── 재질군 정의 ── */

interface FamilyDef {
  make: (seed: number) => HTMLCanvasElement
  cover: number
  rough: number
  range: number
  metal: number
  nrm: number
  env?: number
}

const FAMILIES: Record<string, FamilyDef> = {
  terrazzo: { make: terrazzo, cover: 1.9, rough: 0.42, range: 0.035, metal: 0.04, nrm: 0.07, env: 0.8 },
  plank:    { make: plank,    cover: 2.4, rough: 0.46, range: 0.24,  metal: 0.0,  nrm: 0.62, env: 0.72 },
  tile:     { make: tile,     cover: 1.6, rough: 0.30, range: 0.24,  metal: 0.02, nrm: 1.15, env: 0.85 },
  paint:    { make: paint,    cover: 2.2, rough: 0.80, range: 0.14,  metal: 0.0,  nrm: 0.36, env: 0.6 },
  concrete: { make: concrete, cover: 2.2, rough: 0.93, range: 0.14,  metal: 0.0,  nrm: 1.0 },
  ceiltile: { make: ceiltile, cover: 2.4, rough: 0.95, range: 0.1,   metal: 0.0,  nrm: 0.7 },
  metal:    { make: metal,    cover: 1.6, rough: 0.32, range: 0.16,  metal: 0.86, nrm: 0.26, env: 1.0 },
  wood:     { make: woodgrain,cover: 1.8, rough: 0.62, range: 0.24,  metal: 0.0,  nrm: 0.7 },
  asphalt:  { make: asphalt,  cover: 4.0, rough: 0.95, range: 0.12,  metal: 0.0,  nrm: 1.2 },
  grass:    { make: grass,    cover: 3.0, rough: 0.94, range: 0.14,  metal: 0.0,  nrm: 1.0 },
  fabric:   { make: fabric,   cover: 1.2, rough: 0.97, range: 0.08,  metal: 0.0,  nrm: 0.6 },
}

/** PAL 색 이름 → 재질군. campus.js와 동기화. */
export const FAMILY_OF_PAL: Record<string, string> = {
  corrFloor: 'terrazzo', foodFloor: 'terrazzo', healthFloor: 'terrazzo', adminFloor: 'terrazzo', labFloor: 'terrazzo',
  toiletFloor: 'tile', kitchenFloor: 'tile', toiletWall: 'tile', kitchenWall: 'tile', healthWall: 'tile',
  classFloor: 'plank', wood: 'wood', door: 'wood', desk: 'wood',
  corrWall: 'paint', classWall: 'paint', labWall: 'paint', adminWall: 'paint', foodWall: 'paint',
  storeWall: 'paint', machWall: 'paint', wallOut: 'paint', white: 'paint', paper: 'paint',
  corrBase: 'paint', classBase: 'paint', labBase: 'paint', healthBase: 'paint', adminBase: 'paint',
  foodBase: 'paint', toiletBase: 'paint', storeBase: 'paint', machBase: 'paint', accentRed: 'paint', chalk: 'paint',
  ceil: 'ceiltile',
  slab: 'concrete', concrete: 'concrete', machFloor: 'concrete', storeFloor: 'concrete', wallOutBase: 'concrete', sand: 'concrete',
  steel: 'metal', rail: 'metal', locker: 'metal', doorFrame: 'metal', mullion: 'metal', deskLeg: 'metal', kitchenBase: 'metal',
  asphalt: 'asphalt', line: 'paint', corrLine: 'paint',
  grass: 'grass', dirt: 'concrete', rubber: 'fabric',
  fabric: 'fabric', chair: 'fabric',
}

export interface BakedFamily {
  map: THREE.CanvasTexture
  normalMap: THREE.CanvasTexture
  roughnessMap: THREE.CanvasTexture
  uvScale: number
  metalness: number
  roughness: number
  env: number
}

let CACHE: Record<string, BakedFamily> | null = null

/** 재질군 11개를 한 번만 굽는다. */
export function bakeFamilies(): Record<string, BakedFamily> {
  if (CACHE) return CACHE
  CACHE = {}
  let seed = 7
  for (const [name, f] of Object.entries(FAMILIES)) {
    const albedo = f.make((seed += 9173))
    const map = new THREE.CanvasTexture(albedo)
    const normalMap = new THREE.CanvasTexture(normalFrom(albedo, f.nrm * 3))
    const roughnessMap = new THREE.CanvasTexture(roughFrom(albedo, f.rough, f.range))
    map.name = name
    for (const t of [map, normalMap, roughnessMap]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.anisotropy = 8
      t.needsUpdate = true
    }
    if (THREE.SRGBColorSpace) map.colorSpace = THREE.SRGBColorSpace
    CACHE[name] = { map, normalMap, roughnessMap, uvScale: 1 / f.cover, metalness: f.metal, roughness: f.rough, env: f.env ?? 0.42 }
  }
  return CACHE
}

/**
 * 월드 좌표 UV 패치.
 * InstancedMesh는 단위 박스를 스케일해 쓰기 때문에 기본 UV를 그대로 두면
 * 8m 벽과 0.6m 문에 같은 텍셀 밀도가 걸린다. 면 법선의 주축으로 평면 투영해 해결.
 */
export function worldUV(material: THREE.MeshStandardMaterial, uvScale: number) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uUvScale = { value: uvScale }
    const targets = ['vMapUv', 'vNormalMapUv', 'vRoughnessMapUv', 'vUv']
      .filter((v) => new RegExp('\\b' + v + '\\s*=').test(sh.vertexShader))
    if (!targets.length) return
    const assign = targets.map((v) => `  ${v} = wuv * uUvScale;`).join('\n')
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uUvScale;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
{
  #ifdef USE_INSTANCING
    vec4 wpos = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vec3 wnrm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  #else
    vec4 wpos = modelMatrix * vec4(position, 1.0);
    vec3 wnrm = normalize(mat3(modelMatrix) * normal);
  #endif
  vec3 anrm = abs(wnrm);
  vec2 wuv;
  if (anrm.y >= anrm.x && anrm.y >= anrm.z) wuv = wpos.xz;
  else if (anrm.x >= anrm.z) wuv = vec2(wpos.z, wpos.y);
  else wuv = vec2(wpos.x, wpos.y);
${assign}
}`)
  }
  material.customProgramCacheKey = () => 'wuv' + uvScale.toFixed(4)
  return material
}

/** HEX 색상 → 재질군 이름. PAL 역매핑. */
export function familyForHex(hex: string, palReverse: Map<string, string>): string {
  const palName = palReverse.get(hex.toLowerCase())
  if (palName) {
    const family = FAMILY_OF_PAL[palName]
    if (family) return family
  }
  return 'paint'
}
