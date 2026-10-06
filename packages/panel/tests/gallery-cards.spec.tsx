/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'

import type { PanelClient } from '../src/gallery/client.ts'
import { galleryCardStyles } from '../src/gallery/list.ts'
import { galleryState, reduceGallery, type GalleryAction } from '../src/gallery/state.ts'
import { GalleryBody, PanelGallery } from '../src/gallery/view.tsx'

const todo = { id: 'com.example.todo', name: 'Todo', description: 'A list', version: '1', acronym: 'TO' }

describe('gallery card styles and toolbar', () => {
  it('renders every card style and runs the toolbar actions', async () => {
    const actions: GalleryAction[] = []
    let restored = false
    let removed = false
    let reloaded = false
    const client: PanelClient = {
      list: () => Promise.resolve([todo]),
      open: () => Promise.resolve(),
      deleteApp: async () => { removed = true },
      undeleteApp: async () => { restored = true },
      reload: async () => { reloaded = true },
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    let state = reduceGallery(galleryState('overlay'), { type: 'listed', apps: [todo] })
    const dispatch = (action: GalleryAction) => {
      actions.push(action)
      state = reduceGallery(state, action)
    }
    const paint = async () => {
      await act(async () => {
        root.render(
          <GalleryBody
            state={state}
            dispatch={dispatch}
            client={client}
            locale="en"
            mode="production"
            tools={<span>tools</span>}
            themeOpen
            onToggleTheme={() => undefined}
            onToggleSettings={() => undefined}
            onClosePanel={() => undefined}
            theme={<p>Palette</p>}
            overlay={<p>overlay</p>}
          />,
        )
      })
    }
    for (const style of galleryCardStyles) {
      state = reduceGallery(state, { type: 'card', cardStyle: style })
      await paint()
      expect(host.querySelector(`[data-card="${style}"]`)).toBeTruthy()
    }
    state = reduceGallery(state, { type: 'open', appId: todo.id, title: 'Todo' })
    state = reduceGallery(state, { type: 'trash', apps: [{ ...todo, name: 'Todo (old)' }] })
    state = reduceGallery(state, { type: 'ask-delete', appId: todo.id })
    await paint()
    await act(async () => {
      host.querySelector('button[data-trash-open]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    await act(async () => {
      host.querySelector('button[data-restore="com.example.todo"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    await act(async () => {
      host.querySelector('[aria-label="Close"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      ;[...host.querySelectorAll('button')].find(button => button.textContent === 'Cancel')?.click()
      host.querySelector('button.go')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      host.querySelector('button[aria-label="Reload"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      const search = host.querySelector('input[type="search"]')
      if (search instanceof HTMLInputElement) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, 'todo')
        search.dispatchEvent(new Event('input', { bubbles: true }))
      }
      await Promise.resolve()
    })
    expect(actions.some(action => action.type === 'close')).toBe(true)
    expect(actions.some(action => action.type === 'search')).toBe(true)
    expect(restored).toBe(true)
    expect(removed).toBe(true)
    expect(reloaded).toBe(true)
    expect(host.textContent).toContain('overlay')
    const desk = { ...todo, id: 'com.example.desk', name: 'Desk', kind: 'workbench' as const }
    const reloadedIds: string[] = []
    const home: PanelClient = {
      list: () => Promise.resolve([todo, desk]),
      open: () => Promise.resolve(),
      deleteApp: () => Promise.resolve(),
      reload: async (id) => { reloadedIds.push(id) },
    }
    state = reduceGallery(galleryState('standalone'), { type: 'listed', apps: [todo, desk] })
    await act(async () => {
      root.render(
        <GalleryBody
          state={state}
          dispatch={dispatch}
          client={home}
          locale="en"
          mode="production"
          defaultWorkbenchId={desk.id}
        />,
      )
    })
    await act(async () => {
      host.querySelector('button[aria-label="Refresh"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    expect(reloadedIds).toEqual([desk.id])
    const listed = client
    listed.listTrash = () => Promise.resolve([])
    await act(async () => {
      root.render(
        <PanelGallery
          client={listed}
          locale="en"
          mode="production"
          shell="overlay"
          overlay={({ setCard }) => <button type="button" onClick={() => setCard('list')}>chrome</button>}
        />,
      )
    })
    await act(async () => {
      ;[...host.querySelectorAll('button')].find(button => button.textContent === 'chrome')?.click()
    })
    expect(host.querySelector('[data-card="list"]')).toBeTruthy()
    root.unmount()
    host.remove()
  })
})
