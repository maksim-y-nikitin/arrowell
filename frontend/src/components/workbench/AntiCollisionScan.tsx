import React, { useMemo, useState } from 'react';
import { useWellbore } from '@/context/WellboreContext';
import { offsetWellsData } from '@/data/wellsData';
import { calculateAntiCollisionScan } from '@/utils/geomagneticEngine';
import { formatLength } from '@/utils/directionalMath';
import { ShieldCheck, Crosshair } from 'lucide-react';

export const AntiCollisionScan: React.FC = () => {
  const { stations, unitSystem, activeWell, language } = useWellbore();
  const [selectedOffsetWell, setSelectedOffsetWell] = useState(offsetWellsData[0].name);

  const activeOffset = useMemo(() => {
    return (
      offsetWellsData.find((w) => w.name === selectedOffsetWell) || offsetWellsData[0]
    );
  }, [selectedOffsetWell]);

  const scanPoints = useMemo(() => {
    return calculateAntiCollisionScan(stations, activeOffset.stations, activeOffset.name);
  }, [stations, activeOffset]);

  const minSeparationFactor = useMemo(() => {
    if (scanPoints.length === 0) return 99;
    return Math.min(...scanPoints.map((p) => p.separationFactor));
  }, [scanPoints]);

  const closestPoint = useMemo(() => {
    if (scanPoints.length === 0) return null;
    return [...scanPoints].sort((a, b) => a.centerDistance - b.centerDistance)[0];
  }, [scanPoints]);

  const lenUnit = unitSystem === 'metric' ? 'm' : 'ft';
  const isRu = language === 'ru';

  return (
    <div className="w-full h-full p-4 flex flex-col gap-4 select-none overflow-y-auto font-mono text-xs transition-colors bg-slate-50 dark:bg-[#090a0f]">
      {/* Top Banner: Anti-Collision Proximity Scan Header */}
      <div className="p-4 rounded-lg border shadow-xs flex flex-wrap items-center justify-between gap-4 transition-colors bg-white dark:bg-[#0c0e17] border-slate-200 dark:border-[#171c2b]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-slate-900 dark:text-white">
              {isRu ? 'Анализ сближения стволов (ISCWSA Error Model)' : 'ISCWSA Anti-Collision Proximity Scan'}
            </div>
            <div className="text-3xs text-slate-500 dark:text-slate-400">
              {activeWell.name} vs. <span className="font-medium text-slate-700 dark:text-slate-300">{activeOffset.name}</span>
            </div>
          </div>
        </div>

        {/* Offset Well Selector */}
        <div className="flex items-center gap-2">
          <span className="text-3xs text-slate-500">{isRu ? 'Соседняя:' : 'Scan Against:'}</span>
          <select
            value={selectedOffsetWell}
            onChange={(e) => setSelectedOffsetWell(e.target.value)}
            className="bg-white dark:bg-[#121624] border border-slate-200 dark:border-[#1c2236] rounded-md px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
          >
            {offsetWellsData.map((off) => (
              <option key={off.name} value={off.name}>
                {off.name} ({off.slot})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg border shadow-xs transition-colors bg-white dark:bg-[#0c0e17] border-slate-200 dark:border-[#171c2b]">
          <div className="text-3xs text-slate-500 uppercase">{isRu ? 'Мин. коэфф. разделения (SF)' : 'Min Separation Factor (SF)'}</div>
          <div
            className={`text-lg font-semibold mt-1 ${
              minSeparationFactor >= 2.0
                ? 'text-emerald-600 dark:text-emerald-400'
                : minSeparationFactor >= 1.25
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {minSeparationFactor.toFixed(2)}
          </div>
          <div className="text-3xs text-slate-400 mt-0.5">
            {minSeparationFactor >= 2.0 ? (isRu ? 'В норме (SF ≥ 2.0)' : 'Clear') : (isRu ? 'Требует внимания' : 'Caution')}
          </div>
        </div>

        <div className="p-3 rounded-lg border shadow-xs transition-colors bg-white dark:bg-[#0c0e17] border-slate-200 dark:border-[#171c2b]">
          <div className="text-3xs text-slate-500 uppercase">{isRu ? 'Мин. межосевая дистанция' : 'Closest Center Distance'}</div>
          <div className="text-lg font-semibold mt-1 text-slate-800 dark:text-slate-200">
            {closestPoint ? formatLength(closestPoint.centerDistance, unitSystem) : '—'} {lenUnit}
          </div>
          <div className="text-3xs text-slate-400 mt-0.5">
            {isRu ? 'На глубине' : 'At MD'}: {closestPoint ? formatLength(closestPoint.md, unitSystem) : '—'} {lenUnit}
          </div>
        </div>

        <div className="p-3 rounded-lg border shadow-xs transition-colors bg-white dark:bg-[#0c0e17] border-slate-200 dark:border-[#171c2b]">
          <div className="text-3xs text-slate-500 uppercase">{isRu ? 'Суммарный эллипс погрешности (1σ)' : 'Combined Error Ellipse (1σ)'}</div>
          <div className="text-lg font-semibold mt-1 text-slate-800 dark:text-slate-200">
            {closestPoint ? formatLength(closestPoint.errorMajorCombined, unitSystem) : '—'} {lenUnit}
          </div>
          <div className="text-3xs text-slate-400 mt-0.5">ISCWSA Rev 5</div>
        </div>
      </div>

      {/* Proximity Table */}
      <div className="flex-1 rounded-lg border overflow-hidden flex flex-col shadow-xs transition-colors bg-white dark:bg-[#0c0e17] border-slate-200 dark:border-[#171c2b]">
        <div className="p-2.5 border-b border-slate-100 dark:border-[#171c2b] flex items-center justify-between text-3xs text-slate-500">
          <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
            <Crosshair className="w-3 h-3 text-sky-500" />
            <span>{isRu ? 'ТОЧКИ РАСЧЕТА СБЛИЖЕНИЯ' : 'PROXIMITY SCAN POINTS'}</span>
          </div>
          <span>{scanPoints.length} {isRu ? 'точек' : 'points'}</span>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead className="sticky top-0 z-10 border-b border-slate-200 dark:border-[#1c2235] bg-slate-100 dark:bg-[#0f121d] text-slate-500 dark:text-slate-400 text-3xs uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-2 px-3 text-right">MD ({lenUnit})</th>
                <th className="py-2 px-3 text-right">TVD ({lenUnit})</th>
                <th className="py-2 px-3 text-right">Offset MD ({lenUnit})</th>
                <th className="py-2 px-3 text-right">{isRu ? 'Дистанция' : 'Distance'} ({lenUnit})</th>
                <th className="py-2 px-3 text-right">{isRu ? 'Погрешность' : 'Error'} ({lenUnit})</th>
                <th className="py-2 px-3 text-right">SF</th>
                <th className="py-2 px-3 text-center">{isRu ? 'Статус' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#141828]">
              {scanPoints.map((pt, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-[#111422] transition-colors">
                  <td className="py-1.5 px-3 font-semibold text-sky-600 dark:text-sky-400">
                    {formatLength(pt.md, unitSystem)}
                  </td>
                  <td className="py-1.5 px-3 text-slate-700 dark:text-slate-300">
                    {formatLength(pt.tvd, unitSystem)}
                  </td>
                  <td className="py-1.5 px-3 text-slate-500">
                    {formatLength(pt.offsetMd, unitSystem)}
                  </td>
                  <td className="py-1.5 px-3 font-medium text-slate-800 dark:text-slate-200">
                    {formatLength(pt.centerDistance, unitSystem)}
                  </td>
                  <td className="py-1.5 px-3 text-slate-500">
                    {formatLength(pt.errorMajorCombined, unitSystem)}
                  </td>
                  <td className="py-1.5 px-3">
                    <span
                      className={
                        pt.separationFactor >= 2.0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : pt.separationFactor >= 1.25
                          ? 'text-amber-600 dark:text-amber-400 font-semibold'
                          : 'text-rose-600 dark:text-rose-400 font-bold'
                      }
                    >
                      {pt.separationFactor.toFixed(2)}
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        pt.status === 'safe'
                          ? 'bg-emerald-500'
                          : pt.status === 'warning'
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                      }`}
                      title={pt.status}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
