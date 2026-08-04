/**
 * 카메라 상태 — 3D 모드에서 yaw를 Player와 공유
 */

import { create } from 'zustand'

interface CameraStore {
  yaw: number
  setYaw: (yaw: number) => void
}

export const useCameraStore = create<CameraStore>((set) => ({
  yaw: 0,
  setYaw: (yaw) => set({ yaw }),
}))
