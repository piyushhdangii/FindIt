import mongoose from 'mongoose'

const messageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
  clientMessageId: { type: String, required: true, minlength: 8, maxlength: 100 },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: { createdAt: true, updatedAt: false } })

messageSchema.index({ conversation: 1, createdAt: 1, _id: 1 })
messageSchema.index({ conversation: 1, sender: 1, clientMessageId: 1 }, { unique: true })
messageSchema.index({ conversation: 1, sender: 1, createdAt: -1 })

export default mongoose.models.Message || mongoose.model('Message', messageSchema)
