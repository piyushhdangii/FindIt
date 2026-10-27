import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

const state = vi.hoisted(() => ({
  claims: new Map(),
  reports: new Map(),
  users: new Map(),
  notifications: [],
  claimSequence: 0,
}))
const claimantId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const reporterId = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const secondClaimantId = 'eeeeeeeeeeeeeeeeeeeeeeee'
const strangerId = 'ffffffffffffffffffffffff'
const adminId = '999999999999999999999999'
const reportId = 'cccccccccccccccccccccccc'
const claimId = 'dddddddddddddddddddddddd'
const secret = 'claim-test-secret-that-is-long-enough-for-jwt-signing'

vi.mock('../models/Claim.js', () => {
  function matchesStatus(claim, status) {
    if (status === undefined) return true
    if (typeof status === 'string') return claim.status === status
    if (status.$in) return status.$in.includes(claim.status)
    return false
  }
  function matchesFilter(claim, filter) {
    if (filter.claimant && String(claim.claimant) !== String(filter.claimant)) return false
    if (filter.report && String(claim.report) !== String(filter.report)) return false
    if (filter.$or && !filter.$or.some((condition) => {
      if (condition.status) return matchesStatus(claim, condition.status)
      if (condition.claimant) return String(claim.claimant) === String(condition.claimant)
      if (condition.report?.$in) return condition.report.$in.some((report) => String(claim.report) === String(report))
      return false
    })) return false
    return matchesStatus(claim, filter.status)
  }
  function setPath(object, path, value) {
    const parts = path.split('.')
    let target = object
    while (parts.length > 1) target = target[parts.shift()] ||= {}
    target[parts[0]] = value
  }
  function query(value) {
    return {
      select() { return this },
      populate() { return this },
      sort() { return this },
      then(resolve, reject) { return Promise.resolve(value).then(resolve, reject) },
    }
  }
  return {
    default: class Claim {
      static async exists({ report, claimant, status }) {
        return [...state.claims.values()].some((claim) =>
          String(claim.report) === String(report)
          && String(claim.claimant) === String(claimant)
          && matchesStatus(claim, status))
      }

      static findById(id) {
        return query(state.claims.get(String(id)) || null)
      }

      static findOneAndUpdate(filter, update) {
        const claim = state.claims.get(String(filter._id))
        if (!claim || !matchesStatus(claim, filter.status)) return Promise.resolve(null)
        if (filter['returnConfirmations.finderAt'] === null && claim.returnConfirmations?.finderAt) return Promise.resolve(null)
        if (filter['returnConfirmations.claimantAt'] === null && claim.returnConfirmations?.claimantAt) return Promise.resolve(null)
        if (filter['returnConfirmations.finderAt']?.$ne === null && !claim.returnConfirmations?.finderAt) return Promise.resolve(null)
        if (filter['returnConfirmations.claimantAt']?.$ne === null && !claim.returnConfirmations?.claimantAt) return Promise.resolve(null)
        for (const [path, value] of Object.entries(update.$set || {})) setPath(claim, path, value)
        if (update.$push?.history) claim.history.push(update.$push.history)
        return Promise.resolve(claim)
      }

      static find(filter = {}) {
        const claims = [...state.claims.values()].filter((claim) =>
          (!filter._id?.$ne || String(claim._id) !== String(filter._id.$ne))
          && matchesFilter(claim, filter))
        return query(claims)
      }

      static async updateOne(filter, update) {
        const claim = state.claims.get(String(filter._id))
        if (!claim || !matchesStatus(claim, filter.status)) return { modifiedCount: 0 }
        for (const [path, value] of Object.entries(update.$set || {})) setPath(claim, path, value)
        if (update.$push?.history) claim.history.push(update.$push.history)
        return { modifiedCount: 1 }
      }

      static async updateMany(filter, update) {
        const ids = filter._id?.$in?.map(String)
        let modifiedCount = 0
        for (const claim of state.claims.values()) {
          if (ids && !ids.includes(String(claim._id))) continue
          if (!matchesStatus(claim, filter.status)) continue
          for (const [path, value] of Object.entries(update.$set || {})) setPath(claim, path, value)
          if (update.$push?.history) claim.history.push(update.$push.history)
          modifiedCount += 1
        }
        return { modifiedCount }
      }

      constructor(fields) {
        const id = `${String(++state.claimSequence).padStart(24, '0')}`
        Object.assign(this, fields, { _id: id, id, status: 'pending', active: true, history: [], returnConfirmations: { finderAt: null, claimantAt: null } })
      }

      async save() { state.claims.set(String(this._id), this) }

      toObject() { return { ...this } }
    },
  }
})

