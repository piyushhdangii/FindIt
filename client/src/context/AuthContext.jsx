import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'
import { AuthContext } from './authContextValue'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const handleExpiredSession = () => setUser(null)
    window.addEventListener('findit:session-expired', handleExpiredSession)
    api.get('/auth/me')
      .then(({ data }) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
    return () => window.removeEventListener('findit:session-expired', handleExpiredSession)
  }, [])

  const value = useMemo(() => ({
    user,
    loading,
    async signIn(credentials) {
      const { data } = await api.post('/auth/login', credentials)
      setUser(data.user)
      return data.user
    },
    async signUp(details) {
      const { data } = await api.post('/auth/register', details)
      setUser(data.user)
      return data.user
    },
    async signOut() {
      await api.post('/auth/logout')
      setUser(null)
    },
    refresh: async () => {
      const { data } = await api.get('/auth/me')
      setUser(data.user)
      return data.user
    },
  }), [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
