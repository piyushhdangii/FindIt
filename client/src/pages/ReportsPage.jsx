import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react'
import ReportCard from '../components/ReportCard'
import Loading from '../components/Loading'
import { api, apiError } from '../services/api'

const filterKeys = ['search', 'type', 'category', 'location', 'from', 'to', 'direction']

function filtersFromParams(params) {
  return Object.fromEntries(filterKeys.map((key) => [key, params.get(key) || '']))
}

export default function ReportsPage() {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState({ reports: [], pagination: { page: 1, pages: 0 }, loadedQuery: null })
  const [error, setError] = useState('')
  const [canRetry, setCanRetry] = useState(false)
  const [draft, setDraft] = useState(() => ({ query: params.toString(), filters: filtersFromParams(params) }))
  const [retry, setRetry] = useState(0)
  const query = params.toString()
  const filters = draft.query === query ? draft.filters : filtersFromParams(params)
  const loading = data.loadedQuery !== query
  function updateFilters(next) {
    setDraft({ query, filters: next })
  }
  useEffect(() => {
    let active = true
    const requestParams = new URLSearchParams(query)
    // Explore always orders by posting time; direction is the only user choice.
    requestParams.delete('sort')
    api.get(`/reports?${requestParams}`)
      .then(({ data: result }) => {
        if (!active) return
        setData({ ...result, loadedQuery: query })
        setError('')
        setCanRetry(false)
      })
      .catch((requestError) => {
        if (!active) return
        setError(apiError(requestError))
        setCanRetry(true)
        setData({ reports: [], pagination: { page: 1, pages: 0, total: 0 }, loadedQuery: query })
      })
    return () => { active = false }
  }, [query, retry])
  function apply(event) {
    event.preventDefault()
    if (filters.from && filters.to && filters.to < filters.from) {
      setError('The end date must be the same as or later than the start date.')
      setCanRetry(false)
      return
    }
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) if (value) next.set(key, value)
    next.set('page', '1')
    setError('')
    setCanRetry(false)
    setParams(next)
  }
  function clearFilter(key) {
    const next = new URLSearchParams(params)
    next.delete(key)
    next.set('page', '1')
    setParams(next)
    setError('')
    setCanRetry(false)
  }
  function clearFilters() {
    updateFilters(Object.fromEntries(filterKeys.map((key) => [key, ''])))
    setParams({})
    setError('')
    setCanRetry(false)
  }
  const activeFilters = [...params.entries()].filter(([key, value]) => key !== 'page' && key !== 'sort' && value)
  const labels = { search: 'Search', type: 'Type', category: 'Category', location: 'Location', from: 'From', to: 'To', direction: 'Sort' }
  return (
    <section className="content-page">
      <div className="page-heading"><div><span className="eyebrow">COMMUNITY BOARD</span><h1>Explore reports</h1><p>Search real lost and found reports shared by your community.</p></div><Link className="button button-primary" to="/reports/new"><span>＋</span>Post a report</Link></div>
      <form className="filter-panel" onSubmit={apply}>
        <label className="filter-search reports-search"><span>Search reports</span><div className="reports-search-control"><Search size={19} /><input value={filters.search} onChange={(e) => updateFilters({ ...filters, search: e.target.value })} placeholder="Search items, descriptions, or locations..." />{filters.search && <button className="clear-search" type="button" aria-label="Clear search text" onClick={() => updateFilters({ ...filters, search: '' })}><X size={17} /></button>}<button className="button button-primary" type="submit">Search</button></div></label>
        <div className="reports-filter-row">
          <label>Report type<select value={filters.type} onChange={(e) => updateFilters({ ...filters, type: e.target.value })}><option value="">All reports</option><option value="lost">Lost items</option><option value="found">Found items</option></select></label>
          <label>Category<select value={filters.category} onChange={(e) => updateFilters({ ...filters, category: e.target.value })}><option value="">All categories</option>{['Accessories', 'Bags', 'Books', 'Clothing', 'Electronics', 'Keys', 'Pets', 'Wallets', 'Other'].map((category) => <option key={category}>{category}</option>)}</select></label>
          <label>Location<input value={filters.location} onChange={(e) => updateFilters({ ...filters, location: e.target.value })} placeholder="Neighborhood" /></label>
          <label>From<input type="date" max={filters.to || undefined} value={filters.from} onChange={(e) => updateFilters({ ...filters, from: e.target.value })} /></label>
          <label>To<input type="date" min={filters.from || undefined} value={filters.to} onChange={(e) => updateFilters({ ...filters, to: e.target.value })} /></label>
          <label>Sort by<select value={filters.direction || 'desc'} onChange={(e) => updateFilters({ ...filters, direction: e.target.value })}><option value="desc">Most recent</option><option value="asc">Least recent</option></select></label>
        </div>
        <div className="reports-filter-actions"><button className="button button-primary" type="submit"><SlidersHorizontal size={16} />Apply filters</button>{activeFilters.length > 0 && <button className="button button-quiet" type="button" onClick={clearFilters}><RotateCcw size={15} />Clear all</button>}</div>
      </form>
      {activeFilters.length > 0 && <div className="active-filter-list" aria-label="Active filters">{activeFilters.map(([key, value]) => <button key={key} type="button" className="filter-chip" onClick={() => clearFilter(key)}>{labels[key]}: {key === 'direction' ? value === 'asc' ? 'Least recent' : 'Most recent' : value}<X size={13} /></button>)}</div>}
      {error && <div className="alert alert-error" role="alert"><span>{error}</span>{canRetry && <button className="text-link" type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button>}</div>}
      {!error && <div className="results-summary"><span>{data.pagination.total ?? 0} {data.pagination.total === 1 ? 'report' : 'reports'}</span><span>Page {data.pagination.page || 1}{data.pagination.pages ? ` of ${data.pagination.pages}` : ''}</span></div>}
      {loading ? <Loading label="Loading reports" /> : error ? null : data.reports.length ? <div className="report-grid">{data.reports.map((report) => <ReportCard key={report._id} report={report} />)}</div> : <div className="empty-state"><SlidersHorizontal size={24} /><h3>No reports match those filters</h3><p>Try a broader search, or be the first to share one.</p><Link className="button button-primary" to="/reports/new">Post a report</Link></div>}
      {data.pagination.pages > 1 && <div className="pagination"><button className="button button-quiet" disabled={data.pagination.page <= 1} onClick={() => setParams({ ...Object.fromEntries(params), page: String(data.pagination.page - 1) })}><ChevronLeft size={16} />Previous</button><span>Page {data.pagination.page} of {data.pagination.pages}</span><button className="button button-quiet" disabled={!data.pagination.hasNext} onClick={() => setParams({ ...Object.fromEntries(params), page: String(data.pagination.page + 1) })}>Next<ChevronRight size={16} /></button></div>}
    </section>
  )
}
