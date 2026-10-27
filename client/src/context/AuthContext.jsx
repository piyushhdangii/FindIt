import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../services/api'
import { AuthContext } from './authContextValue'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const authRevision = useRef(0)

  useEffect(() => {
    const handleExpiredSession = () => setUser(null)
    window.addEventListener('findit:session-expired', handleExpiredSession)
    const revision = authRevision.current
    api.get('/auth/me')
      .then(({ data }) => {
        if (authRevision.current === revision) setUser(data.user)
      })
      .catch(() => {
        if (authRevision.current === revision) setUser(null)
      })
      .finally(() => setLoading(false))
    return () => window.removeEventListener('findit:session-expired', handleExpiredSession)
  }, [])

  const value = useMemo(() => ({
    user,
    loading,
    async signIn(credentials) {
      const revision = ++authRevision.current
      try {
        const { data } = await api.post('/auth/login', credentials)
        if (authRevision.current === revision) setUser(data.user)
        return data.user
      } finally {
        setLoading(false)
      }
    },
    async signUp(details) {
      const revision = ++authRevision.current
      try {
        const { data } = await api.post('/auth/register', details)
        if (authRevision.current === revision) setUser(data.user)
        return data.user
      } finally {
        setLoading(false)
      }
    },
    async signOut() {
      const revision = ++authRevision.current
      try {
        await api.post('/auth/logout')
        if (authRevision.current === revision) setUser(null)
      } finally {
        setLoading(false)
      }
    },
    refresh: async () => {
      const revision = ++authRevision.current
      const { data } = await api.get('/auth/me')
      if (authRevision.current === revision) setUser(data.user)
      return data.user
    },
  }), [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
