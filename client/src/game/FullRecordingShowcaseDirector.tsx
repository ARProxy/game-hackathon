import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { sendGameMessage } from '../hooks/useWebSocket'
import { useGameStore } from '../stores/gameStore'
import type { PlayerHandle } from './Player'

type Point = { x: number; z: number }

const ROOF_SIGNALS: Record<string, Point> = {
  center: { x: -24, z: -37.75 },
  east: { x: -6.9, z: -27.8 },
  west: { x: -41.1, z: -27.8 },
}

const F3_CONSOLE_PATH: Point[] = [
  { x: -35.4, z: -40.5 },
  { x: -35.4, z: -38.2 },
  { x: -28, z: -38.25 },
  { x: -28, z: -42.8 },
]
const F3_TO_F2_PATH: Point[] = [
  { x: -28, z: -38.25 },
  { x: -35.4, z: -38.25 },
  { x: -35.4, z: -40.55 },
  { x: -33.65, z: -41.42 },
  { x: -33.65, z: -44.9 },
  { x: -36, z: -45.55 },
  { x: -38.35, z: -44.95 },
  { x: -38.35, z: -40.8 },
]
const F2_INTERCOM_PATH: Point[] = [
  { x: -35.4, z: -40.5 },
  { x: -35.4, z: -38.2 },
  { x: -38, z: -36 },
  { x: -38, z: -32 },
  { x: -40, z: -32 },
  { x: -40.15, z: -28 },
]
const F2_TO_F1_PATH: Point[] = [
  { x: -40.15, z: -30 },
  { x: -40, z: -32 },
  { x: -38, z: -32 },
  { x: -38, z: -38 },
  { x: -35.4, z: -38.2 },
  { x: -35.4, z: -40.55 },
  { x: -33.65, z: -41.42 },
  { x: -33.65, z: -44.9 },
  { x: -36, z: -45.55 },
  { x: -38.35, z: -44.95 },
  { x: -38.35, z: -40.8 },
]
const F1_SECURITY_PATH: Point[] = [
  { x: -35.4, z: -40.5 },
  { x: -35.4, z: -38 },
  { x: -10, z: -38 },
  { x: -10, z: -32 },
  { x: -8, z: -32 },
  { x: -7.7, z: -30 },
  { x: -7.7, z: -28 },
]
const F1_TO_FIELD_PATH: Point[] = [
  { x: -7.7, z: -30 },
  { x: -8, z: -32 },
  { x: -10, z: -32 },
  { x: -10, z: -18 },
  { x: -24, z: -18 },
  { x: -24, z: -5.4 },
]
const FIELD_STATION_PATH: Point[] = [
  { x: -24, z: 2 },
  { x: -24, z: 14 },
]
const FIELD_ESCAPE_PATH: Point[] = [{ x: -24, z: 26 }]
const ROOF_TO_F3_STAIR_PATH: Point[] = [
  { x: -36, z: -38.35 },
  { x: -36, z: -39.7 },
  { x: -36, z: -40.75 },
  { x: -33.65, z: -41.42 },
  { x: -33.65, z: -44.9 },
  { x: -36, z: -45.55 },
  { x: -38.35, z: -44.95 },
  { x: -38.35, z: -40.8 },
]

const _position = new THREE.Vector3()
let routeTargetX = Number.NaN
let routeTargetZ = Number.NaN
let bestRouteDistance = Number.POSITIVE_INFINITY
let stalledRouteSeconds = 0

function moveToward(
  playerRef: React.RefObject<PlayerHandle | null>,
  point: Point,
  delta: number,
  speed = 4.15,
): boolean {
  const group = playerRef.current?.getGroup()
  if (!group) return false
  group.getWorldPosition(_position)
  const dx = point.x - _position.x
  const dz = point.z - _position.z
  const distance = Math.hypot(dx, dz)
  // The capsule cannot touch authored wall-edge waypoints exactly. A half-metre
  // arrival radius keeps the route moving while still staying inside every
  // server-authoritative mission/transition radius.
  if (distance <= 0.55) return true
  const targetRotation = Math.atan2(dx, dz)
  const rotationDelta = THREE.MathUtils.euclideanModulo(
    targetRotation - group.rotation.y + Math.PI,
    Math.PI * 2,
  ) - Math.PI
  group.rotation.y += rotationDelta * (1 - Math.exp(-12 * delta))
  if (point.x !== routeTargetX || point.z !== routeTargetZ) {
    routeTargetX = point.x
    routeTargetZ = point.z
    bestRouteDistance = distance
    stalledRouteSeconds = 0
  } else if (distance < bestRouteDistance - 0.04) {
    bestRouteDistance = distance
    stalledRouteSeconds = 0
  } else {
    stalledRouteSeconds += delta
  }
  const clearsAuthoredDoorLeaf = stalledRouteSeconds >= 1.5
  const step = Math.min(distance, clearsAuthoredDoorLeaf ? 2.8 : speed * delta)
  if (clearsAuthoredDoorLeaf) {
    bestRouteDistance = Number.POSITIVE_INFINITY
    stalledRouteSeconds = 0
  }
  playerRef.current?.moveBy(dx / distance * step, 0, dz / distance * step)
  return false
}

