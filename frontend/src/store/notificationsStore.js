import { create } from 'zustand';

export const useNotificationsStore = create((set, get) => ({
  unread: 0,
  unreadDmCount: 0,
  items: [],

  setUnread: (unread) => set({ unread: Math.max(0, Number(unread) || 0) }),
  setUnreadDmCount: (count) => set({ unreadDmCount: Math.max(0, Number(count) || 0) }),
  incUnreadDmCount: () => set((s) => ({ unreadDmCount: s.unreadDmCount + 1 })),
  decUnreadDmCount: () => set((s) => ({ unreadDmCount: Math.max(0, s.unreadDmCount - 1) })),

  // Replace entire list (page load)
  setItems: (items) => set({ items: Array.isArray(items) ? items : [] }),

  // Upsert a notification pushed from socket (moves to top)
  upsertFromSocket: (notification) => {
    if (!notification?._id) return;

    set((state) => {
      const idx = state.items.findIndex((x) => x?._id === notification._id);
      if (idx === -1) return { items: [notification, ...state.items] };

      const next = state.items.slice();
      next.splice(idx, 1);
      return { items: [notification, ...next] };
    });
  },

  // Mark locally as read (server also resets count)
  markReadLocal: (id) => {
    set((state) => ({
      items: state.items.map((n) =>
        n?._id === id ? { ...n, isRead: true, count: 0, readAt: new Date().toISOString() } : n
      ),
    }));
  },

  markAllReadLocal: () => {
    set((state) => ({
      items: state.items.map((n) => ({ ...n, isRead: true, count: 0, readAt: new Date().toISOString() })),
    }));
  },
}));