import app from './app.js'
import { createServer } from 'node:http'
import { connectDatabase, disconnectDatabase } from './config/db.js'
import { config, validateEnvironment } from './config/env.js'
import { attachChatSocket } from './services/chatSocket.js'

async function start() {
  try {
    validateEnvironment()
    await connectDatabase()
    const server = createServer(app)
    const io = attachChatSocket(server)
    server.listen(config.port, () => {
      console.log(`FindIt API listening on port ${config.port}`)
    })
    let closing = false
    const shutdown = async (signal) => {
      if (closing) return
      closing = true
      console.log(`Received ${signal}; closing server.`)
      await new Promise((resolve) => io.close(resolve))
      await disconnectDatabase()
      process.exit(0)
    }
    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('SIGTERM', () => shutdown('SIGTERM'))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

start()
