import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

const state = vi.hoisted(() => ({
  conversations: new Map(),
  claims: new Map(),
  reports: new Map(),
  users: new Map(),
  notificationUpserts: [],
  messages: [],
  persistedMessages: new Map(),
  unreadCounts: new Map(),
  readMessageQueries: [],
  readNotificationQueries: [],
}))

vi.mock('../models/Conversation.js', () => ({
  default: {
    findById: (id) => Promise.resolve(state.conversations.get(String(id)) || null),
    find: () => ({ sort() { return this }, limit: async () => [] }),
    findOneAndUpdate: async () => null,
    findOne: async ({ claim }) => [...state.conversations.values()].find((conversation) => String(conversation.claim) === String(claim)) || null,
    create: async (fields) => {
      const conversation = {
        ...fields,
        _id: '111111111111111111111111',
        lastMessageAt: null,
        lastMessagePreview: '',
        save: vi.fn(async () => {}),
      }
      state.conversations.set(String(conversation._id), conversation)
      return conversation
    },
    updateOne: vi.fn(),
  },
}))

vi.mock('../models/Claim.js', () => ({
  default: {
    findById: (id) => Promise.resolve(state.claims.get(String(id)) || null),
    findOneAndUpdate: async ({ _id, status }, update) => {
      const claim = state.claims.get(String(_id))
      if (!claim || claim.status !== status) return null
      Object.assign(claim, update.$set)
      claim.history = [...(claim.history || []), ...(update.$push?.history ? [update.$push.history] : [])]
      return claim
    },
  },
}))

vi.mock('../models/Report.js', () => ({
  default: {
    findById(id) {
      const report = state.reports.get(String(id)) || null
      const query = Promise.resolve(report)
      query.select = () => Promise.resolve(report)
      return query
    },
  },
}))

vi.mock('../models/Message.js', () => ({
  default: {
    countDocuments: (query) => Promise.resolve(state.unreadCounts.get(String(query.sender.$ne)) || 0),
    async create(fields) {
      const key = `${fields.conversation}:${fields.sender}:${fields.clientMessageId}`
      if (state.persistedMessages.has(key)) throw Object.assign(new Error('duplicate key'), { code: 11000 })
      const message = { ...fields, _id: `${String(state.persistedMessages.size + 1).padStart(24, '0')}`, createdAt: new Date() }
      state.persistedMessages.set(key, message)
      return message
    },
    findOne: async ({ conversation, sender, clientMessageId }) => state.persistedMessages.get(`${conversation}:${sender}:${clientMessageId}`) || null,
    find: () => ({
      populate() { return this },
      sort() { return this },
      limit: async () => [...state.messages].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    }),
    updateMany: async (query, update) => {
      state.readMessageQueries.push({ query, update })
      return { modifiedCount: 1 }
    },
  },
}))

vi.mock('../models/Notification.js', () => ({
  default: {
    updateOne: vi.fn(async (...args) => {
      state.notificationUpserts.push(args)
      return { upsertedCount: 1 }
    }),
    updateMany: async (query, update) => {
      state.readNotificationQueries.push({ query, update })
      return { modifiedCount: 1 }
    },
  },
}))

vi.mock('../models/User.js', () => ({
  default: {
    findById(id) {
      const user = state.users.get(String(id)) || null
      const query = Promise.resolve(user)
      query.select = () => Promise.resolve(user)
      return query
    },
  },
}))

const secret = 'chat-test-secret-that-is-long-enough-for-jwt-signing'
const claimantId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const reporterId = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const strangerId = 'cccccccccccccccccccccccc'
const claimId = 'dddddddddddddddddddddddd'
const reportId = 'eeeeeeeeeeeeeeeeeeeeeeee'
const conversationId = 'ffffffffffffffffffffffff'

let app
let Notification

function session(userId) {
  const token = jwt.sign({ sub: userId }, secret)
  return `findit_chat_test=${encodeURIComponent(token)}`
}

