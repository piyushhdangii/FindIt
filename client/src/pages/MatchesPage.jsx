import { useEffect, useState } from 'react'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import Loading from '../components/Loading'
import ReportCard from '../components/ReportCard'
import { api, apiError } from '../services/api'

export default function MatchesPage() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.get(`/reports/${id}/matches`).then(({ data: result }) => setData(result)).catch((requestError) => setError(apiError(requestError))) }, [id])
  if (error) return <section className="content-page"><div className="alert alert-error">{error}</div><Link to="/dashboard">Back to dashboard</Link></section>
  if (!data) return <Loading label="Looking for possible matches" />
  return <section className="content-page"><Link to="/dashboard" className="back-link"><ArrowLeft size={15} />Your dashboard</Link><div className="page-heading"><div><span className="eyebrow"><Sparkles size={14} /> THOUGHTFUL SUGGESTIONS</span><h1>Possible matches</h1><p>These reports share some useful clues with yours.</p></div></div><div className="alert alert-info"><Sparkles size={18} /><span>{data.disclaimer} The percentage is a weighted similarity score, not a statistical probability. A person should verify an item privately before arranging a return.</span></div>{data.matches.length ? <div className="report-grid">{data.matches.map((item) => <ReportCard key={item.report._id} report={item.report} score={item.score} factors={item.factors} />)}</div> : <div className="empty-state"><Sparkles size={25} /><h3>No suggestions just yet</h3><p>We’ll compare against new community reports when they’re shared.</p><Link className="button button-primary" to="/reports">Browse all reports</Link></div>}</section>
}
