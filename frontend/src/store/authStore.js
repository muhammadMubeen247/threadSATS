import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      // ✅ persona context
      activeMode: 'public', // 'public' | 'anon'
      personas: null, // { public: {...}, anon: {...} }

      setUser: (user) => set({ user, isAuthenticated: true }),
      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          activeMode: 'public',
          personas: null,
        }),
      setLoading: (isLoading) => set({ isLoading }),

      // ✅ new setters
      setPersonas: (personas) => set({ personas }),
      setActiveMode: (activeMode) => set({ activeMode }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        activeMode: state.activeMode,
        personas: state.personas,
      }),
    }
  )
);