// The Cold War map: Germany is two states. The atlas ships one Germany, so the committee that plays 1985 swaps it for a
// West and an East Germany cut along the inner-German border (shared/data/german-split.json, made offline).
export const EAST_GERMANY = '278';

// Replace the Germany feature of an atlas (`res` is '110m' or '50m') with West and East Germany.
export function splitGermany(features, res, split) {
  const part = split?.[res]; if (!part) return features;
  const out = [];
  for (const f of features) {
    if (f.id !== '276') { out.push(f); continue; }
    out.push({ ...f, geometry: part.west }, { type: 'Feature', id: EAST_GERMANY, properties: { name: 'East Germany' }, geometry: part.east });
  }
  return out;
}

// A scenario flies the split map when it is set in the Cold War.
export const splitMapFor = era => era === 'cold85';

// A committee state plays on the split map when it has an East Germany (older Cold War saves do not).
export const stateSplit = state => !!state?.countries?.[EAST_GERMANY];
