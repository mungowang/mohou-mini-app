import type { AppImageInput } from '@mohou/contract'
import { ProviderError } from '@mohou/runtime-provider'

/** Bytes the host already read. A path here means the host skipped its resolve step. */
export function piImages(
  images: readonly AppImageInput[] | undefined,
): Array<{ type: 'image'; data: string; mimeType: string }> | undefined {
  if (images === undefined || images.length === 0) return undefined
  return images.map((image) => {
    const row = image as { data?: string; mimeType?: string }
    if (row.data === undefined || row.mimeType === undefined) {
      throw new ProviderError('image-unsupported', 'images must be resolved before the provider runs')
    }
    return { type: 'image', data: row.data, mimeType: row.mimeType }
  })
}

/** A model with no image input must not receive an image. A missing `input` is text only. */
export function requireImageInput(model: unknown, images: readonly unknown[] | undefined): void {
  if (images === undefined || images.length === 0) return
  const input = modelInput(model)
  if (input?.includes('image') === true) return
  throw new ProviderError('image-unsupported', 'model does not accept images')
}

function modelInput(model: unknown): readonly string[] | undefined {
  if (typeof model !== 'object' || model === null || !('input' in model)) return undefined
  const input = model.input
  return Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string') : undefined
}
