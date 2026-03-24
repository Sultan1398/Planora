/**
 * Canonical site origin for auth redirects (Supabase `redirectTo`, etc.).
 * Works in the browser and on the server (Server Actions / Route Handlers).
 */
export function getSiteUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '')
  }
  const vercelPublic = process.env.NEXT_PUBLIC_VERCEL_URL?.trim()
  if (vercelPublic) {
    const host = vercelPublic.replace(/^https?:\/\//, '')
    return `https://${host}`
  }
  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, '')
    return `https://${host}`
  }
  return 'http://localhost:3000'
}
