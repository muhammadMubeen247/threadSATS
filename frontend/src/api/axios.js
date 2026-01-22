import axios from 'axios';
import { useAuthStore } from '@/store/authStore'; // ✅ add

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true, // Important: for cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// ✅ Ensure FormData requests are sent as multipart with boundary
api.interceptors.request.use((config) => {
  const isFormData =
    typeof FormData !== 'undefined' && config.data instanceof FormData;

  if (isFormData) {
    // let the browser set: multipart/form-data; boundary=...
    if (config.headers) {
      delete config.headers['Content-Type'];
      delete config.headers['content-type'];
    }
  }

  return config;
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error?.response?.status;

    // ✅ hard-enforce login-required
    if (status === 401) {
      try {
        useAuthStore.getState().logout();
      } catch {
        // ignore
      }

      // avoid redirect loop
      if (window.location.pathname !== '/login') {
        window.location.replace('/login');
      }
    }

    // ✅ keep the original axios error (preserves status, response, etc.)
    const message = error?.response?.data?.message || error?.message || 'Something went wrong';
    error.userMessage = message;
    return Promise.reject(error);
  }
);

export default api;
export { api };