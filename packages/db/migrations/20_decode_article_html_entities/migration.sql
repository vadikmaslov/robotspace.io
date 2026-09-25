-- Repair entities imported before RSS decoding was added.
UPDATE articles
SET title = replace(replace(replace(replace(replace(replace(replace(title, '&#038;', '&'), '&#38;', '&'), '&#8217;', '’'), '&#8216;', '‘'), '&#8220;', '“'), '&#8221;', '”'), '&amp;', '&'),
    authors = replace(replace(replace(replace(replace(COALESCE(authors, ''), '&#038;', '&'), '&#38;', '&'), '&#8217;', '’'), '&#8216;', '‘'), '&amp;', '&')
WHERE title LIKE '%&#%' OR title LIKE '%&amp;%' OR COALESCE(authors, '') LIKE '%&#%' OR COALESCE(authors, '') LIKE '%&amp;%';
