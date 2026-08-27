import { describe, expect, it } from 'vitest'

import { classifyResourceFolderFiles, getFileDisplayName } from './folder-files'

function folderFile(path: string, content = 'test'): File {
  const file = new File([content], path.split('/').pop() || path)
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}

describe('classifyResourceFolderFiles', () => {
  it('classifies a structured resource folder and ignores manifests', () => {
    const pdf = folderFile('resource/documents/pdf/guide.pdf')
    const markdown = folderFile('resource/documents/markdown/guide.md')
    const memory = folderFile('resource/team-memory/decisions.yaml')
    const readme = folderFile('resource/README.md')

    const result = classifyResourceFolderFiles([pdf, markdown, memory, readme])

    expect(result.documents).toEqual([pdf, markdown])
    expect(result.memory).toEqual([memory])
    expect(result.skipped).toEqual([readme])
  })

  it('treats supported files in an unstructured folder as documents', () => {
    const pdf = folderFile('research/paper.pdf')
    const markdown = folderFile('research/notes.md')
    const unsupported = folderFile('research/image.png')

    const result = classifyResourceFolderFiles([pdf, markdown, unsupported])

    expect(result.documents).toEqual([pdf, markdown])
    expect(result.memory).toEqual([])
    expect(result.skipped).toEqual([unsupported])
  })

  it('uses the relative path for display', () => {
    const file = folderFile('resource/documents/report.docx')
    expect(getFileDisplayName(file)).toBe('resource/documents/report.docx')
  })
})
