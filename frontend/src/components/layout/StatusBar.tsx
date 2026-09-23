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
    <footer className="h-[22px] px-3 bg-[var(--bg-1)] border-t border-[var(--line)] flex items-center justify-between gap-4 font-mono text-[10.5px] text-[var(--fg-2)] select-none shrink-0 overflow-hidden transition-colors">
      {/* Left Block: Active Telemetry Data */}
      <div className="flex items-center gap-3 overflow-hidden min-w-0 flex-1">
        {/* Active Well Identifier */}
        <div className="flex items-baseline gap-1.5 shrink-0 whitespace-nowrap">
          <span className="text-[9.5px] uppercase tracking-[0.05em] text-[var(--fg-3)]">
            {isRu ? 'Скв' : 'Well'}
          </span>
          <span className="font-semibold text-[var(--fg-0)]">{activeWell.name}</span>
        </div>

        <div className="w-[1px] h-[10px] bg-[var(--line)] shrink-0" />

        {/* Measured Depth (MD) */}
        <div className="flex items-baseline gap-1 shrink-0 whitespace-nowrap">
          <span className="text-[9.5px] uppercase tracking-[0.05em] text-[var(--fg-3)]">MD</span>
          <span className="font-semibold text-[var(--accent)]">
            {formatLength(lastStation.md, unitSystem)}
          </span>
          <span className="text-[9.5px] text-[var(--fg-3)]">{lenUnit}</span>
        </div>

        {/* Inclination (Inc) */}
        <div className="flex items-baseline gap-1 shrink-0 whitespace-nowrap">
          <span className="text-[9.5px] uppercase tracking-[0.05em] text-[var(--fg-3)]">Inc</span>
          <span className="font-semibold text-[var(--fg-1)]">{lastStation.inc.toFixed(2)}°</span>
        </div>

        {/* Azimuth (Azim) */}
        <div className="flex items-baseline gap-1 shrink-0 whitespace-nowrap">
          <span className="text-[9.5px] uppercase tracking-[0.05em] text-[var(--fg-3)]">Azim</span>
          <span className="font-semibold text-[var(--fg-1)]">{lastStation.azim.toFixed(2)}°</span>
        </div>

        {/* True Vertical Depth (TVD) */}
        <div className="flex items-baseline gap-1 shrink-0 whitespace-nowrap">
          <span className="text-[9.5px] uppercase tracking-[0.05em] text-[var(--fg-3)]">TVD</span>
          <span className="font-semibold text-[var(--ok)]">
            {formatLength(lastStation.tvd, unitSystem)}
          </span>
          <span className="text-[9.5px] text-[var(--fg-3)]">{lenUnit}</span>
        </div>

        {/* Vertical Section (VS) */}
        <div className="hidden sm:flex items-baseline gap-1 shrink-0 whitespace-nowrap">
          <span className="text-[9.5px] uppercase tracking-[0.05em] text-[var(--fg-3)]">VS</span>
          <span className="font-semibold text-[var(--fg-1)]">
            {formatLength(lastStation.vs, unitSystem)}
          </span>
          <span className="text-[9.5px] text-[var(--fg-3)]">{lenUnit}</span>
        </div>

        {/* Dogleg Severity (Max DLS) */}
        <div className="hidden md:flex items-baseline gap-1 shrink-0 whitespace-nowrap">
          <span className="text-[9.5px] uppercase tracking-[0.05em] text-[var(--fg-3)]">Max DLS</span>
          <span className={`font-semibold ${maxDls > 4.0 ? 'text-[var(--warn)]' : 'text-[var(--fg-1)]'}`}>
            {formatDLS(maxDls, unitSystem)} {dlsUnit}
          </span>
        </div>

        {/* Northing Offset (+N / -S) */}
        <div className="hidden lg:flex items-baseline gap-1 shrink-0 whitespace-nowrap">
          <span className="text-[9.5px] uppercase tracking-[0.05em] text-[var(--fg-3)]">+N/-S</span>
          <span className="text-[var(--fg-1)]">{formatLength(lastStation.northing, unitSystem)}</span>
        </div>

        {/* Easting Offset (+E / -W) */}
        <div className="hidden lg:flex items-baseline gap-1 shrink-0 whitespace-nowrap">
          <span className="text-[9.5px] uppercase tracking-[0.05em] text-[var(--fg-3)]">+E/-W</span>
          <span className="text-[var(--fg-1)]">{formatLength(lastStation.easting, unitSystem)}</span>
        </div>

        {/* Closure Vector */}
        <div className="hidden xl:flex items-baseline gap-1 shrink-0 whitespace-nowrap">
          <span className="text-[9.5px] uppercase tracking-[0.05em] text-[var(--fg-3)]">
            {isRu ? 'Отход' : 'Closure'}
          </span>
          <span className="text-[var(--fg-1)]">
            {formatLength(lastStation.closureDist, unitSystem)} {lenUnit} @ {lastStation.closureAzim.toFixed(1)}°
          </span>
        </div>
      </div>

      {/* Right Block: QC Status & Reference Environment */}
      <div className="flex items-center gap-3 shrink-0 whitespace-nowrap">
        {/* Survey Station Counts */}
        <div className="flex items-baseline gap-1 shrink-0">
          <span className="text-[9.5px] uppercase tracking-[0.05em] text-[var(--fg-3)]">
            {isRu ? 'Замеры' : 'Surveys'}
          </span>
          <span className="font-semibold text-[var(--fg-1)]">{stations.length}</span>
          {warnCount > 0 && (
            <span className="font-semibold text-[var(--warn)]">
              ({warnCount} {isRu ? 'откл.' : 'warn'})
            </span>
          )}
        </div>

        <div className="w-[1px] h-[10px] bg-[var(--line)] shrink-0" />

        {/* Reference Geomagnetic Field Details */}
        <div className="hidden sm:flex items-baseline gap-1.5 shrink-0">
          <span className="font-semibold text-[var(--fg-1)]">{geoRef.model}</span>
          <span className="text-[var(--fg-3)]">{geoRef.bTotalRef.toLocaleString()} nT</span>
        </div>

        <div className="w-[1px] h-[10px] bg-[var(--line)] shrink-0 hidden sm:block" />

        {/* RKB Elevation Datum */}
        <div className="flex items-baseline gap-1 shrink-0">
          <span className="text-[9.5px] uppercase tracking-[0.05em] text-[var(--fg-3)]">RKB</span>
          <span className="font-semibold text-[var(--fg-1)]">{activeWell.datumElevation} m</span>
        </div>
      </div>
    </footer>
  );
};