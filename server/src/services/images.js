import { v2 as cloudinary } from 'cloudinary'
import { config } from '../config/env.js'

export async function uploadImage(file) {
  const values = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']
  if (!values.every((key) => process.env[key]?.trim())) {
    const error = new Error('Image uploads are not configured on this server.')
    error.status = 503
    throw error
  }
  if (!isSupportedImage(file)) {
    const error = new Error('Choose a JPEG, PNG, WebP, or AVIF image.')
    error.status = 400
    throw error
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder: 'findit/reports', resource_type: 'image' }, (error, result) => {
      if (error) return reject(imageProviderError(error))
      if (!result?.secure_url || !result.public_id) {
        return reject(imageProviderError({ http_code: 502 }))
      }
      resolve({ url: result.secure_url, publicId: result.public_id })
    })
    stream.end(file.buffer)
  })
}

function imageProviderError(error) {
  const status = Number(error.http_code)
  console.error(`Image provider upload failed (HTTP ${status || 'unknown'}).`)
  const failure = new Error('Image provider could not complete the upload.')
  failure.status = 502
  failure.publicMessage = status === 401
    ? 'Cloudinary rejected the upload credentials. Check the server Cloudinary settings and restart the backend.'
    : status === 400
      ? 'Cloudinary rejected this image. Check that the selected file is a supported image and that uploads are enabled for the account.'
      : status === 429
        ? 'Cloudinary upload rate limit reached. Please try again later.'
        : 'Cloudinary could not complete the upload. Check the backend log for the image-provider status, then try again.'
  return failure
}

function isSupportedImage(file) {
  const bytes = file.buffer
  if (!bytes) return false
  const signatures = {
    'image/jpeg': bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    'image/png': bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/webp': bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
    'image/avif': bytes.toString('ascii', 4, 8) === 'ftyp' && ['avif', 'avis'].includes(bytes.toString('ascii', 8, 12)),
  }
  return signatures[file.mimetype] === true
}

export async function deleteImage(publicId) {
  if (!publicId || !process.env.CLOUDINARY_API_SECRET) return
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image' })
}

export function imageLimit() {
  return config.maxImageSize
}
