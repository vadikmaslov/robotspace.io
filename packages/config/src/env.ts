/**
 * Environment variable validation schema
 * All production env vars must pass Zod validation at startup
 */

import { z } from 'zod'

export const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),
  DIRECT_DATABASE_URL: z.string().url().optional(),
  
  // Auth
  AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email(),
  
  // Encryption
  INTEGRATION_CREDENTIALS_ACTIVE_KEY_ID: z.string().min(1),
  INTEGRATION_CREDENTIALS_KEYRING: z.string().min(1),
  
  // Storage
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  
  // Email
  EMAIL_TRANSPORT_URL: z.string().min(1),
  
  // CAPTCHA
  CAPTCHA_SITE_KEY: z.string().min(1),
  CAPTCHA_SECRET_KEY: z.string().min(1),
  
  // App
  APP_BASE_URL: z.string().url(),
  
  // Map (optional)
  MAP_STYLE_URL: z.string().url().or(z.literal('')).optional().default(''),
})

// Runtime validation
let validatedEnv: z.infer<typeof envSchema>

try {
  validatedEnv = envSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    BOOTSTRAP_ADMIN_EMAIL: process.env.BOOTSTRAP_ADMIN_EMAIL,
    INTEGRATION_CREDENTIALS_ACTIVE_KEY_ID: process.env.INTEGRATION_CREDENTIALS_ACTIVE_KEY_ID,
    INTEGRATION_CREDENTIALS_KEYRING: process.env.INTEGRATION_CREDENTIALS_KEYRING,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    EMAIL_TRANSPORT_URL: process.env.EMAIL_TRANSPORT_URL,
    CAPTCHA_SITE_KEY: process.env.CAPTCHA_SITE_KEY,
    CAPTCHA_SECRET_KEY: process.env.CAPTCHA_SECRET_KEY,
    APP_BASE_URL: process.env.APP_BASE_URL,
    MAP_STYLE_URL: process.env.MAP_STYLE_URL ?? '',
  })
} catch (err) {
  if (err instanceof z.ZodError) {
    const missing = err.errors.map(e => `${e.path.join('.')}`).join(', ')
    console.error(`Missing required environment variables: ${missing}`)
  }
  process.exit(1)
}

export const env = validatedEnv
