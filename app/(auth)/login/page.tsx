'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createClient()
  const [showEmail, setShowEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Surface the server-side domain rejection (?error=domain)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'domain') {
      setError('Please sign in with your @gcschool.org account.')
    }
  }, [])

  const handleGoogle = async () => {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
        scopes: 'email profile',
        queryParams: {
          hd: 'gcschool.org', // hint Google to show only school accounts
        },
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      window.location.href = '/dashboard'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 flex items-center justify-center px-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full border-[80px] border-white" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full border-[60px] border-white" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Top banner */}
          <div className="bg-navy-900 px-8 py-8 text-center">
            {/* GCS Logo mark */}
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-full mb-4">
              <span className="font-display text-2xl font-bold text-navy-900 tracking-tight">GCS</span>
            </div>
            <h1 className="font-display text-white text-2xl font-bold">Grace Church School</h1>
            <p className="text-navy-200 text-sm mt-1">Professional Development Platform</p>
          </div>

          {/* Body */}
          <div className="px-8 py-8">
            <h2 className="text-gray-800 text-lg font-semibold mb-1">Welcome back</h2>
            <p className="text-gray-500 text-sm mb-6">Sign in to access your PD dashboard</p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {/* Google Sign In */}
            <button
              onClick={handleGoogle}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-700 font-semibold text-sm hover:border-navy-300 hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-4"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </button>

            {/* Divider */}
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs text-gray-400">
                <span className="bg-white px-3">or for dev testing</span>
              </div>
            </div>

            {/* Email/password collapsible */}
            {!showEmail ? (
              <button
                onClick={() => setShowEmail(true)}
                className="w-full text-center text-sm text-gray-500 hover:text-navy-700 underline underline-offset-2 transition-colors"
              >
                Sign in with email &amp; password
              </button>
            ) : (
              <form onSubmit={handleEmailLogin} className="space-y-3">
                <div>
                  <label htmlFor="email" className="label">Email</label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@gcschool.org"
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="label">Password</label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full mt-1"
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            )}

            {/* Note */}
            <p className="mt-6 text-center text-xs text-gray-400">
              Access restricted to <span className="font-medium text-gray-500">@gcschool.org</span> accounts
            </p>
          </div>
        </div>

        <p className="text-center text-white/40 text-xs mt-6">
          &copy; {new Date().getFullYear()} Grace Church School
        </p>
      </div>
    </div>
  )
}
