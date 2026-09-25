INSERT INTO entities (entity_type, slug, publication_status) VALUES
('ROBOT', 'kuka-kr-500-fortec', 'PUBLISHED'),
('ROBOT', 'abb-irb-4600', 'PUBLISHED'),
('ROBOT', 'fanuc-m710ic', 'PUBLISHED'),
('ROBOT', 'ur3e', 'PUBLISHED'),
('ROBOT', 'kuka-kr-16-2', 'PUBLISHED'),
('ROBOT', 'abb-yumi', 'PUBLISHED'),
('ROBOT', 'fanuc-lr-mate-200id', 'PUBLISHED'),
('ROBOT', 'kuka-kr-quantec-pa', 'PUBLISHED')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO robots (entity_id) SELECT id FROM entities WHERE slug IN ('kuka-kr-500-fortec','abb-irb-4600','fanuc-m710ic','ur3e','kuka-kr-16-2','abb-yumi','fanuc-lr-mate-200id','kuka-kr-quantec-pa') ON CONFLICT DO NOTHING;

INSERT INTO robot_public_projections (robot_entity_id, canonical_name, category_id, payload_kg, reach_mm, weight_kg, lifecycle_status, summary, last_verified_at)
SELECT e.id, 
  CASE e.slug
    WHEN 'kuka-kr-500-fortec' THEN 'KUKA KR 500 FORTEC'
    WHEN 'abb-irb-4600' THEN 'ABB IRB 4600'
    WHEN 'fanuc-m710ic' THEN 'FANUC M-710iC'
    WHEN 'ur3e' THEN 'UR3e'
    WHEN 'kuka-kr-16-2' THEN 'KUKA KR 16-2'
    WHEN 'abb-yumi' THEN 'ABB YuMi'
    WHEN 'fanuc-lr-mate-200id' THEN 'FANUC LR Mate 200iD'
    WHEN 'kuka-kr-quantec-pa' THEN 'KUKA KR QUANTEC PA'
  END,
  CASE WHEN e.slug LIKE 'kuka%' THEN 'Industrial' WHEN e.slug LIKE 'abb%' THEN 'Industrial' WHEN e.slug LIKE 'fanuc%' THEN 'Industrial' WHEN e.slug = 'ur3e' THEN 'Industrial' END,
  CASE e.slug
    WHEN 'kuka-kr-500-fortec' THEN 500 WHEN 'abb-irb-4600' THEN 60 WHEN 'fanuc-m710ic' THEN 70
    WHEN 'ur3e' THEN 3 WHEN 'kuka-kr-16-2' THEN 16 WHEN 'abb-yumi' THEN 0.5
    WHEN 'fanuc-lr-mate-200id' THEN 7 WHEN 'kuka-kr-quantec-pa' THEN 240
  END,
  CASE e.slug
    WHEN 'kuka-kr-500-fortec' THEN 3326 WHEN 'abb-irb-4600' THEN 2550 WHEN 'fanuc-m710ic' THEN 2050
    WHEN 'ur3e' THEN 500 WHEN 'kuka-kr-16-2' THEN 1611 WHEN 'abb-yumi' THEN 559
    WHEN 'fanuc-lr-mate-200id' THEN 717 WHEN 'kuka-kr-quantec-pa' THEN 3195
  END,
  CASE e.slug
    WHEN 'kuka-kr-500-fortec' THEN 2400 WHEN 'abb-irb-4600' THEN 435 WHEN 'fanuc-m710ic' THEN 560
    WHEN 'ur3e' THEN 11 WHEN 'kuka-kr-16-2' THEN 235 WHEN 'abb-yumi' THEN 38
    WHEN 'fanuc-lr-mate-200id' THEN 25 WHEN 'kuka-kr-quantec-pa' THEN 1190
  END,
  'ACTIVE',
  CASE e.slug
    WHEN 'kuka-kr-500-fortec' THEN 'Heavy-payload industrial robot for foundry and press shop applications. Handles 500 kg across 3.3 m reach with IP67 protection.'
    WHEN 'abb-irb-4600' THEN 'Versatile 6-axis industrial robot for material handling, machine tending and dispensing with 60 kg payload.'
    WHEN 'fanuc-m710ic' THEN 'Industrial robot optimized for spot welding and material handling with 70 kg payload and 2 m reach.'
    WHEN 'ur3e' THEN 'Compact tabletop collaborative robot for light assembly, dispensing and educational use with 3 kg payload.'
    WHEN 'kuka-kr-16-2' THEN 'Medium-payload 6-axis robot for arc welding, machining and handling with 16 kg capacity.'
    WHEN 'abb-yumi' THEN 'Dual-arm collaborative robot designed for small parts assembly with integrated vision and force control.'
    WHEN 'fanuc-lr-mate-200id' THEN 'Compact high-speed robot for picking, packing and assembly with 7 kg payload in tight workspaces.'
    WHEN 'kuka-kr-quantec-pa' THEN 'Palletizing robot optimized for high-speed stacking with 240 kg payload and 3.2 m reach.'
  END,
  now()
FROM entities e
WHERE e.slug IN ('kuka-kr-500-fortec','abb-irb-4600','fanuc-m710ic','ur3e','kuka-kr-16-2','abb-yumi','fanuc-lr-mate-200id','kuka-kr-quantec-pa')
ON CONFLICT (robot_entity_id) DO NOTHING;

INSERT INTO robot_company_relations (robot_entity_id, company_entity_id, relation)
SELECT e.id, c.entity_id, 'MANUFACTURES'
FROM entities e
CROSS JOIN (
  SELECT entity_id, CASE slug
    WHEN 'boston-dynamics' THEN 1 WHEN 'universal-robots' THEN 2 WHEN 'kuka' THEN 3
    WHEN 'abb' THEN 4 WHEN 'fanuc' THEN 5 WHEN 'unitree' THEN 6 WHEN 'agility-robotics' THEN 7
  END as idx
  FROM entities WHERE entity_type = 'COMPANY'
) c
WHERE e.entity_type = 'ROBOT'
ON CONFLICT DO NOTHING;
