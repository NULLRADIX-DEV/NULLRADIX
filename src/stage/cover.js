/**
 * object-fit: cover math shared by the film canvas and everything anchored into it.
 * `over` > 1 scales a little past cover so parallax and shake never reveal an edge.
 */
export function coverFit(vw, vh, W, H, over = 1.04) {
  const k = Math.max(vw / W, vh / H) * over;
  return { k, ox: (vw - W * k) / 2, oy: (vh - H * k) / 2, vw, vh, W, H };
}

/** film pixels -> viewport CSS pixels */
export const toScreen = (fit, X, Y) => [fit.ox + X * fit.k, fit.oy + Y * fit.k];

/** which film a viewport should get: landscape unless it is clearly taller than wide */
export const pickFormat = (vw, vh) => (vw / vh < 0.85 ? 'p' : 'l');
