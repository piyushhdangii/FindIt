import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { config, cookieOptions } from '../config/env.js'

function setTokenCookie(res, user) {
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn })
  res.cookie(config.cookieName, token, cookieOptions())
}

export async function register(req, res) {
  const name = String(req.body.name || '').trim()
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '')
  if (name.length < 2 || name.length > 80) return res.status(400).json({ message: 'Name must be between 2 and 80 characters.' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' })
  if (password.length < 8 || password.length > 128) return res.status(400).json({ message: 'Password must be between 8 and 128 characters.' })
  if (await User.exists({ email })) return res.status(409).json({ message: 'An account with that email already exists.' })
  const user = await User.create({ name, email, password })
  setTokenCookie(res, user)
  res.status(201).json({ user })
}

export async function login(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase()
  const user = await User.findOne({ email }).select('+password')
  if (!user || !(await user.comparePassword(String(req.body.password || '')))) {
    return res.status(401).json({ message: 'Email or password is incorrect.' })
  }
  setTokenCookie(res, user)
  res.json({ user })
}

export function logout(_req, res) {
  res.clearCookie(config.cookieName, { ...cookieOptions(), maxAge: undefined })
  res.json({ message: 'You have been signed out.' })
}

export function currentUser(req, res) {
  res.json({ user: req.user })
}
