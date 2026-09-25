/**
 * Typed configuration and shared validation schemas
 */

import { z } from 'zod'

/**
 * Validation schemas used across multiple packages
 */
export const requestSchema = z.object({
  requestId: z.string().uuid().optional(),
  correlationId: z.string().uuid(),
})

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().uuid().optional(),
    fieldErrors: z.record(z.array(z.string())).optional(),
  }),
})

export type ErrorResponse = z.infer<typeof errorResponseSchema>
