/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DiffViewer } from '../../src/products/diff-viewer'

describe('DiffViewer', () => {
  it('shows added and removed lines', () => {
    render(<DiffViewer original={'a\n'} modified={'b\n'} />)
    expect(screen.getByTestId('diff-viewer').textContent).toMatch(/-a/)
    expect(screen.getByTestId('diff-viewer').textContent).toMatch(/\+b/)
  })

  it('supports split mode', () => {
    render(<DiffViewer original={'a\n'} modified={'b\n'} mode="split" />)
    expect(screen.getByTestId('diff-viewer')).toHaveAttribute('data-mode', 'split')
  })

  it('marks each change site on the overview', () => {
    render(<DiffViewer original={'a\nb\nc\n'} modified={'a\nB\nc\nD\n'} />)
    const overview = screen.getByTestId('diff-overview')
    expect(overview).toHaveAttribute('data-hunks', '2')
    expect(overview.querySelectorAll('[data-diff-mark]')).toHaveLength(2)
    const row = document.querySelector('[data-diff-row="1"]')
    if (!(row instanceof HTMLElement)) throw new Error('missing diff row')
    row.scrollIntoView = () => undefined
    overview.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 0 }))
  })

  it('names the change sites and steps to the next one', () => {
    render(<DiffViewer original={'a\nb\nc\n'} modified={'a\nB\nc\nD\n'} />)
    const nav = screen.getByTestId('diff-hunks')
    expect(nav).toHaveAttribute('data-hunks', '2')
    expect(nav).toHaveTextContent('2 changes')
    expect(screen.getByRole('button', { name: 'Previous change' })).toBeDisabled()
    const row = document.querySelector('[data-diff-row="1"]')
    if (!(row instanceof HTMLElement)) throw new Error('missing diff row')
    let scrolled = false
    row.scrollIntoView = () => {
      scrolled = true
    }
    screen.getByRole('button', { name: 'Next change' }).click()
    expect(scrolled).toBe(true)
  })
})
