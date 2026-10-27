import mongoose from 'mongoose'

const claimStatuses = ['pending', 'under_discussion', 'accepted', 'rejected', 'return_arranged', 'returned', 'cancelled', 'disputed', 'approved', 'completed']

const historySchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  from: { type: String, enum: claimStatuses, required: true },
  to: { type: String, enum: claimStatuses, required: true },
  note: { type: String, trim: true, maxlength: 300, default: '' },
  at: { type: Date, default: Date.now },
}, { _id: false })

const claimSchema = new mongoose.Schema({
  report: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true, index: true },
  claimant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  evidence: { type: String, default: '', maxlength: 2000, select: false },
  status: { type: String, enum: claimStatuses, default: 'pending', index: true },
  active: { type: Boolean, default: true, select: false },
  returnConfirmations: {
    finderAt: { type: Date, default: null },
    claimantAt: { type: Date, default: null },
  },
  history: { type: [historySchema], default: [] },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true, optimisticConcurrency: true })

claimSchema.index({ report: 1, claimant: 1, status: 1 })
claimSchema.index(
  { report: 1, claimant: 1 },
  { unique: true, name: 'one_claim_per_report_claimant' },
)

export default mongoose.models.Claim || mongoose.model('Claim', claimSchema)
