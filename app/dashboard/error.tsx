'use client'

// Recoverable error boundary for the dashboard. The most likely cause is a
// transient failure to load your profile (see app/dashboard/layout.tsx), which
// is fixed by reloading — far better than silently rendering a downgraded shell
// that looks like a demotion.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen grid place-items-center bg-gray-50 p-6">
      <div className="card p-8 max-w-md text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-yellow-100 text-yellow-700 grid place-items-center text-2xl">!</div>
        <div>
          <h1 className="text-xl font-display text-gray-900">Something didn’t load</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {error.message || 'We hit a snag loading your dashboard. This is usually temporary.'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
          <button onClick={() => reset()} className="btn-primary">Try again</button>
          <button onClick={() => window.location.reload()} className="btn-secondary">Reload the page</button>
        </div>
        <p className="text-xs text-gray-400">
          Still stuck? Sign out and back in — your account and permissions are unchanged.
        </p>
      </div>
    </div>
  )
}
