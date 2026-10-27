import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react'
import { Link } from 'react-router-dom'
import AdminReportCard from '../components/AdminReportCard'
import Loading from '../components/Loading'
import { api, apiError } from '../services/api'

const pageSize = 9

export default function AdminReportsPage() {
  const [page, setPage] = useState(1)
  const [loaded, setLoaded] = useState({ page: 0, data: null })
  const [error, setError] = useState('')
  const [busyReport, setBusyReport] = useState('')
  const data = loaded.page === page ? loaded.data : null

  useEffect(() => {
    let active = true
    api.get(`/admin/reports?page=${page}&limit=${pageSize}`)
      .then(({ data: result }) => {
        if (active) {
          setLoaded({ page, data: result })
          setError('')
        }
      })
      .catch((requestError) => { if (active) setError(apiError(requestError)) })
    return () => { active = false }
  }, [page])

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
      setLoaded((current) => current.page === page && current.data ? {
        ...current,
        data: {
          ...current.data,
          reports: current.data.reports.map((item) => item._id === report._id ? {
            ...item,
            status: response.report.status,
            moderationHistory: response.report.moderationHistory,
          } : item),
        },
      } : current)
    } catch (requestError) {
      setError(apiError(requestError))
    } finally {
      setBusyReport('')
    }
  }

  if (error && !data) return <section className="content-page"><div className="alert alert-error" role="alert">{error}</div><Link className="back-link" to="/admin"><ArrowLeft size={15} />Back to admin overview</Link></section>
  if (!data) return <Loading label="Loading reports" />

  return (
    <section className="content-page admin-reports-page">
      <Link className="back-link" to="/admin"><ArrowLeft size={15} />Admin overview</Link>
      <div className="page-heading">
        <div><span className="eyebrow">COMMUNITY MODERATION</span><h1>All reports</h1><p>Review all {data.pagination.total} reports, with the newest updates first.</p></div>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {data.reports.length ? <div className="admin-report-grid">
        {data.reports.map((report) => <AdminReportCard key={report._id} report={report} busy={busyReport === report._id} onStatusChange={changeStatus} />)}
      </div> : <div className="empty-state"><ClipboardList size={24} /><h3>No reports yet</h3><p>Community reports will appear here when they are submitted.</p></div>}
      {data.pagination.pages > 1 && <div className="pagination"><button className="button button-quiet" disabled={page <= 1} onClick={() => { setError(''); setPage((current) => current - 1) }}><ChevronLeft size={16} />Previous</button><span>Page {page} of {data.pagination.pages} · {data.pagination.total} reports</span><button className="button button-quiet" disabled={page >= data.pagination.pages} onClick={() => { setError(''); setPage((current) => current + 1) }}>Next<ChevronRight size={16} /></button></div>}
    </section>
  )
}
