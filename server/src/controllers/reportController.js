import mongoose from 'mongoose'
import Claim from '../models/Claim.js'
import Report from '../models/Report.js'
import { scoreMatch, getMatchThreshold } from '../services/matching.js'
import { notifyPotentialMatches } from '../services/notifications.js'
import { deleteImage, uploadImage } from '../services/images.js'

const fields = ['type', 'itemName', 'category', 'description', 'color', 'eventDate', 'location']
const allowedSorts = new Set(['createdAt', 'eventDate', 'itemName'])

function validObjectId(id) {
  return mongoose.isValidObjectId(id)
}

function candidateQuery(report, excludeId) {
  return {
    type: report.type === 'lost' ? 'found' : 'lost',
    status: { $in: ['open', 'matched'] },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }
}

async function potentialMatches(report) {
  const candidates = await Report.find(candidateQuery(report, report._id))
  return candidates
    .map((candidate) => ({ report: candidate, ...scoreMatch(report, candidate) }))
    .filter((candidate) => candidate.comparable && candidate.score >= getMatchThreshold())
    .sort((a, b) => b.score - a.score || String(a.report._id).localeCompare(String(b.report._id)))
}

function validateReport(body) {
  const itemName = String(body.itemName || '').trim()
  const category = String(body.category || '').trim()
  const description = String(body.description || '').trim()
  const eventDate = new Date(body.eventDate)
  const location = String(body.location || '').trim()
  if (!['lost', 'found'].includes(body.type)) return 'Choose whether the item was lost or found.'
  if (itemName.length < 2 || itemName.length > 120) return 'Item name must be between 2 and 120 characters.'
  if (!category || category.length > 60) return 'Choose a valid category.'
  if (description.length < 10 || description.length > 2000) return 'Description must be between 10 and 2,000 characters.'
  if (!location || location.length > 160) return 'Location is required and must be under 160 characters.'
  if (!Number.isFinite(eventDate.getTime()) || eventDate > new Date()) return 'Enter a valid date that is not in the future.'
  if (String(body.color || '').length > 60) return 'Color must be under 60 characters.'
  return null
}

export async function listReports(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 12))
  const query = { status: { $in: ['open', 'matched'] } }
  if (req.query.type && !['lost', 'found'].includes(req.query.type)) return res.status(400).json({ message: 'Report type must be lost or found.' })
  if (req.query.type) query.type = req.query.type
  if (typeof req.query.category === 'string' && req.query.category.trim()) query.category = req.query.category.trim()
  if (typeof req.query.location === 'string' && req.query.location.trim()) query.location = { $regex: escapeRegex(req.query.location.trim()), $options: 'i' }
  if (req.query.from || req.query.to) {
    query.eventDate = {}
    if (req.query.from && !Number.isFinite(new Date(req.query.from).getTime())) return res.status(400).json({ message: 'The from date filter is invalid.' })
    if (req.query.to && !Number.isFinite(new Date(req.query.to).getTime())) return res.status(400).json({ message: 'The to date filter is invalid.' })
    if (req.query.from) query.eventDate.$gte = new Date(req.query.from)
    if (req.query.to) query.eventDate.$lte = new Date(req.query.to)
    if (query.eventDate.$gte && query.eventDate.$lte && query.eventDate.$gte > query.eventDate.$lte) return res.status(400).json({ message: 'The from date must be before the to date.' })
  }
  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    const pattern = escapeRegex(req.query.search.trim().slice(0, 80))
    query.$or = ['itemName', 'description', 'location'].map((key) => ({ [key]: { $regex: pattern, $options: 'i' } }))
  }
  const sortField = allowedSorts.has(req.query.sort) ? req.query.sort : 'createdAt'
  const direction = req.query.direction === 'asc' ? 1 : -1
  const [reports, total] = await Promise.all([
    Report.find(query).populate('reporter', 'name').sort({ [sortField]: direction, _id: 1 }).skip((page - 1) * limit).limit(limit),
    Report.countDocuments(query),
  ])
  res.json({ reports, pagination: { page, limit, total, pages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrevious: page > 1 } })
}

export async function myReports(req, res) {
  const reports = await Report.find({ reporter: req.user.id }).sort({ createdAt: -1 })
  res.json({ reports })
}

export async function getReport(req, res) {
  if (!validObjectId(req.params.id)) return res.status(400).json({ message: 'The supplied report identifier is invalid.' })
  const report = await Report.findById(req.params.id).populate('reporter', 'name')
  if (!report) return res.status(404).json({ message: 'Report not found.' })
  const matches = await potentialMatches(report)
  res.json({
    report,
    matches: matches.map(({ report: candidate, score, factors }) => ({ report: candidate, score, factors })),
  })
}

export async function getReportClaim(req, res) {
  if (!validObjectId(req.params.id)) return res.status(400).json({ message: 'The supplied report identifier is invalid.' })
  const report = await Report.findById(req.params.id)
  if (!report) return res.status(404).json({ message: 'Report not found.' })
  if (String(report.reporter) !== String(req.user.id)) {
    return res.status(403).json({ message: 'Only the person who posted this item can view incoming claims.' })
  }
  const claims = await Claim.find({
    report: report._id,
    status: { $in: ['pending', 'under_discussion', 'accepted', 'return_arranged', 'disputed', 'approved'] },
    active: { $ne: false },
  }).select('status createdAt claimant evidence history returnConfirmations')
    .populate('claimant', 'name')
    .sort({ createdAt: -1 })
  res.json({ claims })
}

