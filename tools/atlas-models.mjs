// Lists Atlas Cloud models (free, no credits): node tools/atlas-models.mjs [filter]
// Prints model ids and types only, never the key.
import { loadEnv } from './lib-env.mjs';

const env = loadEnv();
const key = env.ATLAS_CLOUD_API_KEY;
if (!key) { console.error('ATLAS_CLOUD_API_KEY missing in .env.local'); process.exit(1); }
const filter = (process.argv[2] || '').toLowerCase();

for (const url of ['https://api.atlascloud.ai/api/v1/models', 'https://api.atlascloud.ai/api/v1/model/list']) {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { console.log(url, res.status, 'not JSON'); continue; }
    const list = Array.isArray(data) ? data : data.data || data.models || data.items || [];
    if (!Array.isArray(list) || !list.length) { console.log(url, res.status, Object.keys(data).join(',')); continue; }
    const rows = list.map((m) => [m.model || m.id || m.name || m.model_id, m.type || m.category || m.task || ''].join('  '))
      .filter((r) => !filter || r.toLowerCase().includes(filter));
    console.log(`${url}: ${list.length} models${filter ? `, ${rows.length} matching "${filter}"` : ''}`);
    console.log(rows.join('\n'));
    break;
  } catch (err) {
    console.log(url, 'error', err.message);
  }
}
