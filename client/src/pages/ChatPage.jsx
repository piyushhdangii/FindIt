import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCheck, MessageCircle, Send, Wifi, WifiOff } from 'lucide-react'
import Loading from '../components/Loading'
import { useAuth } from '../context/useAuth'
import { api, apiError } from '../services/api'
import { connectChatSocket } from '../services/chatSocket'

function mergeMessage(messages, message) {
  if (messages.some((item) => item._id === message._id || (item.clientMessageId && item.clientMessageId === message.clientMessageId))) return messages
  return [...messages, message].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
}

export default function ChatPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  const messagesEnd = useRef(null)
  const messagesContainer = useRef(null)
  const olderScrollPosition = useRef(null)
  const socketRef = useRef(null)
  const pendingSend = useRef(null)

  useEffect(() => {
    if (!user?._id) return undefined
    const socket = connectChatSocket(user._id)
    const refresh = () => api.get('/chat/conversations')
      .then(({ data }) => setConversations(data.conversations))
      .catch((requestError) => setError(apiError(requestError)))
    socket.on('notification:new', refresh)
    socket.on('connect', refresh)
    window.addEventListener('findit:conversations-refresh', refresh)
    if (socket.connected) refresh()
    return () => {
      socket.off('notification:new', refresh)
      socket.off('connect', refresh)
      window.removeEventListener('findit:conversations-refresh', refresh)
    }
  }, [user?._id])

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      setConversation(null)
      setMessages([])
      setPagination(null)
      try {
        const { data: inbox } = await api.get('/chat/conversations')
        if (active) setConversations(inbox.conversations)
        if (!id) return
        const [{ data: detail }, { data: history }] = await Promise.all([
          api.get(`/chat/conversations/${id}`),
          api.get(`/chat/conversations/${id}/messages`),
        ])
        if (!active) return
        setConversation(detail.conversation)
        setMessages(history.messages)
        setPagination(history.pagination)
        await api.post(`/chat/conversations/${id}/read`)
        window.dispatchEvent(new Event('findit:notifications-refresh'))
        window.dispatchEvent(new Event('findit:conversations-refresh'))
      } catch (requestError) {
        if (active) setError(apiError(requestError))
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [id])

  useEffect(() => {
    if (!user?._id || !id || !conversation || conversation.status !== 'active') return undefined
    const socket = connectChatSocket(user._id)
    socketRef.current = socket

    function recoverHistory() {
      socket.timeout(5000).emit('conversation:join', { conversationId: id }, (timeoutError, response) => {
        if (timeoutError || response?.error) {
          setError(response?.error || 'Could not join this conversation. Reconnecting…')
          return
        }
        setConnected(true)
        api.get(`/chat/conversations/${id}/messages`)
          .then(({ data }) => {
            setMessages((current) => data.messages.reduce(mergeMessage, current))
            setPagination(data.pagination)
          })
          .then(() => api.post(`/chat/conversations/${id}/read`))
          .then(() => socket.emit('message:read', { conversationId: id }))
          .then(() => window.dispatchEvent(new Event('findit:notifications-refresh')))
          .then(() => window.dispatchEvent(new Event('findit:conversations-refresh')))
          .catch((requestError) => setError(apiError(requestError)))
      })
    }

    function onMessage(message) {
      if (message.conversationId !== id) return
      setMessages((current) => mergeMessage(current, message))
      setConversations((current) => current.map((item) => item._id === id
        ? { ...item, lastMessagePreview: message.content.slice(0, 120), lastMessageAt: message.createdAt }
        : item))
      if (message.sender._id !== user._id) {
        api.post(`/chat/conversations/${id}/read`)
          .then(() => socket.emit('message:read', { conversationId: id }))
          .then(() => window.dispatchEvent(new Event('findit:notifications-refresh')))
          .then(() => window.dispatchEvent(new Event('findit:conversations-refresh')))
          .catch((requestError) => setError(apiError(requestError)))
      }
    }

    function onReadReceipt(receipt) {
      if (receipt.conversationId !== id || receipt.readerId === user._id) return
      setMessages((current) => current.map((message) => message.sender._id === user._id
        ? { ...message, readBy: [...new Set([...(message.readBy || []), receipt.readerId])] }
        : message))
    }

    function onDisconnect() { setConnected(false) }
    function onConnectError() {
      setConnected(false)
      setError('Chat connection unavailable. Your messages remain saved and will reload after reconnecting.')
    }

    socket.on('connect', recoverHistory)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('message:new', onMessage)
    socket.on('message:read', onReadReceipt)
    if (socket.connected) recoverHistory()
    return () => {
      socket.emit('conversation:leave', { conversationId: id })
      socket.off('connect', recoverHistory)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('message:new', onMessage)
      socket.off('message:read', onReadReceipt)
      socketRef.current = null
    }
  }, [conversation, id, user?._id])

  useEffect(() => {
    const container = messagesContainer.current
    if (olderScrollPosition.current && container) {
      const { height, top } = olderScrollPosition.current
      container.scrollTop = top + container.scrollHeight - height
      olderScrollPosition.current = null
      return
    }
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function sendMessage(event) {
    event.preventDefault()
    const content = draft.trim()
    const socket = socketRef.current
    if (!content || sending) return
    if (!socket?.connected) {
      setError('Chat is offline. Reconnect before sending; your draft is still here.')
      return
    }
    setSending(true)
    setError('')
    if (pendingSend.current?.content !== content) {
      pendingSend.current = { content, clientMessageId: crypto.randomUUID() }
    }
    socket.timeout(10000).emit('message:send', {
      conversationId: id,
      content,
      clientMessageId: pendingSend.current.clientMessageId,
    }, (timeoutError, response) => {
      setSending(false)
      if (timeoutError || response?.error) {
        setError(response?.error || 'Message was not confirmed. Retry after checking the conversation.')
        return
      }
      setMessages((current) => mergeMessage(current, response.message))
      setConversations((current) => current.map((item) => item._id === id
        ? { ...item, lastMessagePreview: response.message.content.slice(0, 120), lastMessageAt: response.message.createdAt }
        : item))
      setDraft('')
      pendingSend.current = null
    })
  }

  async function loadOlderMessages() {
    if (!pagination?.hasMore || loadingOlder || !pagination.nextBefore) return
    setLoadingOlder(true)
    try {
      const { data } = await api.get(`/chat/conversations/${id}/messages`, {
        params: { before: pagination.nextBefore },
      })
      if (messagesContainer.current) {
        olderScrollPosition.current = {
          height: messagesContainer.current.scrollHeight,
          top: messagesContainer.current.scrollTop,
        }
      }
      setMessages((current) => [...data.messages, ...current])
      setPagination(data.pagination)
    } catch (requestError) {
      setError(apiError(requestError))
    } finally {
      setLoadingOlder(false)
    }
  }

  if (loading) return <Loading label="Loading conversations" />
  const activeConversation = conversation?.status === 'active'

  return (
    <section className="content-page chat-page">
      <div className="page-heading">
        <div><span className="eyebrow">PRIVATE CLAIM MESSAGES</span><h1>Chat</h1><p>Discuss the claimed item without sharing contact details.</p></div>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="chat-layout">
        <aside className={`conversation-list ${id ? 'conversation-list-mobile-hidden' : ''}`}>
          <h2>Your conversations</h2>
          {conversations.length ? conversations.map((item) => (
            <Link key={item._id} to={`/chat/${item._id}`} className={`conversation-link ${id === item._id ? 'selected' : ''}`}>
              <span className="chat-avatar">{item.otherParticipant?.name?.[0] || '?'}</span>
              <span className="conversation-summary"><b>{item.item?.itemName || 'Claimed item'}</b><small>{item.otherParticipant?.name || 'Community member'}</small><small>{item.lastMessagePreview || 'Conversation opened'}</small></span>
              {item.unreadCount > 0 && <span className="unread-count">{item.unreadCount > 99 ? '99+' : item.unreadCount}</span>}
            </Link>
          )) : <div className="chat-empty">Conversations appear here when an eligible claim is submitted.</div>}
        </aside>
        <section className={`chat-panel ${!id ? 'chat-panel-mobile-hidden' : ''}`}>
          {conversation ? <>
            <header className="chat-header">
              <Link className="chat-back" to="/chat" aria-label="Back to conversations"><ArrowLeft size={17} /></Link>
              <span className="chat-avatar">{conversation.otherParticipant?.name?.[0] || '?'}</span>
              <span><b>{conversation.otherParticipant?.name || 'Community member'}</b><small>{conversation.item?.itemName || 'Claimed item'} · claim {conversation.claim?.status}</small></span>
              {activeConversation
                ? <span className={`connection-state ${connected ? 'online' : ''}`}>{connected ? <Wifi size={14} /> : <WifiOff size={14} />}{connected ? 'Connected' : 'Offline'}</span>
                : <span className="connection-state">Archived</span>}
            </header>
            <div ref={messagesContainer} className="chat-messages" aria-live="polite">
              {pagination?.hasMore && <button className="text-link load-older" disabled={loadingOlder} onClick={loadOlderMessages}>{loadingOlder ? 'Loading earlier messages…' : 'Load earlier messages'}</button>}
              {!messages.length && <div className="chat-empty">No messages yet. You can discuss identifying details privately here.</div>}
              {messages.map((message) => {
                const own = message.sender._id === user?._id
                const seen = own && (message.readBy || []).some((reader) => reader !== user?._id)
                return <article key={message._id} className={`chat-message ${own ? 'own' : ''}`}>
                  <p>{message.content}</p>
                  <small>{new Date(message.createdAt).toLocaleString()}{own ? ` · ${seen ? 'Read' : 'Sent'}` : ''}</small>
                </article>
              })}
              <div ref={messagesEnd} />
            </div>
            {activeConversation ? <form className="chat-composer" onSubmit={sendMessage}>
              <label className="visually-hidden" htmlFor="chat-message">Message</label>
              <textarea id="chat-message" rows="2" maxLength="2000" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  event.currentTarget.form.requestSubmit()
                }
              }} placeholder="Write a message…" />
              <div><small>{draft.length}/2,000 · Enter to send, Shift+Enter for a new line</small><button className="button button-primary" disabled={sending || !draft.trim()}><Send size={15} />{sending ? 'Sending…' : 'Send'}</button></div>
            </form> : <div className="chat-archived"><CheckCheck size={17} />This claim is closed. Message history is available, but sending is disabled.</div>}
          </> : id ? <div className="chat-empty"><MessageCircle size={23} /><p>Conversation unavailable.</p></div> : <div className="chat-empty"><MessageCircle size={25} /><h2>Select a conversation</h2><p>Choose an eligible claim conversation to read and reply.</p></div>}
        </section>
      </div>
    </section>
  )
}
