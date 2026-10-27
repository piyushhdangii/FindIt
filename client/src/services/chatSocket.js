import { io } from 'socket.io-client'
import { api } from './api'

let socket
let socketUserId

export function connectChatSocket(userId) {
  if (socket && socketUserId === userId) return socket
  socket?.disconnect()

  const apiUrl = new URL(api.defaults.baseURL, window.location.origin)
  const path = apiUrl.pathname.replace(/\/api\/?$/, '').replace(/\/$/, '')
  socket = io(`${apiUrl.origin}${path}`, { withCredentials: true })
  socketUserId = userId
  return socket
}

export function disconnectChatSocket() {
  socket?.disconnect()
  socket = undefined
  socketUserId = undefined
}
