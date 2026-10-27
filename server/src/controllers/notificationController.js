import mongoose from 'mongoose'
import Notification from '../models/Notification.js'

export async function listNotifications(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20))
  const query = { recipient: req.user.id }
  const [notifications, total, unread] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Notification.countDocuments(query),
    Notification.countDocuments({ ...query, readAt: null }),
  ])
  res.json({ notifications, unread, pagination: { page, limit, total, pages: Math.ceil(total / limit) } })
}

export async function markRead(req, res) {
  if (req.params.id !== 'all' && !mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'The supplied notification identifier is invalid.' })
  if (req.params.id === 'all') {
    await Notification.updateMany({ recipient: req.user.id, readAt: null }, { readAt: new Date() })
  } else {
    const updated = await Notification.findOneAndUpdate({ _id: req.params.id, recipient: req.user.id }, { readAt: new Date() }, { new: true })
    if (!updated) return res.status(404).json({ message: 'Notification not found.' })
  }
  res.json({ message: 'Notification state updated.' })
}
