import { useWebsite, WebsiteFrame } from '@mohou/ui'

export default function Ui() {
  // ⭐ key: useWebsite() mirrors the Host website session — phase / generation / url /
  //          error, plus refresh() / retry() / reportContent(). It only exists on kind
  //          "website" apps.
  const site = useWebsite()
  return (
    // ⭐ key: WebsiteFrame is the default chrome — ensuring, connecting, live, refresh
    //          bar, failing with expand detail (process tail). `localService={false}`
    //          picks remote wording while starting; drop the prop when a spawn backs it.
    <WebsiteFrame name="网站示例" localService={false}>
      {/* ⭐ key: children render above the frame chrome — a live strip reading the snapshot. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-2 border-t border-border/60 bg-background/85 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
        <span>
          {site.phase} · gen {site.generation}
        </span>
        <span className="truncate font-mono">{site.url ?? ''}</span>
      </div>
    </WebsiteFrame>
  )
}
