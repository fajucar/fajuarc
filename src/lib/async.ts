export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`Timeout: ${operation} took longer than ${timeoutMs}ms`))
    }, timeoutMs)

    promise
      .then((value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      })
      .catch((error) => {
        window.clearTimeout(timeoutId)
        reject(error)
      })
  })
}
