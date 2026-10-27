import Notification from '../models/Notification.js'

let emitNotification = () => {}

export function setNotificationEmitter(emitter) {
  emitNotification = emitter
}

export async function createNotification({ recipient, type, title, message, relatedId, dedupeKey }) {
  if (!recipient || !dedupeKey) return false
  const result = await Notification.updateOne(
    { recipient, dedupeKey },
    { $setOnInsert: { recipient, type, title, message, relatedId, dedupeKey } },
    { upsert: true },
  )
  if (result?.upsertedCount > 0) {
    emitNotification(String(recipient), { type, title, message, relatedId: String(relatedId) })
    return true
  }
  return false
}

export async function notifyPotentialMatches(report, candidates) {
  const ownId = String(report.reporter)
  await Promise.all(candidates.flatMap((candidate) => {
    const other = candidate.report
    const tasks = []
    if (String(other.reporter) !== ownId) {
      tasks.push(createNotification({
        recipient: other.reporter,
        type: 'match',
        title: 'A possible item match was found',
        message: `A new ${report.type} report may match your ${other.type} report.`,
        relatedId: report._id,
        dedupeKey: `match:${[String(report._id), String(other._id)].sort().join(':')}:${String(other.reporter)}`,
      }))
    }
    if (ownId !== String(other.reporter)) {
      tasks.push(createNotification({
        recipient: report.reporter,
        type: 'match',
        title: 'A possible item match was found',
        message: `Your ${report.type} report may match another ${other.type} report.`,
        relatedId: other._id,
        dedupeKey: `match:${[String(report._id), String(other._id)].sort().join(':')}:${ownId}`,
      }))
    }
    return tasks
  }))
}
