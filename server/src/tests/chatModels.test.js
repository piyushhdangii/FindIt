import { describe, expect, it } from 'vitest'
import Conversation from '../models/Conversation.js'
import Message from '../models/Message.js'
import Claim from '../models/Claim.js'

describe('chat database models', () => {
  it('enforces one conversation per claim with a unique database index', () => {
    const claimIndex = Conversation.schema.indexes().find(([keys]) => keys.claim === 1)
    expect(claimIndex?.[1].unique).toBe(true)
  })

  it('limits message content and prevents duplicate sender idempotency keys', () => {
    const idempotencyIndex = Message.schema.indexes().find(([keys]) => keys.conversation === 1 && keys.sender === 1 && keys.clientMessageId === 1)
    expect(Message.schema.path('content').options.maxlength).toBe(2000)
    expect(idempotencyIndex?.[1].unique).toBe(true)
  })

  it('prevents repeat claims per claimant/report regardless of status and stores two-party return confirmations', () => {
    const claimantReportIndex = Claim.schema.indexes().find(([keys, options]) =>
      keys.report === 1 && keys.claimant === 1 && options.unique && !options.partialFilterExpression)
    expect(claimantReportIndex).toBeDefined()
    expect(Claim.schema.path('returnConfirmations.finderAt')).toBeDefined()
    expect(Claim.schema.path('returnConfirmations.claimantAt')).toBeDefined()
  })
})
