// DOM rectangles and pointer events use screen CSS pixels; scroll offsets and
// positioned styles inside the zoomed app use its unscaled layout pixels.
export function uiScale() {
  const scale = Number(globalThis.document?.documentElement?.style?.getPropertyValue?.('--ui-scale'))
  return scale >= .75 && scale <= 1.5 ? scale : 1
}
export const layoutPixels = (pixels) => pixels / uiScale()
