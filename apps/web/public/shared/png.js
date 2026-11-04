// Wereld tekenen (ronde 2): PNG lezen en schrijven zonder canvas, zodat de waarden exact blijven (ook 16-bit
// hoogteplaatjes uit Blender of van heightmap-sites). Gebruikt CompressionStream (browser en Node 18+).
// Geen DOM en geen Three.js: tests en server kunnen dit ook gebruiken.

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS_BY_TYPE = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const TYPE_BY_CHANNELS = { 1: 0, 2: 4, 3: 2, 4: 6 };
let crcTable = null;

function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function pipeBytes(bytes, stream) {
  const readable = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(readable).arrayBuffer());
}

function chunk(type, payload) {
  const out = new Uint8Array(12 + payload.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, payload.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(payload, 8);
  view.setUint32(8 + payload.length, crc32(out.subarray(4, 8 + payload.length)));
  return out;
}

export function isPngBytes(bytes) {
  if (!bytes || bytes.length < 33) return false;
  for (let i = 0; i < 8; i += 1) if (bytes[i] !== SIGNATURE[i]) return false;
  return true;
}

// Maakt een PNG. data: Uint8Array (bitDepth 8) of Uint16Array (bitDepth 16), channels 1 (grijs), 2, 3 (RGB) of 4.
export async function encodePng({ width, height, channels = 1, bitDepth = 8, data }) {
  const colorType = TYPE_BY_CHANNELS[channels];
  if (colorType === undefined || (bitDepth !== 8 && bitDepth !== 16)) throw new Error("PNG: onbekend formaat");
  const bytesPerSample = bitDepth / 8;
  const bpp = channels * bytesPerSample;
  const rowBytes = width * bpp;
  const raw = new Uint8Array((rowBytes + 1) * height);
  const row = new Uint8Array(rowBytes);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width * channels; x += 1) {
      const value = data[y * width * channels + x] || 0;
      if (bitDepth === 16) {
        row[x * 2] = (value >> 8) & 0xff;
        row[x * 2 + 1] = value & 0xff;
      } else {
        row[x] = value & 0xff;
      }
    }
    // Filter "Sub" (verschil met de buur links): hoogtes en verf worden zo veel kleiner.
    const start = y * (rowBytes + 1);
    raw[start] = 1;
    for (let i = 0; i < rowBytes; i += 1) raw[start + 1 + i] = (row[i] - (i >= bpp ? row[i - bpp] : 0)) & 0xff;
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = bitDepth;
  header[9] = colorType;
  const compressed = await pipeBytes(raw, new CompressionStream("deflate"));
  const parts = [Uint8Array.from(SIGNATURE), chunk("IHDR", header), chunk("IDAT", compressed), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
}

// Leest een PNG (niet-interlaced). Geeft { width, height, channels, bitDepth, data }; 16-bit = Uint16Array,
// anders Uint8Array (1/2/4-bit grijs wordt 0..255, een palet wordt RGB of RGBA).
export async function decodePng(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!isPngBytes(bytes)) throw new Error("Geen PNG-bestand.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let header = null;
  let palette = null;
  let alphaTable = null;
  const idat = [];
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = { width: view.getUint32(offset + 8), height: view.getUint32(offset + 12), bitDepth: body[8], colorType: body[9], interlace: body[12] };
    } else if (type === "PLTE") palette = body.slice();
    else if (type === "tRNS") alphaTable = body.slice();
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (!header || !idat.length) throw new Error("PNG is kapot.");
  const { width, height, bitDepth, colorType } = header;
  const channels = CHANNELS_BY_TYPE[colorType];
  if (!channels || !width || !height || width > 8192 || height > 8192) throw new Error("PNG-formaat wordt niet ondersteund.");
  if (header.interlace) throw new Error("Interlaced PNG wordt niet ondersteund.");
  const joined = new Uint8Array(idat.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of idat) {
    joined.set(part, at);
    at += part.length;
  }
  const raw = await pipeBytes(joined, new DecompressionStream("deflate"));
  const bitsPerPixel = channels * bitDepth;
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const rowBytes = Math.ceil((width * bitsPerPixel) / 8);
  if (raw.length < (rowBytes + 1) * height) throw new Error("PNG is te kort.");
  const pixels = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (rowBytes + 1)];
    const src = y * (rowBytes + 1) + 1;
    const dst = y * rowBytes;
    for (let i = 0; i < rowBytes; i += 1) {
      const a = i >= bpp ? pixels[dst + i - bpp] : 0;
      const b = y > 0 ? pixels[dst - rowBytes + i] : 0;
      const c = y > 0 && i >= bpp ? pixels[dst - rowBytes + i - bpp] : 0;
      const value = raw[src + i];
      pixels[dst + i] = (filter === 0 ? value : filter === 1 ? value + a : filter === 2 ? value + b
        : filter === 3 ? value + ((a + b) >> 1) : filter === 4 ? value + paeth(a, b, c) : value) & 0xff;
    }
  }
  const count = width * height * channels;
  if (bitDepth === 16) {
    const data = new Uint16Array(count);
    for (let y = 0; y < height; y += 1) {
      for (let i = 0; i < width * channels; i += 1) {
        const p = y * rowBytes + i * 2;
        data[y * width * channels + i] = (pixels[p] << 8) | pixels[p + 1];
      }
    }
    return { width, height, channels, bitDepth: 16, data };
  }
  const samples = new Uint8Array(count);
  if (bitDepth === 8) {
    for (let y = 0; y < height; y += 1) samples.set(pixels.subarray(y * rowBytes, y * rowBytes + width * channels), y * width * channels);
  } else {
    const max = (1 << bitDepth) - 1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const bit = x * bitDepth;
        const value = (pixels[y * rowBytes + (bit >> 3)] >> (8 - bitDepth - (bit & 7))) & max;
        samples[y * width + x] = colorType === 3 ? value : Math.round((value * 255) / max);
      }
    }
  }
  if (colorType !== 3) return { width, height, channels, bitDepth: 8, data: samples };
  if (!palette) throw new Error("PNG mist zijn kleurenpalet.");
  const outChannels = alphaTable ? 4 : 3;
  const data = new Uint8Array(width * height * outChannels);
  for (let i = 0; i < width * height; i += 1) {
    const index = samples[i];
    data[i * outChannels] = palette[index * 3] || 0;
    data[i * outChannels + 1] = palette[index * 3 + 1] || 0;
    data[i * outChannels + 2] = palette[index * 3 + 2] || 0;
    if (alphaTable) data[i * outChannels + 3] = index < alphaTable.length ? alphaTable[index] : 255;
  }
  return { width, height, channels: outChannels, bitDepth: 8, data };
}

// Een hoogteplaatje als getallen 0..1 (wit = 1). Kleur telt als gemiddelde van rood, groen en blauw.
export function pngToHeights(png) {
  const { width, height, channels, bitDepth, data } = png;
  const max = bitDepth === 16 ? 65535 : 255;
  const colorChannels = channels >= 3 ? 3 : 1;
  const out = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    let sum = 0;
    for (let c = 0; c < colorChannels; c += 1) sum += data[i * channels + c];
    out[i] = sum / colorChannels / max;
  }
  return { width, height, data: out };
}
