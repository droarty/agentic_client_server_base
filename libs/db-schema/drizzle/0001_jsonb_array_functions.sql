-- These three functions replace MongoDB update-operator behavior that has no
-- native JSONB equivalent (Mongo's arrayFilters, and the aggregation-pipeline
-- $slice operator's negative-index semantics). They back the `upsert`,
-- `update-in`, and `slice` action types in DatabasePersistor.ts (Phase 4).
-- The 5 simpler action types (update/merge/append/prepend/remove) are handled
-- inline with jsonb_set/|| directly in that file — no SQL function needed.

-- Finds the array element(s) at `path` matching ALL `keys` against `item`'s
-- corresponding fields; if a match exists, REPLACES it with `item` (matches
-- Mongo's $map-based single-element replace); otherwise appends `item`.
-- Supports both single-key and composite-key matching (`keys` is an array so
-- more than one field can be required to match).
CREATE OR REPLACE FUNCTION jsonb_array_upsert(target jsonb, path text[], keys text[], item jsonb)
RETURNS jsonb AS $$
DECLARE
  existing jsonb;
  has_match boolean;
  rebuilt jsonb;
BEGIN
  existing := coalesce(target #> path, '[]'::jsonb);

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(existing) AS elem
    WHERE (SELECT bool_and(elem ->> k = item ->> k) FROM unnest(keys) AS k)
  ) INTO has_match;

  IF has_match THEN
    SELECT jsonb_agg(
      CASE WHEN (SELECT bool_and(elem ->> k = item ->> k) FROM unnest(keys) AS k)
        THEN item ELSE elem END
    )
    INTO rebuilt
    FROM jsonb_array_elements(existing) AS elem;
  ELSE
    rebuilt := existing || jsonb_build_array(item);
  END IF;

  RETURN jsonb_set(target, path, coalesce(rebuilt, '[]'::jsonb), true);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
--> statement-breakpoint

-- Patches `sub_path` to `value` on every array element at `path` whose
-- `find_key` field equals `find_value` — Mongo's arrayFilters + positional
-- $[elem] update updates ALL matching elements, not just the first, and this
-- replicates that exactly (a CASE-driven full-array rebuild, since Postgres
-- has no positional-filtered array update).
-- Note: the replacement value is named new_value rather than the more obvious
-- `value` — Postgres treats bare `value` as ambiguous inside a plpgsql
-- function body (it collides with the implicit VALUE identifier used in
-- domain CHECK constraints / JSON_TABLE contexts), causing a "column
-- reference is ambiguous" error even with no actual column of that name.
CREATE OR REPLACE FUNCTION jsonb_array_update_in(target jsonb, path text[], find_key text, find_value text, sub_path text[], new_value jsonb)
RETURNS jsonb AS $$
DECLARE
  existing jsonb;
  rebuilt jsonb;
BEGIN
  existing := coalesce(target #> path, '[]'::jsonb);

  SELECT jsonb_agg(
    CASE WHEN elem ->> find_key = find_value
      THEN jsonb_set(elem, sub_path, new_value, true)
      ELSE elem END
  )
  INTO rebuilt
  FROM jsonb_array_elements(existing) AS elem;

  RETURN jsonb_set(target, path, coalesce(rebuilt, '[]'::jsonb), true);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
--> statement-breakpoint

-- Replicates Mongo's aggregation $slice operator, including its two distinct
-- argument forms as DatabasePersistor.ts calls them:
--   end_idx IS NULL -> 2-arg form { $slice: [array, n] }: start_idx is `n`
--     (positive = first n elements, negative = last |n| elements)
--   end_idx IS NOT NULL -> 3-arg form { $slice: [array, position, n] }:
--     start_idx is `position` (negative counts from the end, clamped to 0),
--     end_idx is `n` (element count from that position)
CREATE OR REPLACE FUNCTION jsonb_array_slice(target jsonb, path text[], start_idx integer, end_idx integer)
RETURNS jsonb AS $$
DECLARE
  existing jsonb;
  len integer;
  from_idx integer;
  count_n integer;
  rebuilt jsonb;
BEGIN
  existing := coalesce(target #> path, '[]'::jsonb);
  len := jsonb_array_length(existing);

  IF end_idx IS NULL THEN
    IF start_idx >= 0 THEN
      from_idx := 0;
      count_n := least(start_idx, len);
    ELSE
      count_n := least(abs(start_idx), len);
      from_idx := len - count_n;
    END IF;
  ELSE
    IF start_idx >= 0 THEN
      from_idx := least(start_idx, len);
    ELSE
      from_idx := greatest(len + start_idx, 0);
    END IF;
    count_n := greatest(end_idx, 0);
  END IF;

  SELECT coalesce(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
  INTO rebuilt
  FROM jsonb_array_elements(existing) WITH ORDINALITY AS t(elem, ord)
  WHERE ord > from_idx AND ord <= from_idx + count_n;

  RETURN jsonb_set(target, path, rebuilt, true);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
