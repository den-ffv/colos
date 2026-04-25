import { useCallback, useEffect, useRef, useState } from 'react'

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ?? ''

const DEBOUNCE_MS = 300
const MIN_QUERY = 3

type Suggestion = {
  id: string
  place_name: string
  center: [number, number]
}

export type AddressSelection = {
  text: string
  coords: [number, number] | null
}

type Props = {
  value: string
  onChange: (value: string) => void
  /** Called when user picks a suggestion (with coords) or types freely (coords=null) */
  onSelect?: (sel: AddressSelection) => void
  placeholder?: string
  className?: string
}

export function AddressAutocomplete({ value, onChange, onSelect, placeholder, className }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  /* ── fetch suggestions ─────────────────────────────── */

  const fetchSuggestions = useCallback(async (q: string) => {
    if (!MAPBOX_TOKEN || q.length < MIN_QUERY) {
      setSuggestions([])
      return
    }
    try {
      const encoded = encodeURIComponent(q)
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${MAPBOX_TOKEN}&limit=5&language=uk&types=address,place,locality,neighborhood,poi`
      const res = await fetch(url)
      if (!res.ok) return
      const data = await res.json()
      const features: Suggestion[] = (data.features ?? []).map((f: { id: string; place_name: string; center: [number, number] }) => ({
        id: f.id,
        place_name: f.place_name,
        center: f.center,
      }))
      setSuggestions(features)
      setOpen(features.length > 0)
      setActiveIdx(-1)
    } catch {
      /* ignore */
    }
  }, [])

  /* ── debounced input ───────────────────────────────── */

  const handleInput = useCallback(
    (text: string) => {
      onChange(text)
      onSelect?.({ text, coords: null })
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => fetchSuggestions(text), DEBOUNCE_MS)
    },
    [onChange, onSelect, fetchSuggestions],
  )

  /* ── select item ───────────────────────────────────── */

  const select = useCallback(
    (s: Suggestion) => {
      onChange(s.place_name)
      onSelect?.({ text: s.place_name, coords: s.center })
      setOpen(false)
      setSuggestions([])
    },
    [onChange, onSelect],
  )

  /* ── keyboard nav ──────────────────────────────────── */

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      select(suggestions[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  /* ── close on outside click ────────────────────────── */

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /* ── cleanup timer ─────────────────────────────────── */

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <div className="addrAuto" ref={wrapRef}>
      <input
        className={className ?? 'ui-input'}
        value={value}
        placeholder={placeholder}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />

      {open && suggestions.length > 0 && (
        <ul className="addrAuto__list">
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              className={`addrAuto__item${i === activeIdx ? ' addrAuto__item--active' : ''}`}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => { e.preventDefault(); select(s) }}
            >
              <svg className="addrAuto__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              <span className="addrAuto__text">{s.place_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
