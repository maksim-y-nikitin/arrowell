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
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
} from 'lucide-react';

export const AntiCollisionScan: React.FC = () => {
  const { stations, unitSystem, activeWell, geoRef, language } = useWellbore();

  const [selectedOffsetWell, setSelectedOffsetWell] = useState<string>(offsetWellsData[0].name);
  const [errorModel, setErrorModel] = useState<string>('ISCWSA_MWD_REV4');
  const [expansionK, setExpansionK] = useState<number>(2.0);
  const [, setIsLoading] = useState<boolean>(false);
  const [isLiveBackend, setIsLiveBackend] = useState<boolean>(false);

  // Proximity scan calculation results
  const [scanPoints, setScanPoints] = useState<AntiCollisionPoint[]>([]);

  const activeOffset = useMemo(() => {
    return (
      offsetWellsData.find((w) => w.name === selectedOffsetWell) || offsetWellsData[0]
    );
  }, [selectedOffsetWell]);

  // Execute Anti-Collision scan via backend API with local resilience fallback
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
        // Graceful fallback to local heuristic calculation if backend is offline
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
    <div className="w-full h-full flex flex-col select-none overflow-hidden bg-[var(--bg-1)] font-mono text-[11px]">
      {/* Panel Header */}
      <div className="h-9 px-3 border-b border-[var(--line)] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 font-semibold text-[11.5px] font-sans text-[var(--fg-0)]">
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--fg-2)]" />
            <span>{isRu ? 'Анализ сближения стволов ISCWSA' : 'ISCWSA Anti-Collision Scan'}</span>
          </div>

          <span className={`pill ${minSeparationFactor >= 1.5 ? 'ok' : minSeparationFactor >= 1.0 ? 'warn' : 'crit'}`}>
            {minSeparationFactor >= 1.5 ? 'Clear' : minSeparationFactor >= 1.0 ? '1 warning' : 'Collision alert'}
          </span>

          <span className="pill acc">
            {isLiveBackend ? 'ISCWSA 3D EOU (Live)' : 'Local Fallback'}
          </span>
        </div>

        {/* Scan Parameters Toolbar */}
        <div className="flex items-center gap-2">
          {/* Offset Well Selection */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[var(--fg-3)] uppercase font-semibold">
              {isRu ? 'Скважина:' : 'Offset:'}
            </span>
            <select
              value={selectedOffsetWell}
              onChange={(e) => setSelectedOffsetWell(e.target.value)}
              className="bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--r1)] px-1.5 py-0.5 text-[10.5px] text-[var(--fg-0)] outline-none focus:border-[var(--accent)]"
            >
              {offsetWellsData.map((off) => (
                <option key={off.name} value={off.name}>
                  {off.name}
                </option>
              ))}
            </select>
          </div>

          {/* Model Selection */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[var(--fg-3)] uppercase font-semibold">
              {isRu ? 'Модель:' : 'Model:'}
            </span>
            <select
              value={errorModel}
              onChange={(e) => setErrorModel(e.target.value)}
              className="bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--r1)] px-1.5 py-0.5 text-[10.5px] text-[var(--fg-0)] outline-none focus:border-[var(--accent)]"
            >
              <option value="ISCWSA_MWD_REV4">ISCWSA MWD Rev 4</option>
              <option value="ISCWSA_MWD_SAG_REV4">ISCWSA MWD+SAG</option>
              <option value="ISCWSA_MWD_REV5">ISCWSA MWD Rev 5.11</option>
            </select>
          </div>

          {/* Expansion k-Factor */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[var(--fg-3)] uppercase font-semibold">k:</span>
            <select
              value={expansionK}
              onChange={(e) => setExpansionK(parseFloat(e.target.value))}
              className="bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--r1)] px-1.5 py-0.5 text-[10.5px] font-bold text-[var(--accent)] outline-none focus:border-[var(--accent)]"
            >
              <option value={2.0}>2.00 (2σ)</option>
              <option value={2.7955}>2.80 (3D 95%)</option>
              <option value={3.0}>3.00 (3σ)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-3 overflow-y-auto space-y-3">
        {/* 4 Summary KPI Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* KPI 1: Separation Factor (SF) */}
          <div className="p-3 bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--r2)] flex flex-col justify-between">
            <div className="text-[10px] uppercase font-mono tracking-[0.06em] text-[var(--fg-3)]">
              {isRu ? 'Мин. фактор SF' : 'Min SF'}
            </div>
            <div
              className={`text-[22px] font-bold font-mono mt-1 flex items-center gap-1.5 ${
                minSeparationFactor >= 1.5
                  ? 'text-[var(--ok)]'
                  : minSeparationFactor >= 1.0
                  ? 'text-[var(--warn)]'
                  : 'text-[var(--crit)]'
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
            <div className="text-[9.5px] text-[var(--fg-2)] mt-0.5">
              {minSeparationFactor >= 1.5
                ? 'Safe (SF >= 1.5)'
                : minSeparationFactor >= 1.0
                ? 'Caution (1.0 <= SF < 1.5)'
                : 'Critical collision risk'}
            </div>
          </div>

          {/* KPI 2: Center Distance (Dc) */}
          <div className="p-3 bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--r2)] flex flex-col justify-between">
            <div className="text-[10px] uppercase font-mono tracking-[0.06em] text-[var(--fg-3)]">
              {isRu ? 'Мин. расстояние (Dc)' : 'Min Distance'}
            </div>
            <div className="text-[22px] font-bold font-mono mt-1 text-[var(--fg-0)]">
              {closestPoint ? formatLength(closestPoint.centerDistance, unitSystem) : '—'} {lenUnit}
            </div>
            <div className="text-[9.5px] text-[var(--fg-2)] mt-0.5">
              {isRu ? 'На глубине MD' : 'At MD'}: {closestPoint ? formatLength(closestPoint.md, unitSystem) : '—'} {lenUnit}
            </div>
          </div>

          {/* KPI 3: Closest MD Depth */}
          <div className="p-3 bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--r2)] flex flex-col justify-between">
            <div className="text-[10px] uppercase font-mono tracking-[0.06em] text-[var(--fg-3)]">
              {isRu ? 'Точка сближения MD' : 'Closest MD'}
            </div>
            <div className="text-[22px] font-bold font-mono mt-1 text-[var(--fg-0)]">
              {closestPoint ? formatLength(closestPoint.md, unitSystem) : '—'} {lenUnit}
            </div>
            <div className="text-[9.5px] text-[var(--fg-2)] mt-0.5">
              Offset MD: {closestPoint ? formatLength(closestPoint.offsetMd, unitSystem) : '—'} {lenUnit}
            </div>
          </div>

          {/* KPI 4: Uncertainty Envelope */}
          <div className="p-3 bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--r2)] flex flex-col justify-between">
            <div className="text-[10px] uppercase font-mono tracking-[0.06em] text-[var(--fg-3)]">
              {isRu ? 'Суммарный EOU (k*Σσ)' : 'Envelope (k*Σσ)'}
            </div>
            <div className="text-[22px] font-bold font-mono mt-1 text-[var(--accent)]">
              {closestPoint ? formatLength(closestPoint.combinedUncertainty, unitSystem) : '—'} {lenUnit}
            </div>
            <div className="text-[9.5px] text-[var(--fg-2)] mt-0.5">
              Clearance: {closestPoint ? formatLength(closestPoint.clearanceDistance, unitSystem) : '—'} {lenUnit}
            </div>
          </div>
        </div>

        {/* Proximity Scan Tabular Profile */}
        <div className="border border-[var(--line)] rounded-[var(--r2)] overflow-hidden bg-[var(--bg-1)] shadow-[var(--shadow-1)]">
          <div className="px-3 py-1.5 border-b border-[var(--line)] bg-[var(--bg-2)] flex items-center justify-between text-[10px] text-[var(--fg-2)]">
            <div className="flex items-center gap-1.5 font-semibold text-[var(--fg-0)]">
              <Crosshair className="w-3 h-3 text-[var(--accent)]" />
              <span>{isRu ? 'ПРОФИЛЬ РАСЧЕТА СБЛИЖЕНИЯ' : 'ISCWSA 3D PROXIMITY SCAN PROFILE'}</span>
            </div>
            <span>{scanPoints.length} {isRu ? 'точек' : 'scan stations'}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-mono text-[11px] text-right">
              <thead className="bg-[var(--bg-2)] border-b border-[var(--line-strong)] text-[10px] font-sans font-semibold uppercase tracking-wider text-[var(--fg-3)]">
                <tr>
                  <th className="py-2 px-3 text-right">MD ({lenUnit})</th>
                  <th className="py-2 px-3 text-right">TVD ({lenUnit})</th>
                  <th className="py-2 px-3 text-right">Offset MD</th>
                  <th className="py-2 px-3 text-right">Dc ({lenUnit})</th>
                  <th className="py-2 px-3 text-right">{isRu ? 'Зазор' : 'Clearance'}</th>
                  <th className="py-2 px-3 text-right">σ Subj</th>
                  <th className="py-2 px-3 text-right">σ Off</th>
                  <th className="py-2 px-3 text-right">EOU</th>
                  <th className="py-2 px-3 text-right font-bold">SF</th>
                  <th className="py-2 px-3 text-center">{isRu ? 'Статус' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {scanPoints.map((pt, i) => (
                  <tr key={i} className="hover:bg-[var(--bg-2)] transition-colors">
                    <td className="py-1.5 px-3 font-semibold text-[var(--accent)]">
                      {formatLength(pt.md, unitSystem)}
                    </td>
                    <td className="py-1.5 px-3 text-[var(--fg-1)]">
                      {formatLength(pt.tvd, unitSystem)}
                    </td>
                    <td className="py-1.5 px-3 text-[var(--fg-2)]">
                      {formatLength(pt.offsetMd, unitSystem)}
                    </td>
                    <td className="py-1.5 px-3 font-medium text-[var(--fg-0)]">
                      {formatLength(pt.centerDistance, unitSystem)}
                    </td>
                    <td className="py-1.5 px-3 text-[var(--fg-1)]">
                      {formatLength(pt.clearanceDistance, unitSystem)}
                    </td>
                    <td className="py-1.5 px-3 text-[var(--fg-3)]">
                      {formatLength(pt.sigmaSubject, unitSystem)}
                    </td>
                    <td className="py-1.5 px-3 text-[var(--fg-3)]">
                      {formatLength(pt.sigmaOffset, unitSystem)}
                    </td>
                    <td className="py-1.5 px-3 font-medium text-[var(--accent)]">
                      {formatLength(pt.combinedUncertainty, unitSystem)}
                    </td>
                    <td className="py-1.5 px-3">
                      <span
                        className={`font-bold ${
                          pt.separationFactor >= 1.5
                            ? 'text-[var(--ok)]'
                            : pt.separationFactor >= 1.0
                            ? 'text-[var(--warn)]'
                            : 'text-[var(--crit)]'
                        }`}
                      >
                        {pt.separationFactor.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      <span
                        className={`pill ${
                          pt.status === 'safe'
                            ? 'ok'
                            : pt.status === 'warning'
                            ? 'warn'
                            : 'crit'
                        }`}
                      >
                        {pt.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};