function prepareConversation(status = 'pending') {
  state.users.set(claimantId, { _id: claimantId, id: claimantId, name: 'Claimant', role: 'user' })
  state.users.set(reporterId, { _id: reporterId, id: reporterId, name: 'Finder', role: 'user' })
  state.users.set(strangerId, { _id: strangerId, id: strangerId, name: 'Other', role: 'user' })
  state.claims.set(claimId, { _id: claimId, id: claimId, report: reportId, claimant: claimantId, status, history: [] })
  state.reports.set(reportId, { _id: reportId, reporter: reporterId, type: 'found', status: 'open', itemName: 'Blue backpack' })
  state.conversations.set(conversationId, {
    _id: conversationId,
    claim: claimId,
    participants: [claimantId, reporterId],
    status: 'active',
    lastMessageAt: null,
    lastMessagePreview: '',
    save: vi.fn(async () => {}),
  })
}

beforeAll(async () => {
  vi.stubEnv('JWT_SECRET', secret)
  vi.stubEnv('CLIENT_URL', 'http://localhost:5173')
  vi.stubEnv('COOKIE_NAME', 'findit_chat_test')
  vi.resetModules()
  ;[{ default: app }, { default: Notification }] = await Promise.all([
    import('../app.js'),
    import('../models/Notification.js'),
  ])
})

beforeEach(() => {
  state.conversations.clear()
  state.claims.clear()
  state.reports.clear()
  state.users.clear()
  state.notificationUpserts = []
  state.messages = []
  state.persistedMessages.clear()
  state.unreadCounts.clear()
  state.readMessageQueries = []
  state.readNotificationQueries = []
  prepareConversation()
})

afterAll(() => vi.unstubAllEnvs())

