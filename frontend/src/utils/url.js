export function resolveApiAssetUrl(path) {
  if (!path) return path
  if (typeof path !== 'string') return path

  // Already absolute or data URL
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path

  // In production, assets like "/api/uploads/..." must point to backend (Render),
  // not the frontend origin (Vercel). In dev, Vite proxy handles "/api".
  const apiBase = import.meta.env.VITE_API_URL
  if (!apiBase) return path

  const apiOrigin = String(apiBase).replace(/\/api\/?$/i, '')
  if (path.startsWith('/api/')) return `${apiOrigin}${path}`

  return path
}


