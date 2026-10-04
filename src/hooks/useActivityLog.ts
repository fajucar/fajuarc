import { useCallback, useMemo, useRef, useState } from 'react'

export type ActivityStatus = 'info' | 'pending' | 'success' | 'error'

export type ActivityEntry = {
  id: number
  title: string
  detail: string
  status: ActivityStatus
}

type UseActivityLogOptions = {
  maxItems?: number
  formatDetail?: (detail: string) => string
}

export function useActivityLog(options?: UseActivityLogOptions) {
  const maxItems = options?.maxItems ?? 4
  const formatDetail = useMemo(
    () => options?.formatDetail ?? ((detail: string) => detail),
    [options?.formatDetail]
  )
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([])
  const activityIdRef = useRef(1)

  const addActivity = useCallback(
    (title: string, detail: string, status: ActivityStatus = 'info') => {
      const id = activityIdRef.current++

      setActivityLog((current) => [
        {
          id,
          title,
          detail: formatDetail(detail),
          status,
        },
        ...current,
      ].slice(0, maxItems))

      return id
    },
    [formatDetail, maxItems]
  )

  const updateActivity = useCallback(
    (id: number, detail: string, status: ActivityStatus, title?: string) => {
      setActivityLog((current) =>
        current.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                title: title ?? entry.title,
                detail: formatDetail(detail),
                status,
              }
            : entry
        )
      )
    },
    [formatDetail]
  )

  const markSuccess = useCallback(
    (id: number, detail: string, title?: string) => {
      updateActivity(id, detail, 'success', title)
    },
    [updateActivity]
  )

  const markError = useCallback(
    (id: number, detail: string, title?: string) => {
      updateActivity(id, detail, 'error', title)
    },
    [updateActivity]
  )

  const clearActivities = useCallback((predicate?: (entry: ActivityEntry) => boolean) => {
    if (!predicate) {
      setActivityLog([])
      return
    }

    setActivityLog((current) => current.filter((entry) => !predicate(entry)))
  }, [])

  return {
    activityLog,
    addActivity,
    updateActivity,
    markSuccess,
    markError,
    clearActivities,
    setActivityLog,
  }
}
