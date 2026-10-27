import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { config } from '../config/env.js'
import { asyncHandler } from './asyncHandler.js'

export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.[config.cookieName]
  if (!token) return res.status(401).json({ message: 'Please sign in to continue.' })
  let payload
  try {
    payload = jwt.verify(token, config.jwtSecret)
  } catch {
    return res.status(401).json({ message: 'Your session has expired. Please sign in again.' })
  }
  const user = await User.findById(payload.sub)
  if (!user) return res.status(401).json({ message: 'Your session is no longer valid.' })
  req.user = user
  next()
})

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to do that.' })
    }
    next()
  }
}
