import {create} from 'zustand'


const  useGimbalPermissionStore = create((set) => ({
    permission: null,
    setPermission: (permission) => set({ permission }),
})) 


export default useGimbalPermissionStore;