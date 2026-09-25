/**
 * Domain types and interfaces
 * Pure domain logic — no DB, no external dependencies
 */

export type EntityTypes = 'ROBOT' | 'ROBOT_VARIANT' | 'COMPANY'
export type PublicationStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN'
export type CompanyType = 'MANUFACTURER' | 'INTEGRATOR' | 'COMPONENT_SUPPLIER' | 'SOFTWARE_PROVIDER' | 'RESEARCH_ORGANIZATION' | 'DISTRIBUTOR' | 'OTHER'
export type SourceTier = 'A' | 'B' | 'C' | 'D'
export type SourceStatus = 'PROPOSED' | 'ACTIVE' | 'PAUSED' | 'DISABLED' | 'BROKEN'
export type LegalStatus = 'ALLOWED' | 'UNKNOWN' | 'RESTRICTED_RISK' | 'TAKEDOWN'
export type AssertionStatus = 'CANDIDATE' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED'
export type AgentRunState = 'PENDING' | 'RUNNING' | 'WAITING_RETRY' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
export type IngestionRunState = 'SCHEDULED' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'CANCELLED'
