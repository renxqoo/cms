'use client';

import { useEffect, useRef, useState } from 'react';

export function useFilePreviews(files: readonly File[]): ReadonlyMap<File, string> {
  const previews = useRef(new Map<File, string>());
  const [visible, setVisible] = useState<ReadonlyMap<File, string>>(() => new Map());
  useEffect(() => {
    const required = new Set(files);
    let changed = false;
    for (const [file, url] of previews.current) {
      if (!required.has(file)) {
        URL.revokeObjectURL(url);
        previews.current.delete(file);
        changed = true;
      }
    }
    for (const file of required) {
      if (!previews.current.has(file) && typeof URL.createObjectURL === 'function') {
        previews.current.set(file, URL.createObjectURL(file));
        changed = true;
      }
    }
    if (changed) setVisible(new Map(previews.current));
  }, [files]);
  useEffect(() => {
    const { current } = previews;
    return () => {
      for (const url of current.values()) URL.revokeObjectURL(url);
      current.clear();
    };
  }, []);
  return visible;
}
