const weights = { category: 24, name: 24, description: 15, color: 10, location: 15, date: 12 }

function normalize(value = '') {
  return String(value).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

function tokens(value = '') {
  return new Set(normalize(value).split(' ').filter((word) => word.length > 2))
}

function stringSimilarity(a, b) {
  const left = normalize(a)
  const right = normalize(b)
  if (!left || !right) return null
  if (left === right) return 1
  const leftWords = tokens(left)
  const rightWords = tokens(right)
  if (!leftWords.size || !rightWords.size) return 0
  const overlap = [...leftWords].filter((word) => rightWords.has(word)).length
  return overlap / new Set([...leftWords, ...rightWords]).size
}

function dateSimilarity(a, b) {
  if (!a || !b || !Number.isFinite(new Date(a).getTime()) || !Number.isFinite(new Date(b).getTime())) return null
  const days = Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000
  return Math.max(0, 1 - days / 90)
}

export function scoreMatch(first, second) {
  if (!first || !second || first.type === second.type || !['lost', 'found'].includes(first.type) || !['lost', 'found'].includes(second.type)) {
    return { score: 0, factors: [], comparable: false }
  }
  const category = stringSimilarity(first.category, second.category)
  const name = stringSimilarity(first.itemName, second.itemName)
  const description = stringSimilarity(first.description, second.description)
  const color = stringSimilarity(first.color, second.color)
  const location = stringSimilarity(first.location, second.location)
  const date = dateSimilarity(first.eventDate, second.eventDate)
  const raw = { category, name, description, color, location, date }
  const weighted = Object.entries(raw).reduce((sum, [key, value]) => sum + (value === null ? 0 : value * weights[key]), 0)
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0)
  const score = Math.round((weighted / totalWeight) * 100)
  const labels = {
    category: ['Category matches', 'Category is similar'],
    name: ['Item name matches', 'Item name is similar'],
    description: ['Description details overlap', 'Some description details overlap'],
    color: ['Color matches', 'Color is similar'],
    location: ['Location matches', 'Location is similar'],
    date: ['Dates are very close', 'Dates are within a few months'],
  }
  const factors = Object.entries(raw)
    .filter(([, value]) => value !== null && value >= 0.2)
    .map(([key, value]) => labels[key][value >= 0.75 ? 0 : 1])
  return { score: Math.max(0, Math.min(100, score)), factors, comparable: true }
}

export function getMatchWeights() {
  return { ...weights }
}

export function getMatchThreshold() {
  const threshold = Number(process.env.MATCH_THRESHOLD ?? 50)
  return Number.isFinite(threshold) && threshold >= 0 && threshold <= 100 ? threshold : 50
}
