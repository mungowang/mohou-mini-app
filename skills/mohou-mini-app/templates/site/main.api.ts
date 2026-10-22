import { defineApp } from '@mohou/contract'

export default defineApp({
  name: '网站示例',
  description: '嵌入网页：website kind + WebsiteFrame + driver 钩子',
  api: {
    // ⭐ key: a website is still a full app. Plain api methods work beside the embedded
    //          page, and `ctx.spawn` here is tagged `app` (killed on reload). Only the
    //          website.* hooks below get the `website` tag.
    status() {
      return { kind: 'website', note: 'api works beside the embedded page' }
    },
  },
  website: {
    // ⭐ key: ensure runs when the view session starts (tab open). A pure remote URL
    //          needs no process — return nothing and the manifest url stands.
    //          Local service instead:
    //            const child = await ctx.spawn('pi-web', ['--no-open', '--port', '30141'])
    //            await child.ready({ url: 'http://127.0.0.1:30141' })
    //            return { url: 'http://127.0.0.1:30141' }
    //          On failure, `child.output()` is a bounded stdout/stderr tail for analysis;
    //          Host also puts it on the failing snapshot's error.detail.
    async ensure() {
      // keep manifest.url
    },
    // ⭐ key: refresh runs on panel reload while the view stays. Website-tagged spawns
    //          are NOT killed here — when the process must restart, `kill()` it yourself
    //          and spawn again inside this hook.
    refresh(_ctx, current) {
      return { url: current.url }
    },
    // ⭐ key: dispose runs when the view session ends (last tab closed). Host kills every
    //          remaining spawn afterwards anyway — release non-spawn resources here only.
    dispose() {
      // nothing to release for a remote URL
    },
    content: {
      // ⭐ key: content hooks are the content plane (path C). They report frame moments;
      //          they do not replace ensure and cannot change the url.
      onLoad(ctx, info) {
        ctx.log('site load', info.url, info.generation)
      },      onLoadFailed(ctx, info) {
        ctx.log('site load failed', info.url, info.reason)
      },
      onDocumentIdle(ctx, info) {
        ctx.log('site idle', info.url, info.generation)
      },
    },
  },
})
