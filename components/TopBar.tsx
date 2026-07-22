'use client'

import { usePathname, useRouter } from 'next/navigation'
import type { Profile } from '@/lib/types'

interface TopBarProps {
  profile: Profile
}

const routeMeta: Record<string, { title: string; action?: { label: string; href: string } }> = {
  '/dashboard': { title: 'Dashboard' },
  '/dashboard/resources': {
    title: 'Resource Library',
    action: { label: '+ Submit Resource', href: '/dashboard/resources/submit' },
  },
  '/dashboard/resources/submit': { title: 'Submit Resource' },
  '/dashboard/goals': { title: 'Goals' },
  '/dashboard/pd-log': { title: 'PD Log' },
  '/dashboard/calendar': { title: 'PD Calendar' },
  '/dashboard/workspaces': { title: 'Workspaces' },
  '/dashboard/spotlights': { title: 'Spotlights' },
  '/dashboard/observations': { title: 'Observations' },
  '/dashboard/frameworks': { title: 'Frameworks' },
  '/dashboard/admin/staff': { title: 'Staff Roster' },
  '/dashboard/admin/import': { title: 'Import Staff (CSV)' },
  '/dashboard/admin/reports': { title: 'Reports' },
}

export default function TopBar({ profile }: TopBarProps) {
  const pathname = usePathname()
  const router = useRouter()

  // Find best matching route
  const meta = Object.entries(routeMeta)
    .filter(([key]) => pathname === key || pathname.startsWith(key + '/'))
    .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? { title: 'GCS PD Platform' }

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <h1 className="text-gray-900 font-semibold text-lg">{meta.title}</h1>

      <div className="flex items-center gap-3">
        {meta.action && (
          <button
            onClick={() => router.push(meta.action!.href)}
            className="btn-primary text-sm"
          >
            {meta.action.label}
          </button>
        )}

        {/* Quick context badge */}
        <div className="hidden sm:flex items-center gap-2 pl-4 border-l border-gray-200">
          <div className="text-right">
            <p className="text-xs font-medium text-gray-700">
              {profile.first_name} {profile.last_name}
            </p>
            <p className="text-[10px] text-gray-400 capitalize">{profile.role}</p>
          </div>
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="avatar"
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-navy-100 flex items-center justify-center">
              <span className="text-navy-800 text-xs font-bold">
                {profile.first_name?.[0]}{profile.last_name?.[0]}
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
