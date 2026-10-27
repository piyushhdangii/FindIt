import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true,
  timeout: 15000,
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || ''
    if (error.response?.status === 401 && !['/auth/me', '/auth/login', '/auth/register'].some((path) => url.includes(path))) {
      window.dispatchEvent(new Event('findit:session-expired'))
    }
    return Promise.reject(error)
  },
)

export function apiError(error) {
  return error.response?.data?.message || error.message || 'Something went wrong. Please try again.'
}
