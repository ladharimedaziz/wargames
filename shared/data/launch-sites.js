// Where each nuclear power's warheads actually fly from: missile fields, submarine patrol areas and bomber bases,
// from open sources. Approximate on purpose. `cold` is the 1985 posture (Cold War committee), `modern` today's.
// A country with no list fires from its capital. [name, lat, lon, kind] with kind silo, sub, mobile or air.
const S = (name, lat, lon, kind = 'silo') => ({ name, lat, lon, kind });

const US_SUBS = [S('Trident submarine, North Atlantic', 52, -32, 'sub'), S('Trident submarine, North Pacific', 44, -160, 'sub')];
const RU_SUBS = [S('Missile submarine, Barents Sea', 72.5, 40, 'sub'), S('Missile submarine, Sea of Okhotsk', 55, 148, 'sub')];

export const LAUNCH_SITES = {
  cold: {
    '840': [S('Minot missile field, North Dakota', 48.4, -101.3), S('Malmstrom missile field, Montana', 47.5, -111.2), S('F.E. Warren missile field, Wyoming', 41.15, -104.9),
      ...US_SUBS, S('Grand Forks missile field, North Dakota', 47.95, -97.4), S('Whiteman missile field, Missouri', 38.7, -93.5), S('Ellsworth missile field, South Dakota', 44.1, -103.1)],
    '643': [S('Dombarovsky missile field', 51.1, 59.8), S('Uzhur missile field', 55.3, 89.8), S('Kozelsk missile field', 54.0, 35.8), ...RU_SUBS,
      S('Tatishchevo missile field', 51.7, 45.6), S('Kartaly missile field', 53.1, 60.6), S('Aleysk missile field', 52.5, 82.8)],
    // In 1985 many Soviet fields lay outside Russia; the Cold War map's SSRs hold them.
    '804': [S('Pervomaysk missile field, Ukrainian SSR', 48.0, 30.9)],
    '398': [S('Zhangiz-Tobe missile field, Kazakh SSR', 49.2, 81.2)],
    '826': [S('Polaris submarine, North Atlantic', 60, -12, 'sub')],
    '250': [S('Plateau d’Albion missile silos', 44.0, 5.5), S('French missile submarine, Bay of Biscay', 46.5, -9, 'sub'), S('Mirage IV bombers, Mont-de-Marsan', 43.9, -0.5, 'air')],
    '156': [S('Delingha missile base, Qinghai', 37.4, 97.4), S('Luoning missile base, Henan', 34.4, 111.6), S('Xuanhua missile base, Hebei', 40.6, 115.0)],
  },
  modern: {
    '840': [S('Minot missile field, North Dakota', 48.4, -101.3), S('Malmstrom missile field, Montana', 47.5, -111.2), S('F.E. Warren missile field, Wyoming', 41.15, -104.9), ...US_SUBS,
      S('B-2 bombers, Whiteman, Missouri', 38.7, -93.5, 'air')],
    '643': [S('Dombarovsky missile field', 51.1, 59.8), S('Uzhur missile field', 55.3, 89.8), S('Kozelsk missile field', 54.0, 35.8), ...RU_SUBS,
      S('Tatishchevo missile field', 51.7, 45.6), S('Teykovo mobile missiles', 56.9, 40.5, 'mobile'), S('Novosibirsk mobile missiles', 55.3, 83.0, 'mobile'), S('Irkutsk mobile missiles', 52.5, 104.3, 'mobile')],
    '826': [S('Trident submarine, North Atlantic', 60, -12, 'sub')],
    '250': [S('French missile submarine, North Atlantic', 47, -14, 'sub'), S('Rafale bombers, Saint-Dizier', 48.6, 4.9, 'air')],
    '156': [S('Yumen missile silos, Gansu', 40.1, 96.5), S('Hami missile silos, Xinjiang', 42.3, 93.0), S('Ordos missile silos, Inner Mongolia', 40.0, 107.6),
      S('Missile submarine, South China Sea', 17, 113, 'sub'), S('Luoning missile base, Henan', 34.4, 111.6)],
    '408': [S('Mobile launchers north of Pyongyang', 39.6, 125.6, 'mobile'), S('Sinpo missile submarine', 40.0, 128.4, 'sub')],
    '356': [S('Agni regiments, central India', 22.5, 79.5, 'mobile'), S('Missile submarine, Bay of Bengal', 16, 86, 'sub')],
    '586': [S('Shaheen launchers, Sargodha', 32.05, 72.67, 'mobile'), S('Shaheen launchers, Khuzdar', 27.8, 66.6, 'mobile')],
  },
};

// The site the n-th warhead of `id` flies from. Soviet SSRs' fields only count while they are part of the Union.
export function launchSite(state, id, n = 0) {
  const era = state.settings?.era === 'cold85' ? 'cold' : 'modern';
  let list = LAUNCH_SITES[era][id] || [];
  if (era === 'cold' && id === '643') {
    const C = state.countries;
    for (const ssr of ['804', '398']) if (C[ssr] && C[ssr].bloc === C['643']?.bloc && !C[ssr].nuclear?.has && /SSR$/.test(C[ssr].name)) list = [...list, ...LAUNCH_SITES.cold[ssr]];
  }
  if (!list.length) { const c = state.countries[id]; return { name: c?.name || id, lat: c?.lat, lon: c?.lon, kind: 'capital' }; }
  return list[n % list.length];
}
