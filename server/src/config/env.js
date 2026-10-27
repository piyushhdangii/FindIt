import 'dotenv/config'

const durationPattern = /^\d+[smhd]$/

export function validateEnvironment() {
  const required = ['MONGODB_URI', 'JWT_SECRET', 'CLIENT_URL']
  const missing = required.filter((key) => !process.env[key]?.trim())
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
  if (/[<>]/.test(process.env.MONGODB_URI || '')) {
    throw new Error('MONGODB_URI still contains template placeholders')
  }
  if ((process.env.JWT_SECRET || '').length < 32 || /^(replace|change|your-)/i.test(process.env.JWT_SECRET || '')) {
    throw new Error('JWT_SECRET must be a unique secret of at least 32 characters, not a template value')
  }
  if (!durationPattern.test(process.env.JWT_EXPIRES_IN || '1d')) {
    throw new Error('JWT_EXPIRES_IN must use a number followed by s, m, h, or d')
  }
  if (process.env.COOKIE_NAME && !/^[A-Za-z0-9_-]{1,64}$/.test(process.env.COOKIE_NAME)) {
    throw new Error('COOKIE_NAME may contain only letters, numbers, underscores, or hyphens (up to 64 characters)')
  }
  if (process.env.PORT && (!Number.isInteger(Number(process.env.PORT)) || Number(process.env.PORT) < 1 || Number(process.env.PORT) > 65535)) {
    throw new Error('PORT must be a whole number between 1 and 65535')
  }
  if (process.env.MAX_IMAGE_SIZE_MB && (!Number.isFinite(Number(process.env.MAX_IMAGE_SIZE_MB)) || Number(process.env.MAX_IMAGE_SIZE_MB) < 1 || Number(process.env.MAX_IMAGE_SIZE_MB) > 20)) {
    throw new Error('MAX_IMAGE_SIZE_MB must be a number from 1 to 20')
  }
  const threshold = Number(process.env.MATCH_THRESHOLD ?? 50)
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    throw new Error('MATCH_THRESHOLD must be a number between 0 and 100')
  }
  const cloudinaryValues = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']
    .map((key) => Boolean(process.env[key]?.trim()))
  if (cloudinaryValues.some(Boolean) && !cloudinaryValues.every(Boolean)) {
    throw new Error('Configure all three CLOUDINARY_* variables to enable image uploads')
  }
}

export const config = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  cookieName: process.env.COOKIE_NAME || 'findit_token',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  matchThreshold: Number(process.env.MATCH_THRESHOLD ?? 50),
  maxImageSize: (Number(process.env.MAX_IMAGE_SIZE_MB) || 5) * 1024 * 1024,
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: durationMilliseconds(config.jwtExpiresIn),
    path: '/',
  }
}

function durationMilliseconds(value) {
  const match = value.match(durationPattern)
  const amount = Number(match[0].slice(0, -1))
  const unit = match[0].slice(-1)
  return amount * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit])
}
