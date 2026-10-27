import mongoose from 'mongoose'
import Claim from '../models/Claim.js'
import Conversation from '../models/Conversation.js'
import Message from '../models/Message.js'
import Notification from '../models/Notification.js'
import Report from '../models/Report.js'
import User from '../models/User.js'
import { createNotification } from './notifications.js'

const chatClaimStatuses = ['pending', 'under_discussion', 'accepted', 'return_arranged', 'disputed', 'approved']

export class ChatError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

export function validateMessage(content, clientMessageId) {
  const text = typeof content === 'string' ? content.trim() : ''
  if (!text || text.length > 2000) throw new ChatError('Messages must be between 1 and 2,000 characters.')
  if (typeof clientMessageId !== 'string' || !/^[A-Za-z0-9._:-]{8,100}$/.test(clientMessageId)) {
    throw new ChatError('A valid client message ID is required.')
  }
  return text
}

export async function getClaimContext(claimId, userId) {
  const claim = await Claim.findById(claimId)
  if (!claim) throw new ChatError('Claim not found.', 404)

  const report = await Report.findById(claim.report).select('reporter type status itemName')
  if (!report || report.type !== 'found') throw new ChatError('This claim is not eligible for chat.', 409)

  const participants = [String(claim.claimant), String(report.reporter)]
  if (!participants.includes(String(userId))) throw new ChatError('Claim not found.', 404)

  const active = chatClaimStatuses.includes(claim.status) && ['open', 'matched'].includes(report.status)
  if (!active) throw new ChatError('Messaging is unavailable for this claim.', 409)

  return { claim, report, participants }
}

export async function getConversationContext(conversationId, userId) {
  if (!mongoose.isValidObjectId(conversationId)) throw new ChatError('The supplied conversation identifier is invalid.')
  const conversation = await Conversation.findById(conversationId)
  if (!conversation || !conversation.participants.some((participant) => String(participant) === String(userId))) {
    throw new ChatError('Conversation not found.', 404)
  }

  const claim = await Claim.findById(conversation.claim)
  const report = claim ? await Report.findById(claim.report).select('reporter type status itemName') : null
  const expectedParticipants = claim && report ? [String(claim.claimant), String(report.reporter)] : []
  const isExpectedParticipant = expectedParticipants.includes(String(userId))
  const conversationMatchesClaim = expectedParticipants.length === 2
    && conversation.participants.length === 2
    && conversation.participants.every((participant) => expectedParticipants.includes(String(participant)))
  if (!isExpectedParticipant || !conversationMatchesClaim) throw new ChatError('Conversation not found.', 404)
  const active = Boolean(claim && report && report.type === 'found'
    && chatClaimStatuses.includes(claim.status)
    && ['open', 'matched'].includes(report.status)
    && conversation.status === 'active')

  return { conversation, claim, report, active }
}

export async function openClaimConversation(claimId, userId) {
  const { claim, participants } = await getClaimContext(claimId, userId)
  if (claim.status === 'pending') {
    const updated = await Claim.findOneAndUpdate(
      { _id: claim._id, status: 'pending' },
      {
        $set: { status: 'under_discussion' },
        $push: { history: { actor: userId, from: 'pending', to: 'under_discussion', note: 'The participants started private ownership verification.' } },
      },
      { new: true },
    )
    if (updated) {
      claim.status = updated.status
      const recipient = participants.find((participant) => String(participant) !== String(userId))
      await createNotification({
        recipient,
        type: 'claim',
        title: 'Claim moved to private discussion',
        message: 'A participant opened private chat to verify ownership details.',
        relatedId: claim.report,
        dedupeKey: `claim:${claim.id || claim._id}:under-discussion`,
      })
    } else {
      const latestClaim = await Claim.findById(claim._id)
      if (!latestClaim || !chatClaimStatuses.includes(latestClaim.status)) {
        throw new ChatError('Messaging is unavailable for this claim.', 409)
      }
      claim.status = latestClaim.status
    }
  }
  let conversation = await Conversation.findOne({ claim: claim._id })
  if (!conversation) {
    try {
      conversation = await Conversation.create({
        claim: claim._id,
        participants,
        initiatedBy: userId,
        status: 'active',
      })
    } catch (error) {
      if (error.code !== 11000) throw error
      conversation = await Conversation.findOne({ claim: claim._id })
      if (!conversation) throw error
    }
  }
  if (!conversation.initiatedBy) {
    conversation.initiatedBy = userId
    await conversation.save()
  }
  return conversation
}

export async function conversationResponse(context, userId, unreadCount = 0) {
  const { conversation, claim, report } = context
  const otherParticipantId = conversation.participants.find((participant) => String(participant) !== String(userId))
  const otherParticipant = otherParticipantId ? await User.findById(otherParticipantId).select('name') : null
  return {
    _id: String(conversation._id),
    claim: claim ? { _id: String(claim._id), status: claim.status } : null,
    item: report ? { itemName: report.itemName, type: report.type } : null,
    status: context.active ? 'active' : 'archived',
    lastMessageAt: conversation.lastMessageAt,
    lastMessagePreview: conversation.lastMessagePreview,
    otherParticipant: otherParticipant ? { _id: String(otherParticipant._id), name: otherParticipant.name } : null,
    unreadCount,
  }
}

export async function markConversationRead(conversationId, userId) {
  const { conversation } = await getConversationContext(conversationId, userId)
  const readAt = new Date()
  await Message.updateMany(
    { conversation: conversation._id, sender: { $ne: userId }, readBy: { $ne: userId } },
    { $addToSet: { readBy: userId } },
  )
  await Notification.updateMany(
    { recipient: userId, type: 'chat', relatedId: conversation._id, readAt: null },
    { $set: { readAt } },
  )
  return readAt
}

export async function persistMessage({ conversationId, userId, content, clientMessageId }) {
  const text = validateMessage(content, clientMessageId)
  const context = await getConversationContext(conversationId, userId)
  if (!context.active) throw new ChatError('Messaging is unavailable for this conversation.', 409)

  let message
  let created = true
  try {
    message = await Message.create({
      conversation: context.conversation._id,
      sender: userId,
      content: text,
      clientMessageId,
      readBy: [userId],
    })
  } catch (error) {
    if (error.code !== 11000) throw error
    message = await Message.findOne({
      conversation: context.conversation._id,
      sender: userId,
      clientMessageId,
    })
    if (!message) throw error
    if (message.content !== text) throw new ChatError('This client message ID was already used for different content.', 409)
    created = false
  }

  if (created) {
    context.conversation.lastMessageAt = message.createdAt
    context.conversation.lastMessagePreview = text.slice(0, 120)
    await context.conversation.save()
  }

  const recipient = context.conversation.participants.find((participant) => String(participant) !== String(userId))
  const sender = await User.findById(userId).select('name')
  const formatted = {
    _id: String(message._id),
    conversationId: String(context.conversation._id),
    sender: { _id: String(userId), name: sender?.name || 'Community member' },
    content: message.content,
    clientMessageId: message.clientMessageId,
    createdAt: message.createdAt,
    readBy: message.readBy.map(String),
  }

  if (recipient) {
    await Notification.updateOne(
      { recipient, dedupeKey: `chat:${message._id}:${recipient}` },
      {
        $setOnInsert: {
          recipient,
          type: 'chat',
          title: 'New chat message',
          message: `You have a new message about ${context.report.itemName}.`,
          relatedId: context.conversation._id,
          dedupeKey: `chat:${message._id}:${recipient}`,
        },
      },
      { upsert: true },
    )
  }
  return { message: formatted, created, recipientId: recipient ? String(recipient) : null }
}
