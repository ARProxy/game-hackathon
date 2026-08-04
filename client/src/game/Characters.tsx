/**
 * 『얼음, 땡!』 캐릭터 세트 v3 — 어몽어스형 콩 실루엣 6종
 * character-data.js에서 자동 생성. 수정은 데이터 쪽에서.
 *
 * 형태 원칙:
 *   · 머리를 따로 만들지 않는다 — 몸 전체가 하나의 둥근 콩(캡슐)
 *   · 눈 두 개를 만들지 않는다 — 가로로 넓은 단일 바이저 하나
 *   · 팔을 만들지 않는다 — 짧은 다리 두 개 + 통통한 신발
 *   · 등에 둥근 백팩 (런닝맨 번호 배지가 붙는 자리)
 *   · 각진 box는 쓰지 않는다 — 구·캡슐·토러스·원판·원뿔만
 *
 * 공통 실루엣: 콩 몸통·바이저·백팩·다리는 6종 전부 동일 치수
 * 구분 축 3개: ① 색·발광  ② 머리 장식  ③ 신발
 *
 * 규격: 키 1.7m · 콜라이더 캡슐 r0.4 halfHeight 0.35 (offsetY 0.85)
 * 상태: 기본 / 빙결(얼음 껍질) / 위장(술래 전용)
 */
import { useMemo, type Ref } from 'react'
import * as THREE from 'three'
import { RigidBody, CapsuleCollider } from '@react-three/rapier'

type V3 = [number, number, number]

export type Part = {
  /** sph=구 · cap=캡슐 · tor=토러스 · cyl=원기둥 · cone=원뿔 · disc=원판 · ring=바닥 링
   *  oct=팔면체 · dodec=정십이면체 (얼음 결정 — 각진 저폴리) */
  t: 'sph' | 'cap' | 'tor' | 'cyl' | 'cone' | 'disc' | 'ring' | 'oct' | 'dodec'
  p: V3
  /** 반지름 (sph/cap/tor/cyl/cone/disc) */
  r?: number
  /** 길이 (cap=원통부 길이, cyl/cone=전체 높이) */
  h?: number
  /** 토러스 튜브 반지름 */
  tb?: number
  ri?: number
  ro?: number
  /** 축별 배율 — 달걀·납작 형태 (모든 타입에 적용) */
  s?: V3
  c: string
  /** 발광 강도 */
  em?: number
  /** 반투명도 */
  op?: number
  /** 플랫 셰이딩 — 얼음 결정면을 또렷하게 (유리질 반사) */
  flat?: boolean
  /** 링 분할 수 — 낮추면 각진 다각형 */
  seg?: number
  rot?: V3
  /** 등 원형 배지 — 번호 텍스처를 붙일 면 */
  tag?: boolean
  part?: string
}

export type Character = {
  id: string
  tag: string
  name: string
  role: 'seeker' | 'runner'
  /** 본색 */
  c: string
  /** 발광색 — 가슴등·눈 림·바닥 헤일로 */
  glow: string
  accessory: string
  shoes: string
  note?: string
  parts: Part[]
}

export const HEIGHT = 1.7
export const SILHOUETTE = '머리 없는 콩 + 단일 바이저 (어몽어스형)'
export const COLLIDER = { halfHeight: 0.35, radius: 0.4, offsetY: 0.85 }
/** 술래 위장 — 정지 3초 후 발동, 이동 시 해제 */
export const CAMO = { color: '#1A2530', opacity: 0.26 }

