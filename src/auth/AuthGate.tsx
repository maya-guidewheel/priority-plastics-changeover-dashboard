import { useState, useEffect, type ReactNode, type FormEvent } from 'react'
import { isAuthenticated, storeAuth, clearAuth } from '../utils/api'

export default function AuthGate({
  children,
  onLogin,
}: {
  children: ReactNode
  onLogin?: () => void
}) {
  const [authed, setAuthed] = useState(isAuthenticated)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isAuthenticated()) setAuthed(false)
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function handle() {
      setAuthed(false)
    }
    window.addEventListener('auth:expired', handle)
    return () => window.removeEventListener('auth:expired', handle)
  }, [])

  if (authed) return <>{children}</>

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.')
      return
    }
    setChecking(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      if (res.ok) {
        storeAuth(username.trim(), password)
        setAuthed(true)
        onLogin?.()
      } else {
        const data = (await res.json()) as { error?: string }
        if (res.status === 400) {
          setError(data.error ?? 'Please enter both username and password.')
        } else if (res.status === 401) {
          setError(data.error ?? 'Unable to log in. Please try again.')
        } else if (res.status === 429) {
          setError(
            'Too many login attempts. Please wait a few minutes and try again.'
          )
        } else if (res.status >= 500) {
          setError(data.error ?? 'System error. Please try again in a moment.')
        } else {
          setError('Unable to log in. Please try again.')
        }
      }
    } catch {
      setError('Could not connect to the server. Please check your network.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 100%)',
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="pp-card p-8 w-full max-w-sm shadow-xl"
        noValidate
      >
        <div className="mb-7">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-2 h-5 rounded-sm"
              style={{ background: '#f97316' }}
            />
            <span
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: '#9ca3af' }}
            >
              Powered by Guidewheel
            </span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f' }}>
            Priority Plastics
          </h1>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
            Changeover Performance Dashboard
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label
              className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: '#6b7280' }}
            >
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              style={{
                borderColor: '#e5e7eb',
                color: '#111827',
              }}
              autoFocus
              autoComplete="username"
              disabled={checking}
              placeholder="Enter username"
            />
          </div>
          <div>
            <label
              className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: '#6b7280' }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              style={{ borderColor: '#e5e7eb', color: '#111827' }}
              autoComplete="current-password"
              disabled={checking}
              placeholder="Enter password"
            />
          </div>
        </div>

        {error && (
          <p
            className="text-sm mt-3 px-3 py-2 rounded-lg"
            style={{
              background: '#fef2f2',
              color: '#dc2626',
              border: '1px solid #fecaca',
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={checking}
          className="w-full mt-6 text-white rounded-lg px-4 py-2.5 font-semibold transition-opacity hover:opacity-90 text-sm disabled:opacity-60"
          style={{ backgroundColor: '#1e3a5f' }}
        >
          {checking ? 'Signing in…' : 'Sign In'}
        </button>

        <button
          type="button"
          onClick={() => {
            clearAuth()
            setUsername('')
            setPassword('')
            setError('')
          }}
          className="w-full mt-2 text-xs py-1.5 rounded-lg transition-colors hover:bg-gray-50"
          style={{ color: '#9ca3af' }}
        >
          Clear saved session
        </button>
      </form>
    </div>
  )
}
