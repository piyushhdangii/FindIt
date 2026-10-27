import jwt from 'jsonwebtoken'
import { Server } from 'socket.io'
import User from '../models/User.js'
import { config } from '../config/env.js'
import { ChatError, markConversationRead, persistMessage, getConversationContext } from './chat.js'
import { setNotificationEmitter } from './notifications.js'

function readSessionCookie(header) {
  for (const part of (header || '').split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0 || part.slice(0, separator).trim() !== config.cookieName) continue
    try {
      return decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      return null
    }
  }
  return null
}

function safeError(error) {
  if (error instanceof ChatError) return error.message
  console.error(`Chat socket operation failed: ${error.name || 'Error'}`)
  return 'The chat request could not be completed.'
}

function ackFailure(socket, acknowledge, error) {
  const message = safeError(error)
  socket.emit('conversation:error', { message })
  if (typeof acknowledge === 'function') acknowledge({ error: message })
}

function registerEvent(socket, event, handler) {
  socket.on(event, async (payload, acknowledge) => {
    try {
      await handler(payload || {}, acknowledge)
    } catch (error) {
      ackFailure(socket, acknowledge, error)
    }
  })
}

export function attachChatSocket(server) {
  const io = new Server(server, {
    cors: { origin: config.clientUrl, credentials: true },
    allowRequest(request, callback) {
      const origin = request.headers.origin
      callback(origin && origin !== config.clientUrl ? 'Origin is not allowed.' : null, !origin || origin === config.clientUrl)
    },
  })
  setNotificationEmitter((userId, notification) => {
    io.to(`user:${userId}`).emit('notification:new', notification)
  })

  io.use(async (socket, next) => {
    const token = readSessionCookie(socket.handshake.headers.cookie)
    if (!token) return next(new Error('Authentication required.'))
    let payload
    try {
      payload = jwt.verify(token, config.jwtSecret)
    } catch {
      return next(new Error('Authentication required.'))
    }
    if (typeof payload.sub !== 'string') return next(new Error('Authentication required.'))
    try {
      const user = await User.findById(payload.sub)
      if (!user) return next(new Error('Authentication required.'))
      socket.data.userId = String(user._id)
      return next()
    } catch (error) {
      console.error(`Chat socket authentication failed: ${error.name || 'Error'}`)
      return next(new Error('Authentication service unavailable.'))
    }
  })

  io.on('connection', (socket) => {
    const userId = socket.data.userId
    socket.join(`user:${userId}`)
    socket.data.messageWindow = { startedAt: Date.now(), count: 0 }

    registerEvent(socket, 'conversation:join', async ({ conversationId }, acknowledge) => {
      const context = await getConversationContext(conversationId, userId)
      if (!context.active) throw new ChatError('Messaging is unavailable for this conversation.', 409)
      socket.join(`conversation:${context.conversation._id}`)
      if (typeof acknowledge === 'function') acknowledge({ ok: true })
    })

    registerEvent(socket, 'conversation:leave', async ({ conversationId }, acknowledge) => {
      await getConversationContext(conversationId, userId)
      socket.leave(`conversation:${conversationId}`)
      if (typeof acknowledge === 'function') acknowledge({ ok: true })
    })

    registerEvent(socket, 'message:send', async (payload, acknowledge) => {
      const now = Date.now()
      if (now - socket.data.messageWindow.startedAt >= 10000) {
        socket.data.messageWindow = { startedAt: now, count: 0 }
      }
      if (socket.data.messageWindow.count >= 12) throw new ChatError('You are sending messages too quickly. Please wait a moment.', 429)
      socket.data.messageWindow.count += 1

      const result = await persistMessage({
        conversationId: payload.conversationId,
        userId,
        content: payload.content,
        clientMessageId: payload.clientMessageId,
      })
      if (result.created) {
        io.to(`conversation:${result.message.conversationId}`).emit('message:new', result.message)
      }
      if (result.recipientId) {
        io.to(`user:${result.recipientId}`).emit('notification:new', {
          type: 'chat',
          title: 'New chat message',
          relatedId: result.message.conversationId,
        })
      }
      if (typeof acknowledge === 'function') acknowledge({ ok: true, message: result.message })
    })

    registerEvent(socket, 'message:read', async ({ conversationId }, acknowledge) => {
      await getConversationContext(conversationId, userId)
      const readAt = await markConversationRead(conversationId, userId)
      io.to(`conversation:${conversationId}`).emit('message:read', {
        conversationId,
        readerId: userId,
        readAt,
      })
      if (typeof acknowledge === 'function') acknowledge({ ok: true, readAt })
    })
  })

  return io
}
