/**
 * Auth.js v5 configuration — Google OAuth provider
 * Bootstrap: first verified email from BOOTSTRAP_ADMIN_EMAIL creates admin_users record
 */

import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import GitHub from 'next-auth/providers/github'
import type { NextAuthConfig } from 'next-auth'
import { registerGitHubIdentity, registryUserForGitHub } from './lib/registry-identity'
import { allowAdminPasswordAttempt } from './lib/admin-login-limit'

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false

  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

const secureCookies = process.env.NODE_ENV === 'production'

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      name: 'Admin credentials',
      credentials: {
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        if (!(await allowAdminPasswordAttempt(request))) return null
        const password = typeof credentials?.password === 'string' ? credentials.password : ''
        const expectedPassword = process.env.ADMIN_PASSWORD

        if (!expectedPassword || !constantTimeEqual(password, expectedPassword)) return null

        return {
          id: 'env-admin',
          name: 'Administrator',
          email: 'admin@robotspace.local',
        }
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          profile(profile) {
            return {
              id: profile.sub,
              email: profile.email,
              name: profile.name,
              image: profile.picture,
              emailVerified: profile.email_verified === true,
            }
          },
        })]
      : []),
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [GitHub({
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          authorization: { params: { scope: 'read:user' } },
        })]
      : []),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'credentials') return true
      if (account?.provider === 'github') {
        try {
          const { prisma } = await import('@robotspace/db')
          const environment = process.env.NODE_ENV === 'production' ? 'production' : 'development'
          const flags = await prisma.feature_flags.findMany({ where: { key: 'registry.claims', environment: { in: [environment, 'all'] } }, select: { environment: true, enabled: true } })
          if (!(flags.find(flag => flag.environment === environment) ?? flags.find(flag => flag.environment === 'all'))?.enabled) return false
          await registerGitHubIdentity(prisma, account.providerAccountId, account.access_token ?? '')
          return true
        } catch {
          console.warn('[auth] GitHub Registry sign-in could not be completed')
          return false
        }
      }

      // Deny unverified email
      const emailVerified = (user as typeof user & { emailVerified?: boolean }).emailVerified
      if (!emailVerified && (profile as { email_verified?: boolean } | undefined)?.email_verified !== true) {
        return false
      }

      const normalizedEmail = user.email?.toLowerCase().trim()
      if (!normalizedEmail) return false

      // Check if this email is in the admin allowlist (DB)
      try {
        const { prisma } = await import('@robotspace/db')
        const admin = await prisma.admin_users.findFirst({
          where: {
            email: normalizedEmail,
            status: 'ACTIVE',
          },
        })

        // Bootstrap: first admin ever from env
        const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase()
        if (!admin && normalizedEmail === bootstrapEmail) {
          await prisma.admin_users.create({
            data: {
              email: normalizedEmail,
              status: 'ACTIVE',
              email_verified_at: new Date(),
              last_login_at: new Date(),
            },
          })
          return true
        }

        if (!admin) {
          console.warn(`[auth] Denied login: ${normalizedEmail} — not in allowlist`)
          return false
        }

        // Update last login timestamp
        await prisma.admin_users.update({
          where: { id: admin.id },
          data: { last_login_at: new Date() },
        })

        return true
      } catch (err) {
        console.error('[auth] signIn error:', err)
        return false
      }
    },

    async session({ session, token }) {
      if (session.user && token.email) session.user.email = String(token.email)
      if (session.user) {
        session.user.sessionKind = token.sessionKind === 'admin' ? 'admin' : token.sessionKind === 'registry' ? 'registry' : undefined
        session.user.registryUserId = typeof token.registryUserId === 'string' ? token.registryUserId : undefined
      }
      return session
    },

    async jwt({ token, user, account }) {
      if (user) {
        token.email = user.email ?? ''
      }
      if (account?.provider === 'credentials' || account?.provider === 'google') {
        token.sessionKind = 'admin'
        delete token.registryUserId
      } else if (account?.provider === 'github') {
        const { prisma } = await import('@robotspace/db')
        const registryUserId = await registryUserForGitHub(prisma, account.providerAccountId)
        if (!registryUserId) throw new Error('Registry account is missing')
        token.sessionKind = 'registry'
        token.registryUserId = registryUserId
      }
      return token
    },
  },
  pages: {
    signIn: '/admin/login',
    error: '/admin/error',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },
  cookies: {
    sessionToken: {
      name: secureCookies ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: secureCookies,
      },
    },
    csrfToken: {
      name: secureCookies ? '__Host-next-auth.csrf-token' : 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: secureCookies,
      },
    },
  },
  trustHost: true,
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
