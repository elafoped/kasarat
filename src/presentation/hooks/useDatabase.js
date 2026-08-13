import { useState, useEffect, useCallback } from 'react'
import { db } from '../../core/database'

export function useDatabase(store) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await db.getAll(store)
      setData(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [store])

  const add = useCallback(async (item) => {
    try {
      const id = await db.add(store, item)
      await loadData()
      return id
    } catch (e) {
      setError(e.message)
      throw e
    }
  }, [store, loadData])

  const update = useCallback(async (item) => {
    try {
      await db.put(store, item)
      await loadData()
    } catch (e) {
      setError(e.message)
      throw e
    }
  }, [store, loadData])

  const remove = useCallback(async (id) => {
    try {
      await db.delete(store, id)
      await loadData()
    } catch (e) {
      setError(e.message)
      throw e
    }
  }, [store, loadData])

  useEffect(() => {
    loadData()
    const unsubscribe = db.subscribe(store, loadData)
    return () => unsubscribe()
  }, [store, loadData])

  return { data, loading, error, add, update, remove, reload: loadData }
}