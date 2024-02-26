import { create} from 'zustand'


const  useGimbalStore = create((set) => ({

   forwardX: 0,
    forwardY: 0,
    forwardZ: 0,
    setForward: (x, y, z) => set({ forwardX: x, forwardY: y, forwardZ: z }),
    upX: 0,
    upY: 0,
    upZ: 0,
    setUp: (x, y, z) => set({ upX: x, upY: y, upZ: z }),
   setGimbal: () => set({ yaw, pitch, roll }),
}))



export default useGimbalStore