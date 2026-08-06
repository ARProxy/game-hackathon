/* oxlint-disable no-unused-vars */
/**
 * campus.js — 야간 학교 캠퍼스 v4 (120×120)
 * 본관: ㅁ자 3층 + 지하 1층 + 옥상 / 중정 40×24 / 순환 복도 4.2m
 * 기존 SchoolCampus.tsx의 하드코딩 배열 대신, 실제 치수 스키마에서 절차적으로 생성한다.
 *
 * 산출물
 *   solids   : 충돌 있는 박스   {f,p,s,c,rot?,ramp?,hide?}
 *   visuals  : 충돌 없는 박스   {f,p,s,c,e?,rot?}
 *   plates   : 바닥/라인 평면    {f,p,s,c,rot?}
 *   cyls     : 원기둥           {f,p,r,h,c,rot?}
 *   fixtures : 형광등/조명기구  {f,p,c,tone,dynamic}
 *   lamps    : 실외 가로등
 *   rooms    : 방 스키마 (평면도·미니맵·AI 구역 판단용)
 *   slots    : prop/trap/gate/spawn/patrol
 */

export const MAP_SIZE = 120
export const FLOOR_HEIGHT = 3.6
export const SLAB_T = 0.4
export const CEIL_H = 3.2
export const WT = 0.2
export const FLOOR_Y = { OUT: 0, B1: -3.6, F1: 0, F2: 3.6, F3: 7.2, ROOF: 10.8 }
export const FLOOR_ORDER = ['B1', 'F1', 'F2', 'F3', 'ROOF']
export const FLOOR_LABEL = { OUT: '실외', B1: '지하 1층', F1: '1층', F2: '2층', F3: '3층', ROOF: '옥상' }

/** 본관 외곽 / 중정 */
export const B = { x0: -56, x1: 8, z0: -58, z1: -10 }
export const COURT = { x0: -44, x1: -4, z0: -46, z1: -22 }

/** 윙별 밴드 — 외벽 → 실 → 칸막이 → 복도 → 중정벽 */
export const BAND = {
  N: { outer: -57.9, room: [-57.8, -50.6], part: -50.5, cor: [-50.4, -46.2], court: -46.1 },
  S: { court: -21.9, cor: [-21.8, -17.6], part: -17.5, room: [-17.4, -10.2], outer: -10.1 },
  W: { outer: -55.9, room: [-55.8, -48.6], part: -48.5, cor: [-48.4, -44.2], court: -44.1 },
  E: { court: -3.9, cor: [-3.8, 0.4], part: 0.5, room: [0.6, 7.8], outer: 7.9 },
}

/** 코어(계단실) 4곳 — 12×12 모서리 블록, 복도 링이 코어를 관통한다 */
export const CORES = [
  { id: 'core_nw', name: '북서 계단실', x: [-55.8, -48.6], z: [-57.8, -50.6], door: 'E' },
  { id: 'core_ne', name: '북동 계단실', x: [0.6, 7.8], z: [-57.8, -50.6], door: 'W' },
  { id: 'core_sw', name: '남서 계단실', x: [-55.8, -48.6], z: [-17.4, -10.2], door: 'E' },
  { id: 'core_se', name: '남동 계단실', x: [0.6, 7.8], z: [-17.4, -10.2], door: 'W' },
]

/** 재질 팔레트 — 벤치마크 §5. 야간 노출은 렌더러가 낮추고, 여기서는 실제 알베도를 쓴다 */
export const PAL = {
  corrFloor: '#8f9a95', corrBase: '#6f8290', corrWall: '#d6cfbe', corrLine: '#d8c15a',
  classFloor: '#a97f4e', classBase: '#c9bb9c', classWall: '#e0d9c6',
  labFloor: '#78899a', labBase: '#7f94a4', labWall: '#cfd6dc',
  healthFloor: '#c3cdc9', healthBase: '#a9cfc2', healthWall: '#e2ded0',
  adminFloor: '#8e857a', adminBase: '#8f8b84', adminWall: '#ded8c9',
  foodFloor: '#8d938e', foodBase: '#9aa0a2', foodWall: '#eceae4',
  kitchenFloor: '#7f8683', kitchenBase: '#b9c0c2', kitchenWall: '#eef1f2',
  toiletFloor: '#a9b1b5', toiletBase: '#7f929c', toiletWall: '#dfe4e6',
  storeFloor: '#6f6a63', storeBase: '#6d6a66', storeWall: '#b8b2a5',
  machFloor: '#5c6165', machBase: '#565c60', machWall: '#8d9398',
  ceil: '#cfd3d1', slab: '#585f64', concrete: '#767c80',
  wallOut: '#b9b2a2', wallOutBase: '#7d7a72',
  door: '#b49a6d', doorFrame: '#8b8f93', glass: '#8fb6c6', mullion: '#9aa1a6',
  steel: '#98a0a6', rail: '#a7aeb3', chalk: '#2e4a3a', white: '#e8e8e4',
  desk: '#c8a878', deskLeg: '#6d757e', chair: '#3f5a76', locker: '#8c99a5',
  wood: '#8a6a44', fabric: '#4b6d84', paper: '#ded6c2', accentRed: '#a8392f',
  grass: '#31502f', dirt: '#7a5b3a', asphalt: '#3f4448', line: '#e6e6e0',
  sand: '#9a8560', water: '#2f6f86', rubber: '#5b4a4a',
}

/** 방 종류별 재질 + 조명 톤 */
const KIND = {
  classroom: { f: 'classFloor', b: 'classBase', w: 'classWall', tone: 'warm' },
  lab: { f: 'labFloor', b: 'labBase', w: 'labWall', tone: 'cool' },
  computer: { f: 'labFloor', b: 'labBase', w: 'labWall', tone: 'cool' },
  health: { f: 'healthFloor', b: 'healthBase', w: 'healthWall', tone: 'soft' },
  admin: { f: 'adminFloor', b: 'adminBase', w: 'adminWall', tone: 'warm' },
  library: { f: 'classFloor', b: 'classBase', w: 'classWall', tone: 'soft' },
  music: { f: 'wood', b: 'classBase', w: 'classWall', tone: 'warm' },
  art: { f: 'labFloor', b: 'classBase', w: 'classWall', tone: 'cool' },
  av: { f: 'storeFloor', b: 'adminBase', w: 'adminWall', tone: 'soft' },
  broadcast: { f: 'storeFloor', b: 'adminBase', w: 'adminWall', tone: 'soft' },
  dance: { f: 'wood', b: 'classBase', w: 'classWall', tone: 'warm' },
  food: { f: 'foodFloor', b: 'foodBase', w: 'foodWall', tone: 'cool' },
  kitchen: { f: 'kitchenFloor', b: 'kitchenBase', w: 'kitchenWall', tone: 'cool' },
  store: { f: 'storeFloor', b: 'storeBase', w: 'storeWall', tone: 'dim' },
  duty: { f: 'classFloor', b: 'classBase', w: 'classWall', tone: 'warm' },
  machine: { f: 'machFloor', b: 'machBase', w: 'machWall', tone: 'dim' },
  toilet: { f: 'toiletFloor', b: 'toiletBase', w: 'toiletWall', tone: 'cool' },
  lobby: { f: 'corrFloor', b: 'corrBase', w: 'corrWall', tone: 'cool' },
  stair: { f: 'corrFloor', b: 'corrBase', w: 'corrWall', tone: 'cool' },
  corridor: { f: 'corrFloor', b: 'corrBase', w: 'corrWall', tone: 'cool' },
  service: { f: 'storeFloor', b: 'storeBase', w: 'storeWall', tone: 'dim' },
}
export const TONE = { warm: '#ffe6bd', cool: '#d5e8ff', soft: '#f0e9dd', dim: '#9fb0bd', amber: '#ffd6a0' }

/** 층별 실 배치. [id, 이름, kind, 베이수] — 윙 순서는 서→동 / 북→남 */
const PROGRAM = {
  F1: {
    N: [['staff', '교무실', 'admin'], ['admin', '행정실', 'admin'], ['principal', '교장실', 'admin'], ['meeting', '회의실', 'admin'], ['health', '보건실', 'health']],
    E: [['counsel', '상담실', 'admin'], ['print', '인쇄실', 'service'], ['safety', '방재실', 'service']],
    S: [['cafeteria', '급식실', 'food', 2], ['kitchen', '조리실', 'kitchen'], ['serving', '배식준비실', 'kitchen'], ['pantry', '식품창고', 'store']],
    W: [['duty', '숙직실', 'duty'], ['janitor', '청소용구실', 'store'], ['homeec', '가사실', 'lab']],
  },
  F2: {
    N: [['c21', '2학년 1반', 'classroom'], ['c22', '2학년 2반', 'classroom'], ['c23', '2학년 3반', 'classroom'], ['c24', '2학년 4반', 'classroom'], ['c25', '2학년 5반', 'classroom']],
    E: [['science', '과학실', 'lab'], ['sciprep', '과학준비실', 'store'], ['computer', '컴퓨터실', 'computer']],
    S: [['library', '도서실', 'library', 2], ['av', '시청각실', 'av'], ['english', '영어전용실', 'classroom'], ['multi', '다목적실', 'dance']],
    W: [['music', '음악실', 'music'], ['musicprep', '악기준비실', 'store'], ['art', '미술실', 'art']],
  },
  F3: {
    N: [['c31', '3학년 1반', 'classroom'], ['c32', '3학년 2반', 'classroom'], ['c33', '3학년 3반', 'classroom'], ['c34', '3학년 4반', 'classroom'], ['c35', '3학년 5반', 'classroom']],
    E: [['broadcast', '방송실', 'broadcast'], ['bcprep', '방송준비실', 'store'], ['career', '진로상담실', 'admin']],
    S: [['dance', '무용실', 'dance', 2], ['calli', '서예실', 'art'], ['earth', '지구과학실', 'lab'], ['club', '동아리실', 'classroom']],
    W: [['art2', '제2미술실', 'art'], ['pottery', '도예실', 'art'], ['store3', '교구창고', 'store']],
  },
}

/** 지하 1층 — 북측 윙 + 북측 코어 아래만 굴착 */
const B1_ROOMS = [
  { id: 'b1_mach', name: '기계실', kind: 'machine', x: [-43.8, -30], z: [-57.8, -50.6] },
  { id: 'b1_elec', name: '전기실', kind: 'machine', x: [-29.8, -20], z: [-57.8, -50.6] },
  { id: 'b1_foodstore', name: '급식창고', kind: 'store', x: [-19.8, -4], z: [-57.8, -50.6] },
  { id: 'b1_tank', name: '저수조실', kind: 'machine', x: [-55.8, -48.6], z: [-57.8, -50.6] },
  { id: 'b1_shelter', name: '방공호', kind: 'store', x: [0.6, 7.8], z: [-57.8, -50.6] },
]

const R = (x0, z0, x1, z1) => ({ x0, z0, x1, z1 })
const mid = (a, b) => (a + b) / 2

/* ─────────────────────────── 생성기 ─────────────────────────── */

/**
 * 방 상태 — 같은 교실이 반복되면 공간이 기억에 남지 않는다.
 * id 해시로 결정하므로 서버와 클라이언트가 같은 배치를 얻는다.
 */
export const ROOM_CONDITIONS = {
  intact: { w: 30, label: '정상', note: '기준 상태. 다른 방을 읽는 잣대가 된다' },
  messy: { w: 24, label: '책걸상 난장', note: '책상이 밀리고 넘어져 있다. 시야는 트이고 발이 걸린다' },
  stacked: { w: 12, label: '한쪽 적재', note: '책상을 구석에 쌓았다. 바닥이 비고 은폐물이 생긴다' },
  stripped: { w: 10, label: '비워짐', note: '가구가 없다. 눌린 자국만 남았다' },
  breach: { w: 14, label: '벽 파손', note: '복도 칸막이가 뚫렸다. 문을 거치지 않는 우회로' },
  collapse: { w: 10, label: '바닥 붕괴', note: '슬래브에 구멍. 아래층으로 떨어진다' },
}

