import React, { useEffect, useRef, type RefObject } from 'react'
import css from './ui.css'

/** Host tokens are read through CSS inheritance; no polling or theme observer. */
export function ensureUIStyle() {
  if (document.getElementById('harness-docket-ui-style')) return
  const sheet = document.createElement('style')
  sheet.id = 'harness-docket-ui-style'; sheet.textContent = css
  document.head.appendChild(sheet)
}

const paths: Record<string, string> = {
  play: 'm9 5 10 7-10 7Z', film: 'M4 3h16v18H4ZM4 8h16M4 16h16M8 3v18M16 3v18',
  person: 'M8 8a4 4 0 1 0 8 0 4 4 0 0 0-8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5', close: 'm6 6 12 12M6 18 18 6',
  check: 'm5 12 4 4L19 6', refresh: 'M3 10a9 9 0 1 1 1 8M3 4v6h6',
  delete: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
  move: 'M12 2v20M2 12h20m-14-6 4-4 4 4m-10 2-4 4 4 4m2 2 4 4 4-4m2-10 4 4-4 4',
  restore: 'M3 10a9 9 0 1 1 2 9M3 4v6h6M12 7v5l3 2',
  cover: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8Z',
  contain: 'M3 5h18v14H3ZM7 8h10v8H7Z', plus: 'M12 5v14M5 12h14',
  chevron: 'm9 5 7 7-7 7', replay: 'M3 10a9 9 0 1 1 1 8M3 4v6h6',
}
export function UIIcon({ kind }: { kind: string }) {
  return <svg className="hdk-icon dba-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind === 'reset' ? 'refresh' : kind === 'trash' ? 'delete' : kind] || paths.person}/></svg>
}

const focusable = 'button, [href], input:not([type=hidden]), select, textarea, summary, [tabindex]'
/** Modal-only focus scope. The conversation remains a non-modal companion panel. */
export function useDialogFocus(ref: RefObject<HTMLElement>, onClose: () => void) {
  const close = useRef(onClose); close.current = onClose
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const before = document.activeElement as HTMLElement | null
    const candidates = () => Array.from(root.querySelectorAll<HTMLElement>(focusable)).filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[hidden], [inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
    root.focus({ preventScroll: true })
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); close.current() }
      if (event.key !== 'Tab') return
      const items = candidates(), first = items[0], last = items.at(-1), active = document.activeElement
      if (!items.length) { event.preventDefault(); root.focus(); return }
      if (event.shiftKey && (active === first || active === root || !root.contains(active))) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (active === last || active === root || !root.contains(active))) { event.preventDefault(); first.focus() }
    }
    const contain = (event: FocusEvent) => { if (!root.contains(event.target as Node)) root.focus({ preventScroll: true }) }
    window.addEventListener('keydown', keyboard, true); document.addEventListener('focusin', contain)
    return () => {
      window.removeEventListener('keydown', keyboard, true); document.removeEventListener('focusin', contain)
      const target = before?.isConnected && before.getClientRects().length ? before : document.querySelector<HTMLElement>('.hda-menu-toggle')
      target?.focus({ preventScroll: true })
    }
  }, [ref])
}

/** Arrow keys activate the same existing tab action as a click. */
export function tabKeys(event: React.KeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]:not(:disabled)'))
  const current = tabs.indexOf(document.activeElement as HTMLButtonElement)
  if (current < 0 || !tabs.length) return
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
  event.preventDefault(); tabs[next].focus(); tabs[next].click()
}

/** One bounded timer per message; warnings, errors and undo actions remain. */
export function useTransientNotice(text: string, clear: () => void, retain = false) {
  const latest = useRef(clear); latest.current = clear
  useEffect(() => {
    if (!text || retain) return
    const timer = window.setTimeout(() => latest.current(), 5000)
    return () => window.clearTimeout(timer)
  }, [text, retain])
}
