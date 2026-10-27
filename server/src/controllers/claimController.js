import mongoose from 'mongoose'
import Claim from '../models/Claim.js'
import Conversation from '../models/Conversation.js'
import Report from '../models/Report.js'
import User from '../models/User.js'
import { createNotification } from '../services/notifications.js'

const activeStatuses = ['pending', 'under_discussion', 'accepted', 'return_arranged', 'disputed', 'approved']
const openReviewStatuses = ['pending', 'under_discussion']

function validId(id) {
  return mongoose.isValidObjectId(id)
}

function populateClaim(query, includeEvidence = false) {
  return query
    .select(includeEvidence ? '+evidence -active' : '-evidence -active')
    .populate('report')
    .populate({ path: 'report', populate: { path: 'reporter', select: 'name' } })
    .populate('claimant', 'name')
}

async function findParticipantClaim(claimId, userId) {
  const claim = await Claim.findById(claimId)
  if (!claim) return { error: { status: 404, message: 'Claim not found.' } }
  const report = await Report.findById(claim.report)
  if (!report || report.type !== 'found') return { error: { status: 404, message: 'Claim not found.' } }
  const finder = String(report.reporter) === String(userId)
  const claimant = String(claim.claimant) === String(userId)
  if (!finder && !claimant) return { error: { status: 404, message: 'Claim not found.' } }
  return { claim, report, finder, claimant }
}

async function notifyClaimStatus(claim, recipient, status, message, eventKey = status) {
  await createNotification({
    recipient,
    type: 'claim',
    title: `Claim ${status.replaceAll('_', ' ')}`,
    message,
    relatedId: claim.report,
    dedupeKey: `claim:${claim.id || claim._id}:${eventKey}`,
  })
}

export async function createClaim(req, res) {
  if (!validId(req.params.reportId)) return res.status(400).json({ message: 'The supplied report identifier is invalid.' })
  const evidence = typeof req.body.evidence === 'string' ? req.body.evidence.trim() : ''
  if (evidence.length < 10 || evidence.length > 1000) {
    return res.status(400).json({ message: 'Explain why you believe this item is yours in 10 to 1,000 characters.' })
  }
  const report = await Report.findById(req.params.reportId).select('+returnedClaim')
  if (!report) return res.status(404).json({ message: 'Report not found.' })
  if (report.type !== 'found' || report.returnedClaim || !['open', 'matched'].includes(report.status)) return res.status(400).json({ message: 'This report is not currently eligible for a claim.' })
  if (String(report.reporter) === String(req.user.id)) return res.status(403).json({ message: 'You cannot claim a report you created.' })

  const existingClaim = await Claim.exists({ report: report.id, claimant: req.user.id })
  if (existingClaim) return res.status(409).json({ message: 'You have already submitted a claim for this report. Each person may submit only one claim per found item.' })

  const claim = new Claim({ report: report.id, claimant: req.user.id, evidence })
  try {
    await claim.save()
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'You have already submitted a claim for this report. Each person may submit only one claim per found item.' })
    throw error
  }
  const stillEligible = await Report.findOne({
    _id: report.id,
    type: 'found',
    status: { $in: ['open', 'matched'] },
  }).select('_id')
  if (!stillEligible) {
    claim.status = 'rejected'
    claim.active = false
    claim.history.push({
      actor: req.user.id,
      from: 'pending',
      to: 'rejected',
      note: 'The found report closed while this claim was being submitted.',
    })
    await claim.save()
    return res.status(409).json({ message: 'This report is no longer eligible for a claim.' })
  }
  await createNotification({
    recipient: report.reporter,
    type: 'claim',
    title: 'New claim on your found item',
    message: 'A community member submitted a private claim for your item.',
    relatedId: report.id,
    dedupeKey: `claim:${claim.id}:created`,
  })
  const claimResponse = claim.toObject()
  delete claimResponse.evidence
  delete claimResponse.active
  res.status(201).json({ claim: claimResponse })
}

