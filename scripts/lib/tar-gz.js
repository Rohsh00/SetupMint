import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { pipeline } from 'stream/promises';

/**
 * Creates a standard POSIX ustar header block (512 bytes).
 */
export function createUstarHeader(name, size, type = '0', mode = 0o644, mtime = Math.floor(Date.now() / 1000)) {
  const buf = Buffer.alloc(512);
  let prefix = '';
  let fileName = name;

  // Split paths longer than 100 bytes into ustar prefix (up to 155 bytes) and fileName (up to 100 bytes)
  if (Buffer.byteLength(name) > 100) {
    const idx = name.lastIndexOf('/', 155);
    if (idx !== -1 && idx <= 155 && name.length - idx - 1 <= 100) {
      prefix = name.substring(0, idx);
      fileName = name.substring(idx + 1);
    }
  }

  buf.write(fileName, 0, 100, 'utf-8');
  buf.write((mode & 0o7777).toString(8).padStart(7, '0') + '\0', 100, 8, 'utf-8');
  buf.write('0000000\0', 108, 8, 'utf-8'); // uid
  buf.write('0000000\0', 116, 8, 'utf-8'); // gid
  buf.write(size.toString(8).padStart(11, '0') + '\0', 124, 12, 'utf-8');
  buf.write(mtime.toString(8).padStart(11, '0') + '\0', 136, 12, 'utf-8');
  buf.fill(' ', 148, 156); // Checksum space placeholder
  buf.write(type, 156, 1, 'utf-8'); // '0'=file, '5'=dir
  buf.write('ustar\0', 257, 6, 'utf-8'); // POSIX magic
  buf.write('00', 263, 2, 'utf-8'); // version
  if (prefix) {
    buf.write(prefix, 345, 155, 'utf-8');
  }

  let chksum = 0;
  for (let i = 0; i < 512; i++) {
    chksum += buf[i];
  }
  buf.write(chksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf-8');
  return buf;
}

/**
 * Parses a 512-byte ustar header block.
 */
export function parseUstarHeader(buf) {
  if (buf.length < 512) return null;
  // Check for end of archive (all zeroes)
  let isZero = true;
  for (let i = 0; i < 512; i++) {
    if (buf[i] !== 0) {
      isZero = false;
      break;
    }
  }
  if (isZero) return null;

  const rawName = buf.toString('utf-8', 0, 100).replace(/\0.*$/, '');
  const rawPrefix = buf.toString('utf-8', 345, 500).replace(/\0.*$/, '');
  const fullName = rawPrefix ? `${rawPrefix}/${rawName}` : rawName;

  const rawSize = buf.toString('utf-8', 124, 136).replace(/\0.*$/, '').trim();
  const size = parseInt(rawSize, 8) || 0;
  const typeFlag = String.fromCharCode(buf[156]);

  return {
    name: fullName,
    size,
    typeFlag,
    isDir: typeFlag === '5' || fullName.endsWith('/'),
  };
}

/**
 * Packs a directory into a standard .tar.gz archive.
 */
export async function packDirectoryToTarGz(sourceDir, destTarGzPath) {
  const chunks = [];

  function walk(currentDir, relativePrefix = '') {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    // Sort entries for deterministic archives
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        chunks.push(createUstarHeader(`${relPath}/`, 0, '5', 0o755));
        walk(fullPath, relPath);
      } else if (entry.isFile()) {
        const fileBuf = fs.readFileSync(fullPath);
        const stat = fs.statSync(fullPath);
        const mtime = Math.floor(stat.mtimeMs / 1000);
        chunks.push(createUstarHeader(relPath, fileBuf.length, '0', 0o644, mtime));
        chunks.push(fileBuf);

        const pad = (512 - (fileBuf.length % 512)) % 512;
        if (pad > 0) {
          chunks.push(Buffer.alloc(pad));
        }
      }
    }
  }

  walk(sourceDir);

  // Two 512-byte zero blocks at the end of tar
  chunks.push(Buffer.alloc(1024));

  const tarBuffer = Buffer.concat(chunks);
  const gzipped = zlib.gzipSync(tarBuffer, { level: 9 });

  const parentDir = path.dirname(destTarGzPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true, mode: 0o700 });
  }

  fs.writeFileSync(destTarGzPath, gzipped, { mode: 0o600 });
  return destTarGzPath;
}

/**
 * Unpacks a .tar.gz archive into a target directory, strictly preventing path traversal.
 */
export async function unpackTarGzToDirectory(tarGzPath, destDir) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true, mode: 0o700 });
  }

  const gzipped = fs.readFileSync(tarGzPath);
  const tarBuffer = zlib.gunzipSync(gzipped);

  let offset = 0;
  while (offset + 512 <= tarBuffer.length) {
    const headerBuf = tarBuffer.subarray(offset, offset + 512);
    offset += 512;

    const header = parseUstarHeader(headerBuf);
    if (!header) {
      // End of archive or padding
      break;
    }

    // Sanitize path against directory traversal
    const safeName = path.normalize(header.name).replace(/^(\.\.(\/|\\|$))+/, '');
    if (safeName.startsWith('/') || safeName.includes('..')) {
      throw new Error(`Security Exception: Rejected unsafe path traversal in tar archive: "${header.name}"`);
    }

    const targetPath = path.join(destDir, safeName);

    if (header.isDir) {
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true, mode: 0o700 });
      }
    } else {
      const parent = path.dirname(targetPath);
      if (!fs.existsSync(parent)) {
        fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
      }

      const fileData = tarBuffer.subarray(offset, offset + header.size);
      fs.writeFileSync(targetPath, fileData, { mode: 0o600 });

      // Advance offset past file data and padding
      const pad = (512 - (header.size % 512)) % 512;
      offset += header.size + pad;
    }
  }

  return destDir;
}
