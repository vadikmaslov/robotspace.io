ALTER TABLE articles ADD COLUMN list_summary TEXT, ADD COLUMN detail_summary TEXT, ADD COLUMN summaries_generated_at timestamptz(6);
