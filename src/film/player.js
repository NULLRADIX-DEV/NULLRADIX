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

export function createPlayer({ canvas, base, onStatus = () => {}, over = 1.04, software = false }) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let man = null, segs = [];
  let fit = null, dpr = 1;
  let target = 0, dir = 1;
  let shownSrc = null, shownFrame = -1, shownKey = '', frac = 0;
  let mode = 'webcodecs';
  let status = '';
  let loadedBytes = 0, totalBytes = 1;
  let destroyed = false, started = false;
  const cache = new Map(); // gop index -> ImageBitmap[]
  // settles once the first frame can be shown (decoded bitmap or seeked <video>)
  let first;
  const firstFrame = new Promise((res, rej) => (first = { res, rej }));
  firstFrame.catch(() => {});
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

  // a failed download is not a broken film: callers wait and retry, only decode errors count
  class NetError extends Error {}
  function loadSeg(s) {
    if (!s.promise) {
      s.promise = fetch(base + s.url)
        .then(
          (r) => {
            if (!r.ok) throw new NetError(`film: ${s.url} ${r.status}`);
            return r.arrayBuffer();
          },
          (e) => {
            throw new NetError(`film: ${s.url} ${e?.message || e}`);
          },
        )
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
      } catch {
        await new Promise((r) => setTimeout(r, Math.min(8000, 800 * ++failures)));
      }
    }
  }

  /* ---------------- WebCodecs ---------------- */
  // GOPs are pipelined: up to MAX_INFLIGHT are queued at once, so the decoder never idles waiting for
  // us and frames it holds back get pushed out by the next GOP (a flush only when nothing follows).
  const MAX_INFLIGHT = 3;
  let decoder = null, decoderKey = '', decodeErrors = 0;
  let retryAt = 0, lookahead = 1, decodeFps = 0, inflight = 0, lastQueued = -1, lastDone = 0, idleSince = 0;
  const waits = new Map(); // gop -> { need, got, pending, resolve, reject } while it decodes
  const busy = new Set(); // gops scheduled but not finished

  function ensureDecoder(mp4) {
    const key = mp4.codec + ':' + mp4.description.join(',');
    if (decoder && decoder.state === 'configured' && decoderKey === key) return;
    if (!decoder || decoder.state === 'closed') {
      decoder = new VideoDecoder({
        output: (frame) => {
          if (destroyed) return frame.close();
          const idx = Math.round((frame.timestamp * man.fps) / US);
          const g = Math.floor(idx / man.gop), w = waits.get(g);
          if (software) {
            // CPU-decoded frames are kept as they are: no GPU copy competing with the compositor
            const arr = cache.get(g);
            if (arr) arr[idx % man.gop] = frame;
            else frame.close();
          } else {
            const p = createImageBitmap(frame).then(
              (bmp) => {
                frame.close();
                const arr = cache.get(g);
                if (arr) arr[idx % man.gop] = bmp;
                else bmp.close();
              },
              () => frame.close(),
            );
            w?.pending.push(p);
          }
          if (w && ++w.got >= w.need) w.resolve();
        },
        error: (e) => {
          console.warn('film decoder', e);
          for (const w of waits.values()) w.reject(e);
        },
      });
    }
    decoder.configure({
      codec: mp4.codec,
      description: mp4.description,
      optimizeForLatency: true,
      hardwareAcceleration: software ? 'prefer-software' : 'no-preference',
    });
    decoderKey = key;
  }

  async function decodeGop(g) {
    const f0 = g * man.gop, s = segOf(f0);
    if (!s.mp4) {
      setStatus('buffering');
      await loadSeg(s);
    }
    if (destroyed) return;
    ensureDecoder(s.mp4);
    const arr = new Array(man.gop);
    cache.set(g, arr);
    const li0 = f0 - s.first;
    const w = { need: Math.min(man.gop, s.count - li0), got: 0, pending: [] };
    const done = new Promise((resolve, reject) => Object.assign(w, { resolve, reject }));
    waits.set(g, w);
    lastQueued = g;
    const t0 = performance.now();
    for (let k = 0; k < w.need; k++) {
      const smp = s.mp4.samples[li0 + k];
      decoder.decode(
        new EncodedVideoChunk({
          type: k === 0 ? 'key' : 'delta',
          timestamp: Math.round(((f0 + k) * US) / man.fps),
          data: new Uint8Array(s.buf, smp.offset, smp.size),
        }),
      );
    }
    // nothing queued behind us after a moment: flush, so frames the decoder holds back come out
    setTimeout(() => {
      if (waits.get(g) === w && lastQueued === g && decoder?.state === 'configured') decoder.flush().catch(() => {});
    }, 45);
    const stall = setTimeout(() => w.reject(new Error(`film: GOP ${g} stalled`)), 5000);
    try {
      await done;
    } finally {
      clearTimeout(stall);
      waits.delete(g);
    }
    await Promise.all(w.pending);
    // throughput in frames per second, smoothed - the stage paces flights with it. With GOPs pipelined,
    // completions are spaced by decode work alone, unless the pipeline sat idle in between.
    const now = performance.now();
    const since = lastDone > idleSince ? lastDone : t0;
    const fps = w.need / Math.max(0.001, (now - since) / 1000);
    lastDone = now;
    decodeFps = decodeFps ? decodeFps * 0.7 + fps * 0.3 : fps;
    if (destroyed) {
      for (const b of arr) b?.close();
      return;
    }
    trimCache();
  }

  function trimCache() {
    const g = Math.floor(target / man.gop);
    const keys = [...cache.keys()].filter((k) => !busy.has(k)).sort((a, b) => Math.abs(a - g) - Math.abs(b - g));
    for (const k of keys.slice(Math.max(gopCap, lookahead + 2))) {
      for (const b of cache.get(k)) b?.close();
      cache.delete(k);
    }
  }

  const free = (n) => n >= 0 && n * man.gop < man.frames && !cache.has(n) && !busy.has(n);
  function nextWanted() {
    const g = Math.floor(target / man.gop);
    if (free(g)) return g;
    if (lookahead > 1) {
      // flying: keep several GOPs ready ahead of the playhead
      for (let k = 1; k <= lookahead; k++) if (free(g + k * dir)) return g + k * dir;
      return null;
    }
    const pos = target % man.gop, n = g + (dir > 0 ? 1 : -1);
    const near = dir > 0 ? pos >= man.gop - 8 : pos <= 7;
    return near && free(n) ? n : null;
  }

  function onDecodeFail(g, e) {
    for (const b of cache.get(g) || []) b?.close();
    cache.delete(g);
    if (e instanceof NetError) {
      // the network hiccuped: keep the decoder, show what we have and try again shortly
      setStatus('buffering');
      retryAt = performance.now() + 900;
      setTimeout(pump, 950);
      return;
    }
    if (!decoder) return; // the same failure already counted for another GOP in flight
    console.warn('film decode', e);
    try { decoder.close(); } catch { /* already closed */ }
    decoder = null;
    if (++decodeErrors >= 2) switchToVideo();
  }

  function pump() {
    if (destroyed || !started || mode !== 'webcodecs' || !man || performance.now() < retryAt) return;
    while (inflight < MAX_INFLIGHT) {
      const want = nextWanted();
      if (want === null) return;
      inflight++;
      busy.add(want);
      decodeGop(want)
        .then(
          () => {
            decodeErrors = 0;
            first.res();
          },
          (e) => onDecodeFail(want, e),
        )
        .finally(() => {
          if (--inflight === 0) idleSince = performance.now();
          busy.delete(want);
          if (destroyed) return;
          draw();
          pump();
        });
    }
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
      v.addEventListener('error', () => {
        setStatus('failed');
        first.rej(new Error('film: <video> fallback failed'));
      }, { once: true });
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
      if (!s.waiting) {
        s.waiting = true;
        loadSeg(s).then(
          () => ((s.waiting = false), pumpVideo()),
          () => ((s.waiting = false), setTimeout(pumpVideo, 900)),
        );
      }
      return;
    }
    const v = videoFor(s);
    if (v.readyState < 1) {
      if (!v.waiting) {
        v.waiting = true;
        v.addEventListener('loadedmetadata', () => ((v.waiting = false), pumpVideo()), { once: true });
      }
      return;
    }
    seeking = true;
    v.addEventListener(
      'seeked',
      () => {
        seeking = false;
        if (destroyed) return;
        paint(v, f);
        first.res();
        setStatus('ready');
        if (target !== f) pumpVideo();
      },
      { once: true },
    );
    v.currentTime = (f - s.first + 0.5) / man.fps;
  }

  /* ---------------- drawing ---------------- */
  // draw frame f, optionally cross-faded towards the next one (sub-frame scrolling stays fluid)
  function paint(src, f, next = null, a = 0) {
    if (!fit || destroyed) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(src, fit.ox, fit.oy, man.width * fit.k, man.height * fit.k);
    if (next && a > 0) {
      ctx.globalAlpha = a;
      ctx.drawImage(next, fit.ox, fit.oy, man.width * fit.k, man.height * fit.k);
      ctx.globalAlpha = 1;
    }
    shownSrc = src;
    shownFrame = next && a > 0 ? f + a : f;
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
    if (!src) return setStatus('buffering');
    const next = f === target && target + 1 < man.frames ? bitmapAt(target + 1) : null;
    const a = next ? Math.round(frac * 16) / 16 : 0;
    const key = `${f}:${a}`;
    if (key !== shownKey || src !== shownSrc) {
      shownKey = key;
      paint(src, f, next, a);
    }
    setStatus(f === target ? 'ready' : 'buffering');
  }

  /* ---------------- api ---------------- */
  const ready = (async () => {
    man = await (await fetch(base + 'manifest.json')).json();
    segs = man.segments.map((s) => ({ ...s, buf: null, mp4: null, promise: null }));
    totalBytes = segs.reduce((a, s) => a + s.bytes, 0) || 1;
    for (let tries = 0; ; tries++) {
      try {
        await loadSeg(segs[0]);
        break;
      } catch (e) {
        if (tries >= 3) throw e;
        await new Promise((r) => setTimeout(r, 700 * (tries + 1)));
      }
    }
    if (destroyed) return;
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
    started = true;
    if (!ok) await switchToVideo();
    else pump();
    await firstFrame;
  })();

  return {
    ready,
    get manifest() { return man; },
    get mode() { return mode; },
    get status() { return status; },
    get progress() { return loadedBytes / totalBytes; },
    get frame() { return shownFrame; },
    get decodeFps() { return decodeFps; },
    /** is frame f decoded and ready to show? (the <video> fallback can show anything, slowly) */
    has(f) {
      if (!man || f < 0 || f >= man.frames) return false;
      return mode === 'video' || !!bitmapAt(f);
    },
    setLookahead(n) {
      lookahead = Math.max(1, n);
      pump();
    },
    resize(vw, vh, ratio) {
      dpr = Math.min(ratio || 1, 2);
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      if (man) fit = coverFit(vw, vh, man.width, man.height, over);
      shownKey = '';
      if (mode === 'video') pumpVideo();
      draw();
    },
    setFrame(f) {
      if (!man) return;
      f = Math.max(0, Math.min(man.frames - 1, f));
      const base = Math.floor(f);
      frac = f - base;
      if (base !== target) dir = base > target ? 1 : -1;
      target = base;
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
