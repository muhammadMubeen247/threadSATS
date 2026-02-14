import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/api/axios';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      sessionChecked: false,

      activeMode: 'public',
      personas: null,

      setUser: (user) => set({ user, isAuthenticated: true }),
      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          activeMode: 'public',
          personas: null,
          sessionChecked: true,
        }),
      setLoading: (isLoading) => set({ isLoading }),

      setPersonas: (personas) => set({ personas }),
      setActiveMode: (activeMode) => set({ activeMode }),

      checkSession: async () => {
        set({ isLoading: true });
        try {
          const res = await api.get('/users/me/profile');

          // /users/me/profile in this app returns persona context (not a user object)
          const nextActiveMode = res?.activeMode || get().activeMode || 'public';
          const persona = res?.persona || null;

          set((state) => ({
            // ✅ only update user if backend explicitly returns it
            user: res?.user ? res.user : state.user,

            activeMode: nextActiveMode,

            // ✅ ensure personas is at least an object and merge the returned persona
            personas: persona
              ? { ...(state.personas || {}), [nextActiveMode]: persona }
              : state.personas,

            isAuthenticated: true,
            sessionChecked: true,
          }));
        } catch (e) {
          get().logout();
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        activeMode: state.activeMode,
        personas: state.personas,
      }),
    }
  )
);