vi.mock('../models/Report.js', () => {
  function query(value) {
    return {
      select() { return this },
      then(resolve, reject) { return Promise.resolve(value).then(resolve, reject) },
    }
  }
  return {
    default: {
      findById(id) { return query(state.reports.get(String(id)) || null) },
      find(filter = {}) {
        return query([...state.reports.values()].filter((report) =>
          (!filter.reporter || String(report.reporter) === String(filter.reporter))
          && (!filter.type || report.type === filter.type)))
      },
      findOne(filter) {
        const report = state.reports.get(String(filter._id)) || null
        const allowed = filter.status?.$in
        return query(report && (!allowed || allowed.includes(report.status)) && (!filter.type || filter.type === report.type) ? report : null)
      },
      async findOneAndUpdate(filter, update) {
        const report = state.reports.get(String(filter._id))
        const allowed = filter.status?.$in
        if (!report
          || (allowed && !allowed.includes(report.status))
          || (filter.type && report.type !== filter.type)
          || (filter.returnedClaim === null && report.returnedClaim)) return null
        Object.assign(report, update.$set)
        return report
      },
      async updateOne(filter, update) {
        const report = state.reports.get(String(filter._id))
        if (report) Object.assign(report, update.$set)
        return { modifiedCount: report ? 1 : 0 }
      },
    },
  }
})

vi.mock('../models/Notification.js', () => ({
  default: {
    updateOne: async (...args) => {
      state.notifications.push(args)
      return { upsertedCount: 1 }
    },
  },
}))

vi.mock('../models/User.js', () => {
  function query(value) {
    return { select() { return this }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject) } }
  }
  return {
    default: {
      findById: async (id) => state.users.get(String(id)) || null,
      find: (filter) => query([...state.users.values()].filter((user) => user.role === filter.role)),
    },
  }
})

const conversationUpdates = vi.hoisted(() => ({ updates: [] }))
vi.mock('../models/Conversation.js', () => ({
  default: {
    updateOne: async (...args) => { conversationUpdates.updates.push(args) },
    updateMany: async (...args) => { conversationUpdates.updates.push(args) },
  },
}))

let app

function session(userId) {
  const token = jwt.sign({ sub: userId }, secret)
  return `findit_claim_test=${encodeURIComponent(token)}`
}

function registerUsers() {
  for (const [id, role, name] of [
    [claimantId, 'user', 'Claimant'],
    [reporterId, 'user', 'Finder'],
    [secondClaimantId, 'user', 'Second claimant'],
    [strangerId, 'user', 'Stranger'],
    [adminId, 'admin', 'Moderator'],
  ]) {
    state.users.set(id, { _id: id, id, name, role })
  }
}

function addReport() {
  state.reports.set(reportId, {
    _id: reportId,
    id: reportId,
    reporter: reporterId,
    type: 'found',
    status: 'open',
    itemName: 'Blue backpack',
    moderationHistory: [],
    async save() {},
  })
}

function createClaimAs(userId = claimantId, evidence = 'A distinctive mark matches my item.') {
  return request(app)
    .post(`/api/claims/reports/${reportId}`)
    .set('Cookie', session(userId))
    .send({ evidence })
}

beforeAll(async () => {
  vi.stubEnv('JWT_SECRET', secret)
  vi.stubEnv('CLIENT_URL', 'http://localhost:5173')
  vi.stubEnv('COOKIE_NAME', 'findit_claim_test')
  vi.resetModules()
  ;({ default: app } = await import('../app.js'))
})

beforeEach(() => {
  state.claims.clear()
  state.reports.clear()
  state.users.clear()
  state.notifications = []
  state.claimSequence = 0
  conversationUpdates.updates = []
  registerUsers()
  addReport()
})

afterAll(() => vi.unstubAllEnvs())