export async function listClaims(req, res) {
  let query
  if (req.query.review === 'true') {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Only moderators can review reported concerns.' })
    const reports = await Report.find({ reporter: req.user.id, type: 'found' }).select('_id')
    query = {
      $or: [
        { status: 'disputed' },
        { claimant: req.user.id },
        { report: { $in: reports.map((report) => report._id) } },
      ],
    }
  } else {
    const reports = await Report.find({ reporter: req.user.id, type: 'found' }).select('_id')
    query = {
      $or: [
        { claimant: req.user.id },
        { report: { $in: reports.map((report) => report._id) } },
      ],
    }
  }
  const claims = await populateClaim(Claim.find(query).sort({ createdAt: -1 }), req.user.role !== 'admin')
  res.json({ claims })
}

export async function getClaim(req, res) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'The supplied claim identifier is invalid.' })
  const result = await findParticipantClaim(req.params.id, req.user.id)
  if (result.error) return res.status(result.error.status).json({ message: result.error.message })
  res.json({ claim: await populateClaim(Claim.findById(req.params.id), true) })
}

export async function reviewClaim(req, res) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'The supplied claim identifier is invalid.' })
  const { status, note = '' } = req.body
  if (!['accepted', 'rejected'].includes(status)) return res.status(400).json({ message: 'Choose accepted or rejected.' })
  const reason = typeof note === 'string' ? note.trim().slice(0, 300) : ''
  if (status === 'rejected' && reason.length < 3) return res.status(400).json({ message: 'Add a brief reason before rejecting this claim.' })

  let result = await findParticipantClaim(req.params.id, req.user.id)
  const isParticipant = !result.error
  if (result.error && req.user.role === 'admin') {
    const claim = await Claim.findById(req.params.id)
    const report = claim ? await Report.findById(claim.report) : null
    result = claim && report ? { claim, report, finder: false, claimant: false } : result
  }
  if (result.error) return res.status(result.error.status).json({ message: result.error.message })
  const { claim, report, finder } = result
  const moderator = req.user.role === 'admin' && !isParticipant
  if (moderator) {
    if (claim.status !== 'disputed' || reason.length < 10) {
      return res.status(403).json({ message: 'Moderators may resolve disputed claims only and must record a reason.' })
    }
  } else if (!finder) {
    return res.status(403).json({ message: 'Only the finder can decide this claim.' })
  } else if (!['open', 'matched'].includes(report.status)) {
    return res.status(409).json({ message: 'Claims on an inactive report cannot be accepted or rejected.' })
  } else if (!openReviewStatuses.includes(claim.status)) {
    return res.status(409).json({ message: `A ${claim.status} claim cannot be accepted or rejected.` })
  }

  const reviewedAt = new Date()
  const updated = await Claim.findOneAndUpdate(
    { _id: claim._id, status: claim.status },
    {
      $set: { status, reviewedAt, ...(status === 'rejected' ? { active: false } : {}) },
      $push: { history: { actor: req.user.id, from: claim.status, to: status, note: reason || 'Finder accepted the claim after private verification.' } },
    },
    { new: true, runValidators: true },
  )
  if (!updated) return res.status(409).json({ message: 'The claim changed while you were reviewing it. Refresh and try again.' })
  if (status === 'rejected') await Conversation.updateOne({ claim: claim.id }, { $set: { status: 'archived' } })

  const statusMessage = status === 'accepted'
    ? moderator
      ? 'Moderation resolved the reported concern in favor of the claim. Coordinate a safe handover in chat; the item is not marked returned yet.'
      : 'The finder accepted your claim. Coordinate a safe handover in chat; the item is not marked returned yet.'
    : `The claim was rejected${reason ? `: ${reason}` : '.'}`
  await Promise.all([
    notifyClaimStatus(claim, claim.claimant, status, statusMessage, `review:${reviewedAt.getTime()}`),
    ...(moderator ? [notifyClaimStatus(claim, report.reporter, status, `Moderation resolved the reported concern: ${reason}`, `review:${reviewedAt.getTime()}`)] : []),
  ])
  const responseClaim = await populateClaim(Claim.findById(claim.id))
  res.json({ claim: responseClaim })
}

