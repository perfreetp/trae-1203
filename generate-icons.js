const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(size, iconType = 'clip') {
  const width = size;
  const height = size;

  function crc32(buf) {
    let c;
    const table = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crcVal = Buffer.alloc(4);
    crcVal.writeUInt32BE(crc32(typeData), 0);
    return Buffer.concat([len, typeData, crcVal]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rawData = [];
  const pad = Math.floor(size * 0.1);
  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < height; y++) {
    rawData.push(0);
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      const nx = x - cx;
      const ny = y - cy;

      if (size === 16) {
        if (x >= 3 && x <= 12 && y >= 4 && y <= 11) {
          r = 99; g = 102; b = 241; a = 255;
          if (x === 3 || x === 12 || y === 4) { r = 79; g = 70; b = 229; }
        }
        if (x >= 5 && x <= 11 && y >= 6 && y <= 10) {
          if ((x + y) % 3 === 0) { r = 255; g = 255; b = 255; a = 255; }
        }
      } else {
        const r1 = size * 0.42;
        const r2 = size * 0.35;

        const dist = Math.sqrt(nx * nx + ny * ny);
        if (dist < r1) {
          const t = (dist / r1);
          r = Math.round(99 + (139 - 99) * t);
          g = Math.round(102 + (92 - 102) * t);
          b = Math.round(241 + (246 - 241) * t);
          a = 255;
        }
        if (dist < r2) {
          const inR2 = size * 0.08;
          const barY1 = cy - size * 0.15;
          const barY2 = cy - size * 0.05;
          const barY3 = cy + size * 0.05;
          const barLeft = cx - size * 0.18;
          const barRight = cx + size * 0.18;

          if (y >= barY1 - 1 && y <= barY1 + 1 && x >= barLeft && x <= barRight) {
            r = 255; g = 255; b = 255; a = 255;
          }
          if (y >= barY2 - 1 && y <= barY2 + 1 && x >= barLeft && x <= barRight - size * 0.08) {
            r = 255; g = 255; b = 255; a = 255;
          }
          if (y >= barY3 - 1 && y <= barY3 + 1 && x >= barLeft && x <= barRight) {
            r = 255; g = 255; b = 255; a = 220;
          }
        }
      }

      rawData.push(r, g, b, a);
    }
  }

  const rawBuf = Buffer.from(rawData);
  const compressed = zlib.deflateSync(rawBuf, { level: 9 });
  const png = Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);

  return png;
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

[16, 48, 128].forEach(size => {
  const png = createPNG(size);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), png);
  console.log(`Created icon${size}.png (${png.length} bytes)`);
});

console.log('Icons generated successfully!');
