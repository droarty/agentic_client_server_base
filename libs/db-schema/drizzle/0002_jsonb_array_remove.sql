-- Backs DatabasePersistor's `remove` action type. Discovered during the
-- Phase 4 event-processor port that this needs the same array-rebuild
-- pattern as jsonb_array_upsert/update_in — not a plain jsonb_set/|| one-liner
-- like update/merge/append/prepend, which have no per-element filtering and
-- so don't need a SQL function of their own.

-- Removes array element(s) at `path` where ALL `keys` match the corresponding
-- fields in `matcher` — the Postgres equivalent of Mongo's $pull-by-keys.
CREATE OR REPLACE FUNCTION jsonb_array_remove_by_keys(target jsonb, path text[], keys text[], matcher jsonb)
RETURNS jsonb AS $$
DECLARE
  existing jsonb;
  rebuilt jsonb;
BEGIN
  existing := coalesce(target #> path, '[]'::jsonb);

  SELECT coalesce(jsonb_agg(elem), '[]'::jsonb)
  INTO rebuilt
  FROM jsonb_array_elements(existing) AS elem
  WHERE NOT coalesce((SELECT bool_and(elem ->> k = matcher ->> k) FROM unnest(keys) AS k), false);

  RETURN jsonb_set(target, path, rebuilt, true);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
