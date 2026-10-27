import ReportCard from './ReportCard'

const statuses = ['open', 'matched', 'closed', 'recovered']

export default function AdminReportCard({ report, busy = false, onStatusChange }) {
  const latestModeration = report.moderationHistory?.at(-1)

  return (
    <article className="admin-report-card">
      <ReportCard report={report} />
      <div className="admin-report-controls">
        <label>
          Moderation status
          <select
            aria-label={`Status for ${report.itemName}`}
            value={report.status}
            disabled={busy}
            onChange={(event) => onStatusChange(report, event.target.value)}
          >
            {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        {latestModeration && <p><b>Latest moderation</b>{latestModeration.reason}</p>}
      </div>
    </article>
  )
}
