import mongoose from 'mongoose'

export async function connectDatabase(uri = process.env.MONGODB_URI) {
  if (!uri || !/^mongodb(\+srv)?:\/\//.test(uri)) {
    throw new Error('MONGODB_URI is missing or is not a valid MongoDB URI')
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
  } catch {
    throw new Error('Could not connect to MongoDB. Check the URI, network access, and database user.')
  }
}

export async function disconnectDatabase() {
  await mongoose.disconnect()
}
