import { useEffect, useState } from 'react'
import { Check, Clock3, MessageCircle, Shield, ShieldAlert, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Loading from '../components/Loading'
import { useAuth } from '../context/useAuth'
import { api, apiError } from '../services/api'

function displayStatus(status) {
  if (status === 'approved') return 'accepted'
  if (status === 'completed') return 'returned'
  return status.replaceAll('_', ' ')
}

export default function ClaimsPage() {
  const { user } = useAuth()
  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'

  async function load(showLoading = true) {
    if (showLoading) setLoading(true)
    try {
      const { data } = await api.get(`/claims${isAdmin ? '?review=true' : ''}`)
      setClaims(data.claims)
      setError('')
    } catch (requestError) {
      setError(apiError(requestError))
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    api.get(`/claims${isAdmin ? '?review=true' : ''}`)
      .then(({ data }) => { if (active) setClaims(data.claims) })
      .catch((requestError) => { if (active) setError(apiError(requestError)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [isAdmin])

  async function updateStatus(claim, status, moderation = false) {
    let note = ''
    if (status === 'rejected') {
      if (!window.confirm('Reject this claim? This decision will be recorded in the claim history.')) return
      note = window.prompt('Add a short reason for rejecting this claim:')?.trim() || ''
      if (note.length < 3) {
        setError('Enter a brief reason to reject the claim.')
        return
      }
      if (moderation && note.length < 10) {
        setError('Moderation decisions require a reason of at least 10 characters.')
        return
      }
    } else if (moderation) {
      note = window.prompt('Record why moderation is resolving this reported concern:')?.trim() || ''
      if (note.length < 10) {
        setError('Moderation decisions require a reason of at least 10 characters.')
        return
      }
    }

    setBusy(claim._id)
    setError('')
    setNotice('')
    try {
      await api.patch(`/claims/${claim._id}/review`, { status, note })
      setNotice(status === 'accepted' ? 'Claim accepted. Coordinate the handover in chat; it is not marked returned yet.' : 'The claim was rejected and the decision was recorded.')
      await load(false)
    } catch (requestError) {
      setError(apiError(requestError))
    } finally {
      setBusy('')
    }
  }

  async function runClaimAction(claim, action) {
    setBusy(claim._id)
    setError('')
    setNotice('')
    try {
      const { data } = await api.post(`/claims/${claim._id}/${action}`)
      setNotice(data.message || (action === 'arrange-return' ? 'Handover arranged. Both participants must confirm after the item is exchanged.' : 'Confirmation saved.'))
      await load(false)
    } catch (requestError) {
      setError(apiError(requestError))
    } finally {
      setBusy('')
    }
  }

  async function reportConcern(claim) {
    const reason = window.prompt('Describe the concern for the moderation team (10–500 characters):')?.trim() || ''
    if (reason.length < 10 || reason.length > 500) {
      setError('Enter a concern between 10 and 500 characters.')
      return
    }
    setBusy(claim._id)
    setError('')
    setNotice('')
    try {
      const { data } = await api.post(`/claims/${claim._id}/dispute`, { reason })
      setNotice(data.message)
      await load(false)
    } catch (requestError) {
      setError(apiError(requestError))
    } finally {
      setBusy('')
    }
  }

  async function openChat(claim) {
    setBusy(claim._id)
    setError('')
    try {
      const { data } = await api.post(`/chat/claims/${claim._id}/conversation`)
      navigate(`/chat/${data.conversation._id}`)
    } catch (requestError) {
      setError(apiError(requestError))
    } finally {
      setBusy('')
    }
  }

  if (loading) return <Loading label="Loading claims" />

  return (
    <section className="content-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{isAdmin ? 'COMMUNITY MODERATION' : 'YOUR CLAIM WORKSPACE'}</span>
          <h1>{isAdmin ? 'Claims and reported concerns' : 'Claims and returns'}</h1>
          <p>{isAdmin
            ? 'Review participant disputes and manage claims on your own found reports.'
            : 'Review claims you submitted and claims received on your found reports.'}</p>
        </div>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      {claims.length ? (
        <div className="claims-grid">
          {claims.map((claim) => {
            const finderId = claim.report?.reporter?._id || claim.report?.reporter
            const isFinder = String(finderId) === String(user?._id)
            const isClaimant = String(claim.claimant?._id || claim.claimant) === String(user?._id)
            const isParticipant = isFinder || isClaimant
            const isModerationClaim = isAdmin && claim.status === 'disputed' && !isParticipant
            const isAccepted = ['accepted', 'approved'].includes(claim.status)
            const isArranged = claim.status === 'return_arranged'
            const canUseChat = isParticipant && !['rejected', 'returned', 'completed', 'cancelled'].includes(claim.status)
              && !['recovered', 'closed'].includes(claim.report?.status)
            const canDecide = !isAdmin && isFinder && ['pending', 'under_discussion'].includes(claim.status)
            const confirmations = claim.returnConfirmations || {}
            const ownConfirmation = isFinder ? confirmations.finderAt : confirmations.claimantAt

            return (
              <article className="claim-card" data-status={claim.status} key={claim._id}>
                <div className="claim-card-top">
                  <span className={`status status-${claim.status}`}>
                    {['pending', 'under_discussion'].includes(claim.status) ? <Clock3 size={13} /> : null}
                    {displayStatus(claim.status)}
                  </span>
                  <small>{new Date(claim.createdAt).toLocaleDateString()}</small>
                </div>
                <h2>{claim.report?.itemName || 'Removed report'}</h2>
                <p className="muted">
                  {isAdmin
                    ? `Reported by a participant${claim.report?.location ? ` · ${claim.report.location}` : ''}`
                    : isFinder
                      ? `Claim from ${claim.claimant?.name || 'a community member'}${claim.report?.location ? ` · ${claim.report.location}` : ''}`
                      : `Your claim · finder ${claim.report?.reporter?.name || 'community member'}${claim.report?.location ? ` · ${claim.report.location}` : ''}`}
                </p>
                {claim.history?.length > 0 && (
                    <div className="history-note history-latest">
                    <span className="eyebrow">LATEST UPDATE</span>
                    <p>{claim.history.at(-1).note || `Status changed to ${displayStatus(claim.history.at(-1).to)}.`}</p>
                  </div>
                )}
                {!isAdmin && claim.evidence && (
                  <div className="history-note history-evidence">
                    <span className="eyebrow">PRIVATE CLAIM EXPLANATION</span>
                    <p>{claim.evidence}</p>
                  </div>
                )}
                {canUseChat && (
                  <>
                    <p className="muted">Keep ownership details in chat. Never share passwords, financial details, or unnecessary personal information.</p>
                    <button className="button button-primary claim-chat-button" disabled={busy === claim._id} onClick={() => openChat(claim)}>
                      <MessageCircle size={15} />{busy === claim._id ? 'Opening chat…' : 'Open private chat'}
                    </button>
                  </>
                )}
                {(canDecide || (isAdmin && isFinder && ['pending', 'under_discussion'].includes(claim.status))) && (
                  <div className="review-actions">
                    <button className="button button-primary" disabled={busy === claim._id} onClick={() => updateStatus(claim, 'accepted')}><Check size={15} />Accept claim</button>
                    <button className="button button-danger" disabled={busy === claim._id} onClick={() => updateStatus(claim, 'rejected')}><X size={15} />Reject claim</button>
                  </div>
                )}
                {isParticipant && isAccepted && (
                  <div className="claim-return-actions">
                    <p className="muted">Acceptance is not proof of handover. Arrange a safe exchange, then both people must confirm that the item was returned.</p>
                    <button className="button button-primary" disabled={busy === claim._id || !['open', 'matched'].includes(claim.report?.status)} onClick={() => runClaimAction(claim, 'arrange-return')}>
                      Arrange handover
                    </button>
                  </div>
                )}
                {isParticipant && isArranged && (
                  <div className="claim-return-actions">
                    <p className="muted">
                      Finder: {confirmations.finderAt ? 'confirmed' : 'waiting'} · Claimant: {confirmations.claimantAt ? 'confirmed' : 'waiting'}
                    </p>
                    <button className="button button-primary" disabled={busy === claim._id || Boolean(ownConfirmation)} onClick={() => runClaimAction(claim, 'confirm-return')}>
                      {ownConfirmation ? 'Your handover confirmation is saved' : 'Confirm item returned'}
                    </button>
                  </div>
                )}
                {isParticipant && !['rejected', 'returned', 'completed', 'cancelled', 'disputed'].includes(claim.status) && (
                  <button className="text-link" disabled={busy === claim._id} onClick={() => reportConcern(claim)}>
                    <ShieldAlert size={15} /> Report a concern
                  </button>
                )}
                {isModerationClaim && (
                  <>
                    <p className="muted">Moderators can resolve this report; they do not get access to the private conversation.</p>
                    <div className="review-actions">
                      <button className="button button-primary" disabled={busy === claim._id} onClick={() => updateStatus(claim, 'accepted', true)}><Check size={15} />Resolve: accept</button>
                      <button className="button button-danger" disabled={busy === claim._id} onClick={() => updateStatus(claim, 'rejected', true)}><X size={15} />Resolve: reject</button>
                    </div>
                  </>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="empty-state">
          <Shield size={24} />
          <h3>{isAdmin ? 'No reported claim concerns' : 'No claims yet'}</h3>
          <p>{isAdmin
            ? 'Participant-reported concerns that need moderation will appear here.'
            : 'Claims you submit or receive on your found reports will appear here.'}</p>
        </div>
      )}
    </section>
  )
}
