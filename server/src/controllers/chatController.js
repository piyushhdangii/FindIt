import mongoose from 'mongoose'
import Conversation from '../models/Conversation.js'
import Message from '../models/Message.js'
import User from '../models/User.js'
import { conversationResponse, getConversationContext, markConversationRead, openClaimConversation } from '../services/chat.js'
import { createNotification } from '../services/notifications.js'

function parsePageSize(value) {
  if (value === undefined) return 40
  if (!/^\d+$/.test(String(value))) return null
  const limit = Number(value)
  return limit >= 1 && limit <= 100 ? limit : null
}

function messageResponse(message) {
  return {
    _id: String(message._id),
    conversationId: String(message.conversation),
    sender: message.sender && typeof message.sender === 'object'
      ? { _id: String(message.sender._id), name: message.sender.name }
      : { _id: String(message.sender) },
    content: message.content,
    clientMessageId: message.clientMessageId,
    createdAt: message.createdAt,
    readBy: message.readBy.map(String),
  }
}

export async function listConversations(req, res) {
  const conversations = await Conversation.find({ participants: req.user.id }).sort({ updatedAt: -1 }).limit(50)
  const result = await Promise.all(conversations.map(async (conversation) => {
    const context = await getConversationContext(conversation._id, req.user.id)
    const unreadCount = await Message.countDocuments({
      conversation: conversation._id,
      sender: { $ne: req.user.id },
      readBy: { $ne: req.user.id },
    })
    return conversationResponse(context, req.user.id, unreadCount)
  }))
  res.json({ conversations: result })
}

export async function openConversation(req, res) {
  if (!mongoose.isValidObjectId(req.params.claimId)) return res.status(400).json({ message: 'The supplied claim identifier is invalid.' })
  const conversation = await openClaimConversation(req.params.claimId, req.user.id)
  const context = await getConversationContext(conversation._id, req.user.id)
  const initiatorId = String(conversation.initiatedBy || req.user.id)
  const recipient = conversation.participants.find((participant) => String(participant) !== initiatorId)
  if (recipient) {
    const initiator = await User.findById(initiatorId).select('name')
    await createNotification({
      recipient,
      type: 'chat',
      title: 'A chat was started about your item',
      message: `${initiator?.name || 'A community member'} started a chat about ${context.report?.itemName || 'a claimed item'}.`,
      relatedId: conversation._id,
      dedupeKey: `chat-start:${conversation._id}:${String(recipient)}`,
    })
  }
  res.status(200).json({ conversation: await conversationResponse(context, req.user.id) })
}

export async function getConversation(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'The supplied conversation identifier is invalid.' })
  const context = await getConversationContext(req.params.id, req.user.id)
  const unreadCount = await Message.countDocuments({
    conversation: context.conversation._id,
    sender: { $ne: req.user.id },
    readBy: { $ne: req.user.id },
  })
  res.json({ conversation: await conversationResponse(context, req.user.id, unreadCount) })
}

export async function listMessages(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'The supplied conversation identifier is invalid.' })
  const limit = parsePageSize(req.query.limit)
  if (!limit) return res.status(400).json({ message: 'Message page size must be between 1 and 100.' })
  let before
  let beforeId
  if (req.query.before !== undefined) {
    const [timestamp, id] = String(req.query.before).split('~')
    before = new Date(timestamp)
    if (!Number.isFinite(before.getTime())) return res.status(400).json({ message: 'The message cursor is invalid.' })
    if (id !== undefined) {
      if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'The message cursor is invalid.' })
      beforeId = id
    }
  }
  const { conversation } = await getConversationContext(req.params.id, req.user.id)
  const query = {
    conversation: conversation._id,
    ...(before ? {
      $or: beforeId
        ? [{ createdAt: { $lt: before } }, { createdAt: before, _id: { $lt: beforeId } }]
        : [{ createdAt: { $lt: before } }],
    } : {}),
  }
  const messages = await Message.find(query).populate('sender', 'name').sort({ createdAt: -1, _id: -1 }).limit(limit)
  const hasMore = messages.length === limit
  const chronological = messages.reverse()
  const oldest = chronological[0]
  res.json({
    messages: chronological.map(messageResponse),
    pagination: {
      limit,
      hasMore,
      nextBefore: hasMore && oldest ? `${oldest.createdAt.toISOString()}~${oldest._id}` : null,
    },
  })
}

export async function markRead(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'The supplied conversation identifier is invalid.' })
  const readAt = await markConversationRead(req.params.id, req.user.id)
  res.json({ readAt })
}