function hash32(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function rngFrom(seed) {
  let x = seed || 1
  return () => ((x = (Math.imul(x ^ (x >>> 15), 2246822519) + 1) >>> 0) / 4294967296)
}

/** 붕괴는 아래층이 있어야 하고, 코어·설비실은 손대지 않는다 */
export function conditionFor(id, kind, floor) {
  const rr = rngFrom(hash32('cond:' + id))
  const pool = []
  for (const [key, v] of Object.entries(ROOM_CONDITIONS)) {
    if (key === 'collapse' && floor !== 'F2' && floor !== 'F3') continue
    if ((key === 'collapse' || key === 'breach') && (kind === 'stair' || kind === 'toilet' || kind === 'machine' || kind === 'broadcast')) continue
    pool.push([key, v.w])
  }
  const total = pool.reduce((a, p) => a + p[1], 0)
  let t = rr() * total
  for (const [key, w] of pool) { if ((t -= w) <= 0) return key }
  return 'intact'
}

export function buildCampus(opts = {}) {
  const SEED = opts.seed == null ? 0 : opts.seed | 0
  const solids = []
  const visuals = []
  const plates = []
  const cyls = []
  const fixtures = []
  const rooms = []
  const doors = []
  const dims = []   // 평면도 치수 라벨

  const S = (f, p, s, c, extra) => solids.push(Object.assign({ f, p, s, c }, extra))
  const V = (f, p, s, c, extra) => visuals.push(Object.assign({ f, p, s, c }, extra))
  const P = (f, p, s, c, rot, ceil) => plates.push({ f, p, s, c, rot, ceil })
  const CY = (f, p, r, h, c, rot) => cyls.push({ f, p, r, h, c, rot })
  const FX = (f, p, c, tone, dynamic) => fixtures.push({ f, p, c, tone, dynamic: !!dynamic })

  /* ── 방 상태 · 슬래브 구멍 ─────────────────────────────── */
  const COND = {}
  const BREACH_W = {}
  const HOLES = []
  const LEAKS = []   // 개구부 = 소리가 새는 구멍
  const holesOn = (f) => HOLES.filter((h) => h.f === f)

  /** 사각형에서 구멍을 빼고 남은 조각들 */
  function subtract(rect, holes) {
    let parts = [{ x0: rect.x0, z0: rect.z0, x1: rect.x1, z1: rect.z1 }]
    for (const h of holes) {
      const next = []
      for (const p of parts) {
        const ix0 = Math.max(p.x0, h.x0), ix1 = Math.min(p.x1, h.x1)
        const iz0 = Math.max(p.z0, h.z0), iz1 = Math.min(p.z1, h.z1)
        if (ix0 >= ix1 || iz0 >= iz1) { next.push(p); continue }
        if (p.z0 < iz0) next.push({ x0: p.x0, z0: p.z0, x1: p.x1, z1: iz0 })
        if (iz1 < p.z1) next.push({ x0: p.x0, z0: iz1, x1: p.x1, z1: p.z1 })
        if (p.x0 < ix0) next.push({ x0: p.x0, z0: iz0, x1: ix0, z1: iz1 })
        if (ix1 < p.x1) next.push({ x0: ix1, z0: iz0, x1: p.x1, z1: iz1 })
      }
      parts = next
    }
    return parts
  }

  /** 윙별 실 사각형 — 상태 사전계산과 실제 생성이 같은 수치를 쓴다 */
  function wingRects(f) {
    const prog = PROGRAM[f]
    if (!prog) return []
    const out = []
    for (const wing of ['N', 'S']) {
      const total = prog[wing].reduce((a, q) => a + (q[3] || 1), 0)
      const span = (COURT.x1 - COURT.x0) / total
      let x = COURT.x0
      for (const [id, name, kind, bay] of prog[wing]) {
        const wBay = span * (bay || 1)
        const rect = wing === 'N' ? R(x + 0.1, BAND.N.room[0], x + wBay - 0.1, BAND.N.room[1])
          : R(x + 0.1, BAND.S.room[0], x + wBay - 0.1, BAND.S.room[1])
        out.push({ rect, meta: { id: f.toLowerCase() + '_' + id, name, kind, wing }, row: { wing, axis: 'x', a: x, b: x + wBay, id } })
        x += wBay
      }
    }
    for (const wing of ['W', 'E']) {
      const total = prog[wing].reduce((a, q) => a + (q[3] || 1), 0)
      const span = (COURT.z1 - COURT.z0) / total
      let z = COURT.z0
      for (const [id, name, kind, bay] of prog[wing]) {
        const dBay = span * (bay || 1)
        const rect = wing === 'W' ? R(BAND.W.room[0], z + 0.1, BAND.W.room[1], z + dBay - 0.1)
          : R(BAND.E.room[0], z + 0.1, BAND.E.room[1], z + dBay - 0.1)
        out.push({ rect, meta: { id: f.toLowerCase() + '_' + id, name, kind, wing }, row: { wing, axis: 'z', a: z, b: z + dBay, id } })
        z += dBay
      }
    }
    return out
  }

  /**
   * 생성 전에 모든 방의 상태와 구멍 위치를 정한다.
   * 개수는 고정하고 위치만 섞는다 — 학습은 되지만 예측은 안 되게.
   */
  const QUOTA = { collapse: 4, breach: 6, messy: 12, stacked: 4, stripped: 3 }
  function precompute() {
    const all = []
    for (const f of ['F1', 'F2', 'F3']) for (const e of wingRects(f)) all.push({ f, ...e })
    for (const e of all) COND[e.meta.id] = 'intact'
    const rr = rngFrom(hash32('round:' + SEED))
    const pick = (n, ok) => {
      const pool = all.filter((e) => COND[e.meta.id] === 'intact' && ok(e))
      for (let i = pool.length - 1; i > 0; i--) { const j = (rr() * (i + 1)) | 0; const t = pool[i]; pool[i] = pool[j]; pool[j] = t }
      return pool.slice(0, n)
    }
    const safe = (e) => !['stair', 'toilet', 'machine', 'broadcast'].includes(e.meta.kind)
    for (const e of pick(QUOTA.collapse, (e) => safe(e) && (e.f === 'F2' || e.f === 'F3'))) COND[e.meta.id] = 'collapse'
    for (const e of pick(QUOTA.breach, safe)) COND[e.meta.id] = 'breach'
    for (const e of pick(QUOTA.messy, () => true)) COND[e.meta.id] = 'messy'
    for (const e of pick(QUOTA.stacked, () => true)) COND[e.meta.id] = 'stacked'
    for (const e of pick(QUOTA.stripped, () => true)) COND[e.meta.id] = 'stripped'
    // 파손 폭 등급 — 0.9 m 는 기어서 통과, 술래가 손해를 본다
    for (const e of all) {
      if (COND[e.meta.id] !== 'breach') continue
      BREACH_W[e.meta.id] = rngFrom(hash32('bw:' + SEED + ':' + e.meta.id))() < 0.45 ? 0.9 : 2.0
    }
    for (const { f, rect, meta } of all) {
      if (COND[meta.id] !== 'collapse') continue
      {
        const rr = rngFrom(hash32('hole:' + SEED + ':' + meta.id))
        const wR = rect.x1 - rect.x0, dR = rect.z1 - rect.z0
        const hw = Math.min(3.4, wR * 0.44), hd = Math.min(3.0, dR * 0.44)
        const hx = rect.x0 + 1.1 + rr() * Math.max(0.1, wR - hw - 2.2) + hw / 2
        const hz = rect.z0 + 1.1 + rr() * Math.max(0.1, dR - hd - 2.2) + hd / 2
        const below = FLOOR_ORDER[FLOOR_ORDER.indexOf(f) - 1]
        HOLES.push({
          f, room: meta.id, below,
          x0: hx - hw / 2, z0: hz - hd / 2, x1: hx + hw / 2, z1: hz + hd / 2,
          // 함정이 아니라 일방통행 수직 동선이다
          role: 'oneway_down', runner: { fall: true, stagger: 0.55 }, seeker: { fall: false, note: '내려가려면 계단' },
        })
      }
    }
  }

  /** 개구부 있는 벽. axis 'x' = x방향으로 뻗는 벽(고정 z), 'z' = 반대 */
  function wall(f, y, axis, fixed, a0, a1, opt = {}) {
    const h = opt.h ?? CEIL_H, t = opt.t ?? WT
    const c = opt.c ?? PAL.wallOut, base = opt.base, baseH = opt.baseH ?? 0.9
    const ops = (opt.openings || []).slice().sort((p, q) => p.c - q.c)
    const put = (m0, m1, y0, y1, col, vis) => {
      if (m1 - m0 < 0.02 || y1 - y0 < 0.02) return
      const p = axis === 'x' ? [mid(m0, m1), y + mid(y0, y1), fixed] : [fixed, y + mid(y0, y1), mid(m0, m1)]
      const s = axis === 'x' ? [m1 - m0, y1 - y0, t] : [t, y1 - y0, m1 - m0]
      ;(vis ? V : S)(f, p, s, col)
    }
    const seg = (m0, m1) => {
      if (base) { put(m0, m1, 0, baseH, base); put(m0, m1, baseH, h, c) }
      else put(m0, m1, 0, h, c)
    }
    let cur = a0
    for (const o of ops) {
      const o0 = o.c - o.w / 2, o1 = o.c + o.w / 2
      seg(cur, o0)
      const sill = o.sill ?? 0, head = o.head ?? 2.1
      if (sill > 0) { put(o0, o1, 0, Math.min(sill, baseH), base || c); if (sill > baseH) put(o0, o1, baseH, sill, c) }
      if (head < h) put(o0, o1, head, h, c)
      if (o.type === 'window') {
        const gy = y + mid(sill, head)
        const gp = axis === 'x' ? [mid(o0, o1), gy, fixed] : [fixed, gy, mid(o0, o1)]
        const gs = axis === 'x' ? [o1 - o0 - 0.1, head - sill - 0.1, 0.06] : [0.06, head - sill - 0.1, o1 - o0 - 0.1]
        V(f, gp, gs, PAL.glass)
        const n = Math.max(1, Math.round((o1 - o0) / 1.2))
        for (let i = 1; i < n; i++) {
          const mx = o0 + (o1 - o0) * i / n
          const mp = axis === 'x' ? [mx, gy, fixed] : [fixed, gy, mx]
          const ms = axis === 'x' ? [0.06, head - sill, 0.1] : [0.1, head - sill, 0.06]
          V(f, mp, ms, PAL.mullion)
        }
      } else if (o.type === 'door') {
        const dy = y + (head - sill) / 2 + sill
        // 문짝은 인스턴스 배치에서 빼고 개별 액터로 넘긴다 — 열리게 하려면 축이 필요하다
        doors.push({
          f, id: 'door_' + f + '_' + axis + '_' + fixed.toFixed(1) + '_' + o.c.toFixed(1),
          axis, fixed, hinge: axis === 'x' ? [o0, y + sill, fixed] : [fixed, y + sill, o0],
          w: o1 - o0 - 0.08, h: head - sill - 0.06, t: 0.07, swing: o.swing || 1,
          kind: o.doorKind || 'room', c: PAL.door,
        })
        // 상부 유리창 + 문틀
        const wp = axis === 'x' ? [mid(o0, o1), y + head - 0.45, fixed] : [fixed, y + head - 0.45, mid(o0, o1)]
        const ws = axis === 'x' ? [o1 - o0 - 0.6, 0.55, 0.1] : [0.1, 0.55, o1 - o0 - 0.6]
        V(f, wp, ws, PAL.glass)
        for (const sgn of [-1, 1]) {
          const fp = axis === 'x' ? [mid(o0, o1) + sgn * (o1 - o0) / 2, y + head / 2, fixed] : [fixed, y + head / 2, mid(o0, o1) + sgn * (o1 - o0) / 2]
          const fs = axis === 'x' ? [0.09, head, t + 0.06] : [t + 0.06, head, 0.09]
          V(f, fp, fs, PAL.doorFrame)
        }
      }
      cur = o1
    }
    seg(cur, a1)
  }

  /** 방 하나: 바닥판 · 천장 · 걸레받이 색 · 형광등 · 가구 */
  function room(f, r, meta) {
    const k = KIND[meta.kind] || KIND.classroom
    const y = FLOOR_Y[f]
    const w = r.x1 - r.x0, d = r.z1 - r.z0
    for (const p of subtract(r, holesOn(f))) P(f, [mid(p.x0, p.x1), y + 0.02, mid(p.z0, p.z1)], [p.x1 - p.x0, p.z1 - p.z0], PAL[k.f])
    const above = FLOOR_ORDER[FLOOR_ORDER.indexOf(f) + 1]
    for (const p of subtract(r, above ? holesOn(above) : [])) P(f, [mid(p.x0, p.x1), y + CEIL_H - 0.02, mid(p.z0, p.z1)], [p.x1 - p.x0, p.z1 - p.z0], PAL.ceil, null, true)
    rooms.push({ ...meta, cond: meta.cond || COND[meta.id] || 'intact', floor: f, x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, cx: mid(r.x0, r.x1), cz: mid(r.z0, r.z1), tone: k.tone })
    // 형광등: 긴 방향 2열, 1.8m 간격 리듬
    const along = w >= d ? 'x' : 'z'
    const len = along === 'x' ? w : d, cross = along === 'x' ? d : w
    const n = Math.max(2, Math.floor(len / 2.4))
    const rowsN = cross > 6 ? 2 : 1
    for (let rI = 0; rI < rowsN; rI++) {
      const off = rowsN === 1 ? 0 : (rI === 0 ? -cross / 4 : cross / 4)
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n
        const px = along === 'x' ? r.x0 + w * t : mid(r.x0, r.x1) + off
        const pz = along === 'x' ? mid(r.z0, r.z1) + off : r.z0 + d * t
        V(f, [px, y + CEIL_H - 0.1, pz], along === 'x' ? [1.25, 0.1, 0.3] : [0.3, 0.1, 1.25], TONE[k.tone], { e: 1 })
      }
    }
    FX(f, [mid(r.x0, r.x1), y + CEIL_H - 0.25, mid(r.z0, r.z1)], TONE[k.tone], k.tone, false)
    furnish(f, r, meta, k)
  }

  /* ── 가구 키트 ─────────────────────────────────────────── */
  function furnish(f, r, meta, k) {
    const y = FLOOR_Y[f]
    const w = r.x1 - r.x0, d = r.z1 - r.z0
    const cx = mid(r.x0, r.x1), cz = mid(r.z0, r.z1)
    const wing = meta.wing
    // 방 정면(칠판 쪽) = 외벽 반대편. 윙별로 방향이 다르다.
    const face = wing === 'N' ? 'S' : wing === 'S' ? 'N' : wing === 'W' ? 'E' : 'W'
    const kind = meta.kind

    const cond = meta.cond || COND[meta.id] || 'intact'
    const rr = rngFrom(hash32('furn:' + meta.id))
    const myHoles = holesOn(f).filter((h) => h.x0 < r.x1 && h.x1 > r.x0 && h.z0 < r.z1 && h.z1 > r.z0)
    const inHole = (x, z) => myHoles.some((h) => x > h.x0 - 0.5 && x < h.x1 + 0.5 && z > h.z0 - 0.5 && z < h.z1 + 0.5)

    /** 가구를 뺀 자리에 남는 눌림 자국 */
    const wearMarks = (nx, nz, gapx, gapz) => {
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const x = cx + (i - (nx - 1) / 2) * gapx, z = cz + (j - (nz - 1) / 2) * gapz
        if (inHole(x, z)) continue
        P(f, [x, y + 0.035, z], [Math.min(1.2, gapx * 0.8), Math.min(0.7, gapz * 0.55)], '#7c8478')
      }
    }
    /** 구석에 몰아 쌓은 책상 더미 */
    const stackPile = (n) => {
      const alongX = w >= d
      let placed = 0
      for (let col = 0; placed < n && col < 6; col++) {
        const px = alongX ? r.x0 + 1.5 + col * 1.35 : cx + (col % 2 ? 0.7 : -0.7)
        const pz = alongX ? r.z0 + 1.3 + (col % 2) * 0.7 : r.z0 + 1.4 + col * 1.35
        if (px > r.x1 - 1.0 || pz > r.z1 - 1.0) break
        const high = 2 + Math.floor(rr() * 2)
        for (let k2 = 0; k2 < high && placed < n; k2++, placed++) {
          V(f, [px, y + 0.2 + k2 * 0.62, pz], [1.22, 0.6, 0.6], PAL.desk, { rot: [0, (rr() - 0.5) * 0.34, 0] })
        }
      }
    }

    const grid = (nx, nz, gapx, gapz, fn) => {
      if (cond === 'stripped') { wearMarks(nx, nz, gapx, gapz); return }
      if (cond === 'stacked') { stackPile(nx * nz); return }
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const x = cx + (i - (nx - 1) / 2) * gapx, z = cz + (j - (nz - 1) / 2) * gapz
        if (inHole(x, z)) continue
        fn(x, z, i, j)
      }
    }
    const deskUnit = (x, z, rot = 0) => {
      let jx = 0, jz = 0
      if (cond === 'messy') {
        jx = (rr() - 0.5) * 1.05; jz = (rr() - 0.5) * 1.05
        rot += (rr() - 0.5) * 1.5
        if (rr() < 0.24) {
          // 넘어진 책상 — 시야는 트이지만 발이 걸린다
          const ro = { rot: [0, rot, 1.45] }
          V(f, [x + jx, y + 0.32, z + jz], [1.2, 0.06, 0.56], PAL.desk, ro)
          V(f, [x + jx, y + 0.2, z + jz], [1.05, 0.24, 0.42], PAL.deskLeg, ro)
          V(f, [x + jx + 0.72, y + 0.14, z + jz + 0.5], [0.42, 0.06, 0.42], PAL.chair, { rot: [1.3, rot, 0] })
          return
        }
      }
      const px = x + jx, pz = z + jz
      const ro = rot ? { rot: [0, rot, 0] } : null
      V(f, [px, y + 0.72, pz], [1.2, 0.05, 0.55], PAL.desk, ro)
      V(f, [px, y + 0.58, pz], [1.05, 0.22, 0.42], PAL.deskLeg, ro)
      if (rot) V(f, [px, y + 0.35, pz], [1.0, 0.7, 0.4], PAL.deskLeg, ro)
      else for (const sx of [-0.5, 0.5]) for (const sz of [-0.22, 0.22])
        V(f, [px + sx * 1.05, y + 0.35, pz + sz * 1.0], [0.05, 0.7, 0.05], PAL.deskLeg)
      const cr = rot + (cond === 'messy' ? (rr() - 0.5) * 2.4 : 0)
      const cd = 0.62 + (cond === 'messy' ? rr() * 0.55 : 0)
      const cro = cr ? { rot: [0, cr, 0] } : null
      V(f, [px, y + 0.44, pz + cd], [0.42, 0.05, 0.42], PAL.chair, cro)
      V(f, [px, y + 0.66, pz + cd + 0.2], [0.42, 0.44, 0.05], PAL.chair, cro)
    }
    const shelf = (x, z, len, dep, rot) => {
      const sx = rot ? dep : len, sz = rot ? len : dep
      V(f, [x, y + 1.05, z], [sx, 2.1, sz], PAL.wood)
      for (let i = 1; i <= 4; i++) V(f, [x, y + i * 0.42, z], [sx - 0.06, 0.04, sz + 0.04], PAL.paper)
    }
    const cabinet = (x, z, len, rot) => {
      const sx = rot ? 0.45 : len, sz = rot ? len : 0.45
      V(f, [x, y + 0.9, z], [sx, 1.8, sz], PAL.locker)
      const n = Math.max(2, Math.round(len / 0.45))
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + len * (i + 0.5) / n
        V(f, rot ? [x - 0.24, y + 0.9, z + t] : [x + t, y + 0.9, z - 0.24], rot ? [0.04, 1.72, len / n - 0.04] : [len / n - 0.04, 1.72, 0.04], '#7d8994')
      }
    }
    // 칠판 벽 위치
    const facePos = () => {
      if (face === 'S') return { x: cx, z: r.z1 - 0.12, rot: 0 }
      if (face === 'N') return { x: cx, z: r.z0 + 0.12, rot: 0 }
      if (face === 'E') return { x: r.x1 - 0.12, z: cz, rot: 1 }
      return { x: r.x0 + 0.12, z: cz, rot: 1 }
    }

    if (kind === 'classroom') {
      const fp = facePos()
      const bw = Math.min(4.2, (fp.rot ? d : w) - 1.6)
      V(f, [fp.x, y + 1.85, fp.z], fp.rot ? [0.08, 1.3, bw] : [bw, 1.3, 0.08], PAL.chalk)
      V(f, [fp.x, y + 1.15, fp.z], fp.rot ? [0.18, 0.09, bw] : [bw, 0.09, 0.18], PAL.wood)
      // 교탁
      const tx = fp.rot ? fp.x + (face === 'E' ? -1.3 : 1.3) : fp.x + 1.2
      const tz = fp.rot ? fp.z + 1.2 : fp.z + (face === 'S' ? -1.3 : 1.3)
      V(f, [tx, y + 0.78, tz], [1.1, 0.06, 0.55], PAL.wood)
      V(f, [tx, y + 0.4, tz], [1.0, 0.72, 0.45], PAL.desk)
      // 학생 책상 4열 × 5행 (열 1.6m, 통로 1.05m 확보)
      const cols = 4, rowsn = 5
      const ax = face === 'S' || face === 'N' ? 'z' : 'x'
      grid(ax === 'z' ? cols : rowsn, ax === 'z' ? rowsn : cols, ax === 'z' ? 1.55 : 1.35, ax === 'z' ? 1.35 : 1.55,
        (x, z) => deskUnit(x, z, 0))
      cabinet(cx, r.z0 + 0.35, Math.min(w - 2, 5), false)
      V(f, [r.x0 + 0.35, y + 1.6, cz + 2], [0.12, 1.1, 2.4], PAL.paper)   // 게시판
      V(f, [r.x1 - 0.3, y + 2.35, cz - 1.6], [0.5, 0.35, 0.6], '#232a30') // 벽걸이 TV
      V(f, [r.x0 + 0.5, y + 0.4, r.z1 - 0.5], [0.5, 0.8, 0.5], PAL.locker)// 청소함
      CY(f, [r.x1 - 0.6, y + 0.18, r.z1 - 0.6], 0.17, 0.36, '#5c6165')    // 쓰레기통
    } else if (kind === 'lab') {
      grid(2, 3, 2.6, 2.0, (x, z) => {
        V(f, [x, y + 0.85, z], [2.2, 0.08, 0.9], '#b9c2c6')
        V(f, [x, y + 0.42, z], [2.1, 0.78, 0.8], '#6f7a80')
        V(f, [x - 0.7, y + 0.92, z], [0.5, 0.06, 0.4], '#9aa4a8')
        CY(f, [x + 0.6, y + 1.05, z], 0.03, 0.34, PAL.steel)
        for (const sz of [-0.75, 0.75]) { V(f, [x - 0.6, y + 0.45, z + sz], [0.4, 0.05, 0.35], PAL.chair); V(f, [x + 0.6, y + 0.45, z + sz], [0.4, 0.05, 0.35], PAL.chair) }
      })
      cabinet(cx, r.z0 + 0.35, Math.min(w - 2, 5.2), false)
      V(f, [r.x1 - 0.5, y + 1.1, cz], [0.8, 2.2, 2.2], '#8f9aa0')  // 흄후드
      V(f, [r.x1 - 0.5, y + 1.5, cz], [0.06, 1.0, 1.9], PAL.glass)
      const fp = facePos()
      V(f, [fp.x, y + 1.85, fp.z], fp.rot ? [0.08, 1.2, 3.4] : [3.4, 1.2, 0.08], PAL.chalk)
    } else if (kind === 'computer') {
      grid(3, 3, 2.4, 1.9, (x, z) => {
        V(f, [x, y + 0.72, z], [2.0, 0.06, 0.7], PAL.desk)
        V(f, [x, y + 0.36, z], [1.9, 0.68, 0.6], PAL.deskLeg)
        for (const sx of [-0.5, 0.5]) { V(f, [x + sx, y + 0.98, z - 0.15], [0.5, 0.34, 0.05], '#1d2429'); V(f, [x + sx, y + 0.77, z + 0.15], [0.34, 0.02, 0.14], '#c9ced2') }
        V(f, [x, y + 0.44, z + 0.75], [1.0, 0.05, 0.4], PAL.chair)
      })
      V(f, [cx, y + 1.8, r.z1 - 0.15], [3.0, 1.7, 0.06], '#20272c')
    } else if (kind === 'health') {
      for (let i = 0; i < 3; i++) {
        const z = r.z0 + 1.6 + i * 2.0
        V(f, [r.x0 + 1.6, y + 0.32, z], [2.0, 0.5, 0.95], PAL.white)
        V(f, [r.x0 + 1.6, y + 0.62, z], [1.9, 0.12, 0.9], '#cfe0e6')
        V(f, [r.x0 + 0.85, y + 0.72, z], [0.35, 0.14, 0.55], PAL.white)
        V(f, [r.x0 + 2.75, y + 1.05, z], [0.06, 2.1, 1.0], '#9dc3cf')  // 가림막
      }
      cabinet(r.x1 - 0.4, cz, 3.0, true)
      V(f, [cx + 0.6, y + 0.75, r.z1 - 1.2], [1.4, 0.06, 0.7], PAL.desk)
      V(f, [cx + 0.6, y + 0.4, r.z1 - 1.2], [1.3, 0.7, 0.6], PAL.deskLeg)
      V(f, [cx + 1.9, y + 0.05, r.z1 - 1.2], [0.4, 0.1, 0.5], '#b8bec2')  // 체중계
    } else if (kind === 'admin') {
      grid(2, 3, 3.2, 1.9, (x, z) => {
        V(f, [x, y + 0.72, z], [2.6, 0.06, 1.4], PAL.desk)
        V(f, [x, y + 0.36, z], [2.4, 0.68, 1.2], PAL.deskLeg)
        V(f, [x, y + 1.05, z], [2.6, 0.6, 0.05], '#8d9aa5')   // 파티션
        for (const sx of [-0.65, 0.65]) { V(f, [x + sx, y + 0.44, z], [0.44, 0.05, 0.44], PAL.chair); V(f, [x + sx, y + 0.68, z - 0.22], [0.44, 0.44, 0.05], PAL.chair) }
      })
      cabinet(cx, r.z0 + 0.35, Math.min(w - 2, 4.6), false)
      V(f, [r.x1 - 0.9, y + 0.55, r.z1 - 1.0], [0.9, 1.1, 0.7], '#43494e') // 복사기
      V(f, [r.x1 - 0.9, y + 1.15, r.z1 - 1.0], [0.7, 0.1, 0.55], '#71787d')
    } else if (kind === 'library') {
      const n = Math.floor((w - 3) / 2.2)
      for (let i = 0; i < n; i++) shelf(r.x0 + 1.6 + i * 2.2, r.z0 + 2.4, 3.2, 0.5, true)
      for (let i = 0; i < 3; i++) {
        const x = r.x0 + 3 + i * 3.4
        V(f, [x, y + 0.74, r.z1 - 2.0], [2.6, 0.07, 1.2], PAL.wood)
        V(f, [x, y + 0.37, r.z1 - 2.0], [2.4, 0.7, 1.0], PAL.deskLeg)
        for (const sz of [-0.95, 0.95]) for (const sx of [-0.7, 0.7]) V(f, [x + sx, y + 0.44, r.z1 - 2.0 + sz], [0.42, 0.05, 0.42], PAL.chair)
      }
      V(f, [r.x1 - 1.6, y + 0.6, r.z0 + 1.0], [2.4, 1.2, 0.7], PAL.wood)  // 대출대
    } else if (kind === 'music') {
      V(f, [cx - 1.5, y + 0.55, r.z1 - 1.8], [1.5, 1.1, 1.4], '#1c1f24')  // 그랜드 피아노
      V(f, [cx - 1.5, y + 1.12, r.z1 - 1.8], [1.7, 0.08, 1.6], '#2a2f36')
      for (let i = 0; i < 3; i++) {
        const z = r.z0 + 2.0 + i * 1.6
        V(f, [cx, y + 0.16 + i * 0.18, z], [w - 2.4, 0.36 + i * 0.36, 1.5], '#5c5348')
        for (let j = 0; j < 5; j++) V(f, [cx + (j - 2) * 1.3, y + 0.55 + i * 0.36, z], [0.44, 0.06, 0.44], PAL.chair)
      }
      cabinet(r.x0 + 0.4, cz, 3.0, true)
    } else if (kind === 'art') {
      grid(2, 3, 2.8, 1.9, (x, z) => {
        V(f, [x, y + 0.8, z], [2.2, 0.08, 1.1], PAL.wood)
        V(f, [x, y + 0.4, z], [2.1, 0.76, 1.0], PAL.deskLeg)
        for (const sx of [-0.7, 0.7]) V(f, [x + sx, y + 0.46, z + 0.85], [0.4, 0.05, 0.4], PAL.chair)
      })
      for (let i = 0; i < 3; i++) {  // 이젤
        const x = r.x0 + 1.2 + i * 1.1
        V(f, [x, y + 0.85, r.z0 + 1.0], [0.06, 1.7, 0.06], PAL.wood, { rot: [0.12, 0, 0] })
        V(f, [x, y + 1.2, r.z0 + 0.9], [0.75, 0.6, 0.05], PAL.paper, { rot: [0.12, 0, 0] })
      }
      V(f, [r.x1 - 1.4, y + 0.45, r.z1 - 0.6], [2.6, 0.9, 0.6], '#9aa4a8')  // 개수대
      for (let i = 0; i < 3; i++) CY(f, [r.x1 - 2.3 + i * 0.9, y + 1.05, r.z1 - 0.6], 0.03, 0.3, PAL.steel)
    } else if (kind === 'av' || kind === 'broadcast') {
      if (kind === 'av') {
        V(f, [cx, y + 1.7, r.z0 + 0.2], [Math.min(w - 2, 5), 2.4, 0.08], '#1a1e22')
        for (let i = 0; i < 4; i++) {
          const z = r.z0 + 2.6 + i * 1.5
          V(f, [cx, y + 0.12 + i * 0.22, z], [w - 2.2, 0.24 + i * 0.44, 1.4], '#4c5560')
          for (let j = 0; j < 6; j++) V(f, [cx + (j - 2.5) * 1.1, y + 0.5 + i * 0.44, z], [0.46, 0.06, 0.46], PAL.chair)
        }
      } else {
        V(f, [cx, y + 0.75, r.z1 - 1.4], [3.2, 0.08, 1.0], '#2c333a')
        V(f, [cx, y + 0.38, r.z1 - 1.4], [3.0, 0.72, 0.9], '#454d55')
        for (let i = 0; i < 6; i++) V(f, [cx - 1.3 + i * 0.52, y + 0.83, r.z1 - 1.4], [0.36, 0.06, 0.5], '#1f262c')
        V(f, [cx, y + 1.55, cz], [w - 1.6, 1.5, 0.06], PAL.glass)   // 부스 유리
        V(f, [cx, y + 0.8, r.z0 + 1.4], [1.4, 0.06, 0.8], PAL.desk)
        CY(f, [cx, y + 1.15, r.z0 + 1.4], 0.02, 0.4, PAL.steel)
        V(f, [cx, y + 1.4, r.z0 + 1.4], [0.1, 0.14, 0.1], '#1c2126')
        V(f, [r.x1 - 0.5, y + 2.4, r.z0 + 0.6], [0.5, 0.24, 0.1], PAL.accentRed, { e: 1 })  // ON AIR
      }
    } else if (kind === 'dance') {
      V(f, [cx, y + 1.6, r.z0 + 0.14], [w - 0.6, 2.6, 0.05], '#aebcc4')  // 거울벽
      V(f, [cx, y + 0.95, r.z0 + 0.35], [w - 1.2, 0.07, 0.07], PAL.wood) // 발레바
      V(f, [r.x1 - 0.4, y + 0.95, cz], [0.07, 0.07, d - 1.2], PAL.wood)
      V(f, [r.x0 + 0.6, y + 0.25, r.z1 - 1.0], [1.6, 0.4, 1.0], '#5a5f66')
    } else if (kind === 'food') {
      const n = Math.floor((w - 3) / 2.6)
      for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) {
        const x = r.x0 + 2.0 + i * 2.6, z = r.z0 + 2.0 + j * 1.9
        V(f, [x, y + 0.73, z], [2.2, 0.07, 0.8], '#c3c8c4')
        V(f, [x, y + 0.36, z], [0.18, 0.7, 0.5], PAL.steel)
        for (const sz of [-0.62, 0.62]) V(f, [x, y + 0.42, z + sz], [2.1, 0.06, 0.3], '#8f959a')
      }
      V(f, [cx, y + 0.5, r.z1 - 0.9], [w - 3, 1.0, 0.9], '#b7532c')  // 배식대
      V(f, [cx, y + 1.02, r.z1 - 0.9], [w - 3, 0.06, 0.95], PAL.steel)
      V(f, [cx, y + 1.75, r.z1 - 0.55], [w - 3, 0.5, 0.1], PAL.steel)
    } else if (kind === 'kitchen') {
      V(f, [cx, y + 0.45, r.z0 + 1.0], [w - 2, 0.9, 0.8], PAL.steel)
      V(f, [cx, y + 0.92, r.z0 + 1.0], [w - 1.9, 0.06, 0.9], '#c4cace')
      V(f, [cx, y + 2.15, r.z0 + 1.0], [w - 2.4, 0.7, 1.1], '#8e969b')   // 후드
      for (let i = 0; i < 3; i++) CY(f, [r.x0 + 1.4 + i * 1.5, y + 0.5, cz + 0.4], 0.5, 1.0, '#7f878c')  // 국솥
      V(f, [r.x1 - 0.9, y + 1.0, r.z1 - 1.2], [1.2, 2.0, 0.8], '#a8b0b5')  // 냉장고
      V(f, [r.x1 - 0.9, y + 1.0, r.z1 - 1.2 - 0.42], [1.15, 1.9, 0.04], '#c3cacd')
    } else if (kind === 'store' || kind === 'service') {
      const n = Math.max(2, Math.floor((d - 1.5) / 1.6))
      for (let i = 0; i < n; i++) shelf(r.x0 + 0.7, r.z0 + 1.2 + i * 1.6, 1.4, 0.6, true)
      for (let i = 0; i < n; i++) shelf(r.x1 - 0.7, r.z0 + 1.2 + i * 1.6, 1.4, 0.6, true)
      for (let i = 0; i < 4; i++) V(f, [cx + (i % 2 ? 0.6 : -0.6), y + 0.25 + Math.floor(i / 2) * 0.5, cz], [1.0, 0.5, 0.8], '#6b6558')
    } else if (kind === 'duty') {
      V(f, [r.x0 + 1.4, y + 0.3, cz], [2.0, 0.45, 1.0], PAL.wood)
      V(f, [r.x0 + 1.4, y + 0.58, cz], [1.9, 0.14, 0.95], '#c2b6a0')
      V(f, [r.x1 - 1.4, y + 0.74, cz - 1.0], [1.4, 0.06, 0.7], PAL.desk)
      V(f, [r.x1 - 1.4, y + 0.44, cz + 0.0], [0.44, 0.05, 0.44], PAL.chair)
      cabinet(cx, r.z1 - 0.4, 1.8, false)
    } else if (kind === 'machine') {
      for (let i = 0; i < 3; i++) {
        const x = r.x0 + 2.0 + i * 3.4
        V(f, [x, y + 0.8, cz], [1.6, 1.6, 1.6], '#4e565c')
        CY(f, [x, y + 1.75, cz], 0.35, 0.35, '#6d767c')
        CY(f, [x, y + 2.6, cz], 0.12, 1.4, '#5e666c')
      }
      V(f, [r.x1 - 0.5, y + 1.5, cz], [0.5, 2.0, 3.0], '#3f474d')       // 배전반
      for (let i = 0; i < 6; i++) V(f, [r.x1 - 0.76, y + 2.2 - i * 0.24, cz - 1.0 + (i % 3) * 1.0], [0.04, 0.1, 0.6], '#8b939a')
      for (let i = 0; i < 5; i++) CY(f, [cx, y + 2.9, r.z0 + 0.9 + i * 1.3], 0.09, w - 1.0, '#6a7278', [0, 0, Math.PI / 2])
    } else if (kind === 'toilet') {
      const cells = 4
      for (let i = 0; i < cells; i++) {
        const x = r.x0 + 0.9 + i * 1.1
        V(f, [x, y + 1.05, r.z0 + 1.1], [0.05, 1.9, 1.9], '#7f9099')
        V(f, [x + 0.55, y + 0.32, r.z0 + 1.1], [0.42, 0.62, 0.62], PAL.white)
        V(f, [x + 0.55, y + 0.66, r.z0 + 0.85], [0.4, 0.1, 0.2], PAL.white)
      }
      V(f, [r.x0 + 0.9 + cells * 1.1, y + 1.05, r.z0 + 1.1], [0.05, 1.9, 1.9], '#7f9099')
      for (let i = 0; i < 3; i++) {
        const x = r.x0 + 1.3 + i * 1.1
        V(f, [x, y + 0.82, r.z1 - 0.5], [0.7, 0.16, 0.5], PAL.white)
        CY(f, [x, y + 1.0, r.z1 - 0.68], 0.03, 0.25, PAL.steel)
      }
      V(f, [mid(r.x0 + 1.3, r.x0 + 1.3 + 2.2), y + 1.6, r.z1 - 0.18], [2.9, 1.0, 0.05], '#aebcc4')
    } else if (kind === 'lobby') {
      for (let i = 0; i < 2; i++) cabinet(r.x0 + 1.0, cz + (i ? 2.2 : -2.2), 3.6, true)   // 신발장
      V(f, [r.x1 - 1.2, y + 0.55, cz], [1.6, 1.1, 1.0], PAL.wood)   // 당직 카운터
      V(f, [r.x1 - 1.2, y + 1.14, cz], [1.7, 0.08, 1.1], '#8f9aa0')
      V(f, [cx, y + 1.9, r.z0 + 0.2], [2.4, 1.2, 0.08], PAL.paper)  // 안내판
      CY(f, [r.x0 + 0.8, y + 0.4, r.z1 - 0.8], 0.22, 0.8, '#5a6167')  // 우산꽂이
    }
  }

  /* ── 복도 링 ─────────────────────────────────────────── */
  function corridorRing(f) {
    const y = FLOOR_Y[f]
    const segs = [
      { ax: 'x', a0: -55.8, a1: 7.8, b0: BAND.N.cor[0], b1: BAND.N.cor[1], side: 'N' },
      { ax: 'x', a0: -55.8, a1: 7.8, b0: BAND.S.cor[0], b1: BAND.S.cor[1], side: 'S' },
      { ax: 'z', a0: -50.4, a1: -17.6, b0: BAND.W.cor[0], b1: BAND.W.cor[1], side: 'W' },
      { ax: 'z', a0: -50.4, a1: -17.6, b0: BAND.E.cor[0], b1: BAND.E.cor[1], side: 'E' },
    ]
    for (const s of segs) {
      const isX = s.ax === 'x'
      const w = isX ? s.a1 - s.a0 : s.b1 - s.b0
      const dd = isX ? s.b1 - s.b0 : s.a1 - s.a0
      const px = isX ? mid(s.a0, s.a1) : mid(s.b0, s.b1)
      const pz = isX ? mid(s.b0, s.b1) : mid(s.a0, s.a1)
      P(f, [px, y + 0.02, pz], [w, dd], PAL.corrFloor)
      P(f, [px, y + CEIL_H - 0.02, pz], [w, dd], PAL.ceil, null, true)
      // 바닥 유도선
      P(f, [px, y + 0.03, pz], isX ? [w, 0.12] : [0.12, dd], PAL.corrLine)
      // 형광등 1.8m 리듬 + 비상등
      const len = isX ? w : dd
      const n = Math.floor(len / 2.4)
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n
        const lx = isX ? s.a0 + w * t : px
        const lz = isX ? pz : s.a0 + dd * t
        V(f, [lx, y + CEIL_H - 0.09, lz], isX ? [1.3, 0.09, 0.28] : [0.28, 0.09, 1.3], TONE.cool, { e: 1 })
        if (i % 3 === 1) FX(f, [lx, y + CEIL_H - 0.28, lz], TONE.cool, 'cool', i % 6 === 1)
      }
      // 복도 비품: 사물함 · 게시판 · 소화전 · 음수대
      const cnt = Math.floor(len / 6)
      for (let i = 0; i < cnt; i++) {
        const t = (i + 0.5) / cnt
        const ux = isX ? s.a0 + w * t : px
        const uz = isX ? pz : s.a0 + dd * t
        const outSign = s.side === 'N' ? -1 : s.side === 'S' ? 1 : 0
        const outSignX = s.side === 'W' ? -1 : s.side === 'E' ? 1 : 0
        const wallX = isX ? ux : px + outSignX * (dd / 2 - 0.3)
        const wallZ = isX ? pz + outSign * (dd / 2 - 0.3) : uz
        if (i % 3 === 0) {   // 사물함 열
          V(f, [wallX, y + 0.9, wallZ], isX ? [3.0, 1.8, 0.45] : [0.45, 1.8, 3.0], PAL.locker)
          for (let j = 0; j < 7; j++) {
            const o = -1.4 + j * 0.42
            V(f, isX ? [wallX + o, y + 0.9, wallZ - outSign * 0.24] : [wallX - outSignX * 0.24, y + 0.9, wallZ + o],
              isX ? [0.38, 1.72, 0.03] : [0.03, 1.72, 0.38], '#7b8894')
          }
        } else if (i % 3 === 1) {  // 게시판
          V(f, [wallX, y + 1.55, wallZ + (isX ? -outSign * 0.16 : 0)], isX ? [2.6, 1.2, 0.1] : [0.1, 1.2, 2.6], PAL.paper)
          V(f, [wallX, y + 1.55, wallZ + (isX ? -outSign * 0.22 : 0)], isX ? [2.7, 1.3, 0.05] : [0.05, 1.3, 2.7], '#6b6252')
        } else {  // 소화전 + 음수대
          V(f, [wallX, y + 0.9, wallZ], isX ? [0.7, 1.1, 0.24] : [0.24, 1.1, 0.7], PAL.accentRed)
          const dx = isX ? wallX + 2.2 : wallX, dz = isX ? wallZ : wallZ + 2.2
          V(f, [dx, y + 0.45, dz], isX ? [1.2, 0.9, 0.5] : [0.5, 0.9, 1.2], '#8e969b')
          V(f, [dx, y + 0.92, dz], isX ? [1.24, 0.06, 0.54] : [0.54, 0.06, 1.24], '#b6bec2')
        }
      }
      // 비상구 유도등 (녹색)
      V(f, [isX ? s.a0 + 3 : px, y + CEIL_H - 0.5, isX ? pz : s.a0 + 3], [0.5, 0.24, 0.1], '#3ec98a', { e: 1 })
      V(f, [isX ? s.a1 - 3 : px, y + CEIL_H - 0.5, isX ? pz : s.a1 - 3], [0.5, 0.24, 0.1], '#3ec98a', { e: 1 })
      // 생활 흔적: 바닥 마모 · 벽 하부 때 · 테이프 붙인 게시물
      const rnd = (i) => ((Math.sin(i * 12.9898 + len) * 43758.5453) % 1 + 1) % 1
      const marks = Math.floor(len / 3)
      for (let i = 0; i < marks; i++) {
        const t = rnd(i * 3 + (s.side.charCodeAt(0) % 7))
        const mxp = isX ? s.a0 + w * t : px + (rnd(i + 40) - 0.5) * (dd - 1)
        const mzp = isX ? pz + (rnd(i + 40) - 0.5) * (dd - 1) : s.a0 + dd * t
        P(f, [mxp, y + 0.031, mzp], [0.5 + rnd(i + 7) * 1.0, 0.4 + rnd(i + 11) * 0.8], '#88918c')
        if (i % 2 === 0) {
          const sgn = s.side === 'N' || s.side === 'W' ? -1 : 1
          const wx = isX ? mxp : px + sgn * (dd / 2 - 0.14)
          const wz = isX ? pz + sgn * (dd / 2 - 0.14) : mzp
          V(f, [wx, y + 0.16, wz], isX ? [2.2, 0.32, 0.03] : [0.03, 0.32, 2.2], '#6a6f6c')
          V(f, [wx, y + 1.62, wz], isX ? [0.62, 0.86, 0.02] : [0.02, 0.86, 0.62], ['#d9d2be', '#cfd6d2', '#ded0c0'][i % 3])
        }
      }
    }
  }

  /**
   * 복도 생활 디테일 — 액자·달력·벽시계·소화전·정수기·화분.
   * 반복 모듈만으로는 학교가 아니라 사무소가 된다.
   */
  function corridorDetail(f) {
    const y = FLOOR_Y[f]
    const sides = [
      { side: 'N', axis: 'x', fixed: BAND.N.part, a0: COURT.x0, a1: COURT.x1, sgn: 1 },
      { side: 'S', axis: 'x', fixed: BAND.S.part, a0: COURT.x0, a1: COURT.x1, sgn: -1 },
      { side: 'W', axis: 'z', fixed: BAND.W.part, a0: COURT.z0, a1: COURT.z1, sgn: 1 },
      { side: 'E', axis: 'z', fixed: BAND.E.part, a0: COURT.z0, a1: COURT.z1, sgn: -1 },
    ]
    for (const sd of sides) {
      const rr = rngFrom(hash32('detail:' + f + sd.side))
      const isX = sd.axis === 'x'
      const at = (t, off, h) => isX ? [t, y + h, sd.fixed + sd.sgn * off] : [sd.fixed + sd.sgn * off, y + h, t]
      const flat = (wide, tall) => isX ? [wide, tall, 0.04] : [0.04, tall, wide]
      const len = sd.a1 - sd.a0

      // 상장·사진 액자 줄 — 3~5점이 나란히
      const nFrames = 3 + Math.floor(rr() * 3)
      const fx0 = sd.a0 + 3 + rr() * (len - 12)
      for (let i = 0; i < nFrames; i++) {
        const t = fx0 + i * 1.15
        V(f, at(t, 0.13, 1.72), flat(0.86, 0.62), '#6d5b3f')
        V(f, at(t, 0.155, 1.72), flat(0.7, 0.48), ['#d9d2be', '#c8cfd2', '#e0d6c4'][i % 3])
      }
      // 벽시계
      const ct = sd.a0 + len * (0.28 + rr() * 0.44)
      CY(f, at(ct, 0.14, 2.24), 0.24, 0.07, '#e8e8e4', isX ? [Math.PI / 2, 0, 0] : [Math.PI / 2, 0, Math.PI / 2])
      CY(f, at(ct, 0.18, 2.24), 0.2, 0.02, '#f4f4f0', isX ? [Math.PI / 2, 0, 0] : [Math.PI / 2, 0, Math.PI / 2])
      V(f, at(ct, 0.2, 2.28), isX ? [0.02, 0.14, 0.02] : [0.02, 0.14, 0.02], '#1e2429')
      // 달력
      const kt = ct + 2.4
      V(f, at(kt, 0.13, 1.86), flat(0.5, 0.72), '#f0ece0')
      V(f, at(kt, 0.15, 2.08), flat(0.5, 0.24), PAL.accentRed)
      // 소화전함
      const ht = sd.a0 + len * (0.62 + rr() * 0.2)
      V(f, at(ht, 0.19, 1.15), isX ? [0.7, 1.0, 0.22] : [0.22, 1.0, 0.7], '#a8392f')
      V(f, at(ht, 0.31, 1.15), isX ? [0.58, 0.86, 0.02] : [0.02, 0.86, 0.58], '#8d2f27')
      V(f, at(ht, 0.2, 1.78), isX ? [0.24, 0.1, 0.02] : [0.02, 0.1, 0.24], '#e8e8e4')
      // 정수기
      const wt = sd.a0 + len * (0.12 + rr() * 0.1)
      V(f, at(wt, 0.24, 0.55), isX ? [0.42, 1.1, 0.36] : [0.36, 1.1, 0.42], '#dfe3e4')
      CY(f, at(wt, 0.24, 1.42), 0.19, 0.5, '#bcd8e2')
      V(f, at(wt, 0.24, 1.72), isX ? [0.4, 0.1, 0.34] : [0.34, 0.1, 0.4], '#9aa1a6')
      // 화분 2
      for (let i = 0; i < 2; i++) {
        const pt = sd.a0 + len * (0.4 + i * 0.3) + (rr() - 0.5) * 2
        CY(f, at(pt, 0.28, 0.22), 0.24, 0.44, '#8a6a52')
        CY(f, at(pt, 0.28, 0.66), 0.3, 0.5, '#3a5c38')
      }
      // 청소도구함
      const jt = sd.a1 - 3.5
      V(f, at(jt, 0.24, 0.9), isX ? [0.9, 1.8, 0.4] : [0.4, 1.8, 0.9], '#7d8a92')
      // 우산꽂이 (1층만)
      if (f === 'F1') {
        const ut = sd.a0 + 2.2
        CY(f, at(ut, 0.3, 0.3), 0.22, 0.6, PAL.steel)
      }
    }
  }

  /* ── 층 하나 만들기 ─────────────────────────────────────── */
  function makeFloor(f) {
    const y = FLOOR_Y[f]
    const prog = PROGRAM[f]
    // 슬래브
    S(f, [mid(B.x0, B.x1), y - SLAB_T / 2, mid(B.z0, B.z1)], [B.x1 - B.x0, SLAB_T, B.z1 - B.z0], PAL.slab)
    // 중정 개구부는 슬래브를 뚫어야 하므로, 중정 영역을 도로 파낸다 → 4조각으로 분할해 재구성
    solids.pop()
    const cs = [
      [B.x0, B.z0, B.x1, COURT.z0], [B.x0, COURT.z1, B.x1, B.z1],
      [B.x0, COURT.z0, COURT.x0, COURT.z1], [COURT.x1, COURT.z0, B.x1, COURT.z1],
    ]
    for (const [x0, z0, x1, z1] of cs) {
      for (const p of subtract({ x0, z0, x1, z1 }, holesOn(f))) S(f, [mid(p.x0, p.x1), y - SLAB_T / 2, mid(p.z0, p.z1)], [p.x1 - p.x0, SLAB_T, p.z1 - p.z0], PAL.slab)
    }
    // 붕괴부 — 파단면과 아래층 잔해
    for (const h of holesOn(f)) {
      const rr = rngFrom(hash32('rub:' + h.room))
      for (let i = 0; i < 16; i++) {
        const onX = i % 2 === 0
        const t2 = rr()
        const px = onX ? h.x0 + (h.x1 - h.x0) * t2 : (rr() < 0.5 ? h.x0 : h.x1)
        const pz = onX ? (rr() < 0.5 ? h.z0 : h.z1) : h.z0 + (h.z1 - h.z0) * t2
        V(f, [px, y - 0.08, pz], [0.45 + rr() * 0.7, 0.34, 0.45 + rr() * 0.7], PAL.slab, { rot: [(rr() - 0.5) * 0.5, rr() * 3, (rr() - 0.5) * 0.5] })
      }
      for (let i = 0; i < 10; i++) {
        const t2 = rr()
        const px = h.x0 + (h.x1 - h.x0) * t2
        CY(f, [px, y - 0.22, rr() < 0.5 ? h.z0 : h.z1], 0.025, 0.9, PAL.steel, { rot: [1.2 + rr() * 0.5, rr() * 3, 0] })
      }
      const below = FLOOR_ORDER[FLOOR_ORDER.indexOf(f) - 1]
      if (below) {
        const by = FLOOR_Y[below]
        P(below, [mid(h.x0, h.x1), by + 0.035, mid(h.z0, h.z1)], [(h.x1 - h.x0) + 2.6, (h.z1 - h.z0) + 2.6], '#6b7071')
        for (let i = 0; i < 22; i++) {
          const px = h.x0 - 1.1 + rr() * (h.x1 - h.x0 + 2.2)
          const pz = h.z0 - 1.1 + rr() * (h.z1 - h.z0 + 2.2)
          V(below, [px, by + 0.12 + rr() * 0.22, pz], [0.3 + rr() * 0.85, 0.16 + rr() * 0.3, 0.3 + rr() * 0.85], rr() < 0.6 ? PAL.slab : PAL.concrete, { rot: [rr(), rr() * 3, rr()] })
        }
      }
    }

    corridorRing(f)
    corridorDetail(f)

    const rows = []
    for (const { rect, meta, row } of wingRects(f)) {
      room(f, rect, Object.assign({}, meta, { cond: COND[meta.id] || 'intact' }))
      rows.push(row)
    }

    // ── 벽체 ──
    const doorsFor = (wing) => {
      const out = []
      for (const r of rows.filter((q) => q.wing === wing)) {
        out.push({ c: (r.a + r.b) / 2 + (r.b - r.a) / 2 - 1.4, w: 1.1, type: 'door', head: 2.15 })
        // 파손된 실은 복도 칸막이가 뚫려 있다 — 문을 거치지 않는 우회로
        const bid = f.toLowerCase() + '_' + r.id
        if (COND[bid] === 'breach') {
          const bw = BREACH_W[bid] || 2.0
          const bc = (r.a + r.b) / 2 - (r.b - r.a) / 4
          out.push({ c: bc, w: bw, head: bw < 1.2 ? 1.15 : 2.5, sill: bw < 1.2 ? 0.35 : 0 })
          const fixed = BAND[r.wing].part
          LEAKS.push({
            f, id: 'leak_' + bid, kind: 'breach', grade: bw < 1.2 ? 'crawl' : 'walk', w: bw,
            p: r.axis === 'x' ? [bc, fixed] : [fixed, bc], atten: bw < 1.2 ? 0.35 : 0.75,
          })
        }
      }
      return out.sort((a, b) => a.c - b.c)
    }
    const winsFor = (a0, a1, step) => {
      const out = []
      const n = Math.max(1, Math.round((a1 - a0) / step))
      for (let i = 0; i < n; i++) {
        const c = a0 + (a1 - a0) * (i + 0.5) / n
        out.push({ c, w: Math.min(step - 1.0, 2.6), type: 'window', sill: 0.95, head: 2.65 })
      }
      return out
    }

    // 외벽 (창문 리듬)
    wall(f, y, 'x', BAND.N.outer, B.x0, B.x1, { c: PAL.wallOut, base: PAL.wallOutBase, openings: winsFor(B.x0 + 1, B.x1 - 1, 3.2) })
    wall(f, y, 'x', BAND.S.outer, B.x0, B.x1, { c: PAL.wallOut, base: PAL.wallOutBase, openings: winsFor(B.x0 + 1, B.x1 - 1, 3.2) })
    wall(f, y, 'z', BAND.W.outer, B.z0, B.z1, { c: PAL.wallOut, base: PAL.wallOutBase, openings: winsFor(B.z0 + 1, B.z1 - 1, 3.2) })
    wall(f, y, 'z', BAND.E.outer, B.z0, B.z1, { c: PAL.wallOut, base: PAL.wallOutBase, openings: winsFor(B.z0 + 1, B.z1 - 1, 3.2) })

    // 칸막이벽 (실↔복도) : 문 + 상부 고창
    wall(f, y, 'x', BAND.N.part, B.x0, B.x1, { c: PAL.corrWall, base: PAL.corrBase, openings: doorsFor('N') })
    wall(f, y, 'x', BAND.S.part, B.x0, B.x1, { c: PAL.corrWall, base: PAL.corrBase, openings: doorsFor('S') })
    wall(f, y, 'z', BAND.W.part, B.z0, B.z1, { c: PAL.corrWall, base: PAL.corrBase, openings: doorsFor('W') })
    wall(f, y, 'z', BAND.E.part, B.z0, B.z1, { c: PAL.corrWall, base: PAL.corrBase, openings: doorsFor('E') })

    // 중정 벽. 1층은 십자 동선이 지나가도록 가운데를 연다 — 링에 현(弦)을 놓는다
    const courtWins = (a0, a1, side) => {
      const wins = winsFor(a0, a1, 2.8)
      // 1층은 십자 동선, 2층은 세로 다리(N·S), 3층은 가로 다리(W·E)가 지나간다
      const open = f === 'F1' ? true
        : f === 'F2' ? (side === 'N' || side === 'S')
        : f === 'F3' ? (side === 'W' || side === 'E') : false
      if (!open) return wins
      const c = (a0 + a1) / 2
      const w = f === 'F1' ? 3.6 : 3.0
      LEAKS.push({ f, id: 'leak_court_' + f + side, kind: 'court', grade: 'walk', w, p: null, atten: 0.8 })
      return wins.filter((o) => Math.abs(o.c - c) > 3.2).concat([{ c, w, head: 2.7 }])
    }
    wall(f, y, 'x', BAND.N.court, COURT.x0, COURT.x1, { c: PAL.corrWall, base: PAL.corrBase, openings: courtWins(COURT.x0, COURT.x1, 'N') })
    wall(f, y, 'x', BAND.S.court, COURT.x0, COURT.x1, { c: PAL.corrWall, base: PAL.corrBase, openings: courtWins(COURT.x0, COURT.x1, 'S') })
    wall(f, y, 'z', BAND.W.court, COURT.z0, COURT.z1, { c: PAL.corrWall, base: PAL.corrBase, openings: courtWins(COURT.z0, COURT.z1, 'W') })
    wall(f, y, 'z', BAND.E.court, COURT.z0, COURT.z1, { c: PAL.corrWall, base: PAL.corrBase, openings: courtWins(COURT.z0, COURT.z1, 'E') })

    // 실간 칸막이
    for (const r of rows) {
      if (r.axis === 'x') {
        for (const band of [BAND.N.room, BAND.S.room]) {
          if ((r.wing === 'N') !== (band === BAND.N.room)) continue
          wall(f, y, 'z', r.b, band[0], band[1], { c: PAL.classWall, base: PAL.classBase })
        }
      } else {
        for (const band of [BAND.W.room, BAND.E.room]) {
          if ((r.wing === 'W') !== (band === BAND.W.room)) continue
          wall(f, y, 'x', r.b, band[0], band[1], { c: PAL.classWall, base: PAL.classBase })
        }
      }
    }
    // 파손부 잔해 — 뚫린 자리 양쪽에 벽돌이 흩어진다
    for (const r of rows) {
      if (COND[f.toLowerCase() + '_' + r.id] !== 'breach') continue
      const c = (r.a + r.b) / 2 - (r.b - r.a) / 4
      const fixed = BAND[r.wing].part
      const rr = rngFrom(hash32('br:' + f + r.id))
      for (let i = 0; i < 14; i++) {
        const off = (rr() - 0.5) * 2.6, d2 = (rr() - 0.5) * 1.8
        const p = r.axis === 'x' ? [c + off, y + 0.1 + rr() * 0.18, fixed + d2] : [fixed + d2, y + 0.1 + rr() * 0.18, c + off]
        V(f, p, [0.22 + rr() * 0.5, 0.12 + rr() * 0.24, 0.22 + rr() * 0.5], rr() < 0.5 ? PAL.corrWall : PAL.concrete, { rot: [rr(), rr() * 3, rr()] })
      }
      // 노출 철근
      for (let i = 0; i < 4; i++) {
        const off = (rr() - 0.5) * 1.8
        const p = r.axis === 'x' ? [c + off, y + 1.4, fixed] : [fixed, y + 1.4, c + off]
        CY(f, p, 0.02, 0.7 + rr() * 0.5, PAL.steel, { rot: [(rr() - 0.5) * 0.8, 0, (rr() - 0.5) * 0.8] })
      }
    }
    makeCores(f)
  }

  /* ── 코어: 계단 · 화장실 · 엘리베이터 · 로비 ────────────── */
  function makeCores(f) {
    const y = FLOOR_Y[f]
    for (const core of CORES) {
      const r = R(core.x[0], core.z[0], core.x[1], core.z[1])
      const isNorth = core.z[0] < -40
      // 계단은 코어의 절반, 나머지 절반은 화장실/EV/로비
      const splitX = mid(core.x[0], core.x[1])
      const stairRect = core.door === 'E' ? R(core.x[0], core.z[0], splitX - 0.1, core.z[1]) : R(splitX + 0.1, core.z[0], core.x[1], core.z[1])
      const otherRect = core.door === 'E' ? R(splitX + 0.1, core.z[0], core.x[1], core.z[1]) : R(core.x[0], core.z[0], splitX - 0.1, core.z[1])

      P(f, [mid(stairRect.x0, stairRect.x1), y + 0.02, mid(stairRect.z0, stairRect.z1)], [stairRect.x1 - stairRect.x0, stairRect.z1 - stairRect.z0], PAL.corrFloor)
      rooms.push({ id: `${f.toLowerCase()}_${core.id}`, name: `${core.name}`, kind: 'stair', floor: f, x0: stairRect.x0, z0: stairRect.z0, x1: stairRect.x1, z1: stairRect.z1, cx: mid(stairRect.x0, stairRect.x1), cz: mid(stairRect.z0, stairRect.z1), tone: 'cool', wing: 'C' })

      // 계단 2플라이트 (챌판 0.225 × 8 = 1.8m / 참)
      if (f !== 'ROOF') {
        const sx0 = stairRect.x0 + 0.3, sx1 = stairRect.x1 - 0.3
        const dirZ = isNorth ? 1 : -1
        const zStart = isNorth ? stairRect.z0 + 0.4 : stairRect.z1 - 0.4
        const runW = (sx1 - sx0 - 0.4) / 2
        for (let fl = 0; fl < 2; fl++) {
          const lx = fl === 0 ? sx0 + runW / 2 : sx1 - runW / 2
          const dz = fl === 0 ? dirZ : -dirZ
          const z0 = fl === 0 ? zStart : zStart + dirZ * 4.6
          for (let i = 0; i < 8; i++) {
            const h = 0.225 * (i + 1) + fl * 1.8
            const zz = z0 + dz * (0.28 + i * 0.55)
            V(f, [lx, y + h - 0.1, zz], [runW, 0.2, 0.55], '#6d757c')
            V(f, [lx, y + h - 0.22, zz - dz * 0.27], [runW, 0.24, 0.05], '#5a6268')
          }
          // 숨은 경사 콜라이더
          const ang = Math.atan2(1.8, 4.4)
          S(f, [lx, y + fl * 1.8 + 0.9 - 0.1, z0 + dz * 2.4], [runW, 0.2, 4.78], '#6d757c', { rot: [dz > 0 ? -ang : ang, 0, 0], ramp: true, hide: true })
        }
        // 참
        S(f, [mid(sx0, sx1), y + 1.72, zStart + dirZ * 5.1], [sx1 - sx0, 0.16, 1.6], '#6d757c')
        S(f, [mid(sx0, sx1), y + 3.52, zStart + dirZ * 0.2], [sx1 - sx0, 0.16, 1.2], '#6d757c')
        // 난간
        for (const lx of [sx0 + runW + 0.1, sx0 - 0.05, sx1 + 0.05]) {
          CY(f, [lx, y + 1.9, mid(stairRect.z0, stairRect.z1)], 0.035, stairRect.z1 - stairRect.z0 - 0.8, PAL.rail, [Math.PI / 2, 0, 0])
        }
      }
      // 층 표시판
      V(f, [mid(stairRect.x0, stairRect.x1), y + 2.4, isNorth ? stairRect.z0 + 0.16 : stairRect.z1 - 0.16], [0.9, 0.6, 0.06], PAL.paper)

      // 나머지 절반
      const isEV = core.id === 'core_ne'
      const isLobby = core.id === 'core_se' && f === 'F1'
      const kind = isEV ? 'service' : isLobby ? 'lobby' : f === 'B1' ? 'store' : 'toilet'
      const name = isEV ? '엘리베이터 홀' : isLobby ? '중앙 현관' : `화장실 (${core.name.slice(0, 2)})`
      room(f, otherRect, { id: `${f.toLowerCase()}_${core.id}_b`, name, kind, wing: 'C' })

      // 코어 외곽벽 + 복도측 개구부
      const dz = mid(core.z[0], core.z[1])
      const dx = mid(core.x[0], core.x[1])
      if (core.door === 'E') {
        wall(f, y, 'z', core.x[1] + 0.1, core.z[0] - 0.1, core.z[1] + 0.1, { c: PAL.corrWall, base: PAL.corrBase, openings: [{ c: dz, w: 2.0, type: 'door', head: 2.3 }] })
        wall(f, y, 'x', isNorth ? core.z[1] + 0.1 : core.z[0] - 0.1, core.x[0] - 0.1, core.x[1] + 0.1, { c: PAL.corrWall, base: PAL.corrBase, openings: [{ c: dx, w: 2.0, type: 'door', head: 2.3 }] })
      } else {
        wall(f, y, 'z', core.x[0] - 0.1, core.z[0] - 0.1, core.z[1] + 0.1, { c: PAL.corrWall, base: PAL.corrBase, openings: [{ c: dz, w: 2.0, type: 'door', head: 2.3 }] })
        wall(f, y, 'x', isNorth ? core.z[1] + 0.1 : core.z[0] - 0.1, core.x[0] - 0.1, core.x[1] + 0.1, { c: PAL.corrWall, base: PAL.corrBase, openings: [{ c: dx, w: 2.0, type: 'door', head: 2.3 }] })
      }
      // 계단실 ↔ 나머지 사이 벽
      wall(f, y, 'z', splitX, core.z[0], core.z[1], { c: PAL.corrWall, base: PAL.corrBase, openings: [{ c: mid(core.z[0], core.z[1]) + 1.6, w: 1.0, type: 'door' }] })
    }
  }

  /* ── 엘리베이터 (B1 → ROOF 관통 실사) ─────────────────── */
  const EV = { x: [3.4, 6.4], z: [-56.6, -53.2] }
  function makeElevator() {
    const bottom = FLOOR_Y.B1 - 1.4, top = FLOOR_Y.ROOF + 3.4
    const h = top - bottom
    // 승강로 3면
    S('F1', [EV.x[0] - 0.12, bottom + h / 2, mid(EV.z[0], EV.z[1])], [0.24, h, EV.z[1] - EV.z[0] + 0.5], PAL.concrete)
    S('F1', [EV.x[1] + 0.12, bottom + h / 2, mid(EV.z[0], EV.z[1])], [0.24, h, EV.z[1] - EV.z[0] + 0.5], PAL.concrete)
    S('F1', [mid(EV.x[0], EV.x[1]), bottom + h / 2, EV.z[0] - 0.12], [EV.x[1] - EV.x[0] + 0.5, h, 0.24], PAL.concrete)
    // 가이드 레일 + 균형추
    for (const rx of [EV.x[0] + 0.16, EV.x[1] - 0.16]) V('F1', [rx, bottom + h / 2, EV.z[0] + 0.35], [0.1, h, 0.16], PAL.steel)
    V('F1', [mid(EV.x[0], EV.x[1]) + 1.0, bottom + h * 0.45, EV.z[0] + 0.45], [0.5, 1.6, 0.3], '#4a5157')
    CY('F1', [mid(EV.x[0], EV.x[1]), bottom + h * 0.8, EV.z[0] + 0.45], 0.02, h * 0.4, '#767c80')
    // 층별 승강장 문 + 호출버튼 + 층 인디케이터
    for (const fk of ['B1', 'F1', 'F2', 'F3']) {
      const y = FLOOR_Y[fk]
      const ecx = mid(EV.x[0], EV.x[1])
      // 2짝 슬라이딩 — 좌우로 밀린다
      for (const sd of [-1, 1]) {
        doors.push({
          f: fk, id: 'ev_' + fk + (sd > 0 ? '_r' : '_l'), slide: true, axis: 'x', fixed: EV.z[1] + 0.02,
          hinge: [ecx + (sd > 0 ? 0.01 : -0.63), y + 0.02, EV.z[1] + 0.02],
          w: 0.62, h: 2.2, t: 0.09, swing: sd, kind: 'elevator', c: '#9aa2a8',
        })
      }
      V(fk, [ecx, y + 2.35, EV.z[1] + 0.06], [1.5, 0.2, 0.1], PAL.doorFrame)
      // 층 표시 — 삼각 화살표 + 숫자창
      V(fk, [ecx, y + 2.55, EV.z[1] + 0.07], [0.62, 0.2, 0.05], '#141a1f')
      V(fk, [ecx - 0.16, y + 2.55, EV.z[1] + 0.1], [0.13, 0.13, 0.02], '#ffb45c', { e: 1 })
      V(fk, [ecx + 0.14, y + 2.55, EV.z[1] + 0.1], [0.16, 0.13, 0.02], '#ff8a3a', { e: 1 })
      // 호출 버튼 패널 (상·하)
      V(fk, [EV.x[1] - 0.15, y + 1.15, EV.z[1] + 0.08], [0.16, 0.34, 0.05], '#c9ced2')
      V(fk, [EV.x[1] - 0.15, y + 1.24, EV.z[1] + 0.11], [0.07, 0.07, 0.02], '#7fe0a8', { e: 1 })
      V(fk, [EV.x[1] - 0.15, y + 1.06, EV.z[1] + 0.11], [0.07, 0.07, 0.02], '#3d454b')
      // 문턱 홈 + 발매트
      P(fk, [ecx, y + 0.03, EV.z[1] + 0.24], [1.6, 0.18], '#8d949a')
      P(fk, [ecx, y + 0.035, EV.z[1] + 0.9], [1.9, 1.1], '#5c6167')
      // 점자 층수 표지
      V(fk, [EV.x[0] + 0.14, y + 1.4, EV.z[1] + 0.08], [0.14, 0.18, 0.03], '#8d949a')
      FX(fk, [ecx, y + CEIL_H - 0.4, EV.z[1] + 1.1], TONE.cool, 'cool', false)
    }
    // 옥상 권상기실
    S('ROOF', [mid(EV.x[0], EV.x[1]), FLOOR_Y.ROOF + 1.6, mid(EV.z[0], EV.z[1])], [EV.x[1] - EV.x[0] + 1.0, 3.2, EV.z[1] - EV.z[0] + 1.0], '#4d555b')
    V('ROOF', [mid(EV.x[0], EV.x[1]), FLOOR_Y.ROOF + 3.35, mid(EV.z[0], EV.z[1])], [EV.x[1] - EV.x[0] + 1.4, 0.25, EV.z[1] - EV.z[0] + 1.4], '#3f474d')
  }

  /**
   * 중정 브릿지 — 2층 세로(N↔S), 3층 가로(W↔E).
   * 교차점에 원형 계단이 서서 중정 바닥·2층·3층을 하나로 묶는다.
   * 링이 세 층에서 서로 다른 현(弦)을 갖게 되므로 층마다 추격 규칙이 달라진다.
   */
  const BRIDGE = {
    F2: { axis: 'z', x: -24, z0: BAND.N.court, z1: BAND.S.court, w: 3.0 },
    F3: { axis: 'x', z: -34, x0: BAND.W.court, x1: BAND.E.court, w: 3.0 },
  }
  const SPIRAL = { x: -24, z: -34, rOuter: 2.3, rCore: 0.32 }

  function makeBridges() {
    for (const f of ['F2', 'F3']) {
      const b = BRIDGE[f], y = FLOOR_Y[f]
      const alongZ = b.axis === 'z'
      const a0 = alongZ ? b.z0 : b.x0, a1 = alongZ ? b.z1 : b.x1
      const len = a1 - a0, ctr = mid(a0, a1)
      const px = alongZ ? b.x : ctr, pz = alongZ ? ctr : b.z
      // 바닥판 + 데크
      S(f, [px, y - 0.14, pz], alongZ ? [b.w, 0.28, len] : [len, 0.28, b.w], PAL.slab)
      P(f, [px, y + 0.02, pz], alongZ ? [b.w, len] : [len, b.w], PAL.corrFloor)
      // 난간: 세로 바 + 상부 손스침
      for (const sgn of [-1, 1]) {
        const rx = alongZ ? b.x + sgn * b.w / 2 : px
        const rz = alongZ ? pz : b.z + sgn * b.w / 2
        V(f, [rx, y + 1.06, rz], alongZ ? [0.08, 0.08, len] : [len, 0.08, 0.08], PAL.rail)
        V(f, [rx, y + 0.5, rz], alongZ ? [0.05, 0.9, len] : [len, 0.9, 0.05], PAL.glass)
        const n = Math.max(4, Math.round(len / 1.4))
        for (let i = 0; i <= n; i++) {
          const t = a0 + len * i / n
          CY(f, alongZ ? [rx, y + 0.55, t] : [t, y + 0.55, rz], 0.028, 1.1, PAL.steel)
        }
      }
      // 캐노피 조명 — 다리는 노출부라 등이 성기다
      const nl = Math.max(3, Math.round(len / 5))
      for (let i = 0; i < nl; i++) {
        const t = a0 + len * (i + 0.5) / nl
        const lp = alongZ ? [b.x, y + 2.9, t] : [t, y + 2.9, b.z]
        V(f, lp, alongZ ? [0.3, 0.1, 0.9] : [0.9, 0.1, 0.3], TONE.cool, { e: 1 })
        FX(f, alongZ ? [b.x, y + 2.75, t] : [t, y + 2.75, b.z], TONE.cool, 'cool', false)
      }
      rooms.push({
        id: f.toLowerCase() + '_bridge', name: f === 'F2' ? '중정 세로 브릿지' : '중정 가로 브릿지',
        kind: 'corridor', floor: f, wing: 'C', tone: 'cool', cond: 'intact',
        x0: alongZ ? b.x - b.w / 2 : a0, x1: alongZ ? b.x + b.w / 2 : a1,
        z0: alongZ ? a0 : b.z - b.w / 2, z1: alongZ ? a1 : b.z + b.w / 2,
        cx: px, cz: pz,
      })
      LEAKS.push({ f, id: 'leak_bridge_' + f, kind: 'bridge', grade: 'open', w: b.w, p: [px, pz], atten: 1.0 })
    }
  }

  /** 교차점 원형 계단 — 중정 바닥(0) → 2층(3.6) → 3층(7.2) */
  function makeSpiral() {
    const { x, z, rOuter, rCore } = SPIRAL
    const legs = [['OUT', 0, FLOOR_Y.F2], ['F2', FLOOR_Y.F2, FLOOR_Y.F3]]
    CY('OUT', [x, FLOOR_Y.F3 / 2 + 0.6, z], rCore, FLOOR_Y.F3 + 1.2, PAL.steel)
    // 계단 밑동 — 중정 바닥에서 첫 디딤판까지
    CY('OUT', [x, 0.09, z], rOuter + 0.35, 0.18, '#6f767b')
    P('OUT', [x, 0.2, z], [(rOuter + 1.4) * 2, (rOuter + 1.4) * 2], '#79807f')
    for (const [f, y0, y1] of legs) {
      const rise = y1 - y0
      const n = Math.round(rise / 0.19)          // 챌판 190 mm
      const turn = (Math.PI * 1.75) / n           // 한 층에 315°
      for (let i = 0; i < n; i++) {
        const a = i * turn
        const ry = y0 + (i + 1) * (rise / n)
        const rm = (rCore + rOuter) / 2
        const th = a - Math.PI / 2   // 로컬 +X 가 반경 방향을 보게 한다
        S(f, [x + Math.sin(a) * rm, ry - 0.06, z + Math.cos(a) * rm],
          [rOuter - rCore - 0.06, 0.12, 0.58], PAL.corrFloor, { rot: [0, th, 0] })
        V(f, [x + Math.sin(a) * rm, ry - 0.16, z + Math.cos(a) * rm],
          [rOuter - rCore - 0.1, 0.09, 0.5], '#6f767b', { rot: [0, th, 0] })
        CY(f, [x + Math.sin(a) * (rOuter - 0.12), ry + 0.5, z + Math.cos(a) * (rOuter - 0.12)], 0.026, 1.05, PAL.steel)
        V(f, [x + Math.sin(a + turn / 2) * (rOuter - 0.12), ry + 1.06, z + Math.cos(a + turn / 2) * (rOuter - 0.12)], [0.06, 0.06, 0.82], PAL.rail, { rot: [0, a - Math.PI / 2, 0] })
      }
      // 착지 참
      const ae = n * turn
      S(f, [x + Math.sin(ae) * ((rCore + rOuter) / 2), y1 + 0.02, z + Math.cos(ae) * ((rCore + rOuter) / 2)], [rOuter - rCore + 0.5, 0.16, 1.3], PAL.corrFloor, { rot: [0, ae - Math.PI / 2, 0] })
    }
    FX('OUT', [x, FLOOR_Y.F2 - 0.4, z], TONE.amber, 'amber', false)
    FX('F2', [x, FLOOR_Y.F3 - 0.4, z], TONE.amber, 'amber', false)
    V('OUT', [x, FLOOR_Y.F2 - 0.5, z], [0.34, 0.12, 0.34], TONE.amber, { e: 1 })
    V('F2', [x, FLOOR_Y.F3 - 0.5, z], [0.34, 0.12, 0.34], TONE.amber, { e: 1 })
    rooms.push({ id: 'court_spiral', name: '중정 원형 계단', kind: 'stair', floor: 'OUT', wing: 'C', tone: 'amber', cond: 'intact', x0: x - rOuter, x1: x + rOuter, z0: z - rOuter, z1: z + rOuter, cx: x, cz: z })
  }

  /* ── 지하 1층 ─────────────────────────────────────────── */
  function makeB1() {
    const f = 'B1', y = FLOOR_Y.B1
    S(f, [mid(-55.8, 7.8), y - 0.3, mid(-57.8, -46.2)], [63.6, 0.6, 11.6], PAL.concrete)
    // 지하 복도 (북측 윙 안쪽)
    const cor = R(-55.8, -50.4, 7.8, -46.2)
    P(f, [mid(cor.x0, cor.x1), y + 0.02, mid(cor.z0, cor.z1)], [cor.x1 - cor.x0, cor.z1 - cor.z0], PAL.machFloor)
    P(f, [mid(cor.x0, cor.x1), y + CEIL_H - 0.02, mid(cor.z0, cor.z1)], [cor.x1 - cor.x0, cor.z1 - cor.z0], PAL.concrete, null, true)
    rooms.push({ id: 'b1_corridor', name: '지하 복도', kind: 'corridor', floor: f, x0: cor.x0, z0: cor.z0, x1: cor.x1, z1: cor.z1, cx: mid(cor.x0, cor.x1), cz: mid(cor.z0, cor.z1), tone: 'dim', wing: 'C' })
    for (let i = 0; i < 12; i++) {
      const x = -54 + i * 5.4
      V(f, [x, y + CEIL_H - 0.14, mid(cor.z0, cor.z1)], [0.9, 0.12, 0.24], TONE.dim, { e: 1 })
      if (i % 3 === 0) FX(f, [x, y + CEIL_H - 0.3, mid(cor.z0, cor.z1)], TONE.dim, 'dim', false)
    }
    for (let i = 0; i < 4; i++) CY(f, [mid(cor.x0, cor.x1), y + CEIL_H - 0.45, cor.z0 + 0.7 + i * 1.0], 0.11, 62, '#5f676d', [0, 0, Math.PI / 2])
    for (const r of B1_ROOMS) room(f, R(r.x[0], r.z[0], r.x[1], r.z[1]), { id: r.id, name: r.name, kind: r.kind, wing: 'N' })
    wall(f, y, 'x', -50.5, -55.8, 7.8, {
      c: PAL.machWall, base: PAL.machBase,
      openings: B1_ROOMS.map((r) => ({ c: mid(r.x[0], r.x[1]), w: 1.4, type: 'door', head: 2.2 })),
    })
    wall(f, y, 'x', -57.9, -55.8, 7.8, { c: PAL.concrete })
    wall(f, y, 'x', -46.1, -55.8, 7.8, { c: PAL.concrete })
    wall(f, y, 'z', -55.9, -57.8, -46.2, { c: PAL.concrete })
    wall(f, y, 'z', 7.9, -57.8, -46.2, { c: PAL.concrete })
    for (const r of B1_ROOMS.slice(0, 4)) wall(f, y, 'z', r.x[1] + 0.1, -57.8, -50.6, { c: PAL.machWall, base: PAL.machBase })

    // 남측 설비 터널 — 폭 1.8 m. 느리지만 술래의 시야를 완전히 벗어난다
    const TUN_W = 1.8, tx = -2.0
    const tz0 = -46.2, tz1 = -17.6
    S(f, [tx, y - 0.3, mid(tz0, tz1)], [TUN_W + 1.2, 0.6, tz1 - tz0], PAL.concrete)
    P(f, [tx, y + 0.02, mid(tz0, tz1)], [TUN_W, tz1 - tz0], PAL.machFloor)
    P(f, [tx, y + 2.25, mid(tz0, tz1)], [TUN_W, tz1 - tz0], PAL.concrete, null, true)
    wall(f, y, 'z', tx - TUN_W / 2, tz0, tz1, { c: PAL.machWall, base: PAL.machBase, h: 2.3 })
    wall(f, y, 'z', tx + TUN_W / 2, tz0, tz1, { c: PAL.machWall, base: PAL.machBase, h: 2.3 })
    for (let i = 0; i < 7; i++) {
      const z2 = tz0 + 2.4 + i * 4.2
      V(f, [tx, y + 2.1, z2], [0.6, 0.1, 0.2], TONE.dim, { e: 1 })
      if (i % 2 === 0) FX(f, [tx, y + 1.95, z2], TONE.dim, 'dim', false)
      CY(f, [tx + 0.7, y + 1.9, mid(tz0, tz1)], 0.09, tz1 - tz0 - 1, '#5f676d', [Math.PI / 2, 0, 0])
    }
    rooms.push({ id: 'b1_tunnel', name: '남측 설비 터널', kind: 'corridor', floor: f, wing: 'C', tone: 'dim', cond: 'intact', x0: tx - TUN_W / 2, x1: tx + TUN_W / 2, z0: tz0, z1: tz1, cx: tx, cz: mid(tz0, tz1) })
    // 남단 기계실 + 남측 코어로 오르는 계단
    const pit = R(-8.0, -17.5, 4.0, -11.0)
    P(f, [mid(pit.x0, pit.x1), y + 0.02, mid(pit.z0, pit.z1)], [pit.x1 - pit.x0, pit.z1 - pit.z0], PAL.machFloor)
    P(f, [mid(pit.x0, pit.x1), y + CEIL_H - 0.02, mid(pit.z0, pit.z1)], [pit.x1 - pit.x0, pit.z1 - pit.z0], PAL.concrete, null, true)
    S(f, [mid(pit.x0, pit.x1), y - 0.3, mid(pit.z0, pit.z1)], [pit.x1 - pit.x0 + 0.6, 0.6, pit.z1 - pit.z0 + 0.6], PAL.concrete)
    rooms.push({ id: 'b1_southpit', name: '남측 펌프실', kind: 'machine', floor: f, wing: 'S', tone: 'dim', cond: 'intact', x0: pit.x0, x1: pit.x1, z0: pit.z0, z1: pit.z1, cx: mid(pit.x0, pit.x1), cz: mid(pit.z0, pit.z1) })
    for (let i = 0; i < 16; i++) {
      V(f, [pit.x1 - 1.6, y + 0.11 + i * 0.225, pit.z1 - 0.7 - i * 0.28], [2.2, 0.22, 0.28], PAL.concrete)
    }
    V(f, [mid(pit.x0, pit.x1), y + CEIL_H - 0.14, mid(pit.z0, pit.z1)], [1.0, 0.12, 0.24], TONE.dim, { e: 1 })
    FX(f, [mid(pit.x0, pit.x1), y + CEIL_H - 0.3, mid(pit.z0, pit.z1)], TONE.dim, 'dim', false)
    LEAKS.push({ f, id: 'leak_b1_tunnel', kind: 'tunnel', grade: 'crawl', w: TUN_W, p: [tx, mid(tz0, tz1)], atten: 0.4 })
  }

  /* ── 옥상 ─────────────────────────────────────────────── */
  function makeRoof() {
    const f = 'ROOF', y = FLOOR_Y.ROOF
    const cs = [
      [B.x0, B.z0, B.x1, COURT.z0], [B.x0, COURT.z1, B.x1, B.z1],
      [B.x0, COURT.z0, COURT.x0, COURT.z1], [COURT.x1, COURT.z0, B.x1, COURT.z1],
    ]
    for (const [x0, z0, x1, z1] of cs) {
      S(f, [mid(x0, x1), y - SLAB_T / 2, mid(z0, z1)], [x1 - x0, SLAB_T, z1 - z0], '#5a6167')
      P(f, [mid(x0, x1), y + 0.02, mid(z0, z1)], [x1 - x0, z1 - z0], '#6b7278')
    }
    // 파라펫 (외곽 + 중정)
    const para = (x0, z0, x1, z1) => {
      S(f, [mid(x0, x1), y + 0.6, z0], [x1 - x0, 1.2, 0.28], '#7b8288')
      S(f, [mid(x0, x1), y + 0.6, z1], [x1 - x0, 1.2, 0.28], '#7b8288')
      S(f, [x0, y + 0.6, mid(z0, z1)], [0.28, 1.2, z1 - z0], '#7b8288')
      S(f, [x1, y + 0.6, mid(z0, z1)], [0.28, 1.2, z1 - z0], '#7b8288')
    }
    para(B.x0, B.z0, B.x1, B.z1)
    para(COURT.x0, COURT.z0, COURT.x1, COURT.z1)
    // 계단 펜트하우스 4
    for (const core of CORES) {
      const cx = mid(core.x[0], core.x[1]), cz = mid(core.z[0], core.z[1])
      S(f, [cx, y + 1.4, cz], [core.x[1] - core.x[0] - 0.6, 2.8, core.z[1] - core.z[0] - 0.6], '#4f575d')
      V(f, [cx, y + 2.95, cz], [core.x[1] - core.x[0] + 0.2, 0.24, core.z[1] - core.z[0] + 0.2], '#3f474d')
      V(f, [cx, y + 1.05, cz + (core.z[0] < -40 ? 3.3 : -3.3)], [1.2, 2.1, 0.12], PAL.door)
      FX(f, [cx, y + 2.4, cz + (core.z[0] < -40 ? 3.6 : -3.6)], TONE.amber, 'amber', false)
    }
    // 물탱크 · 실외기 · 온실
    for (const px of [-30, -22]) { CY(f, [px, y + 1.9, -54], 2.0, 3.8, '#8b9298'); for (let i = 0; i < 4; i++) CY(f, [px + (i % 2 ? 1.6 : -1.6), y + 0.8, -54 + (i < 2 ? 1.6 : -1.6)], 0.09, 1.6, PAL.steel) }
    for (let i = 0; i < 8; i++) S(f, [-40 + (i % 4) * 2.6, y + 0.6, -14 + Math.floor(i / 4) * 2.4], [1.6, 1.2, 1.4], '#59616a')
    // 옥상 온실
    S(f, [-16, y + 1.2, -14], [8, 2.4, 6], '#6d757c')
    V(f, [-16, y + 1.4, -14], [7.6, 2.0, 5.6], PAL.glass)
    V(f, [-16, y + 2.55, -14], [8.6, 0.2, 6.6], '#4f575d')
    // 외부 비상계단 (동측 외벽, 1F → 옥상)
    for (let fl = 0; fl < 3; fl++) {
      const y0 = fl * 3.6
      const ang = Math.atan2(1.8, 4.4)
      for (const [dz, zc] of [[1, -34], [-1, -29.4]]) {
        S('OUT', [10.4, y0 + (dz > 0 ? 0.9 : 2.7), zc], [1.6, 0.2, 4.78], PAL.steel, { rot: [dz > 0 ? -ang : ang, 0, 0], ramp: true, hide: true })
        for (let i = 0; i < 8; i++) V('OUT', [10.4, y0 + (dz > 0 ? 0 : 1.8) + 0.225 * (i + 1) - 0.1, zc + dz * (-2.2 + 0.28 + i * 0.55)], [1.6, 0.1, 0.5], PAL.steel)
      }
      S('OUT', [10.4, y0 + 1.75, -31.7], [1.8, 0.16, 1.6], PAL.steel)
      S('OUT', [10.4, y0 + 3.55, -36.4], [1.8, 0.16, 1.6], PAL.steel)
      for (const rx of [9.5, 11.3]) CY('OUT', [rx, y0 + 2.6, -32.5], 0.04, 9, PAL.rail, [Math.PI / 2, 0, 0])
      // 스트링거 (측판)
      for (const [dz, zc] of [[1, -34], [-1, -29.4]]) {
        for (const sx of [9.56, 11.24]) V('OUT', [sx, y0 + (dz > 0 ? 0.78 : 2.58), zc], [0.09, 0.34, 4.78], '#5d666d', { rot: [dz > 0 ? -ang : ang, 0, 0] })
        // 그레이팅 슬랫 — 디딤판마다 5 줄
        for (let i = 0; i < 8; i++) {
          const ty = y0 + (dz > 0 ? 0 : 1.8) + 0.225 * (i + 1) - 0.045
          const tz = zc + dz * (-2.2 + 0.28 + i * 0.55)
          for (let g = 0; g < 5; g++) V('OUT', [9.72 + g * 0.34, ty, tz], [0.06, 0.02, 0.46], '#7d858c')
          V('OUT', [10.4, ty + 0.01, tz + dz * 0.22], [1.6, 0.025, 0.05], '#c9b24a')   // 야광 노즈
        }
      }
      // 난간 세로살
      for (const rx of [9.5, 11.3]) {
        for (let i = 0; i < 9; i++) CY('OUT', [rx, y0 + 1.9 + (i % 2) * 0.5, -36.6 + i * 1.05], 0.018, 1.0, PAL.rail)
      }
      // 계단참 난간 + 발판 그레이팅
      for (const [lz, ly] of [[-31.7, y0 + 1.75], [-36.4, y0 + 3.55]]) {
        for (let g = 0; g < 6; g++) V('OUT', [9.65 + g * 0.3, ly + 0.09, lz], [0.07, 0.03, 1.5], '#7d858c')
        for (const rx of [9.55, 11.25]) { CY('OUT', [rx, ly + 0.55, lz - 0.6], 0.018, 1.1, PAL.rail); CY('OUT', [rx, ly + 0.55, lz + 0.6], 0.018, 1.1, PAL.rail) }
        CY('OUT', [10.4, ly + 1.08, lz + (lz < -34 ? -0.78 : 0.78)], 0.03, 1.7, PAL.rail, [0, 0, Math.PI / 2])
      }
      // 외벽 고정 브래킷
      for (const bz of [-30.4, -33.2, -36.0]) { V('OUT', [8.9, y0 + 1.8, bz], [1.0, 0.12, 0.14], '#5d666d'); V('OUT', [8.5, y0 + 1.5, bz], [0.16, 0.7, 0.14], '#5d666d') }
      // 층 표시 + 비상등
      V('OUT', [11.42, y0 + 2.2, -33.0], [0.05, 0.34, 0.34], '#1f272c')
      V('OUT', [11.46, y0 + 2.2, -33.0], [0.02, 0.24, 0.24], '#d6dde1')
      FX('OUT', [10.4, y0 + 3.1, -33.4], TONE.amber, 'amber', false)
      V('OUT', [10.4, y0 + 3.2, -33.4], [0.24, 0.1, 0.24], TONE.amber, { e: 1 })
    }
    S('OUT', [9.0, FLOOR_Y.ROOF + 0.05, -36.4], [2.2, 0.2, 1.6], PAL.steel)
    roofDetail(f, y)
  }

  /** 옥상은 설비가 사는 층이다 — 방수 이음매·배수·덕트·안테나·펜스 */
  function roofDetail(f, y) {
    const rr = rngFrom(hash32('roof:' + SEED))
    // 방수 시트 이음매 — 2.4 m 격자
    for (let x = B.x0 + 2.4; x < B.x1; x += 2.4) {
      if (x > COURT.x0 - 0.5 && x < COURT.x1 + 0.5) {
        P(f, [x, y + 0.035, mid(B.z0, COURT.z0)], [0.08, COURT.z0 - B.z0], '#5f666b')
        P(f, [x, y + 0.035, mid(COURT.z1, B.z1)], [0.08, B.z1 - COURT.z1], '#5f666b')
      } else P(f, [x, y + 0.035, mid(B.z0, B.z1)], [0.08, B.z1 - B.z0], '#5f666b')
    }
    // 파라펫 상부 두겁 + 난간 파이프
    const cap = (x0, z0, x1, z1) => {
      V(f, [mid(x0, x1), y + 1.24, z0], [x1 - x0 + 0.3, 0.09, 0.42], '#9aa1a6')
      V(f, [mid(x0, x1), y + 1.24, z1], [x1 - x0 + 0.3, 0.09, 0.42], '#9aa1a6')
      V(f, [x0, y + 1.24, mid(z0, z1)], [0.42, 0.09, z1 - z0 + 0.3], '#9aa1a6')
      V(f, [x1, y + 1.24, mid(z0, z1)], [0.42, 0.09, z1 - z0 + 0.3], '#9aa1a6')
    }
    cap(B.x0, B.z0, B.x1, B.z1)
    cap(COURT.x0, COURT.z0, COURT.x1, COURT.z1)
    for (const zz of [B.z0, B.z1]) {
      for (let x = B.x0 + 2; x < B.x1; x += 2.2) CY(f, [x, y + 1.75, zz], 0.03, 0.95, PAL.rail)
      CY(f, [mid(B.x0, B.x1), y + 2.2, zz], 0.035, B.x1 - B.x0, PAL.rail, [0, 0, Math.PI / 2])
    }
    // 배수 드레인 + 물자국
    for (const [dx, dz] of [[-50, -52], [2, -52], [-50, -16], [2, -16], [-30, -16]]) {
      CY(f, [dx, y + 0.05, dz], 0.28, 0.1, '#4a5155')
      P(f, [dx, y + 0.045, dz], [3.4, 3.0], '#5d6469')
    }
    // 덕트 라인 — 기계실에서 옥상까지
    for (let i = 0; i < 5; i++) {
      const zx = -46 + i * 8
      S(f, [zx, y + 0.75, -40], [1.1, 1.1, 12], '#7f878d')
      V(f, [zx, y + 1.34, -40], [1.2, 0.1, 12], '#666e74')
      for (let k = 0; k < 5; k++) CY(f, [zx, y + 0.15, -45 + k * 2.4], 0.06, 0.4, PAL.steel)
    }
    // 환기 후드 6
    for (let i = 0; i < 6; i++) {
      const hx = -44 + i * 7, hz = -22
      CY(f, [hx, y + 0.55, hz], 0.52, 1.1, '#8b9298')
      V(f, [hx, y + 1.22, hz], [1.5, 0.24, 1.5], '#6d757c', { rot: [0, rr() * 0.4, 0] })
      CY(f, [hx, y + 1.5, hz], 0.16, 0.4, PAL.steel)
    }
    // 안테나 마스트 + 피뢰침 + 항공장애등
    CY(f, [-6, y + 4.2, -52], 0.09, 8.4, PAL.steel)
    for (let i = 0; i < 4; i++) CY(f, [-6, y + 5.0 + i * 0.9, -52], 0.5, 0.05, PAL.rail, [Math.PI / 2, 0, 0])
    for (const [gx, gz] of [[-6.9, -52], [-5.1, -52], [-6, -52.9]]) CY(f, [gx, y + 1.4, gz], 0.012, 5.6, PAL.steel, [0.28, 0, 0])
    V(f, [-6, y + 8.5, -52], [0.16, 0.16, 0.16], '#ff4a4a', { e: 1 })
    FX(f, [-6, y + 8.5, -52], '#ff6a6a', 'amber', false)
    CY(f, [B.x1 - 2, y + 2.2, B.z0 + 2], 0.03, 2.2, PAL.steel)
    // 급수 배관 + 물탱크 사다리
    for (const px of [-30, -22]) {
      for (let i = 0; i < 9; i++) V(f, [px + 2.1, y + 0.3 + i * 0.38, -54], [0.46, 0.05, 0.05], PAL.steel)
      CY(f, [px, y + 3.9, -54], 0.06, 3.6, PAL.steel, [0, 0, Math.PI / 2])
    }
    // 실외기 배관과 받침대
    for (let i = 0; i < 8; i++) {
      const ox2 = -40 + (i % 4) * 2.6, oz2 = -14 + Math.floor(i / 4) * 2.4
      V(f, [ox2, y + 0.06, oz2], [1.9, 0.12, 1.7], '#6d757c')
      CY(f, [ox2 + 0.9, y + 0.9, oz2], 0.05, 1.4, PAL.steel, [0, 0, 0.4])
      V(f, [ox2, y + 1.24, oz2], [1.3, 0.06, 1.2], '#4a5157')
    }
    // 바닥 표시 · 접근 금지선
    P(f, [-16, y + 0.045, -34], [10, 0.12], '#c9b24a')
    P(f, [-16, y + 0.045, -30], [10, 0.12], '#c9b24a')
  }

  /* ── 중정 ─────────────────────────────────────────────── */
  function makeCourtyard() {
    const y = 0
    P('OUT', [mid(COURT.x0, COURT.x1), 0.02, mid(COURT.z0, COURT.z1)], [COURT.x1 - COURT.x0, COURT.z1 - COURT.z0], '#4a5545')
    // 포장 십자 동선
    P('OUT', [mid(COURT.x0, COURT.x1), 0.04, mid(COURT.z0, COURT.z1)], [COURT.x1 - COURT.x0, 3.0], '#7d8288')
    P('OUT', [mid(COURT.x0, COURT.x1), 0.04, mid(COURT.z0, COURT.z1)], [3.0, COURT.z1 - COURT.z0], '#7d8288')
    // 중앙은 원형 계단이 선다. 화단은 네 귀로 물러난다
    for (const [tx, tz] of [[-36, -28], [-12, -40], [-36, -40], [-12, -28]]) {
      CY('OUT', [tx, 1.6, tz], 0.22, 3.2, '#4a3c2c')
      CY('OUT', [tx, 3.9, tz], 2.2, 2.6, '#2e4630')
    }
    for (let i = 0; i < 4; i++) {
      const bx = -38 + i * 9
      V('OUT', [bx, 0.42, -25.5], [1.8, 0.1, 0.45], PAL.wood)
      V('OUT', [bx, 0.22, -25.5], [1.6, 0.35, 0.3], PAL.steel)
    }
    // 조명 폴 4
    for (const [lx, lz] of [[-38, -42], [-10, -42], [-38, -26], [-10, -26]]) {
      CY('OUT', [lx, 1.8, lz], 0.08, 3.6, '#3f474d')
      V('OUT', [lx, 3.7, lz], [0.4, 0.18, 0.4], TONE.amber, { e: 1 })
    }
  }

  /* ── 체육관 ───────────────────────────────────────────── */
  const GYM = { x0: 16, x1: 48, z0: -58, z1: -30 }
  function makeGym() {
    const f = 'F1', y = 0, H = 9.4
    P(f, [mid(GYM.x0, GYM.x1), 0.02, mid(GYM.z0, GYM.z1)], [GYM.x1 - GYM.x0, GYM.z1 - GYM.z0], '#b08b52')
    rooms.push({ id: 'gym', name: '체육관', kind: 'gym', floor: 'F1', x0: GYM.x0, z0: GYM.z0, x1: GYM.x1, z1: GYM.z1, cx: mid(GYM.x0, GYM.x1), cz: mid(GYM.z0, GYM.z1), tone: 'cool', wing: 'X' })
    const openings = [{ c: mid(GYM.z0, GYM.z1), w: 3.2, type: 'door', head: 2.6 }]
    wall(f, y, 'x', GYM.z0, GYM.x0, GYM.x1, { h: H, t: 0.35, c: PAL.wallOut, base: PAL.wallOutBase })
    wall(f, y, 'x', GYM.z1, GYM.x0, GYM.x1, { h: H, t: 0.35, c: PAL.wallOut, base: PAL.wallOutBase, openings: [{ c: 32, w: 3.4, type: 'door', head: 2.8 }] })
    wall(f, y, 'z', GYM.x0, GYM.z0, GYM.z1, { h: H, t: 0.35, c: PAL.wallOut, base: PAL.wallOutBase, openings })
    wall(f, y, 'z', GYM.x1, GYM.z0, GYM.z1, { h: H, t: 0.35, c: PAL.wallOut, base: PAL.wallOutBase })
    // 고창 리듬
    for (let i = 0; i < 8; i++) { V(f, [GYM.x0 + 2 + i * 4, 7.4, GYM.z0 + 0.2], [2.6, 1.8, 0.1], PAL.glass); V(f, [GYM.x0 + 2 + i * 4, 7.4, GYM.z1 - 0.2], [2.6, 1.8, 0.1], PAL.glass) }
    // 지붕 + 트러스 + 조명
    S(f, [mid(GYM.x0, GYM.x1), H + 0.3, mid(GYM.z0, GYM.z1)], [GYM.x1 - GYM.x0 + 0.7, 0.5, GYM.z1 - GYM.z0 + 0.7], '#4b5259')
    for (let i = 0; i < 5; i++) {
      const x = GYM.x0 + 4 + i * 6
      V(f, [x, H - 0.5, mid(GYM.z0, GYM.z1)], [0.3, 0.6, GYM.z1 - GYM.z0], '#5f676d')
      for (let j = 0; j < 3; j++) { V(f, [x, H - 1.1, GYM.z0 + 7 + j * 7], [1.0, 0.25, 1.0], TONE.cool, { e: 1 }); if (j === 1) FX(f, [x, H - 1.4, GYM.z0 + 7 + j * 7], TONE.cool, 'cool', i === 2) }
    }
    // 무대 (서측)
    S(f, [GYM.x0 + 4, 0.55, mid(GYM.z0, GYM.z1)], [8, 1.1, 16], '#6b5238')
    V(f, [GYM.x0 + 4, 3.4, GYM.z0 + 6], [8.4, 4.6, 0.5], '#5c1f24')
    V(f, [GYM.x0 + 4, 3.4, GYM.z1 - 6], [8.4, 4.6, 0.5], '#5c1f24')
    S(f, [GYM.x0 + 8.6, 0.35, mid(GYM.z0, GYM.z1)], [1.6, 0.7, 3.0], '#7a8086')
    // 관중석 3단
    for (let i = 0; i < 3; i++) {
      S(f, [mid(GYM.x0 + 12, GYM.x1 - 1), 0.3 + i * 0.45, GYM.z0 + 1.6 + i * 1.3], [GYM.x1 - GYM.x0 - 13, 0.6 + i * 0.9, 1.3], '#565e66')
      for (let j = 0; j < 14; j++) V(f, [GYM.x0 + 13 + j * 1.3, 0.65 + i * 0.9, GYM.z0 + 1.6 + i * 1.3], [1.1, 0.08, 0.9], '#37536e')
    }
    // 코트 라인
    P(f, [32, 0.04, -44], [26, 15], null, null); plates.pop()
    const line = (x, z, w, d) => P(f, [x, 0.05, z], [w, d], PAL.line)
    line(32, -51.6, 26, 0.12); line(32, -36.4, 26, 0.12); line(19.2, -44, 0.12, 15.2); line(44.8, -44, 0.12, 15.2); line(32, -44, 0.12, 15.2)
    CY(f, [32, 0.05, -44], 1.8, 0.02, PAL.line)
    for (const gx of [20.2, 43.8]) {
      CY(f, [gx, 3.05, -44], 0.09, 6.1, PAL.steel)
      V(f, [gx + (gx < 32 ? 1.2 : -1.2), 3.05, -44], [1.8, 1.05, 0.06], PAL.white)
      CY(f, [gx + (gx < 32 ? 1.5 : -1.5), 3.05, -44], 0.45, 0.03, '#c0562c', [Math.PI / 2, 0, 0])
    }
    // 늑목 · 벽 패드 · 스코어보드 · 매트 · 뜀틀
    for (let i = 0; i < 5; i++) V(f, [GYM.x1 - 0.5, 1.6, GYM.z0 + 8 + i * 3], [0.2, 2.8, 2.4], '#8f7346')
    V(f, [32, 6.6, GYM.z0 + 0.4], [4.0, 1.8, 0.2], '#1b2026')
    V(f, [32, 6.6, GYM.z0 + 0.32], [3.4, 1.2, 0.06], '#d2603a', { e: 1 })
    for (let i = 0; i < 3; i++) V(f, [GYM.x1 - 3 - i * 2.2, 0.15, GYM.z1 - 2.4], [2.0, 0.3, 1.2], '#3d5a70')
    S(f, [GYM.x1 - 4, 0.6, GYM.z0 + 4], [1.2, 1.2, 1.8], '#8a6a44')
    // 2F 캣워크 + 본관 브릿지
    S('F2', [mid(GYM.x0 + 1.5, GYM.x1 - 1.5), 4.4, GYM.z1 - 1.6], [GYM.x1 - GYM.x0 - 3, 0.25, 2.0], '#5f676d')
    for (const rz of [GYM.z1 - 0.7, GYM.z1 - 2.5]) CY('F2', [mid(GYM.x0, GYM.x1), 5.0, rz], 0.04, GYM.x1 - GYM.x0 - 3, PAL.rail, [0, 0, Math.PI / 2])
    S('F2', [12, 3.4, -38], [8.4, 0.25, 3.2], '#6b7278')
    for (const bz of [-36.5, -39.5]) { S('F2', [12, 4.3, bz], [8.4, 1.6, 0.15], PAL.glass); CY('F2', [12, 5.1, bz], 0.04, 8.4, PAL.rail, [0, 0, Math.PI / 2]) }
    S('F2', [12, 6.4, -38], [8.6, 0.2, 3.6], '#4b5259')
  }

  /* ── 강당 · 수영장 ────────────────────────────────────── */
  function makeHallPool() {
    const f = 'F1', y = 0
    const HALL = { x0: -56, x1: -34, z0: 6, z1: 36 }
    const POOL = { x0: -32, x1: -12, z0: 6, z1: 36 }
    P(f, [mid(HALL.x0, HALL.x1), 0.02, mid(HALL.z0, HALL.z1)], [HALL.x1 - HALL.x0, HALL.z1 - HALL.z0], '#5e4a38')
    rooms.push({ id: 'hall', name: '대강당', kind: 'av', floor: 'F1', x0: HALL.x0, z0: HALL.z0, x1: HALL.x1, z1: HALL.z1, cx: mid(HALL.x0, HALL.x1), cz: mid(HALL.z0, HALL.z1), tone: 'soft', wing: 'X' })
    for (const [ax, fx, a0, a1, op] of [
      ['x', HALL.z0, HALL.x0, HALL.x1, [{ c: -45, w: 3.2, type: 'door', head: 2.6 }]],
      ['x', HALL.z1, HALL.x0, HALL.x1, []],
      ['z', HALL.x0, HALL.z0, HALL.z1, []],
      ['z', HALL.x1, HALL.z0, HALL.z1, [{ c: 21, w: 2.4, type: 'door', head: 2.4 }]],
    ]) wall(f, y, ax, fx, a0, a1, { h: 8.2, t: 0.35, c: PAL.wallOut, base: PAL.wallOutBase, openings: op })
    S(f, [mid(HALL.x0, HALL.x1), 8.45, mid(HALL.z0, HALL.z1)], [HALL.x1 - HALL.x0 + 0.7, 0.5, HALL.z1 - HALL.z0 + 0.7], '#4b5259')
    S(f, [mid(HALL.x0, HALL.x1), 0.6, HALL.z1 - 5], [HALL.x1 - HALL.x0 - 4, 1.2, 9], '#6b5238')
    V(f, [mid(HALL.x0, HALL.x1), 4.4, HALL.z1 - 0.6], [HALL.x1 - HALL.x0 - 5, 5.6, 0.4], '#59202a')
    for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) {
      const zz = HALL.z0 + 3 + i * 2.2
      if (j === 1) continue
      for (let k = 0; k < 5; k++) {
        const xx = HALL.x0 + 3 + j * 7.5 + k * 1.05
        V(f, [xx, 0.42, zz], [0.9, 0.09, 0.5], '#3a4f66'); V(f, [xx, 0.72, zz + 0.25], [0.9, 0.7, 0.09], '#3a4f66')
      }
    }
    for (let i = 0; i < 6; i++) { V(f, [HALL.x0 + 3 + i * 3.2, 7.5, mid(HALL.z0, HALL.z1)], [1.0, 0.2, 14], TONE.soft, { e: 1 }); if (i % 3 === 0) FX(f, [HALL.x0 + 3 + i * 3.2, 7.2, mid(HALL.z0, HALL.z1)], TONE.soft, 'soft', false) }

    P(f, [mid(POOL.x0, POOL.x1), 0.02, mid(POOL.z0, POOL.z1)], [POOL.x1 - POOL.x0, POOL.z1 - POOL.z0], '#8f9aa0')
    rooms.push({ id: 'pool', name: '실내 수영장', kind: 'pool', floor: 'F1', x0: POOL.x0, z0: POOL.z0, x1: POOL.x1, z1: POOL.z1, cx: mid(POOL.x0, POOL.x1), cz: mid(POOL.z0, POOL.z1), tone: 'cool', wing: 'X' })
    for (const [ax, fx, a0, a1, op] of [
      ['x', POOL.z0, POOL.x0, POOL.x1, [{ c: -22, w: 2.6, type: 'door', head: 2.4 }]],
      ['x', POOL.z1, POOL.x0, POOL.x1, []],
      ['z', POOL.x0, POOL.z0, POOL.z1, [{ c: 21, w: 2.4, type: 'door', head: 2.4 }]],
      ['z', POOL.x1, POOL.z0, POOL.z1, []],
    ]) wall(f, y, ax, fx, a0, a1, { h: 7.4, t: 0.35, c: PAL.wallOut, base: PAL.wallOutBase, openings: op })
    S(f, [mid(POOL.x0, POOL.x1), 7.65, mid(POOL.z0, POOL.z1)], [POOL.x1 - POOL.x0 + 0.7, 0.5, POOL.z1 - POOL.z0 + 0.7], '#4b5259')
    // 25m × 12.5m 6레인
    const pw = 12.5, pl = 25, pcx = mid(POOL.x0, POOL.x1), pcz = mid(POOL.z0, POOL.z1)
    P(f, [pcx, 0.05, pcz], [pw, pl], '#1f5468')
    V(f, [pcx, -0.6, pcz], [pw, 1.2, pl], PAL.water)
    for (let i = 1; i < 6; i++) P(f, [pcx - pw / 2 + (pw / 6) * i, 0.06, pcz], [0.16, pl], '#7fc7dc')
    for (const s of [-1, 1]) { V(f, [pcx + s * (pw / 2 + 0.3), 0.08, pcz], [0.6, 0.16, pl + 1.4], '#c8ced1'); V(f, [pcx, 0.08, pcz + s * (pl / 2 + 0.3)], [pw + 1.4, 0.16, 0.6], '#c8ced1') }
    for (let i = 0; i < 6; i++) V(f, [pcx - pw / 2 + (pw / 6) * (i + 0.5), 0.28, pcz - pl / 2 - 0.9], [0.7, 0.4, 0.7], '#b4bbbf')
    for (let i = 0; i < 4; i++) { V(f, [pcx, 6.6, POOL.z0 + 4 + i * 7], [pw + 4, 0.22, 1.0], TONE.cool, { e: 1 }); if (i % 2 === 0) FX(f, [pcx, 6.3, POOL.z0 + 4 + i * 7], TONE.cool, 'cool', false) }
    // 연결 통로
    S(f, [-33, 1.6, 21], [2.4, 3.2, 3.0], '#6b7278')
  }

  /* ── 운동장 ───────────────────────────────────────────── */
  function makeField() {
    const f = 'OUT'
    P(f, [32, 0.01, 0], [50, 50], PAL.dirt)
    P(f, [32, 0.02, 0], [40, 40], PAL.grass)
    // 트랙 라인
    for (let i = 0; i < 5; i++) { P(f, [32, 0.03, -21 - i * 0.02 + 0], [50 - i * 2, 0.12], PAL.line); }
    for (let i = 0; i < 5; i++) { P(f, [32 - 25 + i, 0.03, 0], [0.12, 42], PAL.line) }
    P(f, [32, 0.04, 0], [0.15, 40], PAL.line)
    CY(f, [32, 0.04, 0], 9.15, 0.02, PAL.line)
    for (const s of [-1, 1]) { P(f, [32, 0.04, s * 20], [40, 0.15], PAL.line); P(f, [32, 0.04, s * 17], [18, 0.15], PAL.line); P(f, [32 - 9, 0.04, s * 18.5], [0.15, 3], PAL.line); P(f, [32 + 9, 0.04, s * 18.5], [0.15, 3], PAL.line) }
    // 골대
    for (const s of [-1, 1]) {
      const gz = s * 20
      for (const gx of [32 - 3.66, 32 + 3.66]) CY(f, [gx, 1.22, gz], 0.06, 2.44, PAL.white)
      CY(f, [32, 2.44, gz], 0.06, 7.32, PAL.white, [0, 0, Math.PI / 2])
      V(f, [32, 1.2, gz + s * 1.0], [7.4, 2.4, 0.05], '#c5ccd0')
    }
    // 백네트 + 조명탑
    for (const s of [-1, 1]) { V(f, [32, 3, s * 25], [22, 6, 0.12], '#4c545a'); for (let i = 0; i < 6; i++) CY(f, [21 + i * 4.4, 3, s * 25], 0.1, 6, '#3f474d') }
    for (const [lx, lz] of [[10, -22], [54, -22], [10, 22], [54, 22]]) {
      CY(f, [lx, 6, lz], 0.24, 12, '#464e54')
      V(f, [lx, 12.4, lz], [3.0, 1.0, 0.5], '#3a4147')
      for (let i = 0; i < 6; i++) V(f, [lx - 1.1 + (i % 3) * 1.1, 12.4 + (i < 3 ? 0.28 : -0.28), lz], [0.85, 0.4, 0.3], '#ffe9c4', { e: 1 })
    }
    // 조회대 + 스탠드
    S(f, [11, 0.6, 0], [5, 1.2, 8], '#7b8288')
    S(f, [13.9, 0.6, 0], [3.05, 0.2, 2.4], '#5a6167', { rot: [0, 0, -0.405], ramp: true })
    CY(f, [10, 1.55, 0], 0.03, 0.7, PAL.steel); V(f, [10, 1.95, 0], [0.12, 0.16, 0.12], '#1c2126')
    for (const s of [-1, 1]) { CY(f, [9.2, 3.2, s * 2.6], 0.06, 5.2, '#9aa1a6'); V(f, [9.2, 4.9, s * 2.6 + 0.5], [0.05, 1.2, 1.0], '#c9d0d4') }
    for (let i = 0; i < 3; i++) {
      S(f, [32, 0.35 + i * 0.45, 28 + i * 1.3], [30, 0.7 + i * 0.9, 1.3], '#6b7278')
      for (let j = 0; j < 16; j++) V(f, [18 + j * 1.8, 0.72 + i * 0.9, 28 + i * 1.3], [1.5, 0.08, 0.9], '#3c5670')
    }
    // 음수대 · 철봉 · 모래사장
    for (const [dx, dz] of [[12, 12], [52, -12], [32, 26]]) { V(f, [dx, 0.45, dz], [1.6, 0.9, 0.6], '#8e969b'); V(f, [dx, 0.92, dz], [1.7, 0.06, 0.7], '#b6bec2'); for (let i = 0; i < 3; i++) CY(f, [dx - 0.5 + i * 0.5, 1.06, dz - 0.2], 0.025, 0.28, PAL.steel) }
    for (let i = 0; i < 3; i++) { for (const s of [-1, 1]) CY(f, [55, 0.9 + i * 0.25, -6 + s * 1.6], 0.05, 1.8 + i * 0.5, PAL.steel); CY(f, [55, 1.8 + i * 0.5, -6], 0.045, 3.2, PAL.steel, [Math.PI / 2, 0, 0]) }
    P(f, [56, 0.03, 8], [6, 14], PAL.sand)
  }

  /* ── 놀이터 · 정원 ───────────────────────────────────── */
  function makePlayground() {
    const f = 'OUT'
    P(f, [-46, 0.02, -2], [20, 12], '#6e4b3a')
    // 미끄럼틀 타워
    S(f, [-52, 1.9, -4], [3.2, 0.25, 3.2], '#7a6a4a')
    for (const [cx2, cz2] of [[-53.4, -5.4], [-50.6, -5.4], [-53.4, -2.6], [-50.6, -2.6]]) CY(f, [cx2, 0.95, cz2], 0.11, 1.9, '#6a5a3e')
    for (let i = 0; i < 6; i++) V(f, [-52, 0.35 + i * 0.28, -2.6], [1.4, 0.08, 0.24], '#8a7550')
    S(f, [-49.2, 1.1, -4], [2.9, 0.2, 1.4], '#c06a3a', { rot: [0, 0, -0.52], ramp: true })
    for (const s of [-1, 1]) V(f, [-49.2, 1.35, -4 + s * 0.75], [3.0, 0.5, 0.1], '#a85a30', { rot: [0, 0, -0.52] })
    V(f, [-52, 3.0, -4], [3.6, 0.2, 3.6], '#b8452f')
    for (const [rx, rz] of [[-53.6, -4], [-50.4, -4]]) CY(f, [rx, 2.4, rz], 0.05, 1.1, PAL.rail)
    // 정글짐
    for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3; j++) CY(f, [-46 + i * 1.2, 1.2, -5 + j * 1.2], 0.05, 2.4, '#3f6f8f')
    for (let k = 1; k <= 2; k++) for (let i = 0; i <= 3; i++) {
      CY(f, [-44.2, k * 1.2, -5 + i * 1.2], 0.05, 3.6, '#3f6f8f', [0, 0, Math.PI / 2])
      CY(f, [-46 + i * 1.2, k * 1.2, -3.2], 0.05, 3.6, '#3f6f8f', [Math.PI / 2, 0, 0])
    }
    // 그네
    for (const s of [-1, 1]) { CY(f, [-40, 1.15, -4 + s * 1.6], 0.07, 2.3, '#5a6167', [0, 0, s * 0.28]) }
    CY(f, [-40, 2.28, -4], 0.06, 3.4, '#5a6167', [Math.PI / 2, 0, 0])
    for (const s of [-1, 1]) { for (const c2 of [-0.25, 0.25]) CY(f, [-40 + c2, 1.65, -4 + s * 0.9], 0.015, 1.2, PAL.steel); V(f, [-40, 1.05, -4 + s * 0.9], [0.6, 0.06, 0.28], '#2f3d4a') }
    // 시소 · 스프링 · 뺑뺑이
    S(f, [-43, 0.3, 0.5], [0.5, 0.6, 0.5], '#5a6167')
    V(f, [-43, 0.62, 0.5], [3.4, 0.12, 0.4], '#c9762f', { rot: [0, 0, 0.16] })
    for (const [sx, sz] of [[-38, 0.5], [-36, -1.2]]) { CY(f, [sx, 0.3, sz], 0.06, 0.6, PAL.steel); V(f, [sx, 0.75, sz], [0.9, 0.3, 0.5], '#3f8f6f') }
    CY(f, [-46, 0.32, 1.2], 1.5, 0.16, '#4a6f8f'); CY(f, [-46, 0.6, 1.2], 0.09, 0.9, PAL.steel)
    // 등나무 쉼터
    S(f, [-22, 2.5, -2], [16, 0.2, 6], '#3f5a34')
    for (const px of [-29, -22, -15]) for (const pz of [-4.6, 0.6]) CY(f, [px, 1.25, pz], 0.13, 2.5, '#6a5a3e')
    for (let i = 0; i < 7; i++) CY(f, [-29 + i * 2.3, 2.35, -2], 0.06, 6, '#6a5a3e', [Math.PI / 2, 0, 0])
    for (const bx of [-27, -22, -17]) { V(f, [bx, 0.42, -2], [2.4, 0.1, 0.5], PAL.wood); V(f, [bx, 0.7, -2.3], [2.4, 0.5, 0.08], PAL.wood); V(f, [bx, 0.2, -2], [2.2, 0.3, 0.3], PAL.steel) }
    P(f, [-24, 0.02, 6], [40, 8], '#3d5c38')
  }

  /* ── 정문 · 주차장 · 담장 · 후문 골목 ─────────────────── */
  function makeGrounds() {
    const f = 'OUT'
    P(f, [0, 0.005, 0], [MAP_SIZE, MAP_SIZE], '#2f3a33')
    // 주 진입 포장
    P(f, [-8, 0.02, 46], [64, 20], PAL.asphalt)
    P(f, [4, 0.02, 20], [10, 32], PAL.asphalt)
    for (let i = 0; i < 6; i++) P(f, [4, 0.03, 34 + i * 2.4], [7, 0.7], PAL.line)
    // 교문
    for (const s of [-1, 1]) { S(f, [4 + s * 4.2, 1.8, 56], [1.0, 3.6, 1.0], '#5c6167'); V(f, [4 + s * 4.2, 3.8, 56], [1.2, 0.4, 1.2], '#464c52') }
    for (const s of [-1, 1]) { V(f, [4 + s * 2.0, 1.5, 56], [3.8, 3.0, 0.12], '#3f474d'); for (let i = 0; i < 8; i++) CY(f, [4 + s * (0.3 + i * 0.45), 1.5, 56], 0.045, 3.0, '#5a6167') }
    V(f, [-1.6, 2.6, 56], [1.0, 2.2, 0.3], PAL.paper)
    // 경비실
    S(f, [-6, 1.55, 44], [6, 3.1, 4.4], '#7d8288')
    V(f, [-6, 3.25, 44], [6.8, 0.3, 5.2], '#4b5259')
    V(f, [-6, 1.75, 41.85], [4.6, 1.6, 0.1], PAL.glass)
    V(f, [-3.05, 1.75, 44], [0.1, 1.6, 3.0], PAL.glass)
    V(f, [-8.6, 1.15, 44], [0.12, 2.1, 1.0], PAL.door)
    V(f, [-6, 0.95, 41.6], [3.4, 0.12, 0.5], PAL.wood)
    S(f, [-6, 3.6, 44], [1.2, 0.7, 1.0], '#59616a')
    // 주차장
    P(f, [-26, 0.02, 46], [24, 16], '#33383c')
    for (let i = 0; i < 7; i++) P(f, [-36 + i * 3.3, 0.03, 46], [0.12, 14], PAL.line)
    for (let i = 0; i < 3; i++) {
      const cx2 = -34 + i * 6.6
      S(f, [cx2, 0.7, 46], [2.0, 1.0, 4.4], ['#3e4a56', '#4a3e3e', '#3e4a42'][i])
      V(f, [cx2, 1.4, 46 + 0.3], [1.8, 0.6, 2.2], '#2a3138')
      for (const s of [-1, 1]) for (const t of [-1, 1]) CY(f, [cx2 + s * 0.95, 0.32, 46 + t * 1.5], 0.32, 0.22, '#1e2328', [0, 0, Math.PI / 2])
      V(f, [cx2, 0.7, 43.7], [1.6, 0.24, 0.1], '#e8e2c0', { e: 1 })
    }
    // 담장
    const F = 59
    for (const [ax, fx, a0, a1] of [['x', -F, -F, F], ['x', F, -F, 4 - 6.5], ['z', -F, -F, F], ['z', F, -F, F]])
      wall(f, 0, ax, fx, a0, a1, { h: 2.4, t: 0.35, c: '#7a7368', base: '#5f5a52' })
    wall(f, 0, 'x', F, 4 + 6.5, F, { h: 2.4, t: 0.35, c: '#7a7368', base: '#5f5a52' })
    for (let i = 0; i < 40; i++) V(f, [-F + 1.5 + i * 3, 2.55, -F], [2.9, 0.18, 0.55], '#4e4a44')
    // 후문 골목 (서측 S자)
    P(f, [-57, 0.02, -25], [6, 66], PAL.asphalt)
    for (const [zx, zz, zw] of [[-54.2, -40, 10], [-54.2, -14, 12], [-54.2, 4, 8]]) {
      S(f, [zx, 1.2, zz], [0.4, 2.4, zw], '#6f695f')
      V(f, [zx, 2.5, zz], [0.6, 0.2, zw], '#4e4a44')
    }
    for (let i = 0; i < 8; i++) V(f, [-59.6, 1.5, -50 + i * 8], [0.1, 1.6, 1.2], ['#3b4a55', '#4a3b3b', '#3b4a3b'][i % 3])
    for (let i = 0; i < 6; i++) { CY(f, [-58.5, 2.6, -46 + i * 9], 0.07, 5.2, '#4a5157'); V(f, [-57.9, 5.0, -46 + i * 9], [1.4, 0.22, 0.5], TONE.amber, { e: 1 }) }
    for (let i = 0; i < 6; i++) { const bx = -55.6, bz = -44 + i * 8; V(f, [bx, 0.55, bz], [0.2, 0.9, 1.6], '#2f3a44'); CY(f, [bx, 0.32, bz - 0.6], 0.32, 0.08, '#1e2328', [0, 0, Math.PI / 2]); CY(f, [bx, 0.32, bz + 0.6], 0.32, 0.08, '#1e2328', [0, 0, Math.PI / 2]) }
    // 집하장 (막다른 방)
    S(f, [-57, 1.4, 12], [6.2, 2.8, 0.35], '#6f695f')
    S(f, [-53.8, 1.4, 9], [0.35, 2.8, 6.2], '#6f695f')
    for (let i = 0; i < 3; i++) { V(f, [-58.4 + i * 1.5, 0.6, 10.6], [1.2, 1.2, 1.2], ['#2f5a3a', '#2f4a6a', '#6a5a2f'][i]); V(f, [-58.4 + i * 1.5, 1.24, 10.6], [1.3, 0.1, 1.3], '#3a4148') }
  }

  /* ── 실외 가로등 ─────────────────────────────────────── */
  const lamps = [
    { p: [12, -20], h: 7, tone: 'warm' }, { p: [52, -20], h: 7, tone: 'warm' },
    { p: [12, 20], h: 7, tone: 'warm' }, { p: [52, 20], h: 7, tone: 'warm' },
    { p: [-46, 4], h: 6, tone: 'warm' }, { p: [-24, 4], h: 6, tone: 'warm' },
    { p: [-8, 4], h: 6, tone: 'warm' }, { p: [4, 30], h: 7, tone: 'amber' },
    { p: [4, 50], h: 7, tone: 'amber' }, { p: [-26, 52], h: 6, tone: 'amber' },
    { p: [-44, 40], h: 6, tone: 'amber' }, { p: [-12, 40], h: 6, tone: 'amber' },
    { p: [10, -8], h: 6, tone: 'cool' }, { p: [-58, -8], h: 6, tone: 'amber' },
    { p: [-24, -8], h: 6, tone: 'cool' }, { p: [14, -46], h: 6, tone: 'cool' },
  ]
  for (const l of lamps) {
    CY('OUT', [l.p[0], l.h / 2, l.p[1]], 0.12, l.h, '#454c52')
    CY('OUT', [l.p[0] + 0.5, l.h, l.p[1]], 0.09, 1.2, '#454c52', [0, 0, Math.PI / 2])
    V('OUT', [l.p[0] + 1.0, l.h - 0.15, l.p[1]], [0.8, 0.22, 0.45], TONE[l.tone], { e: 1 })
  }

  /* ── 실행 ─────────────────────────────────────────────── */
  precompute()
  makeB1()
  for (const f of ['F1', 'F2', 'F3']) makeFloor(f)
  makeBridges()
  makeSpiral()
  makeRoof()
  makeElevator()
  makeCourtyard()
  makeGym()
  makeHallPool()
  makeField()
  makePlayground()
  makeGrounds()

  /* ── 치수 라벨 (평면도용) ─────────────────────────────── */
  dims.push(
    { a: [B.x0, B.z0 - 6.5], b: [B.x1, B.z0 - 6.5], t: '본관 폭 64.0 m' },
    { a: [B.x1 + 5, B.z0], b: [B.x1 + 5, B.z1], t: '본관 깊이 48.0 m' },
    { a: [COURT.x0, COURT.z0 + 2.2], b: [COURT.x1, COURT.z0 + 2.2], t: '중정 40.0' },
    { a: [COURT.x1 - 2.2, COURT.z0], b: [COURT.x1 - 2.2, COURT.z1], t: '중정 24.0' },
    { a: [B.x0 - 2.6, BAND.N.cor[0]], b: [B.x0 - 2.6, BAND.N.cor[1]], t: '복도 4.2' },
    { a: [B.x0 - 10.5, BAND.N.room[0]], b: [B.x0 - 10.5, BAND.N.room[1]], t: '실 깊이 7.2' },
    { a: [COURT.x0, B.z0 - 2.4], b: [COURT.x0 + 8, B.z0 - 2.4], t: '베이 8.0' },
    { a: [GYM.x0, GYM.z1 + 3.2], b: [GYM.x1, GYM.z1 + 3.2], t: '체육관 32.0' },
    { a: [10, 28.5], b: [54, 28.5], t: '운동장 44.0' },
    { a: [-56, 40], b: [-34, 40], t: '대강당 22.0' },
    { a: [-32, 45], b: [-12, 45], t: '수영장동 20.0' },
  )

  const stats = {
    solids: solids.length, visuals: visuals.length, plates: plates.length,
    cyls: cyls.length, fixtures: fixtures.length, rooms: rooms.length, doors: doors.length,
  }
  return { solids, visuals, plates, cyls, fixtures, lamps, rooms, doors, dims, stats, EV, GYM, conditions: COND, holes: HOLES, leaks: LEAKS, breachW: BREACH_W, bridges: BRIDGE, spiral: SPIRAL, seed: SEED }
}

