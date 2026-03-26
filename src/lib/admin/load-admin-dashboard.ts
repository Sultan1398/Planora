import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/database'

export type AdminDashboardStats = {
  totalUsers: number
  usedWeb: number
  usedAndroid: number
  usedIos: number
  totalOperations: number
  inflowsCount: number
  outflowsCount: number
  obligationsCount: number
  investmentsCount: number
}

export type AdminUserRow = {
  id: string
  email: string
  created_at: string
  subscription_status: string
  platforms_used: string[]
  used_web: boolean
  used_android: boolean
  used_ios: boolean
}

export type AdminErrorLogRow = {
  id: string
  message: string
  created_at: string
  user_id: string | null
  details: Json | null
}

export type AdminDashboardPayload = {
  stats: AdminDashboardStats
  users: AdminUserRow[]
  errorLogs: AdminErrorLogRow[]
  supabaseConnected: boolean
}

export async function loadAdminDashboardPayload(): Promise<AdminDashboardPayload> {
  const admin = createAdminClient()

  const [
    profilesCountRes,
    webRes,
    androidRes,
    iosRes,
    inflowsRes,
    outflowsRes,
    obligationsRes,
    investmentsRes,
    logsRes,
    profilesRes,
    listUsersRes,
  ] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('used_web', true),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('used_android', true),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('used_ios', true),
    admin.from('inflows').select('*', { count: 'exact', head: true }),
    admin.from('outflows').select('*', { count: 'exact', head: true }),
    admin.from('obligations').select('*', { count: 'exact', head: true }),
    admin.from('investments').select('*', { count: 'exact', head: true }),
    admin
      .from('app_error_logs')
      .select('id, message, created_at, user_id, details')
      .order('created_at', { ascending: false })
      .limit(50),
    admin
      .from('profiles')
      .select('id, subscription_status, platforms_used, used_web, used_android, used_ios'),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  if (listUsersRes.error) {
    throw new Error(listUsersRes.error.message)
  }

  if (profilesRes.error) {
    throw new Error(profilesRes.error.message)
  }

  let supabaseConnected = true
  const ping = await admin.from('profiles').select('id').limit(1).maybeSingle()
  if (ping.error) {
    supabaseConnected = false
  }

  const inflowsCount = inflowsRes.count ?? 0
  const outflowsCount = outflowsRes.count ?? 0
  const obligationsCount = obligationsRes.count ?? 0
  const investmentsCount = investmentsRes.count ?? 0

  const stats: AdminDashboardStats = {
    totalUsers: profilesCountRes.count ?? 0,
    usedWeb: webRes.count ?? 0,
    usedAndroid: androidRes.count ?? 0,
    usedIos: iosRes.count ?? 0,
    totalOperations: inflowsCount + outflowsCount + obligationsCount + investmentsCount,
    inflowsCount,
    outflowsCount,
    obligationsCount,
    investmentsCount,
  }

  const profileMap = new Map(
    (profilesRes.data ?? []).map((p) => [
      p.id,
      {
        subscription_status: p.subscription_status,
        platforms_used: p.platforms_used ?? [],
        used_web: p.used_web,
        used_android: p.used_android,
        used_ios: p.used_ios,
      },
    ])
  )

  const users: AdminUserRow[] = (listUsersRes.data.users ?? []).map((u) => {
    const p = profileMap.get(u.id)
    return {
      id: u.id,
      email: u.email ?? '—',
      created_at: u.created_at,
      subscription_status: p?.subscription_status ?? 'inactive',
      platforms_used: p?.platforms_used ?? [],
      used_web: p?.used_web ?? false,
      used_android: p?.used_android ?? false,
      used_ios: p?.used_ios ?? false,
    }
  })

  const errorLogs: AdminErrorLogRow[] = logsRes.error
    ? []
    : (logsRes.data ?? []).map((row) => ({
        id: row.id,
        message: row.message,
        created_at: row.created_at,
        user_id: row.user_id,
        details: row.details,
      }))

  return {
    stats,
    users,
    errorLogs,
    supabaseConnected,
  }
}
