import { io } from 'socket.io-client';

let socket = null;

function getSocketUrl() {
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  return apiBase.replace(/\/api\/?$/, '');
}

export function connectSocket() {
  const url = getSocketUrl();

  if (!socket) {
    socket = io(url, {
      withCredentials: true,
      transports: ['websocket', 'polling'], // ✅ allow fallback in dev
      reconnection: true,
      timeout: 10000,
    });

    // optional: debug once
    socket.on('connect_error', (err) => {
      console.warn('[socket] connect_error:', err?.message || err);
    });
  } else if (!socket.connected) {
    // ✅ critical: if it exists but got disconnected, reconnect
    socket.connect();
  }

  return socket;
}

export function disconnectSocket() {
  if (!socket) return;
  socket.disconnect();
  socket = null;
}

export function getSocket() {
  return socket;
}