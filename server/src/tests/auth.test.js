import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

vi.mock('../models/User.js', () => {
  const users = new Map()
  let nextId = 1
  class FakeUser {
    constructor(fields) {
      Object.assign(this, fields)
      this._id = fields._id || String(nextId++)
      this.id = this._id
    }

    async comparePassword(candidate) {
      return this.password === candidate
    }

    toJSON() {
      const result = { ...this }
      delete result.password
      return result
    }
  }
  return {
    default: {
      async create(fields) {
        const user = new FakeUser({ ...fields, email: fields.email.toLowerCase(), role: 'user' })
        users.set(user.email, user)
        users.set(user.id, user)
        return user
      },
      async exists({ email }) {
        return users.has(email)
      },
      findOne({ email }) {
        return { select: async () => users.get(email) || null }
      },
      async findById(id) {
        return users.get(String(id)) || null
      },
      reset() {
        users.clear()
        nextId = 1
      },
    },
  }
})

let app
let User
const secret = 'test-only-secret-with-more-than-32-characters'

beforeAll(async () => {
  vi.stubEnv('JWT_SECRET', secret)
  vi.stubEnv('CLIENT_URL', 'http://localhost:5173')
  vi.stubEnv('COOKIE_NAME', 'findit_test')
  vi.resetModules()
  ;[{ default: app }, { default: User }] = await Promise.all([
    import('../app.js'),
    import('../models/User.js'),
  ])
})

beforeEach(() => User.reset())
afterAll(() => vi.unstubAllEnvs())

describe('authentication API', () => {
  it('registers a user with a cookie and ignores a requested admin role', async () => {
    const response = await request(app).post('/api/auth/register').send({
      name: 'Jamie Taylor',
      email: 'JAMIE@example.com',
      password: 'strong-password',
      role: 'admin',
    })
    expect(response.status).toBe(201)
    expect(response.body.user.role).toBe('user')
    expect(response.body.user.email).toBe('jamie@example.com')
    expect(response.body.user.password).toBeUndefined()
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly')
    expect(response.headers['set-cookie'][0]).toContain('SameSite=Lax')
  })

  it('rejects duplicate email and invalid registration data', async () => {
    const payload = { name: 'Jamie Taylor', email: 'jamie@example.com', password: 'strong-password' }
    await request(app).post('/api/auth/register').send(payload).expect(201)
    await request(app).post('/api/auth/register').send(payload).expect(409)
    await request(app).post('/api/auth/register').send({ ...payload, email: 'not-an-email' }).expect(400)
  })

  it('authenticates login and denies invalid credentials', async () => {
    await request(app).post('/api/auth/register').send({ name: 'Jamie Taylor', email: 'jamie@example.com', password: 'strong-password' }).expect(201)
    await request(app).post('/api/auth/login').send({ email: 'JAMIE@example.com', password: 'strong-password' }).expect(200)
    await request(app).post('/api/auth/login').send({ email: 'jamie@example.com', password: 'wrong-password' }).expect(401)
  })

  it('protects current-user routes and denies ordinary users admin access', async () => {
    await request(app).get('/api/auth/me').expect(401)
    const registration = await request(app).post('/api/auth/register').send({ name: 'Jamie Taylor', email: 'jamie@example.com', password: 'strong-password' })
    const cookie = registration.headers['set-cookie']
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200)
    expect(me.body.user.email).toBe('jamie@example.com')
    await request(app).get('/api/admin/overview').set('Cookie', cookie).expect(403)
  })

  it('logs out and clears the session cookie', async () => {
    const response = await request(app).post('/api/auth/logout').expect(200)
    expect(response.headers['set-cookie'][0]).toContain('findit_test=')
    expect(response.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970')
  })
})
