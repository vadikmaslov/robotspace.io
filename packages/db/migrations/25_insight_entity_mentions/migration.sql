-- A public article should have at most one current mention for each entity.
DELETE FROM entity_mentions older
USING entity_mentions newer
WHERE older.article_id = newer.article_id
  AND older.entity_id = newer.entity_id
  AND older.article_id IS NOT NULL
  AND older.entity_id IS NOT NULL
  AND older.created_at < newer.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS uq_article_entity_mentions
  ON entity_mentions (article_id, entity_id)
  WHERE article_id IS NOT NULL AND entity_id IS NOT NULL;
