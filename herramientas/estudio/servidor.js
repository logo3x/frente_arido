'use strict';
/**
 * Estudio de recursos · Frente Árido · servidor local (sin dependencias)
 *
 *  - Sirve la interfaz (index.html).
 *  - Reenvía a NVIDIA (build.nvidia.com) y a OpenRouter. Las claves solo viven aquí, nunca en el navegador.
 *  - Normaliza las respuestas: { b64, costo } en éxito; { error, tipo } en fallo, para que la interfaz
 *    decida si salta al siguiente proveedor.
 *  - Guarda las imágenes y pistas en el proyecto.
 *
 * Uso (PowerShell). Todas son opcionales; varias claves del mismo proveedor se separan con comas:
 *   $env:CLOUDFLARE_CUENTAS="idCuenta:token,idCuenta2:token2"   # Cloudflare Workers AI (gratis, ~170 imágenes/día por cuenta)
 *   $env:POLLINATIONS="0"                    # desactiva Pollinations (gratuito, sin clave; activo por defecto)
 *   $env:GEMINI_API_KEYS="AIza...,AIza..."     # Google Gemini («Nano Banana»)
 *   $env:OPENAI_API_KEYS="sk-...,sk-..."        # OpenAI (GPT Image)
 *   $env:XAI_API_KEYS="xai-..."                 # xAI (Grok Imagine)
 *   $env:OPENROUTER_API_KEY="sk-or-..."         # OpenRouter
 *   $env:NVIDIA_API_KEY="nvapi-..."             # NVIDIA: traducción de indicaciones (y FLUX si se activa)
 *   $env:ELEVENLABS_API_KEY="..."               # efectos de sonido
 *   node herramientas/estudio/servidor.js
 *
 * Variables opcionales: ESTUDIO_PUERTO (5173), ESTUDIO_SALIDA (../../public/juego), ESTUDIO_RAIZ (../..)
 * Solo para pruebas: ESTUDIO_BASE, ESTUDIO_BASE_CHAT, ESTUDIO_BASE_NVCF, ESTUDIO_BASE_OR, ESTUDIO_BASE_11
 */
const http = require('http'), fs = require('fs'), path = require('path');

