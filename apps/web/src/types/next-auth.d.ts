import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      sessionKind?: 'admin' | 'registry'
      registryUserId?: string
    } & import('next-auth').DefaultSession['user']
  }
}
