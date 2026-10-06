/**
 * Film player: shows frame `f` of the pre-rendered film on a canvas, as fast as scrolling asks.
 *
 * The film ships as H.264 segments with a keyframe every `gop` frames and no B-frames, so any
 * frame is at most one GOP of decoding away. WebCodecs decodes whole GOPs into ImageBitmaps;
 * a small LRU keeps the GOPs around the playhead and the next one in scroll direction is
 * prefetched. Whatever is missing, the nearest decoded frame stays on screen.
 * Without WebCodecs (or after repeated decode errors) it falls back to seeking <video>s.
 */
import { parseMp4 } from './mp4.js';
import { coverFit } from '../stage/cover.js';

const US = 1e6;

export function createPlayer({ canvas, base, onStatus = () => {}, over = 1.04 }) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let man = null, segs = [];
  let fit = null, dpr = 1;
  let target = 0, dir = 1;
  let shownSrc = null, shownFrame = -1;
  let mode = 'webcodecs';
  let status = '';
  let loadedBytes = 0, totalBytes = 1;
  let destroyed = false;
  const cache = new Map(); // gop index -> ImageBitmap[]
  const gopCap = (navigator.deviceMemory || 4) >= 8 ? 4 : 2;

  const setStatus = (s) => {
    if (s !== status) {
      status = s;
      onStatus(s);
    }
  };

  /* ---------------- loading ---------------- */
  const segOf = (f) => segs.find((s) => f >= s.first && f < s.first + s.count) || segs[segs.length - 1];
  const segDist = (s) => (target < s.first ? s.first - target : Math.max(0, target - (s.first + s.count - 1)));

  function loadSeg(s) {
    if (!s.promise) {
      s.promise = fetch(base + s.url)
        .then((r) => {
          if (!r.ok) throw new Error(`film: ${s.url} ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          s.buf = buf;
          s.mp4 = parseMp4(buf);
          loadedBytes += s.bytes;
          onStatus(status); // progress changed
        })
        .catch((e) => {
          s.promise = null; // allow a retry
          throw e;
        });
    }
    return s.promise;
  }

  async function loadRest() {
    let failures = 0;
    while (!destroyed) {
      const next = segs.filter((s) => !s.buf && !s.promise).sort((a, b) => segDist(a) - segDist(b))[0];
      if (!next) {
        if (segs.every((s) => s.buf)) return;
        await Promise.allSettled(segs.map((s) => s.promise).filter(Boolean));
        continue;
      }
      try {
        await loadSeg(next);
        failures = 0;
      } catch (e) {
        if (++failures > 4) return console.warn(e);
        await new Promise((r) => setTimeout(r, 800 * failures));
      }
    }
  }

  /* ---------------- WebCodecs ---------------- */
  let decoder = null, decoderKey = '', job = null, decodeErrors = 0;
  let decoding = false;

  function ensureDecoder(mp4) {
    const key = mp4.codec + ':' + mp4.description.join(',');
    if (decoder && decoder.state === 'configured' && decoderKey === key) return;
    if (!decoder || decoder.state === 'closed') {
      decoder = new VideoDecoder({
        output: (frame) => {
          const idx = Math.round((frame.timestamp * man.fps) / US);
          const j = job;
          const p = createImageBitmap(frame).then(
            (bmp) => {
              frame.close();
              const arr = cache.get(Math.floor(idx / man.gop));
              if (arr) arr[idx % man.gop] = bmp;
              else bmp.close();
            },
            () => frame.close(),
          );
          if (j) j.push(p);
        },
        error: (e) => console.warn('film decoder', e),
      });
    }
    decoder.configure({ codec: mp4.codec, description: mp4.description, optimizeForLatency: true });
    decoderKey = key;
  }

  async function decodeGop(g) {
    const f0 = g * man.gop, s = segOf(f0);
    if (!s.mp4) {
      setStatus('buffering');
      await loadSeg(s);
    }
    ensureDecoder(s.mp4);
    cache.set(g, new Array(man.gop));
    const pending = [];
    job = pending;
    const li0 = f0 - s.first;
    for (let k = 0; k < man.gop && li0 + k < s.count; k++) {
      const smp = s.mp4.samples[li0 + k];
      decoder.decode(
        new EncodedVideoChunk({
          type: k === 0 ? 'key' : 'delta',
          timestamp: Math.round(((f0 + k) * US) / man.fps),
          data: new Uint8Array(s.buf, smp.offset, smp.size),
        }),
      );
    }
    await decoder.flush();
    await Promise.all(pending);
    job = null;
    trimCache();
  }

  function trimCache() {
    const g = Math.floor(target / man.gop);
    const keys = [...cache.keys()].sort((a, b) => Math.abs(a - g) - Math.abs(b - g));
    for (const k of keys.slice(gopCap)) {
      for (const b of cache.get(k)) b?.close();
      cache.delete(k);
    }
  }

  async function pump() {
    if (decoding || destroyed || mode !== 'webcodecs' || !man) return;
    const g = Math.floor(target / man.gop);
    let want = null;
    if (!cache.has(g)) want = g;
    else {
      const pos = target % man.gop, n = g + (dir > 0 ? 1 : -1);
      const near = dir > 0 ? pos >= man.gop - 8 : pos <= 7;
      if (near && n >= 0 && n * man.gop < man.frames && !cache.has(n)) want = n;
    }
    if (want === null) return;
    decoding = true;
    try {
      await decodeGop(want);
      decodeErrors = 0;
    } catch (e) {
      console.warn('film decode', e);
      cache.delete(want);
      job = null;
      try { decoder?.close(); } catch { /* already closed */ }
      decoder = null;
      if (++decodeErrors >= 2) await switchToVideo();
    }
    decoding = false;
    draw();
    pump();
  }

  /* ---------------- <video> fallback ---------------- */
  const vids = new Map();
  let seeking = false;

  function videoFor(s) {
    let v = vids.get(s);
    if (!v) {
      v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.src = URL.createObjectURL(new Blob([s.buf], { type: 'video/mp4' }));
      v.addEventListener('error', () => setStatus('failed'), { once: true });
      vids.set(s, v);
    }
    return v;
  }

  async function switchToVideo() {
    mode = 'video';
    for (const arr of cache.values()) for (const b of arr) b?.close();
    cache.clear();
    try { decoder?.close(); } catch { /* fine */ }
    decoder = null;
    setStatus('fallback');
    pumpVideo();
  }

  function pumpVideo() {
    if (seeking || destroyed || mode !== 'video') return;
    const f = target, s = segOf(f);
    if (!s.buf) {
      setStatus('buffering');
      loadSeg(s).then(pumpVideo, () => {});
      return;
    }
    const v = videoFor(s);
    if (v.readyState < 1) {
      v.addEventListener('loadedmetadata', pumpVideo, { once: true });
      return;
    }
    seeking = true;
    v.addEventListener(
      'seeked',
      () => {
        seeking = false;
        paint(v, f);
        setStatus('ready');
        if (target !== f) pumpVideo();
      },
      { once: true },
    );
    v.currentTime = (f - s.first + 0.5) / man.fps;
  }

  /* ---------------- drawing ---------------- */
  function paint(src, f) {
    if (!fit) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(src, fit.ox, fit.oy, man.width * fit.k, man.height * fit.k);
    shownSrc = src;
    shownFrame = f;
  }

  function bitmapAt(f) {
    const arr = cache.get(Math.floor(f / man.gop));
    return arr ? arr[f % man.gop] : null;
  }

  function draw() {
    if (!man || mode !== 'webcodecs') return;
    let f = target, src = bitmapAt(f);
    if (!src) {
      // nearest decoded frame, preferring the side we are coming from
      for (let d = 1; d < 90 && !src; d++) {
        src = bitmapAt(target - d * dir) || bitmapAt(target + d * dir);
        if (src) f = bitmapAt(target - d * dir) ? target - d * dir : target + d * dir;
      }
    }
    if (src && src !== shownSrc) paint(src, f);
    setStatus(f === target && src ? 'ready' : 'buffering');
  }

  /* ---------------- api ---------------- */
  const ready = (async () => {
    man = await (await fetch(base + 'manifest.json')).json();
    segs = man.segments.map((s) => ({ ...s, buf: null, mp4: null, promise: null }));
    totalBytes = segs.reduce((a, s) => a + s.bytes, 0) || 1;
    await loadSeg(segs[0]);
    loadRest();
    let ok = typeof VideoDecoder === 'function';
    if (ok) {
      try {
        const m = segs[0].mp4;
        ok = (await VideoDecoder.isConfigSupported({ codec: m.codec, description: m.description })).supported;
      } catch {
        ok = false;
      }
    }
    if (!ok) await switchToVideo();
    else {
      await decodeGop(0);
      draw();
    }
  })();

  return {
    ready,
    get manifest() { return man; },
    get mode() { return mode; },
    get status() { return status; },
    get progress() { return loadedBytes / totalBytes; },
    get frame() { return shownFrame; },
    resize(vw, vh, ratio) {
      dpr = Math.min(ratio || 1, 2);
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      if (man) fit = coverFit(vw, vh, man.width, man.height, over);
      const src = shownSrc;
      shownSrc = null;
      if (src && mode === 'webcodecs') paint(src, shownFrame);
      else if (mode === 'video') pumpVideo();
      draw();
    },
    setFrame(f) {
      if (!man) return;
      f = Math.max(0, Math.min(man.frames - 1, Math.round(f)));
      if (f === target && shownFrame === f) return;
      if (f !== target) dir = f > target ? 1 : -1;
      target = f;
      if (mode === 'video') pumpVideo();
      else {
        draw();
        pump();
      }
    },
    destroy() {
      destroyed = true;
      for (const arr of cache.values()) for (const b of arr) b?.close();
      cache.clear();
      try { decoder?.close(); } catch { /* fine */ }
      for (const v of vids.values()) URL.revokeObjectURL(v.src);
    },
  };
}
