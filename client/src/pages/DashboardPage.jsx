import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, ClipboardList, Heart, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import ReportCard from '../components/ReportCard'
import Loading from '../components/Loading'
import { useAuth } from '../context/useAuth'
import { api, apiError } from '../services/api'

export default function DashboardPage() {
  const { user } = useAuth()
  const [reports, setReports] = useState([])
  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [recoveringId, setRecoveringId] = useState('')
  useEffect(() => {
    Promise.all([api.get('/reports/mine'), api.get('/claims')])
      .then(([reportResponse, claimResponse]) => { setReports(reportResponse.data.reports); setClaims(claimResponse.data.claims) })
      .catch((requestError) => setError(apiError(requestError)))
      .finally(() => setLoading(false))
  }, [])
  async function removeReport(id) {
    if (!window.confirm('Delete this report? This cannot be undone.')) return
    try {
      await api.delete(`/reports/${id}`)
      setReports((current) => current.filter((report) => report._id !== id))
    } catch (requestError) {
      setError(apiError(requestError))
    }
  }
  async function markRecovered(report) {
    if (!window.confirm(`Mark “${report.itemName}” as recovered? It will leave active reports but remain in your history.`)) return
    setError('')
    setRecoveringId(report._id)
    try {
      const { data } = await api.patch(`/reports/${report._id}/recovered`)
      setReports((current) => current.map((item) => item._id === report._id ? data.report : item))
    } catch (requestError) {
      setError(apiError(requestError))
    } finally {
      setRecoveringId('')
    }
  }
  if (loading) return <Loading label="Loading your dashboard" />
  return (
    <section className="content-page dashboard-page">
      <div className="dashboard-welcome"><div><span className="eyebrow">YOUR FINdit SPACE</span><h1>Good to see you, {user?.name?.split(' ')[0]}.</h1><p>Every report you share gives someone a better chance of finding what matters.</p></div><Link className="button button-primary" to="/reports/new"><Plus size={17} />New report</Link></div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="stat-grid"><div className="stat-card"><span className="stat-icon peach"><ClipboardList /></span><span><small>YOUR REPORTS</small><b>{reports.length}</b></span></div><div className="stat-card"><span className="stat-icon blue"><Search /></span><span><small>OPEN REPORTS</small><b>{reports.filter((r) => ['open', 'matched'].includes(r.status)).length}</b></span></div><div className="stat-card"><span className="stat-icon green"><Heart /></span><span><small>CLAIMS TO FOLLOW</small><b>{claims.length}</b></span></div></div>
      <div className="dashboard-columns">
        <section className="dashboard-section"><div className="section-heading"><div><span className="eyebrow">YOUR ACTIVITY</span><h2>Your reports</h2></div><Link className="text-link" to="/reports/new">Add one <ArrowRight size={15} /></Link></div>{reports.length ? <div className="report-grid report-grid-small">{reports.map((report) => <div className="dashboard-report" key={report._id}><ReportCard report={report} /><div className="card-actions"><Link className="text-link" to={`/matches/${report._id}`}>See possible matches <ArrowRight size={14} /></Link>{report.type === 'lost' && report.status === 'recovered' && <span className="status status-recovered">Recovered</span>}{report.type === 'lost' && ['open', 'matched'].includes(report.status) && <button className="text-link recover-report" disabled={recoveringId === report._id} onClick={() => markRecovered(report)}><CheckCircle2 size={15} />{recoveringId === report._id ? 'Updating…' : 'Mark recovered'}</button>}<Link className="icon-button" aria-label={`Edit ${report.itemName}`} to={`/reports/${report._id}/edit`}><Pencil size={15} /></Link><button className="icon-button" aria-label={`Delete ${report.itemName}`} onClick={() => removeReport(report._id)}><Trash2 size={16} /></button></div></div>)}</div> : <div className="empty-state compact"><ClipboardList size={22} /><h3>No reports yet</h3><p>Share your first lost or found item to get started.</p><Link className="button button-primary" to="/reports/new">Create a report</Link></div>}</section>
        <aside className="side-panel"><span className="eyebrow">CLAIM TRACKER</span><h2>Your claims</h2><p className="muted">See updates from the people helping verify a found item.</p>{claims.length ? <div className="claim-list">{claims.slice(0, 5).map((claim) => <div className="claim-row" key={claim._id}><span className={`status status-${claim.status}`}>{claim.status}</span><b>{claim.report?.itemName || 'Item claim'}</b><small>Updated {new Date(claim.updatedAt).toLocaleDateString()}</small></div>)}</div> : <div className="empty-inline"><Heart size={19} /><span>No claims to follow yet.</span></div>}<Link className="text-link" to="/claims">View all claims <ArrowRight size={15} /></Link></aside>
      </div>
    </section>
  )
}
