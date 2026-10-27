import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, LockKeyhole, Mail, Search, UserRound } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { apiError } from '../services/api'

export default function AuthPage({ mode = 'login' }) {
  const isRegister = mode === 'register'
  const { user, signIn, signUp } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to="/dashboard" replace />

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (isRegister) await signUp(form)
      else await signIn({ email: form.email, password: form.password })
      navigate(location.state?.from || '/dashboard', { replace: true })
    } catch (requestError) {
      setError(apiError(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="auth-wrap">
      <div className="auth-aside">
        <span className="kicker"><Search size={15} /> THE COMMUNITY WAY HOME</span>
        <h1>{isRegister ? 'A little help can mean everything.' : 'Welcome back to your community.'}</h1>
        <p>Bring the right details together. Let neighbors help reunite people with the things they care about.</p>
        <div className="auth-quote"><span>“</span><p>Sometimes all it takes is the right person seeing the right thing.</p></div>
      </div>
      <div className="auth-card">
        <span className="eyebrow">{isRegister ? 'GET STARTED' : 'YOUR ACCOUNT'}</span>
        <h2>{isRegister ? 'Create your account' : 'Sign in'}</h2>
        <p className="muted">{isRegister ? 'Join your local lost-and-found community.' : 'Pick up where you left off.'}</p>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <form className="form-stack" onSubmit={submit}>
          {isRegister && <label>Your name<div className="input-icon"><UserRound size={17} /><input required minLength="2" maxLength="80" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jamie Taylor" /></div></label>}
          <label>Email address<div className="input-icon"><Mail size={17} /><input required type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></div></label>
          <label>Password<div className="input-icon"><LockKeyhole size={17} /><input required type="password" minLength="8" maxLength="128" autoComplete={isRegister ? 'new-password' : 'current-password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={isRegister ? 'At least 8 characters' : 'Your password'} /></div></label>
          <button className="button button-primary button-wide" disabled={busy}>{busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}<ArrowRight size={17} /></button>
        </form>
        <p className="auth-switch">{isRegister ? 'Already part of FindIt?' : 'New to FindIt?'} <Link to={isRegister ? '/login' : '/register'} state={location.state}>{isRegister ? 'Sign in' : 'Create an account'}</Link></p>
      </div>
    </section>
  )
}
