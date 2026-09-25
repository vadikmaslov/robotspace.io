ALTER TABLE robot_public_projections ADD COLUMN IF NOT EXISTS image_url VARCHAR(2000);

UPDATE robot_public_projections SET image_url = 
  CASE canonical_name
    WHEN 'Atlas' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Atlas_robot_%28Boston_Dynamics%29.jpg/640px-Atlas_robot_%28Boston_Dynamics%29.jpg'
    WHEN 'Spot' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Spot_robot.jpg/640px-Spot_robot.jpg'
    WHEN 'Stretch' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Boston_Dynamics_Stretch.jpg/640px-Boston_Dynamics_Stretch.jpg'
    WHEN 'UR5e' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Universal_Robots_UR5e.jpg/640px-Universal_Robots_UR5e.jpg'
    WHEN 'Digit' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Agility_Robotics_Digit.jpg/640px-Agility_Robotics_Digit.jpg'
  END
WHERE canonical_name IN ('Atlas','Spot','Stretch','UR5e','Digit');
