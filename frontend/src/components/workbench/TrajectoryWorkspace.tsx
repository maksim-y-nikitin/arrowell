import React, { useState } from 'react';
import { useWellbore } from '@/context/WellboreContext';
import { Trajectory3D } from '@/components/workbench/Trajectory3D';
import { Projections2D } from '@/components/workbench/Projections2D';
import { Box, Compass, Columns } from 'lucide-react';
import { formatLength } from '@/utils/directionalMath';

type TrajectoryDisplayMode = '3d' | '2d' | 'split';

export const TrajectoryWorkspace: React.FC = () => {
  const { stations, language, unitSystem, activeWell } = useWellbore();
  const [displayMode, setDisplayMode] = useState<TrajectoryDisplayMode>('3d');

  const isRu = language === 'ru';
  const lenUnit = unitSystem === 'metric' ? 'm' : 'ft';
  const lastStation = stations[stations.length - 1];

  return (
    <div className="w-full h-full flex flex-col select-none overflow-hidden bg-[var(--bg-1)] font-mono t-sm">
      <div className="panel-head justify-between">
        <div className="flex items-center gap-2">
          <div className="panel-title">
            <Box className="w-3.5 h-3.5 text-[var(--fg-2)]" />
            <span>{isRu ? 'Визуализация траектории' : 'Trajectory Visualizer'}</span>
          </div>
          <span className="pill acc">{activeWell.name}</span>
        </div>

        <div className="seg">
          <button
            type="button"
            onClick={() => setDisplayMode('3d')}
            className={displayMode === '3d' ? 'on acc' : ''}
          >
            <Box className="w-3 h-3" />
            <span>3D</span>
          </button>

          <button
            type="button"
            onClick={() => setDisplayMode('2d')}
            className={displayMode === '2d' ? 'on acc' : ''}
          >
            <Compass className="w-3 h-3" />
            <span>2D</span>
          </button>

          <button
            type="button"
            onClick={() => setDisplayMode('split')}
            className={displayMode === 'split' ? 'on acc' : ''}
          >
            <Columns className="w-3 h-3" />
            <span>Split</span>
          </button>
        </div>

        <div className="hidden xl:flex items-center gap-3 t-xs text-[var(--fg-2)]">
          <span>MD: <strong className="text-[var(--fg-0)]">{formatLength(lastStation?.md || 0, unitSystem)} {lenUnit}</strong></span>
          <span>TVD: <strong className="text-[var(--fg-0)]">{formatLength(lastStation?.tvd || 0, unitSystem)} {lenUnit}</strong></span>
          <span>Inc: <strong className="text-[var(--fg-0)]">{lastStation?.inc.toFixed(1) || 0}°</strong></span>
          <span>Azim: <strong className="text-[var(--fg-0)]">{lastStation?.azim.toFixed(1) || 0}°</strong></span>
        </div>
      </div>

      <div className="flex-1 w-full h-full overflow-hidden relative">
        {displayMode === '3d' && (
          <div className="w-full h-full">
            <Trajectory3D visualSubTab={displayMode} onSubTabChange={(tab) => setDisplayMode(tab)} />
          </div>
        )}

        {displayMode === '2d' && (
          <div className="w-full h-full">
            <Projections2D visualSubTab={displayMode} onSubTabChange={(tab) => setDisplayMode(tab)} />
          </div>
        )}

        {displayMode === 'split' && (
          <div className="w-full h-full grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[var(--line)]">
            <div className="w-full h-full min-h-[300px]">
              <Trajectory3D visualSubTab={displayMode} onSubTabChange={(tab) => setDisplayMode(tab)} />
            </div>
            <div className="w-full h-full min-h-[300px]">
              <Projections2D visualSubTab={displayMode} onSubTabChange={(tab) => setDisplayMode(tab)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};