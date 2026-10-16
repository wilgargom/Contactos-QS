const zlib = require('node:zlib');

// Tabla CRC32 estándar
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

function calculateCRC32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}

/**
 * Crea un buffer ZIP estándar (PKZip 2.0) a partir de una lista de archivos.
 * files: Array<{ name: string, data: Buffer | string }>
 */
function createZip(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let currentOffset = 0;

  for (const file of files) {
    const rawData = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8');
    const nameBuf = Buffer.from(file.name, 'utf8');
    const crc = calculateCRC32(rawData);

    // Comprimir con DEFLATE
    const compressedData = zlib.deflateRawSync(rawData);
    // Si la compresión no reduce el tamaño, podríamos almacenar sin compresión, pero deflate estándar es universal para xlsx
    const method = 8; // Deflate
    const compressedSize = compressedData.length;
    const uncompressedSize = rawData.length;

    // Local Header (30 bytes + nameBuf.length)
    const lh = Buffer.alloc(30 + nameBuf.length);
    lh.writeUInt32LE(0x04034b50, 0); // Firma Local Header
    lh.writeUInt16LE(20, 4);         // Versión necesaria (2.0)
    lh.writeUInt16LE(0, 6);          // Flags
    lh.writeUInt16LE(method, 8);     // Método compresión (8 = deflate)
    lh.writeUInt16LE(0, 10);         // Tiempo mod
    lh.writeUInt16LE(0, 12);         // Fecha mod
    lh.writeUInt32LE(crc, 14);       // CRC-32
    lh.writeUInt32LE(compressedSize, 18);
    lh.writeUInt32LE(uncompressedSize, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);         // Extra field length
    nameBuf.copy(lh, 30);

    const localChunk = Buffer.concat([lh, compressedData]);
    localHeaders.push(localChunk);

    // Central Directory Header (46 bytes + nameBuf.length)
    const ch = Buffer.alloc(46 + nameBuf.length);
    ch.writeUInt32LE(0x02014b50, 0); // Firma Central Header
    ch.writeUInt16LE(20, 4);         // Versión creada por (2.0)
    ch.writeUInt16LE(20, 6);         // Versión necesaria
    ch.writeUInt16LE(0, 8);          // Flags
    ch.writeUInt16LE(method, 10);    // Método compresión
    ch.writeUInt16LE(0, 12);         // Tiempo mod
    ch.writeUInt16LE(0, 14);         // Fecha mod
    ch.writeUInt32LE(crc, 16);       // CRC-32
    ch.writeUInt32LE(compressedSize, 20);
    ch.writeUInt32LE(uncompressedSize, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);         // Extra field length
    ch.writeUInt16LE(0, 32);         // File comment length
    ch.writeUInt16LE(0, 34);         // Disk number start
    ch.writeUInt16LE(0, 36);         // Internal file attributes
    ch.writeUInt32LE(0, 38);         // External file attributes
    ch.writeUInt32LE(currentOffset, 42); // Relative offset of local header
    nameBuf.copy(ch, 46);

    centralHeaders.push(ch);
    currentOffset += localChunk.length;
  }

  const centralDirOffset = currentOffset;
  const centralDirBuffer = Buffer.concat(centralHeaders);
  const centralDirSize = centralDirBuffer.length;

  // End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // Firma EOCD
  eocd.writeUInt16LE(0, 4);          // Disk number
  eocd.writeUInt16LE(0, 6);          // Start disk
  eocd.writeUInt16LE(files.length, 8); // Entries on disk
  eocd.writeUInt16LE(files.length, 10); // Total entries
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);         // Comment length

  return Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
}

/**
 * Lee un archivo ZIP (Buffer) y extrae sus archivos internos como un mapa name -> Buffer.
 */
function readZip(buf) {
  const result = new Map();

  // Buscar End of Central Directory (EOCD) hacia atrás
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('El archivo no es un ZIP válido o está dañado');
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

  let curOffset = centralDirOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(curOffset) !== 0x02014b50) {
      break;
    }

    const method = buf.readUInt16LE(curOffset + 10);
    const compressedSize = buf.readUInt32LE(curOffset + 20);
    const uncompressedSize = buf.readUInt32LE(curOffset + 24);
    const nameLen = buf.readUInt16LE(curOffset + 28);
    const extraLen = buf.readUInt16LE(curOffset + 30);
    const commentLen = buf.readUInt16LE(curOffset + 32);
    const localHeaderOffset = buf.readUInt32LE(curOffset + 42);

    const fileName = buf.toString('utf8', curOffset + 46, curOffset + 46 + nameLen);

    // Leer encabezado local para ubicar los datos
    if (buf.readUInt32LE(localHeaderOffset) === 0x04034b50) {
      const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const rawCompressed = buf.subarray(dataStart, dataStart + compressedSize);

      let uncompressed;
      if (method === 8) {
        uncompressed = zlib.inflateRawSync(rawCompressed);
      } else if (method === 0) {
        uncompressed = rawCompressed;
      } else {
        throw new Error(`Método de compresión no soportado en ZIP: ${method}`);
      }

      result.set(fileName, uncompressed);
    }

    curOffset += 46 + nameLen + extraLen + commentLen;
  }

  return result;
}

module.exports = {
  createZip,
  readZip,
  calculateCRC32
};
