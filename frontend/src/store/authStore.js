import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/api/axios'; // ✅ add

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      // ✅ add: prevents app from trusting localStorage blindly
      sessionChecked: false,

      // ✅ persona context
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

      // ✅ call this once on app start
      checkSession: async () => {
        set({ isLoading: true });
        try {
          const res = await api.get('/users/me/profile');

          // support a couple of response shapes
          const nextUser = res?.user || res;
          const nextPersonas = res?.personas || null;
          const nextActiveMode = res?.activeMode || get().activeMode;

          set({
            user: nextUser,
            personas: nextPersonas ?? get().personas,
            activeMode: nextActiveMode,
            isAuthenticated: true,
            sessionChecked: true,
          });
        } catch (e) {
          // cookie invalid/expired
          get().logout();
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        // ✅ persist only UI hints; session validity comes from checkSession()
        user: state.user,
        activeMode: state.activeMode,
        personas: state.personas,
        // ❌ do not persist isAuthenticated/sessionChecked
      }),
    }
  )
);