const PUERTO = Number(process.env.ESTUDIO_PUERTO) || 5173;
const CLAVE = process.env.NVIDIA_API_KEY || '';
const CLAVE_OR = process.env.OPENROUTER_API_KEY || '';
const CLAVE_11 = process.env.ELEVENLABS_API_KEY || '';
// Varias claves por proveedor: VAR_KEYS="a,b" o VAR_KEY="a"
const llaves = base => String(process.env[base + '_API_KEYS'] || process.env[base + '_API_KEY'] || '').split(',').map(x => x.trim()).filter(Boolean);
const LLAVES = { gemini: llaves('GEMINI'), openai: llaves('OPENAI'), xai: llaves('XAI') };
// Cloudflare: pares «idCuenta:token»
const CF = String(process.env.CLOUDFLARE_CUENTAS || '').split(',').map(x => x.trim()).filter(x => x.includes(':')).map(x => { const i = x.indexOf(':'); return { cuenta: x.slice(0, i).trim(), token: x.slice(i + 1).trim() }; });
const POLLINATIONS = process.env.POLLINATIONS !== '0';
// Con token gratuito (enter.pollinations.ai): sin marca de agua y 1 solicitud cada 5 s. Sin token: marca de agua y 1 cada 15 s
const TOKEN_POLL = process.env.POLLINATIONS_TOKEN || '';
const BASE_GEN_POLL = process.env.ESTUDIO_BASE_GEN_POLL || 'https://gen.pollinations.ai';
const BASE_CF = process.env.ESTUDIO_BASE_CF || 'https://api.cloudflare.com';
const BASE_POLL = process.env.ESTUDIO_BASE_POLL || 'https://image.pollinations.ai';
const MODELOS_CF = ['@cf/black-forest-labs/flux-1-schnell', '@cf/stabilityai/stable-diffusion-xl-base-1.0'];
const BASE_GEMINI = process.env.ESTUDIO_BASE_GEMINI || 'https://generativelanguage.googleapis.com';
const BASE_OPENAI = process.env.ESTUDIO_BASE_OPENAI || 'https://api.openai.com';
const BASE_XAI = process.env.ESTUDIO_BASE_XAI || 'https://api.x.ai';
const DIRECTOS = {
  gemini: { nombre: 'Gemini', modelos: ['gemini-3.1-flash-image', 'gemini-2.5-flash-image'] },
  xai:    { nombre: 'Grok', modelos: ['grok-imagine-image', 'grok-imagine-image-quality'] },
  openai: { nombre: 'OpenAI', modelos: ['gpt-image-1-mini', 'gpt-image-2', 'gpt-image-2.5-flare'] }
};
const enmascarar = k => '••••' + String(k).slice(-4);
const SALIDA = path.resolve(__dirname, process.env.ESTUDIO_SALIDA || '../../public/juego');
const RAIZ = path.resolve(__dirname, process.env.ESTUDIO_RAIZ || '../..');
const BASE = process.env.ESTUDIO_BASE || 'https://ai.api.nvidia.com';
const BASE_CHAT = process.env.ESTUDIO_BASE_CHAT || 'https://integrate.api.nvidia.com';
const BASE_NVCF = process.env.ESTUDIO_BASE_NVCF || 'https://api.nvcf.nvidia.com';
const BASE_OR = process.env.ESTUDIO_BASE_OR || 'https://openrouter.ai';
const BASE_11 = process.env.ESTUDIO_BASE_11 || 'https://api.elevenlabs.io';
const MODELOS = JSON.parse(fs.readFileSync(path.join(__dirname, 'modelos.json'), 'utf8'));
const MAX_CUERPO = 30 * 1024 * 1024;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
function json(res, code, obj, extra) { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra || {})); res.end(JSON.stringify(obj)); }
function leer(req) {
  return new Promise((ok, mal) => {
    let n = 0; const partes = [];
    req.on('data', d => { n += d.length; if (n > MAX_CUERPO) { mal(new Error('Cuerpo demasiado grande')); req.destroy(); } else partes.push(d); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}')); } catch { mal(new Error('JSON inválido')); } });
  });
}
const seguro = n => String(n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const seg = t0 => ((Date.now() - t0) / 1000).toFixed(1);

// Clasificación de errores: la interfaz usa «tipo» para decidir si reintenta, salta de proveedor o desactiva uno
function clasificar(status, texto) {
  const t = String(texto || '').toLowerCase();
  if (status === 429) return /quota|exhausted|billing|limit: ?0|insufficient|credits|allocation|neurons/.test(t) ? 'credito' : 'limite';
  if (/daily free allocation|used up your|neurons/.test(t)) return 'credito';
  if (status === 401 || status === 403 || /api key not valid|invalid api key|incorrect api key|invalid_api_key|unauthenticated/.test(t)) return 'clave';
  if (status === 402 || /insufficient|credit|balance|quota/.test(t)) return 'credito';
  if (status === 404) return 'modelo';
  if (/content|safety|moderation|filtered|nsfw/.test(t) && status < 500) return 'filtro';
  if (status === 400 || status === 422) return 'parametros';
  return 'temporal';                                   // 5xx, 408, tiempo agotado, red
}

// ---------- NVIDIA (con espera asíncrona 202 → NVCF) ----------
async function llamarNvidia(url, cuerpo, limiteMs) {
  const fin = Date.now() + limiteMs;
  const hdr = { Authorization: `Bearer ${CLAVE}`, Accept: 'application/json', 'Content-Type': 'application/json' };
  let r = await fetch(url, { method: 'POST', headers: hdr, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(limiteMs) });
  let consultas = 0;
  while (r.status === 202) {
    const id = r.headers.get('nvcf-reqid'); if (!id) break;
    if (Date.now() > fin) return { status: 504, texto: 'NVIDIA mantuvo la solicitud en cola demasiado tiempo' };
    if (++consultas === 1) log(`  en cola en NVIDIA (solicitud ${id.slice(0, 8)}…)`);
    await new Promise(ok => setTimeout(ok, 2000));
    r = await fetch(`${BASE_NVCF}/v2/nvcf/pexec/status/${id}`, { headers: { Authorization: `Bearer ${CLAVE}`, Accept: 'application/json' }, signal: AbortSignal.timeout(Math.max(1000, fin - Date.now())) });
  }
  return { status: r.status, texto: await r.text(), retry: r.headers.get('retry-after') || '' };
}
async function imagenNvidia(modelo, cuerpo) {
  if (!CLAVE) return { status: 401, error: 'Falta NVIDIA_API_KEY', tipo: 'clave' };
  const m = MODELOS.imagen.find(x => x.id === modelo);
  if (!m) return { status: 400, error: 'Modelo de NVIDIA no permitido', tipo: 'modelo' };
  const r = await llamarNvidia(BASE + m.ruta, cuerpo, 170000);
  if (r.status !== 200) return { status: r.status, error: r.texto.slice(0, 200), tipo: clasificar(r.status, r.texto), retry: r.retry };
  let j = {}; try { j = JSON.parse(r.texto); } catch {}
  const a = j.artifacts && j.artifacts[0];
  if (a && a.finishReason && a.finishReason !== 'SUCCESS') return { status: 422, error: a.finishReason === 'CONTENT_FILTERED' ? 'Rechazada por el filtro de contenido' : a.finishReason, tipo: 'filtro' };
  const b64 = (a && a.base64) || j.image || (j.data && j.data[0] && j.data[0].b64_json);
  return b64 ? { status: 200, b64, costo: 0 } : { status: 502, error: 'Respuesta sin imagen', tipo: 'temporal' };
}

// ---------- OpenRouter (API de imágenes unificada) ----------
let catalogoOR = { t: 0, modelos: [] };
async function modelosOpenRouter() {
  if (!CLAVE_OR) return [];
  if (Date.now() - catalogoOR.t < 10 * 60 * 1000 && catalogoOR.modelos.length) return catalogoOR.modelos;
  const r = await fetch(BASE_OR + '/api/v1/images/models', { headers: { Authorization: `Bearer ${CLAVE_OR}`, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`OpenRouter respondió ${r.status} al listar modelos`);
  const j = await r.json();
  const lista = (j.data || j.models || (Array.isArray(j) ? j : [])).map(m => {
    const sp = m.supported_parameters || {};
    return { id: m.id, nombre: m.name || m.id, gratis: /:free$/.test(m.id),
      aspectos: (sp.aspect_ratio && sp.aspect_ratio.values) || [], resoluciones: (sp.resolution && sp.resolution.values) || [],
      semilla: !!sp.seed, transparencia: !!sp.background };
  }).filter(m => m.id);
  catalogoOR = { t: Date.now(), modelos: lista };
  return lista;
}
const ID_OR = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;
function proporcionCercana(w, h, permitidas) {
  const lista = permitidas && permitidas.length ? permitidas : ['1:1', '16:9', '9:16', '4:3', '3:4'];
  const r = w / h; let mejor = lista[0], err = 1e9;
  for (const a of lista) { const [x, y] = String(a).split(':').map(Number); if (!x || !y) continue; const e = Math.abs(x / y - r); if (e < err) { err = e; mejor = a; } }
  return mejor;
}
// Busca la imagen en las formas de respuesta conocidas (API de imágenes y chat con imágenes)
function extraerImagenOR(j) {
  const d = j.data && j.data[0], im = j.images && j.images[0], ch = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.images && j.choices[0].message.images[0];
  return (d && (d.b64_json || d.url)) || (im && (im.b64_json || im.url || (im.image_url && im.image_url.url))) || (ch && ch.image_url && ch.image_url.url) || j.image || null;
}
async function imagenOpenRouter(modelo, p) {
  if (!CLAVE_OR) return { status: 401, error: 'Falta OPENROUTER_API_KEY', tipo: 'clave' };
  if (!ID_OR.test(modelo)) return { status: 400, error: 'Identificador de modelo inválido', tipo: 'modelo' };
  const info = (await modelosOpenRouter().catch(() => [])).find(m => m.id === modelo) || {};
  const cuerpo = { model: modelo, prompt: String(p.prompt || '').slice(0, 4000), n: 1, aspect_ratio: proporcionCercana(p.ancho || 1024, p.alto || 1024, info.aspectos) };
  if (info.resoluciones && info.resoluciones.includes('1K')) cuerpo.resolution = '1K';
  if (info.semilla && Number.isInteger(p.semilla)) cuerpo.seed = p.semilla;
  if (p.transparente && info.transparencia) cuerpo.background = 'transparent';
  const r = await fetch(BASE_OR + '/api/v1/images', {
    method: 'POST', signal: AbortSignal.timeout(170000),
    headers: { Authorization: `Bearer ${CLAVE_OR}`, 'Content-Type': 'application/json', Accept: 'application/json', 'HTTP-Referer': 'http://localhost', 'X-Title': 'Frente Arido - Estudio de recursos' },
    body: JSON.stringify(cuerpo)
  });
  const texto = await r.text();
  if (!r.ok) return { status: r.status, error: texto.slice(0, 200), tipo: clasificar(r.status, texto), retry: r.headers.get('retry-after') || '' };
  let j = {}; try { j = JSON.parse(texto); } catch {}
  let v = extraerImagenOR(j);
  if (!v) return { status: 502, error: 'Respuesta de OpenRouter sin imagen', tipo: 'temporal' };
  if (/^https?:\/\//.test(v)) {                         // algunos proveedores devuelven URL: se descarga aquí
    const img = await fetch(v, { signal: AbortSignal.timeout(60000) });
    v = Buffer.from(await img.arrayBuffer()).toString('base64');
  }
  const costo = Number(j.usage && (j.usage.cost !== undefined ? j.usage.cost : j.usage.total_cost)) || 0;
  return { status: 200, b64: String(v).replace(/^data:[^;]+;base64,/, ''), costo };
}

// ---------- Proveedores directos: Gemini, xAI y OpenAI ----------
function proporcionGemini(w, h) { return proporcionCercana(w, h, ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']); }
function tamOpenAI(w, h) { const r = w / h; return r > 1.2 ? '1536x1024' : r < 0.83 ? '1024x1536' : '1024x1024'; }
async function imagenDirecta(proveedor, modelo, llave, p) {
  const conf = DIRECTOS[proveedor], k = LLAVES[proveedor][llave];
  if (!conf || !conf.modelos.includes(modelo)) return { status: 400, error: 'Modelo no permitido', tipo: 'modelo' };
  if (!k) return { status: 401, error: `Falta la clave ${llave + 1} de ${conf.nombre}`, tipo: 'clave' };
  const prompt = String(p.prompt || '').slice(0, 4000);
  let url, hdr, cuerpo;
  if (proveedor === 'gemini') {
    url = `${BASE_GEMINI}/v1beta/models/${modelo}:generateContent`;
    hdr = { 'x-goog-api-key': k };
    cuerpo = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: proporcionGemini(p.ancho || 1024, p.alto || 1024) } } };
  } else if (proveedor === 'openai') {
    url = `${BASE_OPENAI}/v1/images/generations`;
    hdr = { Authorization: `Bearer ${k}` };
    cuerpo = { model: modelo, prompt, n: 1, size: tamOpenAI(p.ancho || 1024, p.alto || 1024), quality: 'medium', output_format: 'png' };
    if (p.transparente) cuerpo.background = 'transparent';
  } else {
    url = `${BASE_XAI}/v1/images/generations`;
    hdr = { Authorization: `Bearer ${k}` };
    cuerpo = { model: modelo, prompt, n: 1, response_format: 'b64_json' };
  }
  const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(170000), headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json' }, hdr), body: JSON.stringify(cuerpo) });
  const texto = await r.text();
  if (!r.ok) return { status: r.status, error: texto.slice(0, 220), tipo: clasificar(r.status, texto), retry: r.headers.get('retry-after') || '' };
  let j = {}; try { j = JSON.parse(texto); } catch {}
  let v = null;
  if (proveedor === 'gemini') {
    const partes = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    const parte = partes.find(x => x.inlineData || x.inline_data);
    v = parte && (parte.inlineData || parte.inline_data).data;
    if (!v) { const motivo = (j.candidates && j.candidates[0] && j.candidates[0].finishReason) || (j.promptFeedback && j.promptFeedback.blockReason) || 'sin imagen';
      return { status: 422, error: 'Gemini no devolvió imagen: ' + motivo, tipo: /SAFETY|BLOCK|PROHIBITED/i.test(motivo) ? 'filtro' : 'temporal' }; }
  } else {
    const d = j.data && j.data[0]; v = d && (d.b64_json || d.url);
    if (v && /^https?:\/\//.test(v)) { const img = await fetch(v, { signal: AbortSignal.timeout(60000) }); v = Buffer.from(await img.arrayBuffer()).toString('base64'); }
  }
  return v ? { status: 200, b64: String(v).replace(/^data:[^;]+;base64,/, ''), costo: 0 } : { status: 502, error: 'Respuesta sin imagen', tipo: 'temporal' };
}

// ---------- Gratuitos: Cloudflare Workers AI y Pollinations ----------
async function imagenCloudflare(modelo, llave, p) {
  const c = CF[llave]; if (!c) return { status: 401, error: `Falta la cuenta ${llave + 1} de Cloudflare`, tipo: 'clave' };
  if (!MODELOS_CF.includes(modelo)) return { status: 400, error: 'Modelo no permitido', tipo: 'modelo' };
  // flux-1-schnell solo acepta prompt y steps; SDXL acepta tamaño y pasos
  const cuerpo = modelo.includes('flux') ? { prompt: String(p.prompt || '').slice(0, 2048), steps: 4 }
                                         : { prompt: String(p.prompt || '').slice(0, 2048), width: 1024, height: 1024, num_steps: 20 };
  let r;
  for (let intento = 0; intento < 4; intento++) {
    r = await fetch(`${BASE_CF}/client/v4/accounts/${encodeURIComponent(c.cuenta)}/ai/run/${modelo}`, {
      method: 'POST', signal: AbortSignal.timeout(120000), headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    if (r.status !== 400) break;
    // si el modelo rechaza un parámetro («Additional or unevaluated properties '/seed'»), se quita y se reintenta
    const t = await r.clone().text(), m = t.match(/unevaluated properties\s*'\/(\w+)/i);
    if (!m || !(m[1] in cuerpo) || m[1] === 'prompt') break;
    log(`  Cloudflare no acepta «${m[1]}» en ${modelo}; se reintenta sin ese parámetro`);
    delete cuerpo[m[1]];
  }
  const tipoCont = r.headers.get('content-type') || '';
  if (!r.ok) { const t = await r.text();
    if (/7003|could not route/i.test(t)) return { status: 400, error: 'El ID de cuenta de Cloudflare es incorrecto: debe ser el código de 32 caracteres que aparece en Workers AI → «Use REST API»', tipo: 'clave' };
    return { status: r.status, error: t.slice(0, 220), tipo: clasificar(r.status, t), retry: r.headers.get('retry-after') || '' }; }
  if (tipoCont.startsWith('image/')) return { status: 200, b64: Buffer.from(await r.arrayBuffer()).toString('base64'), costo: 0 };   // SDXL devuelve la imagen binaria
  const j = await r.json().catch(() => ({}));
  if (j.success === false) { const t = JSON.stringify(j.errors || j).slice(0, 220); return { status: 400, error: t, tipo: clasificar(400, t) }; }
  const v = j.result && (j.result.image || (j.result.images && j.result.images[0]));
  return v ? { status: 200, b64: String(v).replace(/^data:[^;]+;base64,/, ''), costo: 0 } : { status: 502, error: 'Cloudflare no devolvió imagen', tipo: 'temporal' };
}
async function imagenPollinations(modelo, p) {
  if (!POLLINATIONS) return { status: 403, error: 'Pollinations desactivado', tipo: 'clave' };
  const w = Math.min(1536, Math.max(256, Math.round((p.ancho || 1024) / 64) * 64)), h = Math.min(1536, Math.max(256, Math.round((p.alto || 1024) / 64) * 64));
  // tamaño de generación: al menos 768 en el lado menor (los íconos se reducen después)
  const k = Math.max(1, 768 / Math.min(w, h)), gw = Math.min(1536, Math.round(w * k / 64) * 64), gh = Math.min(1536, Math.round(h * k / 64) * 64);
  const q = new URLSearchParams({ width: gw, height: gh, seed: Number.isInteger(p.semilla) ? p.semilla : 1, nologo: 'true', private: 'true', model: modelo || 'flux' });
  const texto = encodeURIComponent(String(p.prompt || '').slice(0, 1500));
  const url = TOKEN_POLL ? `${BASE_GEN_POLL}/image/${texto}?${q}` : `${BASE_POLL}/prompt/${texto}?${q}`;
  const hdr = Object.assign({ Accept: 'image/*' }, TOKEN_POLL ? { Authorization: `Bearer ${TOKEN_POLL}` } : {});
  const r = await fetch(url, { signal: AbortSignal.timeout(150000), headers: hdr });
  if (!r.ok) { const t = await r.text();
    // 402 y 429 en Pollinations indican límite de velocidad, no falta de crédito: espera y reintenta
    if (r.status === 402 || r.status === 429) return { status: 429, error: `límite de velocidad de Pollinations (${r.status})`, tipo: 'limite', retry: TOKEN_POLL ? '6' : '16' };
    return { status: r.status, error: t.slice(0, 200), tipo: clasificar(r.status, t), retry: r.headers.get('retry-after') || '' }; }
  const tipoCont = r.headers.get('content-type') || '';
  if (!tipoCont.startsWith('image/')) return { status: 502, error: 'Pollinations no devolvió imagen', tipo: 'temporal' };
  return { status: 200, b64: Buffer.from(await r.arrayBuffer()).toString('base64'), costo: 0 };
}

// ---------- Rutas ----------
async function generar(req, res) {
  const { proveedor, modelo, cuerpo, llave } = await leer(req);
  const t0 = Date.now(), etiqueta = `${proveedor}/${modelo}${DIRECTOS[proveedor] || proveedor === 'cloudflare' ? ' clave ' + ((+llave || 0) + 1) : ''}`;
  log(`${etiqueta} → enviando`);
  try {
    const r = proveedor === 'cloudflare' ? await imagenCloudflare(modelo, +llave || 0, cuerpo || {})
            : proveedor === 'pollinations' ? await imagenPollinations(modelo, cuerpo || {})
            : DIRECTOS[proveedor] ? await imagenDirecta(proveedor, modelo, +llave || 0, cuerpo || {})
            : proveedor === 'openrouter' ? await imagenOpenRouter(modelo, cuerpo || {}) : await imagenNvidia(modelo, cuerpo || {});
    log(`${etiqueta} → ${r.status} en ${seg(t0)} s${r.error ? ' · ' + r.tipo + ': ' + String(r.error).slice(0, 120) : ''}${r.costo ? ` · USD ${r.costo.toFixed(4)}` : ''}`);
    if (r.status === 200) return json(res, 200, { b64: r.b64, costo: r.costo || 0 });
    json(res, r.status >= 400 ? r.status : 502, { error: r.error, tipo: r.tipo }, { 'Retry-After': r.retry || '' });
  } catch (e) {
    const tiempo = e.name === 'TimeoutError' || e.name === 'AbortError';
    const msg = tiempo ? 'El proveedor no respondió a tiempo' : 'Sin conexión con el proveedor: ' + (e.cause && e.cause.code || e.message);
    log(`${etiqueta} → ${msg} tras ${seg(t0)} s`);
    json(res, tiempo ? 504 : 502, { error: msg, tipo: 'temporal' });
  }
}
async function traducir(req, res) {
  const { texto } = await leer(req);
  if (!texto || String(texto).length > 6000) return json(res, 400, { error: 'Texto vacío o demasiado largo' });
  const mensajes = [
    { role: 'system', content: 'Translate the user text from Spanish into fluent English as an image-generation prompt. Keep every visual detail, color code and constraint. Output only the translation, without quotes or comments.' },
    { role: 'user', content: String(texto) }];
  const intentos = [];                                 // primero NVIDIA; si falla, OpenRouter
  if (CLAVE) intentos.push([BASE_CHAT + '/v1/chat/completions', CLAVE, MODELOS.traductor.modelo]);
  if (CLAVE_OR) intentos.push([BASE_OR + '/api/v1/chat/completions', CLAVE_OR, MODELOS.traductor.openrouter]);
  for (const [url, clave, modelo] of intentos) {
    try {
      const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(45000), headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ model: modelo, temperature: 0.2, max_tokens: 900, messages: mensajes }) });
      const j = await r.json().catch(() => ({}));
      const out = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (r.ok && out) return json(res, 200, { texto: out.trim(), modelo });
      log(`Traducción con ${modelo} falló (${r.status})`);
    } catch (e) { log(`Traducción con ${modelo} falló: ${e.name === 'TimeoutError' ? 'sin respuesta' : e.message}`); }
  }
  json(res, 502, { error: 'Ningún traductor disponible' });
}
async function efecto11(req, res) {
  if (!CLAVE_11) return json(res, 500, { error: 'Falta ELEVENLABS_API_KEY' });
  const { texto, duracion, bucle } = await leer(req);
  const cuerpo = { text: String(texto || '').slice(0, 1000), prompt_influence: 0.5 };
  if (duracion) cuerpo.duration_seconds = Math.max(0.5, Math.min(30, +duracion));
  if (bucle) cuerpo.loop = true;
  const r = await fetch(BASE_11 + '/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST', signal: AbortSignal.timeout(120000), headers: { 'xi-api-key': CLAVE_11, 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify(cuerpo)
  });
  if (!r.ok) return json(res, r.status, { error: (await r.text()).slice(0, 200) }, { 'Retry-After': r.headers.get('retry-after') || '' });
  json(res, 200, { b64: Buffer.from(await r.arrayBuffer()).toString('base64') });
}
async function probarLlave(nombre, url, hdr) {
  const t0 = Date.now();
  try { const r = await fetch(url, { headers: Object.assign({ Accept: 'application/json' }, hdr), signal: AbortSignal.timeout(20000) });
    const t = r.ok ? '' : (await r.text()).slice(0, 140);
    return { proveedor: nombre, ok: r.ok, detalle: r.ok ? `conexión y clave correctas (${seg(t0)} s)` : `${clasificar(r.status, t)} (${r.status}): ${t}` }; }
  catch (e) { return { proveedor: nombre, ok: false, detalle: e.name === 'TimeoutError' ? 'sin respuesta en 20 s (red o firewall)' : 'sin conexión: ' + (e.cause && e.cause.code || e.message) }; }
}
async function diagnostico(req, res) {
  const resultados = [];
  // Verificación de claves sin generar imágenes (no consume créditos)
  for (const [i, c] of CF.entries()) resultados.push(await probarLlave(`Cloudflare cuenta ${i + 1} ${enmascarar(c.cuenta)}`, `${BASE_CF}/client/v4/user/tokens/verify`, { Authorization: `Bearer ${c.token}` }));
  if (POLLINATIONS) resultados.push(await probarLlave('Pollinations (sin clave)', `${BASE_POLL}/models`, {}));
  for (const [i, k] of LLAVES.gemini.entries()) resultados.push(await probarLlave(`Gemini clave ${i + 1} ${enmascarar(k)}`, `${BASE_GEMINI}/v1beta/models?pageSize=1`, { 'x-goog-api-key': k }));
  for (const [i, k] of LLAVES.xai.entries()) resultados.push(await probarLlave(`Grok clave ${i + 1} ${enmascarar(k)}`, `${BASE_XAI}/v1/models`, { Authorization: `Bearer ${k}` }));
  for (const [i, k] of LLAVES.openai.entries()) resultados.push(await probarLlave(`OpenAI clave ${i + 1} ${enmascarar(k)}`, `${BASE_OPENAI}/v1/models`, { Authorization: `Bearer ${k}` }));
  if (CLAVE) {
    const t0 = Date.now();
    try { const r = await imagenNvidia(MODELOS.imagen[0].id, { prompt: 'a small desert outpost at sunset', width: 768, height: 768, seed: 1, steps: 4 });
      resultados.push({ proveedor: 'NVIDIA', ok: r.status === 200, detalle: r.status === 200 ? `imagen de prueba en ${seg(t0)} s` : `${r.tipo} (${r.status}): ${String(r.error).slice(0, 120)}` }); }
    catch (e) { resultados.push({ proveedor: 'NVIDIA', ok: false, detalle: e.name === 'TimeoutError' ? 'sin respuesta en el tiempo límite' : 'sin conexión: ' + (e.cause && e.cause.code || e.message) }); }
  } else resultados.push({ proveedor: 'NVIDIA', ok: false, detalle: 'sin NVIDIA_API_KEY' });
  if (CLAVE_OR) {
    try { const m = await modelosOpenRouter(); resultados.push({ proveedor: 'OpenRouter', ok: m.length > 0, detalle: `${m.length} modelos de imagen disponibles (${m.filter(x => x.gratis).length} gratuitos)` }); }
    catch (e) { resultados.push({ proveedor: 'OpenRouter', ok: false, detalle: e.message }); }
  } else resultados.push({ proveedor: 'OpenRouter', ok: false, detalle: 'sin OPENROUTER_API_KEY' });
  resultados.forEach(r => log(`Diagnóstico ${r.proveedor}: ${r.ok ? 'correcto' : 'falló'} · ${r.detalle}`));
  json(res, 200, { resultados });
}
async function guardar(req, res) {
  const { nombre, tipo, b64, ruta } = await leer(req);
  const buf = Buffer.from(String(b64 || '').replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (ruta) {
    const r = String(ruta).replace(/\\/g, '/');
    if (!/^public\/[a-z0-9_\-\/]+\.(png|jpg|webp|wav|mp3|ogg)$/.test(r) || r.includes('..')) return json(res, 400, { error: 'Ruta no permitida: ' + r.slice(0, 80) });
    const archivo = path.join(RAIZ, r);
    if (!archivo.startsWith(path.join(RAIZ, 'public'))) return json(res, 400, { error: 'Ruta fuera de public/' });
    // Si ya existe, se respalda en arte/imagenes/respaldos/<fecha>/ antes de sobrescribir (no se pierden diseños anteriores)
    if (fs.existsSync(archivo)) {
      const resp = path.join(RAIZ, 'arte', 'imagenes', 'respaldos', new Date().toISOString().slice(0, 10), path.relative(path.join(RAIZ, 'public'), archivo));
      if (!fs.existsSync(resp)) { fs.mkdirSync(path.dirname(resp), { recursive: true }); fs.copyFileSync(archivo, resp); }
    }
    fs.mkdirSync(path.dirname(archivo), { recursive: true }); fs.writeFileSync(archivo, buf);
    return json(res, 200, { archivo: r, bytes: buf.length });
  }
  const n = seguro(nombre); if (!n || !b64) return json(res, 400, { error: 'Datos incompletos' });
  const ext = buf[0] === 0x89 ? 'png' : buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WAVE' ? 'wav' : buf.slice(0, 4).toString() === 'RIFF' ? 'webp' : buf.slice(0, 3).toString() === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0 && tipo === 'audio') ? 'mp3' : buf[0] === 0xff ? 'jpg' : null;
  if (!ext) return json(res, 400, { error: 'Formato no reconocido' });
  const carpeta = path.join(SALIDA, tipo === 'audio' ? 'audio' : 'arte');
  fs.mkdirSync(carpeta, { recursive: true });
  const archivo = path.join(carpeta, `${n}.${ext}`); fs.writeFileSync(archivo, buf);
  json(res, 200, { archivo: path.relative(RAIZ, archivo).replace(/\\/g, '/'), bytes: buf.length });
}

const servidor = http.createServer(async (req, res) => {
  const ip = req.socket.remoteAddress || '';
  if (!/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(ip)) { res.writeHead(403); return res.end(); }   // solo este equipo
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
    }
    if (req.method === 'GET' && req.url === '/api/estado') return json(res, 200, { clave: !!CLAVE, openrouter: !!CLAVE_OR, eleven: !!CLAVE_11, salida: SALIDA, raiz: RAIZ, modelos: MODELOS,
      cloudflare: { modelos: MODELOS_CF, cuentas: CF.map(c => enmascarar(c.cuenta)) }, pollinations: POLLINATIONS, pollToken: !!TOKEN_POLL,
      directos: Object.fromEntries(Object.entries(DIRECTOS).map(([id, c]) => [id, { nombre: c.nombre, modelos: c.modelos, llaves: LLAVES[id].map(enmascarar) }])) });
    if (req.method === 'GET' && req.url === '/api/modelos-openrouter') {
      try { return json(res, 200, { modelos: await modelosOpenRouter() }); } catch (e) { return json(res, 502, { error: e.message, modelos: [] }); }
    }
    if (req.method === 'POST' && req.url === '/api/generar') return await generar(req, res);
    if (req.method === 'POST' && req.url === '/api/traducir') return await traducir(req, res);
    if (req.method === 'POST' && req.url === '/api/diagnostico') return await diagnostico(req, res);
    if (req.method === 'POST' && req.url === '/api/efecto11') return await efecto11(req, res);
    if (req.method === 'POST' && req.url === '/api/guardar') return await guardar(req, res);
    res.writeHead(404); res.end();
  } catch (e) { if (!res.headersSent) json(res, 400, { error: e.message }); }
});
process.on('uncaughtException', e => log('Error no controlado (el estudio sigue activo):', e.message));
process.on('unhandledRejection', e => log('Error no controlado (el estudio sigue activo):', e && e.message));
servidor.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `El puerto ${PUERTO} está ocupado. Cierre la otra instancia o use $env:ESTUDIO_PUERTO="5174".` : e.message);
  process.exit(1);
});
servidor.listen(PUERTO, '127.0.0.1', () => {
  log(`Estudio de recursos en http://localhost:${PUERTO}`);
  log(`Cloudflare: ${CF.length} cuenta(s) · Pollinations: ${POLLINATIONS ? (TOKEN_POLL ? 'activo con token (sin marca de agua)' : 'activo sin token (con marca de agua, 1 imagen cada 15 s)') : 'no'}`);
  CF.forEach((c, i) => { if (!/^[a-f0-9]{32}$/i.test(c.cuenta)) log(`ADVERTENCIA: el ID de la cuenta ${i + 1} de Cloudflare no parece válido (debe tener 32 caracteres hexadecimales).`); });
  log(`Gemini: ${LLAVES.gemini.length} clave(s) · Grok: ${LLAVES.xai.length} · OpenAI: ${LLAVES.openai.length} · OpenRouter: ${CLAVE_OR ? 1 : 0} · NVIDIA: ${CLAVE ? 1 : 0} · ElevenLabs: ${CLAVE_11 ? 1 : 0}`);
  if (!CF.length && !POLLINATIONS && !CLAVE && !CLAVE_OR && !LLAVES.gemini.length && !LLAVES.openai.length && !LLAVES.xai.length) log('ADVERTENCIA: no hay claves de imagen definidas en esta ventana de PowerShell.');
  log(`Salida: ${SALIDA}`);
});
