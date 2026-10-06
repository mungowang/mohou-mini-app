import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { PanelClient } from '../src/gallery/client.ts'
import { GalleryBody } from '../src/gallery/view.tsx'
import { galleryState, reduceGallery } from '../src/gallery/state.ts'

const todo = { id: 'com.example.todo', name: 'Todo', description: 'A list', version: '1', acronym: 'TO' }
const client: PanelClient = {
  list: () => Promise.resolve([todo]),
  open: () => Promise.resolve(),
  deleteApp: () => Promise.resolve(),
}

describe('GalleryBody', () => {
  it('renders empty, unreachable, a card, and an app frame without a route', () => {
    expect(markup(galleryState('standalone'))).toContain('No apps yet')
    expect(markup(galleryState('standalone'))).not.toContain('Close panel')
    expect(markup(reduceGallery(galleryState('overlay'), { type: 'unreachable' }))).toContain('Host is unreachable')
    expect(markup(reduceGallery(galleryState('overlay'), { type: 'unreachable' }))).not.toContain('data-dock-choice')
    const ready = reduceGallery(galleryState('standalone'), { type: 'listed', apps: [todo] })
    expect(markup(reduceGallery(ready, { type: 'search', query: 'missing' }))).toContain('No matching apps')
    expect(markup(ready)).toContain('data-card="glass"')
    expect(markup(ready)).toContain('Host ready')
    expect(markup(ready)).toContain('mma-app-frame')
    expect(markup(ready)).toContain('data-status="ready"')
    expect(markup(ready)).toContain('1 apps')
    expect(markup(reduceGallery(galleryState('overlay'), { type: 'unreachable' }))).toContain('data-status="down"')
    expect(markup(reduceGallery(galleryState('standalone'), { type: 'list-failed', message: '500' }))).toContain('data-status="failed"')
    expect(markup(ready)).toContain('>Todo</h3>')
    const glass = ready
    expect(markup(glass)).toContain('data-monogram="glass"')
    expect(markup(glass).indexOf('data-monogram="glass"')).toBeLessThan(markup(glass).indexOf('Todo'))
    const listed = reduceGallery(ready, { type: 'card', cardStyle: 'list' })
    expect(markup(listed).indexOf('Todo')).toBeLessThan(markup(listed).indexOf('data-monogram="list"'))
    const open = reduceGallery(ready, { type: 'open', appId: todo.id, title: 'Todo' })
    expect(markup(open)).toContain('data-app-id="com.example.todo"')
    expect(markup(open)).not.toContain('Host ready')
    expect(markup(open)).toContain('class="mma-stage"')
    const framed = renderToStaticMarkup(createElement(GalleryBody, {
      state: open,
      dispatch: () => undefined,
      client,
      locale: 'en',
      mode: 'production',
      frame: () => createElement('span', null, 'frame'),
    }))
    expect(framed).toContain('frame')
    expect(markup(reduceGallery(galleryState('standalone'), { type: 'list-failed', message: '500' }))).toContain('500')
    expect(markup(reduceGallery(galleryState('standalone'), { type: 'list-failed', message: '' }))).toContain('The app list failed')
    expect(markup(reduceGallery(open, { type: 'frame-error', message: '' }))).toContain('Reload failed')
    // The trash is a glyph until it is opened: deleted apps are not part of the first screen.
    expect(markup(reduceGallery(galleryState('standalone'), { type: 'trash-failed' }))).toContain('data-trash-open')
    expect(markup(reduceGallery(open, { type: 'frame-error', message: 'missing' }))).toContain('missing')
    expect(markup(open)).not.toContain('/api/')
    expect(markup(open)).not.toContain('src=')
    const asking = reduceGallery(ready, { type: 'ask-delete', appId: todo.id })
    expect(markup(asking)).toContain('Delete this app?')
    expect(markup(reduceGallery(asking, { type: 'delete-failed' }))).toContain('Delete failed')
    expect(markup(reduceGallery(asking, { type: 'delete-failed', message: 'busy' }))).toContain('busy')
    expect(markup(reduceGallery(ready, { type: 'open-failed', message: 'missing' }))).toContain('missing')
    expect(markup(reduceGallery(ready, { type: 'open-failed' }))).toContain('Open failed')
    expect(markup(reduceGallery(reduceGallery(ready, { type: 'open-failed', message: 'missing' }), { type: 'open', appId: todo.id, title: 'Todo' }))).not.toContain('missing')
  })

  it('marks a workbench app, offers set-default, and replaces the library when that app is the desk', () => {
    const desk = { ...todo, id: 'com.example.desk', name: 'Desk', kind: 'workbench' as const }
    const listed = reduceGallery(galleryState('standalone'), { type: 'listed', apps: [todo, desk] })
    const grid = markup(listed)
    expect(grid).toContain('Desk')
    expect(grid).toContain('data-desk="default"')
    expect(grid).toContain('data-desk="com.example.desk"')
    expect(grid).toContain('mma-desk-mark')
    expect(grid).toContain('>TO</span>')
    expect(grid).not.toContain('Set as home')
    const open = reduceGallery(listed, { type: 'open', appId: desk.id, title: 'Desk' })
    expect(markup(open, { defaultWorkbenchId: desk.id })).toContain('Current home')
    expect(markup(open, { defaultWorkbenchId: desk.id })).toContain('aria-label="Clear home"')
    expect(markup(open, { defaultWorkbenchId: desk.id })).toContain('mma-toolbar-rule')
    expect(markup(open)).toContain('Set as home')
    expect(markup(open)).toContain('aria-label="Delete"')
    expect(markup(open, { defaultWorkbenchId: desk.id })).not.toContain('data-desk=')
    const slot = renderToStaticMarkup(createElement(GalleryBody, {
      state: listed,
      dispatch: () => undefined,
      client,
      locale: 'en',
      mode: 'production',
      defaultWorkbenchId: desk.id,
      frame: () => createElement('span', null, 'desk-frame'),
    }))
    expect(slot).toContain('desk-frame')
    expect(slot).toContain('mma-app-frame')
    expect(slot).toContain('flex flex-col')
    expect(slot).not.toContain('>Library</h2>')
    expect(slot).toContain('data-open-workbench="com.example.desk"')
    expect(slot).toContain('aria-label="Open as tab"')
    expect(slot).toContain('Custom home')
    expect(slot).toContain('More in a tab')
    expect(slot).toContain('Open this workbench in a tab for storage, history, and theme')
    expect(grid).not.toContain('data-open-workbench=')
    expect(markup(open, { defaultWorkbenchId: desk.id })).not.toContain('data-open-workbench=')
  })
})

function markup(state: ReturnType<typeof galleryState>, extra: { defaultWorkbenchId?: string } = {}): string {
  return renderToStaticMarkup(createElement(GalleryBody, {
    state,
    dispatch: () => undefined,
    client,
    locale: 'en',
    mode: 'production',
    ...extra.defaultWorkbenchId === undefined ? {} : { defaultWorkbenchId: extra.defaultWorkbenchId },
  }))
}
