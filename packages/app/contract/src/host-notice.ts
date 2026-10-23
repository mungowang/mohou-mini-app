/** What a committed app write did. `renamed` also carries the previous id. */
export type AppChange = 'created' | 'updated' | 'deleted' | 'restored' | 'renamed'

/**
 * Host notices a loaded app can handle.
 * `app:eval` is a query for one view and is not a notice.
 */
export type HostNotice =
  | { type: 'app:open'; appId: string; title?: string }
  | { type: 'app:rename'; from: string; to: string }
  | {
    type: 'app:changed'
    appId: string
    change: AppChange
    /** Previous id. Present when `change` is `renamed`. */
    from?: string
  }
  | { type: 'workbench:default'; appId: string }
  | { type: 'app:reload'; appId: string }
  | { type: 'storage-size'; appId: string; table: string; keys: string[] }
  | { type: 'market:install'; kind: 'app' | 'theme'; id: string }
  | { type: 'market:uninstall'; kind: 'app' | 'theme'; id: string }