export const CHARACTERS: Character[] = [
  {
    id: 'R00', tag: '00', name: '술래', role: 'seeker',
    c: '#E23B2E', glow: '#FF7A3C', accessory: '돔 헬멧 + 발광 링 + 안테나', shoes: '통통한 부츠',
    note: '유일하게 위장 능력 보유 — 정지 3초 후 배경색으로 흐려진다',
    parts: [
      { t: 'cap', p: [-0.17, 0.17, 0], r: 0.112, h: 0.08, c: '#88231c', part: 'leg' },
      { t: 'cap', p: [0.17, 0.17, 0], r: 0.112, h: 0.08, c: '#88231c', part: 'leg' },
      { t: 'cap', p: [0, 0.97, 0], r: 0.4, h: 0.54, s: [1, 1, 0.86], c: '#E23B2E', part: 'body' },
      { t: 'cap', p: [0, 1.06, -0.4], r: 0.155, h: 0.26, s: [0.9, 1, 1], c: '#c23328', part: 'pack' },
      { t: 'tor', p: [0, 1.19, -0.4], r: 0.152, tb: 0.028, c: '#681b15', rot: [1.5708, 0, 0], part: 'pack' },
      { t: 'disc', p: [0, 1.05, -0.558], r: 0.108, c: '#F6F3E7', tag: true, part: 'nametag' },
      { t: 'tor', p: [0, 1.05, -0.556], r: 0.113, tb: 0.019, c: '#681b15', part: 'nametag' },
      { t: 'sph', p: [0, 1.21, 0.29], r: 0.3, s: [1.02, 0.6, 0.36], c: '#2B4F62', part: 'visorback' },
      { t: 'sph', p: [0, 1.21, 0.335], r: 0.29, s: [1, 0.56, 0.3], c: '#8FD3E8', em: 0.22, part: 'visor' },
      { t: 'tor', p: [0, 1.21, 0.343], r: 0.295, tb: 0.042, s: [1, 0.6, 1], c: '#c23328', part: 'visorrim' },
      { t: 'sph', p: [-0.13, 1.28, 0.39], r: 0.06, s: [1.5, 0.5, 0.3], c: '#FFFFFF', part: 'glint' },
      { t: 'sph', p: [0, 0.86, 0.31], r: 0.05, s: [1.5, 0.75, 0.6], c: '#FF7A3C', em: 1, part: 'lamp' },
      { t: 'tor', p: [0, 0.6, 0], r: 0.352, tb: 0.036, s: [1, 1, 0.9], c: '#F2EAD3', rot: [1.5708, 0, 0], part: 'belt' },
      { t: 'sph', p: [0, 1.44, -0.01], r: 0.415, s: [1, 0.72, 0.9], c: '#8c251d', part: 'hat' },
      { t: 'tor', p: [0, 1.42, 0], r: 0.408, tb: 0.04, s: [1, 1, 0.9], c: '#681b15', rot: [1.5708, 0, 0], part: 'hat' },
      { t: 'tor', p: [0, 1.62, 0], r: 0.29, tb: 0.03, s: [1, 1, 0.9], c: '#FF7A3C', em: 0.7, rot: [1.5708, 0, 0], part: 'hat' },
      { t: 'cyl', p: [0.2, 1.85, -0.09], r: 0.017, h: 0.26, c: '#8F979E', rot: [0, 0, -0.16], part: 'hat' },
      { t: 'sph', p: [0.225, 1.99, -0.09], r: 0.05, c: '#FF7A3C', em: 1.5, part: 'hat' },
      { t: 'sph', p: [-0.17, 0.1, 0.035], r: 0.155, s: [1, 0.82, 1.3], c: '#5a1812', part: 'shoe' },
      { t: 'sph', p: [0.17, 0.1, 0.035], r: 0.155, s: [1, 0.82, 1.3], c: '#5a1812', part: 'shoe' },
      { t: 'tor', p: [-0.17, 0.23, 0], r: 0.118, tb: 0.04, c: '#44120e', rot: [1.5708, 0, 0], part: 'shoe' },
      { t: 'tor', p: [0.17, 0.23, 0], r: 0.118, tb: 0.04, c: '#44120e', rot: [1.5708, 0, 0], part: 'shoe' },
      { t: 'sph', p: [-0.17, 0.04, 0.045], r: 0.16, s: [1, 0.3, 1.32], c: '#252C34', part: 'shoe' },
      { t: 'sph', p: [0.17, 0.04, 0.045], r: 0.16, s: [1, 0.3, 1.32], c: '#252C34', part: 'shoe' },
    ],
  },
  {
    id: 'R01', tag: '01', name: '캡', role: 'runner',
    c: '#FFA928', glow: '#FFD98A', accessory: '둥근 야구모자', shoes: '운동화',
    parts: [
      { t: 'cap', p: [-0.17, 0.17, 0], r: 0.112, h: 0.08, c: '#996518', part: 'leg' },
      { t: 'cap', p: [0.17, 0.17, 0], r: 0.112, h: 0.08, c: '#996518', part: 'leg' },
      { t: 'cap', p: [0, 0.97, 0], r: 0.4, h: 0.54, s: [1, 1, 0.86], c: '#FFA928', part: 'body' },
      { t: 'cap', p: [0, 1.06, -0.4], r: 0.155, h: 0.26, s: [0.9, 1, 1], c: '#db9122', part: 'pack' },
      { t: 'tor', p: [0, 1.19, -0.4], r: 0.152, tb: 0.028, c: '#754e12', rot: [1.5708, 0, 0], part: 'pack' },
      { t: 'disc', p: [0, 1.05, -0.558], r: 0.108, c: '#F6F3E7', tag: true, part: 'nametag' },
      { t: 'tor', p: [0, 1.05, -0.556], r: 0.113, tb: 0.019, c: '#754e12', part: 'nametag' },
      { t: 'sph', p: [0, 1.21, 0.29], r: 0.3, s: [1.02, 0.6, 0.36], c: '#2B4F62', part: 'visorback' },
      { t: 'sph', p: [0, 1.21, 0.335], r: 0.29, s: [1, 0.56, 0.3], c: '#8FD3E8', em: 0.22, part: 'visor' },
      { t: 'tor', p: [0, 1.21, 0.343], r: 0.295, tb: 0.042, s: [1, 0.6, 1], c: '#db9122', part: 'visorrim' },
      { t: 'sph', p: [-0.13, 1.28, 0.39], r: 0.06, s: [1.5, 0.5, 0.3], c: '#FFFFFF', part: 'glint' },
      { t: 'sph', p: [0, 0.86, 0.31], r: 0.05, s: [1.5, 0.75, 0.6], c: '#FFD98A', em: 1, part: 'lamp' },
      { t: 'tor', p: [0, 0.6, 0], r: 0.352, tb: 0.036, s: [1, 1, 0.9], c: '#F2EAD3', rot: [1.5708, 0, 0], part: 'belt' },
      { t: 'sph', p: [0, 1.5, -0.03], r: 0.4, s: [1, 0.62, 0.88], c: '#946217', part: 'hat' },
      { t: 'sph', p: [0, 1.6, 0.28], r: 0.3, s: [1, 0.14, 0.6], c: '#754e12', part: 'hat' },
      { t: 'sph', p: [0, 1.79, -0.03], r: 0.05, c: '#F2EAD3', part: 'hat' },
      { t: 'sph', p: [-0.17, 0.095, 0.04], r: 0.145, s: [1, 0.78, 1.36], c: '#2E353E', part: 'shoe' },
      { t: 'sph', p: [0.17, 0.095, 0.04], r: 0.145, s: [1, 0.78, 1.36], c: '#2E353E', part: 'shoe' },
      { t: 'sph', p: [-0.17, 0.035, 0.045], r: 0.15, s: [1, 0.28, 1.38], c: '#E3DCC6', part: 'shoe' },
      { t: 'sph', p: [0.17, 0.035, 0.045], r: 0.15, s: [1, 0.28, 1.38], c: '#E3DCC6', part: 'shoe' },
      { t: 'tor', p: [-0.17, 0.125, 0.005], r: 0.105, tb: 0.024, c: '#F2EAD3', rot: [1.5708, 0, 0], part: 'shoe' },
      { t: 'tor', p: [0.17, 0.125, 0.005], r: 0.105, tb: 0.024, c: '#F2EAD3', rot: [1.5708, 0, 0], part: 'shoe' },
    ],
  },
  {
    id: 'R02', tag: '02', name: '후디', role: 'runner',
    c: '#FF6B3D', glow: '#FFB07A', accessory: '후드 + 끈 방울', shoes: '하이톱',
    parts: [
      { t: 'cap', p: [-0.17, 0.17, 0], r: 0.112, h: 0.08, c: '#994025', part: 'leg' },
      { t: 'cap', p: [0.17, 0.17, 0], r: 0.112, h: 0.08, c: '#994025', part: 'leg' },
      { t: 'cap', p: [0, 0.97, 0], r: 0.4, h: 0.54, s: [1, 1, 0.86], c: '#FF6B3D', part: 'body' },
      { t: 'cap', p: [0, 1.06, -0.4], r: 0.155, h: 0.26, s: [0.9, 1, 1], c: '#db5c34', part: 'pack' },
      { t: 'tor', p: [0, 1.19, -0.4], r: 0.152, tb: 0.028, c: '#75311c', rot: [1.5708, 0, 0], part: 'pack' },
      { t: 'disc', p: [0, 1.05, -0.558], r: 0.108, c: '#F6F3E7', tag: true, part: 'nametag' },
      { t: 'tor', p: [0, 1.05, -0.556], r: 0.113, tb: 0.019, c: '#75311c', part: 'nametag' },
      { t: 'sph', p: [0, 1.21, 0.29], r: 0.3, s: [1.02, 0.6, 0.36], c: '#2B4F62', part: 'visorback' },
      { t: 'sph', p: [0, 1.21, 0.335], r: 0.29, s: [1, 0.56, 0.3], c: '#8FD3E8', em: 0.22, part: 'visor' },
      { t: 'tor', p: [0, 1.21, 0.343], r: 0.295, tb: 0.042, s: [1, 0.6, 1], c: '#db5c34', part: 'visorrim' },
      { t: 'sph', p: [-0.13, 1.28, 0.39], r: 0.06, s: [1.5, 0.5, 0.3], c: '#FFFFFF', part: 'glint' },
      { t: 'sph', p: [0, 0.86, 0.31], r: 0.05, s: [1.5, 0.75, 0.6], c: '#FFB07A', em: 1, part: 'lamp' },
      { t: 'tor', p: [0, 0.6, 0], r: 0.352, tb: 0.036, s: [1, 1, 0.9], c: '#F2EAD3', rot: [1.5708, 0, 0], part: 'belt' },
      { t: 'sph', p: [0, 1.43, -0.19], r: 0.46, s: [1, 0.86, 0.92], c: '#b34b2b', part: 'hat' },
      { t: 'tor', p: [0, 1.14, 0.02], r: 0.36, tb: 0.08, s: [1, 1, 0.92], c: '#c2512e', rot: [1.42, 0, 0], part: 'hat' },
      { t: 'cap', p: [-0.13, 0.99, 0.3], r: 0.021, h: 0.16, c: '#F2EAD3', part: 'hat' },
      { t: 'cap', p: [0.13, 0.99, 0.3], r: 0.021, h: 0.16, c: '#F2EAD3', part: 'hat' },
      { t: 'sph', p: [-0.13, 0.88, 0.3], r: 0.033, c: '#F2EAD3', part: 'hat' },
      { t: 'sph', p: [0.13, 0.88, 0.3], r: 0.033, c: '#F2EAD3', part: 'hat' },
      { t: 'sph', p: [-0.17, 0.185, 0], r: 0.122, s: [1, 1.05, 1], c: '#7a331d', part: 'shoe' },
      { t: 'sph', p: [0.17, 0.185, 0], r: 0.122, s: [1, 1.05, 1], c: '#7a331d', part: 'shoe' },
      { t: 'sph', p: [-0.17, 0.095, 0.045], r: 0.145, s: [1, 0.82, 1.34], c: '#2E353E', part: 'shoe' },
      { t: 'sph', p: [0.17, 0.095, 0.045], r: 0.145, s: [1, 0.82, 1.34], c: '#2E353E', part: 'shoe' },
      { t: 'sph', p: [-0.17, 0.035, 0.045], r: 0.152, s: [1, 0.28, 1.36], c: '#F2EAD3', part: 'shoe' },
      { t: 'sph', p: [0.17, 0.035, 0.045], r: 0.152, s: [1, 0.28, 1.36], c: '#F2EAD3', part: 'shoe' },
      { t: 'tor', p: [-0.17, 0.27, 0], r: 0.107, tb: 0.03, c: '#F2EAD3', rot: [1.5708, 0, 0], part: 'shoe' },
      { t: 'tor', p: [0.17, 0.27, 0], r: 0.107, tb: 0.03, c: '#F2EAD3', rot: [1.5708, 0, 0], part: 'shoe' },
    ],
  },
  {
    id: 'R03', tag: '03', name: '비니', role: 'runner',
    c: '#FFD93D', glow: '#FFF0A8', accessory: '방울 비니', shoes: '실내화 + 양말',
    parts: [
      { t: 'cap', p: [-0.17, 0.17, 0], r: 0.112, h: 0.08, c: '#998225', part: 'leg' },
      { t: 'cap', p: [0.17, 0.17, 0], r: 0.112, h: 0.08, c: '#998225', part: 'leg' },
      { t: 'cap', p: [0, 0.97, 0], r: 0.4, h: 0.54, s: [1, 1, 0.86], c: '#FFD93D', part: 'body' },
      { t: 'cap', p: [0, 1.06, -0.4], r: 0.155, h: 0.26, s: [0.9, 1, 1], c: '#dbbb34', part: 'pack' },
      { t: 'tor', p: [0, 1.19, -0.4], r: 0.152, tb: 0.028, c: '#75641c', rot: [1.5708, 0, 0], part: 'pack' },
      { t: 'disc', p: [0, 1.05, -0.558], r: 0.108, c: '#F6F3E7', tag: true, part: 'nametag' },
      { t: 'tor', p: [0, 1.05, -0.556], r: 0.113, tb: 0.019, c: '#75641c', part: 'nametag' },
      { t: 'sph', p: [0, 1.21, 0.29], r: 0.3, s: [1.02, 0.6, 0.36], c: '#2B4F62', part: 'visorback' },
      { t: 'sph', p: [0, 1.21, 0.335], r: 0.29, s: [1, 0.56, 0.3], c: '#8FD3E8', em: 0.22, part: 'visor' },
      { t: 'tor', p: [0, 1.21, 0.343], r: 0.295, tb: 0.042, s: [1, 0.6, 1], c: '#dbbb34', part: 'visorrim' },
      { t: 'sph', p: [-0.13, 1.28, 0.39], r: 0.06, s: [1.5, 0.5, 0.3], c: '#FFFFFF', part: 'glint' },
      { t: 'sph', p: [0, 0.86, 0.31], r: 0.05, s: [1.5, 0.75, 0.6], c: '#FFF0A8', em: 1, part: 'lamp' },
      { t: 'tor', p: [0, 0.6, 0], r: 0.352, tb: 0.036, s: [1, 1, 0.9], c: '#F2EAD3', rot: [1.5708, 0, 0], part: 'belt' },
      { t: 'sph', p: [0, 1.47, 0], r: 0.405, s: [1, 0.66, 0.88], c: '#8a7521', part: 'hat' },
      { t: 'tor', p: [0, 1.5, 0], r: 0.4, tb: 0.055, s: [1, 1, 0.88], c: '#F2EAD3', rot: [1.5708, 0, 0], part: 'hat' },
      { t: 'sph', p: [0, 1.83, 0], r: 0.09, c: '#F2EAD3', part: 'hat' },
      { t: 'sph', p: [-0.17, 0.15, 0], r: 0.108, s: [1, 0.92, 1], c: '#F2EAD3', part: 'sock' },
      { t: 'sph', p: [0.17, 0.15, 0], r: 0.108, s: [1, 0.92, 1], c: '#F2EAD3', part: 'sock' },
      { t: 'sph', p: [-0.17, 0.048, 0.035], r: 0.14, s: [1, 0.4, 1.32], c: '#857120', part: 'shoe' },
      { t: 'sph', p: [0.17, 0.048, 0.035], r: 0.14, s: [1, 0.4, 1.32], c: '#857120', part: 'shoe' },
      { t: 'tor', p: [-0.17, 0.085, 0.105], r: 0.09, tb: 0.028, c: '#6b5b1a', rot: [0.2, 0, 0], part: 'shoe' },
      { t: 'tor', p: [0.17, 0.085, 0.105], r: 0.09, tb: 0.028, c: '#6b5b1a', rot: [0.2, 0, 0], part: 'shoe' },
    ],
  },
  {
    id: 'R04', tag: '04', name: '반다나', role: 'runner',
    c: '#FF87A8', glow: '#FFC4D6', accessory: '반다나 + 묶은 꼬리', shoes: '롱스타킹 + 단화',
    parts: [
      { t: 'cap', p: [-0.17, 0.17, 0], r: 0.112, h: 0.08, c: '#995165', part: 'leg' },
      { t: 'cap', p: [0.17, 0.17, 0], r: 0.112, h: 0.08, c: '#995165', part: 'leg' },
      { t: 'cap', p: [0, 0.97, 0], r: 0.4, h: 0.54, s: [1, 1, 0.86], c: '#FF87A8', part: 'body' },
      { t: 'cap', p: [0, 1.06, -0.4], r: 0.155, h: 0.26, s: [0.9, 1, 1], c: '#db7490', part: 'pack' },
      { t: 'tor', p: [0, 1.19, -0.4], r: 0.152, tb: 0.028, c: '#753e4d', rot: [1.5708, 0, 0], part: 'pack' },
      { t: 'disc', p: [0, 1.05, -0.558], r: 0.108, c: '#F6F3E7', tag: true, part: 'nametag' },
      { t: 'tor', p: [0, 1.05, -0.556], r: 0.113, tb: 0.019, c: '#753e4d', part: 'nametag' },
      { t: 'sph', p: [0, 1.21, 0.29], r: 0.3, s: [1.02, 0.6, 0.36], c: '#2B4F62', part: 'visorback' },
      { t: 'sph', p: [0, 1.21, 0.335], r: 0.29, s: [1, 0.56, 0.3], c: '#8FD3E8', em: 0.22, part: 'visor' },
      { t: 'tor', p: [0, 1.21, 0.343], r: 0.295, tb: 0.042, s: [1, 0.6, 1], c: '#db7490', part: 'visorrim' },
      { t: 'sph', p: [-0.13, 1.28, 0.39], r: 0.06, s: [1.5, 0.5, 0.3], c: '#FFFFFF', part: 'glint' },
      { t: 'sph', p: [0, 0.86, 0.31], r: 0.05, s: [1.5, 0.75, 0.6], c: '#FFC4D6', em: 1, part: 'lamp' },
      { t: 'tor', p: [0, 0.6, 0], r: 0.352, tb: 0.036, s: [1, 1, 0.9], c: '#F2EAD3', rot: [1.5708, 0, 0], part: 'belt' },
      { t: 'sph', p: [0, 1.55, -0.01], r: 0.39, s: [1, 0.4, 0.88], c: '#8a495b', part: 'hat' },
      { t: 'tor', p: [0, 1.5, 0], r: 0.39, tb: 0.046, s: [1, 1, 0.88], c: '#703b4a', rot: [1.5708, 0, 0], part: 'hat' },
      { t: 'sph', p: [0, 1.52, -0.36], r: 0.075, c: '#7a4151', part: 'hat' },
      { t: 'cap', p: [0, 1.35, -0.42], r: 0.05, h: 0.22, c: '#7a4151', rot: [0.34, 0, 0], part: 'hat' },
      { t: 'sph', p: [0.01, 1.17, -0.49], r: 0.05, c: '#703b4a', part: 'hat' },
      { t: 'cap', p: [-0.17, 0.19, 0], r: 0.108, h: 0.12, c: '#F2EAD3', part: 'sock' },
      { t: 'cap', p: [0.17, 0.19, 0], r: 0.108, h: 0.12, c: '#F2EAD3', part: 'sock' },
      { t: 'tor', p: [-0.17, 0.29, 0], r: 0.109, tb: 0.026, c: '#D9D0B2', rot: [1.5708, 0, 0], part: 'sock' },
      { t: 'tor', p: [0.17, 0.29, 0], r: 0.109, tb: 0.026, c: '#D9D0B2', rot: [1.5708, 0, 0], part: 'sock' },
      { t: 'sph', p: [-0.17, 0.07, 0.04], r: 0.138, s: [1, 0.66, 1.32], c: '#2E353E', part: 'shoe' },
      { t: 'sph', p: [0.17, 0.07, 0.04], r: 0.138, s: [1, 0.66, 1.32], c: '#2E353E', part: 'shoe' },
    ],
  },
  {
    id: 'R05', tag: '05', name: '헤드셋', role: 'runner',
    c: '#C4E05C', glow: '#E8F5A8', accessory: '헤드셋 + 마이크', shoes: '작업화',
    parts: [
      { t: 'cap', p: [-0.17, 0.17, 0], r: 0.112, h: 0.08, c: '#768637', part: 'leg' },
      { t: 'cap', p: [0.17, 0.17, 0], r: 0.112, h: 0.08, c: '#768637', part: 'leg' },
      { t: 'cap', p: [0, 0.97, 0], r: 0.4, h: 0.54, s: [1, 1, 0.86], c: '#C4E05C', part: 'body' },
      { t: 'cap', p: [0, 1.06, -0.4], r: 0.155, h: 0.26, s: [0.9, 1, 1], c: '#a9c14f', part: 'pack' },
      { t: 'tor', p: [0, 1.19, -0.4], r: 0.152, tb: 0.028, c: '#5a672a', rot: [1.5708, 0, 0], part: 'pack' },
      { t: 'disc', p: [0, 1.05, -0.558], r: 0.108, c: '#F6F3E7', tag: true, part: 'nametag' },
      { t: 'tor', p: [0, 1.05, -0.556], r: 0.113, tb: 0.019, c: '#5a672a', part: 'nametag' },
      { t: 'sph', p: [0, 1.21, 0.29], r: 0.3, s: [1.02, 0.6, 0.36], c: '#2B4F62', part: 'visorback' },
      { t: 'sph', p: [0, 1.21, 0.335], r: 0.29, s: [1, 0.56, 0.3], c: '#8FD3E8', em: 0.22, part: 'visor' },
      { t: 'tor', p: [0, 1.21, 0.343], r: 0.295, tb: 0.042, s: [1, 0.6, 1], c: '#a9c14f', part: 'visorrim' },
      { t: 'sph', p: [-0.13, 1.28, 0.39], r: 0.06, s: [1.5, 0.5, 0.3], c: '#FFFFFF', part: 'glint' },
      { t: 'sph', p: [0, 0.86, 0.31], r: 0.05, s: [1.5, 0.75, 0.6], c: '#E8F5A8', em: 1, part: 'lamp' },
      { t: 'tor', p: [0, 0.6, 0], r: 0.352, tb: 0.036, s: [1, 1, 0.9], c: '#F2EAD3', rot: [1.5708, 0, 0], part: 'belt' },
      { t: 'tor', p: [0, 1.5, -0.01], r: 0.375, tb: 0.036, c: '#1D242B', part: 'hat' },
      { t: 'sph', p: [-0.36, 1.32, -0.01], r: 0.115, s: [0.55, 1, 0.95], c: '#728235', part: 'hat' },
      { t: 'sph', p: [0.36, 1.32, -0.01], r: 0.115, s: [0.55, 1, 0.95], c: '#728235', part: 'hat' },
      { t: 'sph', p: [-0.42, 1.32, -0.01], r: 0.048, s: [0.5, 1, 1], c: '#E8F5A8', em: 1, part: 'hat' },
      { t: 'cap', p: [-0.24, 1.2, 0.22], r: 0.023, h: 0.16, c: '#1D242B', rot: [0, -0.75, 1.15], part: 'hat' },
      { t: 'sph', p: [-0.12, 1.15, 0.29], r: 0.042, c: '#2A333C', part: 'hat' },
      { t: 'sph', p: [-0.17, 0.15, 0.01], r: 0.138, s: [1, 0.98, 1.05], c: '#525e27', part: 'shoe' },
      { t: 'sph', p: [0.17, 0.15, 0.01], r: 0.138, s: [1, 0.98, 1.05], c: '#525e27', part: 'shoe' },
      { t: 'sph', p: [-0.17, 0.09, 0.055], r: 0.152, s: [1, 0.76, 1.32], c: '#3C444D', part: 'shoe' },
      { t: 'sph', p: [0.17, 0.09, 0.055], r: 0.152, s: [1, 0.76, 1.32], c: '#3C444D', part: 'shoe' },
      { t: 'sph', p: [-0.17, 0.105, 0.16], r: 0.108, s: [1, 0.84, 0.68], c: '#8F979E', part: 'shoe' },
      { t: 'sph', p: [0.17, 0.105, 0.16], r: 0.108, s: [1, 0.84, 0.68], c: '#8F979E', part: 'shoe' },
      { t: 'sph', p: [-0.17, 0.035, 0.055], r: 0.158, s: [1, 0.3, 1.34], c: '#252C34', part: 'shoe' },
      { t: 'sph', p: [0.17, 0.035, 0.055], r: 0.158, s: [1, 0.3, 1.34], c: '#252C34', part: 'shoe' },
    ],
  },

]

