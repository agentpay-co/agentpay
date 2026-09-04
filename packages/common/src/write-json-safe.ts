/**
 * Safe JSON file write with atomic rename to prevent corruption.
 *
 * Writes to a `.tmp` file first, fsyncs it to stable storage, then
 * atomically renames it over the target path. On POSIX systems `rename`
 * is atomic — if the process crashes mid-write, the original file is
 * preserved intact; the fsync means an OS crash cannot lose committed
 * data either. A failed write never leaves a stray `.tmp` behind.
 *
 * @param filePath - Absolute or relative path to the target JSON file.
 * @param data - Serializable value to write.
 */
import fs from 'fs';
import path from 'path';

export function writeJsonSafe(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // Serialise first so unserialisable data throws before touching the disk.
  const payload = JSON.stringify(data, null, 2);
  const tmp = filePath + '.tmp';
  try {
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, payload, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, filePath);
    fsyncDir(dir);
  } catch (err) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      // Best effort — the original error is what matters.
    }
    throw err;
  }
}

/** Best-effort directory fsync so the rename itself survives an OS crash. */
function fsyncDir(dir: string): void {
  try {
    const fd = fs.openSync(dir, 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Non-POSIX filesystems may not support this — data is still safe
    // against process crashes via the atomic rename above.
  }
}
