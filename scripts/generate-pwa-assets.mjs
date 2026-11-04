import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter: None
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function renderTunerIcon(size, { maskable = false, fullBleed = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  // Safe-zone scale for maskable icons (W3C safe zone is inner 80% circle, radius 40%)
  const emblemScale = maskable ? 0.72 : 1.0;
  const cornerRadius = fullBleed || maskable ? 0 : size * 0.21875;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const idx = (py * size + px) * 4;

      // Rounded rect mask when not fullBleed/maskable
      let bgAlpha = 1;
      if (cornerRadius > 0) {
        const qx = Math.max(0, Math.abs(px + 0.5 - size / 2) - (size / 2 - cornerRadius));
        const qy = Math.max(0, Math.abs(py + 0.5 - size / 2) - (size / 2 - cornerRadius));
        const distCorner = Math.hypot(qx, qy) - cornerRadius;
        bgAlpha = clamp01(0.5 - distCorner);
      }

      if (bgAlpha <= 0) {
        buf[idx] = 0;
        buf[idx + 1] = 0;
        buf[idx + 2] = 0;
        buf[idx + 3] = 0;
        continue;
      }

      // Normalize coordinates to [-1, 1]
      const nx = (px + 0.5 - size / 2) / (size / 2);
      const ny = (py + 0.5 - size / 2) / (size / 2);

      // Radial dark slate background (#1e293b -> #020617)
      const bgRadial = clamp01(Math.hypot(nx, ny + 0.3) / 1.3);
      let r = lerp(30, 2, bgRadial);
      let g = lerp(41, 6, bgRadial);
      let b = lerp(59, 23, bgRadial);

      // Scaled coordinates for the guitar pick emblem
      const sx = nx / emblemScale;
      const sy = ny / emblemScale;

      // Guitar pick SDF approximation
      const pickTopY = sy + 0.08;
      const widthAtY =
        pickTopY < 0
          ? 0.64 * Math.sqrt(Math.max(0, 1 - (pickTopY / 0.68) ** 2))
          : 0.64 * Math.max(0, 1 - (pickTopY / 0.86) ** 1.45);
      const inYRange = sy >= -0.76 && sy <= 0.78;
      const pickDist = inYRange ? Math.abs(sx) - widthAtY : 1;
      const pickCov = clamp01(0.5 - pickDist * (size * 0.35));

      if (pickCov > 0) {
        const gradT = clamp01((sx + sy + 1.4) / 2.8);
        const pr = lerp(52, 5, gradT);
        const pg = lerp(211, 150, gradT);
        const pb = lerp(153, 105, gradT);
        r = lerp(r, pr, pickCov);
        g = lerp(g, pg, pickCov);
        b = lerp(b, pb, pickCov);
      }

      // Center tuning ring & needle
      const ringDist = Math.hypot(sx, sy + 0.06);
      const outerCircle = clamp01((0.22 - ringDist) * (size * 0.4));
      if (outerCircle > 0) {
        r = lerp(r, 2, outerCircle);
        g = lerp(g, 6, outerCircle);
        b = lerp(b, 23, outerCircle);
      }

      const centerDot = clamp01((0.065 - ringDist) * (size * 0.4));
      if (centerDot > 0) {
        r = lerp(r, 52, centerDot);
        g = lerp(g, 211, centerDot);
        b = lerp(b, 153, centerDot);
      }

      // Vertical needle ticks (top and bottom of center ring)
      const onVerticalStem =
        Math.abs(sx) <= 0.032 &&
        ((sy >= -0.44 && sy <= -0.26) || (sy >= 0.14 && sy <= 0.5));
      if (onVerticalStem) {
        r = 255;
        g = 255;
        b = 255;
      }

      buf[idx] = Math.round(r);
      buf[idx + 1] = Math.round(g);
      buf[idx + 2] = Math.round(b);
      buf[idx + 3] = Math.round(bgAlpha * 255);
    }
  }

  return encodePng(size, size, buf);
}

