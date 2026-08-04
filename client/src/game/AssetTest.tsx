/**
 * 에셋 스타일 테스트 — 학교 테마 전체 미리보기
 * 확인 후 삭제 예정
 */

import { useGLTF } from '@react-three/drei'

interface ModelProps {
  url: string
  position?: [number, number, number]
  scale?: number
  rotation?: [number, number, number]
}

function Model({ url, position = [0, 0, 0], scale = 1, rotation = [0, 0, 0] }: ModelProps) {
  const { scene } = useGLTF(url)
  return <primitive object={scene.clone()} position={position} scale={scale} rotation={rotation} />
}

export default function AssetTest() {
  return (
    <group position={[0, 0, 0]}>
      {/* === 교실 구성 === */}
      <group position={[-8, 0, -8]}>
        {/* 벽 */}
        <Model url="/models/wall.glb" position={[0, 0, 0]} />
        <Model url="/models/wall.glb" position={[1, 0, 0]} />
        <Model url="/models/wall-window-square.glb" position={[2, 0, 0]} />
        <Model url="/models/wall-window-square.glb" position={[3, 0, 0]} />
        <Model url="/models/wall.glb" position={[4, 0, 0]} />
        {/* 뒷벽 */}
        <Model url="/models/wall.glb" position={[0, 0, 4]} rotation={[0, Math.PI, 0]} />
        <Model url="/models/wall-doorway-square.glb" position={[2, 0, 4]} rotation={[0, Math.PI, 0]} />
        <Model url="/models/wall.glb" position={[4, 0, 4]} rotation={[0, Math.PI, 0]} />
        {/* 바닥 */}
        {[0,1,2,3,4].map(x => [0,1,2,3].map(z => (
          <Model key={`f${x}${z}`} url="/models/floor.glb" position={[x, 0, z]} />
        )))}

        {/* 학생 책상+의자 3x2 */}
        {[1, 2, 3].map((x) => [1, 2.5].map((z) => (
          <group key={`desk${x}${z}`}>
            <Model url="/models/desk.glb" position={[x, 0, z]} />
            <Model url="/models/chair.glb" position={[x, 0, z + 0.4]} rotation={[0, Math.PI, 0]} />
          </group>
        )))}

        {/* 교탁 */}
        <Model url="/models/desk.glb" position={[2, 0, 0.5]} />
        <Model url="/models/chairDesk.glb" position={[2, 0, 0.9]} rotation={[0, Math.PI, 0]} />

        {/* 책장 */}
        <Model url="/models/bookcaseOpen.glb" position={[0.3, 0, 2]} rotation={[0, Math.PI / 2, 0]} />
        <Model url="/models/bookcaseClosedWide.glb" position={[0.3, 0, 3]} rotation={[0, Math.PI / 2, 0]} />

        {/* 소품 */}
        <Model url="/models/books.glb" position={[1, 0.75, 1]} />
        <Model url="/models/laptop.glb" position={[2, 0.75, 1]} />
        <Model url="/models/trashcan.glb" position={[4.3, 0, 3.5]} />
        <Model url="/models/pottedPlant.glb" position={[4.3, 0, 0.5]} />

        {/* 천장 조명 */}
        <Model url="/models/lampSquareCeiling.glb" position={[2, 2.8, 2]} />
      </group>

      {/* === 복도 === */}
      <group position={[0, 0, -8]}>
        {/* 벽 */}
        {[0,1,2,3,4,5].map(x => (
          <Model key={`hw${x}`} url="/models/wall.glb" position={[x, 0, 0]} />
        ))}
        {/* 바닥 */}
        {[0,1,2,3,4,5].map(x => (
          <Model key={`hf${x}`} url="/models/floor.glb" position={[x, 0, 1]} />
        ))}

        {/* 소파 + 테이블 (대기 공간) */}
        <Model url="/models/loungeSofa.glb" position={[1, 0, 0.5]} />
        <Model url="/models/tableCoffee.glb" position={[1, 0, 1]} />

        {/* 소품 */}
        <Model url="/models/coatRackStanding.glb" position={[3, 0, 0.3]} />
        <Model url="/models/cardboardBoxClosed.glb" position={[5, 0, 0.5]} />
        <Model url="/models/cardboardBoxOpen.glb" position={[5.5, 0, 0.5]} />
      </group>

      {/* === 화장실 코너 === */}
      <group position={[0, 0, -4]}>
        <Model url="/models/wall.glb" position={[0, 0, 0]} />
        <Model url="/models/wall-doorway-square.glb" position={[1, 0, 0]} />
        <Model url="/models/wall.glb" position={[2, 0, 0]} />
        <Model url="/models/bathroomSink.glb" position={[0.5, 0, 0.8]} />
        <Model url="/models/bathroomMirror.glb" position={[0.5, 1.2, 0.1]} />
        <Model url="/models/toilet.glb" position={[2, 0, 0.8]} />
      </group>

      {/* === 건물 구조 요소 === */}
      <group position={[8, 0, -8]}>
        <Model url="/models/column.glb" position={[0, 0, 0]} />
        <Model url="/models/stairs-center.glb" position={[2, 0, 0]} />
        <Model url="/models/stairs-open.glb" position={[4, 0, 0]} />
        <Model url="/models/wall-corner.glb" position={[0, 0, 2]} />
        <Model url="/models/wall-low.glb" position={[2, 0, 2]} />
        <Model url="/models/border.glb" position={[4, 0, 2]} />
        <Model url="/models/detail-pipe.glb" position={[0, 0, 4]} />
        <Model url="/models/door-rotate-square-a.glb" position={[2, 0, 4]} />
      </group>

      {/* === 외부 벤치 + 화분 === */}
      <group position={[0, 0, 4]}>
        <Model url="/models/bench.glb" position={[0, 0, 0]} />
        <Model url="/models/bench.glb" position={[2, 0, 0]} />
        <Model url="/models/pottedPlant.glb" position={[1, 0, 0]} />
        <Model url="/models/trashcan.glb" position={[3, 0, 0]} />
      </group>

      {/* 조명 */}
      <pointLight position={[-6, 5, -6]} intensity={15} distance={20} color="#ffe9c4" />
      <pointLight position={[2, 5, -6]} intensity={10} distance={15} color="#cfe3ff" />
      <pointLight position={[0, 5, 4]} intensity={8} distance={12} color="#ffe4b5" />
    </group>
  )
}
