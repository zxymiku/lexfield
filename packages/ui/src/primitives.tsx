import { Dialog } from '@ark-ui/react/dialog'
import { Portal } from '@ark-ui/react/portal'
import { Select, createListCollection } from '@ark-ui/react/select'
import { Slider } from '@ark-ui/react/slider'
import { Switch } from '@ark-ui/react/switch'
import { Toast, Toaster, createToaster } from '@ark-ui/react/toast'
import { Tooltip } from '@ark-ui/react/tooltip'
import type { ReactNode } from 'react'
import { IconChevron, IconClose } from './icons'

/* --------------------------------------------------------------------------
   dialog
   -------------------------------------------------------------------------- */

export interface ArkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
}

export function ArkDialog({ open, onOpenChange, title, description, children }: ArkDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(d) => onOpenChange(d.open)}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.CloseTrigger aria-label="关闭">
              <IconClose width={14} height={14} />
            </Dialog.CloseTrigger>
            <Dialog.Title>{title}</Dialog.Title>
            {description ? <Dialog.Description>{description}</Dialog.Description> : null}
            {children}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}

/* --------------------------------------------------------------------------
   toast - imperative: notify().success('已同步')
   -------------------------------------------------------------------------- */

export const toaster = createToaster({
  placement: 'top-end',
  duration: 3200,
  max: 4,
})

export function notify() {
  return {
    info: (title: string) => toaster.create({ title, type: 'info' as const }),
    success: (title: string) => toaster.create({ title, type: 'success' as const }),
    error: (title: string) => toaster.create({ title, type: 'error' as const }),
  }
}

export function ArkToaster() {
  return (
    <Toaster toaster={toaster}>
      {(toastRecord) => (
        <Toast.Root key={toastRecord.id}>
          <Toast.Title />
          <Toast.Description />
          <Toast.CloseTrigger aria-label="关闭提示">
            <IconClose width={12} height={12} />
          </Toast.CloseTrigger>
        </Toast.Root>
      )}
    </Toaster>
  )
}

/* --------------------------------------------------------------------------
   select
   -------------------------------------------------------------------------- */

export interface ArkSelectOption {
  label: string
  value: string
}

export interface ArkSelectProps {
  label: string
  value: string
  options: ArkSelectOption[]
  onChange: (value: string) => void
}

export function ArkSelect({ label, value, options, onChange }: ArkSelectProps) {
  const collection = createListCollection({ items: options })
  const current = options.find((o) => o.value === value)
  return (
    <div className="ark-field">
      <span className="ark-field__label" id={`sel-${label}`}>
        {label}
      </span>
      <Select.Root
        collection={collection}
        value={[value]}
        onValueChange={(d) => d.value[0] !== undefined && onChange(d.value[0])}
        positioning={{ sameWidth: true }}
      >
        <Select.Trigger
          className="ark-input"
          aria-labelledby={`sel-${label}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            cursor: 'pointer',
          }}
        >
          <span>{current?.label ?? '—'}</span>
          <IconChevron width={14} height={14} style={{ rotate: '90deg', opacity: 0.6 }} />
        </Select.Trigger>
        <Portal>
          <Select.Positioner>
            <Select.Content>
              <Select.List>
                {collection.items.map((item) => (
                  <Select.Item key={item.value} item={item}>
                    <Select.ItemText>{item.label}</Select.ItemText>
                    <Select.ItemIndicator>▸</Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Content>
          </Select.Positioner>
        </Portal>
        <Select.HiddenSelect />
      </Select.Root>
    </div>
  )
}

/* --------------------------------------------------------------------------
   switch / slider rows (settings)
   -------------------------------------------------------------------------- */

export function ArkSwitchRow({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: string
}) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={(d) => onChange(d.checked)}
      style={{ justifyContent: 'space-between', width: '100%', padding: '6px 0' }}
    >
      <span>
        <span className="ark-field__label" style={{ display: 'block' }}>
          {label}
        </span>
        {hint ? <span style={{ fontSize: 12, color: 'var(--ark-muted)' }}>{hint}</span> : null}
      </span>
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
      <Switch.HiddenInput />
    </Switch.Root>
  )
}

export function ArkSliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div className="ark-field" style={{ padding: '6px 0' }}>
      <span className="ark-field__label">{label}</span>
      <Slider.Root
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(d) => onChange(d.value[0] ?? value)}
      >
        <Slider.Control>
          <Slider.Track>
            <Slider.Range />
          </Slider.Track>
          <Slider.Thumb index={0} />
        </Slider.Control>
        <Slider.ValueText>{format ? format(value) : String(value)}</Slider.ValueText>
      </Slider.Root>
    </div>
  )
}

/* --------------------------------------------------------------------------
   tooltip
   -------------------------------------------------------------------------- */

export function ArkTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root openDelay={300} closeDelay={120}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{label}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  )
}
