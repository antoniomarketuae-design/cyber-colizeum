// Makes one AI picture: poyo first, then Atlas Cloud, then fal (the order we use in Dreaming and NexFlow).
// Keys come from ../.env.local (private, never printed). PAID: without --go it only shows what it would do.
//
//   node tools/gen-image.mjs --prompt "a neon arena at night" [--look photo|raw] [--size 1:1|9:16|16:9]
//        [--providers poyo,atlas,fal] [--name arena-hero] [--go]
//
// Models (2026-11-13): poyo nano-banana-2 (worked in Dreaming, ~27-31 s) · Atlas google/nano-banana-2/text-to-image
// (listed by the free model list; first paid run still to confirm the reply shape) · fal fal-ai/nano-banana-2
// (fal account was LOCKED "exhausted balance" in Nov 2026). Saves to ../output/images/<name>.<ext>; if the
// `sharp` package is installed (npm i sharp in tools/) it also writes a 1024 px WebP (~50 KB instead of ~6 MB).
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './lib-env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));

const MODELS = {
  poyo: args['poyo-model'] || 'nano-banana-2',
  atlas: args['atlas-model'] || 'google/nano-banana-2/text-to-image',
  fal: args['fal-model'] || 'fal-ai/nano-banana-2',
};
const SIZES = { '1:1': [1024, 1024], '9:16': [768, 1365], '16:9': [1365, 768] };
const size = SIZES[args.size] ? args.size : '1:1';

/** Our house rule from Dreaming: realistic photographs unless asked otherwise ("cartoonised" was rejected). */
function buildPrompt(text, look) {
  const scene = String(text || '').replace(/\s+/g, ' ').trim();
  if (look === 'raw') return scene;
  return [
    `A photorealistic cinematic photograph: ${scene}`,
    'Shot on a full-frame camera with a 35mm lens, natural realistic lighting, true-to-life textures and materials, high detail.',
    'Not a painting, not an illustration, not a cartoon, not 3D render, not anime.',
    'No text, no letters, no watermark, no logos. Any people are ordinary, anonymous adults who do not resemble any real or famous person.',
  ].join(' ');
}

