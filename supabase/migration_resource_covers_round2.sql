-- ── Second pass at the missing book covers (idempotent) ──────────────
-- migration_resource_metadata_backfill.sql left 8 Amazon-linked books
-- without a cover because Amazon blocks page fetches and both fallback
-- lookups were unavailable that day. Retry results:
--   * Google Books API: still HTTP 429 (shared anonymous quota).
--   * Open Library API: still HTTP 503.
--   * Amazon's image CDN, keyed by the ASIN already in the resource URL:
--     2 real covers; the other 4 return a 43-byte 1x1 placeholder.
-- Both covers below were opened and visually confirmed to be the right
-- book before being written here.
--
-- Not applied: ISBN 9781930556553 (converted from the 193055655X in the
-- "If You Don't Feed the Teachers" URL) does have an Open Library cover,
-- but it is the cover of "Differentiated Instruction: A Guide for
-- Elementary School Teachers" by Amy Benjamin - a different book. Left
-- null rather than showing a wrong cover.
--
-- Still without a cover after this pass (6): Group Leadership Skills,
-- If You Don't Feed the Teachers, Working with You is Killing Me,
-- Cultivating Leadership in Schools, An Everyone Culture, Always Time
-- for Coffee. These need either a working Google Books/Open Library
-- lookup or a manual upload.

update public.resources
   set cover_image = 'https://m.media-amazon.com/images/P/B0FGZZ4W77.01._SCLZZZZZZZ_.jpg'
 where url = 'https://www.amazon.com/Joyful-Anyway-Kate-Bowler/dp/B0FGZZ4W77'
   and cover_image is null;

update public.resources
   set cover_image = 'https://m.media-amazon.com/images/P/B0B4R1J4R5.01._SCLZZZZZZZ_.jpg'
 where url = 'https://www.amazon.com/Poverty-America-Matthew-Desmond-ebook/dp/B0B4R1J4R5'
   and cover_image is null;
