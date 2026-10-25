export interface FileLimits {
  maxFiles: number;
  maxBytes: number;
  accept: readonly string[];
}

export interface FileRejection {
  file: File;
  reason: 'count' | 'size' | 'type';
}

function accepts(file: File, patterns: readonly string[]): boolean {
  return (
    patterns.length === 0 ||
    patterns.some((pattern) => {
      const normalized = pattern.toLowerCase();
      if (normalized === '*/*') return true;
      if (normalized.startsWith('.')) return file.name.toLowerCase().endsWith(normalized);
      if (normalized.endsWith('/*'))
        return file.type.toLowerCase().startsWith(normalized.slice(0, -1));
      return file.type.toLowerCase() === normalized;
    })
  );
}

export function inspectFiles(files: readonly File[], limits: FileLimits) {
  const accepted: File[] = [];
  const rejected: FileRejection[] = [];
  const maxFiles = Number.isFinite(limits.maxFiles) ? Math.max(0, Math.floor(limits.maxFiles)) : 0;
  const maxBytes = Number.isFinite(limits.maxBytes) ? Math.max(0, limits.maxBytes) : 0;
  for (const file of files) {
    let reason: FileRejection['reason'] | null = null;
    if (!accepts(file, limits.accept)) reason = 'type';
    else if (file.size > maxBytes) reason = 'size';
    else if (accepted.length >= maxFiles) reason = 'count';
    if (reason) rejected.push({ file, reason });
    else accepted.push(file);
  }
  return { accepted, rejected };
}