describe('chat REST authorization and privacy', () => {
  it('notifies the claim owner when a participant starts a chat', async () => {
    state.conversations.clear()
    const response = await request(app)
      .post(`/api/chat/claims/${claimId}/conversation`)
      .set('Cookie', session(claimantId))
      .expect(200)

    expect(response.body.conversation._id).toBe('111111111111111111111111')
    const notice = state.notificationUpserts.at(-1)[1].$setOnInsert
    expect(String(notice.recipient)).toBe(reporterId)
    expect(notice.title).toBe('A chat was started about your item')
    expect(notice.message).toContain('Claimant')
    expect(String(notice.relatedId)).toBe('111111111111111111111111')
    expect(state.claims.get(claimId).status).toBe('under_discussion')
    expect(state.notificationUpserts.some(([, update]) => update.$setOnInsert.title === 'Claim moved to private discussion')).toBe(true)
  })

  it('notifies the claimant when the finder starts the chat', async () => {
    state.conversations.clear()
    await request(app)
      .post(`/api/chat/claims/${claimId}/conversation`)
      .set('Cookie', session(reporterId))
      .expect(200)

    const notice = state.notificationUpserts.at(-1)[1].$setOnInsert
    expect(String(notice.recipient)).toBe(claimantId)
    expect(notice.message).toContain('Finder')
  })

  it.each([claimantId, reporterId])('allows a claim participant to open their conversation (%s)', async (userId) => {
    const response = await request(app)
      .get(`/api/chat/conversations/${conversationId}`)
      .set('Cookie', session(userId))
      .expect(200)

    expect(response.body.conversation.otherParticipant.name).not.toBeUndefined()
    expect(response.body.conversation.item.itemName).toBe('Blue backpack')
    expect(JSON.stringify(response.body)).not.toContain('evidence')
    expect(JSON.stringify(response.body)).not.toContain('@')
  })

  it('hides another claimant conversation from unrelated users', async () => {
    await request(app)
      .get(`/api/chat/conversations/${conversationId}`)
      .set('Cookie', session(strangerId))
      .expect(404)
  })

  it('rejects a conversation whose stored participants do not match its claim', async () => {
    state.conversations.get(conversationId).participants = [claimantId, strangerId]
    await request(app)
      .get(`/api/chat/conversations/${conversationId}`)
      .set('Cookie', session(claimantId))
      .expect(404)
  })

  it('rejects unauthenticated conversation access', async () => {
    await request(app).get(`/api/chat/conversations/${conversationId}`).expect(401)
  })

  it('validates message pagination before querying history', async () => {
    await request(app)
      .get(`/api/chat/conversations/${conversationId}/messages?limit=101`)
      .set('Cookie', session(claimantId))
      .expect(400)
  })

  it('returns chronological history and limits unread counts to the current user', async () => {
    state.messages = [
      { _id: '111111111111111111111111', conversation: conversationId, sender: { _id: reporterId, name: 'Finder' }, content: 'First', clientMessageId: 'message-0001', createdAt: new Date('2026-01-01T10:00:00Z'), readBy: [] },
      { _id: '222222222222222222222222', conversation: conversationId, sender: { _id: claimantId, name: 'Claimant' }, content: 'Second', clientMessageId: 'message-0002', createdAt: new Date('2026-01-01T10:01:00Z'), readBy: [claimantId] },
    ]
    state.unreadCounts.set(claimantId, 1)
    state.unreadCounts.set(reporterId, 0)
    const claimantResponse = await request(app)
      .get(`/api/chat/conversations/${conversationId}`)
      .set('Cookie', session(claimantId))
      .expect(200)
    const history = await request(app)
      .get(`/api/chat/conversations/${conversationId}/messages`)
      .set('Cookie', session(claimantId))
      .expect(200)
    const reporterResponse = await request(app)
      .get(`/api/chat/conversations/${conversationId}`)
      .set('Cookie', session(reporterId))
      .expect(200)

    expect(claimantResponse.body.conversation.unreadCount).toBe(1)
    expect(reporterResponse.body.conversation.unreadCount).toBe(0)
    expect(history.body.messages.map((message) => message.content)).toEqual(['First', 'Second'])
  })

  it('marks read state only for the authenticated participant', async () => {
    await request(app)
      .post(`/api/chat/conversations/${conversationId}/read`)
      .set('Cookie', session(claimantId))
      .expect(200)

    expect(state.readMessageQueries[0].query.sender.$ne).toBe(claimantId)
    expect(state.readMessageQueries[0].query.readBy.$ne).toBe(claimantId)
    expect(state.readNotificationQueries[0].query.recipient).toBe(claimantId)
    expect(state.readNotificationQueries[0].query.relatedId).toBe(conversationId)
  })

  it('keeps archived claim history readable but excludes it from sending eligibility', async () => {
    state.claims.set(claimId, { _id: claimId, report: reportId, claimant: claimantId, status: 'rejected' })
    const response = await request(app)
      .get(`/api/chat/conversations/${conversationId}`)
      .set('Cookie', session(claimantId))
      .expect(200)
    const { getClaimContext } = await import('../services/chat.js')

    expect(response.body.conversation.status).toBe('archived')
    await expect(getClaimContext(claimId, claimantId)).rejects.toMatchObject({ status: 409 })
  })

  it('trims, persists, and deduplicates messages using the authenticated sender', async () => {
    const { persistMessage } = await import('../services/chat.js')
    const input = {
      conversationId,
      userId: claimantId,
      content: '  I can describe the item.  ',
      clientMessageId: 'message-unique-01',
    }

    const first = await persistMessage(input)
    const retry = await persistMessage(input)

    expect(first.message.content).toBe('I can describe the item.')
    expect(first.message.sender._id).toBe(claimantId)
    expect(first.created).toBe(true)
    expect(retry.created).toBe(false)
    expect(state.persistedMessages.size).toBe(1)
    expect(state.conversations.get(conversationId).lastMessagePreview).toBe('I can describe the item.')
    const notice = Notification.updateOne.mock.calls.at(-1)[1].$setOnInsert
    expect(String(notice.recipient)).toBe(reporterId)
    expect(notice.message).not.toContain('evidence')
    await expect(persistMessage({ ...input, content: 'Different message text' })).rejects.toMatchObject({ status: 409 })
  })

  it('rejects whitespace-only and oversized message content', async () => {
    const { validateMessage } = await import('../services/chat.js')
    expect(() => validateMessage('   ', 'message-unique-01')).toThrow(/1 and 2,000/)
    expect(() => validateMessage('x'.repeat(2001), 'message-unique-01')).toThrow(/1 and 2,000/)
    expect(() => validateMessage('hello', 'short')).toThrow(/client message ID/)
  })

  it('denies unrelated senders and messaging on closed claims', async () => {
    const { persistMessage } = await import('../services/chat.js')
    const input = { conversationId, content: 'A message', clientMessageId: 'message-unique-02' }
    await expect(persistMessage({ ...input, userId: strangerId })).rejects.toMatchObject({ status: 404 })
    state.claims.set(claimId, { _id: claimId, report: reportId, claimant: claimantId, status: 'completed' })
    await expect(persistMessage({ ...input, userId: claimantId })).rejects.toMatchObject({ status: 409 })
    expect(state.persistedMessages.size).toBe(0)
  })
})