/**
 * 빙결 얼음 껍질 — 실루엣이 공통이므로 한 세트로 전 캐릭터 커버.
 * 실제 얼음처럼 각진 결정: 팔면체·정십이면체 저폴리 + 6각 원뿔 고드름 + 각진 바닥 성에.
 * 강한 청색 3단 — 심부 #1E6FA8 → 껍질 #3AA0D9/#7FD4F5 → 하이라이트 #DFF6FF
 */
export const ICE_SHELL: Part[] = [
  { t: 'dodec', p: [0, 1.14, 0], r: 0.5, s: [1, 1.16, 0.94], c: '#3AA0D9', op: 0.42, flat: true, rot: [0.14, 0.5, 0.08] },
  { t: 'oct', p: [0, 0.72, 0], r: 0.52, s: [1, 1.24, 0.92], c: '#7FD4F5', op: 0.34, flat: true, rot: [0, 0.78, 0] },
  { t: 'oct', p: [0, 0.22, 0.02], r: 0.36, s: [1.1, 0.95, 1.2], c: '#3AA0D9', op: 0.4, flat: true, rot: [0.1, 0.4, 0] },
  { t: 'oct', p: [0, 1.05, 0], r: 0.33, s: [1, 1.5, 0.9], c: '#1E6FA8', op: 0.55, flat: true, rot: [0, 0.35, 0.1] },
  { t: 'oct', p: [-0.42, 1.28, 0.1], r: 0.19, s: [1, 1.7, 1], c: '#7FD4F5', op: 0.62, flat: true, rot: [0.2, 0.4, 0.68] },
  { t: 'oct', p: [0.45, 0.95, -0.12], r: 0.17, s: [1, 1.5, 1], c: '#7FD4F5', op: 0.6, flat: true, rot: [-0.24, 0.2, -0.8] },
  { t: 'oct', p: [0.08, 1.72, -0.06], r: 0.17, s: [1, 1.9, 1], c: '#DFF6FF', op: 0.66, flat: true, rot: [0.26, 0, 0.2] },
  { t: 'oct', p: [-0.2, 1.66, 0.2], r: 0.12, s: [1, 1.6, 1], c: '#DFF6FF', op: 0.6, flat: true, rot: [-0.3, 0.3, -0.36] },
  { t: 'oct', p: [0.3, 0.42, 0.24], r: 0.14, s: [1, 1.4, 1], c: '#3AA0D9', op: 0.6, flat: true, rot: [0.44, 0.2, 0.3] },
  { t: 'oct', p: [-0.34, 0.5, -0.24], r: 0.13, s: [1, 1.3, 1], c: '#3AA0D9', op: 0.58, flat: true, rot: [-0.2, -0.4, -0.44] },
  { t: 'cone', p: [-0.46, 0.86, 0.16], r: 0.075, h: 0.4, c: '#DFF6FF', op: 0.68, flat: true, rot: [0.16, 0, 3] },
  { t: 'cone', p: [0.48, 0.6, -0.1], r: 0.062, h: 0.32, c: '#DFF6FF', op: 0.66, flat: true, rot: [-0.16, 0, -3.02] },
  { t: 'cone', p: [0.16, 0.34, 0.3], r: 0.055, h: 0.26, c: '#B8E9FA', op: 0.64, flat: true, rot: [0.3, 0, 3.1] },
  { t: 'cone', p: [0.26, 1.82, 0.12], r: 0.07, h: 0.34, c: '#DFF6FF', op: 0.72, flat: true, rot: [-0.18, 0, 0.28] },
  { t: 'cone', p: [-0.3, 1.5, -0.28], r: 0.062, h: 0.28, c: '#7FD4F5', op: 0.68, flat: true, rot: [0.4, 0, -0.4] },
  { t: 'cone', p: [0.38, 1.34, 0.26], r: 0.05, h: 0.24, c: '#B8E9FA', op: 0.66, flat: true, rot: [-0.5, 0, 0.62] },
  { t: 'ring', p: [0, 0.014, 0], ri: 0.44, ro: 0.78, seg: 8, c: '#2E8FC8', op: 0.5 },
  { t: 'oct', p: [-0.62, 0.05, 0.3], r: 0.12, s: [1.4, 0.28, 1.4], c: '#B8E9FA', op: 0.5, flat: true, rot: [0, 0.5, 0] },
  { t: 'oct', p: [0.58, 0.05, -0.34], r: 0.11, s: [1.5, 0.26, 1.5], c: '#B8E9FA', op: 0.48, flat: true, rot: [0, 0.2, 0] },
  { t: 'oct', p: [0.24, 0.045, 0.62], r: 0.1, s: [1.3, 0.24, 1.3], c: '#7FD4F5', op: 0.46, flat: true, rot: [0, 0.9, 0] },

]

