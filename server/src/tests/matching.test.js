import { describe, expect, it } from 'vitest'
import { getMatchWeights, scoreMatch } from '../services/matching.js'

const lost = {
  type: 'lost',
  itemName: 'Blue leather wallet',
  category: 'Wallet',
  description: 'Small blue wallet with a transit card inside',
  color: 'blue',
  location: 'Central Library',
  eventDate: '2026-04-02',
}

describe('scoreMatch', () => {
  it('uses weights totaling 100 and gives a strong cross-type match', () => {
    const found = { ...lost, type: 'found', location: 'Central Library entrance' }
    const result = scoreMatch(lost, found)
    expect(Object.values(getMatchWeights()).reduce((a, b) => a + b, 0)).toBe(100)
    expect(result.comparable).toBe(true)
    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.factors.length).toBeGreaterThan(0)
  })

  it('rejects same-type comparisons', () => {
    expect(scoreMatch(lost, { ...lost }).comparable).toBe(false)
  })

  it('returns no valid comparison for unsupported report types', () => {
    expect(scoreMatch({ type: 'found' }, { type: 'found' }).comparable).toBe(false)
    expect(scoreMatch({ type: 'other' }, { type: 'lost' }).comparable).toBe(false)
  })

  it('scores a category-only mismatch as zero', () => {
    const result = scoreMatch(
      { type: 'lost', category: 'electronics' },
      { type: 'found', category: 'clothing' },
    )
    expect(result.score).toBe(0)
  })

  it('handles missing descriptions and colors without NaN', () => {
    const result = scoreMatch({ type: 'lost', itemName: 'Key', category: 'Keys' }, { type: 'found', itemName: 'Key', category: 'Keys' })
    expect(Number.isFinite(result.score)).toBe(true)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('does not inflate a match score when optional fields are missing', () => {
    const result = scoreMatch(
      { type: 'lost', category: 'Keys', description: '' },
      { type: 'found', category: 'Keys', description: '   ' },
    )
    expect(result.score).toBe(24)
    expect(result.factors).toContain('Category matches')
  })

  it('uses zero similarity at the 90-day date boundary', () => {
    const result = scoreMatch(
      { type: 'lost', eventDate: '2025-01-01' },
      { type: 'found', eventDate: '2025-04-01' },
    )
    expect(result.score).toBe(0)
  })

  it('scores identical dates as a full date-factor match', () => {
    expect(scoreMatch(
      { type: 'lost', eventDate: '2025-01-01' },
      { type: 'found', eventDate: '2025-01-01' },
    ).score).toBe(12)
  })

  it('scores unrelated reports lower than similar reports', () => {
    const unrelated = scoreMatch(lost, {
      type: 'found', itemName: 'Red umbrella', category: 'Clothing',
      description: 'Large red folding umbrella', color: 'red', location: 'North Park',
      eventDate: '2025-01-01',
    })
    expect(unrelated.score).toBeLessThan(40)
  })

  it('ignores date contribution when either event date is absent', () => {
    const a = { type: 'lost', category: 'Phone', itemName: 'Phone' }
    const b = { type: 'found', category: 'Phone', itemName: 'Phone' }
    expect(scoreMatch(a, b).score).toBe(48)
  })

  it('reports the weighted similarity as a score, not certainty from sparse details', () => {
    const sparse = scoreMatch(
      { type: 'lost', category: 'Keys', itemName: 'House key' },
      { type: 'found', category: 'Keys', itemName: 'House key' },
    )
    expect(sparse.score).toBe(48)
    expect(sparse.score).toBeLessThan(100)
  })

  it('keeps scores within the 0 to 100 range', () => {
    const result = scoreMatch(lost, { ...lost, type: 'found' })
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })
})
