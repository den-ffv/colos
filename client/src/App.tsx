import './App.css'
import { AuthForm } from './features/auth/AuthForm'
import { getAuthTokens, clearAuthTokens, type AuthTokens } from './features/auth/auth.storage'
import { CrmShell } from './features/crm/CrmShell'
import { useEffect, useState } from 'react'

function App() {
  const [tokens, setTokens] = useState<AuthTokens | null>(() => getAuthTokens())
  const [route, setRoute] = useState<'login' | 'crm'>(() => {
    const h = window.location.hash
    if (h === '#/crm') return 'crm'
    if (h === '#/login') return 'login'
    return tokens ? 'crm' : 'login'
  })

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
    clearAuthTokens()
    setTokens(null)
    window.location.hash = '#/login'
  }

  if (route === 'crm' && tokens) return <CrmShell tokens={tokens} onLogout={onLogout} />
  return <AuthForm onSignedIn={setTokens} onSignedOut={() => setTokens(null)} />
}

export default App
