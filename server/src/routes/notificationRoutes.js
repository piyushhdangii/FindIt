import { Router } from 'express'
import { listNotifications, markRead } from '../controllers/notificationController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)
router.get('/', listNotifications)
router.patch('/:id/read', markRead)

export default router
