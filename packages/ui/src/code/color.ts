export function rgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return { r: 0, g: 0, b: 0 };
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

export function paint(hex: string): Paint[] {
  return [{ type: 'SOLID', color: rgb(hex) }];
}

export function hex2rgba(hex: string, opacity?: number): RGBA {
  return { ...rgb(hex), a: opacity ?? 1 };
}
