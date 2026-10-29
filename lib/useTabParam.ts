import { useCallback, useEffect, useState } from 'react'

// Keep a page's active tab in the URL (?tab=…) so a refresh keeps the tab,
// a link can point at a specific tab, and navigating away then back returns
// to the tab you were on. Uses history.replaceState (no extra history entries
// per click); the tab param is already in the URL when you leave the page, so
// the browser Back button restores it on return.
//
// SSR-safe: window is only touched inside effects/callbacks. `fallback` is the
// default tab and is represented as a clean URL with no param.
export function useTabParam<T extends string>(
  allowed: readonly T[],
  fallback: T,
  key = 'tab',
): [T, (t: T) => void] {
  const [tab, setTabState] = useState<T>(fallback)

  // Initialize from the URL once on mount.
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get(key)
    if (v && (allowed as readonly string[]).includes(v)) setTabState(v as T)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setTab = useCallback((t: T) => {
    setTabState(t)
    const params = new URLSearchParams(window.location.search)
    if (t === fallback) params.delete(key)
    else params.set(key, t)
    const qs = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
  }, [fallback, key])

  return [tab, setTab]
}
