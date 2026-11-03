import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const geography = JSON.parse(await readFile(new URL('../server/references/geography.json', import.meta.url), 'utf8'));
const file = 'geojson/ne_50m_populated_places_simple.geojson';
const response = await fetch(`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${geography.commit}/${file}`, {signal:AbortSignal.timeout(30000)});
if (!response.ok) throw new Error(`Media-place reference unavailable: ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
if (bytes.length > 5000000) throw new Error('Unexpected media-place reference size.');
const entries = new Map();
for (const feature of JSON.parse(bytes).features) {
 const p = feature.properties;
 for (const name of [p.name,p.nameascii,p.namepar,p.namealt].filter(s => typeof s === 'string' && s.length >= 4 && s.length <= 60)) {
  if (['Reading','Mobile','Orange','George','Victoria','Hamilton','Washington'].includes(name)) continue;
  const group = entries.get(name) || new Set();group.add(p.adm0_a3);entries.set(name,group);
 }
}
const places = [...entries].filter(([,ids])=>ids.size===1).map(([name,ids])=>({name,country:[...ids][0]})).sort((a,b)=>a.name.localeCompare(b.name,'en'));
await writeFile(new URL('../server/references/media-places.json', import.meta.url), JSON.stringify({provider:'Natural Earth',license:'Public domain',commit:geography.commit,file,hash:createHash('sha256').update(bytes).digest('hex'),terms:geography.terms,purpose:'Conservative conflicting-place filter; never event geolocation or proof of image identity.',places})+'\n');
console.log(`Saved ${places.length} media-context place aliases.`);
