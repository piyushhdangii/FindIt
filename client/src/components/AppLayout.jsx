import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, CircleHelp, Compass, LayoutDashboard, LogOut, MapPin, Menu, MessageCircle, Plus, Search, Shield, Sparkles, Tag, UserRound, X } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { api, apiError } from '../services/api'
import { connectChatSocket, disconnectChatSocket } from '../services/chatSocket'

const links = [
  { to: '/', label: 'Home', icon: Compass, private: true },
  { to: '/reports', label: 'Explore', icon: Search, private: true },
  { to: '/dashboard', label: 'My dashboard', icon: LayoutDashboard, private: true },
  { to: '/claims', label: 'Claims', icon: Shield, private: true },
  { to: '/reports/new', label: 'Post a report', icon: Plus, private: true },
  { to: '/notifications', label: 'Notifications', icon: Bell, private: true },
  { to: '/chat', label: 'Chat', icon: MessageCircle, private: true },
]

const adminLinks = [
  { to: '/admin', label: 'Admin overview', icon: Shield },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/claims', label: 'Claims', icon: Shield },
]

function routeSticker(pathname) {
  if (pathname === '/') return null
  if (pathname.startsWith('/admin')) return { label: 'MOD TEAM', Icon: Shield, tone: 'admin' }
  if (pathname === '/claims') return { label: 'CLAIM CHECK', Icon: Shield, tone: 'claim' }
  if (pathname === '/notifications') return { label: 'NEW LEADS', Icon: Bell, tone: 'notice' }
  if (pathname.startsWith('/chat')) return { label: 'PRIVATE', Icon: MessageCircle, tone: 'chat' }
  if (pathname === '/reports/new' || /^\/reports\/[^/]+\/edit$/.test(pathname)) return { label: 'LOST / FOUND', Icon: MapPin, tone: 'report' }
  if (/^\/reports\/[^/]+$/.test(pathname)) return { label: 'ITEM TAG', Icon: Tag, tone: 'detail' }
  if (pathname === '/reports') return { label: 'SEARCH', Icon: Search, tone: 'search' }
  if (pathname.startsWith('/matches')) return { label: 'POSSIBLE MATCH', Icon: Sparkles, tone: 'match' }
  if (pathname === '/dashboard') return { label: 'MY ITEMS', Icon: LayoutDashboard, tone: 'report' }
  if (pathname === '/login' || pathname === '/register') return { label: 'COMMUNITY', Icon: Search, tone: 'search' }
  return { label: 'FINDIT', Icon: Tag, tone: 'search' }
}

export default function AppLayout() {
  const { user, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [unread, setUnread] = useState(0)
  const navigate = useNavigate()
  const location = useLocation()
  const visibleLinks = user?.role === 'admin'
    ? adminLinks
    : links.filter((link) => !link.private || user)
  const isLoginPage = location.pathname === '/login'
  const isRegisterPage = location.pathname === '/register'
  const isAuthPage = isLoginPage || isRegisterPage
  const sticker = routeSticker(location.pathname)

  useEffect(() => {
    if (!user) return
    const refresh = () => api.get('/notifications?limit=1')
      .then(({ data }) => setUnread(data.unread))
      .catch(() => setUnread(0))
    refresh()
    window.addEventListener('findit:notifications-refresh', refresh)
    return () => window.removeEventListener('findit:notifications-refresh', refresh)
  }, [user, location.pathname])

  useEffect(() => {
    if (!user?._id) {
      disconnectChatSocket()
      return undefined
    }
    const socket = connectChatSocket(user._id)
    const onNotification = () => window.dispatchEvent(new Event('findit:notifications-refresh'))
    const refresh = () => api.get('/notifications?limit=1')
      .then(({ data }) => setUnread(data.unread))
      .catch(() => setUnread(0))
    socket.on('notification:new', onNotification)
    socket.on('connect', refresh)
    return () => {
      socket.off('notification:new', onNotification)
      socket.off('connect', refresh)
      disconnectChatSocket()
    }
  }, [user?._id])

  async function logout() {
    try {
      await signOut()
      navigate('/')
    } catch (error) {
      setNotice(apiError(error))
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/" onClick={() => setMenuOpen(false)}><span className="brand-mark"><Search size={19} /></span>findit<span className="brand-dot">.</span></Link>
        {visibleLinks.length > 0 && <button className="mobile-menu" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>}
        <nav className={`main-nav ${menuOpen ? 'nav-open' : ''}`} aria-label="Main navigation">
          {visibleLinks.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/' || to === '/reports' || to === '/admin'} onClick={() => setMenuOpen(false)}><Icon size={16} />{label}{to === '/notifications' && user && unread > 0 && <span className="unread-count">{unread > 99 ? '99+' : unread}</span>}</NavLink>)}
        </nav>
        <div className="account-nav">
          {user ? <>
            <span className="user-greeting"><UserRound size={16} />{user.name.split(' ')[0]}</span>
            <button className="button button-quiet button-small" onClick={logout}><LogOut size={15} />Sign out</button>
          </> : <>
            <Link className={`button button-small ${isLoginPage ? 'button-primary' : 'button-quiet'}`} to="/login" aria-current={isLoginPage ? 'page' : undefined}>Sign in</Link>
            <Link className={`button button-small ${isRegisterPage || !isAuthPage ? 'button-primary' : 'button-quiet'}`} to="/register" aria-current={isRegisterPage ? 'page' : undefined}>Create account</Link>
          </>}
        </div>
      </header>
      {notice && <div className="toast" role="alert">{notice}<button onClick={() => setNotice('')}>Dismiss</button></div>}
      <main className="page-main">
        {sticker && <div className={`route-sticker route-sticker-${sticker.tone}`} aria-hidden="true"><sticker.Icon className="route-sticker-icon" size={38} strokeWidth={2.2} /><span>{sticker.label}</span><small>FIELD NOTE</small><i /></div>}
        <Outlet />
      </main>
      <footer className="footer"><Link className="brand brand-footer" to="/"><span className="brand-mark"><Search size={15} /></span>findit<span className="brand-dot">.</span></Link><span>Good things find their way home.</span><Link to={user?.role === 'admin' ? '/claims' : '/reports'}>{user?.role === 'admin' ? 'Review claims' : 'Browse community reports'} <CircleHelp size={14} /></Link></footer>
    </div>
  )
}
