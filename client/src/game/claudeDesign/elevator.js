/**
 * 승강기 실사 리그 — 승강로 · 승강장 · 카
 *
 * 학교 맵의 승강기는 원래 박스 몇 개로 근사돼 있었다. 이 모듈은 별도로 만들었던
 * 승강기 상세 뷰어의 물성과 부재를 그대로 옮겨온다. 헤어라인 스테인리스, 삼방틀,
 * 실 홈 2줄, 도어 행거, 홀 랜턴, 점자 표지, 정기검사 필증, 균형추, 완충기까지.
 *
 * 좌표는 월드 그대로 쓴다. 모든 승강기는 +z 방향으로 열린다.
 */

const cv = (T, w, h, draw) => {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  t.anisotropy = 8
  return t
}

export function elevatorMaterials(T) {
  // 헤어라인 스테인리스 — 세로 결
  const hair = cv(T, 512, 512, (x, w, h) => {
    x.fillStyle = '#b9bfc4'; x.fillRect(0, 0, w, h)
    for (let i = 0; i < 2600; i++) {
      const px = Math.random() * w, len = 40 + Math.random() * 260
      x.strokeStyle = 'rgba(' + (Math.random() > 0.5 ? '255,255,255' : '90,98,105') + ',' + (0.03 + Math.random() * 0.07) + ')'
      x.lineWidth = 0.5 + Math.random()
      x.beginPath(); x.moveTo(px, Math.random() * h); x.lineTo(px, Math.random() * h + len); x.stroke()
    }
  })
  hair.wrapS = hair.wrapT = T.RepeatWrapping

  // 카 바닥 고무 — 원형 스터드
  const rub = cv(T, 512, 512, (x, w, h) => {
    x.fillStyle = '#3a4046'; x.fillRect(0, 0, w, h)
    for (let i = 0; i < 1800; i++) {
      x.fillStyle = 'rgba(0,0,0,' + Math.random() * 0.25 + ')'
      x.fillRect(Math.random() * w, Math.random() * h, 2, 2)
    }
    const s = 42
    for (let gy = 0; gy < h / s; gy++) for (let gx = 0; gx < w / s; gx++) {
      const cx = gx * s + s / 2 + (gy % 2 ? s / 2 : 0), cy = gy * s + s / 2
      const gr = x.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, 13)
      gr.addColorStop(0, '#5b636a'); gr.addColorStop(0.72, '#464d53'); gr.addColorStop(1, '#333940')
      x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, 13, 0, 6.283); x.fill()
    }
  })
  rub.wrapS = rub.wrapT = T.RepeatWrapping; rub.repeat.set(2.6, 2.4)

  // 승강로 도장 콘크리트
  const conc = cv(T, 512, 512, (x, w, h) => {
    x.fillStyle = '#6a6f73'; x.fillRect(0, 0, w, h)
    for (let i = 0; i < 9000; i++) {
      x.fillStyle = 'rgba(' + (Math.random() > 0.5 ? '40,42,44' : '150,152,154') + ',' + Math.random() * 0.16 + ')'
      x.beginPath(); x.arc(Math.random() * w, Math.random() * h, Math.random() * 5, 0, 6.283); x.fill()
    }
    x.strokeStyle = 'rgba(30,32,34,.35)'; x.lineWidth = 2
    for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(0, i * 128); x.lineTo(w, i * 128); x.stroke() }
  })
  conc.wrapS = conc.wrapT = T.RepeatWrapping; conc.repeat.set(3, 6)

  const M = (o) => new T.MeshStandardMaterial(o)
  return {
    hair: M({ map: hair, color: '#b3bcc2', roughness: 0.36, metalness: 0.58, envMapIntensity: 1.25 }),
    hairDark: M({ map: hair, color: '#8b9298', roughness: 0.42, metalness: 0.52, envMapIntensity: 1.1 }),
    frame: M({ map: hair, color: '#aeb5bb', roughness: 0.32, metalness: 0.66, envMapIntensity: 1.3 }),
    bronze: M({ map: hair, color: '#9d7a4e', roughness: 0.36, metalness: 0.6, envMapIntensity: 1.2 }),
    sill: M({ color: '#9aa0a4', roughness: 0.42, metalness: 0.75 }),
    rubber: M({ map: rub, color: '#cfd4d8', roughness: 0.88, metalness: 0.02 }),
    conc: M({ color: '#8d9298', map: conc, roughness: 0.94, metalness: 0.02 }),
    steel: M({ color: '#6e767d', roughness: 0.46, metalness: 0.72 }),
    steelDk: M({ color: '#3f464c', roughness: 0.6, metalness: 0.5 }),
    rail: M({ color: '#9ba3aa', roughness: 0.24, metalness: 0.95 }),
    rope: M({ color: '#5d6469', roughness: 0.5, metalness: 0.8 }),
    cwt: M({ color: '#4b5257', roughness: 0.68, metalness: 0.4 }),
    mirror: M({ color: '#c9d3d9', roughness: 0.11, metalness: 0.55, envMapIntensity: 1.6 }),
    plastic: M({ color: '#cfd4d7', roughness: 0.5, metalness: 0.05 }),
    black: M({ color: '#14191d', roughness: 0.55, metalness: 0.2 }),
    rubberEdge: M({ color: '#22262a', roughness: 0.92, metalness: 0.03 }),
    pad: M({ color: '#4c5a48', roughness: 0.9, metalness: 0.04 }),
  }
}

