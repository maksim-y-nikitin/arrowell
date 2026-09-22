/**
 * Master Wellbore Context Orchestrator & Backward Compatibility Facade.
 * Exposes Zustand global store through legacy useWellbore() hook.
 */

import React, { useEffect } from 'react';
import { useWellboreStore } from '@/store/useWellboreStore';
import type { ViewLayoutMode } from '@/types';
import { calculatePhysicalSagAngle } from '@/utils/directionalMath';

export type { ViewLayoutMode };
export { calculatePhysicalSagAngle };

export const WellboreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initWorkstation = useWellboreStore((state) => state.initWorkstation);

  useEffect(() => {
    initWorkstation();
  }, [initWorkstation]);

  return <>{children}</>;
};

/**
 * Facade hook providing 100% backward compatibility for existing UI components.
 */
export const useWellbore = () => {
  const store = useWellboreStore();

  return {
    ...store,
    activeField: store.getActiveField(),
    activePad: store.getActivePad(),
    activeWell: store.getActiveWell(),
    activeRun: store.getActiveRun(),
  };
};