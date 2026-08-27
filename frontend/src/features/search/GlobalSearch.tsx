import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useGlobalSearch, type GlobalSearchResult } from '../../lib'
import styles from './GlobalSearch.module.css'

/**
 * The app shell's always-visible global search box (never click-to-reveal
 * — a standing constraint of this build). Debounces via `useGlobalSearch`
 * and renders a dropdown of merged/deduplicated/labeled results (Contact
 * vs Organization) below the input, each linking to its detail page.
 *
 * Open/close state is driven entirely by `term` + an explicit
 * click-outside listener — never by the input's blur event, since
 * blur-to-close and click-to-navigate race each other (blur fires before
 * a result's click handler does), which would otherwise make results
 * unclickable via mouse.
 */
export function GlobalSearch() {
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { results, loading, error } = useGlobalSearch(term)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleChange(value: string) {
    setTerm(value)
    setOpen(value.trim() !== '')
  }

  function handleSelect(result: GlobalSearchResult) {
    setTerm('')
    setOpen(false)
    navigate(result.path)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  const trimmed = term.trim()
  const showDropdown = open && trimmed !== ''

  return (
    <div className={styles.container} ref={containerRef}>
      <input
        type="search"
        className={styles.search}
        placeholder="Search contacts, organizations…"
        aria-label="Search"
        value={term}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => {
          if (trimmed !== '') setOpen(true)
        }}
        onKeyDown={handleKeyDown}
      />
      {showDropdown && (
        <div className={styles.dropdown} role="listbox">
          {loading && <div className={styles.statusRow}>Searching…</div>}
          {!loading && error && <div className={styles.statusRow}>{error}</div>}
          {!loading && !error && results.length === 0 && (
            <div className={styles.statusRow}>No results for &ldquo;{trimmed}&rdquo;.</div>
          )}
          {!loading &&
            !error &&
            results.map((result) => (
              <Link
                key={`${result.type}-${result.id}`}
                to={result.path}
                role="option"
                aria-selected={false}
                className={styles.resultRow}
                onClick={() => handleSelect(result)}
              >
                <span className={styles.resultLabel}>{result.label}</span>
                <span className={styles.resultType}>
                  {result.type === 'contact' ? 'Contact' : 'Organization'}
                </span>
                {result.secondary && <span className={styles.resultSecondary}>{result.secondary}</span>}
              </Link>
            ))}
        </div>
      )}
    </div>
  )
}
