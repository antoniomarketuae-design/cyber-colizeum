// Makes one AI video: poyo Seedance 2 first, then Atlas Cloud Seedance 2.0, then fal Seedance 1.5 Pro.
// Keys come from ../.env.local (private, never printed). PAID: without --go it only shows the plan and cost.
//
//   node tools/gen-video.mjs --prompt "a crowd cheering in a neon arena" [--seconds 5] [--quality 480p|720p]
//        [--aspect 9:16|16:9|1:1] [--image output/images/x.jpg] [--providers poyo,atlas,fal] [--name intro] [--go]
//
// Measured in Dreaming (Nov 2026), poyo seedance-2: 480p = 20 poyo credits per second (4 s = 80), 720p = 40 per
// second (5 s = 200). Time from text ~0.65 min per second at 480p, ~1 min at 720p; from a picture ~2.5x slower.
// poyo cannot fetch our own picture links: a first-frame picture is sent as base64 to poyo's upload endpoint.
// Atlas: model ids from the free list (bytedance/seedance-2.0/text-to-video | image-to-video); the image is sent as a
// data URL (first paid run still to confirm). fal account was LOCKED ("exhausted balance") in Nov 2026.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './lib-env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));

const seconds = Math.max(4, Math.min(15, Number(args.seconds) || 5));
const quality = args.quality === '480p' ? '480p' : '720p';
const aspect = ['9:16', '16:9', '1:1'].includes(args.aspect) ? args.aspect : '9:16';
const MODELS = {
  poyo: args['poyo-model'] || 'seedance-2',
  atlasText: 'bytedance/seedance-2.0/text-to-video',
  atlasImage: 'bytedance/seedance-2.0/image-to-video',
  falText: 'fal-ai/bytedance/seedance/v1.5/pro/text-to-video',
  falImage: 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const urlsIn = (d) => {
  const out = [];
  const push = (u) => { if (typeof u === 'string' && u.startsWith('http') && !out.includes(u)) out.push(u); };
  push(d?.video_url); push(d?.url); push(d?.video?.url); push(d?.output?.url); push(d?.output?.video_url);
  for (const f of d?.files || []) { push(f?.file_url); push(f?.url); }
  for (const o of d?.outputs || []) push(typeof o === 'string' ? o : o?.url);
  for (const o of Array.isArray(d?.output) ? d.output : []) push(typeof o === 'string' ? o : o?.url);
  return out;
};
const pickMp4 = (urls) => urls.find((u) => /\.mp4(\?|$)/i.test(u)) || urls[0];

/** The first frame as a data URL. Without the sharp package it is sent as it is (crop it to the aspect yourself). */
async function frameDataUrl(file) {
  const buf = await readFile(file);
  try {
    const sharp = (await import('sharp')).default;
    const [w, h] = aspect.split(':').map(Number);
    const height = 1280;
    const width = Math.round((height * w) / h / 2) * 2;
    const jpg = await sharp(buf).resize(width, height, { fit: 'cover' }).jpeg({ quality: 88 }).toBuffer();
    return `data:image/jpeg;base64,${jpg.toString('base64')}`;
  } catch {
    const ext = path.extname(file).slice(1).toLowerCase().replace('jpg', 'jpeg') || 'jpeg';
    return `data:image/${ext};base64,${buf.toString('base64')}`;
  }
}

async function poyo(prompt, frame, key, waitMs) {
  const base = 'https://api.poyo.ai/api/generate';
  const input = { prompt, duration: seconds, resolution: quality, aspect_ratio: aspect };
  if (frame) {
    const up = await fetch('https://api.poyo.ai/api/common/upload/base64', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64_data: frame }),
      signal: AbortSignal.timeout(60000),
    });
    const d = await up.json().catch(() => null);
    const url = d?.data?.file_url || d?.file_url || d?.url;
    if (!up.ok || !url) throw new Error(`poyo upload ${up.status}`);
    input.image_urls = [url];
  }
  const res = await fetch(`${base}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODELS.poyo, input }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`poyo submit ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (data.code && data.code >= 400) throw new Error(`poyo ${data.code}: ${data.error?.message || data.message || 'error'}`);
  const taskId = data.data?.task_id || data.task_id || data.id;
  if (!taskId) { const u = pickMp4(urlsIn(data.data || data)); if (u) return u; throw new Error('poyo: no task id'); }
  console.log(`poyo task started (${taskId}). Waiting; abandoned jobs are still charged.`);
  for (const t0 = Date.now(); Date.now() - t0 < waitMs;) {
    await sleep(8000);
    const s = await fetch(`${base}/status/${taskId}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (!s?.ok) continue;
    const body = await s.json().catch(() => ({}));
    const status = String(body.data?.status || body.status || '').toLowerCase();
    if (['completed', 'succeeded', 'success', 'finished'].includes(status)) {
      const u = pickMp4(urlsIn(body.data || body));
      if (u) return u;
      throw new Error('poyo finished without a video url');
    }
    if (['failed', 'error'].includes(status)) throw new Error(`poyo failed: ${JSON.stringify(body.data?.error_message || body.data?.error || body.error || 'unknown').slice(0, 200)}`);
  }
  throw new Error('poyo timed out');
}

async function atlas(prompt, frame, key, waitMs) {
  const base = 'https://api.atlascloud.ai/api/v1/model';
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const payload = { model: frame ? MODELS.atlasImage : MODELS.atlasText, prompt, duration: seconds, resolution: quality, aspect_ratio: aspect };
  if (frame) payload.image = frame;
  let res = await fetch(`${base}/generateVideo`, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(60000) });
  if (res.status === 404) res = await fetch(`${base}/prediction`, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`atlas submit ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const inner = data.data || data;
  const id = inner.id || inner.prediction_id || inner.task_id;
  if (!id) { const u = pickMp4(urlsIn(inner)); if (u) return u; throw new Error('atlas: no prediction id'); }
  console.log(`atlas prediction started (${id}).`);
  for (const t0 = Date.now(); Date.now() - t0 < waitMs;) {
    await sleep(8000);
    const s = await fetch(`${base}/prediction/${id}`, { headers, signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (!s?.ok) continue;
    const poll = await s.json().catch(() => ({}));
    const p = poll.data || poll;
    const status = String(p.status || '').toLowerCase();
    if (['completed', 'succeeded', 'success'].includes(status)) {
      const u = pickMp4(urlsIn(p));
      if (u) return u;
      throw new Error('atlas finished without a video url');
    }
    if (['failed', 'error', 'cancelled'].includes(status)) throw new Error(`atlas failed: ${p.error || p.message || 'unknown'}`);
  }
  throw new Error('atlas timed out');
}

async function fal(prompt, frame, key, waitMs) {
  const model = frame ? MODELS.falImage : MODELS.falText;
  const input = { prompt, duration: String(seconds), resolution: quality, aspect_ratio: aspect };
  if (frame) input.image_url = frame;
  const headers = { Authorization: `Key ${key}`, 'Content-Type': 'application/json' };
  const sub = await fetch(`https://queue.fal.run/${model}`, { method: 'POST', headers, body: JSON.stringify(input), signal: AbortSignal.timeout(30000) });
  if (!sub.ok) throw new Error(`fal ${sub.status}: ${(await sub.text()).slice(0, 200)}`);
  const job = await sub.json();
  if (!job.status_url || !job.response_url) throw new Error('fal: no request id');
  for (const t0 = Date.now(); Date.now() - t0 < waitMs;) {
    await sleep(8000);
    const s = await fetch(job.status_url, { headers, signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (!s?.ok) continue;
    const st = await s.json().catch(() => ({}));
    if (st.status === 'COMPLETED') {
      const out = await (await fetch(job.response_url, { headers, signal: AbortSignal.timeout(30000) })).json();
      const u = out.video?.url || pickMp4(urlsIn(out));
      if (u) return u;
      throw new Error('fal finished without a video');
    }
    if (st.status === 'FAILED' || st.error) throw new Error(`fal failed: ${String(st.error || 'unknown').slice(0, 200)}`);
  }
  throw new Error('fal timed out');
}

const RUN = { poyo: [poyo, 'POYO_API_KEY'], atlas: [atlas, 'ATLAS_CLOUD_API_KEY'], fal: [fal, 'FAL_API_KEY'] };
const prompt = args.prompt;
if (!prompt || prompt === true) { console.error('Give a prompt: --prompt "..."'); process.exit(1); }
const order = String(args.providers || 'poyo,atlas,fal').split(',').map((s) => s.trim()).filter((s) => RUN[s]);
const credits = seconds * (quality === '480p' ? 20 : 40);
const minutes = Math.round(seconds * (quality === '480p' ? 0.65 : 1) * (args.image ? 2.5 : 1));
console.log(`Video: ${seconds} s, ${quality}, ${aspect}${args.image ? `, first frame ${args.image}` : ''}`);
console.log(`Order: ${order.join(' -> ')} · poyo cost about ${credits} credits · about ${minutes}-${minutes * 2} minutes`);
console.log(`Prompt: ${prompt}`);
if (!args.go) { console.log('\nDry run: nothing was generated or paid. Add --go to make the video (uses credits).'); process.exit(0); }

const env = loadEnv();
const frame = args.image && args.image !== true ? await frameDataUrl(args.image) : null;
const waitMs = Math.max(20, minutes * 2.5) * 60 * 1000;
const name = String(args.name || `vid-${Date.now().toString(36)}`).replace(/[^a-z0-9._-]+/gi, '-');
const outDir = path.join(here, '..', 'output', 'videos');
await mkdir(outDir, { recursive: true });
const errors = [];
for (const p of order) {
  const [fn, keyName] = RUN[p];
  if (!env[keyName]) { errors.push(`${p}: no key`); continue; }
  const t0 = Date.now();
  try {
    const url = await fn(prompt, frame, env[keyName], waitMs);
    const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!res.ok) throw new Error(`download ${res.status}`);
    await writeFile(path.join(outDir, `${name}.mp4`), Buffer.from(await res.arrayBuffer()));
    console.log(`\nDone with ${p} in ${Math.round((Date.now() - t0) / 60000)} min: output/videos/${name}.mp4`);
    process.exit(0);
  } catch (err) {
    errors.push(`${p}: ${err.message}`);
    console.log(`${p} failed, trying the next one: ${err.message}`);
  }
}
console.error(`\nNo video: ${errors.join(' | ')}`);
process.exit(1);
