export const DOCUMENT_EXTENSIONS = new Set([
  'doc',
  'docx',
  'md',
  'markdown',
  'pdf',
  'xls',
  'xlsx',
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

export type ClassifiedFolderFiles = {
  documents: File[]
  skipped: File[]
}

export function classifyResourceFolderFiles(
  files: File[],
): ClassifiedFolderFiles {
  const classified: ClassifiedFolderFiles = {
    documents: [],
    skipped: [],
  }
  files.forEach((file) => {
    if (hasSupportedExtension(file, DOCUMENT_EXTENSIONS)) {
      classified.documents.push(file)
      return
    }
    classified.skipped.push(file)
  })

  return classified
}
