import User from '../models/User.js'
import Report from '../models/Report.js'
import Claim from '../models/Claim.js'
import mongoose from 'mongoose'

export async function overview(_req, res) {
  const [users, lostReports, foundReports, disputedClaims, recoveredItems, recentActivity] = await Promise.all([
    User.countDocuments(),
    Report.countDocuments({ type: 'lost' }),
    Report.countDocuments({ type: 'found' }),
    Claim.countDocuments({ status: 'disputed' }),
    Report.countDocuments({ status: 'recovered' }),
    Report.find().sort({ updatedAt: -1 }).limit(3).select('type itemName status updatedAt').populate('reporter', 'name'),
  ])
  res.json({ counts: { users, lostReports, foundReports, disputedClaims, recoveredItems }, recentActivity })
}

export async function listAllReports(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20))
  const [reports, total] = await Promise.all([
    Report.find().select('+moderationHistory').populate('reporter', 'name email').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit),
    Report.countDocuments(),
  ])
  res.json({ reports, pagination: { page, limit, total, pages: Math.ceil(total / limit) } })
}

export async function moderateReport(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'The supplied report identifier is invalid.' })
  if (!['open', 'matched', 'closed', 'recovered'].includes(req.body.status)) return res.status(400).json({ message: 'Choose a valid report status.' })
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : ''
  if (reason.length < 10 || reason.length > 300) return res.status(400).json({ message: 'Moderation changes require a reason of 10 to 300 characters.' })
  const report = await Report.findById(req.params.id).select('+moderationHistory +returnedClaim')
  if (!report) return res.status(404).json({ message: 'Report not found.' })
  if (report.returnedClaim && ['open', 'matched'].includes(req.body.status)) {
    return res.status(409).json({ message: 'A report with a confirmed return cannot be reopened.' })
  }
  const previous = report.status
  report.status = req.body.status
  report.moderationHistory.push({ actor: req.user.id, from: previous, to: req.body.status, reason })
  await report.save()
  res.json({ report })
}
