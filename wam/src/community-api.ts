import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@tutorial/shared'

const key = 'geunal.session'
export function savedToken() {
  try {
    return sessionStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}
export function saveToken(token: string) {
  try {
    if (token) sessionStorage.setItem(key, token)
    else sessionStorage.removeItem(key)
  } catch {
    /* Session remains in memory when storage is unavailable. */
  }
}
let currentToken = savedToken()
export function setToken(token: string) {
  currentToken = token
  saveToken(token)
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown
): Promise<T> {
  const response = await fetch(`/api/community${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  let value: unknown
  try {
    value = await response.json()
  } catch {
    throw new Error('서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.')
  }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('session-expired'))
    throw new ApiError((value as { error: string }).error, response.status)
  }
  return value as T
}
export function useResource<T>(path: string | null, interval = 0) {
  const [result, setResult] = useState<{ path: string; value: T } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const generation = useRef(0)
  const reload = useCallback(async () => {
    if (!path) return
    const ticket = ++generation.current
    setLoading(true)
    try {
      const value = await api<T>(path)
      if (ticket === generation.current) {
        setResult({ path, value })
        setError('')
      }
    } catch (e) {
      if (ticket === generation.current) setError((e as Error).message)
    } finally {
      if (ticket === generation.current) setLoading(false)
    }
  }, [path])
  const invalidate = useCallback(() => {
    generation.current++
  }, [])
  useEffect(() => {
    setResult(null)
    setError('')
    void reload()
    const timer = interval
      ? window.setInterval(() => {
          if (!document.hidden) void reload()
        }, interval)
      : undefined
    return () => {
      invalidate()
      clearInterval(timer)
    }
  }, [reload, interval, invalidate])
  return {
    data: result?.path === path ? result.value : null,
    error,
    loading,
    reload,
  }
}
export type Session = { token: string; user: User }
