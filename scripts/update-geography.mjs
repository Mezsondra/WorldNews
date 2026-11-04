// Rebuild the small offline locator reference from a pinned upstream revision.
// No map data is fetched by the video renderer at runtime.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const output = new URL('../server/references/geography.json', import.meta.url);
const previous = JSON.parse(await readFile(output, 'utf8'));
const commit = process.argv[2] || previous.commit;
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Supply a full upstream commit SHA.');
const repository = 'https://github.com/nvkelso/natural-earth-vector';
const files = ['geojson/ne_110m_land.geojson', 'geojson/ne_110m_admin_0_countries.geojson'];
const documents = await Promise.all(files.map(async file => {
  const response = await fetch(`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${commit}/${file}`, {signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`Upstream data unavailable: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 5000000) throw new Error('Unexpected geography file size.');
  return {data:JSON.parse(bytes.toString()), hash:createHash('sha256').update(bytes).digest('hex')};
}));
const land = documents[0].data.features.flatMap(f => {
  const polygons = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  return polygons.map(polygon => polygon.map(ring => 'M'+ring.map(([lon,lat])=>`${(lon+180).toFixed(2)},${(90-lat).toFixed(2)}`).join('L')+'Z').join(''));
});
const places = documents[1].data.features.filter(f=>f.properties.ADMIN !== 'Antarctica').map(f => {
  const p = f.properties;
  let aliases = ['NAME_EN','NAME_LONG','ADMIN'].map(k=>p[k]).filter(a=>a && a.length>3);
  if (p.NAME_EN === 'Turkey') aliases.push('Türkiye');
  const extra = {USA:['United States','U.S.','USA'],GBR:['United Kingdom','U.K.'],RUS:['Russia'],KOR:['South Korea'],PRK:['North Korea']};
  aliases.push(...(extra[p.ADM0_A3] || []));
  aliases = [...new Set(aliases)].filter(a=>!['Georgia','Jordan','Chad','Turkey','Congo','Guinea'].includes(a)).sort();
  return {id:p.ADM0_A3, name:p.NAME_EN || p.ADMIN, aliases, lon:Number(p.LABEL_X.toFixed(3)), lat:Number(p.LABEL_Y.toFixed(3))};
}).sort((a,b)=>a.id.localeCompare(b.id,'en'));
await writeFile(output,JSON.stringify({provider:'Natural Earth',scale:'1:110m',commit,license:'Public domain',terms:'https://www.naturalearthdata.com/about/terms-of-use/',repository,files,hashes:documents.map(d=>d.hash),land,places})+'\n');
console.log(`Saved ${land.length} coastline paths and ${places.length} country label points at ${commit}. Inspect map frames and run visual-plan tests after updating.`);
