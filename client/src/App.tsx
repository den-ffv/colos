import './App.css'
import { AuthForm } from './features/auth/AuthForm'
import { getAuthTokens, setAuthTokens, clearAuthTokens, type AuthTokens } from './features/auth/auth.storage'
import { CrmShell } from './features/crm/CrmShell'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getApiBaseUrl } from './lib/env'

/** Decode JWT exp field (seconds). Returns null if unparseable. */
function jwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch { return null }
}

/** Silently refresh the access token using the stored refresh token. */
async function silentRefresh(tokens: AuthTokens): Promise<string | null> {
  if (!tokens.refreshToken) return null
  try {
    const res = await fetch(new URL('/api/auth/refresh', getApiBaseUrl()).toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    })
    if (!res.ok) return null
    const data = await res.json() as { data?: { accessToken?: string } }
    return data?.data?.accessToken ?? null
  } catch { return null }
}

function App() {
  const [tokens, setTokensState] = useState<AuthTokens | null>(() => getAuthTokens())
  const [route, setRoute] = useState<'login' | 'crm'>(() => {
    const h = window.location.hash
    if (h === '#/crm') return 'crm'
    if (h === '#/login') return 'login'
    return tokens ? 'crm' : 'login'
  })
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tokensRef = useRef(tokens)

  function updateTokens(t: AuthTokens | null) {
    tokensRef.current = t
    setTokensState(t)
    if (t) setAuthTokens(t)
    else clearAuthTokens()
  }

  /** Schedule a silent refresh 60 s before the access token expires. */
  const scheduleRefresh = useCallback((t: AuthTokens) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    const exp = jwtExp(t.accessToken)
    if (!exp) return
    const msUntilExpiry = exp * 1000 - Date.now()
    const delay = Math.max(msUntilExpiry - 60_000, 0)
    refreshTimerRef.current = setTimeout(async () => {
      const current = tokensRef.current
      if (!current) return
      const newAccess = await silentRefresh(current)
      if (newAccess) {
        const updated = { ...current, accessToken: newAccess }
        updateTokens(updated)
        scheduleRefresh(updated)
      } else {
        // refresh failed → log out
        updateTokens(null)
        window.location.hash = '#/login'
      }
    }, delay)
  }, [])

  useEffect(() => {
    if (tokens) scheduleRefresh(tokens)
    return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onHashChange = () => {
      const h = window.location.hash
      if (h === '#/crm') setRoute('crm')
      else setRoute('login')
    }
    window.addEventListener('hashchange', onHashChange)
    onHashChange()
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    const target = tokens ? '#/crm' : '#/login'
    if (window.location.hash !== target) window.location.hash = target
  }, [tokens])

  function onLogout() {
    updateTokens(null)
    window.location.hash = '#/login'
  }

  function onSignedIn(t: AuthTokens) {
    updateTokens(t)
    scheduleRefresh(t)
  }

  if (route === 'crm' && tokens) return <CrmShell tokens={tokens} onLogout={onLogout} />
  return <AuthForm onSignedIn={onSignedIn} onSignedOut={() => updateTokens(null)} />
}

export default App
