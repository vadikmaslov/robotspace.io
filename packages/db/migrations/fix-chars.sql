UPDATE robot_public_projections SET summary = REPLACE(REPLACE(REPLACE(REPLACE(summary, '−', '-'), '°', ' deg'), '–', '-'), '−', '-');
