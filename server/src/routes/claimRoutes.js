import { Router } from 'express'
import {
  arrangeReturn,
  confirmReturn,
  createClaim,
  getClaim,
  listClaims,
  reportConcern,
  reviewClaim,
} from '../controllers/claimController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)
router.get('/', listClaims)
router.post('/reports/:reportId', createClaim)
router.get('/:id', getClaim)
router.patch('/:id/review', reviewClaim)
router.post('/:id/arrange-return', arrangeReturn)
router.post('/:id/confirm-return', confirmReturn)
router.post('/:id/dispute', reportConcern)

export default router
