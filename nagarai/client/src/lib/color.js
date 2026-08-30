// Small color-math helpers for deriving a full Tailwind-style tonal scale
// (50..950) from a single anchor hex, so each theme scheme only has to
// specify a handful of role colors (from the tastemaker palette generator)
// rather than a hand-authored 11-step ramp per scheme.

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const bigint = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb({ h, s, l }) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function rgbToHex({ r, g, b }) {
  const c = (v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

// Target lightness per step, tuned to feel like Tailwind's default ramps.
const STEP_LIGHTNESS = {
  50: 96, 100: 91, 200: 82, 300: 70, 400: 58, 500: null /* anchor */,
  600: null, 700: 34, 800: 26, 900: 19, 950: 11,
};

/**
 * Derive an 11-step tonal scale from a single anchor hex (used as 500).
 * 600 is a slightly darkened anchor (for hover/active states); steps below
 * 500 lighten toward the same hue/saturation, steps above darken.
 */
export function deriveScale(anchorHex) {
  const hsl = rgbToHsl(hexToRgb(anchorHex));
  const scale = { 500: anchorHex };
  for (const [step, targetL] of Object.entries(STEP_LIGHTNESS)) {
    const s = Number(step);
    if (s === 500) continue;
    if (s === 600) {
      scale[600] = rgbToHex(hslToRgb({ h: hsl.h, s: hsl.s, l: Math.max(0, hsl.l - 10) }));
      continue;
    }
    scale[s] = rgbToHex(hslToRgb({ h: hsl.h, s: Math.min(100, hsl.s), l: targetL }));
  }
  return scale;
}

export { hexToRgb, rgbToHsl, hslToRgb, rgbToHex };
