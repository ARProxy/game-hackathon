/**
 * 『얼음, 땡!』 캐릭터 세트 v4 — 원화 기반 괴물 술래 3종 + 동물 도망자 5종
 *
 * 형태 원칙: 도망자는 짧고 둥근 동물 인형, 술래는 길고 비정상적인 인간 실루엣.
 * 첨부 원화와 docs/assets/character-roster-concept-v1.png를 시각 정본으로 사용한다.
 *
 * 규격: 키 1.7m · 콜라이더 캡슐 r0.4 halfHeight 0.35 (offsetY 0.85)
 * 상태: 기본 / 빙결(얼음 껍질) / 위장(술래 전용)
 */
import { useMemo, useRef, type Ref, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
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
export const SILHOUETTE = '동물 인형 도망자 + 비정상적으로 긴 인간형 술래'
export const COLLIDER = { halfHeight: 0.35, radius: 0.4, offsetY: 0.85 }
/** 술래 위장 — 정지 3초 후 발동, 이동 시 해제 */
export const CAMO = { color: '#1A2530', opacity: 0.26 }

export const CHARACTERS: Character[] = [
  {
    id: 'R00', tag: 'S1', name: '우는 껍질', role: 'seeker',
    c: '#171316', glow: '#A30F24', accessory: '갈라진 입체 가면과 바닥에 닿는 비대칭 팔', shoes: '맨발',
    note: '청각 특화 추격자',
    parts: [
      { t: 'ring', p: [0, 0.018, 0], ri: 0.16, ro: 0.82, c: '#010103', op: 0.8, seg: 28, part: 'shadow' },
      { t: 'cap', p: [-0.145, 0.65, 0.01], r: 0.078, h: 1.12, c: '#171215', rot: [0.04, 0, -0.025], part: 'leg' },
      { t: 'cap', p: [0.13, 0.64, -0.035], r: 0.067, h: 1.15, c: '#21171A', rot: [-0.05, 0, 0.04], part: 'leg' },
      { t: 'sph', p: [-0.15, 0.055, 0.16], r: 0.145, s: [0.92, 0.25, 2.05], c: '#0B090B', part: 'shoe' },
      { t: 'sph', p: [0.14, 0.052, 0.13], r: 0.14, s: [0.88, 0.23, 1.82], c: '#0D0A0C', part: 'shoe' },
      { t: 'sph', p: [-0.015, 1.13, -0.02], r: 0.21, s: [0.96, 0.72, 0.56], c: '#20161A', part: 'pelvis' },
      { t: 'cap', p: [-0.04, 1.59, -0.025], r: 0.185, h: 0.82, s: [0.84, 1, 0.5], c: '#25191D', rot: [0.02, 0, -0.09], part: 'body' },
      { t: 'sph', p: [-0.2, 2.04, -0.04], r: 0.38, s: [1.42, 0.58, 0.7], c: '#302025', rot: [0, 0, -0.12], part: 'shoulder' },
      { t: 'cap', p: [-0.51, 1.23, 0.015], r: 0.052, h: 2.23, c: '#191114', rot: [0.025, 0, -0.085], part: 'arm' },
      { t: 'cap', p: [0.39, 1.18, -0.045], r: 0.044, h: 2.3, c: '#26171C', rot: [0.045, 0, 0.09], part: 'arm' },
      { t: 'sph', p: [-0.58, 0.1, 0.1], r: 0.105, s: [0.58, 1.65, 0.5], c: '#362127', part: 'hand' },
      { t: 'sph', p: [0.5, 0.045, 0.055], r: 0.09, s: [0.54, 1.9, 0.46], c: '#2A191E', part: 'hand' },
      { t: 'cap', p: [-0.635, 0.02, 0.18], r: 0.016, h: 0.26, c: '#4A2A31', rot: [1.15, 0, -0.12], part: 'finger' },
      { t: 'cap', p: [-0.58, 0.015, 0.2], r: 0.014, h: 0.3, c: '#4A2A31', rot: [1.22, 0, 0.02], part: 'finger' },
      { t: 'cap', p: [0.47, -0.01, 0.16], r: 0.014, h: 0.31, c: '#40232A', rot: [1.2, 0, -0.03], part: 'finger' },
      { t: 'cap', p: [0.525, -0.005, 0.14], r: 0.013, h: 0.27, c: '#40232A', rot: [1.1, 0, 0.13], part: 'finger' },
      { t: 'cap', p: [-0.13, 2.25, -0.03], r: 0.07, h: 0.22, c: '#171114', rot: [0, 0, -0.16], part: 'neck' },
      { t: 'sph', p: [-0.12, 2.49, -0.055], r: 0.31, s: [0.82, 1.22, 0.68], c: '#141013', rot: [0, 0, -0.08], part: 'headBack' },
      { t: 'tor', p: [-0.015, 1.8, 0.17], r: 0.19, tb: 0.015, s: [1.25, 0.52, 1], c: '#702530', rot: [0, 0, 0.04], part: 'rib' },
      { t: 'tor', p: [-0.025, 1.61, 0.165], r: 0.175, tb: 0.013, s: [1.15, 0.48, 1], c: '#572029', rot: [0, 0, -0.04], part: 'rib' },
      { t: 'tor', p: [-0.03, 1.44, 0.15], r: 0.15, tb: 0.011, s: [1.05, 0.45, 1], c: '#421A21', rot: [0, 0, 0.02], part: 'rib' },
      { t: 'sph', p: [-0.02, 1.28, 0.16], r: 0.058, s: [0.65, 1.55, 0.42], c: '#A30F24', em: 0.72, part: 'woundLight' },
    ],
  },
  {
    id: 'S02', tag: 'S2', name: '접힌 사람', role: 'seeker', c: '#65403B', glow: '#9D5149', accessory: '거미처럼 접힌 네 팔다리', shoes: '손발', note: '시야 특화 차단자',
    parts: [
      { t: 'cap', p: [0, 0.83, 0], r: 0.22, h: 0.75, s: [1, 1, 1.6], c: '#68423C', rot: [0, 0, 1.5708], part: 'body' },
      { t: 'sph', p: [-0.48, 0.7, 0.1], r: 0.16, c: '#3B2626', part: 'head' },
      { t: 'cap', p: [-0.58, 0.5, 0], r: 0.055, h: 0.95, c: '#5D3935', rot: [0, 0, -0.75], part: 'arm' },
      { t: 'cap', p: [0.56, 0.54, 0], r: 0.055, h: 1.05, c: '#5D3935', rot: [0, 0, 0.78], part: 'arm' },
      { t: 'cap', p: [-0.38, 0.52, -0.08], r: 0.06, h: 1.0, c: '#724740', rot: [0.2, 0, 0.5], part: 'leg' },
      { t: 'cap', p: [0.38, 0.52, -0.08], r: 0.06, h: 1.0, c: '#724740', rot: [-0.2, 0, -0.5], part: 'leg' },
    ],
  },
  {
    id: 'S03', tag: 'S3', name: '긴 그림자', role: 'seeker', c: '#392C32', glow: '#70505D', accessory: '납작한 실루엣과 긴 팔', shoes: '그림자 발', note: '파이널 압박형',
    parts: [
      { t: 'cap', p: [-0.11, 0.55, 0], r: 0.07, h: 0.95, c: '#30252B', part: 'leg' },
      { t: 'cap', p: [0.11, 0.55, 0], r: 0.07, h: 0.95, c: '#30252B', part: 'leg' },
      { t: 'cap', p: [0, 1.45, 0], r: 0.19, h: 0.85, s: [0.8, 1, 0.42], c: '#3D2D34', part: 'body' },
      { t: 'sph', p: [0, 2.08, 0], r: 0.16, s: [0.9, 1.15, 0.72], c: '#241C22', part: 'head' },
      { t: 'cap', p: [-0.29, 1.05, 0], r: 0.048, h: 1.65, c: '#31242B', part: 'arm' },
      { t: 'cap', p: [0.29, 1.05, 0], r: 0.048, h: 1.65, c: '#31242B', part: 'arm' },
      { t: 'sph', p: [0, 2.09, 0.13], r: 0.025, s: [3, 0.4, 0.4], c: '#8D6675', em: 0.12, part: 'face' },
    ],
  },
  {
    id: 'R01', tag: 'R1', name: '토끼 후드', role: 'runner', c: '#E9E2D2', glow: '#A8D9F0', accessory: '늘어진 귀 · 작은 가방', shoes: '폭신한 발',
    parts: [
      { t: 'sph', p: [0, 0.92, 0], r: 0.43, s: [0.9, 1.25, 0.78], c: '#E9E2D2', part: 'body' },
      { t: 'sph', p: [0, 1.27, 0.27], r: 0.29, s: [1, 0.75, 0.35], c: '#182634', part: 'face' },
      { t: 'sph', p: [-0.1, 1.3, 0.37], r: 0.04, c: '#DDF6FF', em: 0.4, part: 'eye' }, { t: 'sph', p: [0.1, 1.3, 0.37], r: 0.04, c: '#DDF6FF', em: 0.4, part: 'eye' },
      { t: 'cap', p: [-0.2, 1.73, 0], r: 0.065, h: 0.42, c: '#D8D2C7', rot: [0, 0, -0.18], part: 'ear' }, { t: 'cap', p: [0.2, 1.73, 0], r: 0.065, h: 0.42, c: '#D8D2C7', rot: [0, 0, 0.18], part: 'ear' },
      { t: 'sph', p: [-0.17, 0.15, 0.06], r: 0.16, s: [1, 0.65, 1.2], c: '#F3EEE4', part: 'shoe' }, { t: 'sph', p: [0.17, 0.15, 0.06], r: 0.16, s: [1, 0.65, 1.2], c: '#F3EEE4', part: 'shoe' },
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

const animalParts = (kind: 'bear' | 'chick' | 'cat' | 'frog', body: string, accent: string): Part[] => {
  const shared: Part[] = [
    { t: 'sph', p: [0, 0.86, 0], r: 0.43, s: [0.94, 1.18, 0.82], c: body, part: 'body' },
    { t: 'sph', p: [-0.14, 1.08, 0.35], r: 0.052, c: '#17202A', part: 'eye' },
    { t: 'sph', p: [0.14, 1.08, 0.35], r: 0.052, c: '#17202A', part: 'eye' },
    { t: 'sph', p: [-0.18, 0.13, 0.06], r: 0.16, s: [1, 0.62, 1.2], c: accent, part: 'shoe' },
    { t: 'sph', p: [0.18, 0.13, 0.06], r: 0.16, s: [1, 0.62, 1.2], c: accent, part: 'shoe' },
  ]
  if (kind === 'bear') return [...shared,
    { t: 'sph', p: [-0.29, 1.35, 0], r: 0.14, c: '#7D5538', part: 'ear' }, { t: 'sph', p: [0.29, 1.35, 0], r: 0.14, c: '#7D5538', part: 'ear' },
    { t: 'sph', p: [0, 0.96, 0.38], r: 0.17, s: [1, 0.75, 0.45], c: '#D9B98D', part: 'muzzle' }, { t: 'sph', p: [0, 1.04, 0.47], r: 0.055, c: '#2D201B', part: 'nose' },
  ]
  if (kind === 'chick') return [...shared,
    { t: 'cone', p: [0, 0.98, 0.48], r: 0.1, h: 0.2, c: '#E98424', rot: [1.5708, 0, 0], part: 'beak' },
    { t: 'cap', p: [-0.09, 1.5, 0], r: 0.025, h: 0.24, c: '#E9A919', rot: [0, 0, -0.22], part: 'feather' }, { t: 'cap', p: [0, 1.53, 0], r: 0.025, h: 0.28, c: '#E9A919', part: 'feather' }, { t: 'cap', p: [0.09, 1.5, 0], r: 0.025, h: 0.24, c: '#E9A919', rot: [0, 0, 0.22], part: 'feather' },
  ]
  if (kind === 'cat') return [...shared,
    { t: 'cone', p: [-0.26, 1.43, 0], r: 0.17, h: 0.32, c: '#7E8995', rot: [0, 0, -0.08], part: 'ear' }, { t: 'cone', p: [0.26, 1.43, 0], r: 0.17, h: 0.32, c: '#7E8995', rot: [0, 0, 0.08], part: 'ear' },
    { t: 'sph', p: [0, 0.94, 0.44], r: 0.04, c: '#E9A0A5', part: 'nose' }, { t: 'cap', p: [0.42, 0.68, -0.2], r: 0.055, h: 0.65, c: '#697784', rot: [0.35, 0, -0.4], part: 'tail' },
  ]
  return [...shared,
    { t: 'sph', p: [-0.22, 1.45, 0], r: 0.16, c: '#DDF4D4', part: 'eye' }, { t: 'sph', p: [0.22, 1.45, 0], r: 0.16, c: '#DDF4D4', part: 'eye' },
    { t: 'sph', p: [-0.22, 1.47, 0.12], r: 0.07, c: '#17251B', part: 'pupil' }, { t: 'sph', p: [0.22, 1.47, 0.12], r: 0.07, c: '#17251B', part: 'pupil' },
    { t: 'sph', p: [0, 0.67, 0.38], r: 0.23, s: [1.1, 1.1, 0.32], c: '#B8DDA7', part: 'belly' },
  ]
}

const runnerOverrides: Record<string, Partial<Character>> = {
  R02: { tag: 'R2', name: '곰', c: '#A97850', glow: '#D9B98D', accessory: '주둥이가 크다', shoes: '둥근 발', parts: animalParts('bear', '#A97850', '#7D5538') },
  R03: { tag: 'R3', name: '병아리', c: '#F3C642', glow: '#FFE38A', accessory: '말 많음 · 가는 다리', shoes: '새 발', parts: animalParts('chick', '#F3C642', '#E98424') },
  R04: { tag: 'R4', name: '고양이', c: '#8995A1', glow: '#CAD4DC', accessory: '꼬리로 방향을 알린다', shoes: '고양이 발', parts: animalParts('cat', '#8995A1', '#65727E') },
  R05: { tag: 'R5', name: '개구리', c: '#79B873', glow: '#BDE8B4', accessory: '눈이 머리 위', shoes: '물갈퀴 발', parts: animalParts('frog', '#79B873', '#579653') },
}

for (const character of CHARACTERS) {
  const override = runnerOverrides[character.id]
  if (override) Object.assign(character, override)
}

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
  }, [ch])
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

/** 주 술래의 얼굴은 카메라를 따라 도는 평면 이미지가 아니라 머리에 결합된 입체 구조다. */
function SeekerFaceRig() {
  const faceRef = useRef<THREE.Group>(null)
  const jawRef = useRef<THREE.Mesh>(null)
  const leftEyeRef = useRef<THREE.Mesh>(null)
  const rightEyeRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const face = faceRef.current
    const jaw = jawRef.current
    const twitch = Math.sin(clock.elapsedTime * 11.3) > 0.965 ? 1 : 0
    if (face) {
      face.rotation.y = Math.sin(clock.elapsedTime * 0.74) * 0.035 + twitch * 0.12
      face.rotation.z = -0.055 + Math.sin(clock.elapsedTime * 1.31) * 0.018 - twitch * 0.045
    }
    if (jaw) jaw.scale.y = 1 + Math.max(0, Math.sin(clock.elapsedTime * 2.2)) * 0.13 + twitch * 0.18
    const eyeShift = Math.sin(clock.elapsedTime * 0.91) * 0.012
    if (leftEyeRef.current) leftEyeRef.current.position.x = -0.085 + eyeShift
    if (rightEyeRef.current) rightEyeRef.current.position.x = 0.085 + eyeShift
  })

  const toothXs = [-0.075, -0.025, 0.025, 0.075]
  return (
    <group ref={faceRef} position={[-0.12, 2.49, 0.015]}>
      {/* 뒤통수와 분리되지 않는 두꺼운 석고 가면 */}
      <mesh position={[0, 0, 0.18]} scale={[0.76, 1.12, 0.4]} castShadow>
        <sphereGeometry args={[0.3, 16, 12]} />
        <meshStandardMaterial color="#B7ADA2" roughness={0.94} metalness={0.01} />
      </mesh>
      <mesh position={[0, 0.005, 0.284]} scale={[0.77, 1.12, 0.5]}>
        <torusGeometry args={[0.232, 0.018, 8, 20]} />
        <meshStandardMaterial color="#4B3033" roughness={0.85} />
      </mesh>

      {/* 안구가 아니라 깊게 파인 눈구멍 안에서 작은 반사점만 움직인다. */}
      {[-0.09, 0.09].map((x) => (
        <mesh key={`socket-${x}`} position={[x, 0.08, 0.34]} scale={[1, 0.62, 0.38]}>
          <sphereGeometry args={[0.09, 12, 8]} />
          <meshStandardMaterial color="#09070A" roughness={1} />
        </mesh>
      ))}
      <mesh ref={leftEyeRef} position={[-0.085, 0.082, 0.391]}>
        <sphereGeometry args={[0.018, 8, 6]} />
        <meshStandardMaterial color="#D7C8B4" emissive="#6E0B18" emissiveIntensity={0.45} roughness={0.35} />
      </mesh>
      <mesh ref={rightEyeRef} position={[0.085, 0.082, 0.391]}>
        <sphereGeometry args={[0.015, 8, 6]} />
        <meshStandardMaterial color="#AFA293" emissive="#6E0B18" emissiveIntensity={0.32} roughness={0.4} />
      </mesh>

      {/* 검은 구강은 얼굴 표면보다 안쪽에 있고, 턱과 치아는 별도 체적을 가진다. */}
      <mesh ref={jawRef} position={[0, -0.125, 0.342]} scale={[0.78, 1.18, 0.34]}>
        <sphereGeometry args={[0.135, 14, 10]} />
        <meshStandardMaterial color="#080609" roughness={0.92} />
      </mesh>
      <mesh position={[0, -0.218, 0.305]} scale={[0.72, 0.42, 0.5]}>
        <sphereGeometry args={[0.205, 14, 10]} />
        <meshStandardMaterial color="#A69B91" roughness={0.96} />
      </mesh>
      {toothXs.map((x, index) => (
        <group key={`teeth-${x}`}>
          <mesh position={[x, -0.08, 0.444]} rotation={[0, 0, Math.PI]}>
            <coneGeometry args={[0.016 + (index % 2) * 0.004, 0.068, 5]} />
            <meshStandardMaterial color="#C8BBA5" roughness={0.78} />
          </mesh>
          <mesh position={[x * 0.9, -0.18, 0.438]}>
            <coneGeometry args={[0.015, 0.06, 5]} />
            <meshStandardMaterial color="#9E9280" roughness={0.82} />
          </mesh>
        </group>
      ))}

      {/* 균열도 텍스처가 아니라 표면 앞으로 나온 얇은 홈 구조로 만든다. */}
      {[
        [-0.11, 0.2, -0.48, 0.105], [-0.075, 0.15, -0.92, 0.082],
        [0.12, 0.19, 0.58, 0.11], [0.085, 0.145, 1.02, 0.075],
        [-0.135, -0.04, -0.18, 0.095],
      ].map(([x, y, rz, length], index) => (
        <mesh key={`crack-${index}`} position={[x, y, 0.421]} rotation={[0, 0, rz]}>
          <boxGeometry args={[0.012, length, 0.012]} />
          <meshStandardMaterial color="#3B2026" roughness={1} />
        </mesh>
      ))}
      <pointLight position={[0, -0.08, 0.5]} color="#8F0B20" intensity={1.8} distance={1.15} decay={2} />
    </group>
  )
}

