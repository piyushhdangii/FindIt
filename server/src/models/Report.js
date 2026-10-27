import mongoose from 'mongoose'

const reportStatuses = ['open', 'matched', 'closed', 'recovered']
const moderationHistorySchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  from: { type: String, enum: reportStatuses, required: true },
  to: { type: String, enum: reportStatuses, required: true },
  reason: { type: String, trim: true, required: true, maxlength: 300 },
  at: { type: Date, default: Date.now },
}, { _id: false })

const reportSchema = new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  activeClaim: { type: mongoose.Schema.Types.ObjectId, ref: 'Claim', select: false },
  returnedClaim: { type: mongoose.Schema.Types.ObjectId, ref: 'Claim', select: false, default: null },
  type: { type: String, enum: ['lost', 'found'], required: true, index: true },
  itemName: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  category: { type: String, required: true, trim: true, maxlength: 60, index: true },
  description: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },
  color: { type: String, trim: true, maxlength: 60, default: '' },
  eventDate: { type: Date, required: true, index: true },
  location: { type: String, required: true, trim: true, maxlength: 160 },
  image: {
    url: { type: String, default: '' },
    publicId: { type: String, default: '' },
  },
  status: { type: String, enum: reportStatuses, default: 'open', index: true },
  moderationHistory: { type: [moderationHistorySchema], default: [], select: false },
}, { timestamps: true })

reportSchema.index({ type: 1, status: 1, category: 1, eventDate: -1 })
reportSchema.index({ itemName: 'text', description: 'text', location: 'text' })

export default mongoose.models.Report || mongoose.model('Report', reportSchema)
