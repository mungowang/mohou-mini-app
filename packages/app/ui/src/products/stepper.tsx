
import * as React from 'react';
import { Check } from 'lucide-react';

import { cn } from '@mohou/ui/lib/utils';

export type StepStatus = 'default' | 'active' | 'completed';

export interface StepperProps {
  /** StepperItem elements. */
  children: React.ReactNode
  /** Layout direction. Defaults to "vertical". */
  orientation?: 'vertical' | 'horizontal' | undefined
  className?: string | undefined
}

export interface StepperItemProps {
  /** Step heading text. */
  title: string
  /** Optional description below the title. */
  description?: string | undefined
  /** Override the auto-incremented step number. */
  step?: number | undefined
  /** Visual status of this step. Defaults to "default". */
  status?: StepStatus | undefined
  /** Custom icon to replace the step number circle. */
  icon?: React.ReactNode | undefined
  /** Content rendered below the step header (code blocks, text, etc.). */
  children?: React.ReactNode | undefined
  className?: string | undefined
}

/**
 * One step inside `Stepper` (title, description, status).
 * @family Feedback & status
 * @when As a child of `Stepper` only — status is `default | active | completed` (lowercase).
 */
export function StepperItem({
  title,
  description,
  step,
  status = 'default',
  icon,
  children,
  className,
}: StepperItemProps) {
  const stepNumber = step ?? 1

  return (
    <div
      data-slot="stepper-item"
      data-status={status}
      className={cn('group/step relative', className)}
    >
      <div className="flex gap-3">
        <div className="flex shrink-0 flex-col items-center self-stretch">
          <div
            className={cn(
              'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
              status === 'completed' &&
                'border-primary bg-primary text-primary-foreground',
              status === 'active' &&
                'border-primary bg-primary/10 text-primary',
              status === 'default' &&
                'border-border bg-background text-muted-foreground'
            )}
          >
            {icon ? (
              icon
            ) : status === 'completed' ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              <span className="text-xs">{stepNumber}</span>
            )}
          </div>

          <div
            className={cn(
              'w-px min-h-4 grow',
              status === 'completed'
                ? 'bg-primary'
                : 'bg-border dark:bg-muted-foreground/25',
              'group-last/step:hidden'
            )}
          />
        </div>

        <div className="flex min-w-0 flex-col pb-6 group-last/step:pb-0">
          <h3 className="flex min-h-8 items-center text-sm font-semibold leading-none text-foreground">
            {title}
          </h3>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
          {children ? <div className="mt-2">{children}</div> : null}
        </div>
      </div>
    </div>
  )
}

function VerticalStepper({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string | undefined
}) {
  const items = React.Children.toArray(children).filter(React.isValidElement)

  return (
    <div
      data-testid="stepper"
      data-slot="stepper"
      data-orientation="vertical"
      className={cn('flex flex-col', className)}
    >
      {items.map((child, index) => {
        if (!React.isValidElement<StepperItemProps>(child)) return child
        return React.cloneElement(child, {
          step: child.props.step ?? index + 1,
          key: child.key ?? index,
        })
      })}
    </div>
  )
}

function HorizontalStepper({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string | undefined
}) {
  const items = React.Children.toArray(children).filter(React.isValidElement)

  return (
    <div
      data-testid="stepper"
      data-slot="stepper"
      data-orientation="horizontal"
      className={cn('flex flex-col gap-4', className)}
    >
      <div className="flex items-center">
        {items.map((child, index) => {
          if (!React.isValidElement<StepperItemProps>(child)) return null
          const { status = 'default', icon, step: stepProp } = child.props
          const stepNumber = stepProp ?? index + 1
          const isLast = index === items.length - 1

          return (
            <React.Fragment key={child.key ?? index}>
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                    status === 'completed' &&
                      'border-primary bg-primary text-primary-foreground',
                    status === 'active' &&
                      'border-primary bg-primary/10 text-primary',
                    status === 'default' &&
                      'border-border bg-background text-muted-foreground'
                  )}
                >
                  {icon ? (
                    icon
                  ) : status === 'completed' ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : (
                    <span className="text-xs">{stepNumber}</span>
                  )}
                </div>
                <span
                  className={cn(
                    'max-w-[8rem] text-center text-xs font-medium',
                    status === 'default'
                      ? 'text-muted-foreground'
                      : 'text-foreground'
                  )}
                >
                  {child.props.title}
                </span>
              </div>
              {!isLast ? (
                <div
                  className={cn(
                    'mb-5 h-px flex-1',
                    status === 'completed' ? 'bg-primary' : 'bg-border'
                  )}
                />
              ) : null}
            </React.Fragment>
          )
        })}
      </div>

      {items.map((child, index) => {
        if (!React.isValidElement<StepperItemProps>(child)) return null
        const { status = 'default', description, children: stepChildren } =
          child.props
        if (status !== 'active') return null

        return (
          <div key={child.key ?? index} className="flex flex-col gap-1.5">
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
            {stepChildren ? <div>{stepChildren}</div> : null}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Numbered steps with status; children are `StepperItem`.
 * @family Feedback & status
 * @when Wizard/progress of an ordered process. Time axis → `RunTimeline`.
 * @example
 * <Stepper><StepperItem title="上传" status="pass" /><StepperItem title="校验" status="running" /></Stepper>
 */
export function Stepper({
  children,
  orientation = 'vertical',
  className,
}: StepperProps) {
  if (orientation === 'horizontal') {
    return (
      <HorizontalStepper className={className}>{children}</HorizontalStepper>
    )
  }
  return <VerticalStepper className={className}>{children}</VerticalStepper>
}
