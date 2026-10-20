import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type * as ts from 'typescript'

import { appEntries, appTrees, type DefinitionCode } from '@mohou/contract'

import { snapshotSkip } from '../files/skip.ts'
import type { CompileCode } from './codes.ts'
import { importDecision, sideOf } from './imports.ts'

/** A finding that does not fail reload. Callers match `code`. */
export const reviewNoticeCodes = [
  'keyframe-duplicate',
  'keyframe-collision',
  'identifier-skipped',
] as const

export type ReviewNoticeCode = (typeof reviewNoticeCodes)[number]

export interface ReviewNotice {
  readonly code: ReviewNoticeCode
  readonly message: string
  readonly path?: string
  readonly name?: string
}

export interface ReviewError {
  readonly code: CompileCode | DefinitionCode
  readonly message: string
}

export interface AppReview {
  readonly errors: ReviewError[]
  readonly notices: ReviewNotice[]
}

type Ts = typeof import('typescript')

interface ReviewOptions {
  readonly reservedKeyframes?: readonly string[]
  readonly loadParser?: () => Promise<Ts | undefined>
}

/**
 * Keyframe collisions are notices. UI outside `ui.tsx` / `ui/**`, an unbound component,
 * or a one-edit typo of a declared name fails that side. Other free names are not a list
 * this module owns. A missing parser is a notice and does not fail reload.
 * @param appDir - absolute app directory
 */
export async function reviewApp(appDir: string, options: ReviewOptions = {}): Promise<AppReview> {
  const notices = keyframeNotices(appDir, new Set(options.reservedKeyframes ?? []))
  const parser = await loadParser(options.loadParser)
  const errors: ReviewError[] = uiPlacementErrors(appDir, parser)
  if (parser === undefined) {
    notices.push({
      code: 'identifier-skipped',
      message: 'identifier pass skipped: parser did not load',
    })
    return { errors, notices }
  }
  const events = { push: new Map<string, string>(), on: new Map<string, string>() }
  for (const file of sourceFiles(appDir)) {
    const rel = relative(appDir, file)
    try {
      reviewFile(parser, rel, readFileSync(file, 'utf8'), errors, events)
    } catch (error) {
      errors.push({
        code: codeFor(rel),
        message: error instanceof Error ? error.message : `could not parse ${rel}`,
      })
    }
  }
  for (const [name, pushPath] of events.push) {
    const onPath = events.on.get(name)
    if (onPath === undefined) continue
    errors.push({
      code: 'event-undeclared',
      message: `event ${name} is used in ${pushPath} and ${onPath}; declare it once in ${appTrees.shared}/`,
    })
  }
  return { errors, notices }
}

async function loadParser(injected: ReviewOptions['loadParser']): Promise<Ts | undefined> {
  try {
    if (injected !== undefined) return await injected()
    return await import('typescript')
  } catch {
    return undefined
  }
}

const sharedForbidden = new Set([
  'ctx',
  'React',
  'document',
  'window',
  'navigator',
  'localStorage',
  'sessionStorage',
  'process',
  'Buffer',
  'require',
])

function reviewFile(
  parser: Ts,
  rel: string,
  text: string,
  errors: ReviewError[],
  events: { push: Map<string, string>; on: Map<string, string> },
): void {
  const source = parser.createSourceFile(rel, text, parser.ScriptTarget.Latest, true, scriptKind(parser, rel))
  const declared = declaredNames(parser, source)
  const shared = rel.startsWith(`${appTrees.shared}/`)
  const visit = (node: ts.Node): void => {
    if (shared && isJsx(parser, node)) {
      errors.push({ code: 'shared-invalid', message: `${rel} cannot contain JSX` })
    }
    if (shared && parser.isIdentifier(node) && sharedForbidden.has(node.text) && !isPropertyName(parser, node)) {
      errors.push({ code: 'shared-invalid', message: `${rel} cannot use ${node.text}` })
    }
    const specifier = importedSpecifier(parser, node)
    if (specifier !== undefined) {
      const decision = importDecision(sideOf(rel), specifier, rel)
      if (decision !== 'allow' && decision !== 'install' && decision !== 'builtin') errors.push(decision)
    }
    const unbound = unboundName(parser, node, declared)
    if (unbound !== undefined) {
      errors.push({ code: codeFor(rel), message: `${rel} uses ${unbound}, which is not declared` })
    }
    const pushed = pushLiteral(parser, node)
    if (pushed !== undefined && sideOf(rel) === 'backend' && !events.push.has(pushed)) events.push.set(pushed, rel)
    const listened = onLiteral(parser, node)
    if (listened !== undefined && sideOf(rel) === 'ui' && !events.on.has(listened)) events.on.set(listened, rel)
    parser.forEachChild(node, visit)
  }
  visit(source)
}