/* ─────────────────── 게임플레이 슬롯 · 계약 ─────────────────── */

/** 프롭 슬롯 24 — 실제 공간 문법에 맞는 표면 위 */
export const PROP_SLOTS = [
  { id: 'p_f1_staff_desk', room: 'f1_staff', p: [-40, -54], floor: 'F1', surfaceY: 0.78, note: '교무실 책상 서류함' },
  { id: 'p_f1_admin_cab', room: 'f1_admin', p: [-32, -53.5], floor: 'F1', surfaceY: 1.8, note: '행정실 캐비닛 위' },
  { id: 'p_f1_health_bed', room: 'f1_health', p: [-7.5, -55], floor: 'F1', surfaceY: 0.62, note: '보건실 침대 옆' },
  { id: 'p_f1_cafe_tray', room: 'f1_cafeteria', p: [-36, -15], floor: 'F1', surfaceY: 0.73, note: '급식실 배식대' },
  { id: 'p_f1_kitchen_rack', room: 'f1_kitchen', p: [-20, -16], floor: 'F1', surfaceY: 0.92, note: '조리대 상단' },
  { id: 'p_f1_lobby_shoe', room: 'f1_core_se_b', p: [1.6, -14], floor: 'F1', surfaceY: 1.8, note: '현관 신발장 위' },
  { id: 'p_f1_duty_desk', room: 'f1_duty', p: [-51, -42], floor: 'F1', surfaceY: 0.74, note: '숙직실 책상' },
  { id: 'p_f1_print', room: 'f1_print', p: [4.2, -34], floor: 'F1', surfaceY: 1.15, note: '인쇄실 복사기 위' },
  { id: 'p_f2_c21_desk', room: 'f2_c21', p: [-41, -54], floor: 'F2', surfaceY: 4.32, note: '2-1 학생 책상' },
  { id: 'p_f2_c23_locker', room: 'f2_c23', p: [-24, -56.8], floor: 'F2', surfaceY: 5.4, note: '2-3 사물함 위' },
  { id: 'p_f2_sci_bench', room: 'f2_science', p: [4.2, -43], floor: 'F2', surfaceY: 4.45, note: '과학실 실험대' },
  { id: 'p_f2_sci_hood', room: 'f2_science', p: [7.2, -40], floor: 'F2', surfaceY: 4.5, note: '흄후드 안' },
  { id: 'p_f2_prep_shelf', room: 'f2_sciprep', p: [4.2, -34], floor: 'F2', surfaceY: 5.0, note: '과학준비실 선반' },
  { id: 'p_f2_lib_table', room: 'f2_library', p: [-38, -15], floor: 'F2', surfaceY: 4.34, note: '도서실 열람 테이블' },
  { id: 'p_f2_lib_shelf', room: 'f2_library', p: [-33, -17], floor: 'F2', surfaceY: 5.1, note: '서가 3단' },
  { id: 'p_f2_music_piano', room: 'f2_music', p: [-52, -42], floor: 'F2', surfaceY: 4.72, note: '피아노 위' },
  { id: 'p_f2_av_seat', room: 'f2_av', p: [-20, -15], floor: 'F2', surfaceY: 4.1, note: '시청각실 좌석 아래' },
  { id: 'p_f3_c31_desk', room: 'f3_c31', p: [-41, -53], floor: 'F3', surfaceY: 7.92, note: '3-1 학생 책상' },
  { id: 'p_f3_bc_console', room: 'f3_broadcast', p: [4.2, -44], floor: 'F3', surfaceY: 7.95, note: '방송실 콘솔' },
  { id: 'p_f3_dance_mat', room: 'f3_dance', p: [-38, -14], floor: 'F3', surfaceY: 7.45, note: '무용실 매트 아래' },
  { id: 'p_f3_earth_bench', room: 'f3_earth', p: [-16, -15], floor: 'F3', surfaceY: 8.05, note: '지구과학실 실험대' },
  { id: 'p_b1_shelf', room: 'b1_foodstore', p: [-12, -54], floor: 'B1', surfaceY: -2.55, note: '급식창고 선반' },
  { id: 'p_gym_stage', room: 'gym', p: [20, -44], floor: 'F1', surfaceY: 1.1, note: '체육관 무대 위' },
  { id: 'p_out_podium', room: 'field', p: [11, 0], floor: 'OUT', surfaceY: 1.2, note: '조회대 위' },
]

