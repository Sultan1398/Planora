'use client'

import { useMemo, useState } from 'react'
import type { AdminUserRow } from '@/lib/admin/load-admin-dashboard'
import { cn } from '@/lib/utils'
import { MoreVertical, Search } from 'lucide-react'

function PlatformCell({ used }: { used: boolean }) {
  return <span className="text-base">{used ? '✅' : '❌'}</span>
}

function hasPlatform(platformsUsed: string[], name: 'Web' | 'Android' | 'iOS'): boolean {
  return platformsUsed.some((p) => p.toLowerCase() === name.toLowerCase())
}

function UserActionsMenu() {
  return (
    <details className="relative">
      <summary
        className={cn(
          'list-none cursor-pointer rounded-lg p-2 text-muted transition-colors hover:bg-surface hover:text-foreground',
          '[&::-webkit-details-marker]:hidden'
        )}
        aria-label="خيارات المستخدم"
      >
        <MoreVertical className="h-4 w-4" />
      </summary>
      <div
        className={cn(
          'absolute end-0 z-20 mt-1 min-w-[11rem] overflow-hidden rounded-xl border border-border bg-white py-1 shadow-lg',
          'ring-1 ring-black/[0.06]'
        )}
      >
        <button
          type="button"
          className="block w-full px-3 py-2 text-start text-sm text-slate-700 hover:bg-surface"
        >
          تعليق الحساب
        </button>
        <button
          type="button"
          className="block w-full px-3 py-2 text-start text-sm text-slate-700 hover:bg-surface"
        >
          إعادة تعيين كلمة المرور
        </button>
      </div>
    </details>
  )
}

export function UsersManagementTab({ users }: { users: AdminUserRow[] }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => u.email.toLowerCase().includes(q))
  }, [users, query])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">إدارة المستخدمين</h2>
        <p className="mt-1 text-sm text-muted">عرض مدمج من auth.users و profiles (خادم فقط).</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="البحث بالبريد الإلكتروني…"
          dir="ltr"
          className={cn(
            'w-full rounded-xl border border-border bg-white py-2.5 ps-10 pe-4 text-sm',
            'outline-none transition-shadow focus:border-brand focus:ring-2 focus:ring-brand/25'
          )}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/[0.04]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50/90 text-start text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-4 py-3">البريد الإلكتروني</th>
                <th className="px-4 py-3">تاريخ التسجيل</th>
                <th className="px-4 py-3">الاشتراك</th>
                <th className="px-4 py-3">المنصات</th>
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">
                    لا توجد نتائج مطابقة.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-surface/50">
                    <td className="px-4 py-3 font-medium text-slate-900" dir="ltr">
                      {u.email}
                    </td>
                    <td className="px-4 py-3 text-muted tabular-nums" dir="ltr">
                      {new Date(u.created_at).toLocaleString('ar-SA', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
                          u.subscription_status.toLowerCase() === 'active'
                            ? 'bg-emerald-100 text-emerald-700'
                            : u.subscription_status.toLowerCase() === 'trial'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-700'
                        )}
                      >
                        {u.subscription_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                        <span title="Web">
                          💻 <PlatformCell used={hasPlatform(u.platforms_used, 'Web') || u.used_web} />
                        </span>
                        <span title="Android">
                          🤖 <PlatformCell used={hasPlatform(u.platforms_used, 'Android') || u.used_android} />
                        </span>
                        <span title="iOS">
                          📱 <PlatformCell used={hasPlatform(u.platforms_used, 'iOS') || u.used_ios} />
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <UserActionsMenu />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
