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
    <div className="w-full h-full flex flex-col select-none overflow-hidden font-mono text-xs">
      {/* Sub-header Bar for Trajectory Mode */}
      <div className="h-9 px-3 border-b flex items-center justify-between gap-3 shrink-0 transition-colors bg-white dark:bg-[#0c0e17] border-slate-200 dark:border-[#171c2b] text-slate-700 dark:text-slate-300">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
          <span className="font-semibold text-slate-900 dark:text-white text-3xs sm:text-xs">
            {isRu ? 'ВИЗУАЛИЗАЦИЯ ТРАЕКТОРИИ' : 'TRAJECTORY VISUALIZER'}
          </span>
          <span className="text-3xs text-slate-400 hidden lg:inline">
            {activeWell.name}
          </span>
        </div>

        {/* View Mode Switcher: 3D / 2D / Split */}
        <div className="flex items-center bg-slate-100 dark:bg-[#141828] p-0.5 rounded-lg border border-slate-200 dark:border-[#1e2439] text-3xs">
          <button
            onClick={() => setDisplayMode('3d')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
              displayMode === '3d'
                ? 'bg-white dark:bg-[#20273d] text-sky-600 dark:text-sky-400 font-semibold shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            title={isRu ? 'Полноэкранная 3D модель' : 'Full 3D Visualizer'}
          >
            <Box className="w-3.5 h-3.5" />
            <span>{isRu ? '3D Вид' : '3D Orbit'}</span>
          </button>

          <button
            onClick={() => setDisplayMode('2d')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
              displayMode === '2d'
                ? 'bg-white dark:bg-[#20273d] text-sky-600 dark:text-sky-400 font-semibold shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            title={isRu ? '2D проекции: План (+N/+E) и Вертикальная секция (TVD vs VS)' : '2D Projections: Plan and Vertical Section'}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>{isRu ? '2D План и Секция' : '2D Projections'}</span>
          </button>

          <button
            onClick={() => setDisplayMode('split')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
              displayMode === 'split'
                ? 'bg-white dark:bg-[#20273d] text-sky-600 dark:text-sky-400 font-semibold shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            title={isRu ? 'Совмещенный режим: 3D и 2D бок о бок' : 'Combined 3D & 2D side-by-side'}
          >
            <Columns className="w-3.5 h-3.5" />
            <span>{isRu ? '3D + 2D Сплит' : 'Split 3D+2D'}</span>
          </button>
        </div>

        {/* Quick Trajectory Metric Pills */}
        <div className="hidden xl:flex items-center gap-3 text-3xs text-slate-500 dark:text-slate-400">
          <span>
            MD: <strong className="text-slate-900 dark:text-slate-200">{formatLength(lastStation?.md || 0, unitSystem)} {lenUnit}</strong>
          </span>
          <span>
            TVD: <strong className="text-slate-900 dark:text-slate-200">{formatLength(lastStation?.tvd || 0, unitSystem)} {lenUnit}</strong>
          </span>
          <span>
            Inc: <strong className="text-slate-900 dark:text-slate-200">{lastStation?.inc.toFixed(1) || 0}°</strong>
          </span>
          <span>
            Azim: <strong className="text-slate-900 dark:text-slate-200">{lastStation?.azim.toFixed(1) || 0}°</strong>
          </span>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 w-full h-full overflow-hidden relative">
        {displayMode === '3d' && (
          <div className="w-full h-full">
            <Trajectory3D />
          </div>
        )}

        {displayMode === '2d' && (
          <div className="w-full h-full">
            <Projections2D />
          </div>
        )}

        {displayMode === 'split' && (
          <div className="w-full h-full grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-[#171c2b]">
            <div className="w-full h-full min-h-[300px]">
              <Trajectory3D />
            </div>
            <div className="w-full h-full min-h-[300px]">
              <Projections2D />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