/** 미션지 슬롯 9 — 한 판 3개 활성 */
export const MISSION_SLOTS = [
  { id: 'm_f1_kitchen', name: '배전반 퓨즈 복구', tags: ['solo'], p: [-20, -16], floor: 'F1', hintZone: '1층 급식·조리 구역' },
  { id: 'm_f1_admin', name: '캐비닛 암호', tags: ['solo'], p: [-32, -53.5], floor: 'F1', hintZone: '1층 북측 행정 구역' },
  { id: 'm_f2_science', name: '약품 배열 순서', tags: ['solo'], p: [4.2, -43], floor: 'F2', hintZone: '2층 동측 특별실' },
  { id: 'm_f2_library', name: '청구기호 정렬', tags: ['coop'], p: [-36, -15], floor: 'F2', hintZone: '2층 남측 도서실' },
  { id: 'm_f3_broadcast', name: '방송 주파수 조율', tags: ['solo'], p: [4.2, -44], floor: 'F3', hintZone: '3층 동측 방송 구역' },
  { id: 'm_f3_dance', name: '동시 스위치', tags: ['coop'], p: [-38, -14], floor: 'F3', hintZone: '3층 남측 무용실' },
  { id: 'm_b1_mach', name: '급수 밸브 압력', tags: ['coop'], p: [-36, -54], floor: 'B1', hintZone: '지하 기계실' },
  { id: 'm_gym_score', name: '스코어보드 신호', tags: ['solo'], p: [32, -50], floor: 'F1', hintZone: '체육관 관중석' },
  { id: 'm_pool_gauge', name: '수질 계측기 보정', tags: ['coop'], p: [-22, 21], floor: 'F1', hintZone: '실내 수영장' },
]

