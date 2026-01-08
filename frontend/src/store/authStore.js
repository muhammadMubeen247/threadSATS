import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      
      setUser: (user) => set({ user, isAuthenticated: true }),
      
      logout: () => set({ user: null, isAuthenticated: false }),
      
      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name: 'auth-storage',
    }
  )
);

// export default useAuthStore;