function pushLiteral(parser: Ts, node: ts.Node): string | undefined {
  if (!parser.isCallExpression(node) || !parser.isPropertyAccessExpression(node.expression)) return undefined
  if (node.expression.name.text !== 'push') return undefined
  if (!parser.isIdentifier(node.expression.expression) || node.expression.expression.text !== 'ctx') return undefined
  return stringArg(parser, node)
}

function onLiteral(parser: Ts, node: ts.Node): string | undefined {
  if (!parser.isCallExpression(node) || !parser.isPropertyAccessExpression(node.expression)) return undefined
  if (node.expression.name.text !== 'on') return undefined
  const target = node.expression.expression
  if (!parser.isCallExpression(target) || !parser.isIdentifier(target.expression) || target.expression.text !== 'useApp') {
    return undefined
  }
  const name = stringArg(parser, node)
  return name === undefined || name === '*' ? undefined : name
}

function stringArg(parser: Ts, node: ts.CallExpression): string | undefined {
  const arg = node.arguments[0]
  if (arg === undefined || !parser.isStringLiteral(arg) || arg.text.length === 0) return undefined
  return arg.text
}

function declaredNames(parser: Ts, source: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (parser.isImportDeclaration(node) && node.importClause?.phaseModifier !== parser.SyntaxKind.TypeKeyword) {
      addImport(parser, node.importClause, names)
    }
    if ((parser.isFunctionDeclaration(node) || parser.isClassDeclaration(node)) && node.name !== undefined) {
      names.add(node.name.text)
    }
    if (parser.isVariableDeclaration(node) && parser.isIdentifier(node.name)) names.add(node.name.text)
    if (parser.isParameter(node) && parser.isIdentifier(node.name)) names.add(node.name.text)
    if (parser.isBindingElement(node) && parser.isIdentifier(node.name)) names.add(node.name.text)
    if (parser.isCatchClause(node) && node.variableDeclaration !== undefined && parser.isIdentifier(node.variableDeclaration.name)) {
      names.add(node.variableDeclaration.name.text)
    }
    parser.forEachChild(node, visit)
  }
  visit(source)
  return names
}

function addImport(parser: Ts, clause: ts.ImportClause | undefined, names: Set<string>): void {
  if (clause === undefined) return
  if (clause.name !== undefined) names.add(clause.name.text)
  const bindings = clause.namedBindings
  if (bindings === undefined) return
  if (parser.isNamespaceImport(bindings)) {
    names.add(bindings.name.text)
    return
  }
  for (const specifier of bindings.elements) {
    if (!specifier.isTypeOnly) names.add(specifier.name.text)
  }
}

function isJsx(parser: Ts, node: ts.Node): boolean {
  return parser.isJsxElement(node)
    || parser.isJsxSelfClosingElement(node)
    || parser.isJsxFragment(node)
}

function isPropertyName(parser: Ts, node: ts.Node): boolean {
  const parent = node.parent
  return (parser.isPropertyAccessExpression(parent) || parser.isPropertyAssignment(parent)) && parent.name === node
}

function importedSpecifier(parser: Ts, node: ts.Node): string | undefined {
  if (parser.isImportDeclaration(node) || parser.isExportDeclaration(node)) {
    const specifier = node.moduleSpecifier
    if (specifier !== undefined && parser.isStringLiteral(specifier)) return specifier.text
  }
  if (parser.isCallExpression(node) && node.expression.kind === parser.SyntaxKind.ImportKeyword) {
    const arg = node.arguments[0]
    if (arg !== undefined && parser.isStringLiteral(arg)) return arg.text
  }
  return undefined
}

function unboundName(parser: Ts, node: ts.Node, declared: Set<string>): string | undefined {
  if (parser.isJsxOpeningElement(node) || parser.isJsxSelfClosingElement(node)) {
    const name = jsxRoot(parser, node.tagName)
    if (name !== undefined && !declared.has(name)) return name
  }
  if (!parser.isCallExpression(node) || !parser.isIdentifier(node.expression)) return undefined
  const name = node.expression.text
  if (declared.has(name) || near(name, declared) === undefined) return undefined
  return name
}

function jsxRoot(parser: Ts, tag: ts.JsxTagNameExpression): string | undefined {
  if (parser.isIdentifier(tag) && /^[A-Z]/.test(tag.text)) return tag.text
  if (parser.isPropertyAccessExpression(tag) && parser.isIdentifier(tag.expression)) return tag.expression.text
  return undefined
}

function near(name: string, declared: Set<string>): string | undefined {
  for (const known of declared) {
    if (oneEdit(name, known)) return known
  }
  return undefined
}

function oneEdit(left: string, right: string): boolean {
  if (left === right || Math.abs(left.length - right.length) > 1) return false
  let edits = 0
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1
      j += 1
      continue
    }
    edits += 1
    if (edits > 1) return false
    if (left.length > right.length) i += 1
    else if (right.length > left.length) j += 1
    else {
      i += 1
      j += 1
    }
  }
  return edits + (left.length - i) + (right.length - j) === 1
}

