/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CodeEditor } from '../../src/products/code-editor'

describe('CodeEditor', () => {
  it('renders', () => {
    render(<CodeEditor value={'const n = 1'} language="ts" />)
    expect(screen.getByTestId('code-editor')).toBeInTheDocument()
  })

  it('soft-wraps the CDN fallback textarea when lineWrapping is on', () => {
    render(<CodeEditor value={'const n = 1'} language="ts" lineWrapping />)
    const field = screen.getByTestId('code-editor')
    expect(field.className).toContain('whitespace-pre-wrap')
  })
})
