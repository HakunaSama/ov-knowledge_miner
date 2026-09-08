export const DEFAULT_WINDOW_FILE_LIMIT = 10
export const DEFAULT_WINDOW_BYTE_LIMIT = 200 * 1024 * 1024
export const DEFAULT_WINDOW_PAGE_LIMIT = 1500
export const DEFAULT_WINDOW_PROBE_LIMIT = 300
export const MAX_KNOWLEDGE_MINING_FILE_BYTES = 512 * 1024 * 1024

export type MiningFileWindow<T> = {
  files: T[]
  index: number
  oversizedSingleton: boolean
  pdfPages: number
  estimatedProbes: number
  sizeBytes: number
}

export type MiningFilePlanInput<T> = {
  estimatedProbes: number
  file: T
  pdfPages: number
  size: number
}

type SizedFile = {
  estimatedProbes?: number
  pdfPages?: number
  size: number
}

export function estimatedRequiredProbes(fragmentCount: number): number {
  if (fragmentCount <= 0) return 1
  if (fragmentCount <= 8) return fragmentCount
  if (fragmentCount <= 24) return 12
  if (fragmentCount <= 64) return 16
  return 24
}

export function estimatedFileProbes(file: { size: number }): number {
  return estimatedRequiredProbes(Math.max(1, Math.ceil(file.size / 65_536)))
}

async function pdfPageCount(file: File): Promise<number> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const loading = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  })
  const document = await loading.promise
  try {
    return document.numPages
  } finally {
    await document.destroy()
  }
}

export async function inspectMiningFiles(
  files: File[],
): Promise<Array<MiningFilePlanInput<File>>> {
  const inspected: Array<MiningFilePlanInput<File>> = []
  for (let offset = 0; offset < files.length; offset += 4) {
    const batch = await Promise.all(
      files.slice(offset, offset + 4).map(async (file) => {
        const isPdf = file.name.toLowerCase().endsWith('.pdf')
        const pdfPages = isPdf ? await pdfPageCount(file) : 0
        return {
          estimatedProbes: isPdf
            ? estimatedRequiredProbes(pdfPages)
            : estimatedFileProbes(file),
          file,
          pdfPages,
          size: file.size,
        }
      }),
    )
    inspected.push(...batch)
  }
  return inspected
}

export function planMiningWindows<T extends SizedFile>(
  files: T[],
  options: {
    byteLimit: number
    fileLimit: number
    pageLimit?: number
    probeLimit?: number
  },
): MiningFileWindow<T>[] {
  if (!Number.isInteger(options.fileLimit) || options.fileLimit <= 0) {
    throw new Error('fileLimit must be a positive integer')
  }
  if (!Number.isFinite(options.byteLimit) || options.byteLimit <= 0) {
    throw new Error('byteLimit must be positive')
  }
  const pageLimit = options.pageLimit ?? Number.POSITIVE_INFINITY
  const probeLimit = options.probeLimit ?? Number.POSITIVE_INFINITY
  if (
    options.pageLimit !== undefined &&
    (!Number.isFinite(pageLimit) || pageLimit <= 0)
  ) {
    throw new Error('pageLimit must be positive')
  }
  if (
    options.probeLimit !== undefined &&
    (!Number.isFinite(probeLimit) || probeLimit <= 0)
  ) {
    throw new Error('probeLimit must be positive')
  }

  const windows: Omit<MiningFileWindow<T>, 'index'>[] = []
  let current: T[] = []
  let currentBytes = 0
  let currentPages = 0
  let currentProbes = 0
  const flush = () => {
    if (current.length === 0) return
    windows.push({
      files: current,
      oversizedSingleton: false,
      pdfPages: currentPages,
      estimatedProbes: currentProbes,
      sizeBytes: currentBytes,
    })
    current = []
    currentBytes = 0
    currentPages = 0
    currentProbes = 0
  }

  for (const file of files) {
    const pdfPages = file.pdfPages || 0
    const estimatedProbes = file.estimatedProbes || estimatedFileProbes(file)
    if (
      file.size > options.byteLimit ||
      pdfPages > pageLimit ||
      estimatedProbes > probeLimit
    ) {
      flush()
      windows.push({
        files: [file],
        oversizedSingleton: true,
        pdfPages,
        estimatedProbes,
        sizeBytes: file.size,
      })
      continue
    }
    if (
      current.length > 0 &&
      (current.length >= options.fileLimit ||
        currentBytes + file.size > options.byteLimit ||
        currentPages + pdfPages > pageLimit ||
        currentProbes + estimatedProbes > probeLimit)
    ) {
      flush()
    }
    current.push(file)
    currentBytes += file.size
    currentPages += pdfPages
    currentProbes += estimatedProbes
  }
  flush()

  return windows.map((window, index) => ({ ...window, index: index + 1 }))
}
