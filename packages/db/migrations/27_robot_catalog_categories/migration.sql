-- Catalog categories added to the canonical taxonomy.  robot_public_projections.category_id
-- is a UUID foreign key in the database, so the catalog UI and workers must use these IDs
-- rather than storing display labels such as "Humanoid".
INSERT INTO categories (slug, name_en, description_en, sort_order, is_active)
VALUES
  ('inspection', 'Inspection', 'Infrastructure, energy, safety and remote inspection robots.', 80, true),
  ('consumer', 'Consumer', 'Home, companion and personal robots.', 90, true)
ON CONFLICT (slug) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  description_en = EXCLUDED.description_en,
  is_active = true,
  updated_at = now();
