import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { nanoid } from 'nanoid';

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.txt',
  '.md',
  '.svg',
  '.json',
  '.csv',
  '.mp3',
  '.wav',
  '.ogg',
  '.mp4',
  '.webm',
  '.zip',
  '.odt',
  '.ass',
  '.srt',
]);

export const APPLICANT_ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.txt',
  '.md',
  '.zip',
]);

export function createSafeUploader(allowSet: Set<string>, maxMb = 15) {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const safeExt = allowSet.has(ext) ? ext : '';
      cb(null, `${nanoid(20)}${safeExt}`);
    },
  });

  return multer({
    storage,
    limits: {
      fileSize: maxMb * 1024 * 1024,
      files: 4,
    },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!allowSet.has(ext)) {
        return cb(new Error(`Unsupported or blocked file extension: ${ext || 'none'}`));
      }
      // Block suspicious double extensions ending in executable scripts
      const lower = file.originalname.toLowerCase();
      if (/\.(exe|bat|cmd|sh|ps1|js|mjs|cjs|php|py|rb|dll|so)\./.test(lower)) {
        return cb(new Error('Disallowed compound file name.'));
      }
      cb(null, true);
    },
  });
}

export function resolveSafeUploadPath(storedName: string): string | null {
  const base = path.basename(storedName);
  if (!base || base !== storedName) return null;
  const full = path.resolve(UPLOAD_DIR, base);
  if (!full.startsWith(UPLOAD_DIR + path.sep)) {
    return null;
  }
  return full;
}
