const AUTH_KEY = 'pp_auth'

function getToken(): string {
  try {
    const stored = localStorage.getItem(AUTH_KEY)
    if (!stored) return ''
    const parsed = JSON.parse(stored) as { token?: string; exp?: number }
    if (typeof parsed.exp === 'number' && Date.now() >= parsed.exp) {
      localStorage.removeItem(AUTH_KEY)
      return ''
    }
    return parsed.token ?? ''
  } catch {
    return ''
  }
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_KEY)
}

export function storeAuth(username: string, password: string): void {
  localStorage.setItem(
    AUTH_KEY,
    JSON.stringify({
      exp: Date.now() + 12 * 60 * 60 * 1000,
      token: btoa(username + ':' + password),
    })
  )
}

export function isAuthenticated(): boolean {
  const stored = localStorage.getItem(AUTH_KEY)
  if (!stored) return false
  try {
    const { exp, token } = JSON.parse(stored) as {
      exp?: number
      token?: string
    }
    if (typeof exp !== 'number' || Date.now() >= exp || !token) return false
    try {
      if (!atob(token).includes(':')) {
        localStorage.removeItem(AUTH_KEY)
        return false
      }
    } catch {
      localStorage.removeItem(AUTH_KEY)
      return false
    }
    return true
  } catch {
    return false
  }
}

export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getToken()
  const headers = new Headers(options.headers as HeadersInit)
  if (token) headers.set('Authorization', `Basic ${token}`)
  const response = await fetch(url, { ...options, headers })
  if (response.status === 401) {
    clearAuth()
    window.dispatchEvent(new Event('auth:expired'))
  }
  return response
}