export async function arrangeReturn(req, res) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'The supplied claim identifier is invalid.' })
  const result = await findParticipantClaim(req.params.id, req.user.id)
  if (result.error) return res.status(result.error.status).json({ message: result.error.message })
  const { claim, report } = result
  if (claim.status === 'return_arranged') return res.json({ claim: await populateClaim(Claim.findById(claim.id)) })
  if (!['accepted', 'approved'].includes(claim.status) || !['open', 'matched'].includes(report.status)) {
    return res.status(409).json({ message: 'Only an accepted claim on an active report can arrange a return.' })
  }
  const updated = await Claim.findOneAndUpdate(
    { _id: claim.id, status: { $in: ['accepted', 'approved'] } },
    {
      $set: { status: 'return_arranged', 'returnConfirmations.finderAt': null, 'returnConfirmations.claimantAt': null },
      $push: { history: { actor: req.user.id, from: claim.status, to: 'return_arranged', note: 'The participants are arranging the handover.' } },
    },
    { new: true, runValidators: true },
  )
  if (!updated) return res.status(409).json({ message: 'The claim changed while arranging the return. Refresh and try again.' })
  await notifyClaimStatus(claim, claim.claimant, 'return_arranged', 'The participants can now confirm the handover from their claims page.')
  await notifyClaimStatus(claim, report.reporter, 'return_arranged', 'The participants can now confirm the handover from their claims page.')
  res.json({ claim: await populateClaim(Claim.findById(claim.id)) })
}

async function finalizeReturn(claimId, actorId) {
  let claim = await Claim.findById(claimId)
  if (!claim) return { error: { status: 404, message: 'Claim not found.' } }
  const report = await Report.findById(claim.report).select('+returnedClaim')
  if (!report) return { error: { status: 404, message: 'Found report not found.' } }

  const alreadyFinalized = claim.status === 'returned' && String(report.returnedClaim) === String(claim.id)
  if (!alreadyFinalized && (claim.status !== 'return_arranged'
    || !claim.returnConfirmations?.finderAt
    || !claim.returnConfirmations?.claimantAt)) {
    return { claim, report, awaitingConfirmation: true }
  }

  let recoveredReport = report
  if (!alreadyFinalized) {
    recoveredReport = await Report.findOneAndUpdate(
      { _id: report._id, type: 'found', status: { $in: ['open', 'matched'] }, returnedClaim: null },
      { $set: { status: 'recovered', returnedClaim: claim._id } },
      { new: true },
    )
    if (!recoveredReport) {
      recoveredReport = await Report.findById(report._id).select('+returnedClaim')
      if (recoveredReport?.status !== 'recovered' || String(recoveredReport.returnedClaim) !== String(claim._id)) {
        return { error: { status: 409, message: 'This report is no longer available for return through this claim.' } }
      }
    }
  }

  if (!alreadyFinalized) {
    const returnedClaim = await Claim.findOneAndUpdate(
      {
        _id: claim._id,
        status: 'return_arranged',
        'returnConfirmations.finderAt': { $ne: null },
        'returnConfirmations.claimantAt': { $ne: null },
      },
      {
        $set: { status: 'returned', active: false },
        $push: { history: { actor: actorId, from: 'return_arranged', to: 'returned', note: 'Both finder and claimant confirmed the handover.' } },
      },
      { new: true },
    )
    if (returnedClaim) claim = returnedClaim
    else {
      claim = await Claim.findById(claim._id)
      if (claim?.status !== 'returned') {
        return { error: { status: 409, message: 'The return was reserved, but its claim could not be finalized. Retry the confirmation.' } }
      }
    }
  }

  const competingClaims = await Claim.find({
    report: report._id,
    _id: { $ne: claim._id },
    status: { $in: activeStatuses },
  }).select('claimant status')
  if (competingClaims.length) {
    const competingIds = competingClaims.map((other) => other._id)
    await Promise.all(competingClaims.map((other) => Claim.updateOne(
      { _id: other._id, status: other.status },
      {
        $set: { status: 'rejected', active: false },
        $push: { history: { actor: actorId, from: other.status, to: 'rejected', note: 'This item was returned to another claimant.' } },
      },
    )))
    await Conversation.updateMany({ claim: { $in: competingIds } }, { $set: { status: 'archived' } })
    await Promise.all(competingClaims.map((other) => createNotification({
      recipient: other.claimant,
      type: 'claim',
      title: 'Claim closed: item returned',
      message: 'The finder confirmed returning this item to another claimant.',
      relatedId: report._id,
      dedupeKey: `claim:${other._id}:competing-return`,
    })))
  }

  await Conversation.updateOne({ claim: claim._id }, { $set: { status: 'archived' } })
  await Promise.all([
    createNotification({
      recipient: claim.claimant,
      type: 'claim',
      title: 'Item return confirmed',
      message: 'Both participants confirmed the handover. This report is now closed.',
      relatedId: report._id,
      dedupeKey: `claim:${claim._id}:returned`,
    }),
    createNotification({
      recipient: report.reporter,
      type: 'claim',
      title: 'Item return confirmed',
      message: 'Both participants confirmed the handover. This report is now closed.',
      relatedId: report._id,
      dedupeKey: `claim:${claim._id}:returned`,
    }),
  ])
  return { claim, report: recoveredReport }
}

