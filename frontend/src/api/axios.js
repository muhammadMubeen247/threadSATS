import axios from 'axios';

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
    const message = error.response?.data?.message || 'Something went wrong';
    return Promise.reject(new Error(message));
  }
);

export default api;
export { api };