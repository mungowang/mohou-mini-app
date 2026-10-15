/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FileDropzone } from '../../src/products/file-dropzone'

describe('FileDropzone', () => {
  it('renders the drop target', () => {
    render(<FileDropzone />)
    expect(screen.getByTestId('file-dropzone')).toBeInTheDocument()
  })

  it('puts accept extensions on the hidden file input', () => {
    render(
      <FileDropzone
        accept={{
          'application/json': ['.json'],
          'application/octet-stream': ['.caskpack'],
        }}
      />,
    )
    const input = screen.getByTestId('file-dropzone').querySelector('input')
    expect(input?.getAttribute('accept') ?? '').toContain('.json')
    expect(input?.getAttribute('accept') ?? '').toContain('.caskpack')
  })

  it('marks the root disabled', () => {
    render(<FileDropzone disabled />)
    const root = screen.getByTestId('file-dropzone').querySelector('[data-drop-disabled]')
    expect(root?.getAttribute('data-drop-disabled')).toBe('1')
  })

  it('applies className on the outer shell', () => {
    render(<FileDropzone className="w-full max-w-md" />)
    expect(screen.getByTestId('file-dropzone').className).toContain('max-w-md')
  })
})
