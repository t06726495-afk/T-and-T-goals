import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
const svg = readFileSync(path.join(dir, 'icon-source.svg'))
const outDir = path.join(dir, '..', 'public', 'icons')

const sizes = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'maskable-192.png', size: 192 },
  { file: 'maskable-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
]

await import('node:fs/promises').then((fs) => fs.mkdir(outDir, { recursive: true }))

for (const { file, size } of sizes) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(path.join(outDir, file))
  console.log('wrote', file)
}
