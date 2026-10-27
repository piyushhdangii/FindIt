import dotenv from 'dotenv'
import dns from 'dns'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import mongoose from 'mongoose'
import authRoutes from './routes/authRoutes.js'
import reportRoutes from './routes/reportRoutes.js'
import claimRoutes from './routes/claimRoutes.js'
import notificationRoutes from './routes/notificationRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import chatRoutes from './routes/chatRoutes.js'
import { config } from './config/env.js'
import { errorHandler, notFound } from './middleware/errors.js'

const app = express()
dotenv.config()
dns.setServers(['8.8.8.8','8.8.4.4'])


app.disable('x-powered-by')
app.use(helmet())
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === config.clientUrl) return callback(null, true)
    const error = new Error('Origin is not allowed by CORS.')
    error.status = 403
    return callback(error)
  },
  credentials: true,
}))
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: false, limit: '1mb' }))
app.use(cookieParser())

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'findit-api' }))
app.get('/api/health/ready', (_req, res) => {
  const ready = mongoose.connection.readyState === 1
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not-ready', database: ready ? 'connected' : 'disconnected' })
})
app.use('/api/auth', authRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/claims', claimRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/admin', adminRoutes)
app.use(notFound)
app.use(errorHandler)

export default app