export async function confirmReturn(req, res) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'The supplied claim identifier is invalid.' })
  const result = await findParticipantClaim(req.params.id, req.user.id)
  if (result.error) return res.status(result.error.status).json({ message: result.error.message })
  const { claim, finder } = result
  if (claim.status === 'returned') {
    const outcome = await finalizeReturn(claim.id, req.user.id)
    if (outcome.error) return res.status(outcome.error.status).json({ message: outcome.error.message })
    return res.json({ claim: await populateClaim(Claim.findById(claim.id)), message: 'The handover is confirmed by both participants.' })
  }
  if (claim.status !== 'return_arranged') return res.status(409).json({ message: 'The handover must be arranged before it can be confirmed.' })

  const field = finder ? 'returnConfirmations.finderAt' : 'returnConfirmations.claimantAt'
  await Claim.findOneAndUpdate(
    { _id: claim.id, status: 'return_arranged', [field]: null },
    { $set: { [field]: new Date() } },
    { new: true },
  )
  const outcome = await finalizeReturn(claim.id, req.user.id)
  if (outcome.error) return res.status(outcome.error.status).json({ message: outcome.error.message })
  if (outcome.awaitingConfirmation) {
    return res.json({
      claim: await populateClaim(Claim.findById(claim.id)),
      message: finder
        ? 'Your confirmation is saved. The claimant must also confirm the handover.'
        : 'Your confirmation is saved. The finder must also confirm the handover.',
    })
  }
  res.json({ claim: await populateClaim(Claim.findById(claim.id)), message: 'The handover is confirmed by both participants.' })
}

export async function reportConcern(req, res) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'The supplied claim identifier is invalid.' })
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : ''
  if (reason.length < 10 || reason.length > 500) return res.status(400).json({ message: 'Describe the concern in 10 to 500 characters.' })
  const result = await findParticipantClaim(req.params.id, req.user.id)
  if (result.error) return res.status(result.error.status).json({ message: result.error.message })
  const { claim, report } = result
  if (!activeStatuses.includes(claim.status)) return res.status(409).json({ message: 'A concern cannot be reported for a closed claim.' })
  if (claim.status === 'disputed') return res.status(409).json({ message: 'This claim has already been reported for moderation.' })

  const disputedAt = new Date()
  const updated = await Claim.findOneAndUpdate(
    { _id: claim.id, status: claim.status },
    {
      $set: { status: 'disputed' },
      $push: { history: { actor: req.user.id, from: claim.status, to: 'disputed', note: reason, at: disputedAt } },
    },
    { new: true },
  )
  if (!updated) return res.status(409).json({ message: 'The claim changed while reporting the concern. Refresh and try again.' })

  const recipient = String(claim.claimant) === String(req.user.id) ? report.reporter : claim.claimant
  const admins = await User.find({ role: 'admin' }).select('_id')
  await Promise.all([
    createNotification({
      recipient,
      type: 'claim',
      title: 'A concern was reported',
      message: 'A participant reported a concern about this claim. Check the claim status and contact moderation if needed.',
      relatedId: report._id,
      dedupeKey: `claim:${claim.id}:disputed:${disputedAt.getTime()}`,
    }),
    ...admins.map((admin) => createNotification({
      recipient: admin._id,
      type: 'moderation',
      title: 'Claim concern needs review',
      message: `A participant reported a concern about ${report.itemName}.`,
      relatedId: claim._id,
      dedupeKey: `claim:${claim.id}:disputed:${disputedAt.getTime()}:admin:${admin._id}`,
    })),
  ])
  res.json({ claim: await populateClaim(Claim.findById(claim.id)), message: 'The concern was sent to moderation.' })
}
