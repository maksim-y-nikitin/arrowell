import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useWellbore } from '@/context/WellboreContext';
import { SurveyStation } from '@/types';
import { formatLength } from '@/utils/directionalMath';
import {
  Magnet,
  Activity,
  Compass,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';

interface HoveredPointInfo {
  chart: 'btotal' | 'gtotal' | 'dip';
  stnId: number;
  station: SurveyStation;
  rawStation: SurveyStation;
  rawVal: number;
  corrVal: number;
  refVal: number;
  tolVal: number;
  unit: string;
  x: number;
  y: number;
}

interface ChartScaleState {
  zoomX: number;
  zoomY: number;
}

/**
 * Compact 3-cell micro-strip for Overview mode.
 */
export const SensorQCStrip: React.FC = () => {
  const { stations, rawStations, geoRef } = useWellbore();

  const bPassCount = stations.filter((s) => Math.abs(s.deltaB) <= geoRef.toleranceB).length;
  const gPassCount = stations.filter((s) => Math.abs(s.deltaG) <= geoRef.toleranceG).length;
  const dipPassCount = stations.filter((s) => Math.abs(s.deltaDip) <= geoRef.toleranceDip).length;

  const minMd = useMemo(() => Math.min(...stations.map((s) => s.md), 0), [stations]);
  const maxMd = useMemo(() => Math.max(...stations.map((s) => s.md), 1000), [stations]);

  const getScaledY = (val: number, minV: number, maxV: number, height = 100, pad = 12) => {
    const span = maxV - minV || 1;
    const clamped = Math.max(minV, Math.min(maxV, val));
    return height - pad - ((clamped - minV) / span) * (height - pad * 2);
  };

  const getScaledX = (md: number, width = 300) => {
    return ((md - minMd) / (maxMd - minMd || 1)) * width;
  };

  const { bMin, bMax } = useMemo(() => {
    const vals = stations.map((s) => s.bTotal);
    const min = Math.min(...vals, geoRef.bTotalRef - geoRef.toleranceB);
    const max = Math.max(...vals, geoRef.bTotalRef + geoRef.toleranceB);
    const center = geoRef.bTotalRef;
    const halfSpan = Math.max(Math.abs(max - center), Math.abs(min - center), geoRef.toleranceB * 1.6);
    return { bMin: center - halfSpan, bMax: center + halfSpan };
  }, [stations, geoRef]);

  const { gMin, gMax } = useMemo(() => {
    const vals = stations.map((s) => s.gTotal);
    const min = Math.min(...vals, geoRef.gTotalRef - geoRef.toleranceG);
    const max = Math.max(...vals, geoRef.gTotalRef + geoRef.toleranceG);
    const center = geoRef.gTotalRef;
    const halfSpan = Math.max(Math.abs(max - center), Math.abs(min - center), geoRef.toleranceG * 1.6);
    return { gMin: center - halfSpan, gMax: center + halfSpan };
  }, [stations, geoRef]);

  const { dipMin, dipMax } = useMemo(() => {
    const vals = stations.map((s) => s.dipAngle);
    const min = Math.min(...vals, geoRef.dipRef - geoRef.toleranceDip);
    const max = Math.max(...vals, geoRef.dipRef + geoRef.toleranceDip);
    const center = geoRef.dipRef;
    const halfSpan = Math.max(Math.abs(max - center), Math.abs(min - center), geoRef.toleranceDip * 1.6);
    return { dipMin: center - halfSpan, dipMax: center + halfSpan };
  }, [stations, geoRef]);

  const bRawPath = stations
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getScaledX(s.md).toFixed(1)} ${getScaledY((rawStations.find((r) => r.id === s.id) || s).bTotal, bMin, bMax).toFixed(1)}`)
    .join(' ');

  const bCorrPath = stations
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getScaledX(s.md).toFixed(1)} ${getScaledY(s.bTotal, bMin, bMax).toFixed(1)}`)
    .join(' ');

  const gRawPath = stations
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getScaledX(s.md).toFixed(1)} ${getScaledY((rawStations.find((r) => r.id === s.id) || s).gTotal, gMin, gMax).toFixed(1)}`)
    .join(' ');

  const gCorrPath = stations
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getScaledX(s.md).toFixed(1)} ${getScaledY(s.gTotal, gMin, gMax).toFixed(1)}`)
    .join(' ');

  const dipRawPath = stations
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getScaledX(s.md).toFixed(1)} ${getScaledY((rawStations.find((r) => r.id === s.id) || s).dipAngle, dipMin, dipMax).toFixed(1)}`)
    .join(' ');

  const dipCorrPath = stations
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getScaledX(s.md).toFixed(1)} ${getScaledY(s.dipAngle, dipMin, dipMax).toFixed(1)}`)
    .join(' ');

  const bTolTop = getScaledY(geoRef.bTotalRef + geoRef.toleranceB, bMin, bMax);
  const bTolBot = getScaledY(geoRef.bTotalRef - geoRef.toleranceB, bMin, bMax);
  const bRefY = getScaledY(geoRef.bTotalRef, bMin, bMax);

  const gTolTop = getScaledY(geoRef.gTotalRef + geoRef.toleranceG, gMin, gMax);
  const gTolBot = getScaledY(geoRef.gTotalRef - geoRef.toleranceG, gMin, gMax);
  const gRefY = getScaledY(geoRef.gTotalRef, gMin, gMax);

  const dipTolTop = getScaledY(geoRef.dipRef + geoRef.toleranceDip, dipMin, dipMax);
  const dipTolBot = getScaledY(geoRef.dipRef - geoRef.toleranceDip, dipMin, dipMax);
  const dipRefY = getScaledY(geoRef.dipRef, dipMin, dipMax);

  return (
    <div className="w-full h-full flex flex-col bg-[var(--bg-1)] select-none overflow-hidden font-mono text-[11px]">
      <div className="panel-head justify-between">
        <div className="flex items-center gap-2">
          <div className="panel-title">
            <Activity className="w-3.5 h-3.5 text-[var(--fg-2)]" />
            <span>Sensor Diagnostics</span>
          </div>
          <span className="pill ok">All in spec</span>
        </div>
        <span className="panel-sub">Hover for detail</span>
      </div>

      <div className="flex-1 grid grid-cols-3 gap-[1px] bg-[var(--line)] overflow-hidden">
        {/* Cell 1: Btotal */}
        <div className="bg-[var(--bg-1)] p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--fg-0)]">
              <Magnet className="w-3 h-3 text-[var(--accent)]" />
              <span>Btotal</span>
            </div>
            <span className="pill ok">{bPassCount}/{stations.length}</span>
          </div>
          <div className="text-[10px] text-[var(--fg-2)]">
            Ref <b>{geoRef.bTotalRef.toLocaleString()} nT</b> ± {geoRef.toleranceB}
          </div>
          <div className="h-16 w-full">
            <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="w-full h-full">
              <rect x="0" y={Math.min(bTolTop, bTolBot)} width="300" height={Math.abs(bTolBot - bTolTop)} fill="color-mix(in srgb, var(--ok) 14%, transparent)" />
              <line x1="0" y1={bRefY} x2="300" y2={bRefY} stroke="var(--ok)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
              <path d={bRawPath} stroke="var(--warn)" strokeWidth="1.4" strokeDasharray="3 2" fill="none" opacity="0.8" />
              <path d={bCorrPath} stroke="var(--accent)" strokeWidth="1.8" fill="none" />
            </svg>
          </div>
        </div>

        {/* Cell 2: Gtotal */}
        <div className="bg-[var(--bg-1)] p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--fg-0)]">
              <Activity className="w-3 h-3 text-[var(--ok)]" />
              <span>Gtotal</span>
            </div>
            <span className="pill ok">{gPassCount}/{stations.length}</span>
          </div>
          <div className="text-[10px] text-[var(--fg-2)]">
            Ref <b>{geoRef.gTotalRef.toFixed(4)} g</b> ± {geoRef.toleranceG}
          </div>
          <div className="h-16 w-full">
            <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="w-full h-full">
              <rect x="0" y={Math.min(gTolTop, gTolBot)} width="300" height={Math.abs(gTolBot - gTolTop)} fill="color-mix(in srgb, var(--ok) 14%, transparent)" />
              <line x1="0" y1={gRefY} x2="300" y2={gRefY} stroke="var(--ok)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
              <path d={gRawPath} stroke="var(--warn)" strokeWidth="1.4" strokeDasharray="3 2" fill="none" opacity="0.8" />
              <path d={gCorrPath} stroke="var(--ok)" strokeWidth="1.8" fill="none" />
            </svg>
          </div>
        </div>

        {/* Cell 3: Dip Angle */}
        <div className="bg-[var(--bg-1)] p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--fg-0)]">
              <Compass className="w-3 h-3 text-[var(--mag)]" />
              <span>Dip Angle</span>
            </div>
            <span className={`pill ${dipPassCount === stations.length ? 'ok' : 'warn'}`}>
              {dipPassCount}/{stations.length}
            </span>
          </div>
          <div className="text-[10px] text-[var(--fg-2)]">
            Ref <b>{geoRef.dipRef.toFixed(2)}°</b> ± {geoRef.toleranceDip}°
          </div>
          <div className="h-16 w-full">
            <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="w-full h-full">
              <rect x="0" y={Math.min(dipTolTop, dipTolBot)} width="300" height={Math.abs(dipTolBot - dipTolTop)} fill="color-mix(in srgb, var(--ok) 14%, transparent)" />
              <line x1="0" y1={dipRefY} x2="300" y2={dipRefY} stroke="var(--ok)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
              <path d={dipRawPath} stroke="var(--warn)" strokeWidth="1.4" strokeDasharray="3 2" fill="none" opacity="0.8" />
              <path d={dipCorrPath} stroke="var(--mag)" strokeWidth="1.8" fill="none" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Full page QC analytics dashboard — 3 stacked engineering panels with full Zoom/Scale controls.
 */
export const SensorQCDashboard: React.FC = () => {
  const { stations, rawStations, geoRef, unitSystem } = useWellbore();
  const lenUnit = unitSystem === 'metric' ? 'm' : 'ft';

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(1200);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        const measured = containerRef.current.clientWidth - 32;
        if (measured > 400) setContainerWidth(measured);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const [scaleB, setScaleB] = useState<ChartScaleState>({ zoomX: 1.0, zoomY: 1.0 });
  const [scaleG, setScaleG] = useState<ChartScaleState>({ zoomX: 1.0, zoomY: 1.0 });
  const [scaleDip, setScaleDip] = useState<ChartScaleState>({ zoomX: 1.0, zoomY: 1.0 });

  const [hoveredPoint, setHoveredPoint] = useState<HoveredPointInfo | null>(null);

  const minMd = useMemo(() => Math.min(...stations.map((s) => s.md), 0), [stations]);
  const maxMd = useMemo(() => Math.max(...stations.map((s) => s.md), 1000), [stations]);

  const chartHeight = 180;
  const padL = 60;
  const padR = 24;
  const padT = 20;
  const padB = 28;
  const innerHeight = chartHeight - padT - padB;

  const updateChartScale = (
    setter: React.Dispatch<React.SetStateAction<ChartScaleState>>,
    axis: 'x' | 'y',
    delta: number
  ) => {
    setter((prev) => {
      if (axis === 'x') {
        return { ...prev, zoomX: Math.min(4.0, Math.max(1.0, Number((prev.zoomX + delta).toFixed(2)))) };
      }
      return { ...prev, zoomY: Math.min(4.0, Math.max(1.0, Number((prev.zoomY + delta).toFixed(2)))) };
    });
  };

  const resetChartScale = (setter: React.Dispatch<React.SetStateAction<ChartScaleState>>) => {
    setter({ zoomX: 1.0, zoomY: 1.0 });
  };

  // 1. Btotal Chart
  const bChartWidth = Math.round((containerWidth - padL - padR) * scaleB.zoomX);
  const bSvgWidth = padL + padR + bChartWidth;
  const getBX = (md: number) => padL + ((md - minMd) / (maxMd - minMd || 1)) * bChartWidth;

  const { bMin, bMax } = useMemo(() => {
    const vals = stations.map((s) => s.bTotal);
    const min = Math.min(...vals, geoRef.bTotalRef - geoRef.toleranceB);
    const max = Math.max(...vals, geoRef.bTotalRef + geoRef.toleranceB);
    const center = geoRef.bTotalRef;
    const halfSpan = Math.max(Math.abs(max - center), Math.abs(min - center), geoRef.toleranceB * 1.5) / scaleB.zoomY;
    return { bMin: center - halfSpan, bMax: center + halfSpan };
  }, [stations, geoRef, scaleB.zoomY]);

  const getBY = (b: number) => padT + innerHeight - ((b - bMin) / (bMax - bMin || 1)) * innerHeight;

  // 2. Gtotal Chart
  const gChartWidth = Math.round((containerWidth - padL - padR) * scaleG.zoomX);
  const gSvgWidth = padL + padR + gChartWidth;
  const getGX = (md: number) => padL + ((md - minMd) / (maxMd - minMd || 1)) * gChartWidth;

  const { gMin, gMax } = useMemo(() => {
    const vals = stations.map((s) => s.gTotal);
    const min = Math.min(...vals, geoRef.gTotalRef - geoRef.toleranceG);
    const max = Math.max(...vals, geoRef.gTotalRef + geoRef.toleranceG);
    const center = geoRef.gTotalRef;
    const halfSpan = Math.max(Math.abs(max - center), Math.abs(min - center), geoRef.toleranceG * 1.5) / scaleG.zoomY;
    return { gMin: center - halfSpan, gMax: center + halfSpan };
  }, [stations, geoRef, scaleG.zoomY]);

  const getGY = (g: number) => padT + innerHeight - ((g - gMin) / (gMax - gMin || 1)) * innerHeight;

  // 3. Dip Angle Chart
  const dipChartWidth = Math.round((containerWidth - padL - padR) * scaleDip.zoomX);
  const dipSvgWidth = padL + padR + dipChartWidth;
  const getDipX = (md: number) => padL + ((md - minMd) / (maxMd - minMd || 1)) * dipChartWidth;

  const { dipMin, dipMax } = useMemo(() => {
    const vals = stations.map((s) => s.dipAngle);
    const min = Math.min(...vals, geoRef.dipRef - geoRef.toleranceDip);
    const max = Math.max(...vals, geoRef.dipRef + geoRef.toleranceDip);
    const center = geoRef.dipRef;
    const halfSpan = Math.max(Math.abs(max - center), Math.abs(min - center), geoRef.toleranceDip * 1.5) / scaleDip.zoomY;
    return { dipMin: center - halfSpan, dipMax: center + halfSpan };
  }, [stations, geoRef, scaleDip.zoomY]);

  const getDipY = (dip: number) => padT + innerHeight - ((dip - dipMin) / (dipMax - dipMin || 1)) * innerHeight;

  // Paths
  const bRawPath = stations
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getBX(s.md).toFixed(1)} ${getBY((rawStations.find((r) => r.id === s.id) || s).bTotal).toFixed(1)}`)
    .join(' ');
  const bCorrPath = stations
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getBX(s.md).toFixed(1)} ${getBY(s.bTotal).toFixed(1)}`)
    .join(' ');

  const gRawPath = stations
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getGX(s.md).toFixed(1)} ${getGY((rawStations.find((r) => r.id === s.id) || s).gTotal).toFixed(1)}`)
    .join(' ');
  const gCorrPath = stations
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getGX(s.md).toFixed(1)} ${getGY(s.gTotal).toFixed(1)}`)
    .join(' ');

  const dipRawPath = stations
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getDipX(s.md).toFixed(1)} ${getDipY((rawStations.find((r) => r.id === s.id) || s).dipAngle).toFixed(1)}`)
    .join(' ');
  const dipCorrPath = stations
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getDipX(s.md).toFixed(1)} ${getDipY(s.dipAngle).toFixed(1)}`)
    .join(' ');

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col gap-2 p-2 bg-[var(--bg-0)] overflow-y-auto select-none font-mono text-[11px]">
      {/* 1. Btotal Panel */}
      <section className="flex-1 min-h-[240px] flex flex-col rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-1)] shadow-[var(--shadow-1)] overflow-hidden">
        <div className="panel-head justify-between">
          <div className="flex items-center gap-2">
            <span className="panel-title">Btotal vs. MD</span>
            <span className="panel-sub">Ref {geoRef.bTotalRef.toLocaleString()} nT ± {geoRef.toleranceB}</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="pill ok">{stations.length} in spec</span>

            {/* Scale controls */}
            <div className="flex items-center gap-1 bg-[var(--bg-2)] p-0.5 rounded border border-[var(--line)] text-[10px]">
              <span className="text-[var(--fg-3)] px-1 font-sans">MD:</span>
              <button onClick={() => updateChartScale(setScaleB, 'x', -0.25)} className="p-0.5 hover:bg-[var(--bg-1)] rounded text-[var(--fg-2)]"><ZoomOut className="w-3 h-3" /></button>
              <span className="font-semibold text-[var(--accent)] px-0.5">{Math.round(scaleB.zoomX * 100)}%</span>
              <button onClick={() => updateChartScale(setScaleB, 'x', 0.25)} className="p-0.5 hover:bg-[var(--bg-1)] rounded text-[var(--fg-2)]"><ZoomIn className="w-3 h-3" /></button>
              <span className="w-[1px] h-3 bg-[var(--line)] mx-0.5" />
              <span className="text-[var(--fg-3)] px-1 font-sans">Val:</span>
              <button onClick={() => updateChartScale(setScaleB, 'y', -0.25)} className="p-0.5 hover:bg-[var(--bg-1)] rounded text-[var(--fg-2)]"><ZoomOut className="w-3 h-3" /></button>
              <span className="font-semibold text-[var(--accent)] px-0.5">{Math.round(scaleB.zoomY * 100)}%</span>
              <button onClick={() => updateChartScale(setScaleB, 'y', 0.25)} className="p-0.5 hover:bg-[var(--bg-1)] rounded text-[var(--fg-2)]"><ZoomIn className="w-3 h-3" /></button>
              <button onClick={() => resetChartScale(setScaleB)} className="p-0.5 hover:bg-[var(--bg-1)] rounded text-[var(--fg-3)] ml-1"><RotateCcw className="w-3 h-3" /></button>
            </div>
          </div>
        </div>

        <div className="flex-1 w-full overflow-x-auto p-2">
          <svg viewBox={`0 0 ${bSvgWidth} ${chartHeight}`} style={{ width: `${bSvgWidth}px`, height: `${chartHeight}px` }}>
            {/* Tolerance corridor */}
            <rect
              x={padL}
              y={Math.min(getBY(geoRef.bTotalRef + geoRef.toleranceB), getBY(geoRef.bTotalRef - geoRef.toleranceB))}
              width={bChartWidth}
              height={Math.abs(getBY(geoRef.bTotalRef - geoRef.toleranceB) - getBY(geoRef.bTotalRef + geoRef.toleranceB))}
              fill="color-mix(in srgb, var(--ok) 14%, transparent)"
            />
            {/* Reference Line */}
            <line x1={padL} y1={getBY(geoRef.bTotalRef)} x2={padL + bChartWidth} y2={getBY(geoRef.bTotalRef)} stroke="var(--ok)" strokeWidth="1" strokeDasharray="4 3" />
            <text x={padL - 6} y={getBY(geoRef.bTotalRef) + 3} fill="var(--fg-3)" fontSize="9" textAnchor="end">{geoRef.bTotalRef}</text>

            <path d={bRawPath} stroke="var(--warn)" strokeWidth="1.6" strokeDasharray="4 3" fill="none" opacity="0.8" />
            <path d={bCorrPath} stroke="var(--accent)" strokeWidth="2.2" fill="none" />

            {stations.map((s) => {
              const x = getBX(s.md);
              const y = getBY(s.bTotal);
              return (
                <circle
                  key={s.id}
                  cx={x}
                  cy={y}
                  r="3.5"
                  fill="var(--accent)"
                  stroke="var(--bg-1)"
                  strokeWidth="1"
                  className="cursor-pointer"
                  onMouseEnter={(e) => setHoveredPoint({
                    chart: 'btotal',
                    stnId: s.id,
                    station: s,
                    rawStation: rawStations.find((r) => r.id === s.id) || s,
                    rawVal: (rawStations.find((r) => r.id === s.id) || s).bTotal,
                    corrVal: s.bTotal,
                    refVal: geoRef.bTotalRef,
                    tolVal: geoRef.toleranceB,
                    unit: 'nT',
                    x: e.clientX,
                    y: e.clientY,
                  })}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              );
            })}
          </svg>
        </div>
      </section>

      {/* 2. Gtotal Panel */}
      <section className="flex-1 min-h-[240px] flex flex-col rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-1)] shadow-[var(--shadow-1)] overflow-hidden">
        <div className="panel-head justify-between">
          <div className="flex items-center gap-2">
            <span className="panel-title">Gtotal vs. MD</span>
            <span className="panel-sub">Ref {geoRef.gTotalRef.toFixed(4)} g ± {geoRef.toleranceG}</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="pill ok">{stations.length} in spec</span>

            <div className="flex items-center gap-1 bg-[var(--bg-2)] p-0.5 rounded border border-[var(--line)] text-[10px]">
              <span className="text-[var(--fg-3)] px-1 font-sans">MD:</span>
              <button onClick={() => updateChartScale(setScaleG, 'x', -0.25)} className="p-0.5 hover:bg-[var(--bg-1)] rounded text-[var(--fg-2)]"><ZoomOut className="w-3 h-3" /></button>
              <span className="font-semibold text-[var(--ok)] px-0.5">{Math.round(scaleG.zoomX * 100)}%</span>
              <button onClick={() => updateChartScale(setScaleG, 'x', 0.25)} className="p-0.5 hover:bg-[var(--bg-1)] rounded text-[var(--fg-2)]"><ZoomIn className="w-3 h-3" /></button>
              <span className="w-[1px] h-3 bg-[var(--line)] mx-0.5" />
              <span className="text-[var(--fg-3)] px-1 font-sans">Val:</span>
              <button onClick={() => updateChartScale(setScaleG, 'y', -0.25)} className="p-0.5 hover:bg-[var(--bg-1)] rounded text-[var(--fg-2)]"><ZoomOut className="w-3 h-3" /></button>
              <span className="font-semibold text-[var(--ok)] px-0.5">{Math.round(scaleG.zoomY * 100)}%</span>
              <button onClick={() => updateChartScale(setScaleG, 'y', 0.25)} className="p-0.5 hover:bg-[var(--bg-1)] rounded text-[var(--fg-2)]"><ZoomIn className="w-3 h-3" /></button>
              <button onClick={() => resetChartScale(setScaleG)} className="p-0.5 hover:bg-[var(--bg-1)] rounded text-[var(--fg-3)] ml-1"><RotateCcw className="w-3 h-3" /></button>
            </div>
          </div>
        </div>

        <div className="flex-1 w-full overflow-x-auto p-2">
          <svg viewBox={`0 0 ${gSvgWidth} ${chartHeight}`} style={{ width: `${gSvgWidth}px`, height: `${chartHeight}px` }}>
            <rect
              x={padL}
              y={Math.min(getGY(geoRef.gTotalRef + geoRef.toleranceG), getGY(geoRef.gTotalRef - geoRef.toleranceG))}
              width={gChartWidth}
              height={Math.abs(getGY(geoRef.gTotalRef - geoRef.toleranceG) - getGY(geoRef.gTotalRef + geoRef.toleranceG))}
              fill="color-mix(in srgb, var(--ok) 14%, transparent)"
            />
            <line x1={padL} y1={getGY(geoRef.gTotalRef)} x2={padL + gChartWidth} y2={getGY(geoRef.gTotalRef)} stroke="var(--ok)" strokeWidth="1" strokeDasharray="4 3" />
            <text x={padL - 6} y={getGY(geoRef.gTotalRef) + 3} fill="var(--fg-3)" fontSize="9" textAnchor="end">{geoRef.gTotalRef.toFixed(3)}</text>

            <path d={gRawPath} stroke="var(--warn)" strokeWidth="1.6" strokeDasharray="4 3" fill="none" opacity="0.8" />
            <path d={gCorrPath} stroke="var(--ok)" strokeWidth="2.2" fill="none" />

            {stations.map((s) => {
              const x = getGX(s.md);
              const y = getGY(s.gTotal);
              return (
                <circle
                  key={s.id}
                  cx={x}
                  cy={y}
                  r="3.5"
                  fill="var(--ok)"
                  stroke="var(--bg-1)"
                  strokeWidth="1"
                  className="cursor-pointer"
                  onMouseEnter={(e) => setHoveredPoint({
                    chart: 'gtotal',
                    stnId: s.id,
                    station: s,
                    rawStation: rawStations.find((r) => r.id === s.id) || s,
                    rawVal: (rawStations.find((r) => r.id === s.id) || s).gTotal,
                    corrVal: s.gTotal,
                    refVal: geoRef.gTotalRef,
                    tolVal: geoRef.toleranceG,
                    unit: 'g',
                    x: e.clientX,
                    y: e.clientY,
                  })}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              );
            })}
          </svg>
        </div>
      </section>

      {/* 3. Dip Angle Panel */}
      <section className="flex-1 min-h-[240px] flex flex-col rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-1)] shadow-[var(--shadow-1)] overflow-hidden">
        <div className="panel-head justify-between">
          <div className="flex items-center gap-2">
            <span className="panel-title">Dip Angle vs. MD</span>
            <span className="panel-sub">Ref {geoRef.dipRef.toFixed(2)}° ± {geoRef.toleranceDip}°</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="pill warn">{stations.length} in spec</span>

            <div className="flex items-center gap-1 bg-[var(--bg-2)] p-0.5 rounded border border-[var(--line)] text-[10px]">
              <span className="text-[var(--fg-3)] px-1 font-sans">MD:</span>
              <button onClick={() => updateChartScale(setScaleDip, 'x', -0.25)} className="p-0.5 hover:bg-[var(--bg-1)] rounded text-[var(--fg-2)]"><ZoomOut className="w-3 h-3" /></button>
              <span className="font-semibold text-[var(--mag)] px-0.5">{Math.round(scaleDip.zoomX * 100)}%</span>
              <button onClick={() => updateChartScale(setScaleDip, 'x', 0.25)} className="p-0.5 hover:bg-[var(--bg-1)] rounded text-[var(--fg-2)]"><ZoomIn className="w-3 h-3" /></button>
              <span className="w-[1px] h-3 bg-[var(--line)] mx-0.5" />
              <span className="text-[var(--fg-3)] px-1 font-sans">Val:</span>
              <button onClick={() => updateChartScale(setScaleDip, 'y', -0.25)} className="p-0.5 hover:bg-[var(--bg-1)] rounded text-[var(--fg-2)]"><ZoomOut className="w-3 h-3" /></button>
              <span className="font-semibold text-[var(--mag)] px-0.5">{Math.round(scaleDip.zoomY * 100)}%</span>
              <button onClick={() => updateChartScale(setScaleDip, 'y', 0.25)} className="p-0.5 hover:bg-[var(--bg-1)] rounded text-[var(--fg-2)]"><ZoomIn className="w-3 h-3" /></button>
              <button onClick={() => resetChartScale(setScaleDip)} className="p-0.5 hover:bg-[var(--bg-1)] rounded text-[var(--fg-3)] ml-1"><RotateCcw className="w-3 h-3" /></button>
            </div>
          </div>
        </div>

        <div className="flex-1 w-full overflow-x-auto p-2">
          <svg viewBox={`0 0 ${dipSvgWidth} ${chartHeight}`} style={{ width: `${dipSvgWidth}px`, height: `${chartHeight}px` }}>
            <rect
              x={padL}
              y={Math.min(getDipY(geoRef.dipRef + geoRef.toleranceDip), getDipY(geoRef.dipRef - geoRef.toleranceDip))}
              width={dipChartWidth}
              height={Math.abs(getDipY(geoRef.dipRef - geoRef.toleranceDip) - getDipY(geoRef.dipRef + geoRef.toleranceDip))}
              fill="color-mix(in srgb, var(--ok) 14%, transparent)"
            />
            <line x1={padL} y1={getDipY(geoRef.dipRef)} x2={padL + dipChartWidth} y2={getDipY(geoRef.dipRef)} stroke="var(--ok)" strokeWidth="1" strokeDasharray="4 3" />
            <text x={padL - 6} y={getDipY(geoRef.dipRef) + 3} fill="var(--fg-3)" fontSize="9" textAnchor="end">{geoRef.dipRef.toFixed(2)}°</text>

            <path d={dipRawPath} stroke="var(--warn)" strokeWidth="1.6" strokeDasharray="4 3" fill="none" opacity="0.8" />
            <path d={dipCorrPath} stroke="var(--mag)" strokeWidth="2.2" fill="none" />

            {stations.map((s) => {
              const x = getDipX(s.md);
              const y = getDipY(s.dipAngle);
              return (
                <circle
                  key={s.id}
                  cx={x}
                  cy={y}
                  r="3.5"
                  fill="var(--mag)"
                  stroke="var(--bg-1)"
                  strokeWidth="1"
                  className="cursor-pointer"
                  onMouseEnter={(e) => setHoveredPoint({
                    chart: 'dip',
                    stnId: s.id,
                    station: s,
                    rawStation: rawStations.find((r) => r.id === s.id) || s,
                    rawVal: (rawStations.find((r) => r.id === s.id) || s).dipAngle,
                    corrVal: s.dipAngle,
                    refVal: geoRef.dipRef,
                    tolVal: geoRef.toleranceDip,
                    unit: '°',
                    x: e.clientX,
                    y: e.clientY,
                  })}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              );
            })}
          </svg>
        </div>
      </section>

      {/* Hover Inspection Tooltip */}
      {hoveredPoint && (
        <div
          className="fixed z-50 pointer-events-none p-2.5 rounded-[var(--r2)] shadow-[var(--shadow-2)] text-[10.5px] border bg-[var(--bg-1)] text-[var(--fg-0)] border-[var(--line-strong)] font-mono min-w-60"
          style={{
            left: `${Math.min(window.innerWidth - 270, hoveredPoint.x + 14)}px`,
            top: `${Math.min(window.innerHeight - 200, Math.max(16, hoveredPoint.y - 30))}px`,
          }}
        >
          <div className="font-bold border-b border-[var(--line)] pb-1 mb-1.5 flex items-center justify-between text-[var(--accent)]">
            <span>Station #{hoveredPoint.stnId}</span>
            <span>MD: {formatLength(hoveredPoint.station.md, unitSystem)} {lenUnit}</span>
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] mb-1.5">
            <span className="text-[var(--warn)]">Raw:</span>
            <span className="text-right font-bold">{hoveredPoint.rawVal.toFixed(hoveredPoint.unit === 'g' ? 4 : 2)} {hoveredPoint.unit}</span>

            <span className="text-[var(--accent)]">Corrected:</span>
            <span className="text-right font-bold">{hoveredPoint.corrVal.toFixed(hoveredPoint.unit === 'g' ? 4 : 2)} {hoveredPoint.unit}</span>

            <span className="text-[var(--fg-2)]">Reference:</span>
            <span className="text-right">{hoveredPoint.refVal.toFixed(hoveredPoint.unit === 'g' ? 4 : 2)} {hoveredPoint.unit}</span>

            <span className="text-[var(--fg-2)]">Tolerance:</span>
            <span className="text-right">±{hoveredPoint.tolVal.toFixed(hoveredPoint.unit === 'g' ? 4 : 2)} {hoveredPoint.unit}</span>
          </div>

          <div className="pt-1 border-t border-[var(--line)] flex justify-between items-center text-[10px]">
            <span className="text-[var(--fg-3)]">Residual Δ:</span>
            <span
              className={`font-bold ${
                Math.abs(hoveredPoint.corrVal - hoveredPoint.refVal) <= hoveredPoint.tolVal
                  ? 'text-[var(--ok)]'
                  : 'text-[var(--crit)]'
              }`}
            >
              {(hoveredPoint.corrVal - hoveredPoint.refVal > 0 ? '+' : '')}
              {(hoveredPoint.corrVal - hoveredPoint.refVal).toFixed(hoveredPoint.unit === 'g' ? 4 : 2)} {hoveredPoint.unit}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};