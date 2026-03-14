import { describe, it, expect } from 'vitest'
import {
  calculateDeltas,
  buildComparison,
  formatTime,
  formatTimeDelta,
  formatCLS,
  formatCLSDelta,
  isImprovement,
  isRegression,
  renderComparisonTable,
  METRIC_CONFIGS,
} from '../src/report.js'
import type { LighthouseMetrics, LighthouseMetricDeltas } from '../src/types.js'

const originalMetrics: LighthouseMetrics = {
  performanceScore: 43,
  fcp: 2800,
  lcp: 4200,
  tbt: 1850,
  cls: 0.12,
  si: 3800,
}

const cloneMetrics: LighthouseMetrics = {
  performanceScore: 96,
  fcp: 600,
  lcp: 800,
  tbt: 0,
  cls: 0.01,
  si: 900,
}

describe('report', () => {
  describe('calculateDeltas', () => {
    it('calculates correct deltas between original and clone', () => {
      const deltas = calculateDeltas(originalMetrics, cloneMetrics)

      expect(deltas.performanceScore).toBe(53)
      expect(deltas.fcp).toBe(-2200)
      expect(deltas.lcp).toBe(-3400)
      expect(deltas.tbt).toBe(-1850)
      expect(deltas.cls).toBeCloseTo(-0.11, 2)
      expect(deltas.si).toBe(-2900)
    })

    it('returns zero deltas for identical metrics', () => {
      const deltas = calculateDeltas(originalMetrics, originalMetrics)

      expect(deltas.performanceScore).toBe(0)
      expect(deltas.fcp).toBe(0)
      expect(deltas.lcp).toBe(0)
      expect(deltas.tbt).toBe(0)
      expect(deltas.cls).toBe(0)
      expect(deltas.si).toBe(0)
    })

    it('returns positive deltas when clone is worse', () => {
      const deltas = calculateDeltas(cloneMetrics, originalMetrics)

      expect(deltas.performanceScore).toBe(-53)
      expect(deltas.lcp).toBe(3400)
      expect(deltas.tbt).toBe(1850)
    })
  })

  describe('buildComparison', () => {
    it('builds a complete comparison object', () => {
      const comparison = buildComparison(originalMetrics, cloneMetrics)

      expect(comparison.original).toEqual(originalMetrics)
      expect(comparison.clone).toEqual(cloneMetrics)
      expect(comparison.deltas.performanceScore).toBe(53)
      expect(comparison.deltas.lcp).toBe(-3400)
    })
  })

  describe('formatTime', () => {
    it('formats values >= 1000ms as seconds', () => {
      expect(formatTime(4200)).toBe('4.2s')
      expect(formatTime(1000)).toBe('1.0s')
      expect(formatTime(1500)).toBe('1.5s')
      expect(formatTime(12345)).toBe('12.3s')
    })

    it('formats values < 1000ms as milliseconds', () => {
      expect(formatTime(0)).toBe('0ms')
      expect(formatTime(850)).toBe('850ms')
      expect(formatTime(999)).toBe('999ms')
      expect(formatTime(50)).toBe('50ms')
    })

    it('handles negative values', () => {
      expect(formatTime(-3400)).toBe('-3.4s')
      expect(formatTime(-500)).toBe('-500ms')
    })
  })

  describe('formatTimeDelta', () => {
    it('adds + prefix for positive deltas', () => {
      expect(formatTimeDelta(1500)).toBe('+1.5s')
      expect(formatTimeDelta(200)).toBe('+200ms')
    })

    it('preserves - prefix for negative deltas', () => {
      expect(formatTimeDelta(-3400)).toBe('-3.4s')
      expect(formatTimeDelta(-850)).toBe('-850ms')
    })

    it('handles zero', () => {
      expect(formatTimeDelta(0)).toBe('0ms')
    })
  })

  describe('formatCLS', () => {
    it('formats CLS with 2 decimal places', () => {
      expect(formatCLS(0.12)).toBe('0.12')
      expect(formatCLS(0.01)).toBe('0.01')
      expect(formatCLS(0)).toBe('0.00')
      expect(formatCLS(1.5)).toBe('1.50')
    })
  })

  describe('formatCLSDelta', () => {
    it('adds + prefix for positive CLS delta', () => {
      expect(formatCLSDelta(0.11)).toBe('+0.11')
    })

    it('preserves - prefix for negative CLS delta', () => {
      expect(formatCLSDelta(-0.11)).toBe('-0.11')
    })

    it('handles zero', () => {
      expect(formatCLSDelta(0)).toBe('0.00')
    })
  })

  describe('isImprovement', () => {
    it('treats positive performanceScore delta as improvement', () => {
      expect(isImprovement('performanceScore', 53)).toBe(true)
      expect(isImprovement('performanceScore', -10)).toBe(false)
    })

    it('treats negative time deltas as improvement (lower is better)', () => {
      expect(isImprovement('lcp', -3400)).toBe(true)
      expect(isImprovement('tbt', -1850)).toBe(true)
      expect(isImprovement('fcp', -500)).toBe(true)
      expect(isImprovement('si', -2900)).toBe(true)
    })

    it('treats negative CLS delta as improvement', () => {
      expect(isImprovement('cls', -0.11)).toBe(true)
      expect(isImprovement('cls', 0.05)).toBe(false)
    })

    it('treats positive time deltas as not improvement', () => {
      expect(isImprovement('lcp', 500)).toBe(false)
      expect(isImprovement('tbt', 200)).toBe(false)
    })
  })

  describe('isRegression', () => {
    it('treats negative performanceScore delta as regression', () => {
      expect(isRegression('performanceScore', -10)).toBe(true)
      expect(isRegression('performanceScore', 53)).toBe(false)
    })

    it('treats positive time deltas as regression (higher is worse)', () => {
      expect(isRegression('lcp', 500)).toBe(true)
      expect(isRegression('tbt', 200)).toBe(true)
    })

    it('treats zero as not a regression', () => {
      expect(isRegression('performanceScore', 0)).toBe(false)
      expect(isRegression('lcp', 0)).toBe(false)
      expect(isRegression('cls', 0)).toBe(false)
    })
  })

  describe('METRIC_CONFIGS', () => {
    it('has 6 metric configurations', () => {
      expect(METRIC_CONFIGS).toHaveLength(6)
    })

    it('covers all key metrics', () => {
      const keys = METRIC_CONFIGS.map(c => c.key)
      expect(keys).toContain('performanceScore')
      expect(keys).toContain('lcp')
      expect(keys).toContain('tbt')
      expect(keys).toContain('cls')
      expect(keys).toContain('si')
      expect(keys).toContain('fcp')
    })

    it('formats performance score as plain number', () => {
      const config = METRIC_CONFIGS.find(c => c.key === 'performanceScore')!
      expect(config.formatValue(96)).toBe('96')
      expect(config.formatDelta(53)).toBe('+53')
      expect(config.formatDelta(-10)).toBe('-10')
    })

    it('formats LCP with time formatting', () => {
      const config = METRIC_CONFIGS.find(c => c.key === 'lcp')!
      expect(config.formatValue(4200)).toBe('4.2s')
      expect(config.formatDelta(-3400)).toBe('-3.4s')
    })

    it('formats CLS with decimal formatting', () => {
      const config = METRIC_CONFIGS.find(c => c.key === 'cls')!
      expect(config.formatValue(0.12)).toBe('0.12')
      expect(config.formatDelta(-0.11)).toBe('-0.11')
    })
  })

  describe('renderComparisonTable', () => {
    it('returns a string containing all metric labels', async () => {
      const comparison = buildComparison(originalMetrics, cloneMetrics)
      const table = await renderComparisonTable(comparison)

      expect(table).toContain('Performance Score')
      expect(table).toContain('LCP')
      expect(table).toContain('TBT')
      expect(table).toContain('CLS')
      expect(table).toContain('Speed Index')
      expect(table).toContain('FCP')
    })

    it('contains header row labels', async () => {
      const comparison = buildComparison(originalMetrics, cloneMetrics)
      const table = await renderComparisonTable(comparison)

      expect(table).toContain('Metric')
      expect(table).toContain('Original')
      expect(table).toContain('Clone')
      expect(table).toContain('Delta')
    })

    it('contains formatted metric values', async () => {
      const comparison = buildComparison(originalMetrics, cloneMetrics)
      const table = await renderComparisonTable(comparison)

      // Original values
      expect(table).toContain('43')   // original performance score
      expect(table).toContain('4.2s') // original LCP

      // Clone values
      expect(table).toContain('96')    // clone performance score
      expect(table).toContain('800ms') // clone LCP (under 1000ms = ms format)
    })

    it('uses box-drawing characters for borders', async () => {
      const comparison = buildComparison(originalMetrics, cloneMetrics)
      const table = await renderComparisonTable(comparison)

      // Strip ANSI codes for character checks
      const stripped = table.replace(/\x1b\[[0-9;]*m/g, '')

      expect(stripped).toContain('\u250c') // top-left corner
      expect(stripped).toContain('\u2518') // bottom-right corner
      expect(stripped).toContain('\u2502') // vertical line
      expect(stripped).toContain('\u2500') // horizontal line
    })

    it('handles identical metrics (zero deltas)', async () => {
      const comparison = buildComparison(originalMetrics, originalMetrics)
      const table = await renderComparisonTable(comparison)

      // Should still render without errors
      expect(table).toContain('Performance Score')
      expect(table).toContain('43')
    })
  })
})