function sendAction(action_type: string, extra: Record<string, unknown> = {}) {
  sendGameMessage({ type: 'action', payload: { action_type, ...extra } })
}

export default function FullRecordingShowcaseDirector({ playerRef }: {
  playerRef: React.RefObject<PlayerHandle | null>
}) {
  const stageKey = useRef('')
  const stageStartedAt = useRef(0)
  const waypointIndex = useRef(0)
  const arrivedAt = useRef<number | null>(null)
  const actionStep = useRef(0)
  const speechStep = useRef(0)
  const lastActionAt = useRef(-Infinity)
  const holdUntil = useRef(0)
  const roofTransitionPath = useRef<Point[]>([])
  const frozenSeenAt = useRef<number | null>(null)
  const rescuedAt = useRef<number | null>(null)

  const resetStage = (key: string, now: number) => {
    stageKey.current = key
    stageStartedAt.current = now
    waypointIndex.current = 0
    arrivedAt.current = null
    actionStep.current = 0
    speechStep.current = 0
    lastActionAt.current = -Infinity
    holdUntil.current = 0
    roofTransitionPath.current = []
    frozenSeenAt.current = null
    rescuedAt.current = null
  }

  const followPath = (path: Point[], delta: number): boolean => {
    const target = path[waypointIndex.current]
    if (!target) return true
    if (moveToward(playerRef, target, delta)) waypointIndex.current += 1
    return waypointIndex.current >= path.length
  }

  const openDoorNear = (point: Point, now: number) => {
    const group = playerRef.current?.getGroup()
    if (!group || now - lastActionAt.current < 1.25) return false
    group.getWorldPosition(_position)
    if (Math.hypot(point.x - _position.x, point.z - _position.z) > 1.7) return false
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))
    lastActionAt.current = now
    holdUntil.current = now + 0.45
    return true
  }

  useFrame(({ clock }, delta) => {
    const store = useGameStore.getState()
    const progression = store.verticalProgression
    const player = store.players[store.playerId]
    if (!progression || !player || store.phase === 'result') return

    const now = clock.elapsedTime
    const key = `${progression.phase}:${player.position.floor}:${store.phase}`
    if (stageKey.current !== key) resetStage(key, now)
    const elapsed = now - stageStartedAt.current
    const group = playerRef.current?.getGroup()
    if (group) {
      group.getWorldPosition(_position)
      ;(window as Window & { __fullRecordingShowcase?: unknown }).__fullRecordingShowcase = {
        key,
        waypointIndex: waypointIndex.current,
        actionStep: actionStep.current,
        speechStep: speechStep.current,
        playerStatus: player.status,
        frozenSeenAt: frozenSeenAt.current,
        rescuedAt: rescuedAt.current,
        position: { x: _position.x, y: _position.y, z: _position.z },
      }
      document.body.dataset.fullRecordingShowcase = JSON.stringify({
        key,
        waypointIndex: waypointIndex.current,
        x: Number(_position.x.toFixed(2)),
        y: Number(_position.y.toFixed(2)),
        z: Number(_position.z.toFixed(2)),
      })
    }

    if (progression.phase === 'rooftop_intro') {
      const openingLines = [
        '옥상 신호 순서를 같이 확인하자',
        '가운데 신호 다음 위치를 알려 줘',
        '마지막 신호까지 같이 맞추자',
      ]
      const speechTimes = [1.2, 3.1, 5.0]
      if (speechStep.current < openingLines.length && elapsed >= speechTimes[speechStep.current]) {
        sendGameMessage({
          type: 'speech',
          payload: { transcript: openingLines[speechStep.current], is_final: true },
        })
        speechStep.current += 1
      }
      if (elapsed < 6.3) return
      const nextSignal = store.rooftopSignal?.nextSignalId
      const target = nextSignal ? ROOF_SIGNALS[nextSignal] : undefined
      if (nextSignal && target) {
        const arrived = moveToward(playerRef, target, delta)
        if ((arrived || elapsed >= 12) && now - lastActionAt.current >= 1.4) {
          sendAction('interact_stage_mission', { signal_id: nextSignal })
          lastActionAt.current = now
        }
      }
      return
    }

    if (progression.phase === 'floor_3' && player.position.floor === 'ROOF') {
      if (now < holdUntil.current) return
      if (roofTransitionPath.current.length === 0) {
        const group = playerRef.current?.getGroup()
        if (!group) return
        group.getWorldPosition(_position)
        const ringApproach = _position.x > -18
          ? [{ x: -10, z: -28 }, { x: -10, z: -38 }, { x: -24, z: -38 }]
          : _position.x < -32
            ? [{ x: -38, z: -28 }, { x: -38, z: -38 }]
            : [{ x: -24, z: -38 }]
        roofTransitionPath.current = [...ringApproach, ...ROOF_TO_F3_STAIR_PATH]
      }
      const arrived = followPath(roofTransitionPath.current, delta)
      if (openDoorNear({ x: -36, z: -39.7 }, now)) return
      if ((arrived || elapsed >= 22) && now - lastActionAt.current >= 1.2) {
        sendAction('cross_rooftop_stair_boundary', { direction: 'down' })
        lastActionAt.current = now
      }
      return
    }

    if (progression.phase === 'floor_3' && player.position.floor === 'F3') {
      if (now < holdUntil.current) return
      const arrived = followPath(F3_CONSOLE_PATH, delta)
      if (openDoorNear({ x: -28, z: -38.25 }, now)) return
      if (!arrived && elapsed < 14) return
      if (arrivedAt.current === null) arrivedAt.current = now
      const sinceArrival = now - arrivedAt.current
      if (actionStep.current === 0 && sinceArrival >= 0.6) {
        sendAction('interact_stage_mission')
        actionStep.current = 1
      } else if (actionStep.current === 1 && sinceArrival >= 1.8) {
        sendGameMessage({
          type: 'speech',
          payload: {
            // 옥상에서 반복해 프로필에 들어간 미션 단어를 일부러 말한다.
            // 영상은 여기서 빙결 → AI 구조 → 우회 표현 성공을 보여 준다.
            transcript: '방송 신호를 그대로 읽어 볼게',
            is_final: true,
          },
        })
        actionStep.current = 2
        lastActionAt.current = now
      }
      if (player.status === 'frozen') {
        if (frozenSeenAt.current === null) {
          frozenSeenAt.current = now
        }
        return
      }
      if (actionStep.current === 2 && frozenSeenAt.current !== null) {
        rescuedAt.current ??= now
        if (now - rescuedAt.current >= 1.25) {
          sendGameMessage({
            type: 'speech',
            payload: {
              transcript: '은빛 금속의 작고 긴 물건으로 잠긴 곳을 개방해',
              is_final: true,
            },
          })
          actionStep.current = 3
          lastActionAt.current = now
        }
      } else if (actionStep.current === 2 && sinceArrival >= 5.5 && now - lastActionAt.current >= 2.5) {
        // 분석 응답이 늦었을 때도 금기어 장면을 한 번 더 시도한다.
        sendGameMessage({
          type: 'speech',
          payload: { transcript: '그 신호부터 다시 확인해', is_final: true },
        })
        lastActionAt.current = now
      } else if (actionStep.current >= 3 && sinceArrival >= 16 && now - lastActionAt.current >= 4) {
        sendAction('interact_stage_mission')
        lastActionAt.current = now
      }
      return
    }

    if (progression.phase === 'floor_2' && player.position.floor === 'F3') {
      if (now < holdUntil.current) return
      const arrived = followPath(F3_TO_F2_PATH, delta)
      if (openDoorNear({ x: -36, z: -39.7 }, now)) return
      if ((arrived || elapsed >= 24) && now - lastActionAt.current >= 1.2) {
        sendAction('use_floor_transition', { route: 'west' })
        lastActionAt.current = now
      }
      return
    }

    if (progression.phase === 'floor_2' && player.position.floor === 'F2') {
      if (now < holdUntil.current) return
      const arrived = followPath(F2_INTERCOM_PATH, delta)
      if (openDoorNear({ x: -40, z: -32 }, now)) return
      if (!arrived && elapsed < 14) return
      if (arrivedAt.current === null) arrivedAt.current = now
      const sinceArrival = now - arrivedAt.current
      if (actionStep.current === 0 && sinceArrival >= 0.6) {
        sendAction('interact_stage_mission')
        actionStep.current = 1
      } else if (actionStep.current >= 1 && sinceArrival >= 7 && now - lastActionAt.current >= 3) {
        sendGameMessage({
          type: 'speech',
          payload: { transcript: '빨간 삼각형, 파란 원, 노란 별', is_final: true },
        })
        lastActionAt.current = now
      }
      return
    }

    if (progression.phase === 'floor_1' && player.position.floor === 'F2') {
      if (now < holdUntil.current) return
      const arrived = followPath(F2_TO_F1_PATH, delta)
      if (openDoorNear({ x: -36, z: -39.7 }, now)) return
      if ((arrived || elapsed >= 24) && now - lastActionAt.current >= 1.2) {
        sendAction('use_floor_transition', { route: 'west' })
        lastActionAt.current = now
      }
      return
    }

    if (progression.phase === 'floor_1' && player.position.floor === 'F1') {
      if (now < holdUntil.current) return
      const arrived = followPath(F1_SECURITY_PATH, delta)
      if (openDoorNear({ x: -8, z: -32 }, now)) return
      if (!arrived && elapsed < 14) return
      if (arrivedAt.current === null) arrivedAt.current = now
      const sinceArrival = now - arrivedAt.current
      if (actionStep.current === 0 && sinceArrival >= 0.7) {
        sendAction('interact_stage_mission')
        actionStep.current = 1
      }
      const commands = ['직진', '왼쪽', '오른쪽']
      const commandTimes = [2.2, 7.2, 12.2]
      if (speechStep.current < commands.length && sinceArrival >= commandTimes[speechStep.current]) {
        sendGameMessage({
          type: 'speech',
          payload: { transcript: commands[speechStep.current], is_final: true },
        })
        speechStep.current += 1
      }
      if (speechStep.current >= commands.length && sinceArrival >= 18 && now - lastActionAt.current >= 3) {
        sendAction('interact_stage_mission')
        lastActionAt.current = now
      }
      return
    }

    if (progression.phase === 'field_final' && player.position.floor === 'F1') {
      if (actionStep.current === 0 && elapsed >= 0.9) {
        sendAction('showcase_partner_caught', { target_id: 'partner-2' })
        actionStep.current = 1
        holdUntil.current = now + 4.2
        lastActionAt.current = now
        return
      }
      if (now < holdUntil.current) return
      if ((followPath(F1_TO_FIELD_PATH, delta) || elapsed >= 28) && now - lastActionAt.current >= 1.2) {
        sendAction('use_floor_transition', { route: 'field' })
        lastActionAt.current = now
      }
      return
    }

    if (
      progression.phase === 'field_final'
      && store.phase === 'playing'
      && player.position.floor !== 'F1'
    ) {
      if (!followPath(FIELD_STATION_PATH, delta) && elapsed < 14) return
      if (arrivedAt.current === null) arrivedAt.current = now
      if (now - arrivedAt.current >= 0.7 && now - lastActionAt.current >= 2.2) {
        sendAction('interact_stage_mission')
        lastActionAt.current = now
      }
      return
    }

    if (store.phase === 'final_spell') {
      if (elapsed >= 3.5 && now - lastActionAt.current >= 3) {
        sendGameMessage({
          type: 'spell',
          payload: { spell_text: '달빛 교정 탈출' },
        })
        lastActionAt.current = now
      }
      return
    }

    if (progression.phase === 'escape_open' && store.phase === 'escape') {
      // 주문 성공 직후 바로 화면을 끝내지 않고, 열린 출구와 추격을 보여 준다.
      if (elapsed < 5.5) return
      if (!followPath(FIELD_ESCAPE_PATH, delta)) return
      if (arrivedAt.current === null) arrivedAt.current = now
      if (now - arrivedAt.current >= 0.7 && now - lastActionAt.current >= 2) {
        sendAction('vertical_escape')
        lastActionAt.current = now
      }
    }
  })

  return null
}
