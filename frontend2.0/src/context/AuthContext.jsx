import { createContext, useContext, useEffect, useState } from 'react'
import { getCurrentUser, loginUser, logoutUser } from '../services/authService'

const AuthContext = createContext(null)

const TOKEN_KEY = 'airiq_token'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(null)
  const [isLoadingAuth, setIsLoadingAuth] = useState(!!localStorage.getItem(TOKEN_KEY))

  const refreshUser = async (activeToken = token) => {
    if (!activeToken) {
      setUser(null)
      return null
    }
    const userData = await getCurrentUser(activeToken)
    setUser(userData)
    return userData
  }

  useEffect(() => {
    if (!token) {
      setUser(null)
      setIsLoadingAuth(false)
      return undefined
    }

    let cancelled = false
    setIsLoadingAuth(true)

    refreshUser(token)
      .then((userData) => {
        if (!cancelled) setUser(userData)
      })
      .catch(() => {
        if (!cancelled) {
          localStorage.removeItem(TOKEN_KEY)
          setToken(null)
          setUser(null)
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAuth(false)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!token) return undefined

    const handleWindowFocus = () => {
      refreshUser(token).catch(() => {})
    }

    window.addEventListener('focus', handleWindowFocus)
    return () => {
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [token])

  const login = async (email, password) => {
    const { access_token } = await loginUser(email, password)
    localStorage.setItem(TOKEN_KEY, access_token)
    setToken(access_token)
  }

  const logout = async () => {
    if (token) {
      await logoutUser(token).catch(() => {})
    }
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }

  const updateUser = (updatedUser) => {
    setUser(updatedUser)
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoadingAuth, login, logout, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