describe('finder-led claims and returns', () => {
  it('stores the private ownership explanation without returning it in the creation response', async () => {
    const response = await createClaimAs().expect(201)
    expect(response.body.claim).not.toHaveProperty('evidence')
    expect(response.body.claim.status).toBe('pending')
    expect(state.claims.get(response.body.claim._id).evidence).toBe('A distinctive mark matches my item.')
    const [query, update] = state.notifications[0]
    expect(String(query.recipient)).toBe(reporterId)
    expect(update.$setOnInsert.title).toBe('New claim on your found item')
    expect(String(update.$setOnInsert.relatedId)).toBe(reportId)
  })

  it('validates claim explanations on the server', async () => {
    await createClaimAs(claimantId, '  ').expect(400)
    await createClaimAs(claimantId, 'short').expect(400)
    await createClaimAs(claimantId, 'a'.repeat(1001)).expect(400)
    expect(state.claims.size).toBe(0)
  })

  it('returns private explanations only to claim participants', async () => {
    const creation = await createClaimAs().expect(201)
    const id = creation.body.claim._id

    const claimantClaims = await request(app)
      .get('/api/claims')
      .set('Cookie', session(claimantId))
      .expect(200)
    const finderClaims = await request(app)
      .get('/api/claims')
      .set('Cookie', session(reporterId))
      .expect(200)
    const unrelatedClaims = await request(app)
      .get('/api/claims')
      .set('Cookie', session(strangerId))
      .expect(200)
    const claimDetails = await request(app)
      .get(`/api/claims/${id}`)
      .set('Cookie', session(claimantId))
      .expect(200)
    const unrelatedDetails = await request(app)
      .get(`/api/claims/${id}`)
      .set('Cookie', session(strangerId))
      .expect(404)

    expect(claimantClaims.body.claims[0].evidence).toBe('A distinctive mark matches my item.')
    expect(finderClaims.body.claims[0].evidence).toBe('A distinctive mark matches my item.')
    expect(unrelatedClaims.body.claims).toHaveLength(0)
    expect(claimDetails.body.claim.evidence).toBe('A distinctive mark matches my item.')
    expect(unrelatedDetails.body).not.toHaveProperty('evidence')
  })

  it('prevents self-claims and repeat claims by the same claimant even after rejection', async () => {
    await createClaimAs(reporterId).expect(403)
    const first = await createClaimAs().expect(201)
    await request(app)
      .patch(`/api/claims/${first.body.claim._id}/review`)
      .set('Cookie', session(reporterId))
      .send({ status: 'rejected', note: 'This explanation did not establish ownership.' })
      .expect(200)
    await createClaimAs().expect(409)
    await createClaimAs(secondClaimantId).expect(201)
  })

  it('allows only the finder to accept a claim, without marking the report returned', async () => {
    const creation = await createClaimAs().expect(201)
    const id = creation.body.claim._id
    await request(app)
      .patch(`/api/claims/${id}/review`)
      .set('Cookie', session(claimantId))
      .send({ status: 'accepted' })
      .expect(403)
    await request(app)
      .patch(`/api/claims/${id}/review`)
      .set('Cookie', session(adminId))
      .send({ status: 'accepted', note: 'Routine claims must be finder reviewed.' })
      .expect(403)

    await request(app)
      .patch(`/api/claims/${id}/review`)
      .set('Cookie', session(reporterId))
      .send({ status: 'accepted' })
      .expect(200)
    expect(state.claims.get(id).status).toBe('accepted')
    expect(state.reports.get(reportId).status).toBe('open')
  })

  it('rejects unrelated access and invalid state transitions', async () => {
    const creation = await createClaimAs().expect(201)
    const id = creation.body.claim._id
    await request(app)
      .get(`/api/claims/${id}`)
      .set('Cookie', session(strangerId))
      .expect(404)
    await request(app)
      .patch(`/api/claims/${id}/review`)
      .set('Cookie', session(reporterId))
      .send({ status: 'accepted' })
      .expect(200)
    await request(app)
      .patch(`/api/claims/${id}/review`)
      .set('Cookie', session(reporterId))
      .send({ status: 'rejected', note: 'Changed my mind' })
      .expect(409)
  })

  it('requires finder and claimant confirmations before closing the report', async () => {
    const response = await createClaimAs().expect(201)
    const id = response.body.claim._id
    state.claims.get(id).status = 'accepted'
    await request(app).post(`/api/claims/${id}/arrange-return`).set('Cookie', session(claimantId)).expect(200)
    expect(state.reports.get(reportId).status).toBe('open')

    const finderConfirmation = await request(app)
      .post(`/api/claims/${id}/confirm-return`)
      .set('Cookie', session(reporterId))
      .expect(200)
    expect(finderConfirmation.body.message).toContain('claimant must also confirm')
    expect(state.reports.get(reportId).status).toBe('open')

    await request(app)
      .post(`/api/claims/${id}/confirm-return`)
      .set('Cookie', session(claimantId))
      .expect(200)
    expect(state.claims.get(id).status).toBe('returned')
    expect(state.reports.get(reportId).status).toBe('recovered')
    expect(String(state.reports.get(reportId).returnedClaim)).toBe(id)
  })

  it('allows only one successful return and closes competing active claims', async () => {
    const winning = await createClaimAs().expect(201)
    const competing = await createClaimAs(secondClaimantId).expect(201)
    state.claims.get(winning.body.claim._id).status = 'accepted'
    await request(app).post(`/api/claims/${winning.body.claim._id}/arrange-return`).set('Cookie', session(reporterId)).expect(200)
    await request(app).post(`/api/claims/${winning.body.claim._id}/confirm-return`).set('Cookie', session(reporterId)).expect(200)
    await request(app).post(`/api/claims/${winning.body.claim._id}/confirm-return`).set('Cookie', session(claimantId)).expect(200)
    expect(state.claims.get(competing.body.claim._id).status).toBe('rejected')
    expect(state.claims.get(competing.body.claim._id).history.at(-1).note).toContain('returned to another claimant')
    await request(app).post(`/api/claims/${competing.body.claim._id}/confirm-return`).set('Cookie', session(secondClaimantId)).expect(409)
    expect(String(state.reports.get(reportId).returnedClaim)).toBe(winning.body.claim._id)
  })

  it('records a participant concern and permits only moderation to resolve the dispute', async () => {
    const response = await createClaimAs().expect(201)
    const id = response.body.claim._id
    await request(app)
      .post(`/api/claims/${id}/dispute`)
      .set('Cookie', session(claimantId))
      .send({ reason: 'The claimant has reported an unsafe handover request.' })
      .expect(200)
    expect(state.claims.get(id).status).toBe('disputed')
    await request(app)
      .patch(`/api/claims/${id}/review`)
      .set('Cookie', session(reporterId))
      .send({ status: 'accepted' })
      .expect(409)
    await request(app)
      .get(`/api/claims/${id}`)
      .set('Cookie', session(adminId))
      .expect(404)
    await request(app)
      .patch(`/api/claims/${id}/review`)
      .set('Cookie', session(adminId))
      .send({ status: 'rejected', note: 'Moderation reviewed the reported concern.' })
      .expect(200)
    expect(state.claims.get(id).status).toBe('rejected')
  })

  it('requires an admin reason for report moderation and prevents reopening a returned item', async () => {
    await request(app)
      .patch(`/api/admin/reports/${reportId}/status`)
      .set('Cookie', session(claimantId))
      .send({ status: 'closed', reason: 'Community moderation review complete.' })
      .expect(403)
    await request(app)
      .patch(`/api/admin/reports/${reportId}/status`)
      .set('Cookie', session(adminId))
      .send({ status: 'closed' })
      .expect(400)

    await request(app)
      .patch(`/api/admin/reports/${reportId}/status`)
      .set('Cookie', session(adminId))
      .send({ status: 'closed', reason: 'Community moderation review complete.' })
      .expect(200)
    expect(state.reports.get(reportId).moderationHistory.at(-1)).toMatchObject({
      actor: adminId,
      from: 'open',
      to: 'closed',
      reason: 'Community moderation review complete.',
    })

    state.reports.get(reportId).status = 'recovered'
    state.reports.get(reportId).returnedClaim = claimId
    await request(app)
      .patch(`/api/admin/reports/${reportId}/status`)
      .set('Cookie', session(adminId))
      .send({ status: 'open', reason: 'Attempt to reopen the returned report.' })
      .expect(409)
  })
})
