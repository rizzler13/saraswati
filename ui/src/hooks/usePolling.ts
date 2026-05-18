import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../config'

interface UsePollingResult<T> {
    data: T | null
    isLoading: boolean
    error: Error | null
    refetch: () => void
}

export function usePolling<T>(
    url: string,
    intervalMs: number = 10000
): UsePollingResult<T> {
    const [data, setData] = useState<T | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<Error | null>(null)

    const fullUrl = `${API_BASE_URL}${url}`

    const fetchData = useCallback(async () => {
        try {
            const response = await fetch(fullUrl)
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const json = await response.json()
            setData(json)
            setError(null)
        } catch (e) {
            setError(e instanceof Error ? e : new Error('Unknown error'))
        } finally {
            setIsLoading(false)
        }
    }, [fullUrl])

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, intervalMs)
        return () => clearInterval(interval)
    }, [fetchData, intervalMs])

    return { data, isLoading, error, refetch: fetchData }
}
