import { describe, expect, it } from 'vitest'

import { estimatedFileProbes, planMiningWindows } from './windowing'

describe('planMiningWindows', () => {
  it('estimates small text files as one required source probe', () => {
    expect(estimatedFileProbes({ size: 32_000 })).toBe(1)
    expect(estimatedFileProbes({ size: 8 * 65_536 })).toBe(8)
    expect(estimatedFileProbes({ size: 20 * 65_536 })).toBe(12)
  })

  it('bounds windows by both file count and bytes', () => {
    const windows = planMiningWindows(
      [{ size: 40 }, { size: 40 }, { size: 40 }, { size: 30 }],
      { byteLimit: 100, fileLimit: 2 },
    )

    expect(windows.map((window) => window.files.length)).toEqual([2, 2])
    expect(windows.map((window) => window.sizeBytes)).toEqual([80, 70])
  })

  it('places a file over the byte budget in a singleton window', () => {
    const windows = planMiningWindows(
      [{ size: 40 }, { size: 120 }, { size: 30 }],
      { byteLimit: 100, fileLimit: 10 },
    )

    expect(windows.map((window) => window.files.length)).toEqual([1, 1, 1])
    expect(windows[1]).toMatchObject({
      oversizedSingleton: true,
      sizeBytes: 120,
    })
  })

  it('cuts windows at page and estimated-probe budgets', () => {
    const windows = planMiningWindows(
      [
        { estimatedProbes: 16, pdfPages: 900, size: 10 },
        { estimatedProbes: 16, pdfPages: 700, size: 10 },
        { estimatedProbes: 280, pdfPages: 0, size: 10 },
        { estimatedProbes: 30, pdfPages: 0, size: 10 },
      ],
      {
        byteLimit: 100,
        fileLimit: 100,
        pageLimit: 1500,
        probeLimit: 300,
      },
    )

    expect(windows.map((window) => window.files.length)).toEqual([1, 2, 1])
    expect(windows[0].pdfPages).toBe(900)
    expect(windows[1].estimatedProbes).toBe(296)
  })
})