/** 트랩 슬롯 18 — 한 판 5~6개 */
export const TRAP_SLOTS = [
  { id: 't_f1_cor_n', p: [-30, -48.3], floor: 'F1', kind: 'gap', risk: 2 },
  { id: 't_f1_cor_s', p: [-24, -19.7], floor: 'F1', kind: 'gap', risk: 2 },
  { id: 't_f1_lobby', p: [4.2, -14], floor: 'F1', kind: 'gap', risk: 3 },
  { id: 't_f1_pantry', p: [-8, -14], floor: 'F1', kind: 'deadend', risk: 3 },
  { id: 't_f1_janitor', p: [-52, -34], floor: 'F1', kind: 'deadend', risk: 2 },
  { id: 't_f2_sci', p: [-2, -43], floor: 'F2', kind: 'gap', risk: 3 },
  { id: 't_f2_lib', p: [-32, -19.7], floor: 'F2', kind: 'gap', risk: 2 },
  { id: 't_f2_bridge', p: [12, -38], floor: 'F2', kind: 'shortcut', risk: 3 },
  { id: 't_f2_prep', p: [4.2, -34], floor: 'F2', kind: 'deadend', risk: 3 },
  { id: 't_f2_catwalk', p: [32, -31.6], floor: 'F2', kind: 'vertical', risk: 3 },
  { id: 't_f3_cor_e', p: [-1.7, -30], floor: 'F3', kind: 'gap', risk: 2 },
  { id: 't_f3_club', p: [-8, -14], floor: 'F3', kind: 'deadend', risk: 2 },
  { id: 't_f3_stair_nw', p: [-46, -48], floor: 'F3', kind: 'vertical', risk: 2 },
  { id: 't_b1_corridor', p: [-30, -48.3], floor: 'B1', kind: 'vertical', risk: 3 },
  { id: 't_b1_shelter', p: [4.2, -54], floor: 'B1', kind: 'deadend', risk: 3 },
  { id: 't_roof_fire', p: [10.4, -32.5], floor: 'ROOF', kind: 'shortcut', risk: 2 },
  { id: 't_out_alley', p: [-57, -14], floor: 'OUT', kind: 'shortcut', risk: 2 },
  { id: 't_out_dump', p: [-57, 10], floor: 'OUT', kind: 'deadend', risk: 3 },
]

