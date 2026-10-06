/** @vitest-environment jsdom */
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'

import type { PanelClient } from '../src/gallery/client.ts'
import { GalleryBody, PanelGallery } from '../src/gallery/view.tsx'
import { galleryState, reduceGallery } from '../src/gallery/state.ts'

const todo = { id: 'com.example.todo', name: 'Todo', description: 'A list', version: '1', acronym: 'TO' }

describe('gallery clicks', () => {
  it('opens and asks to delete', async () => {
    let opened = false
    let removed = false
    const client: PanelClient = {
      list: () => Promise.resolve([todo]),
      open: () => {
        opened = true
        return Promise.resolve()
      },
      deleteApp: () => {
        removed = true
        return Promise.resolve()
      },
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const ready = reduceGallery(galleryState('overlay'), { type: 'listed', apps: [todo] })
    await act(async () => {
      root.render(<GalleryBody state={ready} dispatch={() => undefined} client={client} locale="en" mode="production" />)
    })
    const seen: string[] = []
    const slow: PanelClient = {
      ...client,
      open: () => new Promise(() => undefined),
    }
    await act(async () => {
      root.render(<GalleryBody state={ready} dispatch={(action) => { if (action.type === 'open') seen.push(action.appId) }} client={slow} locale="en" mode="production" />)
    })
    const open = host.querySelector('button[data-app-id="com.example.todo"]')
    await act(async () => {
      if (open instanceof HTMLButtonElement) open.click()
    })
    expect(seen).toEqual([todo.id])
    expect(opened).toBe(false)
    expect(removed).toBe(false)
    const asking = reduceGallery(ready, { type: 'ask-delete', appId: todo.id })
    const failing: PanelClient = {
      ...client,
      open: () => Promise.reject(new Error('no')),
      deleteApp: () => Promise.reject(new Error('no')),
    }
    await act(async () => {
      root.render(<GalleryBody state={asking} dispatch={() => undefined} client={failing} locale="en" mode="production" />)
    })
    const confirm = [...host.querySelectorAll('button')].filter(button => button.textContent === 'Delete').at(-1)
    await act(async () => {
      confirm?.click()
      await Promise.resolve()
    })
    const opener = host.querySelector('button[data-app-id="com.example.todo"]')
    await act(async () => {
      if (opener instanceof HTMLButtonElement) opener.click()
      await Promise.resolve()
    })
    root.unmount()
    host.remove()
  })

  it('reloads the open app and restores trash', async () => {
    let reloaded = false
    let restored = false
    const client: PanelClient = {
      list: () => Promise.resolve([todo]),
      open: () => Promise.resolve(),
      deleteApp: () => Promise.resolve(),
      reload: () => {
        reloaded = true
        return Promise.resolve()
      },
      undeleteApp: () => {
        restored = true
        return Promise.resolve()
      },
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const open = reduceGallery(reduceGallery(galleryState('standalone'), { type: 'listed', apps: [todo] }), { type: 'open', appId: todo.id, title: 'Todo' })
    await act(async () => {
      root.render(<GalleryBody state={open} dispatch={() => undefined} client={client} locale="en" mode="production" />)
    })
    const reload = [...host.querySelectorAll('button')].find(button => button.textContent === 'Reload')
    await act(async () => {
      reload?.click()
      await Promise.resolve()
    })
    expect(reloaded).toBe(true)
    const gallery = reduceGallery(galleryState('standalone'), { type: 'trash', apps: [todo] })
    await act(async () => {
      root.render(<GalleryBody state={gallery} dispatch={() => undefined} client={client} locale="en" mode="production" />)
    })
    await act(async () => {
      host.querySelector('button[data-trash-open]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    const restore = host.querySelector('button[data-restore="com.example.todo"]')
    await act(async () => {
      if (restore instanceof HTMLButtonElement) restore.click()
      await Promise.resolve()
    })
    expect(restored).toBe(true)
    const failing: PanelClient = {
      ...client,
      reload: () => Promise.reject(new Error('missing')),
      undeleteApp: () => Promise.reject(new Error('missing')),
    }
    await act(async () => {
      root.render(<GalleryBody state={open} dispatch={() => undefined} client={failing} locale="en" mode="production" />)
    })
    const reloadAgain = [...host.querySelectorAll('button')].find(button => button.textContent === 'Reload')
    await act(async () => {
      reloadAgain?.click()
      await Promise.resolve()
    })
    await act(async () => {
      root.render(<GalleryBody state={gallery} dispatch={() => undefined} client={failing} locale="en" mode="production" />)
    })
    await act(async () => {
      host.querySelector('button[data-trash-open]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    const restoreAgain = host.querySelector('button[data-restore="com.example.todo"]')
    await act(async () => {
      if (restoreAgain instanceof HTMLButtonElement) restoreAgain.click()
      await Promise.resolve()
    })
    root.unmount()
    host.remove()
  })

  it('closes the overlay panel and leaves the open app mounted', async () => {
    let closed = false
    const client: PanelClient = {
      list: () => Promise.resolve([todo]),
      open: () => Promise.resolve(),
      deleteApp: () => Promise.resolve(),
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <PanelGallery
          client={client}
          locale="en"
          mode="production"
          shell="overlay"
          onClosePanel={() => {
            closed = true
          }}
        />,
      )
    })
    const open = host.querySelector('button[data-app-id="com.example.todo"]')
    await act(async () => {
      if (open instanceof HTMLButtonElement) open.click()
      await Promise.resolve()
    })
    expect(host.querySelector('[data-app-id="com.example.todo"]')).not.toBeNull()
    const close = [...host.querySelectorAll('button')].find(button => button.textContent === 'Close panel')
    await act(async () => {
      close?.click()
    })
    expect(closed).toBe(true)
    expect(host.querySelector('[data-app-id="com.example.todo"]')).not.toBeNull()
    root.unmount()
    host.remove()
  })

  it('keeps an open frame mounted across tab switches', async () => {
    let mounts = 0
    function Keep(props: { appId: string }) {
      useEffect(() => {
        mounts += 1
      }, [])
      return <div data-kept={props.appId} />
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const listed = reduceGallery(galleryState('standalone'), { type: 'listed', apps: [todo] })
    const opened = reduceGallery(listed, { type: 'open', appId: todo.id, title: 'Todo' })
    const props = {
      dispatch: () => undefined,
      client: { list: () => Promise.resolve([todo]), open: () => Promise.resolve(), deleteApp: () => Promise.resolve() },
      locale: 'en' as const,
      mode: 'production' as const,
      frame: (appId: string) => <Keep appId={appId} />,
    }
    await act(async () => {
      root.render(<GalleryBody state={opened} {...props} />)
    })
    expect(mounts).toBe(1)
    await act(async () => {
      root.render(<GalleryBody state={reduceGallery(opened, { type: 'switch', index: 0 })} {...props} />)
    })
    await act(async () => {
      root.render(<GalleryBody state={reduceGallery(opened, { type: 'switch', index: 1 })} {...props} />)
    })
    expect(mounts).toBe(1)
    expect(host.querySelector('[data-kept="com.example.todo"]')).not.toBeNull()
    root.unmount()
    host.remove()
  })

  it('closes the theme menu when the blank scrim is pressed', async () => {
    let closed = 0
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<GalleryBody state={galleryState('standalone')} dispatch={() => undefined} client={{ list: () => Promise.resolve([]), open: () => Promise.resolve(), deleteApp: () => Promise.resolve() }} locale="en" mode="production" themeOpen onToggleTheme={() => { closed += 1 }} theme={<p>Palette</p>} />)
    })
    const scrim = host.querySelector('[data-theme-scrim]')
    await act(async () => {
      scrim?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
    })
    expect(closed).toBe(1)
    root.unmount()
    host.remove()
  })
})
