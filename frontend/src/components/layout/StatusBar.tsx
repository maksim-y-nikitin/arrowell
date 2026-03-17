import React from 'react';
import { useWellbore } from '@/context/WellboreContext';
import { formatLength, formatDLS } from '@/utils/directionalMath';

export const StatusBar: React.FC = () => {
  const { stations, geoRef, unitSystem, activeWell, language } = useWellbore();

  const lastStation = stations[stations.length - 1] || {
    md: 0,
    inc: 0,
    azim: 0,
    tvd: 0,
    northing: 0,
    easting: 0,
    dls: 0,
    vs: 0,
    closureDist: 0,
    closureAzim: 0,
  };

  const passCount = stations.filter((s) => s.isQcPass).length;
  const warnCount = stations.length - passCount;
  const maxDls = Math.max(...stations.map((s) => s.dls || 0), 0);

  const lenUnit = unitSystem === 'metric' ? 'm' : 'ft';
  const dlsUnit = unitSystem === 'metric' ? '°/30m' : '°/100ft';
  const isRu = language === 'ru';

  return (
    <footer className="h-7 px-3 flex items-center justify-between gap-3 text-3xs font-mono select-none shrink-0 z-20 border-t transition-colors bg-white dark:bg-[#0a0c12] border-slate-200 dark:border-[#171b29] text-slate-600 dark:text-slate-400 overflow-hidden">
      {/* Left: Active Well Telemetry (Scrollable if viewport is narrow, never pushes right block out) */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-x-auto no-scrollbar py-0.5">
        <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100 pr-2 border-r border-slate-200 dark:border-[#1e2439] shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
          <span className="whitespace-nowrap">{activeWell.name}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
          <span className="text-slate-400 dark:text-slate-500">MD:</span>
          <span className="font-semibold text-sky-600 dark:text-sky-400">
            {formatLength(lastStation.md, unitSystem)} {lenUnit}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
          <span className="text-slate-400 dark:text-slate-500">Inc:</span>
          <span className="text-slate-800 dark:text-slate-200 font-medium">{lastStation.inc.toFixed(2)}°</span>
        </div>

        <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
          <span className="text-slate-400 dark:text-slate-500">Azim:</span>
          <span className="text-slate-800 dark:text-slate-200 font-medium">{lastStation.azim.toFixed(2)}°</span>
        </div>

        <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
          <span className="text-slate-400 dark:text-slate-500">TVD:</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
            {formatLength(lastStation.tvd, unitSystem)} {lenUnit}
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-1 shrink-0 whitespace-nowrap">
          <span className="text-slate-400 dark:text-slate-500">+N/-S:</span>
          <span className="text-slate-700 dark:text-slate-300">
            {formatLength(lastStation.northing, unitSystem)} {lenUnit}
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-1 shrink-0 whitespace-nowrap">
          <span className="text-slate-400 dark:text-slate-500">+E/-W:</span>
          <span className="text-slate-700 dark:text-slate-300">
            {formatLength(lastStation.easting, unitSystem)} {lenUnit}
          </span>
        </div>

        <div className="hidden md:flex items-center gap-1 shrink-0 whitespace-nowrap">
          <span className="text-slate-400 dark:text-slate-500">VS:</span>
          <span className="text-slate-700 dark:text-slate-300">
            {formatLength(lastStation.vs, unitSystem)} {lenUnit}
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-1 shrink-0 whitespace-nowrap">
          <span className="text-slate-400 dark:text-slate-500">Max DLS:</span>
          <span className={maxDls > 6 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-700 dark:text-slate-300'}>
            {formatDLS(maxDls, unitSystem)} {dlsUnit}
          </span>
        </div>

        <div className="hidden xl:flex items-center gap-1 shrink-0 whitespace-nowrap">
          <span className="text-slate-400 dark:text-slate-500">{isRu ? 'Отход' : 'Closure'}:</span>
          <span className="text-slate-700 dark:text-slate-300">
            {formatLength(lastStation.closureDist, unitSystem)} {lenUnit} @ {lastStation.closureAzim.toFixed(1)}°
          </span>
        </div>
      </div>

      {/* Right: Geomagnetic Model & Station count (Permanently fixed and visible) */}
      <div className="flex items-center gap-2.5 shrink-0 border-l border-slate-200 dark:border-[#171b29] pl-2.5">
        <div
          title={
            isRu
              ? `Всего замеров: ${stations.length}. В допуске: ${passCount}. Отклонений: ${warnCount}`
              : `Total: ${stations.length}. In spec: ${passCount}. Deviations: ${warnCount}`
          }
          className="flex items-center gap-1 text-3xs font-mono shrink-0 whitespace-nowrap"
        >
          <span className="text-slate-400 dark:text-slate-500">{isRu ? 'Замеры' : 'Surveys'}:</span>
          <span className="text-slate-700 dark:text-slate-300 font-semibold">{stations.length}</span>
          {warnCount > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              ({warnCount} {isRu ? 'откл.' : 'warn'})
            </span>
          )}
        </div>

        <div className="hidden md:flex items-center gap-1 text-slate-400 dark:text-slate-500 shrink-0 whitespace-nowrap">
          <span>{geoRef.model}</span>
          <span>•</span>
          <span>{geoRef.bTotalRef} nT</span>
        </div>

        <div className="text-slate-400 dark:text-slate-500 hidden sm:inline shrink-0 whitespace-nowrap">
          RKB {activeWell.datumElevation}m
        </div>
      </div>
    </footer>
  );
};