/** 탈출 게이트 5 — 한 판 1개 */
export const GATE_SLOTS = [
  { id: 'g_main', name: '정문', p: [4, 56], rotY: 0, floor: 'OUT' },
  { id: 'g_back', name: '후문 골목', p: [-57, -57], rotY: Math.PI / 2, floor: 'OUT' },
  { id: 'g_gym', name: '체육관 비상구', p: [48.2, -44], rotY: Math.PI / 2, floor: 'OUT' },
  { id: 'g_hall', name: '대강당 후문', p: [-45, 36.2], rotY: 0, floor: 'OUT' },
  { id: 'g_park', name: '주차장 차량 게이트', p: [-38, 54], rotY: 0, floor: 'OUT' },
]

/**
 * 델타 슬롯 — 『8번 승강장』 구현 분석의 이식.
 * 규칙 하나: anchor 는 반드시 이미 존재하는 실/프롭 슬롯이어야 하고, p 는 그 앵커의 좌표를 그대로 쓴다.
 * 새 좌표를 만들지 않으므로 델타를 30종으로 늘려도 맵 제작비는 0에 수렴한다.
 */
export const DELTA_SLOTS = [
  { id: 'd_cor_dark', name: '북측 복도 소등 구간', anchor: 'f2_cor_n', p: [-30, -48.3], floor: 'F2', kind: 'light', normal: '북측 복도 형광등 전등', altered: '한 구간만 소등, 유도등만 남음', trigger: '술래 30 m 이내 접근', channel: 'speaker', fail: '없음 (분위기)', tell: '유도등 녹색만 남는다' },
  { id: 'd_cor_flick', name: '남측 복도 점멸', anchor: 'f1_cor_s', p: [-24, -19.7], floor: 'F1', kind: 'light', normal: '남측 복도 정상 점등', altered: '4 Hz 점멸', trigger: '미션 1개 완료', channel: 'guide', fail: '없음', tell: '점멸 주기가 술래 심박과 같다' },
  { id: 'd_sci_hood', name: '흄후드 개방', anchor: 'p_f2_sci_hood', p: [7.2, -40], floor: 'F2', kind: 'prop', normal: '흄후드 문 닫힘', altered: '문 열림 + 내부 발광', trigger: '시드', channel: 'none', fail: '접근 시 빙결 가속', tell: '복도에서 유리 너머로 보인다' },
  { id: 'd_lib_shelf', name: '서가 한 칸 통로화', anchor: 'p_f2_lib_shelf', p: [-33, -17], floor: 'F2', kind: 'geometry', normal: '서가 3단 정렬', altered: '한 칸이 통로로 뚫림', trigger: '협동 미션 진행 중', channel: 'speaker', fail: '없음 (지름길)', tell: '바닥에 책이 쏟아져 있다' },
  { id: 'd_music_piano', name: '피아노 단음 반복', anchor: 'p_f2_music_piano', p: [-52, -42], floor: 'F2', kind: 'sound', normal: '무음', altered: '피아노 단음 반복', trigger: '술래가 같은 층', channel: 'none', fail: '없음', tell: '소리로만 존재한다' },
  { id: 'd_bc_console', name: '방송 콘솔 적색', anchor: 'p_f3_bc_console', p: [4.2, -44], floor: 'F3', kind: 'prop', normal: '콘솔 대기 LED', altered: '전 채널 붉게 점등', trigger: '광분 진입', channel: 'speaker', fail: '방송 내용이 거짓으로 바뀜', tell: '스피커 문장이 어긋난다' },
  { id: 'd_gym_stage', name: '무대만 점등', anchor: 'p_gym_stage', p: [20, -44], floor: 'F1', kind: 'light', normal: '무대 소등', altered: '무대만 점등, 관중석 소등', trigger: '체육관 미션 활성', channel: 'guide', fail: '실루엣이 노출됨', tell: '멀리서도 보인다' },
  { id: 'd_pool_water', name: '수면 파동', anchor: 'pool', p: [-22, 21], floor: 'F1', kind: 'geometry', normal: '수면 정지', altered: '수면 파동 + 반사광 요동', trigger: '수영장 미션 실패', channel: 'none', fail: '진입 시 미끄러짐', tell: '천장에 물그림자가 흔들린다' },
  { id: 'd_health_bed', name: '보건실 커튼', anchor: 'p_f1_health_bed', p: [-7.5, -55], floor: 'F1', kind: 'prop', normal: '커튼 열림', altered: '커튼 닫힘 + 실루엣', trigger: '시드', channel: 'none', fail: '없음 (페이크)', tell: '아무 일도 일어나지 않는다' },
  { id: 'd_b1_mach', name: '지하 구역 정전', anchor: 'b1_mach', p: [-36, -54], floor: 'B1', kind: 'light', normal: '기계실 상시등', altered: '전 구역 정전', trigger: '배전 미션 실패', channel: 'panel', fail: '지하 전체 손전등 의존', tell: '층 표시판이 꺼진다' },
  { id: 'd_stair_nw', name: '북서 계단실 잠김', anchor: 'core_nw', p: [-52, -54], floor: 'F1', kind: 'door', normal: '계단실 방화문 열림', altered: '닫힘 + 잠김', trigger: '술래 광분', channel: 'guide', fail: '동선 하나가 끊긴다', tell: '유도등이 반대쪽을 가리킨다' },
  { id: 'd_roof_door', name: '옥상 문 개방', anchor: 't_roof_fire', p: [10.4, -32.5], floor: 'ROOF', kind: 'door', normal: '옥상 문 잠김', altered: '열림', trigger: '미션 3개 완료', channel: 'speaker', fail: '없음 (탈출 보조)', tell: '방송이 옥상을 언급한다' },
]

