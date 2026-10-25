'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../cn.ts';

export interface AnimateHeightProps {
  children: ReactNode;
  durationMs: number;
  className?: string;
}

export function AnimateHeight({ children, durationMs, className }: AnimateHeightProps) {
  const content = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const node = content.current;
    const observer = new ResizeObserver(() => {
      if (node) setHeight(node.getBoundingClientRect().height);
    });
    if (node) {
      observer.observe(node);
      setHeight(node.getBoundingClientRect().height);
    }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReduced(media.matches);
    updateMotion();
    media.addEventListener('change', updateMotion);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', updateMotion);
    };
  }, []);
  const style: CSSProperties = {
    height: height ?? 'auto',
    transitionDuration: reduced ? '0ms' : `${Math.max(0, durationMs)}ms`,
  };
  return (
    <div className={cn('overflow-hidden transition-[height] ease-in-out', className)} style={style}>
      <div ref={content}>{children}</div>
    </div>
  );
}
