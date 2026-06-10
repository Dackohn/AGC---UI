import { create } from 'zustand'

const TOKEN_KEY = 'agc.authToken'

function loadToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

interface AuthStore {
  token: string | null
  isAuthenticated: boolean
  setToken: (token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>(() => ({
  token: loadToken(),
  isAuthenticated: !!loadToken(),
  setToken: (token) => {
    try {
      sessionStorage.setItem(TOKEN_KEY, token)
    } catch {}
    useAuthStore.setState({ token, isAuthenticated: true })
  },
  logout: () => {
    try {
      sessionStorage.removeItem(TOKEN_KEY)
    } catch {}
    useAuthStore.setState({ token: null, isAuthenticated: false })
  },
}))
