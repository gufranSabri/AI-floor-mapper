export function makeLine(x1 = 100, y1 = 100, x2 = 220, y2 = 160, opts = {}) {
  return {
    id: crypto.randomUUID(),
    type: 'line',
    points: [x1, y1, x2, y2],
    stroke: opts.stroke ?? '#1c6b5e',
    strokeWidth: opts.strokeWidth ?? 2.5,
  };
}
