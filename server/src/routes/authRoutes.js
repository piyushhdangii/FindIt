import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { currentUser, login, logout, register } from '../controllers/authController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many attempts. Please try again later.' } })

router.post('/register', authLimit, register)
router.post('/login', authLimit, login)
router.post('/logout', logout)
router.get('/me', requireAuth, currentUser)

export default router
