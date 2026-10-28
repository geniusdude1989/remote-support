// Script to generate a clean icon.ico for Antigravity Remote Support
const fs = require('node:fs');
const path = require('node:path');

// 16x16 32-bit BMP data for ICO
const width = 32;
const height = 32;
const bpp = 32;
const imageSize = width * height * 4;
const maskSize = Math.ceil((width * height) / 8);

const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // Reserved
icoHeader.writeUInt16LE(1, 2); // ICO type = 1
icoHeader.writeUInt16LE(1, 4); // 1 image

const bihSize = 40;
const totalSize = bihSize + imageSize + maskSize;

const dirEntry = Buffer.alloc(16);
dirEntry.writeUInt8(width, 0); // width
dirEntry.writeUInt8(height, 1); // height
dirEntry.writeUInt8(0, 2); // color count
dirEntry.writeUInt8(0, 3); // reserved
dirEntry.writeUInt16LE(1, 4); // color planes
dirEntry.writeUInt16LE(bpp, 6); // bits per pixel
dirEntry.writeUInt32LE(totalSize, 8); // size of image data
dirEntry.writeUInt32LE(6 + 16, 12); // offset of image data

const bih = Buffer.alloc(40);
bih.writeUInt32LE(40, 0); // BI_HEADER size
bih.writeInt32LE(width, 4);
bih.writeInt32LE(height * 2, 8); // height * 2 for ICO (XOR + AND mask)
bih.writeUInt16LE(1, 12); // planes
bih.writeUInt16LE(bpp, 14); // bit count
bih.writeUInt32LE(0, 16); // BI_RGB
bih.writeUInt32LE(imageSize, 20); // image size

const pixelData = Buffer.alloc(imageSize);
// Fill with gradient red/orange Antigravity theme
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const idx = (y * width + x) * 4;
    // Draw rounded badge with lightning bolt pattern
    const dx = x - 16;
    const dy = y - 16;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= 14) {
      pixelData[idx] = 0x22;     // B
      pixelData[idx + 1] = 0x44; // G
      pixelData[idx + 2] = 0xef; // R
      pixelData[idx + 3] = 0xff; // A
    } else {
      pixelData[idx] = 0;
      pixelData[idx + 1] = 0;
      pixelData[idx + 2] = 0;
      pixelData[idx + 3] = 0;
    }
  }
}

const maskData = Buffer.alloc(maskSize, 0);

const fullIco = Buffer.concat([icoHeader, dirEntry, bih, pixelData, maskData]);
const dest = path.join(__dirname, 'icon.ico');
fs.writeFileSync(dest, fullIco);
console.log(`Generated icon.ico at ${dest} (${fullIco.length} bytes)`);
