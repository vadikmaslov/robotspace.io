/**
 * Phase 2B: Settings Service
 * Typed key-value settings store with optimistic locking
 */

import { prisma } from '../index'

export const settingsService = {
  /** Get a typed setting value */
  async get<T = unknown>(key: string): Promise<T | null> {
    const setting = await prisma.system_settings.findUnique({ where: { key } })
    if (!setting) return null
    return (setting.value_json as any) as T
  },

  /** Set a setting with optimistic locking (prevents concurrent overwrite) */
  async set<T = unknown>(key: string, value: T, updatedBy?: string): Promise<void> {
    const existing = await prisma.system_settings.findUnique({ where: { key } })
    if (existing) {
      await prisma.system_settings.update({
        where: { key, optimistic_lock: existing.optimistic_lock },
        data: {
          value_json: value as any,
          schema_version: existing.schema_version + 1,
          optimistic_lock: existing.optimistic_lock + 1,
          updated_by: updatedBy ?? undefined,
        },
      })
    } else {
      await prisma.system_settings.create({
        data: {
          key,
          value_json: value as any,
          updated_by: updatedBy ?? undefined,
        },
      })
    }
  },

  /** Get recipients: notification email and quote email */
  async getRecipients(): Promise<{ notificationEmail: string; quoteEmail: string }> {
    const data = await this.get<{ notification_email: string; quote_email: string }>('recipients')
    return {
      notificationEmail: data?.notification_email || process.env.SMTP_EMAIL || '',
      quoteEmail: data?.quote_email || process.env.SMTP_EMAIL || '',
    }
  },

  /** Get confidence thresholds */
  async getConfidenceThresholds(): Promise<{
    identity: number
    technicalSpec: number
    compatibility: number
    newsMetadata: number
    trendStatement: number
    conflictMargin: number
  }> {
    const data = await this.get<{
      identity: number
      technical_spec: number
      compatibility: number
      news_metadata: number
      trend_statement: number
      conflict_margin: number
    }>('confidence_thresholds')
    return {
      identity: data?.identity ?? 0.85,
      technicalSpec: data?.technical_spec ?? 0.90,
      compatibility: data?.compatibility ?? 0.90,
      newsMetadata: data?.news_metadata ?? 0.80,
      trendStatement: data?.trend_statement ?? 0.90,
      conflictMargin: data?.conflict_margin ?? 0.10,
    }
  },
}
