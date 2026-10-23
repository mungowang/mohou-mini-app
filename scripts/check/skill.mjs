#!/usr/bin/env node
/**
 * Skill gate: keep skills/mohou-mini-app honest against this repo.
 *
 * Inputs: skills/mohou-mini-app/**, packages/host/src/tools/author.ts,
 *         packages/app/contract/src/context.ts, packages/app/ui/catalog-families.json
 * Writes: nothing
 * Side effects: none — exit 1 means the tree drifted
 * Run as: pnpm check:skill
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { loadFamilies } from "../gen/skill/families.mjs"
import { templateDrift } from "../gen/skill/templates.mjs"
import { readShellVersion, readSkillVersion } from "../sync/skill-into-shell.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const skillDir = path.join(root, "skills/mohou-mini-app")
const contractsDir = path.join(skillDir, "references/contracts")
const catalogPath = path.join(skillDir, "references/catalog.md")
const skillMd = path.join(skillDir, "SKILL.md")
const ctxMd = path.join(skillDir, "references/guide/ctx.md")

const errors = []
const fail = (rule, file, detail) => errors.push({ rule, file: path.relative(root, file), detail })

function walk(dir, filter) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) out.push(...walk(full, filter))
    else if (filter(full)) out.push(full)
  }
  return out
}

const mdFiles = walk(skillDir, (f) => f.endsWith(".md"))
const sourceFiles = walk(skillDir, (f) => /\.(ts|tsx)$/.test(f))
const allFiles = [...mdFiles, ...sourceFiles]
const skillText = fs.readFileSync(skillMd, "utf8")
const ctxText = fs.readFileSync(ctxMd, "utf8")

const banned = [
  "@monkey-mini-app/sdk",
  "@mini-app/",
  "@monkeyagent/",
  "defineDashboard",
  "history_revert",
  "ctx.storage.table(",
  "ctx.storage.get(",
  "ctx.storage.set(",
  "storage: { get",
  "ctx.mcp(name, args",
  "mini_app_write",
  "mini_app_edit",
  "mini_app_delete",
]
for (const file of allFiles) {
  const text = fs.readFileSync(file, "utf8")
  for (const [i, line] of text.split("\n").entries()) {
    for (const item of banned) {
      if (item === "@monkey-mini-app/sdk" && line.includes("`@monkey-mini-app/*`")) continue
      if (item === "@mini-app/" && line.includes("`@mini-app/*`")) continue
      if (line.includes(item)) fail("banned", file, `line ${i + 1}: ${item}`)
    }
  }
}

const authorSrc = fs.readFileSync(path.join(root, "packages/host/src/tools/author.ts"), "utf8")
const byteTools = new Set(["mini_app_write", "mini_app_edit", "mini_app_delete"])
const tools = [...authorSrc.matchAll(/'(mini_app_[a-z_]+)'/g)].map((m) => m[1])
const uniqueTools = [...new Set(tools)]
const mcpTools = uniqueTools.filter((name) => !byteTools.has(name))
if (mcpTools.length < 10) fail("tool-catalog", path.join(root, "packages/host/src/tools/author.ts"), "too few MCP tool names")
const historyText = fs.readFileSync(path.join(skillDir, "references/guide/history.md"), "utf8")
for (const name of mcpTools) {
  if (!skillText.includes(name) && !historyText.includes(name)) {
    fail("tool-missing", skillMd, name)
  }
}
for (const m of skillText.matchAll(/mini_app_[a-z_]+/g)) {
  if (byteTools.has(m[0])) continue
  if (!uniqueTools.includes(m[0]) && m[0] !== "mini_app_") {
    fail("tool-invented", skillMd, m[0])
  }
}

const shellVersion = readShellVersion()
const skillVersion = readSkillVersion()
if (skillVersion !== shellVersion) {
  fail("skill-shell-version", skillMd, `skill ${skillVersion} must equal shell ${shellVersion} — run pnpm sync:skill`)
}

const contextSrc = fs.readFileSync(path.join(root, "packages/app/contract/src/context.ts"), "utf8")
const members = [
  "appId",
  "appDir",
  "storage",
  "state",
  "credentials",
  "config",
  "log",
  "signal",
  "push",
  "http",
  "bash",
  "pwsh",
  "system",
  "llm",
  "agent",
  "mcp",
  "mcpServers",
]
for (const name of members) {
  if (!contextSrc.includes(`${name}`) || !ctxText.includes(`ctx.${name}`) && name !== "system") {
    if (!ctxText.includes(`ctx.${name}`) && name !== "system" && name !== "log") {
      fail("ctx-missing", ctxMd, name)
    }
  }
}
if (!ctxText.includes("ctx.system.metrics") && !ctxText.includes("system.metrics")) {
  fail("ctx-missing", ctxMd, "system.metrics")
}

if (!fs.existsSync(catalogPath)) fail("catalog", catalogPath, "missing — run pnpm gen:skill")
else {
  const catalog = fs.readFileSync(catalogPath, "utf8")
  const linked = [...catalog.matchAll(/contracts\/([\w-]+)\.md/g)].map((m) => m[1])
  const files = fs.existsSync(contractsDir)
    ? fs.readdirSync(contractsDir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""))
    : []
  for (const slug of linked) {
    if (!files.includes(slug)) fail("catalog-dead", catalogPath, slug)
  }
  for (const slug of files) {
    if (!linked.includes(slug)) fail("catalog-orphan", path.join(contractsDir, `${slug}.md`), "not linked from catalog.md")
  }
  const { families } = loadFamilies(path.join(root, "packages/app/ui/catalog-families.json"))
  const sections = [...catalog.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim())
  for (const family of families.map((f) => f.name)) {
    if (!sections.includes(family) && catalog.includes(family) === false) {
      // family with zero components is allowed to be absent
    }
  }
}

if (!/^---\n(?:.*\n)*version: \d+\.\d+\.\d+\n(?:.*\n)*---/m.test(skillText)) {
  fail("skill-version", skillMd, "frontmatter must include version: x.y.z")
}
if (!skillText.includes("@mohou/ui") || !skillText.includes("@mohou/contract")) {
  fail("author-specifier", skillMd, "must name @mohou/ui and @mohou/contract")
}
if (!ctxText.includes("ctx.mcp(serverId, toolName")) {
  fail("mcp-shape", ctxMd, "must document ctx.mcp(serverId, toolName, args?)")
}
if (!ctxText.includes("kv()")) {
  fail("storage-shape", ctxMd, "must document ctx.storage.kv()")
}
for (const detail of templateDrift(root)) {
  fail("template-drift", skillDir, `${detail} — run pnpm gen:skill`)
}

if (errors.length) {
  for (const e of errors) console.error(`${e.rule}  ${e.file}  ${e.detail}`)
  process.exit(1)
}
console.log(`check:skill ok (${mcpTools.length} MCP tools, ${members.length} ctx members, skill=shell ${shellVersion})`)
