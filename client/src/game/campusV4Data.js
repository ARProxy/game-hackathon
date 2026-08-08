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
export const B = { x0: -56, x1: 8, z0: -58, z1: 2 }
/** ㄷ자 품 안 — 북단은 포장 앞마당, 남단은 운동장. 남쪽으로 열려 있다 */
export const COURT = { x0: -44, x1: -4, z0: -46, z1: 2 }
/** 동·서 윙에 실이 서는 구간. 남단 7.2 m 는 계단 코어가 차지한다 */
export const WINGZ = { z0: -46, z1: -5.5 }
/** 앞마당(포장) — 브릿지와 원형 계단이 서는 곳 */
export const PLAZA = { x0: -44, x1: -4, z0: -46, z1: -31 }
/** 운동장 — U자 품 안에서 시작해 남쪽으로 흘러나간다 */
export const FIELD = { cx: -24, cz: -4, w: 44, d: 50 }

/** 윙별 밴드 — 외벽 → 실 → 칸막이 → 복도 → 중정벽 */
export const BAND = {
  N: { outer: -57.9, room: [-57.8, -50.6], part: -50.5, cor: [-50.4, -46.2], court: -46.1 },
  W: { outer: -55.9, room: [-55.8, -48.6], part: -48.5, cor: [-48.4, -44.2], court: -44.1 },
  E: { court: -3.9, cor: [-3.8, 0.4], part: 0.5, room: [0.6, 7.8], outer: 7.9 },
}

/** 코어(계단실) 4곳 — 북측 두 모서리와 양 날개 남단 */
export const CORES = [
  // type — 계단 형태가 다르면 음성으로 "어느 계단"을 말할 수 있다
  { id: 'core_nw', name: '북서 계단실', x: [-55.8, -48.6], z: [-57.8, -50.6], door: 'E', type: 'switchback' },
  { id: 'core_ne', name: '북동 계단실', x: [0.6, 7.8], z: [-57.8, -50.6], door: 'W', type: 'straight' },
  { id: 'core_sw', name: '서익 비상계단', x: [-55.8, -48.6], z: [-5.4, 1.8], door: 'E', type: 'narrow' },
  { id: 'core_se', name: '동익 중앙계단', x: [0.6, 7.8], z: [-5.4, 1.8], door: 'W', type: 'switchback' },
]

/** 승강기 2대 — 북동은 승객용(옥상까지), 북서는 급식·화물용 */
export const EVS = [
  { id: 'evp', name: '승객용 승강기', x: [1.4, 3.3], z: [-57.4, -54.6], roof: true },
  { id: 'evc', name: '화물용 승강기', x: [-51.3, -49.4], z: [-57.4, -54.6], roof: false },
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
  security: { f: 'labFloor', b: 'labBase', w: 'labWall', tone: 'cool' },
  evhall: { f: 'corrFloor', b: 'corrBase', w: 'corrWall', tone: 'cool' },
  archive: { f: 'storeFloor', b: 'storeBase', w: 'storeWall', tone: 'amber' },
  shelter: { f: 'machFloor', b: 'machBase', w: 'machWall', tone: 'dim' },
  pottery: { f: 'storeFloor', b: 'storeBase', w: 'storeWall', tone: 'amber' },
  calli: { f: 'classFloor', b: 'classBase', w: 'classWall', tone: 'soft' },
  club: { f: 'classFloor', b: 'classBase', w: 'classWall', tone: 'warm' },
  council: { f: 'adminFloor', b: 'adminBase', w: 'adminWall', tone: 'warm' },
  english: { f: 'classFloor', b: 'classBase', w: 'classWall', tone: 'cool' },
}
export const TONE = { warm: '#ffe6bd', cool: '#d5e8ff', soft: '#f0e9dd', dim: '#9fb0bd', amber: '#ffd6a0' }

/**
 * 층별 실 배치. [id, 이름, kind, 베이수] — 윙 순서는 서→동 / 북→남.
 * 건축 프로그램은 판마다 바뀌지 않는다. 반복 플레이 변화는 방 상태·미션·소품에만 둔다.
 */
const PROGRAM = {
  F1: {
    N: [['staff', '교무실', 'admin', 2], ['admin', '행정실', 'admin'], ['principal', '교장실', 'admin'], ['health', '보건실', 'health']],
    W: [['cafeteria', '급식실', 'food', 2], ['kitchen', '조리실', 'kitchen'], ['serving', '배식준비실', 'kitchen'], ['pantry', '식품창고', 'store'], ['janitor', '청소용구실', 'store']],
    E: [['counsel', '상담실', 'admin'], ['wee', '위(Wee)클래스', 'health'], ['print', '인쇄실', 'service'], ['council', '학생회실', 'council'], ['security', '경비·방재실', 'security', 2]],
  },
  F2: {
    N: [['c21', '2학년 1반', 'classroom'], ['c22', '2학년 2반', 'classroom'], ['c23', '2학년 3반', 'classroom'], ['c24', '2학년 4반', 'classroom'], ['c25', '2학년 5반', 'classroom']],
    W: [['library', '도서실', 'library', 2], ['music', '음악실', 'music'], ['musicprep', '악기준비실', 'store'], ['art', '미술실', 'art']],
    E: [['science', '제1과학실', 'lab'], ['sciprep', '과학준비실', 'store'], ['computer', '제1컴퓨터실', 'computer'], ['english', '영어전용실', 'english'], ['av', '시청각실', 'av']],
  },
  F3: {
    N: [['c31', '3학년 1반', 'classroom'], ['c32', '3학년 2반', 'classroom'], ['c33', '3학년 3반', 'classroom'], ['c34', '3학년 4반', 'classroom'], ['c35', '3학년 5반', 'classroom']],
    W: [['dance', '무용실', 'dance', 2], ['calli', '서예실', 'calli'], ['pottery', '도예실', 'pottery'], ['music2', '제2음악실', 'music']],
    E: [['broadcast', '방송실', 'broadcast'], ['bcprep', '방송준비실', 'store'], ['computer2', '제2컴퓨터실', 'computer'], ['earth', '지구과학실', 'lab'], ['club', '동아리실', 'club']],
  },
}

/**
 * 일반교실은 같은 학교 모듈을 공유하되, 생활 장면과 판단 동선이 서로 다르다.
 * ID를 데이터로 남겨 QA가 "교실 10개가 다시 같은 격자"로 퇴행하는지 검사할 수 있게 한다.
 */
export const CLASSROOM_LAYOUTS = {
  f2_c21: 'rows',
  f2_c22: 'pods',
  f2_c23: 'exam',
  f2_c24: 'horseshoe',
  f2_c25: 'project',
  f3_c31: 'project',
  f3_c32: 'horseshoe',
  f3_c33: 'rows',
  f3_c34: 'pods',
  f3_c35: 'exam',
}

function fixedProgram() {
  return JSON.parse(JSON.stringify(PROGRAM))
}

/** 지하 1층 — 북측 윙 + 북측 코어 아래만 굴착 */
const B1_ROOMS = [
  { id: 'b1_tank', name: '저수조실', kind: 'machine', x: [-55.8, -48.6], z: [-57.8, -50.6] },
  { id: 'b1_mach', name: '기계실', kind: 'machine', x: [-48.4, -36], z: [-57.8, -50.6] },
  { id: 'b1_elec', name: '전기실', kind: 'machine', x: [-35.8, -27], z: [-57.8, -50.6] },
  // 설비실만 이어지면 지하가 한 덩어리로 읽힌다. 성격이 다른 방을 끼운다
  { id: 'b1_archive', name: '문서고', kind: 'archive', x: [-26.8, -17], z: [-57.8, -50.6] },
  { id: 'b1_foodstore', name: '급식창고', kind: 'store', x: [-16.8, -6], z: [-57.8, -50.6] },
  { id: 'b1_shelter', name: '방공호', kind: 'shelter', x: [-5.8, 7.8], z: [-57.8, -50.6] },
]

/** 내선 인터폰이 걸리는 방 — 사람이 상주하거나 수업하는 공간 */
const IP_KINDS = new Set(['classroom', 'lab', 'computer', 'library', 'music', 'art', 'dance',
  'av', 'broadcast', 'admin', 'health', 'security', 'food', 'kitchen', 'duty', 'lobby', 'machine',
  'pottery', 'calli', 'club', 'council', 'english', 'evhall', 'archive', 'shelter'])

const R = (x0, z0, x1, z1) => ({ x0, z0, x1, z1 })
const mid = (a, b) => (a + b) / 2

/* ─────────────────────────── 생성기 ─────────────────────────── */

/**
 * 방 상태 — 같은 교실이 반복되면 공간이 기억에 남지 않는다.
 * id 해시로 결정하므로 서버와 클라이언트가 같은 배치를 얻는다.
 */
