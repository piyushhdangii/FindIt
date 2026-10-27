export function notFound(_req, res) {
  res.status(404).json({ message: 'The requested resource was not found.' })
}

export function errorHandler(error, _req, res, _next) {
  if (error.name === 'ValidationError') {
    return res.status(400).json({ message: error.message })
  }
  if (error.name === 'CastError') {
    return res.status(400).json({ message: 'The supplied identifier is invalid.' })
  }
  if (error.name === 'VersionError') {
    return res.status(409).json({ message: 'This record was updated by another request. Reload and try again.' })
  }
  if (error.code === 11000) {
    return res.status(409).json({ message: 'That record already exists.' })
  }
  if (error.name === 'MulterError') {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'The selected image is too large.' : 'The image upload could not be processed.'
    return res.status(400).json({ message })
  }
  const status = Number(error.status) || 500
  if (status >= 500) console.error(`Request failed: ${error.name || 'Error'}`)
  res.status(status).json({ message: status >= 500 ? error.publicMessage || 'Something went wrong. Please try again.' : error.message })
}
