import { useEffect, useState } from 'react'
import { Bell, CheckCheck, MessageCircle, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import Loading from '../components/Loading'
import { useAuth } from '../context/useAuth'
import { api, apiError } from '../services/api'

export default function NotificationsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  async function load() {
    try { const { data: result } = await api.get('/notifications'); setData(result) } catch (requestError) { setError(apiError(requestError)) } finally { setLoading(false) }
  }
  useEffect(() => {
    let active = true
    api.get('/notifications')
      .then(({ data: result }) => { if (active) setData(result) })
      .catch((requestError) => { if (active) setError(apiError(requestError)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const refresh = () => load()
    window.addEventListener('findit:notifications-refresh', refresh)
    return () => window.removeEventListener('findit:notifications-refresh', refresh)
  }, [])
  async function mark(id) {
    const readAt = new Date().toISOString()
    setData((current) => current && ({
      ...current,
      unread: id === 'all' ? 0 : Math.max(0, current.unread - (current.notifications.some((item) => item._id === id && !item.readAt) ? 1 : 0)),
      notifications: current.notifications.map((item) => id === 'all' || item._id === id ? { ...item, readAt: item.readAt || readAt } : item),
    }))
    try {
      await api.patch(`/notifications/${id}/read`)
      window.dispatchEvent(new Event('findit:notifications-refresh'))
    } catch (requestError) {
      setError(apiError(requestError))
      await load()
    }
  }
  if (loading) return <Loading label="Loading notifications" />
  return <section className="content-page"><div className="page-heading"><div><span className="eyebrow">{isAdmin ? 'MODERATION UPDATES' : 'YOUR UPDATES'}</span><h1>Notifications</h1><p>{isAdmin ? 'Claim concerns and community updates that need your attention.' : 'Helpful updates from your reports and claims.'}</p></div>{data?.unread > 0 && <button className="button button-quiet" onClick={() => mark('all')}><CheckCheck size={16} />Mark all read</button>}</div>{error && <div className="alert alert-error">{error}</div>}{data?.notifications.length ? <div className="notification-list">{data.notifications.map((item) => <article key={item._id} className={`notification-item ${item.readAt ? '' : 'unread'}`}><span className="notification-icon">{item.type === 'match' ? <Sparkles size={18} /> : item.type === 'chat' ? <MessageCircle size={18} /> : <Bell size={18} />}</span><div><h2>{item.title}</h2><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString()}</small></div>{item.relatedId && <Link className="notification-open" to={item.type === 'moderation' ? '/claims' : item.type === 'chat' ? `/chat/${item.relatedId}` : `/reports/${item.relatedId}`} onClick={() => { if (!item.readAt) void mark(item._id) }} aria-label={item.type === 'moderation' ? 'Open disputed claims' : 'Open related item'}>Open</Link>}</article>)}</div> : <div className="empty-state"><Bell size={24} /><h3>All caught up</h3><p>{isAdmin ? 'New claim concerns and moderation updates will appear here.' : 'When a possible match or claim update comes in, you’ll find it here.'}</p></div>}</section>
}
