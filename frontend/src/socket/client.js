import { io } from 'socket.io-client';

let socket = null;

function getSocketUrl() {
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  return apiBase.replace(/\/api\/?$/, '');
}

export function connectSocket() {
  if (socket?.connected) return socket;

  socket = io(getSocketUrl(), {
    withCredentials: true,
    transports: ['websocket'],
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (!socket) return;
  socket.disconnect();
  socket = null;
}