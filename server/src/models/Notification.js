import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, required: true, maxlength: 40 },
  title: { type: String, required: true, maxlength: 100 },
  message: { type: String, required: true, maxlength: 240 },
  relatedId: { type: mongoose.Schema.Types.ObjectId, default: null },
  dedupeKey: { type: String, required: true, maxlength: 180 },
  readAt: { type: Date, default: null },
}, { timestamps: true })

notificationSchema.index({ recipient: 1, dedupeKey: 1 }, { unique: true })
notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 })

export default mongoose.models.Notification || mongoose.model('Notification', notificationSchema)
