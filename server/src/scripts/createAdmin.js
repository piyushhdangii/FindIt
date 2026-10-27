import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import 'dotenv/config'
import User from '../models/User.js'
import { connectDatabase, disconnectDatabase } from '../config/db.js'

function ask(question) {
  const prompt = createInterface({ input: stdin, output: stdout })
  return prompt.question(question).finally(() => prompt.close())
}

function askHidden(question) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Run this command in an interactive terminal so the password can be entered securely.')
  }

  stdout.write(question)
  stdin.setRawMode(true)
  stdin.resume()

  return new Promise((resolve, reject) => {
    let value = ''
    const finish = (error) => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdout.write('\n')
      if (error) reject(error)
      else resolve(value)
    }
    const onData = (chunk) => {
      for (const character of chunk.toString()) {
        if (character === '\u0003') return finish(new Error('Admin setup cancelled.'))
        if (character === '\r' || character === '\n') return finish()
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1)
        } else if (character >= ' ') {
          value += character
        }
      }
    }

    stdin.on('data', onData)
  })
}

async function createAdmin() {
  await connectDatabase()
  try {
    const name = (await ask('Admin name: ')).trim()
    const email = (await ask('Admin email: ')).trim().toLowerCase()
    const password = await askHidden('Admin password (input hidden): ')
    const confirmation = await askHidden('Confirm password (input hidden): ')

    if (name.length < 2 || name.length > 80) {
      throw new Error('Name must be between 2 and 80 characters.')
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Enter a valid email address.')
    }
    if (password.length < 8 || password.length > 128) {
      throw new Error('Password must be between 8 and 128 characters.')
    }
    if (password !== confirmation) {
      throw new Error('The passwords do not match.')
    }
    if (await User.exists({ email })) {
      throw new Error('An account with that email already exists. Choose a different email.')
    }

    const user = await User.create({ name, email, password, role: 'admin' })
    console.log(`Admin account created for ${user.email}. Sign in through the app to access the admin dashboard.`)
  } finally {
    await disconnectDatabase()
  }
}

createAdmin().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
