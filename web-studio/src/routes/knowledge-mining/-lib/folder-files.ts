export const DOCUMENT_EXTENSIONS = new Set([
  'doc',
  'docx',
  'md',
  'markdown',
  'pdf',
  'xls',
  'xlsx',
])

export const MEMORY_EXTENSIONS = new Set([
  'json',
  'markdown',
  'md',
  'text',
  'txt',
  'yaml',
  'yml',
])

const DOCUMENT_DIRECTORY_NAMES = new Set(['document', 'documents', 'docs'])
const MEMORY_DIRECTORY_NAMES = new Set([
  'memory',
  'team memory',
  'team-memory',
  'team_memory',
])

function extensionOf(file: File): string {
  return file.name.toLowerCase().split('.').pop() || ''
}

export function hasSupportedExtension(
  file: File,
  extensions: Set<string>,
): boolean {
  return extensions.has(extensionOf(file))
}

export function getFileDisplayName(file: File): string {
  return file.webkitRelativePath || file.name
}

function directorySegments(file: File): string[] {
  const path = getFileDisplayName(file).replaceAll('\\', '/')
  return path
    .split('/')
    .slice(0, -1)
    .map((segment) => segment.trim().toLowerCase())
}

export type ClassifiedFolderFiles = {
  documents: File[]
  memory: File[]
  skipped: File[]
}

export function classifyResourceFolderFiles(
  files: File[],
): ClassifiedFolderFiles {
  const classified: ClassifiedFolderFiles = {
    documents: [],
    memory: [],
    skipped: [],
  }
  const paths = files.map(directorySegments)
  const hasStructuredDirectories = paths.some((segments) =>
    segments.some(
      (segment) =>
        DOCUMENT_DIRECTORY_NAMES.has(segment) ||
        MEMORY_DIRECTORY_NAMES.has(segment),
    ),
  )

  files.forEach((file, index) => {
    const segments = paths[index]
    const inMemoryDirectory = segments.some((segment) =>
      MEMORY_DIRECTORY_NAMES.has(segment),
    )
    const inDocumentDirectory = segments.some((segment) =>
      DOCUMENT_DIRECTORY_NAMES.has(segment),
    )

    if (inMemoryDirectory && hasSupportedExtension(file, MEMORY_EXTENSIONS)) {
      classified.memory.push(file)
      return
    }
    if (
      inDocumentDirectory &&
      hasSupportedExtension(file, DOCUMENT_EXTENSIONS)
    ) {
      classified.documents.push(file)
      return
    }
    if (hasStructuredDirectories) {
      classified.skipped.push(file)
      return
    }
    if (hasSupportedExtension(file, DOCUMENT_EXTENSIONS)) {
      classified.documents.push(file)
      return
    }
    if (hasSupportedExtension(file, MEMORY_EXTENSIONS)) {
      classified.memory.push(file)
      return
    }
    classified.skipped.push(file)
  })

  return classified
}
