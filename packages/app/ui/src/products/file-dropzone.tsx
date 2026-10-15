
import { useDropzone, type Accept, type FileRejection } from 'react-dropzone'

import { cn } from '@mohou/ui/lib/utils'
import { useLabels } from '@mohou/ui/i18n/context'
import { Attachment, AttachmentContent, AttachmentTitle } from '@mohou/ui/components/attachment'

/**
 * Drag-drop + click file picker (`react-dropzone`).
 * The list only updates when the parent stores `onFiles` into `files`.
 * Custom extensions (e.g. `.caskpack`) go under a MIME key whose value lists the extension —
 * browsers often send an empty type for unknown suffixes.
 * @when Getting a local File into the app (then upload via `ctx.http` in the api layer).
 * @example
 * <FileDropzone
 *   files={files}
 *   accept={{ 'application/json': ['.json'], 'application/octet-stream': ['.caskpack'] }}
 *   onFiles={setFiles}
 * />
 * @family Form
 */
export function FileDropzone({
  files,
  onFiles,
  accept,
  multiple = true,
  disabled = false,
  maxSize,
  maxFiles,
  onReject,
  className,
}: {
  files?: File[]
  onFiles?: (files: File[]) => void
  /**
   * MIME → extensions map for `react-dropzone`.
   * Example: `{ 'application/json': ['.json'], 'application/octet-stream': ['.caskpack'] }`.
   * Omitted = every file type.
   */
  accept?: Accept
  /** Default true. */
  multiple?: boolean
  disabled?: boolean
  /** Bytes. Rejected files go to `onReject`. */
  maxSize?: number
  maxFiles?: number
  onReject?: (rejections: FileRejection[]) => void
  /** Outer shell (list + drop target). */
  className?: string
}) {
  const t = useLabels('fileDropzone')
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted, rejections) => {
      if (rejections.length > 0) onReject?.(rejections)
      if (accepted.length > 0) onFiles?.(accepted)
    },
    ...accept === undefined ? {} : { accept },
    multiple,
    disabled,
    ...maxSize === undefined ? {} : { maxSize },
    ...maxFiles === undefined ? {} : { maxFiles },
  })
  return (
    <div className={cn('flex flex-col gap-2', className)} data-testid="file-dropzone">
      <div
        {...getRootProps()}
        data-drop-active={isDragActive ? '1' : '0'}
        data-drop-disabled={disabled ? '1' : '0'}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground',
          isDragActive && 'border-primary bg-muted/40',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <input {...getInputProps()} />
        {t.drop}
      </div>
      {files?.map(file => (
        <Attachment key={`${file.name}-${file.size}-${file.lastModified}`}>
          <AttachmentContent>
            <AttachmentTitle>{file.name}</AttachmentTitle>
          </AttachmentContent>
        </Attachment>
      ))}
    </div>
  )
}