/**
 * 상태 고지 채널 — 8번 승강장의 전광게시판에 해당한다.
 * 새 UI를 만들지 않고 이미 맵에 있는 설비가 맡는다.
 */
export const CHANNELS = {
  speaker: { name: '교내 방송', source: '3층 동측 방송실 스피커', carries: ['미션 진행도', '술래 최종 목격 층', '광분 예고'], reliable: '광분 중에는 거짓을 섞는다' },
  guide: { name: '비상구 유도등', source: '복도 전 구간', carries: ['정상 / 위험 / 광분 3단계'], reliable: '항상 참' },
  panel: { name: '계단실 층 표시판', source: '코어 4곳', carries: ['현재 층', '정전 구역'], reliable: '정전 시 소등' },
  none: { name: '없음', source: '—', carries: ['플레이어가 직접 목격해야 한다'], reliable: '—' },
}

/** 카메라 프로파일 — 리얼리즘은 에셋이 아니라 화각과 흔들림에서 나온다 */
export const CAMERA = {
  fovWalk: 78, fovSprint: 84, fovOrbit: 58,
  bobHz: 1.85, bobAmp: 0.052, sprintBobMul: 1.6,
  flashlightAngle: 0.55, flashlightRange: 26,
  eyeHeight: 1.72,
}

