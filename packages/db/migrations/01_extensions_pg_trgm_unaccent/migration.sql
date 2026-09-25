-- Phase 2A Step 1: PostgreSQL Extensions
-- Enable text search extensions for full-text search and fuzzy matching

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
