export const USER_STORAGE_LIMIT = 2 * 1024 * 1024 * 1024

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function storagePercent(bytes = 0) {
  return Math.min(100, Math.round((bytes / USER_STORAGE_LIMIT) * 100))
}