export const byId = (id: string) => CHARACTERS.find((c) => c.id === id)
export const SEEKER = CHARACTERS.find((c) => c.role === 'seeker')!
export const RUNNERS = CHARACTERS.filter((c) => c.role === 'runner')

/**
 * 등 원형 배지 텍스처 — 번호 + 이름을 캔버스로 굽는다.
 * 원판이 -Z를 보도록 뒤집히므로 캔버스를 좌우 반전해 글자가 바로 읽히게 한다.
 * ch가 없어도 호출할 수 있다 (훅 순서를 지키기 위해 얼리 리턴보다 위에서 호출)
 */
export function useNameTagTexture(ch: Character | undefined) {
  return useMemo(() => {
    if (!ch) return null
    const cv = document.createElement('canvas')
    cv.width = 256
    cv.height = 256
    const x = cv.getContext('2d')!
    x.translate(256, 0)
    x.scale(-1, 1)
    x.fillStyle = '#F6F3E7'
    x.beginPath()
    x.arc(128, 128, 128, 0, Math.PI * 2)
    x.fill()
    x.textAlign = 'center'
    x.fillStyle = '#1B222A'
    x.font = '700 128px ui-monospace, monospace'
    x.fillText(ch.tag, 128, 138)
    x.font = '700 40px sans-serif'
    x.fillStyle = ch.c
    x.fillText(ch.name, 128, 196)
    const t = new THREE.CanvasTexture(cv)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [ch?.id])
}

function PartMesh({ part, opacity, tint, tagMap }: {
  part: Part
  opacity?: number
  tint?: string
  tagMap?: THREE.Texture
}) {
  const color = tint ?? part.c
  const op = opacity ?? part.op
  const transparent = op !== undefined && op < 1

  const geom =
    part.t === 'oct' ? <octahedronGeometry args={[part.r, 0]} />
    : part.t === 'dodec' ? <dodecahedronGeometry args={[part.r, 0]} />
    : part.t === 'sph' ? <sphereGeometry args={[part.r, 12, 8]} />
    : part.t === 'cap' ? <capsuleGeometry args={[part.r, part.h, 4, 10]} />
    : part.t === 'tor' ? <torusGeometry args={[part.r, part.tb, 8, 16]} />
    : part.t === 'cyl' ? <cylinderGeometry args={[part.r, part.r, part.h, 10]} />
    : part.t === 'cone' ? <coneGeometry args={[part.r, part.h, part.flat ? 6 : 8]} />
    : part.t === 'disc' ? <circleGeometry args={[part.r, 16]} />
    : <ringGeometry args={[part.ri, part.ro, part.seg ?? 20]} />

  // 등 배지는 굽힌 텍스처를 그대로 (뒤를 보므로 180° 회전)
  if (part.tag && tagMap) {
    return (
      <mesh position={part.p} rotation={[0, Math.PI, 0]}>
        {geom}
        <meshBasicMaterial map={tagMap} transparent={transparent} opacity={op ?? 1} />
      </mesh>
    )
  }

  if (part.t === 'ring') {
    return (
      <mesh position={part.p} rotation={[-Math.PI / 2, 0, 0]}>
        {geom}
        <meshBasicMaterial color={color} transparent opacity={op ?? 0.4} side={THREE.DoubleSide} />
      </mesh>
    )
  }

  return (
    <mesh position={part.p} rotation={part.rot} scale={part.s} renderOrder={op ? 6 : 0}>
      {geom}
      <meshStandardMaterial
        color={color}
        roughness={part.flat ? 0.12 : 0.62}
        metalness={part.flat ? 0.1 : 0.04}
        flatShading={part.flat}
        side={part.flat ? THREE.DoubleSide : THREE.FrontSide}
        transparent={transparent}
        opacity={op ?? 1}
        depthWrite={!transparent}
        {...(part.em ? { emissive: part.c, emissiveIntensity: part.em } : {})}
      />
    </mesh>
  )
}

/**
 * 캐릭터 메시 (물리 없음) — 다른 리그에 붙이거나 UI 프리뷰에 쓸 때
 */
export function CharacterModel({ id, frozen = false, camo = false, glowPulse = 1 }: {
  id: string
  /** 빙결 — 얼음 껍질이 덮이고 발광이 죽는다 */
  frozen?: boolean
  /** 위장 (술래 전용) — 배경색으로 흐려지고 발광이 꺼진다 */
  camo?: boolean
  /** 발광 강도 배수 — 숨소리처럼 맥동시킬 때 */
  glowPulse?: number
}) {
  const ch = byId(id)
  // 훅은 반드시 얼리 리턴보다 먼저 — id가 유효하지 않은 프레임에서도 훅 수가 변하지 않는다
  const tagMap = useNameTagTexture(ch)
  if (!ch) return null
  const camoOn = camo && ch.role === 'seeker'

  return (
    <group>
      {ch.parts.map((p, i) => {
        // 위장·빙결 중에는 발광을 죽인다 (위치가 드러나지 않게)
        const em = p.em ? (camoOn ? 0 : frozen ? p.em * 0.15 : p.em * glowPulse) : undefined
        return (
          <PartMesh
            key={i}
            part={em !== undefined ? { ...p, em } : p}
            opacity={camoOn ? CAMO.opacity : undefined}
            tint={camoOn ? CAMO.color : undefined}
            tagMap={p.tag ? tagMap ?? undefined : undefined}
          />
        )
      })}
      {frozen && ICE_SHELL.map((p, i) => <PartMesh key={`ice${i}`} part={p} />)}
    </group>
  )
}

/**
 * 물리 포함 캐릭터 — 캡슐 콜라이더 + 메시.
 * 이동은 부모에서 RigidBody ref로 제어하세요 (KinematicCharacterController 권장).
 */
export function Character({ id, position = [0, 0, 0], rotationY = 0, frozen, camo, glowPulse, bodyRef }: {
  id: string
  position?: V3
  rotationY?: number
  frozen?: boolean
  camo?: boolean
  glowPulse?: number
  bodyRef?: Ref<any>
}) {
  return (
    <RigidBody
      ref={bodyRef}
      type={frozen ? 'fixed' : 'dynamic'}
      position={position}
      rotation={[0, rotationY, 0]}
      colliders={false}
      enabledRotations={[false, false, false]}
    >
      <CapsuleCollider args={[COLLIDER.halfHeight, COLLIDER.radius]} position={[0, COLLIDER.offsetY, 0]} />
      <CharacterModel id={id} frozen={frozen} camo={camo} glowPulse={glowPulse} />
    </RigidBody>
  )
}

/**
 * 판 시작 시 캐릭터 배정 — 술래 1 + 도망자 n (결정적)
 */
export function assignCharacters(seed: number, playerCount: number) {
  let x = seed >>> 0 || 1
  const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296)
  const pool = [...RUNNERS]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return {
    seeker: SEEKER.id,
    runners: pool.slice(0, Math.max(1, Math.min(RUNNERS.length, playerCount - 1))).map((c) => c.id),
  }
}
