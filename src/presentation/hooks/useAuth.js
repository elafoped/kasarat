
import { useState, useEffect } from 'react'
import { security } from '../../core/security'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)

  useEffect(() => {
    const initAuth = async () => {
      try {
        const result = await security.init()
        if (result.needsSetup) {
          setNeedsSetup(true)
        } else if (result.authenticated) {
          setUser(result.user)
        }
      } catch (e) {
        console.error('فشل تهيئة الأمان:', e)
      } finally {
        setLoading(false)
      }
    }
    initAuth()
  }, [])

  const login = async (username, password) => {
    const user = await security.login(username, password)
    setUser(user)
    return user
  }

  const logout = async () => {
    await security.logout()
    setUser(null)
  }

  const hasPermission = (permission) => {
    return security.hasPermission(permission)
  }

  return { user, loading, needsSetup, login, logout, hasPermission, isAdmin: security.isAdmin() }
}