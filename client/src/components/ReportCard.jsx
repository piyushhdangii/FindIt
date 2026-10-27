import { Link } from 'react-router-dom'
import { CalendarDays, MapPin, Search } from 'lucide-react'

export default function ReportCard({ report, score, factors = [] }) {
  return (
    <Link className="report-card" to={`/reports/${report._id}`} aria-label={`View details for ${report.itemName}`}>
      <div className="report-visual">
        {report.image?.url
          ? <img src={report.image.url} alt={`Photo of ${report.itemName}`} loading="lazy" />
          : <div className="report-placeholder"><Search size={27} /></div>}
        <span className={`badge badge-${report.type}`}>{report.type}</span>
        {Number.isFinite(score) && <strong className="match-score" title="Weighted similarity of report details; this is not a statistical probability.">{score}% match</strong>}
      </div>
      <div className="report-card-body">
        <div className="report-card-heading">
          <span className="eyebrow">{report.category}</span>
        </div>
        <h3>{report.itemName}</h3>
        <p className="clamp">{report.description}</p>
        <div className="report-meta">
          <span><MapPin size={14} />{report.location}</span>
          <span><CalendarDays size={14} />{new Date(report.eventDate).toLocaleDateString()}</span>
        </div>
        {factors.length > 0 && <div className="factor-list">{factors.slice(0, 3).map((factor) => <span key={factor}>{factor}</span>)}</div>}
      </div>
    </Link>
  )
}
