/**
 * Admin login page — Google OAuth sign-in
 */

import { signIn } from '../../../auth'
import { redirect } from 'next/navigation'

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}) {
  const params = await searchParams
  const callbackUrl = params.callbackUrl ?? '/admin'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-white">
      <div className="max-w-md w-full space-y-8 p-8">
        <h1 className="text-2xl font-bold text-center">RobotSpace Admin</h1>

        {params.error && (
          <div className="p-4 rounded-md bg-red-900/30 border border-red-800 text-sm">
            {params.error === 'AccessDenied'
              ? 'Your email is not authorized. Only allowed admins can access this page.'
              : 'Authentication failed. Please try again.'}
          </div>
        )}

        <form
          action={async (formData) => {
            'use server'
            await signIn('credentials', {
              password: formData.get('password'),
              redirectTo: callbackUrl,
            })
          }}
          className="space-y-4"
        >
          <label className="block space-y-1 text-sm">
            <span>Admin password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 rounded-md font-medium transition-colors"
          >
            Sign in
          </button>
        </form>

        <p className="text-center text-gray-500 text-xs">
          Access is restricted to the administrator password configured on the server.
        </p>
      </div>
    </div>
  )
}
