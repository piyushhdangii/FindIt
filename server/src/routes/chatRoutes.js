import { Router } from 'express'
import { getConversation, listConversations, listMessages, markRead, openConversation } from '../controllers/chatController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)
router.get('/conversations', listConversations)
router.post('/claims/:claimId/conversation', openConversation)
router.get('/conversations/:id', getConversation)
router.get('/conversations/:id/messages', listMessages)
router.post('/conversations/:id/read', markRead)

export default router
