import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useWellbore } from '@/context/WellboreContext';
import { SurveyStation } from '@/types';
import {
  Magnet,
  Activity,
  Compass,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { formatLength } from '@/utils/directionalMath';

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
  zoomX: number; // 1.0 to 4.0 (horizontal MD stretch)
  zoomY: number; // 1.0 to 4.0 (vertical value resolution)
}

export const SensorQCDashboard: React.FC = () => {
  const {
    stations,
    rawStations,
    geoRef,
    language,
    theme,
    unitSystem,
  } = useWellbore();

  // Container measurement for 100% responsive width
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(1200);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        const measured = containerRef.current.clientWidth - 28; // minus outer padding
        if (measured > 400) {
          setContainerWidth(measured);
        }
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Per-chart independent scaling states
  const [scaleB, setScaleB] = useState<ChartScaleState>({ zoomX: 1.0, zoomY: 1.0 });
  const [scaleG, setScaleG] = useState<ChartScaleState>({ zoomX: 1.0, zoomY: 1.0 });
  const [scaleDip, setScaleDip] = useState<ChartScaleState>({ zoomX: 1.0, zoomY: 1.0 });

  const [hoveredPoint, setHoveredPoint] = useState<HoveredPointInfo | null>(null);

  const isRu = language === 'ru';
  const lenUnit = unitSystem === 'metric' ? 'm' : 'ft';
  const isDark = theme === 'dark';
  const gridColor = isDark ? '#1a1f33' : '#e2e8f0';
  const textColor = isDark ? '#64748b' : '#94a3b8';

  // Station ranges: strictly bound to station depths so curves fill 100% of chart width
  const minMd = useMemo(() => {
    if (stations.length === 0) return 0;
    return Math.min(...stations.map((s) => s.md));
  }, [stations]);

  const maxMd = useMemo(() => {
    if (stations.length === 0) return 1000;
    const max = Math.max(...stations.map((s) => s.md));
    return max > minMd ? max : minMd + 100;
  }, [stations, minMd]);

  // Layout geometry: taller charts with wider usable canvas
  const chartHeight = 220;
  const padL = 64;
  const padR = 24;
  const padT = 20;
  const padB = 28;
  const innerHeight = chartHeight - padT - padB;

  // Zoom handlers for specific charts
  const updateChartScale = (
    setter: React.Dispatch<React.SetStateAction<ChartScaleState>>,
    axis: 'x' | 'y',
    delta: number
  ) => {
    setter((prev) => {
      if (axis === 'x') {
        const nextX = Math.min(4.0, Math.max(1.0, Number((prev.zoomX + delta).toFixed(2))));
        return { ...prev, zoomX: nextX };
      } else {
        const nextY = Math.min(4.0, Math.max(1.0, Number((prev.zoomY + delta).toFixed(2))));
        return { ...prev, zoomY: nextY };
      }
    });
  };

  const resetChartScale = (setter: React.Dispatch<React.SetStateAction<ChartScaleState>>) => {
    setter({ zoomX: 1.0, zoomY: 1.0 });
  };

  // -------------------------------------------------------------
  // 1. Btotal Chart Math (Dynamic Y bounds encompassing ALL data)
  // -------------------------------------------------------------
  const bChartWidth = Math.round((containerWidth - padL - padR) * scaleB.zoomX);
  const bSvgWidth = padL + padR + bChartWidth;
  const getBX = (md: number) => padL + ((md - minMd) / (maxMd - minMd || 1)) * bChartWidth;

  const { bMin, bMax } = useMemo(() => {
    const vals = [
      geoRef.bTotalRef - geoRef.toleranceB,
      geoRef.bTotalRef + geoRef.toleranceB,
      ...stations.map((s) => s.bTotal),
      ...rawStations.map((r) => r.bTotal),
    ];
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const center = (minV + maxV) / 2;
    const span = Math.max(maxV - minV, geoRef.toleranceB * 3, 600);
    const adjustedSpan = (span * 1.25) / scaleB.zoomY;
    return {
      bMin: Math.floor(center - adjustedSpan / 2),
      bMax: Math.ceil(center + adjustedSpan / 2),
    };
  }, [stations, rawStations, geoRef, scaleB.zoomY]);

  const getBY = (b: number) => padT + innerHeight - ((b - bMin) / (bMax - bMin || 1)) * innerHeight;

  const bRefY = getBY(geoRef.bTotalRef);
  const bUpperTolY = getBY(geoRef.bTotalRef + geoRef.toleranceB);
  const bLowerTolY = getBY(geoRef.bTotalRef - geoRef.toleranceB);

  const bRawPath = stations
    .map((s, i) => {
      const raw = rawStations.find((r) => r.id === s.id) || s;
      return `${i === 0 ? 'M' : 'L'} ${getBX(s.md).toFixed(1)} ${getBY(raw.bTotal).toFixed(1)}`;
    })
    .join(' ');

  const bCorrPath = stations
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getBX(s.md).toFixed(1)} ${getBY(s.bTotal).toFixed(1)}`)
    .join(' ');

  const bPassCount = stations.filter((s) => Math.abs(s.deltaB) <= geoRef.toleranceB).length;

  // -------------------------------------------------------------
  // 2. Gtotal Chart Math (Dynamic Y bounds encompassing ALL data)
  // -------------------------------------------------------------
  const gChartWidth = Math.round((containerWidth - padL - padR) * scaleG.zoomX);
  const gSvgWidth = padL + padR + gChartWidth;
  const getGX = (md: number) => padL + ((md - minMd) / (maxMd - minMd || 1)) * gChartWidth;

  const { gMin, gMax } = useMemo(() => {
    const vals = [
      geoRef.gTotalRef - geoRef.toleranceG,
      geoRef.gTotalRef + geoRef.toleranceG,
      ...stations.map((s) => s.gTotal),
      ...rawStations.map((r) => r.gTotal),
    ];
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const center = (minV + maxV) / 2;
    const span = Math.max(maxV - minV, geoRef.toleranceG * 3, 0.015);
    const adjustedSpan = (span * 1.25) / scaleG.zoomY;
    return {
      gMin: Number((center - adjustedSpan / 2).toFixed(4)),
      gMax: Number((center + adjustedSpan / 2).toFixed(4)),
    };
  }, [stations, rawStations, geoRef, scaleG.zoomY]);

  const getGY = (g: number) => padT + innerHeight - ((g - gMin) / (gMax - gMin || 1)) * innerHeight;

  const gRefY = getGY(geoRef.gTotalRef);
  const gUpperTolY = getGY(geoRef.gTotalRef + geoRef.toleranceG);
  const gLowerTolY = getGY(geoRef.gTotalRef - geoRef.toleranceG);

  const gRawPath = stations
    .map((s, i) => {
      const raw = rawStations.find((r) => r.id === s.id) || s;
      return `${i === 0 ? 'M' : 'L'} ${getGX(s.md).toFixed(1)} ${getGY(raw.gTotal).toFixed(1)}`;
    })
    .join(' ');

  const gCorrPath = stations
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getGX(s.md).toFixed(1)} ${getGY(s.gTotal).toFixed(1)}`)
    .join(' ');

  const gPassCount = stations.filter((s) => Math.abs(s.deltaG) <= geoRef.toleranceG).length;

  // -------------------------------------------------------------
  // 3. Dip Angle Chart Math (Dynamic Y bounds encompassing ALL data)
  // -------------------------------------------------------------
  const dipChartWidth = Math.round((containerWidth - padL - padR) * scaleDip.zoomX);
  const dipSvgWidth = padL + padR + dipChartWidth;
  const getDipX = (md: number) => padL + ((md - minMd) / (maxMd - minMd || 1)) * dipChartWidth;

  const { dipMin, dipMax } = useMemo(() => {
    const vals = [
      geoRef.dipRef - geoRef.toleranceDip,
      geoRef.dipRef + geoRef.toleranceDip,
      ...stations.map((s) => s.dipAngle),
      ...rawStations.map((r) => r.dipAngle),
    ];
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const center = (minV + maxV) / 2;
    const span = Math.max(maxV - minV, geoRef.toleranceDip * 3, 1.2);
    const adjustedSpan = (span * 1.25) / scaleDip.zoomY;
    return {
      dipMin: Number((center - adjustedSpan / 2).toFixed(2)),
      dipMax: Number((center + adjustedSpan / 2).toFixed(2)),
    };
  }, [stations, rawStations, geoRef, scaleDip.zoomY]);

  const getDipY = (dip: number) => padT + innerHeight - ((dip - dipMin) / (dipMax - dipMin || 1)) * innerHeight;

  const dipRefY = getDipY(geoRef.dipRef);
  const dipUpperTolY = getDipY(geoRef.dipRef + geoRef.toleranceDip);
  const dipLowerTolY = getDipY(geoRef.dipRef - geoRef.toleranceDip);

  const dipRawPath = stations
    .map((s, i) => {
      const raw = rawStations.find((r) => r.id === s.id) || s;
      return `${i === 0 ? 'M' : 'L'} ${getDipX(s.md).toFixed(1)} ${getDipY(raw.dipAngle).toFixed(1)}`;
    })
    .join(' ');

  const dipCorrPath = stations
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getDipX(s.md).toFixed(1)} ${getDipY(s.dipAngle).toFixed(1)}`)
    .join(' ');

  const dipPassCount = stations.filter((s) => Math.abs(s.deltaDip) <= geoRef.toleranceDip).length;

  // Dynamic Depth ticks helper
  const getDepthTicks = (zoomX: number) => {
    const totalSpan = maxMd - minMd;
    let step = 500;
    if (totalSpan <= 1000) step = 100;
    else if (totalSpan <= 2500) step = 250;
    else step = 500;

    if (zoomX >= 2.5) step = step / 4;
    else if (zoomX >= 1.5) step = step / 2;

    step = Math.max(step, 50);

    const ticks: number[] = [];
    const start = Math.ceil(minMd / step) * step;
    for (let d = start; d <= maxMd; d += step) {
      ticks.push(d);
    }
    return ticks;
  };

  // Helper for dynamic Y ticks
  const bTicks = useMemo(() => {
    const span = bMax - bMin;
    let step = 400;
    if (span <= 800) step = 100;
    else if (span <= 1600) step = 200;
    else if (span <= 3500) step = 400;
    else step = 800;

    const start = Math.ceil(bMin / step) * step;
    const list: number[] = [];
    for (let val = start; val <= bMax; val += step) {
      list.push(val);
    }
    return list;
  }, [bMin, bMax]);

  const gTicks = useMemo(() => {
    const span = gMax - gMin;
    let step = 0.01;
    if (span <= 0.015) step = 0.002;
    else if (span <= 0.035) step = 0.005;
    else step = 0.01;

    const start = Math.ceil(gMin / step) * step;
    const list: number[] = [];
    for (let val = start; val <= gMax + 0.0001; val += step) {
      list.push(Number(val.toFixed(4)));
    }
    return list;
  }, [gMin, gMax]);

  const dipTicks = useMemo(() => {
    const span = dipMax - dipMin;
    let step = 0.5;
    if (span <= 1.0) step = 0.2;
    else if (span <= 2.5) step = 0.5;
    else step = 1.0;

    const start = Math.ceil(dipMin / step) * step;
    const list: number[] = [];
    for (let val = start; val <= dipMax + 0.001; val += step) {
      list.push(Number(val.toFixed(2)));
    }
    return list;
  }, [dipMin, dipMax]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full p-3.5 flex flex-col gap-3 font-mono text-xs select-none overflow-y-auto transition-colors bg-slate-100 dark:bg-[#080a10]"
    >
      {/* Top Legend Bar */}
      <div className="px-4 py-2.5 rounded-lg bg-white dark:bg-[#0c0e17] border border-slate-200 dark:border-[#171c2b] flex flex-wrap items-center justify-between gap-3 text-3xs shrink-0 shadow-2xs">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
            <Activity className="w-3.5 h-3.5 text-sky-500" />
            <span>{isRu ? 'ДИАГНОСТИКА MWD ДАТЧИКОВ (QC)' : 'MWD SENSOR QC DIAGNOSTICS'}</span>
          </div>

          <div className="h-3 w-px bg-slate-200 dark:bg-[#1f253a] hidden sm:block" />

          {/* Legend Items */}
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 border-t-2 border-dashed border-amber-500 inline-block" />
            <span className="text-slate-600 dark:text-slate-400">
              {isRu ? 'Сырая телеметрия MWD' : 'Raw MWD'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 bg-sky-500 inline-block" />
            <span className="text-slate-600 dark:text-slate-400">
              {isRu ? 'Скорректированные (MSA/SAG)' : 'Corrected'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2 bg-emerald-500/20 border border-emerald-500/50 inline-block rounded-2xs" />
            <span className="text-slate-600 dark:text-slate-400">
              {isRu ? 'Эталон WMM ± допуск' : 'Reference ± Tol'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-slate-400">
          <span className="hidden md:inline">
            {isRu
              ? 'Наведите на точку для подсказки | Колесико: MD | Shift + колесико: значения'
              : 'Hover point for tooltip | Wheel: MD scale | Shift + wheel: Val scale'}
          </span>
          <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold">
            {stations.length} {isRu ? 'замеров' : 'stations'}
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* GRAPH 1: Btotal vs. MD                                                    */}
      {/* ========================================================================= */}
      <div className="p-3.5 rounded-lg border shadow-xs transition-colors bg-white dark:bg-[#0c0e17] border-slate-200 dark:border-[#171c2b] flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100 dark:border-[#171c2b] text-xs">
          {/* Left: Title + Reference Info */}
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold text-3xs">
              1
            </div>
            <span className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Magnet className="w-3.5 h-3.5 text-sky-500" />
              {isRu ? 'Общее магнитное поле Btotal vs. MD' : 'Total Magnetic Field (Btotal) vs. MD'}
            </span>
            <span className="text-3xs text-slate-400 hidden sm:inline ml-2">
              Ref: <strong className="text-slate-700 dark:text-slate-300">{geoRef.bTotalRef} nT</strong> ±{geoRef.toleranceB} nT
            </span>
          </div>

          {/* Right: Individual Chart Scale Controls */}
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-3xs font-semibold ${
              bPassCount === stations.length
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}>
              {bPassCount} / {stations.length} {isRu ? 'в норме' : 'in spec'}
            </span>

            {/* Scale Controls Toolbar */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-[#141828] p-1 rounded-md border border-slate-200 dark:border-[#1e2439] text-3xs">
              {/* MD (X-axis) Scale */}
              <div className="flex items-center gap-0.5">
                <span className="text-slate-400 font-semibold px-1">MD:</span>
                <button
                  onClick={() => updateChartScale(setScaleB, 'x', -0.25)}
                  disabled={scaleB.zoomX <= 1.0}
                  className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#20273d] disabled:opacity-30 transition-colors"
                  title={isRu ? 'Сжать по глубине (MD)' : 'Compress MD axis'}
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="w-9 text-center font-bold text-sky-600 dark:text-sky-400">
                  {Math.round(scaleB.zoomX * 100)}%
                </span>
                <button
                  onClick={() => updateChartScale(setScaleB, 'x', 0.25)}
                  disabled={scaleB.zoomX >= 4.0}
                  className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#20273d] disabled:opacity-30 transition-colors"
                  title={isRu ? 'Растянуть по глубине (MD)' : 'Stretch MD axis'}
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>

              <div className="w-px h-3 bg-slate-200 dark:bg-[#22283f]" />

              {/* Value (Y-axis) Scale */}
              <div className="flex items-center gap-0.5">
                <span className="text-slate-400 font-semibold px-1">Val:</span>
                <button
                  onClick={() => updateChartScale(setScaleB, 'y', -0.25)}
                  disabled={scaleB.zoomY <= 1.0}
                  className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#20273d] disabled:opacity-30 transition-colors"
                  title={isRu ? 'Уменьшить масштаб значений (Val)' : 'Decrease Value resolution'}
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="w-9 text-center font-bold text-sky-600 dark:text-sky-400">
                  {Math.round(scaleB.zoomY * 100)}%
                </span>
                <button
                  onClick={() => updateChartScale(setScaleB, 'y', 0.25)}
                  disabled={scaleB.zoomY >= 4.0}
                  className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#20273d] disabled:opacity-30 transition-colors"
                  title={isRu ? 'Увеличить масштаб значений (Val)' : 'Increase Value resolution'}
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>

              {/* Reset Scale */}
              <button
                onClick={() => resetChartScale(setScaleB)}
                title={isRu ? 'Сбросить масштаб (100%)' : 'Reset scale to 100%'}
                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#20273d] transition-colors ml-0.5"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Wide Canvas */}
        <div
          className="w-full overflow-x-auto pb-1 focus:outline-hidden"
          onWheel={(e) => {
            if (e.shiftKey) {
              e.preventDefault();
              const delta = e.deltaY < 0 ? 0.25 : -0.25;
              updateChartScale(setScaleB, 'y', delta);
            } else if (e.ctrlKey || e.altKey) {
              e.preventDefault();
              const delta = e.deltaY < 0 ? 0.25 : -0.25;
              updateChartScale(setScaleB, 'x', delta);
            }
          }}
        >
          <svg
            viewBox={`0 0 ${bSvgWidth} ${chartHeight}`}
            style={{ width: `${bSvgWidth}px`, height: `${chartHeight}px` }}
            className="block select-none"
          >
            {/* Tolerance corridor */}
            <rect
              x={padL}
              y={Math.max(padT, Math.min(bUpperTolY, bLowerTolY))}
              width={bChartWidth}
              height={Math.min(innerHeight, Math.abs(bLowerTolY - bUpperTolY))}
              fill="#10b981"
              fillOpacity={isDark ? 0.12 : 0.08}
            />

            {/* Reference centerline */}
            <line
              x1={padL}
              y1={bRefY}
              x2={padL + bChartWidth}
              y2={bRefY}
              stroke="#10b981"
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />

            {/* Horizontal Grid lines and Y-axis Ticks */}
            {bTicks.map((val) => {
              const y = getBY(val);
              if (y < padT || y > padT + innerHeight) return null;
              return (
                <g key={val}>
                  <line x1={padL} y1={y} x2={padL + bChartWidth} y2={y} stroke={gridColor} strokeWidth="1" />
                  <text x={padL - 8} y={y + 3} fill={textColor} fontSize="9" textAnchor="end">
                    {val} nT
                  </text>
                </g>
              );
            })}

            {/* Vertical MD Grid Lines */}
            {getDepthTicks(scaleB.zoomX).map((d) => {
              const x = getBX(d);
              return (
                <g key={d}>
                  <line x1={x} y1={padT} x2={x} y2={padT + innerHeight} stroke={gridColor} strokeWidth="1" strokeDasharray="2 2" />
                  <text x={x} y={chartHeight - 8} fill={textColor} fontSize="9" textAnchor="middle">
                    {formatLength(d, unitSystem)}
                  </text>
                </g>
              );
            })}

            {/* Raw Curve (Dashed Amber) */}
            <path d={bRawPath} fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeDasharray="5 3" />

            {/* Corrected Curve (Solid Sky) */}
            <path d={bCorrPath} fill="none" stroke="#0284c7" strokeWidth="2.4" />

            {/* Hovered Station Vertical Hairline Guide */}
            {hoveredPoint && hoveredPoint.chart === 'btotal' && (
              <line
                x1={getBX(hoveredPoint.station.md)}
                y1={padT}
                x2={getBX(hoveredPoint.station.md)}
                y2={padT + innerHeight}
                stroke="#38bdf8"
                strokeWidth="1.2"
                strokeDasharray="3 3"
                pointerEvents="none"
              />
            )}

            {/* Station Data Points & Stable Hit Targets (Zero Jitter) */}
            {stations.map((s) => {
              const raw = rawStations.find((r) => r.id === s.id) || s;
              const x = getBX(s.md);
              const rawY = getBY(raw.bTotal);
              const corrY = getBY(s.bTotal);
              const isOut = Math.abs(s.deltaB) > geoRef.toleranceB;
              const isHovered = hoveredPoint?.chart === 'btotal' && hoveredPoint?.stnId === s.id;

              return (
                <g key={s.id}>
                  {/* Stable Invisible Hit Target Column */}
                  <rect
                    x={x - 14}
                    y={padT}
                    width={28}
                    height={innerHeight}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={(e) => {
                      setHoveredPoint({
                        chart: 'btotal',
                        stnId: s.id,
                        station: s,
                        rawStation: raw,
                        rawVal: raw.bTotal,
                        corrVal: s.bTotal,
                        refVal: geoRef.bTotalRef,
                        tolVal: geoRef.toleranceB,
                        unit: 'nT',
                        x: e.clientX,
                        y: e.clientY,
                      });
                    }}
                    onMouseMove={(e) => {
                      setHoveredPoint((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
                    }}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />

                  {/* Raw Point (Amber Ring) - Pointer events none avoids mouse jitter */}
                  <circle
                    cx={x}
                    cy={rawY}
                    r={isHovered ? 4 : 2.5}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={isHovered ? 2 : 1.5}
                    pointerEvents="none"
                  />

                  {/* Corrected Point (Solid Sky / Rose if out) */}
                  <circle
                    cx={x}
                    cy={corrY}
                    r={isHovered ? 5 : 3.5}
                    fill={isOut ? '#f43f5e' : '#0284c7'}
                    stroke={isDark ? '#0c0e17' : '#fff'}
                    strokeWidth={isHovered ? 2 : 1.2}
                    pointerEvents="none"
                  />
                </g>
              );
            })}

            <text x={bSvgWidth - 8} y={chartHeight - 8} fill={textColor} fontSize="9" textAnchor="end">
              MD ({lenUnit})
            </text>
          </svg>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* GRAPH 2: Gtotal vs. MD                                                    */}
      {/* ========================================================================= */}
      <div className="p-3.5 rounded-lg border shadow-xs transition-colors bg-white dark:bg-[#0c0e17] border-slate-200 dark:border-[#171c2b] flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100 dark:border-[#171c2b] text-xs">
          {/* Left: Title + Reference Info */}
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-3xs">
              2
            </div>
            <span className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-500" />
              {isRu ? 'Общее гравитационное поле Gtotal vs. MD' : 'Total Gravitational Field (Gtotal) vs. MD'}
            </span>
            <span className="text-3xs text-slate-400 hidden sm:inline ml-2">
              Ref: <strong className="text-slate-700 dark:text-slate-300">{geoRef.gTotalRef.toFixed(4)} g</strong> ±{geoRef.toleranceG} g
            </span>
          </div>

          {/* Right: Individual Scale Controls for Gtotal */}
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-3xs font-semibold ${
              gPassCount === stations.length
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}>
              {gPassCount} / {stations.length} {isRu ? 'в норме' : 'in spec'}
            </span>

            {/* Scale Controls Toolbar */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-[#141828] p-1 rounded-md border border-slate-200 dark:border-[#1e2439] text-3xs">
              {/* MD (X-axis) Scale */}
              <div className="flex items-center gap-0.5">
                <span className="text-slate-400 font-semibold px-1">MD:</span>
                <button
                  onClick={() => updateChartScale(setScaleG, 'x', -0.25)}
                  disabled={scaleG.zoomX <= 1.0}
                  className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#20273d] disabled:opacity-30 transition-colors"
                  title={isRu ? 'Сжать по глубине (MD)' : 'Compress MD axis'}
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="w-9 text-center font-bold text-emerald-600 dark:text-emerald-400">
                  {Math.round(scaleG.zoomX * 100)}%
                </span>
                <button
                  onClick={() => updateChartScale(setScaleG, 'x', 0.25)}
                  disabled={scaleG.zoomX >= 4.0}
                  className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#20273d] disabled:opacity-30 transition-colors"
                  title={isRu ? 'Растянуть по глубине (MD)' : 'Stretch MD axis'}
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>

              <div className="w-px h-3 bg-slate-200 dark:bg-[#22283f]" />

              {/* Value (Y-axis) Scale */}
              <div className="flex items-center gap-0.5">
                <span className="text-slate-400 font-semibold px-1">Val:</span>
                <button
                  onClick={() => updateChartScale(setScaleG, 'y', -0.25)}
                  disabled={scaleG.zoomY <= 1.0}
                  className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#20273d] disabled:opacity-30 transition-colors"
                  title={isRu ? 'Уменьшить масштаб значений (Val)' : 'Decrease Value resolution'}
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="w-9 text-center font-bold text-emerald-600 dark:text-emerald-400">
                  {Math.round(scaleG.zoomY * 100)}%
                </span>
                <button
                  onClick={() => updateChartScale(setScaleG, 'y', 0.25)}
                  disabled={scaleG.zoomY >= 4.0}
                  className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#20273d] disabled:opacity-30 transition-colors"
                  title={isRu ? 'Увеличить масштаб значений (Val)' : 'Increase Value resolution'}
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>

              {/* Reset Scale */}
              <button
                onClick={() => resetChartScale(setScaleG)}
                title={isRu ? 'Сбросить масштаб (100%)' : 'Reset scale to 100%'}
                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#20273d] transition-colors ml-0.5"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Wide Canvas */}
        <div
          className="w-full overflow-x-auto pb-1 focus:outline-hidden"
          onWheel={(e) => {
            if (e.shiftKey) {
              e.preventDefault();
              const delta = e.deltaY < 0 ? 0.25 : -0.25;
              updateChartScale(setScaleG, 'y', delta);
            } else if (e.ctrlKey || e.altKey) {
              e.preventDefault();
              const delta = e.deltaY < 0 ? 0.25 : -0.25;
              updateChartScale(setScaleG, 'x', delta);
            }
          }}
        >
          <svg
            viewBox={`0 0 ${gSvgWidth} ${chartHeight}`}
            style={{ width: `${gSvgWidth}px`, height: `${chartHeight}px` }}
            className="block select-none"
          >
            {/* Tolerance corridor */}
            <rect
              x={padL}
              y={Math.max(padT, Math.min(gUpperTolY, gLowerTolY))}
              width={gChartWidth}
              height={Math.min(innerHeight, Math.abs(gLowerTolY - gUpperTolY))}
              fill="#10b981"
              fillOpacity={isDark ? 0.12 : 0.08}
            />

            {/* Reference centerline */}
            <line
              x1={padL}
              y1={gRefY}
              x2={padL + gChartWidth}
              y2={gRefY}
              stroke="#10b981"
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />

            {/* Horizontal Grid lines and Y-axis Ticks */}
            {gTicks.map((val) => {
              const y = getGY(val);
              if (y < padT || y > padT + innerHeight) return null;
              return (
                <g key={val}>
                  <line x1={padL} y1={y} x2={padL + gChartWidth} y2={y} stroke={gridColor} strokeWidth="1" />
                  <text x={padL - 8} y={y + 3} fill={textColor} fontSize="9" textAnchor="end">
                    {val.toFixed(3)} g
                  </text>
                </g>
              );
            })}

            {/* Vertical MD Grid Lines */}
            {getDepthTicks(scaleG.zoomX).map((d) => {
              const x = getGX(d);
              return (
                <g key={d}>
                  <line x1={x} y1={padT} x2={x} y2={padT + innerHeight} stroke={gridColor} strokeWidth="1" strokeDasharray="2 2" />
                  <text x={x} y={chartHeight - 8} fill={textColor} fontSize="9" textAnchor="middle">
                    {formatLength(d, unitSystem)}
                  </text>
                </g>
              );
            })}

            {/* Raw Curve (Dashed Amber) */}
            <path d={gRawPath} fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeDasharray="5 3" />

            {/* Corrected Curve (Solid Emerald) */}
            <path d={gCorrPath} fill="none" stroke="#10b981" strokeWidth="2.4" />

            {/* Hovered Station Vertical Hairline Guide */}
            {hoveredPoint && hoveredPoint.chart === 'gtotal' && (
              <line
                x1={getGX(hoveredPoint.station.md)}
                y1={padT}
                x2={getGX(hoveredPoint.station.md)}
                y2={padT + innerHeight}
                stroke="#34d399"
                strokeWidth="1.2"
                strokeDasharray="3 3"
                pointerEvents="none"
              />
            )}

            {/* Station Data Points & Stable Hit Targets */}
            {stations.map((s) => {
              const raw = rawStations.find((r) => r.id === s.id) || s;
              const x = getGX(s.md);
              const rawY = getGY(raw.gTotal);
              const corrY = getGY(s.gTotal);
              const isOut = Math.abs(s.deltaG) > geoRef.toleranceG;
              const isHovered = hoveredPoint?.chart === 'gtotal' && hoveredPoint?.stnId === s.id;

              return (
                <g key={s.id}>
                  {/* Stable Invisible Hit Target Column */}
                  <rect
                    x={x - 14}
                    y={padT}
                    width={28}
                    height={innerHeight}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={(e) => {
                      setHoveredPoint({
                        chart: 'gtotal',
                        stnId: s.id,
                        station: s,
                        rawStation: raw,
                        rawVal: raw.gTotal,
                        corrVal: s.gTotal,
                        refVal: geoRef.gTotalRef,
                        tolVal: geoRef.toleranceG,
                        unit: 'g',
                        x: e.clientX,
                        y: e.clientY,
                      });
                    }}
                    onMouseMove={(e) => {
                      setHoveredPoint((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
                    }}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />

                  {/* Raw Point */}
                  <circle
                    cx={x}
                    cy={rawY}
                    r={isHovered ? 4 : 2.5}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={isHovered ? 2 : 1.5}
                    pointerEvents="none"
                  />

                  {/* Corrected Point */}
                  <circle
                    cx={x}
                    cy={corrY}
                    r={isHovered ? 5 : 3.5}
                    fill={isOut ? '#f43f5e' : '#10b981'}
                    stroke={isDark ? '#0c0e17' : '#fff'}
                    strokeWidth={isHovered ? 2 : 1.2}
                    pointerEvents="none"
                  />
                </g>
              );
            })}

            <text x={gSvgWidth - 8} y={chartHeight - 8} fill={textColor} fontSize="9" textAnchor="end">
              MD ({lenUnit})
            </text>
          </svg>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* GRAPH 3: Dip Angle vs. MD                                                 */}
      {/* ========================================================================= */}
      <div className="p-3.5 rounded-lg border shadow-xs transition-colors bg-white dark:bg-[#0c0e17] border-slate-200 dark:border-[#171c2b] flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100 dark:border-[#171c2b] text-xs">
          {/* Left: Title + Reference Info */}
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-3xs">
              3
            </div>
            <span className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-indigo-500" />
              {isRu ? 'Магнитное наклонение Dip Angle vs. MD' : 'Magnetic Dip Angle vs. MD'}
            </span>
            <span className="text-3xs text-slate-400 hidden sm:inline ml-2">
              Ref: <strong className="text-slate-700 dark:text-slate-300">{geoRef.dipRef.toFixed(2)}°</strong> ±{geoRef.toleranceDip}°
            </span>
          </div>

          {/* Right: Individual Scale Controls for Dip */}
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-3xs font-semibold ${
              dipPassCount === stations.length
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}>
              {dipPassCount} / {stations.length} {isRu ? 'в норме' : 'in spec'}
            </span>

            {/* Scale Controls Toolbar */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-[#141828] p-1 rounded-md border border-slate-200 dark:border-[#1e2439] text-3xs">
              {/* MD (X-axis) Scale */}
              <div className="flex items-center gap-0.5">
                <span className="text-slate-400 font-semibold px-1">MD:</span>
                <button
                  onClick={() => updateChartScale(setScaleDip, 'x', -0.25)}
                  disabled={scaleDip.zoomX <= 1.0}
                  className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#20273d] disabled:opacity-30 transition-colors"
                  title={isRu ? 'Сжать по глубине (MD)' : 'Compress MD axis'}
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="w-9 text-center font-bold text-indigo-600 dark:text-indigo-400">
                  {Math.round(scaleDip.zoomX * 100)}%
                </span>
                <button
                  onClick={() => updateChartScale(setScaleDip, 'x', 0.25)}
                  disabled={scaleDip.zoomX >= 4.0}
                  className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#20273d] disabled:opacity-30 transition-colors"
                  title={isRu ? 'Растянуть по глубине (MD)' : 'Stretch MD axis'}
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>

              <div className="w-px h-3 bg-slate-200 dark:bg-[#22283f]" />

              {/* Value (Y-axis) Scale */}
              <div className="flex items-center gap-0.5">
                <span className="text-slate-400 font-semibold px-1">Val:</span>
                <button
                  onClick={() => updateChartScale(setScaleDip, 'y', -0.25)}
                  disabled={scaleDip.zoomY <= 1.0}
                  className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#20273d] disabled:opacity-30 transition-colors"
                  title={isRu ? 'Уменьшить масштаб значений (Val)' : 'Decrease Value resolution'}
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="w-9 text-center font-bold text-indigo-600 dark:text-indigo-400">
                  {Math.round(scaleDip.zoomY * 100)}%
                </span>
                <button
                  onClick={() => updateChartScale(setScaleDip, 'y', 0.25)}
                  disabled={scaleDip.zoomY >= 4.0}
                  className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#20273d] disabled:opacity-30 transition-colors"
                  title={isRu ? 'Увеличить масштаб значений (Val)' : 'Increase Value resolution'}
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>

              {/* Reset Scale */}
              <button
                onClick={() => resetChartScale(setScaleDip)}
                title={isRu ? 'Сбросить масштаб (100%)' : 'Reset scale to 100%'}
                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#20273d] transition-colors ml-0.5"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Wide Canvas */}
        <div
          className="w-full overflow-x-auto pb-1 focus:outline-hidden"
          onWheel={(e) => {
            if (e.shiftKey) {
              e.preventDefault();
              const delta = e.deltaY < 0 ? 0.25 : -0.25;
              updateChartScale(setScaleDip, 'y', delta);
            } else if (e.ctrlKey || e.altKey) {
              e.preventDefault();
              const delta = e.deltaY < 0 ? 0.25 : -0.25;
              updateChartScale(setScaleDip, 'x', delta);
            }
          }}
        >
          <svg
            viewBox={`0 0 ${dipSvgWidth} ${chartHeight}`}
            style={{ width: `${dipSvgWidth}px`, height: `${chartHeight}px` }}
            className="block select-none"
          >
            {/* Tolerance corridor */}
            <rect
              x={padL}
              y={Math.max(padT, Math.min(dipUpperTolY, dipLowerTolY))}
              width={dipChartWidth}
              height={Math.min(innerHeight, Math.abs(dipLowerTolY - dipUpperTolY))}
              fill="#10b981"
              fillOpacity={isDark ? 0.12 : 0.08}
            />

            {/* Reference centerline */}
            <line
              x1={padL}
              y1={dipRefY}
              x2={padL + dipChartWidth}
              y2={dipRefY}
              stroke="#10b981"
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />

            {/* Horizontal Grid lines and Y-axis Ticks */}
            {dipTicks.map((val) => {
              const y = getDipY(val);
              if (y < padT || y > padT + innerHeight) return null;
              return (
                <g key={val}>
                  <line x1={padL} y1={y} x2={padL + dipChartWidth} y2={y} stroke={gridColor} strokeWidth="1" />
                  <text x={padL - 8} y={y + 3} fill={textColor} fontSize="9" textAnchor="end">
                    {val.toFixed(2)}°
                  </text>
                </g>
              );
            })}

            {/* Vertical MD Grid Lines */}
            {getDepthTicks(scaleDip.zoomX).map((d) => {
              const x = getDipX(d);
              return (
                <g key={d}>
                  <line x1={x} y1={padT} x2={x} y2={padT + innerHeight} stroke={gridColor} strokeWidth="1" strokeDasharray="2 2" />
                  <text x={x} y={chartHeight - 8} fill={textColor} fontSize="9" textAnchor="middle">
                    {formatLength(d, unitSystem)}
                  </text>
                </g>
              );
            })}

            {/* Raw Curve (Dashed Amber) */}
            <path d={dipRawPath} fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeDasharray="5 3" />

            {/* Corrected Curve (Solid Indigo) */}
            <path d={dipCorrPath} fill="none" stroke="#6366f1" strokeWidth="2.4" />

            {/* Hovered Station Vertical Hairline Guide */}
            {hoveredPoint && hoveredPoint.chart === 'dip' && (
              <line
                x1={getDipX(hoveredPoint.station.md)}
                y1={padT}
                x2={getDipX(hoveredPoint.station.md)}
                y2={padT + innerHeight}
                stroke="#818cf8"
                strokeWidth="1.2"
                strokeDasharray="3 3"
                pointerEvents="none"
              />
            )}

            {/* Station Data Points & Stable Hit Targets */}
            {stations.map((s) => {
              const raw = rawStations.find((r) => r.id === s.id) || s;
              const x = getDipX(s.md);
              const rawY = getDipY(raw.dipAngle);
              const corrY = getDipY(s.dipAngle);
              const isOut = Math.abs(s.deltaDip) > geoRef.toleranceDip;
              const isHovered = hoveredPoint?.chart === 'dip' && hoveredPoint?.stnId === s.id;

              return (
                <g key={s.id}>
                  {/* Stable Invisible Hit Target Column */}
                  <rect
                    x={x - 14}
                    y={padT}
                    width={28}
                    height={innerHeight}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={(e) => {
                      setHoveredPoint({
                        chart: 'dip',
                        stnId: s.id,
                        station: s,
                        rawStation: raw,
                        rawVal: raw.dipAngle,
                        corrVal: s.dipAngle,
                        refVal: geoRef.dipRef,
                        tolVal: geoRef.toleranceDip,
                        unit: '°',
                        x: e.clientX,
                        y: e.clientY,
                      });
                    }}
                    onMouseMove={(e) => {
                      setHoveredPoint((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
                    }}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />

                  {/* Raw Point */}
                  <circle
                    cx={x}
                    cy={rawY}
                    r={isHovered ? 4 : 2.5}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={isHovered ? 2 : 1.5}
                    pointerEvents="none"
                  />

                  {/* Corrected Point */}
                  <circle
                    cx={x}
                    cy={corrY}
                    r={isHovered ? 5 : 3.5}
                    fill={isOut ? '#f43f5e' : '#6366f1'}
                    stroke={isDark ? '#0c0e17' : '#fff'}
                    strokeWidth={isHovered ? 2 : 1.2}
                    pointerEvents="none"
                  />
                </g>
              );
            })}

            <text x={dipSvgWidth - 8} y={chartHeight - 8} fill={textColor} fontSize="9" textAnchor="end">
              MD ({lenUnit})
            </text>
          </svg>
        </div>
      </div>

      {/* Floating Cursor-Following QC Tooltip Window */}
       {hoveredPoint && (
        <div
          className="fixed z-50 pointer-events-none p-3 rounded-lg shadow-2xl text-3xs border bg-white/95 dark:bg-slate-900/95 text-slate-800 dark:text-white border-slate-200 dark:border-slate-700 backdrop-blur-md font-mono min-w-64 transition-transform ease-out"
          style={{
            left: `${Math.min(window.innerWidth - 280, hoveredPoint.x + 16)}px`,
            top: `${Math.min(window.innerHeight - 220, Math.max(16, hoveredPoint.y - 40))}px`,
          }}
        >
          {/* Header */}
          <div className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1.5 mb-2 flex items-center justify-between gap-3 text-sky-600 dark:text-sky-400">
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>{isRu ? `Замер #${hoveredPoint.stnId}` : `Station #${hoveredPoint.stnId}`}</span>
            </span>
            <span className="text-slate-600 dark:text-slate-200">
              MD: <strong className="text-slate-900 dark:text-white">{formatLength(hoveredPoint.station.md, unitSystem)}</strong> {lenUnit}
            </span>
          </div>

          {/* Trajectory Angles */}
          <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800/80 px-2 py-1 rounded text-slate-700 dark:text-slate-300 mb-2">
            <span>Inc: <strong className="text-slate-900 dark:text-white">{hoveredPoint.station.inc.toFixed(2)}°</strong></span>
            <span>Azim: <strong className="text-slate-900 dark:text-white">{hoveredPoint.station.azim.toFixed(2)}°</strong></span>
            <span>TVD: <strong className="text-slate-900 dark:text-white">{formatLength(hoveredPoint.station.tvd, unitSystem)}</strong> {lenUnit}</span>
          </div>

          {/* Sensor Comparison Grid */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-slate-600 dark:text-slate-300">
            <span className="text-amber-600 dark:text-amber-400">{isRu ? 'Исходный MWD:' : 'Raw MWD:'}</span>
            <span className="font-bold text-right text-amber-700 dark:text-amber-300">
              {hoveredPoint.rawVal.toFixed(hoveredPoint.unit === 'g' ? 4 : 2)} {hoveredPoint.unit}
            </span>

            <span className="text-sky-600 dark:text-sky-400">{isRu ? 'Скорректированный:' : 'Corrected:'}</span>
            <span className="font-bold text-right text-sky-700 dark:text-sky-300">
              {hoveredPoint.corrVal.toFixed(hoveredPoint.unit === 'g' ? 4 : 2)} {hoveredPoint.unit}
            </span>

            <span className="text-slate-500 dark:text-slate-400">{isRu ? 'Эталон WMM:' : 'Reference:'}</span>
            <span className="text-right text-slate-700 dark:text-slate-300">
              {hoveredPoint.refVal.toFixed(hoveredPoint.unit === 'g' ? 4 : 2)} {hoveredPoint.unit}
            </span>

            <span className="text-slate-500 dark:text-slate-400">{isRu ? 'Допуск ±:' : 'Tolerance ±:'}</span>
            <span className="text-right text-slate-700 dark:text-slate-300">
              ±{hoveredPoint.tolVal.toFixed(hoveredPoint.unit === 'g' ? 4 : 2)} {hoveredPoint.unit}
            </span>

            <div className="col-span-2 my-1 border-t border-slate-200 dark:border-slate-700/80" />

            <span className="text-slate-700 dark:text-slate-300 font-semibold">{isRu ? 'Невязка Δ:' : 'Residual Δ:'}</span>
            <span
              className={`font-bold text-right ${
                Math.abs(hoveredPoint.corrVal - hoveredPoint.refVal) <= hoveredPoint.tolVal
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {hoveredPoint.corrVal - hoveredPoint.refVal > 0 ? '+' : ''}
              {(hoveredPoint.corrVal - hoveredPoint.refVal).toFixed(hoveredPoint.unit === 'g' ? 4 : 2)}{' '}
              {hoveredPoint.unit}
            </span>
          </div>

          {/* Status footer badge */}
          <div className="mt-2 pt-1.5 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400">{isRu ? 'Статус QC:' : 'QC Status:'}</span>
            {Math.abs(hoveredPoint.corrVal - hoveredPoint.refVal) <= hoveredPoint.tolVal ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                <CheckCircle2 className="w-3 h-3" />
                {isRu ? 'В норме' : 'In Spec'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-bold">
                <AlertTriangle className="w-3 h-3" />
                {isRu ? 'Отклонение' : 'Out of Spec'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
