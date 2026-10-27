import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import app from '../app.js'

describe('health endpoints', () => {
  it('reports process health without requiring MongoDB', async () => {
    const response = await request(app).get('/api/health')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok', service: 'findit-api' })
  })

  it('reports database readiness separately', async () => {
    const response = await request(app).get('/api/health/ready')
    expect([200, 503]).toContain(response.status)
    expect(response.body.database).toMatch(/connected|disconnected/)
  })
})

afterAll(async () => {
  await mongoose.disconnect()
})
