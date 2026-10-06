import { readFile, readdir, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { compile } from '@tailwindcss/node'
import { Scanner } from '@tailwindcss/oxide'
import { appEntries } from '@mohou/contract'
import { appCardCss } from '@mohou/app-view/css'

import { readAutogen, sheetFile, sourceStamp, writeAutogen } from './autogen.ts'
import { CompileError } from './codes.ts'
import { themeTokens } from '../theme/tokens.ts'

const require = createRequire(import.meta.url)

/**
 * Compile one app with Tailwind. The Oxide scanner finds candidates. Host does not parse `className`.
 * `@theme` only connects `themeTokens` to Tailwind color names.
 * A matching `.autogen` stamp returns the file and does not keep the text.
 * @param appDir - absolute app directory
 */
export async function compileAppStylesheet(appDir: string): Promise<string> {
  // Tailwind scans the kit and the view as sources, so their files are inputs of this sheet too.
  // A stamp over the app alone would keep an app on a sheet built from an older kit — which is
  // how a card rule fixed in the product never reached an app that had already compiled once.
  const hostStamp = `${await sourceStamp(kitSourceDir())}|${await sourceStamp(viewSourceDir())}`
  const hit = await readAutogen(appDir, sheetFile, hostStamp)
  if (hit !== undefined) return hit
  await newest(appDir)
  const built = await compileSources([appDir])
  const author = await readFile(path.join(appDir, appEntries.stylesheet), 'utf8').catch(() => '')
  const css = author.length === 0 ? `${built}\n${appCardCss}` : `${built}\n${appCardCss}\n${author}`
  await writeAutogen(appDir, sheetFile, css, hostStamp).catch(() => undefined)
  return css
}

/**
 * Compile the panel document. Scans panel source and the UI kit. No author `ui.css`.
 * @param panelDir - panel `src` directory
 */
export async function compilePanelStylesheet(panelDir: string): Promise<string> {
  const built = await compileSources([panelDir], false)
  return `${built}\n${panelLayoutCss}\n${appCardCss}`
}

const panelLayoutCss = [
  'html,body,#root{height:100%;margin:0;overflow:hidden;}',
  '#mma-host, #mma-host .overflow-auto, #mma-host .mma-frame{scrollbar-width:thin;scrollbar-color:color-mix(in oklch,var(--foreground) 28%,transparent) transparent;}',
  '#mma-host::-webkit-scrollbar, #mma-host *::-webkit-scrollbar{-webkit-appearance:none;width:8px;height:8px;}',
  '#mma-host::-webkit-scrollbar-track, #mma-host *::-webkit-scrollbar-track, #mma-host::-webkit-scrollbar-corner, #mma-host *::-webkit-scrollbar-corner{background:transparent;}',
  '#mma-host::-webkit-scrollbar-thumb, #mma-host *::-webkit-scrollbar-thumb{background:color-mix(in oklch,var(--foreground) 28%,transparent);border:2px solid transparent;border-radius:999px;background-clip:padding-box;}',
  '#mma-host{height:100%;min-height:0;overflow:hidden;display:flex;flex-direction:column;}',
  '#mma-host.mma-command{background:radial-gradient(circle at 18% 0%,color-mix(in oklch,var(--foreground) 6%,transparent),transparent 32%),radial-gradient(circle at 100% 100%,color-mix(in oklch,var(--foreground) 5%,transparent),transparent 28%),var(--background);}',
  '#mma-host .mma-chrome{position:relative;z-index:40;height:64px;display:flex;align-items:center;gap:12px;padding:0 24px;border-bottom:1px solid color-mix(in oklch,var(--foreground) 8%,transparent);background:color-mix(in oklch,var(--card) 72%,transparent);backdrop-filter:blur(20px) saturate(160%);}',
  '#mma-host .mma-pill-rail{position:relative;display:flex;min-width:0;gap:8px;overflow-x:auto;padding:4px;border-radius:999px;border:1px solid color-mix(in oklch,var(--foreground) 8%,transparent);background:color-mix(in oklch,var(--foreground) 4%,transparent);scrollbar-width:none;}',
  '#mma-host .mma-pill-rail::-webkit-scrollbar{display:none;height:0;}',
  '#mma-host .mma-pill-glide{position:absolute;top:4px;left:0;height:calc(100% - 8px);border-radius:999px;background:var(--card);box-shadow:0 4px 12px color-mix(in oklch,var(--foreground) 8%,transparent);transition:transform .42s cubic-bezier(.23,1,.32,1),width .42s cubic-bezier(.23,1,.32,1);pointer-events:none;}',
  '#mma-host .mma-pill{position:relative;z-index:1;display:inline-flex;max-width:11rem;shrink:0;align-items:center;gap:6px;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:600;color:var(--muted-foreground);transition:color .22s ease;}',
  '#mma-host .mma-pill[data-active="1"]{color:var(--foreground);}',
  '[data-mode="dark"] #mma-host .mma-pill-glide{background:color-mix(in oklch,var(--foreground) 10%,transparent);box-shadow:inset 0 1px 0 color-mix(in oklch,var(--foreground) 16%,transparent);}',
  '#mma-host .mma-toolbar{display:flex;align-items:center;gap:2px;padding:4px;border-radius:16px;border:1px solid color-mix(in oklch,var(--foreground) 8%,transparent);background:color-mix(in oklch,var(--foreground) 4%,transparent);}',
  '#mma-host .mma-toolbar-rule{width:1px;height:14px;margin:0 4px;flex:none;background:color-mix(in oklch,var(--foreground) 18%,transparent);}',
  '#mma-host .mma-tip{position:relative;display:inline-flex;align-items:center;}',
  '#mma-host .mma-tip-label{position:absolute;top:calc(100% + 6px);left:50%;z-index:60;width:max-content;max-width:16rem;transform:translateX(-50%);padding:5px 8px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--card-foreground,var(--foreground));font-size:12px;font-weight:600;letter-spacing:0;line-height:1.3;text-align:center;text-transform:none;white-space:normal;opacity:0;pointer-events:none;box-shadow:var(--shadow);transition:opacity .12s ease;}',
  '#mma-host .mma-tip[data-align="end"] .mma-tip-label{left:auto;right:0;transform:none;}',
  '#mma-host .mma-tip:hover .mma-tip-label,#mma-host .mma-tip:focus-within .mma-tip-label{opacity:1;}',
  '#mma-host .mma-desk{position:relative;display:flex;max-width:min(28rem,42vw);align-items:center;gap:2px;overflow-x:auto;padding:4px;border-radius:16px;border:1px solid color-mix(in oklch,var(--foreground) 8%,transparent);background:color-mix(in oklch,var(--foreground) 4%,transparent);backdrop-filter:blur(16px) saturate(160%);scrollbar-width:none;}',
  '#mma-host .mma-desk::-webkit-scrollbar{display:none;height:0;}',
  '#mma-host .mma-desk.mma-desk-fit{max-width:none;}',
  '#mma-host .mma-desk-pill{position:absolute;top:4px;left:0;height:calc(100% - 8px);border-radius:12px;background:var(--card);box-shadow:0 8px 18px -10px color-mix(in oklch,var(--foreground) 28%,transparent);transition:transform .42s cubic-bezier(.23,1,.32,1),width .42s cubic-bezier(.23,1,.32,1);pointer-events:none;}',
  '#mma-host .mma-desk-item{position:relative;z-index:1;display:inline-flex;height:32px;max-width:11rem;flex:0 0 auto;align-items:center;gap:6px;overflow:hidden;border-radius:12px;padding:0 12px;font-size:13px;font-weight:600;color:var(--muted-foreground);transition:color .22s ease;}',
  '#mma-host .mma-desk-mark{display:inline-flex;box-sizing:border-box;min-width:18px;height:18px;flex:none;align-items:center;justify-content:center;padding:0 3px;border-radius:4px;background:color-mix(in oklch,var(--foreground) 12%,transparent);font-size:9px;font-weight:700;letter-spacing:0;line-height:1;text-align:center;}',
  '#mma-host .mma-desk-item[data-on="1"] .mma-desk-mark{background:color-mix(in oklch,var(--foreground) 18%,transparent);}',
  '#mma-host .mma-desk-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
  '#mma-host .mma-desk-item[data-on="1"]{color:var(--foreground);}',
  '[data-mode="dark"] #mma-host .mma-desk-pill{background:color-mix(in oklch,var(--foreground) 10%,transparent);box-shadow:inset 0 1px 0 color-mix(in oklch,var(--foreground) 16%,transparent);}',
  '#mma-host .mma-status{display:flex;flex:none;align-items:center;gap:16px;padding:6px 24px;border-bottom:1px solid color-mix(in oklch,var(--foreground) 6%,transparent);font-size:10px;font-weight:600;line-height:1.2;letter-spacing:.12em;text-transform:uppercase;color:color-mix(in oklch,var(--foreground) 55%,transparent);}',
  '#mma-host .mma-status .mma-tip{margin-left:auto;}',
  '#mma-host .mma-status-action{display:inline-flex;align-items:center;gap:6px;padding:2px 4px 2px 8px;border:1px solid transparent;border-radius:999px;color:var(--foreground);font:inherit;font-size:11px;font-weight:600;line-height:1.2;letter-spacing:0;text-transform:none;cursor:pointer;}',
  '#mma-host .mma-status-action:hover{border:1px solid color-mix(in oklch,var(--foreground) 10%,transparent);background:var(--card);}',
  '#mma-host .mma-status-split{width:1px;height:12px;flex:none;background:color-mix(in oklch,var(--foreground) 12%,transparent);}',
  '#mma-host .mma-status-more{color:var(--muted-foreground);}',
  '#mma-host .mma-status-go{display:inline-flex;width:16px;height:16px;flex:none;align-items:center;justify-content:center;border-radius:5px;background:color-mix(in oklch,var(--foreground) 8%,transparent);}',
  '#mma-host .mma-pane{animation:mma-pane-in .42s cubic-bezier(.16,1,.3,1) both;}',
  '@keyframes mma-pane-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}',
  '@media (prefers-reduced-motion:reduce){#mma-host .mma-pane{animation:none}}',
  '#mma-host .mma-dot{width:6px;height:6px;border-radius:50%;color:color-mix(in oklch,oklch(0.55 0.05 150) 62%,var(--muted-foreground));background:currentColor;box-shadow:0 0 6px currentColor;}',
  '#mma-host .mma-dot[data-status="failed"]{color:color-mix(in oklch,oklch(0.62 0.06 78) 58%,var(--muted-foreground));}',
  '#mma-host .mma-dot[data-status="down"]{color:color-mix(in oklch,var(--destructive) 38%,var(--muted-foreground));}',
  '#mma-host .mma-library{container-type:inline-size;padding:32px 32px 40px;}',
  '#mma-host .mma-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));align-items:start;gap:24px;}',
  '#mma-host .mma-grid:has([data-card="glass"]){align-items:stretch;}',
  '#mma-host .mma-grid:has([data-card="glass"])>*{display:flex;height:100%;min-height:100%;min-width:0;flex-direction:column;}',
  '#mma-host .mma-grid:has([data-card="glass"])>* .mma-slot{flex:1;min-height:0;height:100%;}',
  '[data-mode="dark"] #mma-host .mma-chrome{background:color-mix(in oklch,var(--foreground) 4%,transparent);border-color:color-mix(in oklch,var(--foreground) 12%,transparent);}',
  '#mma-host .pointer-events-none iframe{pointer-events:none;}',
  '#mma-host .mma-stage{display:flex;min-height:0;flex:1;}',
  '#mma-host .mma-frame{min-height:0;flex:1;overflow:hidden;}',
  '#mma-host .mma-app-frame{padding:16px;}',
  '#mma-host .mma-app-frame>.mma-frame{border-radius:24px;border:1px solid color-mix(in oklch,var(--foreground) 10%,transparent);background:var(--card);box-shadow:0 20px 40px -18px color-mix(in oklch,var(--foreground) 18%,transparent);}',
  '#mma-host .mma-app-frame>.mma-frame:has(>.mma-library){overflow:auto;background:color-mix(in oklch,var(--card) 36%,transparent);backdrop-filter:blur(18px) saturate(160%);}',
  '[data-mode="dark"] #mma-host .mma-app-frame>.mma-frame:has(>.mma-library){background:color-mix(in oklch,var(--foreground) 5%,transparent);}',
].join('\n')

async function compileSources(dirs: readonly string[], includeKit = true): Promise<string> {
  const compiler = await compile(inputCss(dirs, includeKit), {
    base: hostPackageDir(),
    onDependency() {},
  })
  return compiler.build(new Scanner({ sources: compiler.sources }).scan())
}

function inputCss(dirs: readonly string[], includeKit = true): string {
  const roots = includeKit ? [kitSourceDir(), viewSourceDir(), ...dirs] : [viewSourceDir(), ...dirs]
  const sources = roots.map(dir => `@source ${JSON.stringify(`${dir}/**/*.{tsx,ts,jsx,js}`)};`)
  const colors = themeTokens.flatMap((token) => {
    if (token === 'radius' || token === 'shadow') return []
    return [`  --color-${token}: var(--${token});`]
  })
  return [
    '@import "tailwindcss" source(none);',
    '@import "tw-animate-css";',
    ...sources,
    '@custom-variant dark (&:where([data-mode="dark"], [data-mode="dark"] *));',
    ':root { --primary-svg-color: var(--primary); }',
    '@theme inline {',
    ...colors,
    '  --radius-sm: calc(var(--radius) * 0.6);',
    '  --radius-md: calc(var(--radius) * 0.8);',
    '  --radius-lg: var(--radius);',
    '  --radius-xl: calc(var(--radius) * 1.4);',
    '  --radius-2xl: calc(var(--radius) * 1.8);',
    '  --radius-3xl: calc(var(--radius) * 2.2);',
    '  --radius-4xl: calc(var(--radius) * 2.6);',
    '  --font-sans: ui-sans-serif, system-ui, sans-serif;',
    '}',
    '@layer base {',
    '  * { @apply border-border outline-ring/50; }',
    '  html, body, #root { height: 100%; margin: 0; }',
    '  body { @apply bg-background text-foreground; }',
    '}',
    '',
  ].join('\n')
}

function kitSourceDir(): string {
  return path.dirname(require.resolve('@mohou/ui'))
}

function viewSourceDir(): string {
  return path.dirname(require.resolve('@mohou/app-view'))
}

function hostPackageDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
}

async function newest(appDir: string): Promise<number> {
  const names = await readdir(appDir).catch((error: unknown) => {
    if (isCode(error, 'ENOENT')) throw new CompileError('ui-invalid', 'app stylesheet is missing')
    throw error
  })
  let max = 0
  for (const name of names) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const file = path.join(appDir, name)
    const info = await stat(file).catch(() => undefined)
    if (info === undefined) continue
    if (info.isDirectory()) max = Math.max(max, await newest(file))
    else max = Math.max(max, info.mtimeMs)
  }
  return max
}

function isCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}