/**
 * @param o.EV      { id, name, x:[x0,x1], z:[z0,z1], roof }
 * @param o.mat     elevatorMaterials() 결과
 * @param o.FY      층 → y
 * @param o.order   승강장이 있는 층 목록
 * @param o.label   층 → 표시 문자
 * @param o.onFloor (floorKey, object3d) 층별 가시성 등록
 * @param o.onSolid (mesh) 충돌 등록
 * @param o.picks   레이캐스트 대상 배열
 */
export function buildElevatorRig(T, o) {
  const { EV, mat, FY, order, label, onFloor, onSolid, picks } = o
  const x0 = EV.x[0], x1 = EV.x[1], z0 = EV.z[0], z1 = EV.z[1]
  const ecx = (x0 + x1) / 2, ecz = (z0 + z1) / 2
  const SH_W = x1 - x0, SH_D = z1 - z0
  const LAND_Z = z1
  const DOOR_W = EV.roof ? 1.0 : 1.15
  const DOOR_H = EV.roof ? 2.1 : 2.2
  const PANEL_W = DOOR_W / 2 + 0.03
  const CAR_W = Math.min(SH_W - 0.42, 2.0), CAR_D = Math.min(SH_D - 0.95, 1.95), CAR_H = 2.34
  const PIT_Y = FY[order[0]] - 1.4
  const TOP_Y = FY[order[order.length - 1]] + (EV.roof ? 6.2 : 3.6)
  const skin = EV.roof ? mat.hair : mat.hairDark
  const frameMat = EV.roof ? mat.frame : mat.bronze

  const root = new T.Group()
  const box = (g, w, h, d, x, y, z, m, opt) => {
    const me = new T.Mesh(new T.BoxGeometry(w, h, d), m)
    me.position.set(x, y, z)
    me.castShadow = !(opt && opt.noShadow); me.receiveShadow = true
    if (opt && opt.rx) me.rotation.x = opt.rx
    if (opt && opt.ry) me.rotation.y = opt.ry
    if (opt && opt.rz) me.rotation.z = opt.rz
    g.add(me); return me
  }
  const cyl = (g, r1, r2, h, x, y, z, m, seg) => {
    const me = new T.Mesh(new T.CylinderGeometry(r1, r2, h, seg || 16), m)
    me.position.set(x, y, z); me.castShadow = false; me.receiveShadow = true
    g.add(me); return me
  }
  const plate = (g, w, h, x, y, z, draw, opt) => {
    const t = cv(T, Math.round(w * 460), Math.round(h * 460), draw)
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({
      map: t, roughness: (opt && opt.rough) ?? 0.44, metalness: (opt && opt.metal) ?? 0.08,
      emissive: (opt && opt.emis) ? new T.Color(opt.emis) : new T.Color('#000000'),
      emissiveMap: (opt && opt.emis) ? t : null, emissiveIntensity: (opt && opt.ei) ?? 0,
      transparent: !!(opt && opt.alpha),
    }))
    m.position.set(x, y, z)
    if (opt && opt.ry) m.rotation.y = opt.ry
    if (opt && opt.rx) m.rotation.x = opt.rx
    g.add(m); return m
  }

  /* ══════════ 승강로 내부 ══════════ */
  const shaft = new T.Group(); root.add(shaft)
  const H = TOP_Y - PIT_Y, cy = (TOP_Y + PIT_Y) / 2
  // 피트 바닥 + 배면 콘크리트 (건물 벽은 campus.js가 세운다. 여기서는 마감만)
  box(shaft, SH_W, 0.24, SH_D, ecx, PIT_Y - 0.12, ecz, mat.conc, { noShadow: true })
  box(shaft, SH_W, H, 0.04, ecx, cy, z0 + 0.03, mat.conc, { noShadow: true })

  // 가이드 레일 2줄 + 브래킷
  for (const sx of [x0 + 0.22, x1 - 0.22]) {
    box(shaft, 0.05, H - 0.4, 0.13, sx, cy, ecz - 0.1, mat.rail, { noShadow: true })
    for (let y = PIT_Y + 0.8; y < TOP_Y; y += 1.8) box(shaft, 0.14, 0.1, 0.24, sx + (sx < ecx ? -0.06 : 0.06), y, ecz - 0.1, mat.steelDk, { noShadow: true })
  }

  // 균형추 — 프레임 + 웨이트 블록 9장
  const cwt = new T.Group(); shaft.add(cwt)
  const cwW = Math.min(1.3, SH_W - 0.5)
  box(cwt, cwW, 0.09, 0.3, 0, 0.05, 0, mat.steelDk, { noShadow: true })
  box(cwt, cwW, 0.09, 0.3, 0, 1.62, 0, mat.steelDk, { noShadow: true })
  for (const sx of [-cwW / 2 + 0.05, cwW / 2 - 0.05]) box(cwt, 0.09, 1.6, 0.3, sx, 0.83, 0, mat.steelDk, { noShadow: true })
  for (let i = 0; i < 9; i++) box(cwt, cwW - 0.16, 0.14, 0.24, 0, 0.19 + i * 0.16, 0, mat.cwt, { noShadow: true })
  cwt.position.set(ecx, FY[order[order.length - 1]] - 0.4, z0 + 0.2)

  // 로프 4가닥
  for (let i = 0; i < 4; i++) {
    cyl(shaft, 0.008, 0.008, H - 1.0, ecx - 0.18 + i * 0.12, cy, z0 + 0.16, mat.rope, 6)
  }

  // 피트 — 완충기 2 + 균형추 완충기 + 조속기 도르래 + 사다리
  for (const bx of [ecx - 0.5, ecx + 0.5]) {
    cyl(shaft, 0.11, 0.13, 0.5, bx, PIT_Y + 0.25, ecz, mat.steelDk, 14)
    cyl(shaft, 0.075, 0.075, 0.34, bx, PIT_Y + 0.62, ecz, mat.steel, 12)
    box(shaft, 0.32, 0.05, 0.32, bx, PIT_Y + 0.02, ecz, mat.steelDk, { noShadow: true })
  }
  cyl(shaft, 0.1, 0.12, 0.44, ecx, PIT_Y + 0.22, z0 + 0.2, mat.steelDk, 14)
  for (const lx of [x1 - 0.3, x1 - 0.64]) cyl(shaft, 0.022, 0.022, 1.5, lx, PIT_Y + 0.75, z1 - 0.16, mat.steel, 8)
  for (let i = 0; i < 5; i++) {
    const r = cyl(shaft, 0.018, 0.018, 0.34, x1 - 0.47, PIT_Y + 0.28 + i * 0.3, z1 - 0.16, mat.steel, 8)
    r.rotation.z = Math.PI / 2
  }

  // 층별 착상 베인 · 리미트 스위치 · 승강로 등
  for (const f of order) {
    box(shaft, 0.03, 0.42, 0.09, x0 + 0.24, FY[f] + 1.3, ecz - 0.24, mat.steelDk, { noShadow: true })
    box(shaft, 0.1, 0.14, 0.08, x0 + 0.32, FY[f] + 1.3, ecz - 0.24, mat.steel, { noShadow: true })
    box(shaft, 0.09, 0.18, 0.09, x1 - 0.16, FY[f] + 2.55, z0 + 0.12,
      new T.MeshStandardMaterial({ color: '#3a4046', emissive: '#ffd9a0', emissiveIntensity: 0.28 }), { noShadow: true })
  }
  box(shaft, 0.26, 0.34, 0.14, x1 - 0.22, FY[order[1]] + 3.0, z0 + 0.26, mat.steelDk, { noShadow: true })

  /* ══════════ 승강장 ══════════ */
  const landing = {}, hallInd = {}, hallLantern = {}, hallBtns = {}, hallLights = []
  const indPlate = (parent, w, h, x, y, z) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 80
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({
      map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 1.7, roughness: 0.3, metalness: 0,
    }))
    m.position.set(x, y, z); parent.add(m)
    m.userData.paint = (lab, dir) => {
      const g = c.getContext('2d')
      g.fillStyle = '#0a0d10'; g.fillRect(0, 0, 256, 80)
      g.textAlign = 'center'; g.textBaseline = 'middle'
      if (dir) { g.fillStyle = '#ff8a2e'; g.font = 'bold 40px "JetBrains Mono",monospace'; g.fillText(dir > 0 ? '▲' : '▼', 62, 42) }
      g.fillStyle = '#ffb45c'; g.font = 'bold 52px "JetBrains Mono",monospace'
      g.fillText(lab, 152, 42)
      tex.needsUpdate = true
    }
    m.userData.paint(label[order[1]] || '1', 0)
    return m
  }

  for (const f of order) {
    const y = FY[f]
    const fg = new T.Group(); root.add(fg)
    onFloor?.(f, fg)

    // 삼방틀 — 좌·우 선틀 + 상틀
    for (const sd of [-1, 1]) box(fg, 0.18, DOOR_H + 0.18, 0.22, ecx + sd * (DOOR_W / 2 + 0.09), y + (DOOR_H + 0.18) / 2, LAND_Z + 0.11, frameMat)
    box(fg, DOOR_W + 0.36, 0.18, 0.22, ecx, y + DOOR_H + 0.09, LAND_Z + 0.11, frameMat)
    // 개구부 상부·양옆 벽 마감 — 승강로가 들여다보이지 않게
    const headH = 3.0 - DOOR_H - 0.18
    if (headH > 0.02) onSolid?.(box(fg, DOOR_W + 0.36, headH, 0.16, ecx, y + DOOR_H + 0.18 + headH / 2, LAND_Z + 0.08, mat.plastic))
    const flank = SH_W / 2 - (DOOR_W / 2 + 0.18)
    if (flank > 0.02) for (const sd of [-1, 1]) {
      onSolid?.(box(fg, flank, 3.0, 0.16, ecx + sd * (DOOR_W / 2 + 0.18 + flank / 2), y + 1.5, LAND_Z + 0.08, mat.plastic))
    }

    // 실 — 2줄 홈
    box(fg, DOOR_W + 0.2, 0.05, 0.16, ecx, y + 0.025, LAND_Z - 0.02, mat.sill, { noShadow: true })
    for (const gz of [LAND_Z - 0.055, LAND_Z + 0.015]) box(fg, DOOR_W + 0.16, 0.03, 0.022, ecx, y + 0.04, gz, mat.black, { noShadow: true })

    // 승강장 문 2짝 — 중앙개폐
    landing[f] = [-1, 1].map((sd) => {
      const p = box(fg, PANEL_W, DOOR_H, 0.045, ecx + sd * PANEL_W / 2, y + DOOR_H / 2, LAND_Z - 0.03, skin)
      p.userData.home = ecx + sd * PANEL_W / 2
      p.userData.sd = sd
      p.userData.act = { kind: 'evcall', floor: f }
      box(p, PANEL_W - 0.02, 0.16, 0.008, 0, -DOOR_H / 2 + 0.09, 0.028, mat.hairDark, { noShadow: true })
      onSolid?.(p)
      picks?.push(p)
      return p
    })

    // 도어 행거 케이스 + 롤러
    box(fg, DOOR_W + 0.5, 0.16, 0.1, ecx, y + DOOR_H + 0.14, LAND_Z - 0.12, mat.steelDk, { noShadow: true })
    for (const sd of [-1, 1]) {
      const r = cyl(fg, 0.045, 0.045, 0.02, ecx + sd * 0.24, y + DOOR_H + 0.14, LAND_Z - 0.06, mat.steel, 12)
      r.rotation.x = Math.PI / 2
    }

    // 층 인디케이터
    box(fg, 0.66, 0.24, 0.04, ecx, y + DOOR_H + 0.34, LAND_Z + 0.21, mat.black, { noShadow: true })
    hallInd[f] = indPlate(fg, 0.58, 0.18, ecx, y + DOOR_H + 0.34, LAND_Z + 0.235)

    // 홀 랜턴 ▲▼
    const lan = {}
    for (const [k, dy, ch] of [['up', 1.94, '▲'], ['dn', 1.72, '▼']]) {
      lan[k] = plate(fg, 0.13, 0.13, ecx + DOOR_W / 2 + 0.3, y + dy, LAND_Z + 0.21, (x, w, h) => {
        x.fillStyle = '#16191c'; x.fillRect(0, 0, w, h)
        x.fillStyle = '#2c3237'; x.font = 'bold ' + h * 0.7 + 'px sans-serif'
        x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, w / 2, h * 0.54)
      }, { emis: '#ffffff', ei: 0 })
    }
    hallLantern[f] = lan

    // 호출 버튼 패널 + 점자
    box(fg, 0.2, 0.44, 0.03, ecx - DOOR_W / 2 - 0.34, y + 1.15, LAND_Z + 0.21, mat.plastic, { noShadow: true })
    const hb = {}
    for (const [k, dy] of [['up', 1.26], ['dn', 1.04]]) {
      const b = cyl(fg, 0.038, 0.038, 0.018, ecx - DOOR_W / 2 - 0.34, y + dy, LAND_Z + 0.228,
        new T.MeshStandardMaterial({ color: '#39424a', emissive: '#ffbe72', emissiveIntensity: 0, roughness: 0.4 }), 20)
      b.rotation.x = Math.PI / 2
      b.userData.act = { kind: 'evcall', floor: f }
      picks?.push(b)
      hb[k] = b
    }
    hallBtns[f] = hb
    plate(fg, 0.05, 0.09, ecx - DOOR_W / 2 - 0.245, y + 1.15, LAND_Z + 0.222, (x, w, h) => {
      x.fillStyle = '#9aa0a5'; x.fillRect(0, 0, w, h)
      x.fillStyle = '#4a5057'
      for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(w * (0.32 + (i % 2) * 0.36), h * (0.24 + Math.floor(i / 2) * 0.26), w * 0.08, 0, 6.283); x.fill() }
    })

    // 층수 표지
    plate(fg, 0.2, 0.26, ecx + DOOR_W / 2 + 0.3, y + 1.3, LAND_Z + 0.21, (x, w, h) => {
      x.fillStyle = '#e8e4d9'; x.fillRect(0, 0, w, h)
      x.strokeStyle = '#5b6169'; x.lineWidth = 3; x.strokeRect(4, 4, w - 8, h - 8)
      x.fillStyle = '#22282e'; x.font = 'bold ' + h * 0.46 + 'px "Noto Sans KR",sans-serif'
      x.textAlign = 'center'; x.fillText(label[f], w / 2, h * 0.52)
      x.font = h * 0.13 + 'px "Noto Sans KR",sans-serif'; x.fillStyle = '#6a717a'
      x.fillText('FLOOR', w / 2, h * 0.76)
    })

    // 1층에만 정기검사 필증
    if (f === 'F1') {
      plate(fg, 0.17, 0.22, ecx - DOOR_W / 2 - 0.62, y + 1.5, LAND_Z + 0.212, (x, w, h) => {
        x.fillStyle = '#f2efe6'; x.fillRect(0, 0, w, h)
        x.strokeStyle = '#2f7a4a'; x.lineWidth = 5; x.strokeRect(3, 3, w - 6, h - 6)
        x.fillStyle = '#2f7a4a'; x.fillRect(3, 3, w - 6, h * 0.2)
        x.fillStyle = '#fff'; x.font = 'bold ' + h * 0.11 + 'px "Noto Sans KR",sans-serif'
        x.textAlign = 'center'; x.fillText('정기검사 합격증', w / 2, h * 0.15)
        x.fillStyle = '#33383e'; x.font = h * 0.09 + 'px "Noto Sans KR",sans-serif'
        x.fillText('한국승강기안전공단', w / 2, h * 0.34)
        x.font = 'bold ' + h * 0.2 + 'px "JetBrains Mono",monospace'
        x.fillText('2026.11', w / 2, h * 0.58)
        x.font = h * 0.08 + 'px "Noto Sans KR",sans-serif'; x.fillStyle = '#6c727a'
        x.fillText(EV.roof ? '용도 승객용 · 13인승 900kg' : '용도 화물용 · 1150kg', w / 2, h * 0.78)
      })
    }

    // 승강장 다운라이트
    const hl = new T.PointLight('#ffe3bb', 0.75, 6, 2)
    hl.position.set(ecx, y + 2.7, LAND_Z + 1.7); hl.userData.base = 0.75
    fg.add(hl); hallLights.push(hl)
    box(fg, 0.34, 0.03, 0.34, ecx, y + 2.92, LAND_Z + 1.7,
      new T.MeshStandardMaterial({ color: '#e6e2d6', emissive: '#ffe9c8', emissiveIntensity: 1.2 }), { noShadow: true })

    // 노후 — 문짝 스크래치
    const w1 = plate(fg, DOOR_W * 0.9, 0.5, ecx, y + 0.7, LAND_Z - 0.055, (x, w, h) => {
      x.clearRect(0, 0, w, h)
      for (let i = 0; i < 60; i++) {
        x.strokeStyle = 'rgba(70,74,78,' + (0.06 + Math.random() * 0.14) + ')'
        x.lineWidth = 0.6 + Math.random() * 1.4
        const sx = Math.random() * w, sy = Math.random() * h
        x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + (Math.random() - 0.5) * 90, sy + (Math.random() - 0.5) * 14); x.stroke()
      }
    }, { alpha: true })
    w1.material.metalness = 0
  }

  /* ══════════ 카 ══════════ */
  const car = new T.Group(); root.add(car)
  const hw = CAR_W / 2, hd = CAR_D / 2
  const carLights = [], carLightPanes = [], copBtns = {}

  // 카 프레임
  for (const dy of [-0.12, CAR_H + 0.14]) box(car, CAR_W + 0.3, 0.16, 0.24, ecx, dy, ecz, mat.steelDk, { noShadow: true })
  for (const sx of [-hw - 0.1, hw + 0.1]) box(car, 0.1, CAR_H + 0.3, 0.2, ecx + sx, CAR_H / 2, ecz, mat.steelDk, { noShadow: true })
  box(car, 0.5, 0.2, 0.3, ecx, CAR_H + 0.3, ecz, mat.steelDk, { noShadow: true })
  for (const sx of [-hw - 0.1, hw + 0.1]) for (const dy of [0.02, CAR_H + 0.24]) box(car, 0.15, 0.18, 0.18, ecx + sx, dy, ecz, mat.steel, { noShadow: true })
  for (const sx of [-0.5, 0.5]) cyl(car, 0.07, 0.07, 0.09, ecx + sx, -0.06, ecz, mat.rubberEdge, 12)

  // 바닥 · 걸레받이
  box(car, CAR_W, 0.08, CAR_D, ecx, 0.04, ecz, mat.rubber)
  box(car, CAR_W, 0.09, 0.03, ecx, 0.125, ecz - hd + 0.015, mat.hairDark, { noShadow: true })
  for (const sx of [-hw + 0.015, hw - 0.015]) box(car, 0.03, 0.09, CAR_D, ecx + sx, 0.125, ecz, mat.hairDark, { noShadow: true })

  // 벽 3면 + 조인트
  box(car, CAR_W, CAR_H, 0.04, ecx, CAR_H / 2, ecz - hd + 0.02, skin)
  for (const sx of [-hw + 0.02, hw - 0.02]) box(car, 0.04, CAR_H, CAR_D, ecx + sx, CAR_H / 2, ecz, skin)
  for (const jx of [-0.4, 0.4]) box(car, 0.012, CAR_H - 0.2, 0.012, ecx + jx, CAR_H / 2, ecz - hd + 0.045, mat.hairDark, { noShadow: true })

  // 후면 거울 (승객용) / 완충 패드 (화물용)
  if (EV.roof) {
    box(car, CAR_W - 0.34, 1.24, 0.012, ecx, 1.42, ecz - hd + 0.05, mat.mirror, { noShadow: true })
  } else {
    box(car, CAR_W - 0.1, 1.2, 0.05, ecx, 1.0, ecz - hd + 0.07, mat.pad, { noShadow: true })
    for (const sx of [-hw + 0.07, hw - 0.07]) box(car, 0.05, 1.2, CAR_D - 0.2, ecx + sx, 1.0, ecz, mat.pad, { noShadow: true })
  }
  // 손잡이 — 3면
  const railM = mat.rail
  cyl(car, 0.019, 0.019, CAR_W - 0.3, ecx, 0.92, ecz - hd + 0.09, railM, 10).rotation.z = Math.PI / 2
  for (const sx of [-hw + 0.09, hw - 0.09]) cyl(car, 0.019, 0.019, CAR_D - 0.3, ecx + sx, 0.92, ecz, railM, 10).rotation.x = Math.PI / 2

  // 천장 + 조명판 + 비상등
  box(car, CAR_W, 0.06, CAR_D, ecx, CAR_H, ecz, mat.hairDark, { noShadow: true })
  for (const sz of [-0.42, 0.42]) {
    const p = box(car, CAR_W - 0.42, 0.03, 0.46, ecx, CAR_H - 0.04, ecz + sz,
      new T.MeshStandardMaterial({ color: '#eceadf', emissive: '#ffefd4', emissiveIntensity: 2.4 }), { noShadow: true })
    carLightPanes.push(p)
  }
  for (const sz of [-0.42, 0.42]) {
    const l = new T.PointLight('#ffe9c8', 6.5, 6, 2)
    l.position.set(ecx, CAR_H - 0.3, ecz + sz); l.userData.base = 6.5
    car.add(l); carLights.push(l)
  }
  const emergPane = box(car, 0.16, 0.05, 0.1, ecx + hw - 0.18, CAR_H - 0.12, ecz - hd + 0.2,
    new T.MeshStandardMaterial({ color: '#2a3138', emissive: '#8fffc0', emissiveIntensity: 0.05 }), { noShadow: true })

  // 조작반 (COP)
  const copX = ecx + hw - 0.06, copZ = ecz + hd - 0.5
  box(car, 0.03, 1.12, 0.26, copX, 1.24, copZ, mat.plastic, { noShadow: true })
  box(car, 0.012, 1.04, 0.2, copX - 0.02, 1.24, copZ, mat.hairDark, { noShadow: true })
  order.slice().reverse().forEach((fk, i) => {
    const b = cyl(car, 0.028, 0.028, 0.016, copX - 0.035, 1.58 - i * 0.15, copZ + 0.045,
      new T.MeshStandardMaterial({ color: '#39424a', emissive: '#ffbe72', emissiveIntensity: 0, roughness: 0.4 }), 18)
    b.rotation.z = Math.PI / 2
    b.userData.act = { kind: 'evcall', floor: fk }
    copBtns[fk] = b
    picks?.push(b)
  })
  // 열림 · 닫힘 · 인터폰
  for (const [dy, c] of [[0.98, '#8fb7d8'], [0.86, '#8fb7d8'], [0.72, '#d8a08f']]) {
    const b = cyl(car, 0.022, 0.022, 0.014, copX - 0.035, dy, copZ - 0.05,
      new T.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.1 }), 14)
    b.rotation.z = Math.PI / 2
  }
  // 카 내 층 표시
  const copInd = indPlate(car, 0.19, 0.07, copX - 0.03, 1.76, copZ)
  copInd.rotation.y = -Math.PI / 2
  // 정원 표지
  plate(car, 0.2, 0.07, copX - 0.03, 0.56, copZ, (x, w, h) => {
    x.fillStyle = '#dfe2e4'; x.fillRect(0, 0, w, h)
    x.fillStyle = '#2b3137'; x.font = 'bold ' + h * 0.42 + 'px "Noto Sans KR",sans-serif'
    x.textAlign = 'center'; x.textBaseline = 'middle'
    x.fillText(EV.roof ? '정원 13인 900kg' : '적재하중 1150kg', w / 2, h / 2)
  }, { ry: -Math.PI / 2 })

  // 카 문 2짝
  const carDoors = [-1, 1].map((sd) => {
    const m = box(car, PANEL_W, DOOR_H, 0.045, ecx + sd * PANEL_W / 2, DOOR_H / 2, ecz + hd - 0.03, skin)
    m.userData.home = ecx + sd * PANEL_W / 2
    m.userData.sd = sd
    m.userData.act = { kind: 'evtoggle' }
    box(m, PANEL_W - 0.02, 0.16, 0.008, 0, -DOOR_H / 2 + 0.09, -0.028, mat.hairDark, { noShadow: true })
    picks?.push(m)
    return { m, sd, home: ecx + sd * PANEL_W / 2 }
  })
  // 도어 실 + 세이프티 슈
  box(car, DOOR_W + 0.16, 0.04, 0.14, ecx, 0.02, ecz + hd - 0.03, mat.sill, { noShadow: true })

  /* ══════════ 옥상 권상기 ══════════ */
  if (EV.roof) {
    const mrY = TOP_Y - 1.2
    cyl(shaft, 0.34, 0.34, 0.26, ecx - 0.3, mrY, ecz - 0.34, mat.steel, 22).rotation.z = Math.PI / 2
    box(shaft, 0.7, 0.5, 0.62, ecx + 0.24, mrY, ecz - 0.34, mat.steelDk, { noShadow: true })
    cyl(shaft, 0.2, 0.2, 0.08, ecx, mrY + 0.62, ecz + 0.3, mat.steel, 18).rotation.z = Math.PI / 2
  }

  return {
    root, car, carDoors, landing, hallInd, hallLantern, hallBtns, hallLights,
    carLights, carLightPanes, copBtns, copInd, emergPane,
    PANEL_W, DOOR_W, DOOR_H, CAR_H, shaft,
  }
}
