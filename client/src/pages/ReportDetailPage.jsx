import { useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, MapPin, MessageCircle, ShieldCheck, Sparkles } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import Loading from '../components/Loading'
import ReportCard from '../components/ReportCard'
import { api, apiError } from '../services/api'

export default function ReportDetailPage() {
  const { id } = useParams()
  const { user, loading: authLoading } = useAuth()
  const [detail, setDetail] = useState(null)
  const [claimData, setClaimData] = useState(null)
  const [detailError, setDetailError] = useState(null)
  const [claimMessage, setClaimMessage] = useState('')
  const [claimEvidence, setClaimEvidence] = useState('')
  const [claimLookup, setClaimLookup] = useState({ reportId: null, userId: null, claim: null, error: '' })
  const [chatError, setChatError] = useState('')
  const [busy, setBusy] = useState(false)
  const [chatBusy, setChatBusy] = useState(false)
  const navigate = useNavigate()
  useEffect(() => {
    let active = true
    api.get(`/reports/${id}`)
      .then(({ data }) => {
        if (active) {
          setDetail({ id, report: data.report, matches: data.matches || [] })
          setDetailError(null)
        }
      })
      .catch((requestError) => { if (active) setDetailError({ id, message: apiError(requestError) }) })
    return () => { active = false }
  }, [id])
  const currentDetail = detail?.id === id ? detail : null
  const report = currentDetail?.report
  const matches = currentDetail?.matches || []
  const error = detailError?.id === id ? detailError.message : ''
  const canUseClaimWorkspace = !authLoading && user?.role !== 'admin'
  const canViewClaim = Boolean(canUseClaimWorkspace && report?.type === 'found' && user && report.reporter?._id === user._id)
  useEffect(() => {
    if (!canUseClaimWorkspace || report?.type !== 'found' || !user?._id || report.reporter?._id === user._id) {
      return undefined
    }
    let active = true
    api.get('/claims')
      .then(({ data }) => {
        if (!active) return
        const foundClaim = data.claims.find((claim) =>
          String(claim.report?._id || claim.report) === String(id)
          && String(claim.claimant?._id || claim.claimant) === String(user._id))
        setClaimLookup({ reportId: id, userId: user._id, claim: foundClaim || null, error: '' })
      })
      .catch((requestError) => {
        if (active) setClaimLookup({ reportId: id, userId: user._id, claim: null, error: apiError(requestError) })
      })
    return () => { active = false }
  }, [canUseClaimWorkspace, id, report?.type, report?.reporter?._id, user?._id])
  useEffect(() => {
    if (!canViewClaim) return
    let active = true
    api.get(`/reports/${id}/claim`)
      .then(({ data }) => { if (active) setClaimData({ id, claims: data.claims }) })
      .catch((requestError) => { if (active) setClaimData({ id, error: apiError(requestError) }) })
    return () => { active = false }
  }, [canViewClaim, id])
  const currentClaimData = claimData?.id === id ? claimData : null
  const claimLookupCurrent = claimLookup.reportId === id && claimLookup.userId === user?._id
  const existingClaim = claimLookupCurrent ? claimLookup.claim : null
  const checkingClaim = Boolean(canUseClaimWorkspace && user && report?.type === 'found'
    && report.reporter?._id !== user._id
    && !claimLookupCurrent)
  async function submitClaim() {
    setBusy(true)
    setClaimMessage('')
    try {
      const { data } = await api.post(`/claims/reports/${id}`, { evidence: claimEvidence })
      setClaimLookup({ reportId: id, userId: user._id, claim: data.claim, error: '' })
      setClaimMessage('Your claim was submitted. Follow its status and chat with the finder from your claims page.')
      setClaimEvidence('')
    } catch (requestError) {
      setClaimMessage(apiError(requestError))
    } finally {
      setBusy(false)
    }
  }
  async function openClaimChat(claim) {
    setChatBusy(true)
    setChatError('')
    try {
      const { data } = await api.post(`/chat/claims/${claim._id}/conversation`)
      navigate(`/chat/${data.conversation._id}`)
    } catch (requestError) {
      setChatError(apiError(requestError))
    } finally {
      setChatBusy(false)
    }
  }
  if (error) return <section className="content-page"><div className="alert alert-error">{error}</div><Link to="/reports">Back to reports</Link></section>
  if (!report) return <Loading label="Loading report" />
  const canClaim = canUseClaimWorkspace && report.type === 'found'
    && (!user || report.reporter?._id !== user._id)
    && report.status !== 'recovered'
    && report.status !== 'closed'
    && !existingClaim
    && (!user || (claimLookupCurrent && !claimLookup.error))
  return (
    <section className="content-page detail-page">
      <Link to="/reports" className="back-link"><ArrowLeft size={15} />All reports</Link>
      <article className="detail-card">
        <div className="detail-image">
          {report.image?.url
            ? <img src={report.image.url} alt={`Photo of ${report.itemName}`} />
            : <div className="report-placeholder"><Sparkles size={36} /></div>}
        </div>
        <div className="detail-copy">
          <div className="detail-tags">
            <span className={`badge badge-${report.type}`}>{report.type}</span>
            <span className="eyebrow">{report.category}</span>
            <span className={`status status-${report.status}`}>{report.status}</span>
          </div>
          <h1>{report.itemName}</h1>
          <p className="detail-description">{report.description}</p>
          <div className="detail-facts">
            <span><MapPin size={17} /><span><small>PLACE</small><b>{report.location}</b></span></span>
            <span><CalendarDays size={17} /><span><small>DATE</small><b>{new Date(report.eventDate).toLocaleDateString()}</b></span></span>
            {report.color && <span><Sparkles size={17} /><span><small>COLOR</small><b>{report.color}</b></span></span>}
          </div>
          <div className="reporter-note">
            <span className="avatar">{report.reporter?.name?.[0] || '?'}</span>
            <span><small>SHARED BY</small><b>{report.reporter?.name || 'Community member'}</b></span>
          </div>
        </div>
      </article>
      {report.type === 'found' && canUseClaimWorkspace && <div className="detail-next">
        <div><ShieldCheck size={19} /><span><b>Keep ownership details private</b><small>Discuss identifying details in the private chat after submitting a claim.</small></span></div>
        {canViewClaim && (
          <section className="claimant-details">
            <h2>Incoming claims</h2>
            {chatError && <div className="alert alert-error" role="alert">{chatError}</div>}
            {!currentClaimData && <Loading label="Checking for an active claim" />}
            {currentClaimData?.error && <div className="alert alert-error" role="alert">{currentClaimData.error}</div>}
            {currentClaimData && !currentClaimData.error && (currentClaimData.claims?.length ? (
              <>
                {currentClaimData.claims.map((claim) => (
                  <div className="claimant-card" key={claim._id}>
                    <span className="avatar">{claim.claimant?.name?.[0] || '?'}</span>
                    <span><b>{claim.claimant?.name || 'Community member'}</b><small>Claim submitted {new Date(claim.createdAt).toLocaleDateString()} · {claim.status.replaceAll('_', ' ')}</small></span>
                    {claim.evidence && <p className="history-note"><span className="eyebrow">PRIVATE CLAIM EXPLANATION</span><span className="claim-evidence-text">{claim.evidence}</span></p>}
                    {['pending', 'under_discussion', 'accepted', 'return_arranged', 'disputed', 'approved'].includes(claim.status) && ['open', 'matched'].includes(report.status) && <button className="button button-primary" disabled={chatBusy} onClick={() => openClaimChat(claim)}><MessageCircle size={15} />{chatBusy ? 'Opening chat…' : 'Chat with claimant'}</button>}
                  </div>
                ))}
                <Link className="button button-secondary" to="/claims">Review and manage claims</Link>
              </>
            ) : <p className="muted">There are no active claims on this item yet.</p>)}
          </section>
        )}
        {canClaim && (
          <div className="claim-box">
            <h2>Think this could be yours?</h2>
            <p>Briefly explain why you believe the item is yours. This is shared privately with the finder. Keep distinctive details for the chat and never include passwords, financial details, or unnecessary personal information.</p>
            {claimMessage && <div className={claimMessage.startsWith('Your claim') ? 'alert alert-success' : 'alert alert-error'} role="alert">{claimMessage}</div>}
            {user
              ? <>
                <label className="claim-evidence-field" htmlFor="claim-evidence">
                  <span>Why do you believe this item is yours?</span>
                  <textarea id="claim-evidence" rows="4" maxLength="1000" value={claimEvidence} onChange={(event) => setClaimEvidence(event.target.value)} placeholder="Share a brief explanation without sensitive personal information." />
                  <small>{claimEvidence.trim().length}/1,000 characters (minimum 10)</small>
                </label>
                <button className="button button-primary" disabled={busy || claimEvidence.trim().length < 10} onClick={submitClaim}>{busy ? 'Submitting…' : 'Submit claim'}</button>
              </>
              : <button className="button button-primary" onClick={() => navigate('/login')}>Sign in to submit a claim</button>}
          </div>
        )}
        {checkingClaim && (
          <p className="muted" role="status">Checking whether you have already claimed this item…</p>
        )}
        {claimLookupCurrent && claimLookup.error && (
          <div className="alert alert-error" role="alert">Could not check your existing claims: {claimLookup.error}. Refresh this page before submitting.</div>
        )}
        {existingClaim && (
          <div className="claim-box claim-existing-box">
            <h2>You already claimed this item</h2>
            <p>Your claim is recorded as <strong>{existingClaim.status?.replaceAll('_', ' ') || 'submitted'}</strong>. To avoid confusion, each person can submit only one claim for a found item.</p>
            <Link className="button button-secondary" to="/claims">View your claim</Link>
          </div>
        )}
      </div>}
      <section className="detail-matches">
        <div className="section-heading"><div><span className="eyebrow"><Sparkles size={14} /> PROBABLE MATCHES</span><h2>Reports that may be related</h2></div></div>
        <p className="matches-disclaimer">Percentages compare report details and are not statistical probabilities or proof of ownership.</p>
        {matches.length
          ? <div className="report-grid">{matches.map((item) => <ReportCard key={item.report._id} report={item.report} score={item.score} factors={item.factors} />)}</div>
          : <div className="empty-inline"><Sparkles size={17} />No probable matches found for this report yet.</div>}
      </section>
    </section>
  )
}
