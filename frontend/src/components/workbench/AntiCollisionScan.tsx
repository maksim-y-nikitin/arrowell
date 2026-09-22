import React, { useMemo, useState, useEffect } from 'react';
import { useWellbore } from '@/context/WellboreContext';
import { offsetWellsData } from '@/data/wellsData';
import { AntiCollisionPoint } from '@/types';
import { triggerAntiCollisionScan } from '@/utils/api';
import { calculateAntiCollisionScan as calculateFallbackScan } from '@/utils/geomagneticEngine';
import { formatLength } from '@/utils/directionalMath';
import {
  ShieldCheck,
  Crosshair,
  Sliders,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
} from 'lucide-react';

export const AntiCollisionScan: React.FC = () => {
  const { stations, unitSystem, activeWell, geoRef, language, notify } = useWellbore();

  const [selectedOffsetWell, setSelectedOffsetWell] = useState<string>(offsetWellsData[0].name);
  const [errorModel, setErrorModel] = useState<string>('ISCWSA_MWD_REV4');
  const [expansionK, setExpansionK] = useState<number>(2.0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLiveBackend, setIsLiveBackend] = useState<boolean>(false);

  // Scan points state (populated via backend ISCWSA API, with local fallback)
  const [scanPoints, setScanPoints] = useState<AntiCollisionPoint[]>([]);

  const activeOffset = useMemo(() => {
    return (
      offsetWellsData.find((w) => w.name === selectedOffsetWell) || offsetWellsData[0]
    );
  }, [selectedOffsetWell]);

  // Execute Anti-Collision scan via backend or local fallback
  useEffect(() => {
    let isMounted = true;

    async function runScan() {
      if (stations.length < 2) return;
      setIsLoading(true);

      try {
        const response = await triggerAntiCollisionScan(activeWell.id, {
          offset_well_name: activeOffset.name,
          offset_stations: activeOffset.stations,
          model_name: errorModel,
          expansion_k: expansionK,
          b_total_ref: geoRef.bTotalRef,
          dip_ref_deg: geoRef.dipRef,
          declination_deg: geoRef.declination,
        });

        if (isMounted && response?.scan_points) {
          const mapped: AntiCollisionPoint[] = response.scan_points.map((pt) => {
            let status: 'safe' | 'warning' | 'critical' = 'safe';
            if (pt.separation_factor < 1.0) status = 'critical';
            else if (pt.separation_factor < 1.5) status = 'warning';

            return {
              md: pt.md,
              tvd: pt.tvd,
              northing: pt.northing,
              easting: pt.easting,
              offsetWellName: pt.offset_well_name,
              offsetMd: pt.offset_md,
              centerDistance: pt.center_distance,
              clearanceDistance: pt.clearance_distance,
              sigmaSubject: pt.sigma_subject,
              sigmaOffset: pt.sigma_offset,
              combinedUncertainty: pt.combined_uncertainty,
              separationFactor: pt.separation_factor,
              isViolation: pt.is_violation,
              status,
              warningLevel: pt.warning_level,
            };
          });

          setScanPoints(mapped);
          setIsLiveBackend(true);
        }
      } catch (err) {
        // Fallback to local heuristic if backend endpoint is unavailable
        if (isMounted) {
          console.warn('Backend Anti-Collision API unreachable, using local fallback:', err);
          const localPoints = calculateFallbackScan(stations, activeOffset.stations, activeOffset.name);
          const mappedFallback: AntiCollisionPoint[] = localPoints.map((pt) => ({
            ...pt,
            clearanceDistance: Number((pt.centerDistance - 0.216).toFixed(2)),
            sigmaSubject: Number((pt.errorMajorCombined * 0.5).toFixed(2)),
            sigmaOffset: Number((pt.errorMajorCombined * 0.5).toFixed(2)),
            combinedUncertainty: pt.errorMajorCombined,
            isViolation: pt.separationFactor < 1.0,
            warningLevel: pt.separationFactor < 1.0 ? 'CRITICAL' : pt.separationFactor < 1.5 ? 'WARNING' : 'SAFE',
          }));
          setScanPoints(mappedFallback);
          setIsLiveBackend(false);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    runScan();

    return () => {
      isMounted = false;
    };
  }, [
    activeWell.id,
    stations,
    activeOffset,
    errorModel,
    expansionK,
    geoRef.bTotalRef,
    geoRef.dipRef,
    geoRef.declination,
  ]);

  const minSeparationFactor = useMemo(() => {
    if (scanPoints.length === 0) return 99.0;
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
      {/* Top Banner: Controls and Parameters */}
      <div className="p-4 rounded-lg border shadow-xs flex flex-wrap items-center justify-between gap-4 transition-colors bg-white dark:bg-[#0c0e17] border-slate-200 dark:border-[#171c2b]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 dark:text-white">
                {isRu ? 'Анализ сближения стволов (ISCWSA Error Model)' : 'ISCWSA Anti-Collision Proximity Scan'}
              </span>
              <span
                className={`px-1.5 py-0.2 rounded text-4xs font-semibold ${
                  isLiveBackend
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                }`}
              >
                {isLiveBackend ? 'ISCWSA 3D EOU (Live)' : 'Local Fallback'}
              </span>
            </div>
            <div className="text-3xs text-slate-500 dark:text-slate-400">
              {activeWell.name} vs. <span className="font-medium text-slate-700 dark:text-slate-300">{activeOffset.name}</span>
            </div>
          </div>
        </div>

        {/* Configuration Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Offset Well */}
          <div className="flex items-center gap-1.5">
            <span className="text-3xs text-slate-500">{isRu ? 'Соседняя:' : 'Scan Against:'}</span>
            <select
              value={selectedOffsetWell}
              onChange={(e) => setSelectedOffsetWell(e.target.value)}
              className="bg-white dark:bg-[#121624] border border-slate-200 dark:border-[#1c2236] rounded-md px-2 py-1 text-3xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
            >
              {offsetWellsData.map((off) => (
                <option key={off.name} value={off.name}>
                  {off.name} ({off.slot})
                </option>
              ))}
            </select>
          </div>

          {/* Error Model */}
          <div className="flex items-center gap-1.5">
            <span className="text-3xs text-slate-500">{isRu ? 'Модель:' : 'Model:'}</span>
            <select
              value={errorModel}
              onChange={(e) => setErrorModel(e.target.value)}
              className="bg-white dark:bg-[#121624] border border-slate-200 dark:border-[#1c2236] rounded-md px-2 py-1 text-3xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="ISCWSA_MWD_REV4">ISCWSA MWD Rev 4 (Generic)</option>
              <option value="ISCWSA_MWD_SAG_REV4">ISCWSA MWD+SAG Rev 4</option>
              <option value="ISCWSA_MWD_IFR1_REV4">ISCWSA MWD+IFR1 Rev 4</option>
              <option value="ISCWSA_MWD_REV5">ISCWSA MWD Rev 5.11 (Latest)</option>
            </select>
          </div>

          {/* Expansion k-Factor */}
          <div className="flex items-center gap-1.5">
            <span className="text-3xs text-slate-500">k (σ):</span>
            <select
              value={expansionK}
              onChange={(e) => setExpansionK(parseFloat(e.target.value))}
              className="bg-white dark:bg-[#121624] border border-slate-200 dark:border-[#1c2236] rounded-md px-2 py-1 text-3xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500 font-bold text-sky-600 dark:text-sky-400"
            >
              <option value={2.0}>2.00 (2σ • 95.4% 1D)</option>
              <option value={2.7955}>2.80 (3D 95.0% Sphere)</option>
              <option value={3.0}>3.00 (3σ • 99.7% 1D)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {/* KPI 1: Separation Factor */}
        <div className="p-3 rounded-lg border shadow-xs transition-colors bg-white dark:bg-[#0c0e17] border-slate-200 dark:border-[#171c2b]">
          <div className="text-3xs text-slate-500 uppercase">{isRu ? 'Мин. фактор разделения (SF)' : 'Min Separation Factor (SF)'}</div>
          <div
            className={`text-lg font-bold mt-1 flex items-center gap-1.5 ${
              minSeparationFactor >= 1.5
                ? 'text-emerald-600 dark:text-emerald-400'
                : minSeparationFactor >= 1.0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {minSeparationFactor >= 1.5 ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : minSeparationFactor >= 1.0 ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <AlertOctagon className="w-4 h-4" />
            )}
            <span>{minSeparationFactor.toFixed(2)}</span>
          </div>
          <div className="text-3xs text-slate-400 mt-0.5">
            {minSeparationFactor >= 1.5
              ? (isRu ? 'Безопасно (SF ≥ 1.5)' : 'Safe (SF >= 1.5)')
              : minSeparationFactor >= 1.0
              ? (isRu ? 'Внимание (1.0 ≤ SF < 1.5)' : 'Caution (1.0 <= SF < 1.5)')
              : (isRu ? 'Критично (SF < 1.0 Риск столкновения)' : 'Critical (Collision Risk)')}
          </div>
        </div>

        {/* KPI 2: Closest Distance */}
        <div className="p-3 rounded-lg border shadow-xs transition-colors bg-white dark:bg-[#0c0e17] border-slate-200 dark:border-[#171c2b]">
          <div className="text-3xs text-slate-500 uppercase">{isRu ? 'Мин. расстояние (Dc)' : 'Min Center Distance (Dc)'}</div>
          <div className="text-lg font-semibold mt-1 text-slate-800 dark:text-slate-200">
            {closestPoint ? formatLength(closestPoint.centerDistance, unitSystem) : '—'} {lenUnit}
          </div>
          <div className="text-3xs text-slate-400 mt-0.5">
            {isRu ? 'На глубине MD' : 'At MD'}: {closestPoint ? formatLength(closestPoint.md, unitSystem) : '—'} {lenUnit}
          </div>
        </div>

        {/* KPI 3: Combined Uncertainty Envelope */}
        <div className="p-3 rounded-lg border shadow-xs transition-colors bg-white dark:bg-[#0c0e17] border-slate-200 dark:border-[#171c2b]">
          <div className="text-3xs text-slate-500 uppercase">{isRu ? 'Суммарный эллипсоид k*(σS+σO)' : 'Uncertainty Envelope (k*Σσ)'}</div>
          <div className="text-lg font-semibold mt-1 text-sky-600 dark:text-sky-400">
            {closestPoint ? formatLength(closestPoint.combinedUncertainty, unitSystem) : '—'} {lenUnit}
          </div>
          <div className="text-3xs text-slate-400 mt-0.5">
            σS: {closestPoint ? formatLength(closestPoint.sigmaSubject, unitSystem) : '—'} | σO: {closestPoint ? formatLength(closestPoint.sigmaOffset, unitSystem) : '—'} {lenUnit}
          </div>
        </div>

        {/* KPI 4: Surface Clearance Distance */}
        <div className="p-3 rounded-lg border shadow-xs transition-colors bg-white dark:bg-[#0c0e17] border-slate-200 dark:border-[#171c2b]">
          <div className="text-3xs text-slate-500 uppercase">{isRu ? 'Чистый зазор между стенками' : 'Borehole Clearance (Dc-2R)'}</div>
          <div className="text-lg font-semibold mt-1 text-slate-800 dark:text-slate-200">
            {closestPoint ? formatLength(closestPoint.clearanceDistance, unitSystem) : '—'} {lenUnit}
          </div>
          <div className="text-3xs text-slate-400 mt-0.5">
            {isRu ? 'Радиус ствола' : 'Hole radii'}: 2 × 108 mm
          </div>
        </div>
      </div>

      {/* Main Proximity Scan Data Table */}
      <div className="flex-1 rounded-lg border overflow-hidden flex flex-col shadow-xs transition-colors bg-white dark:bg-[#0c0e17] border-slate-200 dark:border-[#171c2b]">
        <div className="p-2.5 border-b border-slate-100 dark:border-[#171c2b] flex items-center justify-between text-3xs text-slate-500">
          <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
            <Crosshair className="w-3 h-3 text-sky-500" />
            <span>{isRu ? 'ПРОФИЛЬ РАСЧЕТА СБЛИЖЕНИЯ И ЭЛЛИПСОИДОВ ISCWSA' : 'ISCWSA 3D PROXIMITY SCAN PROFILE'}</span>
          </div>
          <span>{scanPoints.length} {isRu ? 'точек' : 'scan stations'}</span>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead className="sticky top-0 z-10 border-b border-slate-200 dark:border-[#1c2235] bg-slate-100 dark:bg-[#0f121d] text-slate-500 dark:text-slate-400 text-3xs uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-2 px-3 text-right">MD ({lenUnit})</th>
                <th className="py-2 px-3 text-right">TVD ({lenUnit})</th>
                <th className="py-2 px-3 text-right">Offset MD ({lenUnit})</th>
                <th className="py-2 px-3 text-right">{isRu ? 'Межосевое Dc' : 'Center Dist (Dc)'} ({lenUnit})</th>
                <th className="py-2 px-3 text-right">{isRu ? 'Зазор стенки' : 'Clearance'} ({lenUnit})</th>
                <th className="py-2 px-3 text-right">σ_Subj ({lenUnit})</th>
                <th className="py-2 px-3 text-right">σ_Off ({lenUnit})</th>
                <th className="py-2 px-3 text-right">{isRu ? 'Зона EOU' : 'EOU Envelope'} ({lenUnit})</th>
                <th className="py-2 px-3 text-right font-bold">SF</th>
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
                  <td className="py-1.5 px-3 text-slate-600 dark:text-slate-400">
                    {formatLength(pt.clearanceDistance, unitSystem)}
                  </td>
                  <td className="py-1.5 px-3 text-slate-400">
                    {formatLength(pt.sigmaSubject, unitSystem)}
                  </td>
                  <td className="py-1.5 px-3 text-slate-400">
                    {formatLength(pt.sigmaOffset, unitSystem)}
                  </td>
                  <td className="py-1.5 px-3 font-medium text-sky-600 dark:text-sky-400">
                    {formatLength(pt.combinedUncertainty, unitSystem)}
                  </td>
                  <td className="py-1.5 px-3">
                    <span
                      className={`font-bold ${
                        pt.separationFactor >= 1.5
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : pt.separationFactor >= 1.0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {pt.separationFactor.toFixed(2)}
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-4xs font-semibold uppercase ${
                        pt.status === 'safe'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : pt.status === 'warning'
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {pt.status}
                    </span>
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