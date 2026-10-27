'use client';

import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import { createEditorLeaseController } from './editor-lease';
import type { ApiResult } from '../../api/result';

export function useEditorLease(input: {
  collection: string;
  id: string | null;
  editorId: string;
  locale: string;
  enabled: boolean;
  report: (result: ApiResult<unknown>) => void;
}) {
  const { collection, id, editorId, enabled, report, locale } = input;
  const controller = useMemo(
    () => createEditorLeaseController({ collection, id: id ?? '', editorId, report, locale }),
    [collection, id, editorId, report, locale],
  );
  const state = useStore(controller.store);
  useEffect(() => {
    if (!enabled || !id) return () => {};
    void controller.start();
    const leave = () => controller.dispose();
    const resume = () => {
      void controller.start();
    };
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', resume);
    return () => {
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('pageshow', resume);
      controller.dispose();
    };
  }, [controller, enabled, id]);
  return {
    ...state,
    enabled,
    blocked: enabled && state.phase !== 'owned',
    retry: controller.retry,
    takeover: controller.takeover,
  };
}
