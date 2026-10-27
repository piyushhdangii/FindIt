import { Router } from 'express'
import multer from 'multer'
import { createReport, deleteReport, getMatches, getReport, getReportClaim, listReports, markReportRecovered, myReports, updateReport } from '../controllers/reportController.js'
import { requireAuth } from '../middleware/auth.js'
import { imageLimit } from '../services/images.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: imageLimit(), files: 1 } })

router.get('/', listReports)
router.get('/mine', requireAuth, myReports)
router.post('/', requireAuth, upload.single('image'), createReport)
router.get('/:id/matches', requireAuth, getMatches)
router.get('/:id/claim', requireAuth, getReportClaim)
router.patch('/:id/recovered', requireAuth, markReportRecovered)
router.get('/:id', getReport)
router.patch('/:id', requireAuth, upload.single('image'), updateReport)
router.delete('/:id', requireAuth, deleteReport)

export default router
