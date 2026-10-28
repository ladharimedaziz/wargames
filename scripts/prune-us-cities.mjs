// Keeps only the larger places in client/data/us-cities.json (default: 40 square kilometres of land and up), so the hollow city
// outlines stay light. Usage: node scripts/prune-us-cities.mjs [min square km]
import { readFileSync, writeFileSync } from 'node:fs';
import { feature, quantize } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, simplify, quantile } from 'topojson-simplify';
const min = Number(process.argv[2]) || 40, file = 'client/data/us-cities.json';
const t = JSON.parse(readFileSync(file, 'utf8'));
const fs = feature(t, t.objects.cities).features.filter(f => f.properties.a >= min);
const pre = presimplify(topology({ cities: { type: 'FeatureCollection', features: fs } }, 1e6));
writeFileSync(file, JSON.stringify(quantize(simplify(pre, quantile(pre, 0.4)), 1e5)));
console.log('kept', fs.length);
