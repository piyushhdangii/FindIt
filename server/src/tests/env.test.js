import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { validateEnvironment } from '../config/env.js'

const requiredValues = {
  MONGODB_URI: 'mongodb://localhost:27017/findit_test',
  JWT_SECRET: 'unit-test-secret-value-with-at-least-32-characters',
  CLIENT_URL: 'http://localhost:5173',
  JWT_EXPIRES_IN: '1d',
  PORT: '5000',
  MAX_IMAGE_SIZE_MB: '5',
  MATCH_THRESHOLD: '50',
}

beforeEach(() => {
  Object.entries(requiredValues).forEach(([key, value]) => vi.stubEnv(key, value))
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', '')
  vi.stubEnv('CLOUDINARY_API_KEY', '')
  vi.stubEnv('CLOUDINARY_API_SECRET', '')
})

afterEach(() => vi.unstubAllEnvs())

describe('environment validation', () => {
  it('uses cross-site secure cookies in production and lax cookies locally', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.resetModules()
    let envConfig = await import('../config/env.js')
    expect(envConfig.cookieOptions()).toMatchObject({ sameSite: 'lax', secure: false })

    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    envConfig = await import('../config/env.js')
    expect(envConfig.cookieOptions()).toMatchObject({ sameSite: 'none', secure: true })
  })

  it('accepts the documented configuration', () => {
    expect(() => validateEnvironment()).not.toThrow()
  })

  it('reports missing names without including environment values', () => {
    vi.stubEnv('MONGODB_URI', '')
    expect(() => validateEnvironment()).toThrow('MONGODB_URI')
  })

  it('rejects template secrets and placeholder MongoDB URIs', () => {
    vi.stubEnv('MONGODB_URI', 'mongodb+srv://<user>:<password>@<cluster>/findit')
    expect(() => validateEnvironment()).toThrow('template placeholders')
    vi.stubEnv('MONGODB_URI', requiredValues.MONGODB_URI)
    vi.stubEnv('JWT_SECRET', 'replace-this-with-a-long-but-not-real-secret')
    expect(() => validateEnvironment()).toThrow('not a template value')
  })

  it('validates score thresholds and all-or-none Cloudinary settings', () => {
    vi.stubEnv('MATCH_THRESHOLD', '101')
    expect(() => validateEnvironment()).toThrow('MATCH_THRESHOLD')
    vi.stubEnv('MATCH_THRESHOLD', '50')
    vi.stubEnv('CLOUDINARY_API_KEY', 'configured-alone')
    expect(() => validateEnvironment()).toThrow('all three CLOUDINARY_*')
  })
})
