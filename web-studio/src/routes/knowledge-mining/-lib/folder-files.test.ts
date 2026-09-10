import { describe, expect, it } from 'vitest'

import { classifyResourceFolderFiles, getFileDisplayName } from './folder-files'

function folderFile(path: string, content = 'test'): File {
  const file = new File([content], path.split('/').pop() || path)
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}

describe('classifyResourceFolderFiles', () => {
  it('collects supported documents from all subdirectories', () => {
    const pdf = folderFile('resource/documents/pdf/guide.pdf')
    const markdown = folderFile('resource/documents/markdown/guide.md')
    const manifest = folderFile('resource/manifest.yaml')
    const readme = folderFile('resource/README.md')

    const result = classifyResourceFolderFiles([
      pdf,
      markdown,
      manifest,
      readme,
    ])

    expect(result.documents).toEqual([pdf, markdown, readme])
    expect(result.skipped).toEqual([manifest])
  })

  it('treats supported files in an unstructured folder as documents', () => {
    const pdf = folderFile('research/paper.pdf')
    const markdown = folderFile('research/notes.md')
    const unsupported = folderFile('research/image.png')

    const result = classifyResourceFolderFiles([pdf, markdown, unsupported])

    expect(result.documents).toEqual([pdf, markdown])
    expect(result.skipped).toEqual([unsupported])
  })

  it('uses the relative path for display', () => {
    const file = folderFile('resource/documents/report.docx')
    expect(getFileDisplayName(file)).toBe('resource/documents/report.docx')
  })
})