/**
 * 캐릭터 메시 (물리 없음) — 다른 리그에 붙이거나 UI 프리뷰에 쓸 때
 */
export function CharacterModel({ id, frozen = false, camo = false, glowPulse = 1, movementRef }: {
  id: string
  /** 빙결 — 얼음 껍질이 덮이고 발광이 죽는다 */
  frozen?: boolean
  /** 위장 (술래 전용) — 배경색으로 흐려지고 발광이 꺼진다 */
  camo?: boolean
  /** 발광 강도 배수 — 숨소리처럼 맥동시킬 때 */
  glowPulse?: number
  /** 실제 수평 이동 속도를 0~1로 정규화한 값 */
  movementRef?: RefObject<number>
}) {
  const ch = byId(id)
  const bodyRef = useRef<THREE.Group>(null)
  const leftFootRef = useRef<THREE.Group>(null)
  const rightFootRef = useRef<THREE.Group>(null)
  const stridePhase = useRef(0)
  const motion = useRef(0)
  // 훅은 반드시 얼리 리턴보다 먼저 — id가 유효하지 않은 프레임에서도 훅 수가 변하지 않는다
  const tagMap = useNameTagTexture(ch)

  useFrame(({ clock }, delta) => {
    const targetMotion = frozen ? 0 : THREE.MathUtils.clamp(movementRef?.current ?? 0, 0, 1)
    motion.current = THREE.MathUtils.damp(motion.current, targetMotion, targetMotion > 0 ? 12 : 18, delta)
    stridePhase.current += delta * THREE.MathUtils.lerp(5.5, 10.5, motion.current)

    const stride = Math.sin(stridePhase.current) * motion.current
    const leftLift = Math.max(0, stride) * 0.055
    const rightLift = Math.max(0, -stride) * 0.055
    if (leftFootRef.current) {
      leftFootRef.current.position.set(0, leftLift, stride * 0.12)
      leftFootRef.current.rotation.x = stride * 0.16
    }
    if (rightFootRef.current) {
      rightFootRef.current.position.set(0, rightLift, -stride * 0.12)
      rightFootRef.current.rotation.x = -stride * 0.16
    }
    if (bodyRef.current) {
      if (ch?.role === 'seeker') {
        const snap = Math.sin(clock.elapsedTime * 13.7) > 0.93 ? 0.055 : 0
        bodyRef.current.position.y = Math.abs(Math.sin(stridePhase.current * 2)) * 0.045 * motion.current + snap
        bodyRef.current.rotation.z = -0.075 + stride * 0.06 + Math.sin(clock.elapsedTime * 1.7) * 0.018
        bodyRef.current.rotation.y = Math.sin(clock.elapsedTime * 8.2) * snap
      } else {
        bodyRef.current.position.y = Math.abs(Math.sin(stridePhase.current * 2)) * 0.025 * motion.current
        bodyRef.current.rotation.z = stride * 0.025
        bodyRef.current.rotation.y = 0
      }
    }
  })

  if (!ch) return null
  const camoOn = camo && ch.role === 'seeker'
  const isFootPart = (part: Part) => part.part === 'leg' || part.part === 'shoe' || part.part === 'sock'
  const renderPart = (p: Part, i: number) => {
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
  }

  return (
    <group>
      <group ref={bodyRef}>
        {ch.parts.map((p, i) => !isFootPart(p) && renderPart(p, i))}
        {ch.id === 'R00' && <SeekerFaceRig />}
      </group>
      <group ref={leftFootRef}>
        {ch.parts.map((p, i) => isFootPart(p) && p.p[0] < 0 && renderPart(p, i))}
      </group>
      <group ref={rightFootRef}>
        {ch.parts.map((p, i) => isFootPart(p) && p.p[0] >= 0 && renderPart(p, i))}
      </group>
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
