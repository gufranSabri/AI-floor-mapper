// Returns the letterboxed rect for an image rendered with object-fit: contain
// inside a canvas of (canvasW × canvasH).
export function containFit(imgW, imgH, canvasW, canvasH) {
  const scale  = Math.min(canvasW / imgW, canvasH / imgH);
  const fitW   = imgW * scale;
  const fitH   = imgH * scale;
  const offsetX = (canvasW - fitW) / 2;
  const offsetY = (canvasH - fitH) / 2;
  return { offsetX, offsetY, fitW, fitH, scale };
}
