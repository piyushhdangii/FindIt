import { useEffect, useState } from 'react'
import { ArrowRight, ClipboardList, Heart, Search, Shield, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import AdminReportCard from '../components/AdminReportCard'
import Loading from '../components/Loading'
import { api, apiError } from '../services/api'

export default function AdminPage() {
  const [data, setData] = useState(null)
  const [reports, setReports] = useState([])
  const [reportTotal, setReportTotal] = useState(0)
  const [error, setError] = useState('')
  const [busyReport, setBusyReport] = useState('')

  useEffect(() => {
    Promise.all([api.get('/admin/overview'), api.get('/admin/reports?page=1&limit=3')])
      .then(([overviewResponse, reportResponse]) => {
        setData(overviewResponse.data)
        setReports(reportResponse.data.reports)
        setReportTotal(reportResponse.data.pagination.total)
      })
      .catch((requestError) => setError(apiError(requestError)))
  }, [])

  async function changeStatus(report, status) {
    const reason = window.prompt('Record the reason for this moderation status change:')
    if (reason === null) return
    const note = reason.trim()
    if (note.length < 10 || note.length > 300) {
      setError('Moderation changes require a reason of 10 to 300 characters.')
      return
    }
    setBusyReport(report._id)
    setError('')
    try {
      const { data: response } = await api.patch(`/admin/reports/${report._id}/status`, { status, reason: note })
      setReports((current) => current.map((item) => item._id === report._id ? {
        ...item,
        status: response.report.status,
        moderationHistory: response.report.moderationHistory,
      } : item))
    } catch (requestError) {
      setError(apiError(requestError))
    } finally {
      setBusyReport('')
    }
  }

  if (!data && error) return <section className="content-page"><div className="alert alert-error" role="alert">{error}</div></section>
  if (!data) return <Loading label="Loading community overview" />

  const metrics = [
    ['Community members', data.counts.users, Users, 'blue'],
    ['Lost reports', data.counts.lostReports, Search, 'peach'],
    ['Found reports', data.counts.foundReports, ClipboardList, 'purple'],
    ['Reported claim concerns', data.counts.disputedClaims, Shield, 'amber'],
    ['Items recovered', data.counts.recoveredItems, Heart, 'green'],
  ]

  return (
    <section className="content-page admin-page">
      <div className="page-heading">
        <div><span className="eyebrow">COMMUNITY CARE</span><h1>Admin overview</h1><p>Moderation tools to help keep FindIt useful and trustworthy.</p></div>
        <Link className="button button-primary" to="/claims"><Shield size={16} />Review claims</Link>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="admin-metrics">{metrics.map(([label, value, Icon, color]) => <div className="stat-card" key={label}><span className={`stat-icon ${color}`}><Icon /></span><span><small>{label.toUpperCase()}</small><b>{value}</b></span></div>)}</div>

      <section className="activity-panel admin-overview-section">
        <div className="section-heading"><div><span className="eyebrow">LATEST CHANGES</span><h2>Recent report activity</h2><p>The three latest report updates.</p></div></div>
        {data.recentActivity.length ? (
          <div className="admin-activity-grid">
            {data.recentActivity.slice(0, 3).map((item) => (
              <Link className="admin-activity-card" key={item._id} to={`/reports/${item._id}`}>
                <span className={`activity-mark ${item.type}`}><Search size={17} /></span>
                <span className={`status status-${item.status}`}>{item.status}</span>
                <h3>{item.itemName}</h3>
                <p>{item.type} report · shared by {item.reporter?.name || 'community member'}</p>
                <small>Updated {new Date(item.updatedAt).toLocaleDateString()}</small>
                <ArrowRight className="admin-activity-arrow" size={18} />
              </Link>
            ))}
          </div>
        ) : <div className="empty-inline">No recent report activity.</div>}
      </section>

      <section className="admin-overview-section">
        <div className="section-heading admin-reports-heading">
          <div><span className="eyebrow">COMMUNITY REPORTS</span><h2>Latest reports</h2><p>Review report details and update moderation status.</p></div>
          <Link className="button button-quiet" to="/admin/reports">All reports <ArrowRight size={16} /></Link>
        </div>
        {reports.length ? (
          <div className="admin-report-grid">
            {reports.map((report) => <AdminReportCard key={report._id} report={report} busy={busyReport === report._id} onStatusChange={changeStatus} />)}
          </div>
        ) : <div className="empty-state"><ClipboardList size={24} /><h3>No reports yet</h3><p>Community reports will appear here when they are submitted.</p></div>}
        <p className="admin-report-count">Showing {reports.length} of {reportTotal} reports</p>
      </section>
    </section>
  )
}