export const ROOM_CONDITIONS = {
  intact: { w: 45, label: '정상', note: '기준 상태. 다른 방을 읽는 잣대가 된다' },
  messy: { w: 18, label: '책걸상 난장', note: '책상이 밀리고 넘어져 있다. 시야는 트이고 발이 걸린다' },
  stacked: { w: 9, label: '한쪽 적재', note: '책상을 구석에 쌓았다. 바닥이 비고 은폐물이 생긴다' },
  stripped: { w: 7, label: '비워짐', note: '가구가 없다. 눌린 자국만 남았다' },
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
    if (key === 'collapse' && floor !== 'F1' && floor !== 'F2' && floor !== 'F3') continue
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
  const CY = (f, p, r, h, c, rot, extra) => cyls.push(Object.assign({ f, p, r, h, c, rot }, extra))
  const FX = (f, p, c, tone, dynamic) => fixtures.push({ f, p, c, tone, dynamic: !!dynamic })

  /* ── 방 상태 · 슬래브 구멍 ─────────────────────────────── */
  const COND = {}
  const BREACH_W = {}
  /** 계단 개구부 — 코어마다 계단 절반에서 도착 참을 뺀 영역 */
  const WELLS = []
  for (const core of CORES) {
    const sX = mid(core.x[0], core.x[1])
    const sr = core.door === 'E' ? { x0: core.x[0], x1: sX - 0.1 } : { x0: sX + 0.1, x1: core.x[1] }
    const north = core.z[0] < -40
    // 직선 계단은 도착 참이 반대쪽 끝이라 개구부를 더 크게 잡는다
    const lead = core.type === 'straight' ? 0.6 : 1.2
    const w = {
      x0: sr.x0 + 0.05, x1: sr.x1 - 0.05,
      z0: north ? core.z[0] + lead : core.z[0] + 0.05,
      z1: north ? core.z[1] - 0.05 : core.z[1] - lead,
      core: core.id,
    }
    for (const f of ['F2', 'F3', 'ROOF']) WELLS.push(Object.assign({ f, open: north ? 'N' : 'S' }, w))
  }
  // 지하 계단 — 1층 북측 복도 남쪽 차선을 세로로 뚫는다
  const B1_STAIR = { x0: -55.7, x1: -49.9, z0: -48.15, z1: -46.35 }
  WELLS.push(Object.assign({ f: 'F1', core: 'b1_stair', open: 'W' }, B1_STAIR))

  const wellsOn = (f) => WELLS.filter((w) => w.f === f)

  /** 개구부 둘레 안전 난간. 계단이 도착하는 변은 비워 둔다 */
  function wellRail(w, openSide) {
    const y = FLOOR_Y[w.f]
    const edges = [
      ['x', w.z0, w.x0, w.x1, 'N'], ['x', w.z1, w.x0, w.x1, 'S'],
      ['z', w.x0, w.z0, w.z1, 'W'], ['z', w.x1, w.z0, w.z1, 'E'],
    ]
    for (const [ax, fixed, a0, a1, side] of edges) {
      if (side === openSide) continue
      const len = a1 - a0
      if (len < 0.4) continue
      const p = ax === 'x' ? [mid(a0, a1), y + 1.06, fixed] : [fixed, y + 1.06, mid(a0, a1)]
      CY(w.f, p, 0.032, len, PAL.rail, ax === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0])
      const n = Math.max(2, Math.round(len / 1.1))
      for (let i = 0; i <= n; i++) {
        const t = a0 + (len * i) / n
        CY(w.f, ax === 'x' ? [t, y + 0.53, fixed] : [fixed, y + 0.53, t], 0.020, 1.06, PAL.rail)
      }
      CY(w.f, ax === 'x' ? [mid(a0, a1), y + 0.55, fixed] : [fixed, y + 0.55, mid(a0, a1)], 0.018, len, PAL.rail, ax === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0])
    }
  }

  // 과학실-준비실, 음악실-악기실, 방송실-준비실의 기능 인접성을 보존한다.
  // 시드는 고정 건축 프로그램을 섞지 않는다.
  const PROG = fixedProgram()
  const HOLES = []
  const LEAKS = []   // 개구부 = 소리가 새는 구멍
  const DEVICES = [] // 음성 미션이 실제로 조작하는 설비
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
  function wingRects(f) {  // rect + kind + id
    const prog = PROG[f]
    if (!prog) return []
    const out = []
    {
      const wing = 'N'
      const total = prog[wing].reduce((a, q) => a + (q[3] || 1), 0)
      const span = (COURT.x1 - COURT.x0) / total
      let x = COURT.x0
      for (const [id, name, kind, bay] of prog[wing]) {
        const wBay = span * (bay || 1)
        const rect = R(x + 0.1, BAND.N.room[0], x + wBay - 0.1, BAND.N.room[1])
        const roomId = f.toLowerCase() + '_' + id
        out.push({
          rect,
          meta: { id: roomId, name, kind, wing, layoutId: CLASSROOM_LAYOUTS[roomId] },
          row: { wing, axis: 'x', a: x, b: x + wBay, id, kind },
        })
        x += wBay
      }
    }
    for (const wing of ['W', 'E']) {
      const total = prog[wing].reduce((a, q) => a + (q[3] || 1), 0)
      const span = (WINGZ.z1 - WINGZ.z0) / total
      let z = WINGZ.z0
      for (const [id, name, kind, bay] of prog[wing]) {
        const dBay = span * (bay || 1)
        const rect = wing === 'W' ? R(BAND.W.room[0], z + 0.1, BAND.W.room[1], z + dBay - 0.1)
          : R(BAND.E.room[0], z + 0.1, BAND.E.room[1], z + dBay - 0.1)
        const roomId = f.toLowerCase() + '_' + id
        out.push({
          rect,
          meta: { id: roomId, name, kind, wing, layoutId: CLASSROOM_LAYOUTS[roomId] },
          row: { wing, axis: 'z', a: z, b: z + dBay, id, kind },
        })
        z += dBay
      }
    }
    return out
  }

  /**
   * 생성 전에 모든 방의 상태와 구멍 위치를 정한다.
   * 개수는 고정하고 위치만 섞는다 — 학습은 되지만 예측은 안 되게.
   */
  // 정상 학교 문법이 먼저 읽히도록 전체 프로그램실의 약 75%를 정상 상태로 유지한다.
  // 파손은 기본 구조가 아니라 진행 중 발견하는 희소한 overlay다.
  const QUOTA = { collapse: 2, breach: 3, messy: 5, stacked: 1, stripped: 1 }
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
    // 일반교실의 차이는 수업 장면으로 읽혀야 한다. 벽 파손·붕괴·가구 전량 적재는
    // 특별실/서비스실에만 두어 10개 교실의 고유 레이아웃을 실제 플레이에서 보존한다.
    const safe = (e) => !['stair', 'toilet', 'machine', 'broadcast', 'classroom'].includes(e.meta.kind)
    const canEmpty = (e) => e.meta.kind !== 'classroom'
    // 1층 붕괴는 지하가 있는 북측 윙에서만 — 아래가 없는 곳은 뚫을 수 없다
    const b1Under = (e) => e.f === 'F1' && e.rect.z1 <= -50.5 && e.rect.x0 >= -55.9 && e.rect.x1 <= 7.9
    for (const e of pick(1, (e) => safe(e) && b1Under(e))) COND[e.meta.id] = 'collapse'
    for (const e of pick(QUOTA.collapse - 1, (e) => safe(e) && (e.f === 'F2' || e.f === 'F3'))) COND[e.meta.id] = 'collapse'
    for (const e of pick(QUOTA.breach, safe)) COND[e.meta.id] = 'breach'
    for (const e of pick(QUOTA.messy, canEmpty)) COND[e.meta.id] = 'messy'
    for (const e of pick(QUOTA.stacked, canEmpty)) COND[e.meta.id] = 'stacked'
    for (const e of pick(QUOTA.stripped, canEmpty)) COND[e.meta.id] = 'stripped'
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
          kind: o.doorKind || 'room', back: !!o.back, c: PAL.door,
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

    /**
     * 방 로컬 좌표: u=칠판을 바라봤을 때 가로, v=칠판에서 방 안쪽으로 들어가는 깊이.
     * 윙이 달라도 같은 배치가 벽과 함께 회전하므로 월드 x/z 하드코딩으로 인한 뒤집힘을 막는다.
     */
    const localWidth = face === 'N' || face === 'S' ? w : d
    const localDepth = face === 'N' || face === 'S' ? d : w
    const localYaw = face === 'N' ? 0 : face === 'S' ? Math.PI : face === 'E' ? -Math.PI / 2 : Math.PI / 2
    const toWorld = (u, v) => {
      if (face === 'N') return [cx + u, r.z0 + v]
      if (face === 'S') return [cx - u, r.z1 - v]
      if (face === 'E') return [r.x1 - v, cz + u]
      return [r.x0 + v, cz - u]
    }
    const localBox = (u, v, height, size, color, turn = 0, opt = {}) => {
      const [x, z] = toWorld(u, v)
      if (inHole(x, z)) return
      // 복도문 양끝의 1.2m 진입/스윙 구역. 낮은 가구만 거부하고 칠판·벽 TV는 허용한다.
      const entersDoorZone = height < 1.2 && v < 1.7 && Math.abs(u) + size[0] / 2 > localWidth / 2 - 1.5
      if (kind === 'classroom' && entersDoorZone) return
      V(f, [x, y + height, z], size, color, {
        ...opt,
        rot: [0, localYaw + turn, 0],
        roomId: meta.id,
        layoutId: meta.layoutId,
        local: [u, v],
      })
    }
    const localCylinder = (u, v, height, radius, cylinderHeight, color, opt = {}) => {
      const [x, z] = toWorld(u, v)
      if (!inHole(x, z)) CY(f, [x, y + height, z], radius, cylinderHeight, color, undefined, {
        ...opt,
        roomId: meta.id,
        layoutId: meta.layoutId,
        local: [u, v],
      })
    }
    const localShelf = (u, v, length, depth, turn = 0) => {
      localBox(u, v, 1.05, [length, 2.1, depth], PAL.wood, turn, { landmarkRole: 'storage' })
      for (let i = 1; i <= 4; i++) localBox(u, v, i * 0.42, [length - 0.06, 0.04, depth + 0.04], PAL.paper, turn)
    }

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
    /**
     * 벽걸이 인터폰 — M06 교실 인터폰 릴레이가 쓰는 장치.
     * 문 옆 복도쪽 벽에 붙는다. 송수화기가 보여야 "저기 전화기 같은 거"로 지칭된다.
     */
    const interphone = (x, z, rot, id) => {
      const ro = rot ? { rot: [0, Math.PI / 2, 0] } : null
      V(f, [x, y + 1.42, z], [0.24, 0.32, 0.085], '#d9d3c4', ro)          // 본체
      V(f, [x, y + 1.52, z + (rot ? 0 : -0.05)], [0.17, 0.10, 0.02], '#4c5259', rot ? { rot: [0, Math.PI / 2, 0] } : null) // 스피커 그릴
      V(f, [x + (rot ? -0.055 : -0.085), y + 1.36, z + (rot ? -0.085 : -0.055)], [rot ? 0.07 : 0.075, 0.20, rot ? 0.075 : 0.07], '#3a4046') // 송수화기
      V(f, [x + (rot ? -0.06 : 0.075), y + 1.29, z + (rot ? 0.075 : -0.06)], [rot ? 0.05 : 0.09, 0.055, rot ? 0.09 : 0.05], '#b9bfc4')     // 다이얼 패드
      V(f, [x + (rot ? -0.055 : 0.09), y + 1.545, z + (rot ? 0.09 : -0.055)], [0.03, 0.03, 0.012], PAL.accentRed, { e: 1 })                // 통화 LED
      P(f, [x + (rot ? -0.06 : 0), y + 1.17, z + (rot ? 0 : -0.06)], [0.22, 0.07], PAL.paper)  // 내선 번호표
      DEVICES.push({ kind: 'interphone', id: 'ip_' + id, room: meta.id, floor: f, p: [x, z], y: y + 1.42, note: '내선 인터폰 · 송수신 양쪽' })
    }

    // 칠판 벽 위치
    const facePos = () => {
      if (face === 'S') return { x: cx, z: r.z1 - 0.12, rot: 0 }
      if (face === 'N') return { x: cx, z: r.z0 + 0.12, rot: 0 }
      if (face === 'E') return { x: r.x1 - 0.12, z: cz, rot: 1 }
      return { x: r.x0 + 0.12, z: cz, rot: 1 }
    }

    if (kind === 'classroom') {
      const layoutId = meta.layoutId || CLASSROOM_LAYOUTS[meta.id] || 'rows'
      const boardWidth = Math.min(4.2, localWidth - 1.6)

      // 모든 교실이 공유하는 70%의 학교 문법: 칠판·교탁·뒤 사물함·게시판·청소 코너.
      localBox(0, 0.12, 1.85, [boardWidth, 1.3, 0.08], PAL.chalk, 0, { navRole: 'wall-mounted' })
      localBox(0, 0.2, 1.15, [boardWidth, 0.09, 0.18], PAL.wood, 0, { navRole: 'wall-mounted' })
      localBox(0, 1.15, 0.78, [1.1, 0.06, 0.55], PAL.wood)
      localBox(0, 1.15, 0.4, [1.0, 0.72, 0.45], PAL.desk)
      // 뒤벽 전체를 막지 않고 한쪽 코너만 쓴다. 뒷문과 회전 공간을 남기는 학교식 수납이다.
      localBox(localWidth * 0.2, localDepth - 0.3, 0.9, [2.0, 1.8, 0.45], PAL.locker)
      localBox(-localWidth / 2 + 0.12, localDepth * 0.62, 1.6, [0.08, 1.1, 2.2], PAL.paper, 0, { navRole: 'wall-mounted' })
      localBox(localWidth / 2 - 0.26, 1.05, 2.35, [0.5, 0.35, 0.55], '#232a30', 0, { navRole: 'wall-mounted' })
      localBox(-localWidth / 2 + 0.42, localDepth - 0.72, 0.4, [0.5, 0.8, 0.5], PAL.locker)
      localCylinder(localWidth / 2 - 0.55, localDepth - 0.62, 0.18, 0.17, 0.36, '#5c6165')

      const deskLocal = (u, v, turn = 0) => {
        if (cond === 'stripped') {
          const [x, z] = toWorld(u, v)
          if (!inHole(x, z)) P(f, [x, y + 0.035, z], [1.05, 0.5], '#7c8478')
          return
        }
        let ju = 0, jv = 0, jt = 0
        if (cond === 'messy') {
          // 레이아웃의 주 통로를 깨지 않는 생활 흔적 범위.
          ju = (rr() - 0.5) * 0.2
          jv = (rr() - 0.5) * 0.2
          jt = (rr() - 0.5) * 0.24
        }
        const rot = turn + jt
        localBox(u + ju, v + jv, 0.72, [0.72, 0.05, 0.48], PAL.desk, rot)
        localBox(u + ju, v + jv, 0.58, [0.66, 0.22, 0.34], PAL.deskLeg, rot)
        const chairDistance = 0.52
        const chairU = u + ju + Math.sin(rot) * chairDistance
        const chairV = v + jv + Math.cos(rot) * chairDistance
        localBox(chairU, chairV, 0.44, [0.42, 0.05, 0.42], PAL.chair, rot)
        localBox(chairU + Math.sin(rot) * 0.2, chairV + Math.cos(rot) * 0.2, 0.66, [0.42, 0.44, 0.05], PAL.chair, rot)
      }

      if (cond === 'stacked') {
        stackPile(14)
      } else if (layoutId === 'pods') {
        // 네 개의 모둠 섬. 섬 사이 십자 통로는 1.1 m 이상 남긴다.
        for (const pu of [-1.65, 1.65]) for (const pv of [2.65, 5.0]) {
          deskLocal(pu - 0.62, pv - 0.42, Math.PI)
          deskLocal(pu + 0.62, pv - 0.42, Math.PI)
          deskLocal(pu - 0.62, pv + 0.42, 0)
          deskLocal(pu + 0.62, pv + 0.42, 0)
        }
        localBox(0, localDepth - 1.05, 1.15, [1.8, 0.7, 0.35], '#6f8a68')
      } else if (layoutId === 'exam') {
        // 간격을 넓힌 시험 대형. 중앙 세로 통로가 정면에서 뒷문까지 열린다.
        for (const u of [-2.15, 0, 2.15]) for (const v of [2.05, 3.25, 4.45, 5.65]) deskLocal(u, v)
        localBox(-localWidth / 2 + 0.38, 3.0, 1.15, [0.22, 0.75, 1.2], '#d6cfaa')
      } else if (layoutId === 'horseshoe') {
        // 발표·토론형 U자. 중앙 3.4×3.1 m를 완전히 비운다.
        for (const v of [2.35, 3.55, 4.75]) {
          deskLocal(-2.45, v, Math.PI / 2)
          deskLocal(2.45, v, -Math.PI / 2)
        }
        for (const u of [-2.25, -0.75, 0.75, 2.25]) deskLocal(u, 5.55, 0)
        localBox(0, 3.75, 0.03, [2.2, 0.03, 1.4], '#7b8f91', 0, { navRole: 'floor-decal' })
      } else if (layoutId === 'project') {
        // 제작 수업형: 양옆 벤치 + 중앙 공동 작업대, 앞뒤 회유 동선.
        for (const v of [2.15, 3.25, 4.35, 5.45]) {
          deskLocal(-2.45, v, Math.PI / 2)
          deskLocal(2.45, v, -Math.PI / 2)
        }
        localBox(0, 3.75, 0.74, [2.5, 0.08, 1.1], '#8e765d')
        localBox(0, 3.75, 0.38, [2.3, 0.68, 0.9], PAL.deskLeg)
        localBox(0, 5.45, 1.35, [2.4, 1.3, 0.18], '#b88756')
      } else {
        // 정돈형 기준 교실. 두 개의 종방향 통로와 뒤쪽 횡통로를 유지한다.
        for (const u of [-2.25, -0.75, 0.75, 2.25]) for (const v of [2.05, 3.2, 4.35, 5.5]) deskLocal(u, v)
        localCylinder(localWidth / 2 - 0.45, 1.9, 0.38, 0.28, 0.48, '#4b7046')
      }
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
      // 16m 긴 축을 실제 서가 탐색축으로 쓴다. +u측은 출입문에서 열람대로 이어지는 주통로다.
      for (const u of [-5.0, -2.6, -0.2]) localShelf(u, 4.2, 3.8, 0.45, Math.PI / 2)
      for (const u of [2.0, 4.6]) {
        localBox(u, 3.4, 0.74, [1.8, 0.07, 0.8], PAL.wood)
        localBox(u, 3.4, 0.37, [1.6, 0.7, 0.65], PAL.deskLeg)
        for (const dv of [-0.7, 0.7]) for (const du of [-0.55, 0.55]) localBox(u + du, 3.4 + dv, 0.44, [0.42, 0.05, 0.42], PAL.chair)
      }
      localBox(5.2, 6.45, 0.6, [2.0, 1.2, 0.65], PAL.wood, 0, { landmarkRole: 'checkout' })
      localBox(0.9, 1.95, 0.5, [0.8, 1.0, 0.5], '#6b7378', 0, { landmarkRole: 'book-return' })
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
      // 이젤 3대 — 서 있는 삼각 실루엣이 이 방의 표식
      for (let i = 0; i < 3; i++) {
        const ex = r.x0 + 1.4 + i * 1.5, ez = r.z0 + 1.3
        if (ex > r.x1 - 1.0 || inHole(ex, ez)) continue
        for (const [dxx, dzz] of [[-0.32, 0], [0.32, 0], [0, 0.42]])
          CY(f, [ex + dxx, y + 0.75, ez + dzz], 0.028, 1.55, PAL.wood, [dzz ? -0.16 : 0, 0, dxx ? dxx * 0.5 : 0])
        V(f, [ex, y + 1.02, ez - 0.04], [0.62, 0.80, 0.03], '#efe9db')
        V(f, [ex, y + 0.60, ez], [0.70, 0.05, 0.10], PAL.wood)
      }
      // 석고상 선반 — 관찰 대상이자 지칭 가능한 물건
      V(f, [r.x0 + 0.4, y + 1.35, cz], [0.5, 0.06, Math.min(d - 2.0, 3.4)], PAL.wood)
      for (let i = 0; i < 3; i++) {
        CY(f, [r.x0 + 0.42, y + 1.62, cz - 1.1 + i * 1.1], 0.16, 0.48, '#ded8cc')
        CY(f, [r.x0 + 0.42, y + 1.94, cz - 1.1 + i * 1.1], 0.11, 0.20, '#ded8cc')
      }
    } else if (kind === 'av' || kind === 'broadcast') {
      if (kind === 'av') {
        // 문쪽 1.55m 횡통로에서 양측 aisle로 진입하고, 스크린은 반대쪽 벽에 둔다.
        localBox(0, localDepth - 0.12, 1.7, [5.4, 2.2, 0.08], '#1a1e22', 0, { landmarkRole: 'screen', navRole: 'wall-mounted' })
        localBox(0, 6.15, 0.16, [5.2, 0.16, 0.8], '#59636d', 0, { landmarkRole: 'stage' })
        for (let i = 0; i < 3; i++) {
          const v = 2.0 + i * 1.25
          localBox(0, v, 0.12 + i * 0.18, [4.6, 0.24 + i * 0.36, 0.9], '#4c5560')
          for (const u of [-1.65, -0.55, 0.55, 1.65]) localBox(u, v, 0.5 + i * 0.36, [0.46, 0.06, 0.46], PAL.chair)
        }
        localBox(0, 1.25, 2.72, [0.42, 0.24, 0.55], '#30383f', 0, { landmarkRole: 'projector', navRole: 'ceiling-mounted' })
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
    } else if (kind === 'pottery') {
      // 물레 4대 — 앉는 자리와 원반이 보여야 "돌리는 것"으로 읽힌다
      grid(2, 2, 2.6, 2.2, (x, z) => {
        CY(f, [x, y + 0.30, z], 0.30, 0.60, '#5f6165')
        CY(f, [x, y + 0.62, z], 0.34, 0.05, '#8d949a')
        CY(f, [x, y + 0.66, z], 0.16, 0.06, '#6e5a46')
        V(f, [x, y + 0.42, z + 0.72], [0.42, 0.06, 0.36], PAL.chair)
        V(f, [x, y + 0.22, z + 0.72], [0.34, 0.4, 0.28], PAL.deskLeg)
      })
      // 가마 — 이 방의 랜드마크
      V(f, [r.x0 + 1.5, y + 0.85, r.z0 + 1.5], [2.0, 1.7, 1.7], '#8f8579')
      V(f, [r.x0 + 1.5, y + 0.85, r.z0 + 0.62], [1.35, 1.15, 0.10], '#4e4740')
      V(f, [r.x0 + 1.5, y + 1.38, r.z0 + 0.60], [0.5, 0.16, 0.06], PAL.accentRed, { e: 0.8 })
      CY(f, [r.x0 + 1.5, y + 2.35, r.z0 + 1.5], 0.16, 1.3, '#6f757a')
      // 건조 선반 — 미완성 그릇이 층마다 놓인다
      for (let i = 0; i < 3; i++) {
        const sz = r.z0 + 2.0 + i * 1.9
        if (sz > r.z1 - 1.0) break
        V(f, [r.x1 - 0.55, y + 1.0, sz], [0.7, 2.0, 1.6], PAL.wood)
        for (let lv = 0; lv < 4; lv++) {
          V(f, [r.x1 - 0.55, y + 0.45 + lv * 0.46, sz], [0.66, 0.04, 1.54], PAL.paper)
          for (let b2 = 0; b2 < 3; b2++) CY(f, [r.x1 - 0.55, y + 0.55 + lv * 0.46, sz - 0.5 + b2 * 0.5], 0.10, 0.16, lv % 2 ? '#9b6f4e' : '#b5a893')
        }
      }
      V(f, [cx, y + 0.45, r.z1 - 0.8], [2.2, 0.9, 0.7], '#9aa4a8')   // 세척대
      for (let i = 0; i < 2; i++) CY(f, [cx - 0.6 + i * 1.2, y + 1.05, r.z1 - 0.8], 0.03, 0.3, PAL.steel)
      for (let i = 0; i < 3; i++) CY(f, [r.x0 + 0.7 + i * 0.62, y + 0.32, r.z1 - 0.7], 0.28, 0.64, '#6b6156')  // 점토 통
    } else if (kind === 'calli') {
      // 좌식 — 방 전체가 낮다. 시야가 트여서 숨을 데가 적은 방
      grid(3, 3, 1.9, 1.5, (x, z) => {
        V(f, [x, y + 0.30, z], [1.5, 0.05, 0.62], '#6e4f33')
        for (const sx of [-0.62, 0.62]) V(f, [x + sx, y + 0.15, z], [0.07, 0.30, 0.5], '#5a4029')
        P(f, [x, y + 0.335, z], [0.62, 0.44], '#efe9dc')             // 화선지
        V(f, [x + 0.55, y + 0.35, z - 0.02], [0.16, 0.04, 0.11], '#2b2b2e')  // 벼루
        CY(f, [x + 0.30, y + 0.36, z + 0.16], 0.012, 0.24, '#3c3229', [0, 0, 1.45])  // 붓
        V(f, [x, y + 0.055, z + 0.66], [0.6, 0.11, 0.5], PAL.fabric)  // 방석
      })
      const fp = facePos()
      V(f, [fp.x, y + 1.7, fp.z], fp.rot ? [0.06, 1.9, Math.min(d - 1.4, 4.0)] : [Math.min(w - 1.4, 4.0), 1.9, 0.06], '#e6dfcd')  // 족자 벽
      for (let i = 0; i < 3; i++) {
        const t = -1.2 + i * 1.2
        V(f, fp.rot ? [fp.x + 0.05, y + 1.7, cz + t] : [cx + t, y + 1.7, fp.z + 0.05], fp.rot ? [0.02, 1.5, 0.5] : [0.5, 1.5, 0.02], '#f2ede2')
        V(f, fp.rot ? [fp.x + 0.06, y + 2.44, cz + t] : [cx + t, y + 2.44, fp.z + 0.06], fp.rot ? [0.03, 0.06, 0.58] : [0.58, 0.06, 0.03], '#4a3b2c')
      }
      V(f, [r.x1 - 0.5, y + 0.9, r.z1 - 1.4], [0.55, 1.8, 1.6], PAL.wood)  // 지필묵 재료장
      V(f, [r.x0 + 0.6, y + 0.5, r.z0 + 0.8], [0.9, 1.0, 0.6], '#9aa4a8')   // 먹물 개수대
    } else if (kind === 'club') {
      // 규칙 없는 배치 — 복도에서 들여다보면 다른 교실과 확실히 다르다
      const cl = [[-2.2, -1.6, 0.4], [-0.4, -2.0, -0.9], [1.9, -1.2, 0.2], [-1.6, 1.5, 1.1], [1.2, 1.9, -0.5]]
      for (const [ox, oz, rot] of cl) {
        const x = cx + ox * (w / 7), z = cz + oz * (d / 7)
        if (inHole(x, z)) continue
        deskUnit(x, z, rot)
      }
      V(f, [r.x0 + 1.6, y + 0.34, r.z1 - 1.5], [2.1, 0.62, 0.85], PAL.fabric)   // 소파
      V(f, [r.x0 + 1.6, y + 0.72, r.z1 - 1.05], [2.1, 0.66, 0.16], PAL.fabric)
      V(f, [r.x0 + 1.6, y + 0.24, r.z1 - 2.6], [1.1, 0.44, 0.6], PAL.wood)      // 낮은 테이블
      for (let i = 0; i < 6; i++) {                                              // 포스터 벽
        const t = -2.2 + i * 0.9
        V(f, [cx + t, y + 1.95 + (i % 3) * 0.12, r.z0 + 0.1], [0.62, 0.86, 0.02], i % 2 ? '#c9634a' : '#3f6f8a')
      }
      cabinet(r.x1 - 0.35, cz, 3.2, true)                                        // 개인 사물함
      V(f, [r.x1 - 1.3, y + 0.55, r.z0 + 1.0], [0.42, 1.1, 0.42], '#6b4a30')     // 기타 케이스
      for (let i = 0; i < 4; i++) V(f, [r.x0 + 0.7, y + 0.12 + i * 0.13, r.z0 + 1.4], [0.52, 0.12, 0.52], i % 2 ? '#c8a878' : '#8f6f52')  // 보드게임 더미
    } else if (kind === 'council') {
      // ㄷ자 회의 테이블 — 한가운데가 비어 있어 술래가 들어오면 돌기 좋다
      const tw = Math.min(w - 2.6, 5.0), td = Math.min(d - 2.6, 4.0)
      V(f, [cx, y + 0.73, cz - td / 2], [tw, 0.07, 0.8], PAL.wood)
      for (const sg of [-1, 1]) V(f, [cx + sg * (tw / 2 - 0.4), y + 0.73, cz + 0.3], [0.8, 0.07, td - 0.8], PAL.wood)
      for (const sg of [-1, 1]) {
        V(f, [cx + sg * (tw / 2 - 0.4), y + 0.36, cz + 0.3], [0.7, 0.68, td - 1.0], PAL.deskLeg)
        for (let i = 0; i < 3; i++) V(f, [cx + sg * (tw / 2 - 1.3), y + 0.45, cz - td / 2 + 1.1 + i * 1.1], [0.46, 0.06, 0.46], PAL.chair)
      }
      V(f, [cx, y + 0.36, cz - td / 2], [tw - 0.8, 0.68, 0.7], PAL.deskLeg)
      for (let i = 0; i < 3; i++) V(f, [cx - 1.4 + i * 1.4, y + 0.45, cz - td / 2 + 0.95], [0.46, 0.06, 0.46], PAL.chair)
      const fp = facePos()
      V(f, [fp.x, y + 1.8, fp.z], fp.rot ? [0.06, 1.2, 3.2] : [3.2, 1.2, 0.06], '#eef0ef')   // 화이트보드
      V(f, [cx, y + 2.62, r.z0 + 0.12], [Math.min(w - 1.4, 5.0), 0.5, 0.03], '#b8452f')      // 현수막
      V(f, [r.x1 - 0.5, y + 1.0, r.z1 - 1.2], [0.55, 2.0, 1.4], '#3d4750')                    // 트로피장
      for (let lv = 0; lv < 3; lv++) {
        V(f, [r.x1 - 0.5, y + 0.55 + lv * 0.55, r.z1 - 1.2], [0.5, 0.03, 1.34], PAL.glass)
        for (let i = 0; i < 3; i++) CY(f, [r.x1 - 0.5, y + 0.68 + lv * 0.55, r.z1 - 1.7 + i * 0.5], 0.06, 0.22, '#c8a24a')
      }
      V(f, [r.x0 + 0.7, y + 0.4, r.z1 - 0.8], [0.6, 0.8, 0.6], '#8d949a')                     // 투표함
      V(f, [r.x0 + 0.7, y + 0.82, r.z1 - 0.8], [0.28, 0.04, 0.06], '#2b3036')
    } else if (kind === 'english') {
      // 3개 언어 포드. 4원탁 중첩을 없애고 문→중앙→뒤 포드의 1.2m 축을 남긴다.
      const pods = [[-1.65, 2.8], [1.65, 2.8], [0, 5.35]]
      for (const [pu, pv] of pods) {
        localCylinder(pu, pv, 0.72, 0.64, 0.06, PAL.desk)
        localCylinder(pu, pv, 0.35, 0.14, 0.70, PAL.deskLeg)
        localCylinder(pu, pv, 0.02, 0.42, 0.04, PAL.deskLeg)
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + Math.PI / 4
          localBox(pu + Math.cos(a) * 0.92, pv + Math.sin(a) * 0.92, 0.44, [0.42, 0.06, 0.42], PAL.chair, -a)
          localBox(pu + Math.cos(a) * 1.05, pv + Math.sin(a) * 1.05, 0.68, [0.42, 0.46, 0.06], PAL.chair, -a)
        }
      }
      localBox(0, localDepth - 0.12, 1.9, [3.4, 1.45, 0.05], '#20262b', 0, { landmarkRole: 'language-screen', navRole: 'wall-mounted' })
      localBox(0, localDepth - 0.09, 1.9, [3.2, 1.29, 0.03], '#39525f', 0, { e: 0.35, navRole: 'wall-mounted' })
      for (let i = 0; i < 8; i++) {                                                            // 알파벳 띠
        const span = localWidth - 2.0
        localBox(-span / 2 + span * (i + 0.5) / 8, localDepth - 0.1, 2.68, [span / 8 - 0.12, 0.34, 0.02], i % 2 ? '#d8c15a' : '#5f8fa8', 0, { navRole: 'wall-mounted' })
      }
      localBox(0, 4.0, 0.04, [Math.min(localWidth - 1.6, 6.0), 0.03, Math.min(localDepth - 2.0, 4.8)], '#5c6f7a', 0, { navRole: 'floor-decal' })
    } else if (kind === 'evhall') {
      // 승강장 정면은 비워 둔다. 대기 공간이므로 벽붙이 가구만 놓는다
      const zBack = r.z1 - 0.45
      V(f, [cx, y + 0.42, zBack], [1.7, 0.10, 0.42], PAL.wood)              // 대기 벤치
      for (const sg of [-0.7, 0.7]) V(f, [cx + sg, y + 0.20, zBack], [0.10, 0.40, 0.36], PAL.deskLeg)
      V(f, [r.x0 + 0.45, y + 1.55, zBack - 0.6], [0.06, 0.9, 1.2], '#2f363c')  // 게시판
      P(f, [r.x0 + 0.49, y + 1.55, zBack - 0.6], [0.8, 1.0], PAL.paper, { rot: [0, Math.PI / 2, 0] })
      CY(f, [r.x1 - 0.45, y + 0.18, zBack], 0.17, 0.36, '#5c6165')          // 쓰레기통
      V(f, [r.x1 - 0.42, y + 1.15, r.z0 + 1.4], [0.18, 0.55, 0.30], PAL.accentRed)  // 소화기함
    } else if (kind === 'archive') {
      // 이동식 서가 — 레일 위에 붙어 통로가 한 줄뿐이다. 들어가면 되돌아 나와야 하는 방
      const n = Math.max(3, Math.floor((w - 2.0) / 1.3))
      for (let i = 0; i < n; i++) {
        const x = r.x0 + 1.2 + i * 1.3
        if (x > r.x1 - 1.0) break
        V(f, [x, y + 1.1, cz], [1.0, 2.2, d - 2.2], '#5e6a6f')
        for (let lv = 0; lv < 5; lv++) V(f, [x, y + 0.35 + lv * 0.44, cz], [0.94, 0.03, d - 2.3], '#7b858a')
        for (let b2 = 0; b2 < 12; b2++) {
          const bz = cz - (d - 2.6) / 2 + b2 * (d - 2.6) / 11
          V(f, [x, y + 0.52 + (b2 % 5) * 0.44, bz], [0.86, 0.30, 0.09], ['#7a6a52', '#5c6a72', '#6f5a5a'][b2 % 3])
        }
        CY(f, [x + 0.52, y + 1.0, cz - (d - 2.2) / 2 + 0.2], 0.12, 0.5, '#9aa1a6', [Math.PI / 2, 0, 0])
      }
      for (const zr of [cz - (d - 2.2) / 2 - 0.1, cz + (d - 2.2) / 2 + 0.1]) P(f, [cx, y + 0.03, zr], [w - 1.6, 0.09], '#8b9298')
      V(f, [r.x1 - 0.5, y + 1.0, r.z0 + 1.0], [0.5, 2.0, 1.2], PAL.locker)
    } else if (kind === 'shelter') {
      // 방공호 — 지하에서 유일하게 사람이 머물던 방. 침상과 물자
      for (let i = 0; i < 3; i++) {
        const bz = r.z0 + 1.6 + i * 1.9
        if (bz > r.z1 - 1.2) break
        for (const lvl of [0.42, 1.22]) {
          V(f, [r.x0 + 1.2, y + lvl, bz], [1.9, 0.10, 0.8], '#5d6469')
          V(f, [r.x0 + 1.2, y + lvl + 0.10, bz], [1.8, 0.10, 0.72], PAL.fabric)
        }
        for (const sg of [-1, 1]) V(f, [r.x0 + 1.2 + sg * 0.85, y + 0.72, bz], [0.1, 1.44, 0.76], PAL.steel)
      }
      for (let i = 0; i < 6; i++) {
        const px2 = cx + (i % 3) * 0.95, pz2 = r.z1 - 1.4 - Math.floor(i / 3) * 1.1
        CY(f, [px2, y + 0.28, pz2], 0.26, 0.56, '#3f6f8a')
        V(f, [px2, y + 0.62, pz2], [0.5, 0.12, 0.5], '#7a6a52')
      }
      V(f, [r.x1 - 0.6, y + 1.35, cz], [0.6, 1.2, 2.0], '#4a5258')
      for (let i = 0; i < 3; i++) CY(f, [r.x1 - 0.6, y + 1.35, cz - 0.7 + i * 0.7], 0.22, 0.62, '#6f767b', [0, 0, Math.PI / 2])
      V(f, [cx, y + 1.9, r.z0 + 0.14], [1.6, 0.7, 0.06], PAL.paper)
      V(f, [r.x0 + 0.5, y + 1.15, r.z1 - 0.7], [0.4, 0.5, 0.3], PAL.accentRed)
    } else if (kind === 'security') {
      // 벽 하나를 통째로 모니터로 덮는다. 입구에서 기능이 읽혀야 한다
      const fp = facePos()
      const wallLen = Math.min((fp.rot ? d : w) - 1.2, 6.6)
      const bx = fp.rot ? fp.x : cx, bz = fp.rot ? cz : fp.z
      const along = fp.rot ? 'z' : 'x'
      V(f, [bx, y + 1.85, bz], fp.rot ? [0.10, 2.3, wallLen] : [wallLen, 2.3, 0.10], '#191e23')
      const cols = 4, rows2 = 3
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows2; j++) {
        const t = -wallLen / 2 + wallLen * (i + 0.5) / cols
        const my = y + 1.12 + j * 0.66
        const lit = ((i * 3 + j * 5 + hash32(meta.id)) % 7) > 1
        const mx = along === 'x' ? bx + t : bx + (face === 'E' ? -0.10 : 0.10)
        const mz = along === 'x' ? bz + (face === 'S' ? -0.10 : 0.10) : bz + t
        V(f, [mx, my, mz], along === 'x' ? [wallLen / cols - 0.14, 0.52, 0.06] : [0.06, 0.52, wallLen / cols - 0.14], '#0d1114')
        if (lit) V(f, [mx + (along === 'x' ? 0 : (face === 'E' ? -0.045 : 0.045)), my, mz + (along === 'x' ? (face === 'S' ? -0.045 : 0.045) : 0)],
          along === 'x' ? [wallLen / cols - 0.22, 0.44, 0.012] : [0.012, 0.44, wallLen / cols - 0.22], '#3f6f7d', { e: 0.55 })
      }
      // 통제 콘솔 — ㄱ자 데스크
      const dx = along === 'x' ? cx : bx + (face === 'E' ? -1.5 : 1.5)
      const dz = along === 'x' ? bz + (face === 'S' ? -1.5 : 1.5) : cz
      V(f, [dx, y + 0.74, dz], along === 'x' ? [wallLen - 1.2, 0.07, 0.85] : [0.85, 0.07, wallLen - 1.2], '#4a5158')
      V(f, [dx, y + 0.37, dz], along === 'x' ? [wallLen - 1.5, 0.70, 0.65] : [0.65, 0.70, wallLen - 1.5], '#343a40')
      for (let i = 0; i < 3; i++) {
        const t = -wallLen / 3 + i * (wallLen / 3)
        const px2 = along === 'x' ? dx + t : dx, pz2 = along === 'x' ? dz : dz + t
        V(f, [px2, y + 0.79, pz2], [0.44, 0.03, 0.30], '#8f989f')
        for (let b2 = 0; b2 < 4; b2++) V(f, [px2 - 0.15 + b2 * 0.10, y + 0.815, pz2], [0.06, 0.024, 0.06], b2 === 1 ? '#7fe0a8' : '#5e666d', b2 === 1 ? { e: 0.8 } : null)
      }
      V(f, [dx, y + 0.94, dz], [0.14, 0.34, 0.14], '#2e343a')   // 비상 방송 마이크 대
      CY(f, [dx, y + 1.18, dz], 0.022, 0.34, '#6d757c')
      V(f, [dx, y + 1.36, dz], [0.09, 0.10, 0.09], '#22272c')
      // 출입문 상태판 — 문 하나당 LED 하나
      const sw = fp.rot ? cx : r.x1 - 0.16, sz2 = fp.rot ? r.z1 - 0.16 : cz
      V(f, [sw, y + 1.7, sz2], fp.rot ? [2.2, 1.3, 0.07] : [0.07, 1.3, 2.2], '#232a30')
      for (let i = 0; i < 12; i++) {
        const t = -0.9 + (i % 6) * 0.36, k2 = Math.floor(i / 6)
        const ok = ((i * 7 + hash32(meta.id)) % 5) !== 0
        V(f, fp.rot ? [sw + t, y + 2.0 - k2 * 0.42, sz2 - 0.05] : [sw - 0.05, y + 2.0 - k2 * 0.42, sz2 + t],
          fp.rot ? [0.07, 0.07, 0.02] : [0.02, 0.07, 0.07], ok ? '#7fe0a8' : PAL.accentRed, { e: 1 })
      }
      // 열쇠함 · 서류장 · 의자
      cabinet(r.x0 + 0.4, cz, 2.0, true)
      V(f, [dx, y + 0.44, dz + (along === 'x' ? 1.0 : 0)], [0.5, 0.06, 0.5], PAL.chair)
      V(f, [dx, y + 0.72, dz + (along === 'x' ? 1.25 : 0.25)], [0.5, 0.5, 0.06], PAL.chair)
      CY(f, [r.x1 - 0.7, y + 0.18, r.z1 - 0.7], 0.17, 0.36, '#5c6165')
      DEVICES.push({ kind: 'cctv', id: 'cctv_' + meta.id, room: meta.id, floor: f, p: [dx, dz], y: y + 1.1, note: 'CCTV 관제 콘솔 · M16' })
      DEVICES.push({ kind: 'doorboard', id: 'db_' + meta.id, room: meta.id, floor: f, p: [sw, sz2], y: y + 1.7, note: '출입문 상태판' })
      DEVICES.push({ kind: 'pa', id: 'pa_' + meta.id, room: meta.id, floor: f, p: [dx, dz], y: y + 1.36, note: '비상 방송 마이크' })
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

    // 내선 인터폰 — 사람이 상주하거나 수업하는 방이면 문 옆에 하나씩 걸린다.
    // M06 릴레이는 서로 보이지 않는 두 대를 짝지어야 하므로 개수가 곧 퍼즐 재료다.
    if (IP_KINDS.has(kind)) {
      const fp = facePos()
      // 칠판 반대쪽 끝, 문 옆 자리
      const off = Math.min((fp.rot ? d : w) / 2 - 0.55, 2.6)
      const ix = fp.rot ? fp.x + (face === 'E' ? -0.06 : 0.06) : fp.x + off
      const iz = fp.rot ? fp.z + off : fp.z + (face === 'S' ? -0.06 : 0.06)
      interphone(ix, iz, fp.rot ? 1 : 0, meta.id)
    }
  }

  /* ── 복도 링 ─────────────────────────────────────────── */
  function corridorRing(f) {
    const y = FLOOR_Y[f]
    const segs = [
      { ax: 'x', a0: -55.8, a1: 7.8, b0: BAND.N.cor[0], b1: BAND.N.cor[1], side: 'N' },
      { ax: 'z', a0: -50.4, a1: 1.8, b0: BAND.W.cor[0], b1: BAND.W.cor[1], side: 'W' },
      { ax: 'z', a0: -50.4, a1: 1.8, b0: BAND.E.cor[0], b1: BAND.E.cor[1], side: 'E' },
    ]
    for (const s of segs) {
      const isX = s.ax === 'x'
      const w = isX ? s.a1 - s.a0 : s.b1 - s.b0
      const dd = isX ? s.b1 - s.b0 : s.a1 - s.a0
      const px = isX ? mid(s.a0, s.a1) : mid(s.b0, s.b1)
      const pz = isX ? mid(s.b0, s.b1) : mid(s.a0, s.a1)
      const seg = { x0: isX ? s.a0 : s.b0, x1: isX ? s.a1 : s.b1, z0: isX ? s.b0 : s.a0, z1: isX ? s.b1 : s.a1 }
      const cut = wellsOn(f).concat(holesOn(f))
      for (const p of subtract(seg, cut)) {
        P(f, [mid(p.x0, p.x1), y + 0.02, mid(p.z0, p.z1)], [p.x1 - p.x0, p.z1 - p.z0], PAL.corrFloor)
        P(f, [mid(p.x0, p.x1), y + 0.03, mid(p.z0, p.z1)], isX ? [p.x1 - p.x0, 0.12] : [0.12, p.z1 - p.z0], PAL.corrLine)
      }
      const above = FLOOR_ORDER[FLOOR_ORDER.indexOf(f) + 1]
      for (const p of subtract(seg, above ? wellsOn(above).concat(holesOn(above)) : [])) {
        P(f, [mid(p.x0, p.x1), y + CEIL_H - 0.02, mid(p.z0, p.z1)], [p.x1 - p.x0, p.z1 - p.z0], PAL.ceil, null, true)
      }
      // 방화문 — 실제 학교 복도를 25 m 안팎으로 끊는 것. 시야가 잘리고 은신 판단이 생긴다
      // 방화문 — 실제 학교 복도를 25 m 안팎으로 끊는다.
      // 평시 닫혀 있어 시야가 잘리고, 러너는 열고 지나가며 판단을 만든다
      const segLen = isX ? w : dd
      if (segLen > 30) {
        const nCut = Math.max(1, Math.floor(segLen / 42))
        const wide = isX ? dd : w
        for (let i = 1; i <= nCut; i++) {
          const t = s.a0 + segLen * i / (nCut + 1)
          const cx2 = isX ? t : px, cz2 = isX ? pz : t
          const leaf = 1.05, openW = leaf * 2
          const b0 = (isX ? s.b0 : s.b0), b1 = (isX ? s.b1 : s.b1)
          const mid2 = mid(b0, b1)
          // 개구부 좌우 소벽
          for (const sg of [-1, 1]) {
            const a = sg < 0 ? b0 : mid2 + openW / 2
            const bEnd = sg < 0 ? mid2 - openW / 2 : b1
            if (bEnd - a > 0.05) {
              const cc = mid(a, bEnd), ll = bEnd - a
              V(f, isX ? [cx2, y + 1.6, cc] : [cc, y + 1.6, cz2], isX ? [0.22, 3.2, ll] : [ll, 3.2, 0.22], PAL.corrWall)
            }
          }
          // 문 상부 벽 + 인방
          V(f, isX ? [cx2, y + 2.75, mid2] : [mid2, y + 2.75, cz2], isX ? [0.22, 0.9, openW] : [openW, 0.9, 0.22], PAL.corrWall)
          V(f, isX ? [cx2, y + 2.32, mid2] : [mid2, y + 2.32, cz2], isX ? [0.26, 0.14, openW + 0.2] : [openW + 0.2, 0.14, 0.26], '#8b8f93')
          V(f, isX ? [cx2, y + 2.62, mid2 + openW / 2 + 0.35] : [mid2 + openW / 2 + 0.35, y + 2.62, cz2], [0.3, 0.14, 0.3], PAL.accentRed, { e: 0.7 })
          // 양개 여닫이 — 가운데에서 양쪽으로 열린다
          for (const sg of [-1, 1]) {
            const hingeA = mid2 + sg * openW / 2
            doors.push({
              f, id: 'fd_' + f + '_' + s.side + '_' + i + (sg < 0 ? '_l' : '_r'),
              kind: 'fire', axis: isX ? 'z' : 'x', fixed: isX ? cx2 : cz2,
              hinge: isX ? [cx2, y + 0.02, hingeA] : [hingeA, y + 0.02, cz2],
              w: leaf, h: 2.15, t: 0.07, flip: sg > 0, swing: sg, c: '#9aa1a6',
            })
            // 방화문 유리창
            const gz = hingeA - sg * leaf / 2
            V(f, isX ? [cx2, y + 1.62, gz] : [gz, y + 1.62, cx2 === cx2 ? cz2 : cz2],
              isX ? [0.03, 0.62, 0.34] : [0.34, 0.62, 0.03], PAL.glass)
          }
          LEAKS.push({ f, id: 'leak_fd_' + f + '_' + s.side + '_' + i, kind: 'firedoor', grade: 'walk', w: openW,
            p: [cx2, cz2], atten: 0.9, note: '방화문 — 닫히면 소리와 시야가 함께 끊긴다' })
        }
      }

      // 형광등 — 층마다 간격·색온도·기구가 다르다. 창이 없어도 몇 층인지 알 수 있게
      const LIGHT = {
        B1: { step: 3.6, tone: TONE.dim, len: 0.9, tint: 'dim', bare: true },
        F1: { step: 2.4, tone: TONE.cool, len: 1.3, tint: 'cool' },
        F2: { step: 3.0, tone: TONE.soft, len: 1.5, tint: 'soft' },
        F3: { step: 4.2, tone: TONE.warm, len: 1.1, tint: 'warm' },
      }[f] || { step: 2.4, tone: TONE.cool, len: 1.3, tint: 'cool' }
      const len = isX ? w : dd
      const n = Math.max(1, Math.floor(len / LIGHT.step))
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n
        const lx = isX ? s.a0 + w * t : px
        const lz = isX ? pz : s.a0 + dd * t
        if (!LIGHT.bare) V(f, [lx, y + CEIL_H - 0.16, lz], isX ? [LIGHT.len + 0.2, 0.1, 0.36] : [0.36, 0.1, LIGHT.len + 0.2], '#8e959a')
        V(f, [lx, y + CEIL_H - 0.09, lz], isX ? [LIGHT.len, 0.09, 0.28] : [0.28, 0.09, LIGHT.len], LIGHT.tone, { e: 1 })
        if (i % 3 === 1) FX(f, [lx, y + CEIL_H - 0.28, lz], LIGHT.tone, LIGHT.tint, i % 6 === 1)
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
      { side: 'W', axis: 'z', fixed: BAND.W.part, a0: WINGZ.z0, a1: WINGZ.z1, sgn: 1 },
      { side: 'E', axis: 'z', fixed: BAND.E.part, a0: WINGZ.z0, a1: WINGZ.z1, sgn: -1 },
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
      [B.x0, B.z0, B.x1, COURT.z0],
      [B.x0, COURT.z0, COURT.x0, B.z1], [COURT.x1, COURT.z0, B.x1, B.z1],
    ]
    for (const [x0, z0, x1, z1] of cs) {
      for (const p of subtract({ x0, z0, x1, z1 }, holesOn(f).concat(wellsOn(f)))) S(f, [mid(p.x0, p.x1), y - SLAB_T / 2, mid(p.z0, p.z1)], [p.x1 - p.x0, SLAB_T, p.z1 - p.z0], PAL.slab)
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
    // 앞문·뒷문을 둘 다 갖는 실. 실제 학교 교실이 그렇고, 방이 함정이 아니라 은신처가 된다
    const TWO_DOOR = new Set(['classroom', 'lab', 'computer', 'library', 'music', 'art', 'dance',
      'av', 'english', 'club', 'calli', 'pottery', 'food', 'health'])
    const doorsFor = (wing) => {
      const out = []
      for (const r of rows.filter((q) => q.wing === wing)) {
        const span = r.b - r.a
        const front = (r.a + r.b) / 2 + span / 2 - 1.4
        out.push({ c: front, w: 1.1, type: 'door', head: 2.15 })
        // 뒷문 — 앞문 반대편 끝. 폭 0.9 m 로 조금 좁다
        if (TWO_DOOR.has(r.kind) && span > 5.6) {
          out.push({ c: (r.a + r.b) / 2 - span / 2 + 1.3, w: 0.9, type: 'door', head: 2.15, back: true })
        }
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
    wall(f, y, 'x', B.z1 - 0.1, B.x0, BAND.W.court, { c: PAL.wallOut, base: PAL.wallOutBase, openings: winsFor(B.x0 + 1, BAND.W.court - 1, 3.2) })
    wall(f, y, 'x', B.z1 - 0.1, BAND.E.court, B.x1, { c: PAL.wallOut, base: PAL.wallOutBase, openings: winsFor(BAND.E.court + 1, B.x1 - 1, 3.2) })
    wall(f, y, 'z', BAND.W.outer, B.z0, B.z1, { c: PAL.wallOut, base: PAL.wallOutBase, openings: winsFor(B.z0 + 1, B.z1 - 1, 3.2) })
    wall(f, y, 'z', BAND.E.outer, B.z0, B.z1, { c: PAL.wallOut, base: PAL.wallOutBase, openings: winsFor(B.z0 + 1, B.z1 - 1, 3.2) })

    // 칸막이벽 (실↔복도) : 문 + 상부 고창.
    // 구간은 코어 사이만. 코어 벽과 같은 평면이라 끝까지 그으면 계단실 출입문을 덮는다.
    const CNW = CORES[0], CNE = CORES[1], CSW = CORES[2], CSE = CORES[3]
    wall(f, y, 'x', BAND.N.part, CNW.x[1] + 0.1, CNE.x[0] - 0.1, { c: PAL.corrWall, base: PAL.corrBase, openings: doorsFor('N') })
    wall(f, y, 'z', BAND.W.part, CNW.z[1] + 0.1, CSW.z[0] - 0.1, { c: PAL.corrWall, base: PAL.corrBase, openings: doorsFor('W') })
    wall(f, y, 'z', BAND.E.part, CNE.z[1] + 0.1, CSE.z[0] - 0.1, { c: PAL.corrWall, base: PAL.corrBase, openings: doorsFor('E') })

    // 중정 벽. 1층은 십자 동선이 지나가도록 가운데를 연다 — 링에 현(弦)을 놓는다
    const courtWins = (a0, a1, side) => {
      const wins = winsFor(a0, a1, 2.8)
      // 1층은 십자 동선, 2층은 세로 다리(N·S), 3층은 가로 다리(W·E)가 지나간다
      // 1층은 앞마당으로 세 방향이 열리고, 2층은 가로 브릿지(W·E), 3층은 전망 데크(N)만 나간다
      const open = f === 'F1' ? true
        : f === 'F2' ? (side === 'W' || side === 'E')
        : f === 'F3' ? (side === 'N') : false
      if (!open) return wins
      const c = (a0 + a1) / 2
      const w = f === 'F1' ? 3.6 : 3.0
      LEAKS.push({ f, id: 'leak_court_' + f + side, kind: 'court', grade: 'walk', w,
        p: side === 'N' ? [c, BAND.N.court] : [BAND[side].court, c], atten: 0.8 })
      return wins.filter((o) => Math.abs(o.c - c) > 3.2).concat([{ c, w, head: 2.7 }])
    }
    wall(f, y, 'x', BAND.N.court, COURT.x0, COURT.x1, { c: PAL.corrWall, base: PAL.corrBase, openings: courtWins(COURT.x0, COURT.x1, 'N') })
    wall(f, y, 'z', BAND.W.court, COURT.z0, COURT.z1, { c: PAL.corrWall, base: PAL.corrBase, openings: courtWins(COURT.z0, COURT.z1, 'W') })
    wall(f, y, 'z', BAND.E.court, COURT.z0, COURT.z1, { c: PAL.corrWall, base: PAL.corrBase, openings: courtWins(COURT.z0, COURT.z1, 'E') })

    // 실간 칸막이. 코어가 자기 벽(문 포함)을 따로 그리므로 같은 평면에는 세우지 않는다
    const corePlanes = []
    for (const cc of CORES) corePlanes.push(cc.x[0] - 0.1, cc.x[1] + 0.1, cc.z[0] - 0.1, cc.z[1] + 0.1)
    const onCore = (v) => corePlanes.some((p) => Math.abs(p - v) < 0.25)
    for (const r of rows) {
      if (onCore(r.b)) continue
      if (r.axis === 'x') {
        wall(f, y, 'z', r.b, BAND.N.room[0], BAND.N.room[1], { c: PAL.classWall, base: PAL.classBase })
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

      for (const p of subtract(stairRect, wellsOn(f))) P(f, [mid(p.x0, p.x1), y + 0.02, mid(p.z0, p.z1)], [p.x1 - p.x0, p.z1 - p.z0], PAL.corrFloor)
      rooms.push({ id: `${f.toLowerCase()}_${core.id}`, name: `${core.name}`, kind: 'stair', floor: f, x0: stairRect.x0, z0: stairRect.z0, x1: stairRect.x1, z1: stairRect.z1, cx: mid(stairRect.x0, stairRect.x1), cz: mid(stairRect.z0, stairRect.z1), tone: 'cool', wing: 'C' })

      // 계단 2플라이트 (챌판 0.225 × 8 = 1.8m / 참)
      if (f !== 'ROOF') {
        const kind2 = core.type || 'switchback'
        // 직선형은 한 줄로 길게, 비상계단은 좁고 가파르게, 스위치백은 두 줄
        const sx0 = stairRect.x0 + (kind2 === 'narrow' ? 1.0 : 0.3)
        const sx1 = stairRect.x1 - (kind2 === 'narrow' ? 1.0 : 0.3)
        const dirZ = isNorth ? 1 : -1
        const zStart = isNorth ? stairRect.z0 + 0.4 : stairRect.z1 - 0.4
        const runW = kind2 === 'switchback' ? (sx1 - sx0 - 0.4) / 2 : (sx1 - sx0)
        // 직선형: 16단 한 줄 / 스위치백·비상: 8단 두 줄
        const flights = kind2 === 'straight' ? 1 : 2
        const steps = kind2 === 'straight' ? 16 : 8
        const tread = kind2 === 'narrow' ? 0.46 : kind2 === 'straight' ? 0.38 : 0.55
        const riser = 3.6 / (flights * steps)
        for (let fl = 0; fl < flights; fl++) {
          const lx = flights === 1 ? mid(sx0, sx1) : (fl === 0 ? sx0 + runW / 2 : sx1 - runW / 2)
          const dz = fl === 0 ? dirZ : -dirZ
          const z0 = fl === 0 ? zStart : zStart + dirZ * (steps * tread + 0.9)
          for (let i = 0; i < steps; i++) {
            const h = riser * (i + 1) + fl * (steps * riser)
            const zz = z0 + dz * (tread / 2 + i * tread)
            V(f, [lx, y + h - 0.1, zz], [runW, 0.2, tread], '#6d757c', { ramp: true })
            V(f, [lx, y + h - riser + 0.02, zz - dz * (tread / 2 - 0.02)], [runW, riser - 0.06, 0.05], '#5a6268', { ramp: true })
          }
          const run = steps * tread, rise = steps * riser
          const ang = Math.atan2(rise, run)
          S(f, [lx, y + fl * rise + rise / 2 - 0.1, z0 + dz * run / 2], [runW, 0.2, Math.hypot(run, rise) + 0.3],
            '#6d757c', { rot: [dz > 0 ? -ang : ang, 0, 0], ramp: true, hide: true })
        }
        // 참
        const runL = steps * tread, riseL = steps * riser
        if (flights === 2) S(f, [mid(sx0, sx1), y + riseL - 0.08, zStart + dirZ * (runL + 0.45)], [sx1 - sx0, 0.16, 1.5], '#6d757c')
        S(f, [mid(sx0, sx1), y + 3.52, zStart + dirZ * (flights === 1 ? runL + 0.7 : 0.2)], [sx1 - sx0, 0.16, 1.2], '#6d757c')

        // 경사 난간 — 손스침은 계단 코를 따라가고, 동자살은 답판마다 선다
        const ang2 = Math.atan2(riseL, runL)
        const runLen = Math.hypot(runL, riseL)
        for (let fl = 0; fl < flights; fl++) {
          const lx = flights === 1 ? mid(sx0, sx1) : (fl === 0 ? sx0 + runW / 2 : sx1 - runW / 2)
          const dz = fl === 0 ? dirZ : -dirZ
          const z0 = fl === 0 ? zStart : zStart + dirZ * (runL + 0.9)
          const zMid = z0 + dz * runL / 2
          const yMid = y + fl * riseL + riseL / 2
          // 계단실 안쪽(중앙 웰) 쪽만 난간. 바깥쪽은 벽에 붙는다
          const sgIn = flights === 1 ? 1 : (fl === 0 ? 1 : -1)
          const inner = lx + sgIn * (runW / 2 - 0.06)
          CY(f, [inner, yMid + 0.92, zMid], 0.032, runLen + 0.5, PAL.rail, [Math.PI / 2 - ang2 * dz, 0, 0])
          for (let i = 0; i < steps; i++) {
            const zz = z0 + dz * (tread / 2 + i * tread)
            CY(f, [inner, y + fl * riseL + riser * (i + 1) + 0.45, zz], 0.018, 0.9, PAL.rail)
          }
          // 벽 쪽 손스침 — 브래킷으로 띄운다
          const outer = lx - sgIn * (runW / 2 - 0.10)
          CY(f, [outer, yMid + 0.92, zMid], 0.028, runLen + 0.5, PAL.rail, [Math.PI / 2 - ang2 * dz, 0, 0])
          for (let i = 0; i < Math.ceil(steps / 2); i++) {
            const zz = z0 + dz * (tread / 2 + (i * 2 + 0.5) * tread)
            V(f, [outer - sgIn * 0.06, y + fl * riseL + riser * (i * 2 + 1.5) + 0.92, zz], [0.12, 0.03, 0.03], PAL.steel)
          }
        }
        // 참 난간 — 두 플라이트를 잇는 수평 구간
        if (flights === 2) {
          const lz = zStart + dirZ * (runL + 0.45)
          CY(f, [mid(sx0, sx1), y + riseL + 0.98, lz + dirZ * 0.68], 0.032, sx1 - sx0, PAL.rail, [0, 0, Math.PI / 2])
          for (let i = 0; i < 4; i++) CY(f, [sx0 + 0.3 + i * (sx1 - sx0 - 0.6) / 3, y + riseL + 0.54, lz + dirZ * 0.68], 0.018, 0.9, PAL.rail)
        }
      }
      // 층 표시판
      V(f, [mid(stairRect.x0, stairRect.x1), y + 2.4, isNorth ? stairRect.z0 + 0.16 : stairRect.z1 - 0.16], [0.9, 0.6, 0.06], PAL.paper)

      // 나머지 절반
      const isEV = core.id === 'core_ne' || core.id === 'core_nw'
      const isLobby = core.id === 'core_se' && f === 'F1'
      const kind = isEV ? 'evhall' : isLobby ? 'lobby' : f === 'B1' ? 'store' : 'toilet'
      const name = isEV ? '엘리베이터 홀' : isLobby ? '중앙 현관' : `화장실 (${core.name.slice(0, 2)})`
      room(f, otherRect, { id: `${f.toLowerCase()}_${core.id}_b`, name, kind, wing: 'C' })

      // 코어 외곽벽 + 복도측 개구부.
      // 문은 승강로를 피해 복도 쪽으로 붙인다 — 가운데에 두면 승강로 옆벽에 걸린다
      const dz = isNorth ? core.z[1] - 2.0 : core.z[0] + 2.0
      const dx = mid(core.x[0], core.x[1])
      if (core.door === 'E') {
        wall(f, y, 'z', core.x[1] + 0.1, core.z[0] - 0.1, core.z[1] + 0.1, { c: PAL.corrWall, base: PAL.corrBase, openings: [{ c: dz, w: 2.0, type: 'door', head: 2.3 }] })
        wall(f, y, 'x', isNorth ? core.z[1] + 0.1 : core.z[0] - 0.1, core.x[0] - 0.1, core.x[1] + 0.1, { c: PAL.corrWall, base: PAL.corrBase, openings: [{ c: dx, w: 2.0, type: 'door', head: 2.3 }] })
      } else {
        wall(f, y, 'z', core.x[0] - 0.1, core.z[0] - 0.1, core.z[1] + 0.1, { c: PAL.corrWall, base: PAL.corrBase, openings: [{ c: dz, w: 2.0, type: 'door', head: 2.3 }] })
        wall(f, y, 'x', isNorth ? core.z[1] + 0.1 : core.z[0] - 0.1, core.x[0] - 0.1, core.x[1] + 0.1, { c: PAL.corrWall, base: PAL.corrBase, openings: [{ c: dx, w: 2.0, type: 'door', head: 2.3 }] })
      }
      // 계단실 ↔ 나머지 사이 벽.
      // 복도 출입문이 이 벽의 연장선에 있으므로 문 앞 1.5 m 를 비워 둔다
      const sz0 = isNorth ? core.z[0] : core.z[0] + 1.5
      const sz1 = isNorth ? core.z[1] - 1.5 : core.z[1]
      wall(f, y, 'z', splitX, sz0, sz1, { c: PAL.corrWall, base: PAL.corrBase })
    }
  }

  /* ── 엘리베이터 (B1 → ROOF 관통 실사) ─────────────────── */
  function makeElevator(EV) {
    // 상세 부재(삼방틀·문·인디케이터·카·균형추)는 뷰어의 elevator.js가 세운다.
    // 여기서는 건물이 책임지는 것 — 승강로 구조벽과 옥상 권상기실만 만든다.
    const bottom = FLOOR_Y.B1 - 1.6, top = (EV.roof ? FLOOR_Y.ROOF : FLOOR_Y.F3) + 3.4
    const h = top - bottom
    S('F1', [EV.x[0] - 0.12, bottom + h / 2, mid(EV.z[0], EV.z[1])], [0.24, h, EV.z[1] - EV.z[0] + 0.5], PAL.concrete)
    S('F1', [EV.x[1] + 0.12, bottom + h / 2, mid(EV.z[0], EV.z[1])], [0.24, h, EV.z[1] - EV.z[0] + 0.5], PAL.concrete)
    S('F1', [mid(EV.x[0], EV.x[1]), bottom + h / 2, EV.z[0] - 0.12], [EV.x[1] - EV.x[0] + 0.5, h, 0.24], PAL.concrete)
    if (EV.roof) {
      const y = FLOOR_Y.ROOF, ecx = mid(EV.x[0], EV.x[1])
      const lx0 = EV.x[0] - 0.9, lx1 = EV.x[1] + 0.9        // 탑옥 평면
      const lz0 = EV.z[0] - 0.35, lz1 = EV.z[1] + 3.2
      P('ROOF', [mid(lx0, lx1), y + 0.02, mid(lz0, lz1)], [lx1 - lx0, lz1 - lz0], PAL.corrFloor)
      wall('ROOF', y, 'z', lx0, lz0, lz1, { c: PAL.corrWall, base: PAL.corrBase, h: 2.9 })
      wall('ROOF', y, 'z', lx1, lz0, lz1, { c: PAL.corrWall, base: PAL.corrBase, h: 2.9 })
      wall('ROOF', y, 'x', lz0, lx0, lx1, { c: PAL.corrWall, base: PAL.corrBase, h: 2.9 })
      wall('ROOF', y, 'x', lz1, lx0, lx1, {
        c: PAL.corrWall, base: PAL.corrBase, h: 2.9,
        openings: [{ c: ecx, w: 1.1, type: 'door', head: 2.2 }],
      })
      V('ROOF', [mid(lx0, lx1), y + 3.0, mid(lz0, lz1)], [lx1 - lx0 + 0.5, 0.22, lz1 - lz0 + 0.5], '#3f474d')
      V('ROOF', [ecx, y + 2.35, lz1 - 0.12], [0.7, 0.22, 0.06], TONE.cool, { e: 1 })   // 출구 유도등
      // 권상기실은 탑옥 위에 얹는다
      S('ROOF', [ecx, y + 4.4, mid(EV.z[0], EV.z[1])], [EV.x[1] - EV.x[0] + 1.0, 2.6, EV.z[1] - EV.z[0] + 1.0], '#4d555b')
      V('ROOF', [ecx, y + 5.8, mid(EV.z[0], EV.z[1])], [EV.x[1] - EV.x[0] + 1.4, 0.22, EV.z[1] - EV.z[0] + 1.4], '#3f474d')
      CY('ROOF', [ecx + 1.3, y + 5.9, mid(EV.z[0], EV.z[1])], 0.16, 0.9, '#6f757a')     // 통기관
    }
  }

  /**
   * 중정 브릿지 — 2층 세로(N↔S), 3층 가로(W↔E).
   * 교차점에 원형 계단이 서서 중정 바닥·2층·3층을 하나로 묶는다.
   * 링이 세 층에서 서로 다른 현(弦)을 갖게 되므로 층마다 추격 규칙이 달라진다.
   */
  const BRIDGE = {
    F2: { axis: 'x', z: -34, x0: BAND.W.court, x1: BAND.E.court, w: 3.0 },
    F3: { axis: 'z', x: -24, z0: BAND.N.court, z1: -26.0, w: 3.0 },
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
        id: f.toLowerCase() + '_bridge', name: f === 'F2' ? '앞마당 가로 브릿지' : '남향 전망 데크',
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
    rooms.push({ id: 'court_spiral', name: '앞마당 원형 계단', kind: 'stair', floor: 'OUT', wing: 'C', tone: 'amber', cond: 'intact', x0: x - rOuter, x1: x + rOuter, z0: z - rOuter, z1: z + rOuter, cx: x, cz: z })
  }

  /* ── 지하 1층 ─────────────────────────────────────────── */
  function makeB1() {
    const f = 'B1', y = FLOOR_Y.B1
    S(f, [mid(-55.8, 7.8), y - 0.3, mid(-57.8, -46.2)], [63.6, 0.6, 11.6], PAL.concrete)
    // 지하 복도 (북측 윙 안쪽)
    const cor = R(-55.8, -50.4, 7.8, -46.2)
    P(f, [mid(cor.x0, cor.x1), y + 0.02, mid(cor.z0, cor.z1)], [cor.x1 - cor.x0, cor.z1 - cor.z0], PAL.machFloor)
    // 계단 상부는 1층 슬래브가 비어 있다 — B1_STAIR 참조
    for (const p of subtract(cor, wellsOn('F1'))) P(f, [mid(p.x0, p.x1), y + CEIL_H - 0.02, mid(p.z0, p.z1)], [p.x1 - p.x0, p.z1 - p.z0], PAL.concrete, null, true)
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

    // 지하 직통 계단 — 급식 반입 동선. 1층 복도 남쪽 차선 아래를 그대로 올라간다
    {
      const sx = B1_STAIR, sz = mid(sx.z0, sx.z1), wRun = sx.z1 - sx.z0 - 0.16
      const x0 = sx.x1 - 0.25, dir = -1                     // 동쪽 아래 → 서쪽 위
      const fOf = (h) => (h > 1.8 ? 'F1' : f)   // 절반 위는 1층에서도 보인다
      for (let i = 0; i < 16; i++) {
        const h = 0.225 * (i + 1)
        const xx = x0 + dir * (0.15 + i * 0.30)
        V(fOf(h), [xx, y + h - 0.1, sz], [0.30, 0.2, wRun], '#6d757c', { ramp: true })
        V(fOf(h), [xx - dir * 0.15, y + h - 0.22, sz], [0.04, 0.24, wRun], '#5a6268', { ramp: true })
      }
      const xTop = x0 + dir * (0.15 + 15 * 0.30), xBot = x0 + dir * 0.15
      const run = Math.abs(xTop - xBot), rise = 0.225 * 15
      const ang = Math.atan2(rise, run), len = Math.hypot(run, rise)
      const mx = mid(xBot, xTop), my = y + (0.225 + 3.6) / 2 - 0.1
      // 경사 콜라이더는 두 층 모두에 둔다 — 어느 층을 보고 있어도 발밑이 사라지지 않는다
      for (const fk of [f, 'F1']) S(fk, [mx, my, sz], [len + 1.1, 0.2, wRun], '#6d757c', { rot: [0, 0, -ang], ramp: true, hide: true })
      // 상부 참 — 1층 바닥과 같은 높이
      S('F1', [xTop - 0.85, y + 3.5, sz], [1.1, 0.2, wRun], '#6d757c', { ramp: true })
      // 난간 — 계단 양쪽
      for (const zr of [sx.z0 + 0.06, sx.z1 - 0.06]) {
        for (const fk of [f, 'F1']) CY(fk, [mx, my + 0.95, zr], 0.035, len, PAL.rail, [0, 0, Math.PI / 2 - ang])
        for (let i = 0; i < 6; i++) {
          const t = i / 5, px = xBot + (xTop - xBot) * t
          CY(fOf(0.225 + rise * t), [px, y + 0.225 + rise * t + 0.4, zr], 0.026, 0.95, PAL.rail)
        }
      }
      // 1층 개구부 둘레 난간 — 떨어지지 않게
      for (const seg of [[sx.x0, sx.z1, sx.x1, sx.z1], [sx.x0, sx.z0, sx.x0, sx.z0]]) {
        const isX = Math.abs(seg[2] - seg[0]) > 0.1
        CY('F1', [mid(seg[0], seg[2]), 1.05, mid(seg[1], seg[3])], 0.035, isX ? sx.x1 - sx.x0 : sx.z1 - sx.z0, PAL.rail, isX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0])
        const n = isX ? 6 : 3
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1)
          CY('F1', [seg[0] + (seg[2] - seg[0]) * t, 0.53, seg[1] + (seg[3] - seg[1]) * t], 0.026, 1.05, PAL.rail)
        }
      }
      V('F1', [sx.x0 - 0.3, 1.55, mid(sx.z0, sx.z1)], [0.08, 0.5, 0.9], PAL.paper)   // 「지하 1층」 표지
      rooms.push({ id: 'b1_stair', name: '지하 직통 계단', kind: 'stair', floor: f, wing: 'C', tone: 'dim',
        x0: sx.x0, x1: sx.x1, z0: sx.z0, z1: sx.z1, cx: mid(sx.x0, sx.x1), cz: sz })
      for (let i = 0; i < 3; i++) FX(i > 1 ? 'F1' : f, [sx.x0 + 1.4 + i * 1.9, y + 2.9 + i * 0.4, sz], TONE.dim, 'dim', false)
    }

    // 동익 설비 터널 — 폭 1.8 m. 느리지만 술래의 시야를 완전히 벗어난다
    const TUN_W = 1.8, tx = -2.0
    const tz0 = -46.2, tz1 = -14.0
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
    rooms.push({ id: 'b1_tunnel', name: '동익 설비 터널', kind: 'corridor', floor: f, wing: 'C', tone: 'dim', cond: 'intact', x0: tx - TUN_W / 2, x1: tx + TUN_W / 2, z0: tz0, z1: tz1, cx: tx, cz: mid(tz0, tz1) })
    // 남단 기계실 + 남측 코어로 오르는 계단
    const pit = R(-3.8, -14.0, 7.8, -7.0)
    P(f, [mid(pit.x0, pit.x1), y + 0.02, mid(pit.z0, pit.z1)], [pit.x1 - pit.x0, pit.z1 - pit.z0], PAL.machFloor)
    P(f, [mid(pit.x0, pit.x1), y + CEIL_H - 0.02, mid(pit.z0, pit.z1)], [pit.x1 - pit.x0, pit.z1 - pit.z0], PAL.concrete, null, true)
    S(f, [mid(pit.x0, pit.x1), y - 0.3, mid(pit.z0, pit.z1)], [pit.x1 - pit.x0 + 0.6, 0.6, pit.z1 - pit.z0 + 0.6], PAL.concrete)
    rooms.push({ id: 'b1_southpit', name: '동익 펌프실', kind: 'machine', floor: f, wing: 'C', tone: 'dim', cond: 'intact', x0: pit.x0, x1: pit.x1, z0: pit.z0, z1: pit.z1, cx: mid(pit.x0, pit.x1), cz: mid(pit.z0, pit.z1) })
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
      [B.x0, B.z0, B.x1, COURT.z0],
      [B.x0, COURT.z0, COURT.x0, B.z1], [COURT.x1, COURT.z0, B.x1, B.z1],
    ]
    for (const [x0, z0, x1, z1] of cs) {
      for (const p of subtract({ x0, z0, x1, z1 }, wellsOn(f))) {
        S(f, [mid(p.x0, p.x1), y - SLAB_T / 2, mid(p.z0, p.z1)], [p.x1 - p.x0, SLAB_T, p.z1 - p.z0], '#5a6167')
        P(f, [mid(p.x0, p.x1), y + 0.02, mid(p.z0, p.z1)], [p.x1 - p.x0, p.z1 - p.z0], '#6b7278')
      }
    }
    // 파라펫 (외곽 + 중정)
    const para = (x0, z0, x1, z1) => {
      S(f, [mid(x0, x1), y + 0.6, z0], [x1 - x0, 1.2, 0.28], '#7b8288')
      S(f, [mid(x0, x1), y + 0.6, z1], [x1 - x0, 1.2, 0.28], '#7b8288')
      S(f, [x0, y + 0.6, mid(z0, z1)], [0.28, 1.2, z1 - z0], '#7b8288')
      S(f, [x1, y + 0.6, mid(z0, z1)], [0.28, 1.2, z1 - z0], '#7b8288')
    }
    para(B.x0, B.z0, B.x1, B.z1)
    // ㄷ자 품은 남쪽이 열려 있다 — 파라펫도 세 변만
    S(f, [mid(COURT.x0, COURT.x1), y + 0.6, COURT.z0], [COURT.x1 - COURT.x0, 1.2, 0.28], '#7b8288')
    S(f, [COURT.x0, y + 0.6, mid(COURT.z0, COURT.z1)], [0.28, 1.2, COURT.z1 - COURT.z0], '#7b8288')
    S(f, [COURT.x1, y + 0.6, mid(COURT.z0, COURT.z1)], [0.28, 1.2, COURT.z1 - COURT.z0], '#7b8288')
    // 계단 펜트하우스 4 — 계단 절반만 덮고, 옥상으로 나가는 문을 낸다
    for (const core of CORES) {
      const north = core.z[0] < -40
      const sX = mid(core.x[0], core.x[1])
      const sr = core.door === 'E' ? [core.x[0], sX - 0.1] : [sX + 0.1, core.x[1]]
      const px0 = sr[0] - 0.1, px1 = sr[1] + 0.1
      const pz0 = core.z[0] - 0.1, pz1 = core.z[1] + 0.1
      const cxp = mid(px0, px1)
      const exit = north ? pz1 : pz0      // 옥상 쪽으로 열리는 변
      wall(f, y, 'z', px0, pz0, pz1, { c: PAL.corrWall, base: PAL.corrBase, h: 2.9 })
      wall(f, y, 'z', px1, pz0, pz1, { c: PAL.corrWall, base: PAL.corrBase, h: 2.9 })
      wall(f, y, 'x', north ? pz0 : pz1, px0, px1, { c: PAL.corrWall, base: PAL.corrBase, h: 2.9 })
      wall(f, y, 'x', exit, px0, px1, {
        c: PAL.corrWall, base: PAL.corrBase, h: 2.9,
        openings: [{ c: cxp, w: 1.1, type: 'door', head: 2.2 }],
      })
      V(f, [cxp, y + 3.0, mid(pz0, pz1)], [px1 - px0 + 0.4, 0.24, pz1 - pz0 + 0.4], '#3f474d')
      V(f, [cxp, y + 2.35, exit + (north ? -0.14 : 0.14)], [0.7, 0.22, 0.06], TONE.cool, { e: 1 })
      FX(f, [cxp, y + 2.2, exit + (north ? 0.5 : -0.5)], TONE.amber, 'amber', false)
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
      if (x > COURT.x0 - 0.5 && x < COURT.x1 + 0.5) P(f, [x, y + 0.035, mid(B.z0, COURT.z0)], [0.08, COURT.z0 - B.z0], '#5f666b')
      else P(f, [x, y + 0.035, mid(B.z0, B.z1)], [0.08, B.z1 - B.z0], '#5f666b')
    }
    // 파라펫 상부 두겁 + 난간 파이프
    const cap = (x0, z0, x1, z1) => {
      V(f, [mid(x0, x1), y + 1.24, z0], [x1 - x0 + 0.3, 0.09, 0.42], '#9aa1a6')
      V(f, [mid(x0, x1), y + 1.24, z1], [x1 - x0 + 0.3, 0.09, 0.42], '#9aa1a6')
      V(f, [x0, y + 1.24, mid(z0, z1)], [0.42, 0.09, z1 - z0 + 0.3], '#9aa1a6')
      V(f, [x1, y + 1.24, mid(z0, z1)], [0.42, 0.09, z1 - z0 + 0.3], '#9aa1a6')
    }
    cap(B.x0, B.z0, B.x1, B.z1)
    V(f, [mid(COURT.x0, COURT.x1), y + 1.24, COURT.z0], [COURT.x1 - COURT.x0 + 0.3, 0.09, 0.42], '#9aa1a6')
    V(f, [COURT.x0, y + 1.24, mid(COURT.z0, COURT.z1)], [0.42, 0.09, COURT.z1 - COURT.z0 + 0.3], '#9aa1a6')
    V(f, [COURT.x1, y + 1.24, mid(COURT.z0, COURT.z1)], [0.42, 0.09, COURT.z1 - COURT.z0 + 0.3], '#9aa1a6')
    for (const zz of [B.z0, B.z1]) {
      for (let x = B.x0 + 2; x < B.x1; x += 2.2) { if (zz === B.z1 && x > COURT.x0 && x < COURT.x1) continue; CY(f, [x, y + 1.75, zz], 0.03, 0.95, PAL.rail) }
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
    const pcz = mid(PLAZA.z0, PLAZA.z1), pw = PLAZA.x1 - PLAZA.x0, pd = PLAZA.z1 - PLAZA.z0
    P('OUT', [mid(PLAZA.x0, PLAZA.x1), 0.02, pcz], [pw, pd], '#7d8288')
    // 줄눈 — 포장은 판이 아니라 격자로 읽혀야 한다
    for (let x = PLAZA.x0 + 4; x < PLAZA.x1; x += 4) P('OUT', [x, 0.03, pcz], [0.06, pd], '#6b7076')
    for (let z = PLAZA.z0 + 4; z < PLAZA.z1; z += 4) P('OUT', [mid(PLAZA.x0, PLAZA.x1), 0.03, z], [pw, 0.06], '#6b7076')
    // 현관 앞 진입 축 — 북측 본관 문에서 운동장으로 곧게 내린다
    P('OUT', [-24, 0.04, pcz], [4.4, pd], '#8d9298')
    // 화단 · 벤치 — 원형 계단 자리는 비운다
    for (const [tx, tz] of [[-38, -43], [-10, -43], [-38, -33], [-10, -33]]) {
      CY('OUT', [tx, 0.22, tz], 1.9, 0.44, '#6f6a60')
      CY('OUT', [tx, 1.5, tz], 0.2, 3.0, '#4a3c2c')
      CY('OUT', [tx, 3.7, tz], 2.0, 2.4, '#2e4630')
    }
    for (const [bx, bz] of [[-32, -30.2], [-24, -30.2], [-16, -30.2]]) {
      V('OUT', [bx, 0.42, bz], [2.0, 0.1, 0.45], PAL.wood)
      V('OUT', [bx, 0.22, bz], [1.8, 0.35, 0.3], PAL.steel)
    }
    // 국기 게양대 3본 — 앞마당 서편
    for (let i = 0; i < 3; i++) { CY('OUT', [-41 + i * 1.6, 4.2, -37], 0.07, 8.4, '#b9bec2'); V('OUT', [-41 + i * 1.6, 8.3, -37], [0.14, 0.14, 0.14], '#8d9298') }
    CY('OUT', [-39.4, 0.15, -37], 2.6, 0.3, '#6f6a60')
    // 자전거 거치대
    for (let i = 0; i < 8; i++) CY('OUT', [-13 + (i % 4) * 0.9, 0.4, -29.5 - Math.floor(i / 4) * 2.0], 0.035, 0.8, PAL.steel)
    // 조명 폴 4
    for (const [lx, lz] of [[-38, -44], [-10, -44], [-38, -30], [-10, -30]]) {
      CY('OUT', [lx, 1.8, lz], 0.08, 3.6, '#3f474d')
      V('OUT', [lx, 3.7, lz], [0.4, 0.18, 0.4], TONE.amber, { e: 1 })
    }
  }

  /** 3층 전망 데크 끝단 — 스텁 브릿지의 남쪽 코 */
  function makeDeck() {
    const y = FLOOR_Y.F3, x = -24, z = -26.0
    S('F3', [x, y - 0.16, z - 1.6], [7.2, 0.32, 4.4], PAL.slab)
    P('F3', [x, y + 0.02, z - 1.6], [7.2, 4.4], PAL.corrFloor)
    for (const [rx, rz, w2, d2] of [[x, z + 0.5, 7.2, 0.08], [x - 3.56, z - 1.6, 0.08, 4.4], [x + 3.56, z - 1.6, 0.08, 4.4]]) {
      V('F3', [rx, y + 1.06, rz], [w2, 0.08, d2], PAL.rail)
      V('F3', [rx, y + 0.5, rz], [w2 * 0.98, 0.9, d2 * 0.98], PAL.glass)
    }
    V('F3', [x, y + 2.9, z - 1.6], [1.0, 0.1, 0.3], TONE.cool, { e: 1 })
    FX('F3', [x, y + 2.7, z - 1.6], TONE.cool, 'cool', false)
    rooms.push({ id: 'f3_deck', name: '전망 데크', kind: 'corridor', floor: 'F3', wing: 'C', tone: 'cool', cond: 'intact', x0: x - 3.6, x1: x + 3.6, z0: z - 3.8, z1: z + 0.6, cx: x, cz: z - 1.6 })
  }

  /* ── 운동장 (ㄷ자 품 안) ───────────────────────────── */
  function makeField() {
    const f = 'OUT'
    const X0 = COURT.x0, X1 = COURT.x1, Z0 = PLAZA.z1, Z1 = 21
    const cx = mid(X0, X1), cz = mid(Z0, Z1)
    P(f, [cx, 0.012, cz], [X1 - X0, Z1 - Z0], PAL.dirt)
    // 잔디 피치 32 × 40
    P(f, [cx, 0.022, cz], [32, 40], PAL.grass)
    const line = (x, z, w, d) => P(f, [x, 0.035, z], [w, d], PAL.line)
    line(cx, cz, 32, 0.14); line(cx, cz, 0.14, 40)
    CY(f, [cx, 0.035, cz], 6.1, 0.02, PAL.line)
    for (const sgn of [-1, 1]) {
      const gz = cz + sgn * 20
      line(cx, gz, 32, 0.15)
      line(cx, gz - sgn * 5.5, 16, 0.15); line(cx - 8, gz - sgn * 2.75, 0.15, 5.5); line(cx + 8, gz - sgn * 2.75, 0.15, 5.5)
      for (const gx of [cx - 3.66, cx + 3.66]) CY(f, [gx, 1.22, gz], 0.06, 2.44, PAL.white)
      CY(f, [cx, 2.44, gz], 0.06, 7.32, PAL.white, [0, 0, Math.PI / 2])
      V(f, [cx, 1.2, gz + sgn * 1.0], [7.4, 2.4, 0.05], '#c5ccd0')
    }
    // 트랙 — 직선 구간만. 곡선은 잔디 밖으로 돈다
    for (let i = 0; i < 4; i++) { line(X0 + 2.4 + i * 1.2, cz, 0.1, Z1 - Z0 - 4); line(X1 - 2.4 - i * 1.2, cz, 0.1, Z1 - Z0 - 4) }
    // 백네트 남북
    for (const sgn of [-1, 1]) {
      const nz = cz + sgn * ((Z1 - Z0) / 2 - 1.2)
      V(f, [cx, 3, nz], [24, 6, 0.12], '#4c545a')
      for (let i = 0; i < 7; i++) CY(f, [cx - 12 + i * 4, 3, nz], 0.1, 6, '#3f474d')
    }
    // 조명탑 4 — 건물 바깥 남측
    for (const [lx, lz] of [[X0 - 4, 5], [X1 + 4, 5], [X0 - 4, 19], [X1 + 4, 19]]) {
      CY(f, [lx, 6, lz], 0.24, 12, '#464e54')
      V(f, [lx, 12.4, lz], [3.0, 1.0, 0.5], '#3a4147')
      for (let i = 0; i < 6; i++) V(f, [lx - 1.1 + (i % 3) * 1.1, 12.4 + (i < 3 ? 0.28 : -0.28), lz], [0.85, 0.4, 0.3], '#ffe9c4', { e: 1 })
    }
    // 조회대 — 서편, 운동장을 마주본다
    S(f, [X0 + 2.6, 0.6, cz], [5, 1.2, 8], '#7b8288')
    S(f, [X0 + 5.5, 0.6, cz], [3.05, 0.2, 2.4], '#5a6167', { rot: [0, 0, -0.405], ramp: true })
    CY(f, [X0 + 1.6, 1.55, cz], 0.03, 0.7, PAL.steel); V(f, [X0 + 1.6, 1.95, cz], [0.12, 0.16, 0.12], '#1c2126')
    for (const sgn of [-1, 1]) { CY(f, [X0 + 0.8, 3.2, cz + sgn * 2.6], 0.06, 5.2, '#9aa1a6'); V(f, [X0 + 0.8, 4.9, cz + sgn * 2.6 + 0.5], [0.05, 1.2, 1.0], '#c9d0d4') }
    // 스탠드 3단 — 남단, 건물 밖
    for (let i = 0; i < 3; i++) {
      S(f, [cx, 0.35 + i * 0.45, Z1 + 1.4 + i * 1.3], [28, 0.7 + i * 0.9, 1.3], '#6b7278')
      for (let j = 0; j < 15; j++) V(f, [cx - 12.6 + j * 1.8, 0.72 + i * 0.9, Z1 + 1.4 + i * 1.3], [1.5, 0.08, 0.9], '#3c5670')
    }
    // 멀리뛰기 모래장 · 철봉 · 음수대
    P(f, [X1 - 5, 0.03, 15], [5, 12], PAL.sand)
    for (let i = 0; i < 3; i++) { for (const sgn of [-1, 1]) CY(f, [X0 + 5, 0.9 + i * 0.25, 16 + sgn * 1.6], 0.05, 1.8 + i * 0.5, PAL.steel); CY(f, [X0 + 5, 1.8 + i * 0.5, 16], 0.045, 3.2, PAL.steel, [Math.PI / 2, 0, 0]) }
    for (const [dx, dz] of [[X0 + 2, -26], [X1 - 2, 8]]) { V(f, [dx, 0.45, dz], [1.6, 0.9, 0.6], '#8e969b'); V(f, [dx, 0.92, dz], [1.7, 0.06, 0.7], '#b6bec2'); for (let i = 0; i < 3; i++) CY(f, [dx - 0.5 + i * 0.5, 1.06, dz - 0.2], 0.025, 0.28, PAL.steel) }
  }

  /* ── 정문 · 담장 · 후문 골목 ────────────────────────── */
  const SITE = { x0: -60, x1: 16, z0: -64, z1: 38 }
  function makeGrounds() {
    const f = 'OUT'
    const H = MAP_SIZE / 2
    for (const [x0, z0, x1, z1] of [
      [-H, -H, H, B.z0], [-H, B.z1, H, H],
      [-H, B.z0, B.x0, B.z1], [B.x1, B.z0, H, B.z1],
    ]) P(f, [mid(x0, x1), 0.005, mid(z0, z1)], [x1 - x0, z1 - z0], '#2f3a33')
    const GX = -24    // 정문 축 — 운동장 중심선과 같다
    // 진입 포장: 정문 → 운동장
    P(f, [GX, 0.02, 30], [14, 18], PAL.asphalt)
    P(f, [GX, 0.02, 24], [30, 8], PAL.asphalt)
    for (let i = 0; i < 5; i++) P(f, [GX, 0.03, 24 + i * 2.4], [8, 0.7], PAL.line)
    // 교문
    for (const sgn of [-1, 1]) { S(f, [GX + sgn * 4.2, 1.8, SITE.z1], [1.0, 3.6, 1.0], '#5c6167'); V(f, [GX + sgn * 4.2, 3.8, SITE.z1], [1.2, 0.4, 1.2], '#464c52') }
    for (const sgn of [-1, 1]) { V(f, [GX + sgn * 2.0, 1.5, SITE.z1], [3.8, 3.0, 0.12], '#3f474d'); for (let i = 0; i < 8; i++) CY(f, [GX + sgn * (0.3 + i * 0.45), 1.5, SITE.z1], 0.045, 3.0, '#5a6167') }
    V(f, [GX - 6.4, 2.6, SITE.z1], [1.0, 2.2, 0.3], PAL.paper)
    // 경비실
    S(f, [GX + 9, 1.55, 34], [6, 3.1, 4.4], '#7d8288')
    V(f, [GX + 9, 3.25, 34], [6.8, 0.3, 5.2], '#4b5259')
    V(f, [GX + 9, 1.75, 31.85], [4.6, 1.6, 0.1], PAL.glass)
    V(f, [GX + 6.05, 1.75, 34], [0.1, 1.6, 3.0], PAL.glass)
    V(f, [GX + 11.6, 1.15, 34], [0.12, 2.1, 1.0], PAL.door)
    V(f, [GX + 9, 0.95, 31.6], [3.4, 0.12, 0.5], PAL.wood)
    S(f, [GX + 9, 3.6, 34], [1.2, 0.7, 1.0], '#59616a')
    // 자전거 보관소 — 정문 서편
    S(f, [GX - 12, 2.3, 32], [12, 0.16, 4.4], '#5a6167')
    for (const bx of [GX - 17, GX - 12, GX - 7]) for (const bz of [30.2, 33.8]) CY(f, [bx, 1.15, bz], 0.08, 2.3, '#6b7278')
    for (let i = 0; i < 10; i++) CY(f, [GX - 17.5 + i * 1.1, 0.4, 32], 0.035, 0.8, PAL.steel)
    // 담장 — 정문만 열려 있다
    const fence = (ax, fx, a0, a1) => wall(f, 0, ax, fx, a0, a1, { h: 2.4, t: 0.35, c: '#7a7368', base: '#5f5a52' })
    fence('x', SITE.z0, SITE.x0, SITE.x1)
    fence('x', SITE.z1, SITE.x0, GX - 6.5); fence('x', SITE.z1, GX + 6.5, SITE.x1)
    fence('z', SITE.x0, SITE.z0, SITE.z1); fence('z', SITE.x1, SITE.z0, SITE.z1)
    for (let i = 0; i < 25; i++) V(f, [SITE.x0 + 1.5 + i * 3, 2.55, SITE.z0], [2.9, 0.18, 0.55], '#4e4a44')
    // 후문 골목 (서측)
    P(f, [-58, 0.02, -20], [4, 84], PAL.asphalt)
    for (const [zz, zw] of [[-44, 10], [-18, 12], [4, 8]]) { S(f, [-56.2, 1.2, zz], [0.4, 2.4, zw], '#6f695f'); V(f, [-56.2, 2.5, zz], [0.6, 0.2, zw], '#4e4a44') }
    for (let i = 0; i < 6; i++) { CY(f, [-59.4, 2.6, -50 + i * 12], 0.07, 5.2, '#4a5157'); V(f, [-58.8, 5.0, -50 + i * 12], [1.4, 0.22, 0.5], TONE.amber, { e: 1 }) }
    for (let i = 0; i < 5; i++) { const bz = -46 + i * 10; V(f, [-57.4, 0.55, bz], [0.2, 0.9, 1.6], '#2f3a44'); CY(f, [-57.4, 0.32, bz - 0.6], 0.32, 0.08, '#1e2328', [0, 0, Math.PI / 2]); CY(f, [-57.4, 0.32, bz + 0.6], 0.32, 0.08, '#1e2328', [0, 0, Math.PI / 2]) }
    // 후문 — 골목 북단
    for (const sgn of [-1, 1]) S(f, [-58 + sgn * 1.6, 1.4, -56], [0.6, 2.8, 0.6], '#5c6167')
    V(f, [-58, 1.3, -56], [2.6, 2.6, 0.1], '#3f474d')
    // 집하장 (막다른 방)
    S(f, [-58, 1.4, 16], [4.2, 2.8, 0.35], '#6f695f')
    S(f, [-56.1, 1.4, 13], [0.35, 2.8, 6.2], '#6f695f')
    for (let i = 0; i < 3; i++) { V(f, [-59.2 + i * 1.5, 0.6, 14.6], [1.2, 1.2, 1.2], ['#2f5a3a', '#2f4a6a', '#6a5a2f'][i]); V(f, [-59.2 + i * 1.5, 1.24, 14.6], [1.3, 0.1, 1.3], '#3a4148') }
  }

  /* ── 실외 가로등 ─────────────────────────────────────── */
  const lamps = [
    { p: [-24, 34], h: 7, tone: 'amber' }, { p: [-38, 26], h: 7, tone: 'amber' },
    { p: [-10, 26], h: 7, tone: 'amber' }, { p: [-46, 4], h: 6, tone: 'warm' },
    { p: [-2, 4], h: 6, tone: 'warm' }, { p: [-46, -20], h: 6, tone: 'warm' },
    { p: [-2, -20], h: 6, tone: 'warm' }, { p: [-24, -50] , h: 6, tone: 'cool' },
    { p: [-58, -30], h: 6, tone: 'amber' }, { p: [-58, 2], h: 6, tone: 'amber' },
    { p: [12, -30], h: 6, tone: 'cool' }, { p: [12, 10], h: 6, tone: 'cool' },
    { p: [-24, -60], h: 6, tone: 'cool' }, { p: [10, -56], h: 6, tone: 'cool' },
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
  for (const ev of EVS) makeElevator(ev)
  makeCourtyard()
  makeDeck()
  makeField()
  makeGrounds()

  /* ── 치수 라벨 (평면도용) ─────────────────────────────── */
  dims.push(
    { a: [B.x0, B.z0 - 6.5], b: [B.x1, B.z0 - 6.5], t: '본관 폭 64.0 m' },
    { a: [B.x0 - 6.5, B.z0], b: [B.x0 - 6.5, B.z1], t: '전체 깊이 60.0 m' },
    { a: [COURT.x0, COURT.z0 - 3.0], b: [COURT.x1, COURT.z0 - 3.0], t: 'ㄷ자 안목 40.0' },
    { a: [B.x0 - 10.5, BAND.N.room[0]], b: [B.x0 - 10.5, BAND.N.room[1]], t: '실 깊이 7.2' },
    { a: [COURT.x0, PLAZA.z1 + 2.4], b: [COURT.x0 + 8, PLAZA.z1 + 2.4], t: '베이 8.0' },
    { a: [PLAZA.x0, PLAZA.z0 - 2.0], b: [PLAZA.x0, PLAZA.z1], t: '앞마당 15.0' },
    { a: [COURT.x0 - 3.0, PLAZA.z1], b: [COURT.x0 - 3.0, 21], t: '운동장 52.0' },
    { a: [-40, 17], b: [-8, 17], t: '피치 32.0' },
  )

  const stats = {
    solids: solids.length, visuals: visuals.length, plates: plates.length,
    cyls: cyls.length, fixtures: fixtures.length, rooms: rooms.length, doors: doors.length,
  }
  for (const w of WELLS) wellRail(w, w.open)

  /**
   * 개구부 정리 — 가구가 문 앞뒤를 막으면 그 문은 없는 문이다.
   * 벽면에서 0.28 m 이상 떨어져 문틀 안에 들어온 물건만 걷어낸다.
   * (문짝·유리·삼방틀은 벽면에 붙어 있으므로 남는다)
   */
  {
    const zones = []
    for (const d of doors) {
      if (d.kind === 'elevator') continue
      const cx = d.axis === 'x' ? d.hinge[0] + d.w / 2 : d.fixed
      const cz = d.axis === 'x' ? d.fixed : d.hinge[2] + d.w / 2
      zones.push({ f: d.f, axis: d.axis, fixed: d.fixed, c: d.axis === 'x' ? cx : cz, w: d.w, y: FLOOR_Y[d.f] })
    }
    // 승강기 승강장 앞도 같은 규칙
    for (const EV of EVS) {
      const ecx = mid(EV.x[0], EV.x[1])
      for (const fk of ['B1', 'F1', 'F2', 'F3'].concat(EV.roof ? ['ROOF'] : [])) {
        zones.push({ f: fk, axis: 'x', fixed: EV.z[1], c: ecx, w: 1.3, y: FLOOR_Y[fk] })
      }
    }
    const intrudes = (o, half) => {
      const [px, py, pz] = o.p
      for (const z of zones) {
        if (o.f !== z.f) continue
        if (py - half[1] > z.y + 2.05 || py + half[1] < z.y + 0.02) continue
        const along = z.axis === 'x' ? px : pz
        const alongHalf = z.axis === 'x' ? half[0] : half[2]
        const across = z.axis === 'x' ? pz : px
        const acrossHalf = z.axis === 'x' ? half[2] : half[0]
        if (Math.abs(along - z.c) > z.w / 2 + alongHalf + 0.22) continue
        const gap = Math.abs(across - z.fixed)
        if (gap + acrossHalf < 0.35) continue       // 벽에 납작하게 붙었다 — 문짝·유리·인터폰
        if (gap - acrossHalf > 1.05) continue       // 충분히 물러나 있다
        return true
      }
      return false
    }
    // 가구 크기 — 이보다 크면 벽·슬래브·참 같은 구조물로 본다
    const furniture = (s) => s[1] >= 0.2 && s[1] <= 2.9
    const keepV = visuals.filter((o) => o.e || o.rot || !furniture(o.s) || !intrudes(o, [o.s[0] / 2, o.s[1] / 2, o.s[2] / 2]))
    const keepC = cyls.filter((o) => o.rot || o.h > 2.6 || !intrudes(o, [o.r, o.h / 2, o.r]))
    stats.clearedProps = (visuals.length - keepV.length) + (cyls.length - keepC.length)
    visuals.length = 0; visuals.push(...keepV)
    cyls.length = 0; cyls.push(...keepC)
  }

  /**
   * 슬롯 앵커 검증. 각 슬롯의 실제 표면 좌표를 보존하고 방 중심으로 덮어쓰지 않는다.
   * 정본 프로그램이 고정됐으므로 어긋난 슬롯은 조용히 이동시키지 않고 생성 단계에서 실패한다.
   */
  const byId = {}
  for (const r of rooms) byId[r.id] = r

  // 방 단위 컬링용 — 각 방의 경계와 개구부. 엔진이 층이 아니라 방으로 묶을 수 있다
  const cells = rooms.map((r) => ({
    id: r.id, floor: r.floor, kind: r.kind,
    box: [r.x0, FLOOR_Y[r.floor], r.z0, r.x1, FLOOR_Y[r.floor] + CEIL_H, r.z1],
    links: doors.filter((dd) => {
      if (dd.f !== r.floor) return false
      const dx = dd.axis === 'x' ? dd.hinge[0] + dd.w / 2 : dd.fixed
      const dz = dd.axis === 'x' ? dd.fixed : dd.hinge[2] + dd.w / 2
      return dx > r.x0 - 0.6 && dx < r.x1 + 0.6 && dz > r.z0 - 0.6 && dz < r.z1 + 0.6
    }).map((dd) => dd.id),
  }))
  const anchorSlots = (list) => list.map((s) => {
    if ('surfaceY' in s) {
      const floorY = FLOOR_Y[s.floor]
      if (!Number.isFinite(s.surfaceY) || floorY == null || s.surfaceY < floorY || s.surfaceY > floorY + CEIL_H) {
        throw new Error(`Slot ${s.id} has invalid surfaceY ${s.surfaceY}`)
      }
    }
    if (!s.room) return Object.assign({}, s)
    const r = byId[s.room]
    if (!r) throw new Error(`Slot ${s.id} references missing room ${s.room}`)
    if (s.floor !== r.floor) throw new Error(`Slot ${s.id} floor ${s.floor} does not match ${r.id} floor ${r.floor}`)
    const margin = 0.12
    const inside = s.p[0] >= r.x0 + margin && s.p[0] <= r.x1 - margin && s.p[1] >= r.z0 + margin && s.p[1] <= r.z1 - margin
    if (!inside) throw new Error(`Slot ${s.id} at ${s.p.join(',')} is outside room ${r.id}`)
    return Object.assign({}, s, { roomName: r.name })
  })

  return { solids, visuals, plates, cyls, fixtures, lamps, rooms, doors, dims, stats, devices: DEVICES,
    slots: { props: anchorSlots(PROP_SLOTS), missions: anchorSlots(MISSION_SLOTS), traps: TRAP_SLOTS, gates: GATE_SLOTS }, cells, EV: EVS[0], EVS, SITE, conditions: COND, holes: HOLES, leaks: LEAKS, breachW: BREACH_W, bridges: BRIDGE, spiral: SPIRAL, seed: SEED }
}

/* ─────────────────── 게임플레이 슬롯 · 계약 ─────────────────── */

/**
 * 프롭 슬롯 24 — 실제 표면 위.
 * 북측 윙 z = -54.2 / 서익 x = -52.2 / 동익 x = 4.2 가 실 중심선이다.
 */
export const PROP_SLOTS = [
  { id: 'p_f1_staff_desk', room: 'f1_staff', p: [-36, -54.2], floor: 'F1', surfaceY: 0.78, note: '교무실 책상 서류함' },
  { id: 'p_f1_admin_cab', room: 'f1_admin', p: [-24, -54.2], floor: 'F1', surfaceY: 1.8, note: '행정실 캐비닛 위' },
  { id: 'p_f1_health_bed', room: 'f1_health', p: [-8, -54.2], floor: 'F1', surfaceY: 0.62, note: '보건실 침대 옆' },
  { id: 'p_f1_cafe_tray', room: 'f1_cafeteria', p: [-52.2, -39], floor: 'F1', surfaceY: 0.73, note: '급식실 배식대' },
  { id: 'p_f1_kitchen_rack', room: 'f1_kitchen', p: [-52.2, -29], floor: 'F1', surfaceY: 0.92, note: '조리대 상단' },
  { id: 'p_f1_council_box', room: 'f1_council', p: [4.2, -22], floor: 'F1', surfaceY: 0.75, note: '학생회실 의견함' },
  { id: 'p_f1_lobby_shoe', room: 'f1_core_se_b', p: [3.6, -1.8], floor: 'F1', surfaceY: 1.8, note: '중앙 현관 신발장 위' },
  { id: 'p_f1_counsel_sofa', room: 'f1_counsel', p: [4.2, -42], floor: 'F1', surfaceY: 0.44, note: '상담실 소파 쿠션 밑' },
  { id: 'p_f2_c22_locker', room: 'f2_c22', p: [-32, -54.2], floor: 'F2', surfaceY: 5.4, note: '2-2 사물함 위' },
  { id: 'p_f2_c24_podium', room: 'f2_c24', p: [-16, -54.2], floor: 'F2', surfaceY: 4.55, note: '2-4 교탁 서랍' },
  { id: 'p_f2_sci_hood', room: 'f2_science', p: [4.2, -42], floor: 'F2', surfaceY: 4.5, note: '흄후드 안' },
  { id: 'p_f2_prep_shelf', room: 'f2_sciprep', p: [4.2, -34], floor: 'F2', surfaceY: 5.0, note: '과학준비실 선반' },
  { id: 'p_f2_lib_table', room: 'f2_library', p: [-52.2, -38], floor: 'F2', surfaceY: 4.34, note: '도서실 열람 테이블' },
  { id: 'p_f2_lib_shelf', room: 'f2_library', p: [-52.2, -33], floor: 'F2', surfaceY: 5.1, note: '서가 3단' },
  { id: 'p_f2_music_piano', room: 'f2_music', p: [-52.2, -26], floor: 'F2', surfaceY: 4.72, note: '피아노 위' },
  { id: 'p_f2_comp_desk', room: 'f2_computer', p: [4.2, -26], floor: 'F2', surfaceY: 4.35, note: '컴퓨터실 본체 뒤' },
  { id: 'p_f3_c31_desk', room: 'f3_c31', p: [-40, -54.2], floor: 'F3', surfaceY: 7.95, note: '3-1 뒷자리 책상' },
  { id: 'p_f3_c33_locker', room: 'f3_c33', p: [-24, -54.2], floor: 'F3', surfaceY: 9.0, note: '3-3 사물함 위' },
  { id: 'p_f3_bc_console', room: 'f3_broadcast', p: [4.2, -42], floor: 'F3', surfaceY: 7.95, note: '방송 콘솔 뒤' },
  { id: 'p_f3_dance_mat', room: 'f3_dance', p: [-52.2, -38], floor: 'F3', surfaceY: 7.45, note: '무용실 매트 아래' },
  { id: 'p_f3_earth_bench', room: 'f3_earth', p: [4.2, -18], floor: 'F3', surfaceY: 8.05, note: '지구과학실 실험대' },
  { id: 'p_b1_shelf', room: 'b1_foodstore', p: [-12, -54], floor: 'B1', surfaceY: -2.55, note: '급식창고 선반' },
  { id: 'p_out_podium', p: [-42, -5], floor: 'OUT', surfaceY: 1.2, note: '조회대 위' },
  { id: 'p_out_deck', room: 'f3_deck', p: [-24, -27.6], floor: 'F3', surfaceY: 7.22, note: '전망 데크 난간 밑' },
]

/** 미션지 슬롯 10 — 한 판 3개 활성. doc 필드는 room-mission-design.md 후보 번호 */
export const MISSION_SLOTS = [
  { id: 'm_f1_kitchen', name: '배전반 퓨즈 복구', tags: ['solo'], room: 'f1_kitchen', p: [-52.2, -29], floor: 'F1', hintZone: '1층 서익 조리실' },
  { id: 'm_f1_admin', name: '캐비닛 암호', tags: ['solo'], room: 'f1_admin', p: [-24, -54.2], floor: 'F1', hintZone: '1층 북측 행정실' },
  { id: 'm_f1_security', name: 'CCTV 음성 관제', tags: ['coop', 'voice'], room: 'f1_security', p: [4.2, -14], floor: 'F1', hintZone: '1층 동익 경비·방재실', doc: 'M16' },
  { id: 'm_f2_interphone', name: '교실 인터폰 릴레이', tags: ['coop', 'voice'], room: 'f2_c23', p: [-24, -54.2], floor: 'F2', hintZone: '2층 북측 교실 · 송수신 2실', doc: 'M06' },
  { id: 'm_f2_science', name: '약품 배열 순서', tags: ['solo'], room: 'f2_science', p: [4.2, -42], floor: 'F2', hintZone: '과학실' },
  { id: 'm_f2_library', name: '청구기호 정렬', tags: ['coop'], room: 'f2_library', p: [-52.2, -38], floor: 'F2', hintZone: '도서실' },
  { id: 'm_f3_broadcast', name: '방송실 비밀번호', tags: ['solo', 'voice'], room: 'f3_broadcast', p: [4.2, -42], floor: 'F3', hintZone: '3층 동익 방송실', doc: 'M01' },
  { id: 'm_f3_dance', name: '동시 스위치', tags: ['coop'], room: 'f3_dance', p: [-52.2, -38], floor: 'F3', hintZone: '무용실' },
  { id: 'm_f3_deck', name: '피뢰 계측기 보정', tags: ['coop'], p: [-24, -27.6], floor: 'F3', hintZone: '3층 남향 전망 데크' },
  { id: 'm_b1_mach', name: '급수 밸브 압력', tags: ['coop'], room: 'b1_mach', p: [-39, -54], floor: 'B1', hintZone: '지하 기계실' },
]

/**
 * 트랩 슬롯 10 — 한 판 4~5개. 후보를 줄이고 각각에 성격을 붙였다.
 * 복도 중심선: 북 z = -48.3 / 서 x = -46.3 / 동 x = -1.7
 */
export const TRAP_SLOTS = [
  { id: 't_f1_cor_n', p: [-30, -48.3], floor: 'F1', kind: 'gap', risk: 2 },
  { id: 't_f1_kitchen', p: [-52.2, -29], floor: 'F1', kind: 'noise', risk: 3, note: '조리대 스테인리스 — 밟으면 두 층 위까지 울린다' },
  { id: 't_f1_tail_w', p: [-46.3, -8], floor: 'F1', kind: 'deadend', risk: 3, note: '서익 남단 — 계단실 문이 유일한 출구' },
  { id: 't_f2_bridge_w', p: [-40, -34], floor: 'F2', kind: 'shortcut', risk: 3, note: '브릿지 서단 — 건너면 빠르지만 3층 복도 전체에 노출' },
  { id: 't_f2_bridge_e', p: [-8, -34], floor: 'F2', kind: 'shortcut', risk: 3, note: '브릿지 동단 — 같은 대가' },
  { id: 't_f2_lib', p: [-52.2, -38], floor: 'F2', kind: 'noise', risk: 2, note: '도서실 서가 — 밀면 넘어지고 소리가 길다' },
  { id: 't_f3_deck', p: [-24, -27.6], floor: 'F3', kind: 'deadend', risk: 4, note: '전망 데크 — 되돌아 나오는 길뿐. 대신 운동장이 다 보인다' },
  { id: 't_f3_cor_w', p: [-46.3, -20], floor: 'F3', kind: 'gap', risk: 2, note: '방화문 구간 — 닫으면 시야가 끊긴다' },
  { id: 't_spiral', p: [-24, -34], floor: 'OUT', kind: 'vertical', risk: 3, note: '원형 계단 — 세 층이 한 점에서 만난다' },
  { id: 't_b1_tunnel', p: [-2, -30], floor: 'B1', kind: 'vertical', risk: 4, note: '설비 터널 — 폭 1.8 m, 느리지만 시야에서 완전히 사라진다' },
  { id: 't_roof_hatch', p: [4.2, -54.2], floor: 'ROOF', kind: 'vertical', risk: 3, note: '옥탑 승강장 — 승강기가 유일한 빠른 하강' },
]

/** 탈출 게이트 4 — 한 판 1개 */
export const GATE_SLOTS = [
  { id: 'g_main', name: '정문', p: [-24, 38], rotY: 0, floor: 'OUT' },
  { id: 'g_back', name: '후문 골목', p: [-58, -56], rotY: 0, floor: 'OUT' },
  { id: 'g_west', name: '서익 남단 비상구', p: [-52.2, 2.2], rotY: 0, floor: 'OUT' },
  { id: 'g_east', name: '동익 남단 비상구', p: [4.2, 2.2], rotY: 0, floor: 'OUT' },
  // 위로 가는 탈출구 — 미션을 끝낸 뒤 옥상으로 올라갈 이유를 만든다
  { id: 'g_roof', name: '옥상 헬리포트', p: [-24, -40], rotY: 0, floor: 'ROOF', note: '외부 비상계단으로도 닿는다' },
]

/**
 * 델타 슬롯 — 같은 좌표가 '정상'과 '이상' 두 상태를 갖는다.
 * 새 좌표를 만들지 않으므로 델타를 30종으로 늘려도 맵 제작비는 0에 수렴한다.
 */
export const DELTA_SLOTS = [
  { id: 'd_cor_dark', name: '북측 복도 소등 구간', anchor: 'f2_cor_n', p: [-30, -48.3], floor: 'F2', kind: 'light', normal: '북측 복도 형광등 점등', altered: '한 구간만 소등, 앞뒤는 켜진 채', trigger: '미션 1개 완료' },
  { id: 'd_cor_flick', name: '서익 복도 점멸', anchor: 'f1_cor_w', p: [-46.3, -30], floor: 'F1', kind: 'light', normal: '서익 복도 정상 점등', altered: '4 Hz 점멸', trigger: '미션 2개 완료' },
  { id: 'd_music_piano', name: '피아노 단음 반복', anchor: 'p_f2_music_piano', p: [-52.2, -26], floor: 'F2', kind: 'sound', normal: '무음', altered: '피아노 단음 반복', trigger: '술래 근접' },
  { id: 'd_bc_console', name: '방송 콘솔 적색', anchor: 'p_f3_bc_console', p: [4.2, -42], floor: 'F3', kind: 'prop', normal: '콘솔 대기 LED', altered: '전 채널 붉게 점등', trigger: '광분 예고' },
  { id: 'd_deck_rail', name: '전망 데크 난간등', anchor: 'f3_deck', p: [-24, -27.6], floor: 'F3', kind: 'light', normal: '난간등 상시 점등', altered: '데크만 소등 — 운동장에서 안 보인다', trigger: '시드' },
  { id: 'd_field_light', name: '운동장 조명탑', anchor: 'field', p: [-24, -5], floor: 'OUT', kind: 'light', normal: '조명탑 4기 점등', altered: '1기만 점등, 그림자가 길어진다', trigger: '미션 3개 완료' },
  { id: 'd_health_bed', name: '보건실 커튼', anchor: 'p_f1_health_bed', p: [-8, -54.2], floor: 'F1', kind: 'prop', normal: '커튼 열림', altered: '커튼 닫힘 + 실루엣', trigger: '시드' },
  { id: 'd_ev_call', name: '승강기 자동 호출', anchor: 'evp', p: [2.4, -54.2], floor: 'F1', kind: 'prop', normal: '정지 중', altered: '부르지 않았는데 문이 열린다', trigger: '광분' },
  { id: 'd_spiral_creak', name: '원형 계단 삐걱임', anchor: 'court_spiral', p: [-24, -34], floor: 'OUT', kind: 'sound', normal: '무음', altered: '위층에서 내려오는 발소리', trigger: '술래 2층 진입' },
]

/**
 * 정보 채널 — 플레이어가 상황을 읽는 통로.
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
  human: { p: [-24, 24], floor: 'OUT', note: '정문 안쪽 진입로 — 운동장을 건너야 건물에 닿는다' },
  partners: [
    { p: [-30, 20], floor: 'OUT' }, { p: [-18, 20], floor: 'OUT' }, { p: [-24, 16], floor: 'OUT' },
  ],
  tagger: { p: [-24, -48.3], floor: 'F1', note: '북측 복도 중앙 — 양 날개까지 거리가 같다' },
}

/** 술래 순찰 노드 — U자 복도 + 수직 동선 + 앞마당 */
export const PATROL = [
  { p: [-46.3, -48.3], floor: 'F1' }, { p: [-24, -48.3], floor: 'F1' }, { p: [-1.7, -48.3], floor: 'F1' },
  { p: [-46.3, -30], floor: 'F1' }, { p: [-46.3, -10], floor: 'F1' },
  { p: [-1.7, -30], floor: 'F1' }, { p: [-1.7, -10], floor: 'F1' }, { p: [4.2, -1.8], floor: 'F1' },
  { p: [-24, -38], floor: 'OUT' }, { p: [-24, -5], floor: 'OUT' }, { p: [-42, 10], floor: 'OUT' },
  { p: [-46.3, -48.3], floor: 'F2' }, { p: [-24, -48.3], floor: 'F2' }, { p: [-1.7, -48.3], floor: 'F2' },
  { p: [-24, -34], floor: 'F2' }, { p: [-46.3, -20], floor: 'F2' }, { p: [-1.7, -20], floor: 'F2' },
  { p: [-24, -48.3], floor: 'F3' }, { p: [-24, -30], floor: 'F3' },
  { p: [-46.3, -30], floor: 'F3' }, { p: [-1.7, -30], floor: 'F3' },
  { p: [-30, -52], floor: 'B1' }, { p: [-2, -30], floor: 'B1' },
  { p: [-24, -52], floor: 'ROOF' },
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
        F2: '앞마당 가로 브릿지 (W↔E, 폭 3.0 m) — 2층 유일한 고리',
        F3: '남향 전망 데크 (N→남, 폭 3.0 m) — 막다른 스텁, 출구는 원형 계단뿐',
        spiral: '교차점 원형 계단 — 앞마당 바닥 ↔ 2층 ↔ 3층',
      },
      holes: built.holes,
      breachWidth: built.breachW,
      leaks: built.leaks,
      devices: built.devices,
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