function saveFile(relPath, content) {
  const abs = resolve(process.cwd(), relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

saveFile('public/icons/icon-192x192.png', renderTunerIcon(192, { maskable: false }));
saveFile('public/icons/icon-512x512.png', renderTunerIcon(512, { maskable: false }));
saveFile('public/icons/icon-maskable-192x192.png', renderTunerIcon(192, { maskable: true }));
saveFile('public/icons/icon-maskable-512x512.png', renderTunerIcon(512, { maskable: true }));
saveFile('public/icons/apple-touch-icon.png', renderTunerIcon(180, { maskable: true, fullBleed: true }));

const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="maskBg512" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#1e293b" />
      <stop offset="100%" stop-color="#020617" />
    </radialGradient>
    <linearGradient id="maskPick512" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#maskBg512)" />
  <g transform="translate(256 256) scale(0.72) translate(-256 -256)">
    <path d="M256 64 C144 64 80 144 80 256 C80 376 192 456 256 464 C320 456 432 376 432 256 C432 144 368 64 256 64 Z" fill="url(#maskPick512)" />
    <circle cx="256" cy="240" r="56" fill="#020617" />
    <circle cx="256" cy="240" r="42" fill="#0f172a" />
    <circle cx="256" cy="240" r="16" fill="#34d399" />
    <path d="M256 144 V184 M256 296 V384" stroke="#ffffff" stroke-width="16" stroke-linecap="round" />
  </g>
</svg>
`;
saveFile('public/icons/icon-maskable-512x512.svg', maskableSvg);

const narrowScreenshotSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 960" width="540" height="960">
  <rect width="540" height="960" fill="#020617" />
  <rect x="24" y="24" width="492" height="64" rx="16" fill="#0f172a" stroke="#1e293b" />
  <text x="52" y="64" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="24" font-weight="800">FretTune</text>
  <rect x="24" y="116" width="492" height="460" rx="24" fill="#0f172a" stroke="#10b981" stroke-width="2" />
  <text x="270" y="230" text-anchor="middle" fill="#10b981" font-family="system-ui, sans-serif" font-size="96" font-weight="800">A2</text>
  <text x="270" y="275" text-anchor="middle" fill="#94a3b8" font-family="monospace" font-size="22">110.0 Hz • +0.0 cents</text>
  <path d="M110 470 A160 160 0 0 1 430 470" fill="none" stroke="#1e293b" stroke-width="14" stroke-linecap="round" />
  <line x1="270" y1="470" x2="270" y2="330" stroke="#10b981" stroke-width="6" stroke-linecap="round" />
  <circle cx="270" cy="470" r="12" fill="#10b981" />
  <rect x="24" y="604" width="492" height="310" rx="24" fill="#0f172a" stroke="#1e293b" />
  <text x="52" y="650" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="18" font-weight="600">Guitar • Standard (E A D G B E)</text>
</svg>
`;
saveFile('public/screenshots/tuner-narrow.svg', narrowScreenshotSvg);

const wideScreenshotSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 800" width="1280" height="800">
  <rect width="1280" height="800" fill="#020617" />
  <rect x="40" y="32" width="1200" height="64" rx="16" fill="#0f172a" stroke="#1e293b" />
  <text x="76" y="72" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="26" font-weight="800">FretTune — Precision Chromatic &amp; Strobe Tuner</text>
  <rect x="40" y="124" width="740" height="620" rx="24" fill="#0f172a" stroke="#10b981" stroke-width="2" />
  <text x="410" y="280" text-anchor="middle" fill="#10b981" font-family="system-ui, sans-serif" font-size="120" font-weight="800">E2</text>
  <text x="410" y="335" text-anchor="middle" fill="#94a3b8" font-family="monospace" font-size="24">82.41 Hz • In Tune</text>
  <path d="M190 580 A220 220 0 0 1 630 580" fill="none" stroke="#1e293b" stroke-width="16" stroke-linecap="round" />
  <line x1="410" y1="580" x2="410" y2="380" stroke="#10b981" stroke-width="8" stroke-linecap="round" />
  <circle cx="410" cy="580" r="14" fill="#10b981" />
  <rect x="810" y="124" width="430" height="620" rx="24" fill="#0f172a" stroke="#1e293b" />
  <text x="846" y="176" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="22" font-weight="700">Guided Strings Checklist</text>
</svg>
`;
saveFile('public/screenshots/tuner-wide.svg', wideScreenshotSvg);
console.log('Generated PWA icons and screenshots successfully.');

