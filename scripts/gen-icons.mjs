// Generates simple PNG app icons without dependencies (blue square with a white "P").
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const s = size / 64;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const u = x / s, v = y / s;
      let col = [29, 95, 209, 255];
      const inStem = u >= 22 && u <= 28 && v >= 16 && v <= 48;
      const dx = u - 34, dy = v - 26;
      const ring = Math.hypot(dx, dy);
      const inBowl = (u >= 22 && u <= 34 && ((v >= 16 && v <= 22) || (v >= 30 && v <= 36))) || (u > 34 && ring <= 10 && ring >= 4);
      if (inStem || inBowl) col = [255, 255, 255, 255];
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw.set(col, o);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
for (const size of [192, 512]) writeFileSync(`public/icons/icon-${size}.png`, png(size));
