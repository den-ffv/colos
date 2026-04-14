import { useEffect, useRef, useState } from 'react'
import { ArrowDown01Icon } from 'hugeicons-react'
import './custom-select.css'

export type SelectOption = {
  value: string
  label: string
  /** Secondary line shown below the label */
  sublabel?: string
  /** Amber badge shown on the right */
  badge?: string
  /** If true — option row gets a warning tint */
  warn?: boolean
  disabled?: boolean
}

type Props = {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  warn?: boolean          // amber border when current value is a busy resource
}

export function CustomSelect({ value, onChange, options, placeholder = '— обрати —', className, warn }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value) ?? null

  /* close on outside click */
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  /* close on Escape */
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const triggerClass = [
    'csel__trigger',
    open  ? 'csel__trigger--open' : '',
    warn  ? 'csel__trigger--warn' : '',
    className ?? '',
  ].filter(Boolean).join(' ')

  return (
    <div className="csel" ref={rootRef}>
      <button type="button" className={triggerClass} onClick={() => setOpen((v) => !v)}>
        <span className={selected ? 'csel__val' : 'csel__placeholder'}>
          {selected ? selected.label : placeholder}
        </span>
        {selected?.badge && <span className="csel__triggerBadge">{selected.badge}</span>}
        <ArrowDown01Icon
          size={14}
          strokeWidth={2}
          className={`csel__arrow${open ? ' csel__arrow--up' : ''}`}
        />
      </button>

      {open && (
        <div className="csel__dropdown">
          {options.map((opt) => {
            const active = opt.value === value
            const cls = [
              'csel__option',
              active   ? 'csel__option--active'   : '',
              opt.warn ? 'csel__option--warn'      : '',
              opt.disabled ? 'csel__option--disabled' : '',
            ].filter(Boolean).join(' ')

            return (
              <button
                key={opt.value}
                type="button"
                className={cls}
                disabled={opt.disabled}
                onMouseDown={() => { onChange(opt.value); setOpen(false) }}
              >
                <span className="csel__optBody">
                  <span className="csel__optLabel">{opt.label}</span>
                  {opt.sublabel && <span className="csel__optSub">{opt.sublabel}</span>}
                </span>
                {opt.badge && <span className="csel__optBadge">{opt.badge}</span>}
                {active && <span className="csel__check">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
