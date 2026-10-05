import type { ReactNode } from 'react'

/**
 * One modal. The scrim fades in and the card scales in.
 * Callers pass content only. They do not repeat the motion classes.
 * @param props - close handler, width, and the card body
 */
export function Dialog(props: {
  readonly children: ReactNode
  readonly onClose: () => void
  readonly width?: 'sm' | 'md' | 'wide'
}): ReactNode {
  const width = props.width === 'sm'
    ? 'max-w-sm'
    : props.width === 'md'
      ? 'max-w-2xl'
      : props.width === 'wide' ? 'max-w-4xl' : 'max-w-xl'
  return (
    <div className="fixed inset-0 z-30 flex animate-in items-center justify-center bg-foreground/35 p-4 duration-150 fade-in-0" onClick={props.onClose}>
      <div className={`max-h-[85vh] w-full overflow-auto rounded-2xl border bg-card p-5 shadow-lg animate-in duration-150 fade-in-0 zoom-in-95 ${width}`} onClick={event => event.stopPropagation()}>
        {props.children}
      </div>
    </div>
  )
}
