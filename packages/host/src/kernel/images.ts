import { readFile, stat } from 'node:fs/promises'
import { extname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { AppImageData, AppImageInput } from '@mohou/contract'

import { HostError } from './codes.ts'

const imageMimes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

const mimeByExtension: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

/**
 * Turn caller images into bytes. A path is read here so the UI does not have to
 * ship the file through the call. The brain never sees a path.
 */
export async function admitImages(
  images: readonly AppImageInput[] | undefined,
  policy: { maxImages: number; maxImageBytes: number },
): Promise<AppImageData[] | undefined> {
  if (images === undefined || images.length === 0) return undefined
  if (images.length > policy.maxImages) {
    throw new HostError('model-policy', 'images is outside the host policy')
  }
  const resolved: AppImageData[] = []
  for (const image of images) resolved.push(await admitOne(image, policy.maxImageBytes))
  return resolved
}

async function admitOne(image: AppImageInput, maxBytes: number): Promise<AppImageData> {
  const row = imageFields(image)
  if (row.path !== undefined) {
    if (row.path.length === 0 || row.data !== undefined) {
      throw new HostError('model-policy', 'images must be data or a path')
    }
    return readImageFile(row.path, row.mimeType, maxBytes)
  }
  if (row.data === undefined) throw new HostError('model-policy', 'images must be data or a path')
  return admitData(row.mimeType, row.data, maxBytes)
}

/** The call is typed, but a JSON caller can still send both fields or neither. */
function imageFields(image: AppImageInput): { path?: string; data?: string; mimeType?: string } {
  return image
}

function admitData(mimeType: string | undefined, data: string, maxBytes: number): AppImageData {
  const mime = admitMime(mimeType)
  if (data.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw new HostError('model-policy', 'images data is not base64')
  }
  const bytes = Buffer.from(data, 'base64')
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
    throw new HostError('model-policy', 'images is outside the host policy')
  }
  return { mimeType: mime, data }
}

async function readImageFile(input: string, mimeType: string | undefined, maxBytes: number): Promise<AppImageData> {
  const filePath = resolveImagePath(input)
  let info
  try {
    info = await stat(filePath)
  } catch {
    throw new HostError('model-policy', 'images path does not name a file')
  }
  if (!info.isFile() || info.size === 0 || info.size > maxBytes) {
    throw new HostError('model-policy', info.isFile() ? 'images is outside the host policy' : 'images path does not name a file')
  }
  const bytes = await readFile(filePath)
  if (bytes.byteLength > maxBytes) throw new HostError('model-policy', 'images is outside the host policy')
  return { mimeType: admitMime(mimeType ?? mimeFromPath(filePath)), data: bytes.toString('base64') }
}

function resolveImagePath(input: string): string {
  if (input.startsWith('http:') || input.startsWith('https:')) {
    throw new HostError('model-policy', 'images path must be an absolute path or a file URI')
  }
  if (input.startsWith('file:')) {
    try {
      const resolved = fileURLToPath(input)
      if (!isAbsolute(resolved)) throw new Error('relative')
      return resolved
    } catch (error) {
      if (error instanceof HostError) throw error
      throw new HostError('model-policy', 'images path is not a file URI')
    }
  }
  if (!isAbsolute(input)) {
    throw new HostError('model-policy', 'images path must be an absolute path or a file URI')
  }
  return input
}

function mimeFromPath(filePath: string): string | undefined {
  return mimeByExtension[extname(filePath).toLowerCase()]
}

function admitMime(mimeType: string | undefined): string {
  const mime = mimeType?.split(';')[0]?.trim().toLowerCase()
  if (mime === undefined || !imageMimes.has(mime)) {
    throw new HostError('model-policy', 'images mimeType is outside the host policy')
  }
  return mime
}