const urlsIn = (d) => {
  const out = [];
  const push = (u) => { if (typeof u === 'string' && u.startsWith('http') && !out.includes(u)) out.push(u); };
  push(d?.image_url); push(d?.url); push(d?.output?.url); push(d?.output?.image_url);
  for (const f of d?.files || []) { push(f?.file_url); push(f?.url); }
  for (const i of d?.images || []) push(typeof i === 'string' ? i : i?.url);
  for (const o of d?.outputs || []) push(typeof o === 'string' ? o : o?.url);
  for (const o of Array.isArray(d?.output) ? d.output : []) push(typeof o === 'string' ? o : o?.url);
  return out;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function poyo(prompt, key) {
  const base = 'https://api.poyo.ai/api/generate';
  const res = await fetch(`${base}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODELS.poyo, input: { prompt, size, num_images: 1 } }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`poyo submit ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  // poyo reports errors (low balance, unknown model) as HTTP 200 with a "code" field.
  if (data.code && data.code >= 400) throw new Error(`poyo ${data.code}: ${data.error?.message || data.message || 'error'}`);
  const direct = urlsIn(data.data || data)[0];
  const taskId = data.data?.task_id || data.data?.taskId || data.task_id || data.data?.id || data.id;
  if (!taskId) { if (direct) return direct; throw new Error(`poyo: unexpected reply ${JSON.stringify(data).slice(0, 160)}`); }
  for (const t0 = Date.now(); Date.now() - t0 < 4 * 60 * 1000;) {
    await sleep(4000);
    const s = await fetch(`${base}/status/${taskId}`, { headers: { Authorization: `Bearer ${key}` } }).catch(() => null);
    if (!s?.ok) continue;
    const body = await s.json().catch(() => ({}));
    const status = String(body.data?.status || body.status || '').toLowerCase();
    if (['completed', 'succeeded', 'success', 'finished'].includes(status)) {
      const url = urlsIn(body.data || body)[0];
      if (url) return url;
      throw new Error('poyo finished without an image url');
    }
    if (['failed', 'error'].includes(status)) throw new Error(`poyo failed: ${body.data?.error || body.error || 'unknown'}`);
  }
  throw new Error('poyo timed out');
}

async function atlas(prompt, key) {
  const base = 'https://api.atlascloud.ai/api/v1/model';
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const body = JSON.stringify({ model: MODELS.atlas, prompt, aspect_ratio: size, num_images: 1 });
  // Atlas documents generateImage for pictures; NexFlow's video code submits to /prediction. Try both.
  let res = await fetch(`${base}/generateImage`, { method: 'POST', headers, body, signal: AbortSignal.timeout(30000) });
  if (res.status === 404) res = await fetch(`${base}/prediction`, { method: 'POST', headers, body, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`atlas submit ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const inner = data.data || data;
  const direct = urlsIn(inner)[0];
  const id = inner.id || inner.prediction_id || inner.task_id;
  if (!id) { if (direct) return direct; throw new Error(`atlas: unexpected reply ${JSON.stringify(data).slice(0, 160)}`); }
  for (const t0 = Date.now(); Date.now() - t0 < 4 * 60 * 1000;) {
    await sleep(4000);
    const s = await fetch(`${base}/prediction/${id}`, { headers }).catch(() => null);
    if (!s?.ok) continue;
    const poll = await s.json().catch(() => ({}));
    const p = poll.data || poll;
    const status = String(p.status || '').toLowerCase();
    if (['completed', 'succeeded', 'success'].includes(status)) {
      const url = urlsIn(p)[0];
      if (url) return url;
      throw new Error('atlas finished without an image url');
    }
    if (['failed', 'error', 'cancelled'].includes(status)) throw new Error(`atlas failed: ${p.error || p.message || 'unknown'}`);
  }
  throw new Error('atlas timed out');
}

async function fal(prompt, key) {
  const [width, height] = SIZES[size];
  const res = await fetch(`https://fal.run/${MODELS.fal}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image_size: { width, height }, num_images: 1 }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`fal ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const url = (await res.json()).images?.[0]?.url;
  if (!url) throw new Error('fal returned no image');
  return url;
}

const RUN = { poyo: [poyo, 'POYO_API_KEY'], atlas: [atlas, 'ATLAS_CLOUD_API_KEY'], fal: [fal, 'FAL_API_KEY'] };

const text = args.prompt;
if (!text || text === true) { console.error('Give a prompt: --prompt "..."'); process.exit(1); }
const prompt = buildPrompt(text, args.look === 'raw' ? 'raw' : 'photo');
const order = String(args.providers || 'poyo,atlas,fal').split(',').map((s) => s.trim()).filter((s) => RUN[s]);
const env = loadEnv();

console.log(`Prompt: ${prompt}\nSize: ${size}\nOrder: ${order.map((p) => `${p} (${MODELS[p]})`).join(' -> ')}`);
if (!args.go) { console.log('\nDry run: nothing was generated or paid. Add --go to make the picture (uses credits).'); process.exit(0); }

const name = String(args.name || `img-${Date.now().toString(36)}`).replace(/[^a-z0-9._-]+/gi, '-');
const outDir = path.join(here, '..', 'output', 'images');
await mkdir(outDir, { recursive: true });
const errors = [];
for (const p of order) {
  const [fn, keyName] = RUN[p];
  if (!env[keyName]) { errors.push(`${p}: no key`); continue; }
  const t0 = Date.now();
  try {
    const url = await fn(prompt, env[keyName]);
    const img = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!img.ok) throw new Error(`download ${img.status}`);
    const buf = Buffer.from(await img.arrayBuffer());
    const type = img.headers.get('content-type') || '';
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
    await writeFile(path.join(outDir, `${name}.${ext}`), buf);
    let webp = '';
    try {
      const sharp = (await import('sharp')).default;
      const [w, h] = SIZES[size];
      await writeFile(path.join(outDir, `${name}.webp`), await sharp(buf).resize(w, h, { fit: 'cover' }).webp({ quality: 82 }).toBuffer());
      webp = ` + ${name}.webp`;
    } catch {}
    console.log(`\nDone with ${p} in ${Math.round((Date.now() - t0) / 1000)} s: output/images/${name}.${ext}${webp}`);
    process.exit(0);
  } catch (err) {
    errors.push(`${p}: ${err.message}`);
    console.log(`${p} failed, trying the next one: ${err.message}`);
  }
}
console.error(`\nNo picture: ${errors.join(' | ')}`);
process.exit(1);
