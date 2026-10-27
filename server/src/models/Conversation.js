import mongoose from 'mongoose'

const conversationSchema = new mongoose.Schema({
  claim: { type: mongoose.Schema.Types.ObjectId, ref: 'Claim', required: true, unique: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  lastMessageAt: { type: Date, default: null },
  lastMessagePreview: { type: String, maxlength: 120, default: '' },
}, { timestamps: true })

conversationSchema.index({ participants: 1, updatedAt: -1 })

export default mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema)
