/**
 * Minimal MP4 demuxer for the film segments: one H.264 video track, any chunk layout.
 * Returns what WebCodecs needs to decode it - the codec string, the avcC record
 * (VideoDecoder `description`) and every sample's byte range + keyframe flag.
 */

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);

function* boxes(view, start, end) {
  let p = start;
  while (p + 8 <= end) {
    let size = view.getUint32(p);
    const type = String.fromCharCode(view.getUint8(p + 4), view.getUint8(p + 5), view.getUint8(p + 6), view.getUint8(p + 7));
    let header = 8;
    if (size === 1) {
      size = Number(view.getBigUint64(p + 8));
      header = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < header || p + size > end) return;
    yield { type, start: p + header, end: p + size };
    p += size;
  }
}

function hex2(n) {
  return n.toString(16).padStart(2, '0');
}

/** parse one video track out of an MP4 file */
export function parseMp4(buffer) {
  const view = new DataView(buffer);
  const tracks = [];
  let track = null;

  const walk = (start, end) => {
    for (const b of boxes(view, start, end)) {
      if (b.type === 'trak') {
        track = {};
        tracks.push(track);
      }
      if (CONTAINERS.has(b.type)) {
        walk(b.start, b.end);
        continue;
      }
      if (!track) continue;
      const p = b.start;
      switch (b.type) {
        case 'hdlr':
          track.handler = String.fromCharCode(...new Uint8Array(buffer, p + 8, 4));
          break;
        case 'mdhd':
          track.timescale = view.getUint32(p + (view.getUint8(p) === 1 ? 20 : 12));
          break;
        case 'stsd': {
          const entry = boxes(view, p + 8, b.end).next().value;
          if (!entry || entry.type !== 'avc1') break;
          track.width = view.getUint16(entry.start + 24);
          track.height = view.getUint16(entry.start + 26);
          for (const c of boxes(view, entry.start + 78, entry.end)) {
            if (c.type === 'avcC') track.avcC = new Uint8Array(buffer.slice(c.start, c.end));
          }
          break;
        }
        case 'stsz': {
          const fixed = view.getUint32(p + 4), n = view.getUint32(p + 8);
          track.sizes = Array.from({ length: n }, (_, i) => fixed || view.getUint32(p + 12 + i * 4));
          break;
        }
        case 'stco':
        case 'co64': {
          const n = view.getUint32(p + 4), wide = b.type === 'co64';
          track.chunks = Array.from({ length: n }, (_, i) =>
            wide ? Number(view.getBigUint64(p + 8 + i * 8)) : view.getUint32(p + 8 + i * 4),
          );
          break;
        }
        case 'stsc': {
          const n = view.getUint32(p + 4);
          track.stsc = Array.from({ length: n }, (_, i) => ({
            first: view.getUint32(p + 8 + i * 12),
            per: view.getUint32(p + 12 + i * 12),
          }));
          break;
        }
        case 'stss': {
          const n = view.getUint32(p + 4);
          track.sync = new Set(Array.from({ length: n }, (_, i) => view.getUint32(p + 8 + i * 4) - 1));
          break;
        }
      }
    }
  };
  walk(0, buffer.byteLength);

  const t = tracks.find((x) => x.handler === 'vide' && x.avcC && x.sizes && x.chunks && x.stsc);
  if (!t) throw new Error('mp4: no H.264 video track found');

  // expand the chunk table into per-sample byte ranges
  const samples = [];
  let s = 0;
  for (let c = 0; c < t.chunks.length; c++) {
    let run = t.stsc[0];
    for (const r of t.stsc) if (r.first - 1 <= c) run = r;
    let off = t.chunks[c];
    for (let k = 0; k < run.per && s < t.sizes.length; k++, s++) {
      samples.push({ offset: off, size: t.sizes[s], key: t.sync ? t.sync.has(s) : true });
      off += t.sizes[s];
    }
  }

  const a = t.avcC;
  return {
    codec: `avc1.${hex2(a[1])}${hex2(a[2])}${hex2(a[3])}`,
    description: a,
    width: t.width,
    height: t.height,
    timescale: t.timescale,
    samples,
  };
}