/** 스폰 */
export const SPAWNS = {
  human: { p: [4, -6], floor: 'OUT', note: '중앙 현관 앞 계단' },
  partners: [
    { p: [-2, -14], floor: 'F1', note: '현관 로비 안쪽' },
    { p: [-24, -25], floor: 'OUT', note: '중정 벤치' },
    { p: [11, 4], floor: 'OUT', note: '조회대 옆' },
  ],
  seeker: { p: [-24, -34], floor: 'OUT', note: '중정 중앙 화단' },
}

/** 술래 순찰 노드 — 순환 복도 링 + 수직 동선 */
export const PATROL = [
  { p: [-46, -48.3], floor: 'F1' }, { p: [-20, -48.3], floor: 'F1' }, { p: [-4, -48.3], floor: 'F1' },
  { p: [-1.7, -34], floor: 'F1' }, { p: [-1.7, -22], floor: 'F1' }, { p: [-20, -19.7], floor: 'F1' },
  { p: [-46.3, -19.7], floor: 'F1' }, { p: [-46.3, -34], floor: 'F1' },
  { p: [-52, -54], floor: 'F2' }, { p: [-20, -48.3], floor: 'F2' }, { p: [4.2, -43], floor: 'F2' },
  { p: [-20, -19.7], floor: 'F2' }, { p: [12, -38], floor: 'F2' }, { p: [32, -31.6], floor: 'F2' },
  { p: [-20, -48.3], floor: 'F3' }, { p: [-46.3, -34], floor: 'F3' }, { p: [4.2, -44], floor: 'F3' },
  { p: [-24, -34], floor: 'OUT' }, { p: [32, 0], floor: 'OUT' }, { p: [-46, -2], floor: 'OUT' },
  { p: [4, 40], floor: 'OUT' }, { p: [-57, -20], floor: 'OUT' }, { p: [-22, 21], floor: 'F1' },
  { p: [-36, -54], floor: 'B1' }, { p: [-16, -54], floor: 'ROOF' },
]

/** 서버·클라이언트 공통 계약 JSON */
export function buildContracts(opts = {}) {
  const built = buildCampus(opts)
  return {
    'terrainContract.json': {
      seed: built.seed,
      quota: { collapse: 4, breach: 6, messy: 12, stacked: 4, stripped: 3 },
      chords: {
        F1: '중정 십자 관통 — 링에 현을 놓는다. 술래가 36 m 를 9초에 끊는다',
        F2: '세로 브릿지 (N↔S, 폭 3.0 m)',
        F3: '가로 브릿지 (W↔E, 폭 3.0 m)',
        spiral: '교차점 원형 계단 — 중정 바닥 ↔ 2층 ↔ 3층',
      },
      holes: built.holes,
      breachWidth: built.breachW,
      leaks: built.leaks,
      rules: {
        collapse: { runnerFall: true, runnerStagger: 0.55, seekerFall: false, note: '함정이 아니라 일방통행 수직 동선' },
        breachCrawl: { width: 0.9, speedMul: 0.45, note: '기어서 통과. 술래가 손해를 본다' },
        breachWalk: { width: 2.0, speedMul: 1.0 },
        tunnel: { width: 1.8, speedMul: 0.8, note: '느리지만 시야에서 완전히 벗어난다' },
      },
      acoustics: { model: 'opening-based', note: '감쇠를 벽이 아니라 개구부 기준으로 계산한다', leakCount: built.leaks.length },
    },
    'mapContract.json': {
      version: 4, mapSize: MAP_SIZE, floorHeight: FLOOR_HEIGHT, floorY: FLOOR_Y,
      building: B, courtyard: COURT, corridorWidth: 4.2, roomDepth: 7.2, bay: 8.0,
      cores: CORES.map((c) => ({ id: c.id, name: c.name, x: c.x, z: c.z })),
    },
    'actorContract.json': { spawns: SPAWNS, patrol: PATROL },
    'trapContract.json': { traps: TRAP_SLOTS, perRound: [5, 6], mix: { gap: [1, 2], shortcut: [1, 2], deadend: [1, 2], vertical: [1, 1] } },
    'gateContract.json': { gates: GATE_SLOTS, sensorLocalZ: 1.2, lockedBlockerHalfSize: [2.0, 1.6, 0.2] },
    'missionContract.json': { props: PROP_SLOTS, missions: MISSION_SLOTS, perRound: 3 },
    'deltaContract.json': { deltas: DELTA_SLOTS, channels: CHANNELS, camera: CAMERA, perRound: [0, 3], rule: 'anchor 는 기존 슬롯만 참조한다. 신규 좌표 금지.' },
  }
}
