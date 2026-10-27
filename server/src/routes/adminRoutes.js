import { Router } from 'express'
import { listAllReports, moderateReport, overview } from '../controllers/adminController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth, requireRole('admin'))
router.get('/overview', overview)
router.get('/reports', listAllReports)
router.patch('/reports/:id/status', moderateReport)

export default router
