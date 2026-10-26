'use client';

import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import type { ImageRecipe } from '../../contracts/assets';
import { useAccessControl } from '../access-control/provider';
import { createProcessingController } from './image-processing';

export function useReprocess(input: {
  collection: string;
  id: string;
  revision: number;
  onChanged: () => void | Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const { reportResult } = useAccessControl();
  const [controller] = useState(() => createProcessingController({ ...input, reportResult }));
  const state = useStore(controller.store);
  useEffect(() => {
    controller.activate();
    const observe = () => controller.setVisible(document.visibilityState !== 'hidden');
    observe();
    document.addEventListener('visibilitychange', observe);
    return () => {
      document.removeEventListener('visibilitychange', observe);
      controller.dispose();
    };
  }, [controller]);
  return {
    ...state,
    start: (recipe: ImageRecipe) => controller.start({ revision: input.revision, recipe }),
    resume: controller.resume,
  };
}
