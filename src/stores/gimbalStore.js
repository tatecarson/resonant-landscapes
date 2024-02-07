import { create} from 'zustand'


const  useGimbalStore = create((set) => ({
  yaw: 0,
  pitch: 0,
  roll: 0,
  setYaw: (yaw) => set({ yaw }),
  setPitch: (pitch) => set({ pitch }),
  setRoll: (roll) => set({ roll }),
}))

export default useGimbalStore