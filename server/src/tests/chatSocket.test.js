import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import jwt from 'jsonwebtoken'
import { io as createClient } from 'socket.io-client'

const state = vi.hoisted(() => ({ userIds: new Set(), messageInput: null }))

vi.mock('../models/User.js', () => ({
  default: {
    findById: async (id) => state.userIds.has(String(id)) ? { _id: String(id) } : null,
  },
}))

vi.mock('../services/chat.js', () => {
  class ChatError extends Error {
    constructor(message, status = 400) {
      super(message)
      this.status = status
    }
  }
  return {
    ChatError,
    getConversationContext: vi.fn(),
    markConversationRead: vi.fn(async () => new Date()),
    persistMessage: vi.fn(async (input) => {
      state.messageInput = input
      return {
        message: {
          _id: '999999999999999999999999',
          conversationId: input.conversationId,
          sender: { _id: input.userId, name: 'Authenticated User' },
          content: input.content,
          clientMessageId: input.clientMessageId,
          createdAt: new Date(),
          readBy: [input.userId],
        },
        created: true,
        recipientId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      }
    }),
  }
})

const secret = 'chat-socket-test-secret-that-is-long-enough'
const userId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const strangerId = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const conversationId = 'cccccccccccccccccccccccc'
let attachChatSocket
let chatService

async function startSocketServer() {
  const server = createServer()
  const ioServer = attachChatSocket(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return { server, ioServer, url: `http://127.0.0.1:${address.port}` }
}

function connectedClient(url, cookie) {
  return createClient(url, {
    transports: ['websocket'],
    reconnection: false,
    timeout: 3000,
    ...(cookie ? { extraHeaders: { Cookie: cookie } } : {}),
  })
}

function closeServer(client, ioServer) {
  client?.disconnect()
  return new Promise((resolve) => ioServer.close(resolve))
}

beforeAll(async () => {
  vi.stubEnv('JWT_SECRET', secret)
  vi.stubEnv('CLIENT_URL', 'http://localhost:5173')
  vi.stubEnv('COOKIE_NAME', 'findit_socket_test')
  vi.resetModules()
  ;[{ attachChatSocket }, chatService] = await Promise.all([
    import('../services/chatSocket.js'),
    import('../services/chat.js'),
  ])
})

afterAll(() => vi.unstubAllEnvs())

describe('chat socket session and authorization', () => {
  it('rejects a connection without the existing session cookie', async () => {
    const { ioServer, url } = await startSocketServer()
    const client = connectedClient(url)
    const error = await new Promise((resolve) => client.once('connect_error', resolve))
    await closeServer(client, ioServer)

    expect(error.message).toMatch(/Authentication required/)
  })

  it('rejects attempts to join a conversation the socket user does not belong to', async () => {
    state.userIds.add(userId)
    chatService.getConversationContext.mockRejectedValue(new chatService.ChatError('Conversation not found.', 404))
    const { ioServer, url } = await startSocketServer()
    const client = connectedClient(url, `findit_socket_test=${jwt.sign({ sub: userId }, secret)}`)
    await new Promise((resolve) => client.once('connect', resolve))
    const response = await new Promise((resolve) => client.emit('conversation:join', { conversationId }, resolve))
    await closeServer(client, ioServer)

    expect(response.error).toBe('Conversation not found.')
  })

  it('rejects archived conversations from live socket rooms', async () => {
    state.userIds.add(userId)
    chatService.getConversationContext.mockResolvedValue({
      conversation: { _id: conversationId, participants: [userId, strangerId] },
      claim: { status: 'returned' },
      report: { type: 'found', status: 'recovered', itemName: 'Bag' },
      active: false,
    })
    const { ioServer, url } = await startSocketServer()
    const client = connectedClient(url, `findit_socket_test=${jwt.sign({ sub: userId }, secret)}`)
    await new Promise((resolve) => client.once('connect', resolve))
    const response = await new Promise((resolve) => client.emit('conversation:join', { conversationId }, resolve))
    await closeServer(client, ioServer)

    expect(response.error).toBe('Messaging is unavailable for this conversation.')
  })

  it('uses the cookie-authenticated user as sender and ignores a forged sender ID', async () => {
    state.userIds.add(userId)
    chatService.getConversationContext.mockResolvedValue({
      conversation: { _id: conversationId, participants: [userId, strangerId] },
      claim: { status: 'pending' },
      report: { type: 'found', status: 'open', itemName: 'Bag' },
      active: true,
    })
    const { ioServer, url } = await startSocketServer()
    const client = connectedClient(url, `findit_socket_test=${jwt.sign({ sub: userId }, secret)}`)
    await new Promise((resolve) => client.once('connect', resolve))
    const response = await new Promise((resolve) => client.emit('message:send', {
      conversationId,
      content: 'I can describe the item.',
      clientMessageId: 'message-unique-01',
      senderId: strangerId,
    }, resolve))
    await closeServer(client, ioServer)

    expect(response.ok).toBe(true)
    expect(state.messageInput.userId).toBe(userId)
    expect(state.messageInput.senderId).toBeUndefined()
  })
})
