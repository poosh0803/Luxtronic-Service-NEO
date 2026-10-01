-- Parts as line items, e.g. [{"description": "Display cable", "cost": 45}].
-- parts_cost stays as a stored column: the server sets it to the sum of these
-- costs whenever parts are saved, and total_cost is built from it.
-- Forward-only migration, safe to re-run: run by hand on production.
ALTER TABLE service_forms ADD COLUMN IF NOT EXISTS parts JSONB NOT NULL DEFAULT '[]';

-- Old free-text breakdowns are converted below. Clearing parts_breakdown marks
-- a row as converted; the column is no longer used by the app.

-- 1. Multi-line breakdowns where every line ends in an amount (e.g.
--    "RAM - $120" / "SSD - $240") become one item per line - but only when those
--    amounts add up exactly to the stored parts_cost, so no job's total changes.
WITH lines AS (
  SELECT sf.id, l.ord,
         regexp_match(trim(l.line), '^(.*?)[\s:–-]*\$\s*([0-9]+(\.[0-9]{1,2})?)$') AS m
  FROM service_forms sf,
       regexp_split_to_table(sf.parts_breakdown, E'\\r?\\n') WITH ORDINALITY AS l(line, ord)
  WHERE sf.parts = '[]'::jsonb
    AND COALESCE(trim(sf.parts_breakdown), '') <> ''
    AND trim(l.line) <> ''
),
splittable AS (
  SELECT id,
         jsonb_agg(jsonb_build_object(
           'description', COALESCE(NULLIF(trim(m[1]), ''), 'Part'),
           'cost', m[2]::numeric) ORDER BY ord) AS items,
         sum(m[2]::numeric) AS total,
         count(*) AS line_count,
         count(m) AS priced_count
  FROM lines
  GROUP BY id
)
UPDATE service_forms sf
SET parts = s.items, parts_breakdown = NULL
FROM splittable s
WHERE sf.id = s.id
  AND s.line_count > 1
  AND s.priced_count = s.line_count
  AND s.total = sf.parts_cost;

-- 2. Everything else becomes a single item carrying the whole parts_cost, with
--    any line breaks joined by "; " so it reads on one line.
UPDATE service_forms
SET parts = jsonb_build_array(jsonb_build_object(
      'description', COALESCE(NULLIF(regexp_replace(trim(parts_breakdown), '\s*\r?\n\s*', '; ', 'g'), ''), 'Parts'),
      'cost', parts_cost)),
    parts_breakdown = NULL
WHERE parts = '[]'::jsonb
  AND (COALESCE(trim(parts_breakdown), '') <> '' OR parts_cost > 0);
