/**
 * Piecewise-linear map between scroll distance (in viewport heights) and film time.
 * keys: [[t, v], ...] strictly increasing in both.
 */
export function makeScrollMap(keys) {
  const last = keys.length - 1;
  const interp = (x, xi, yi) => {
    if (x <= keys[0][xi]) return keys[0][yi];
    if (x >= keys[last][xi]) return keys[last][yi];
    let i = 1;
    while (keys[i][xi] < x) i++;
    const a = keys[i - 1], b = keys[i];
    return a[yi] + ((x - a[xi]) / (b[xi] - a[xi])) * (b[yi] - a[yi]);
  };
  return {
    total: keys[last][1],
    toT: (v) => interp(v, 1, 0),
    toV: (t) => interp(t, 0, 1),
  };
}