function keyframeNotices(appDir: string, reserved: Set<string>): ReviewNotice[] {
  const seen = new Map<string, string>()
  const notices: ReviewNotice[] = []
  for (const file of textFiles(appDir)) {
    const rel = relative(appDir, file)
    for (const match of readFileSync(file, 'utf8').matchAll(/@keyframes\s+([A-Za-z_][\w-]*)/g)) {
      const name = match[1] ?? ''
      if (name.length === 0) continue
      const first = seen.get(name)
      if (first !== undefined) {
        notices.push({
          code: 'keyframe-duplicate',
          message: `@keyframes ${name} is declared in ${first} and ${rel}`,
          path: rel,
          name,
        })
      } else {
        seen.set(name, rel)
      }
      if (reserved.has(name)) {
        notices.push({
          code: 'keyframe-collision',
          message: `@keyframes ${name} is reserved`,
          path: rel,
          name,
        })
      }
    }
  }
  return notices
}

/**
 * UI modules are `ui.tsx` and `ui/**` only. A React/JSX file elsewhere is still
 * classified as backend (or shared); fail before the author chases a side allowlist error.
 */
function uiPlacementErrors(appDir: string, parser: Ts | undefined): ReviewError[] {
  const errors: ReviewError[] = []
  for (const file of textFiles(appDir)) {
    if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue
    const rel = relative(appDir, file)
    if (isUiPath(rel)) continue
    if (rel.startsWith(`${appTrees.shared}/`)) continue
    if (rel.startsWith(`${appTrees.schema}/`) || rel.startsWith(`${appTrees.assets}/`)) continue
    const text = readFileSync(file, 'utf8')
    if (!looksLikeUiSource(parser, rel, text)) continue
    errors.push({
      code: 'ui-placement',
      message: `${rel} looks like UI; keep UI modules in ${appEntries.ui} or under ${appTrees.ui}/`,
    })
  }
  return errors
}

function isUiPath(rel: string): boolean {
  return rel === appEntries.ui || rel.startsWith(`${appTrees.ui}/`)
}

function looksLikeUiSource(parser: Ts | undefined, rel: string, text: string): boolean {
  if (importsUiModule(text)) return true
  if (parser === undefined) return false
  try {
    const source = parser.createSourceFile(rel, text, parser.ScriptTarget.Latest, true, scriptKind(parser, rel))
    let found = false
    const visit = (node: ts.Node): void => {
      if (found || isJsx(parser, node)) {
        found = true
        return
      }
      parser.forEachChild(node, visit)
    }
    visit(source)
    return found
  } catch {
    return false
  }
}

function importsUiModule(text: string): boolean {
  for (const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    if (isUiModuleSpecifier(match[1] ?? '')) return true
  }
  for (const match of text.matchAll(/import\s+['"]([^'"]+)['"]/g)) {
    if (isUiModuleSpecifier(match[1] ?? '')) return true
  }
  return false
}

function isUiModuleSpecifier(specifier: string): boolean {
  return specifier === 'react'
    || specifier.startsWith('react/')
    || specifier === '@mohou/ui'
    || specifier.startsWith('@mohou/ui/')
    || specifier === 'motion'
    || specifier.startsWith('motion/')
}

function codeFor(rel: string): CompileCode {
  if (rel === appEntries.ui || rel.startsWith(`${appTrees.ui}/`)) return 'ui-invalid'
  if (rel.startsWith(`${appTrees.shared}/`)) return 'shared-invalid'
  return 'backend-invalid'
}

function scriptKind(parser: Ts, rel: string): ts.ScriptKind {
  if (rel.endsWith('.tsx')) return parser.ScriptKind.TSX
  if (rel.endsWith('.jsx')) return parser.ScriptKind.JSX
  if (rel.endsWith('.js')) return parser.ScriptKind.JS
  return parser.ScriptKind.TS
}

function sourceFiles(appDir: string): string[] {
  return textFiles(appDir).filter((file) => {
    const rel = relative(appDir, file)
    return rel === appEntries.ui
      || rel === appEntries.backend
      || rel.startsWith(`${appTrees.ui}/`)
      || rel.startsWith(`${appTrees.api}/`)
      || rel.startsWith(`${appTrees.shared}/`)
  }).filter(file => /\.(ts|tsx|js|jsx)$/.test(file))
}

function textFiles(appDir: string): string[] {
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (snapshotSkip.has(name)) continue
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(css|ts|tsx|js|jsx)$/.test(name)) found.push(full)
    }
  }
  walk(appDir)
  return found
}

function relative(appDir: string, file: string): string {
  return path.relative(appDir, file).split(path.sep).join('/')
}