export async function createReport(req, res) {
  const error = validateReport(req.body)
  if (error) return res.status(400).json({ message: error })
  const reportData = Object.fromEntries(fields.map((field) => [field, req.body[field]]))
  if (req.file) reportData.image = await uploadImage(req.file)
  let report
  try {
    report = await Report.create({ ...reportData, reporter: req.user.id })
  } catch (creationError) {
    if (reportData.image?.publicId) {
      try {
        await deleteImage(reportData.image.publicId)
      } catch {
        console.error('Could not clean up an image after a failed report creation.')
      }
    }
    throw creationError
  }
  const matches = await potentialMatches(report)
  await notifyPotentialMatches(report, matches)
  res.status(201).json({ report, matches: matches.map(({ report: candidate, score, factors }) => ({ report: candidate, score, factors })) })
}

export async function updateReport(req, res) {
  if (!validObjectId(req.params.id)) return res.status(400).json({ message: 'The supplied report identifier is invalid.' })
  const report = await Report.findById(req.params.id)
  if (!report) return res.status(404).json({ message: 'Report not found.' })
  if (String(report.reporter) !== String(req.user.id) && req.user.role !== 'admin') return res.status(403).json({ message: 'You can only edit your own report.' })
  if (req.body.status !== undefined) return res.status(403).json({ message: 'Report status must be changed through the moderation endpoint.' })
  if (req.body.status !== undefined && !['open', 'matched', 'closed', 'recovered'].includes(req.body.status)) return res.status(400).json({ message: 'Choose a valid report status.' })
  const body = { ...report.toObject(), ...req.body }
  const error = validateReport(body)
  if (error) return res.status(400).json({ message: error })
  for (const field of fields) if (req.body[field] !== undefined) report[field] = req.body[field]
  let uploadedImage
  const oldImageId = report.image?.publicId
  if (req.file) {
    uploadedImage = await uploadImage(req.file)
    report.image = uploadedImage
  }
  try {
    await report.save()
  } catch (saveError) {
    if (uploadedImage?.publicId) {
      try {
        await deleteImage(uploadedImage.publicId)
      } catch {
        console.error('Could not clean up an image after a failed report update.')
      }
    }
    throw saveError
  }
  if (uploadedImage && oldImageId) {
    try {
      await deleteImage(oldImageId)
    } catch {
      console.error('Could not remove a replaced report image.')
    }
  }
  const matches = await potentialMatches(report)
  await notifyPotentialMatches(report, matches)
  res.json({ report, matches: matches.map(({ report: candidate, score, factors }) => ({ report: candidate, score, factors })) })
}

export async function markReportRecovered(req, res) {
  if (!validObjectId(req.params.id)) return res.status(400).json({ message: 'The supplied report identifier is invalid.' })
  const report = await Report.findById(req.params.id)
  if (!report) return res.status(404).json({ message: 'Report not found.' })
  if (String(report.reporter) !== String(req.user.id)) return res.status(403).json({ message: 'You can only close your own report.' })
  if (report.type !== 'lost') return res.status(400).json({ message: 'Only a lost report can be marked as recovered.' })
  if (report.status === 'recovered') return res.json({ report })
  if (!['open', 'matched'].includes(report.status)) return res.status(409).json({ message: 'Only an active lost report can be marked as recovered.' })

  const updated = await Report.findOneAndUpdate(
    { _id: report._id, type: 'lost', status: { $in: ['open', 'matched'] }, reporter: req.user.id },
    { $set: { status: 'recovered' } },
    { new: true, runValidators: true },
  )
  if (!updated) return res.status(409).json({ message: 'This report changed while it was being updated. Refresh and try again.' })
  res.json({ report: updated })
}

export async function deleteReport(req, res) {
  if (!validObjectId(req.params.id)) return res.status(400).json({ message: 'The supplied report identifier is invalid.' })
  const report = await Report.findById(req.params.id)
  if (!report) return res.status(404).json({ message: 'Report not found.' })
  if (String(report.reporter) !== String(req.user.id) && req.user.role !== 'admin') return res.status(403).json({ message: 'You can only delete your own report.' })
  if (await Claim.exists({ report: report._id })) return res.status(409).json({ message: 'Reports with claims cannot be deleted because their claim and return history must be preserved.' })
  if (report.image?.publicId) await deleteImage(report.image.publicId)
  await report.deleteOne()
  res.json({ message: 'Report deleted.' })
}

export async function getMatches(req, res) {
  if (!validObjectId(req.params.id)) return res.status(400).json({ message: 'The supplied report identifier is invalid.' })
  const report = await Report.findById(req.params.id)
  if (!report) return res.status(404).json({ message: 'Report not found.' })
  if (String(report.reporter) !== String(req.user.id) && req.user.role !== 'admin') return res.status(403).json({ message: 'You can only view suggestions for your own report.' })
  const matches = await potentialMatches(report)
  res.json({
    threshold: getMatchThreshold(),
    disclaimer: 'A match score is only a suggestion and is not proof of ownership.',
    matches: matches.map(({ report: candidate, score, factors }) => ({ report: candidate, score, factors })),
  })
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
