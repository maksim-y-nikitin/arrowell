import React, { useMemo, useState, useRef, useCallback } from 'react';
import { useWellbore } from '@/context/WellboreContext';
import { SurveyStation } from '@/types';
import { formatLength } from '@/utils/directionalMath';
import {
  Compass,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  CircleDot,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

type ViewMode2D = 'both' | 'plan' | 'section';

interface Hovered2DStationInfo {
  station: SurveyStation;
  clientX: number;
  clientY: number;
}

export const Projections2D: React.FC = () => {
  const { stations, rawStations, unitSystem, language, theme } = useWellbore();

  // Layout view mode: Plan, Section, or Split
  const [layoutMode, setLayoutMode] = useState<ViewMode2D>('both');

  // Layer visibility toggles
  const [showRaw, setShowRaw] = useState(true);
  const [showCorrected, setShowCorrected] = useState(true);
  const [showStations, setShowStations] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showHorizon, setShowHorizon] = useState(true);

  // Floating cursor-following tooltip state
  const [hovered2DStation, setHovered2DStation] = useState<Hovered2DStationInfo | null>(null);

  // Plan View Pan & Zoom State
  const [planZoom, setPlanZoom] = useState<number>(1.0);
  const [planPan, setPlanPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [planCursorCoords, setPlanCursorCoords] = useState<{ n: number; e: number } | null>(null);
  const isDraggingPlan = useRef(false);
  const planDragStart = useRef({ x: 0, y: 0 });

  // Vertical Section View Pan & Zoom State
  const [vsZoom, setVsZoom] = useState<number>(1.0);
  const [vsPan, setVsPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [vsCursorCoords, setVsCursorCoords] = useState<{ vs: number; tvd: number } | null>(null);
  const isDraggingVs = useRef(false);
  const vsDragStart = useRef({ x: 0, y: 0 });

  const isRu = language === 'ru';
  const isDark = theme === 'dark';
  const lenUnit = unitSystem === 'metric' ? 'm' : 'ft';

  // Coordinate ranges for auto-scaling
  const bounds = useMemo(() => {
    const allN = stations.map((s) => s.northing);
    const allE = stations.map((s) => s.easting);
    const allTvd = stations.map((s) => s.tvd);
    const allVs = stations.map((s) => s.vs);

    const minN = Math.min(0, ...allN);
    const maxN = Math.max(100, ...allN);
    const minE = Math.min(0, ...allE);
    const maxE = Math.max(100, ...allE);
    const minTvd = 0;
    const maxTvd = Math.max(2600, ...allTvd);
    const minVs = Math.min(0, ...allVs);
    const maxVs = Math.max(100, ...allVs);

    return { minN, maxN, minE, maxE, minTvd, maxTvd, minVs, maxVs };
  }, [stations]);

  // Viewport dimensions
  const viewWidth = 560;
  const viewHeight = 380;
  const padding = 44;

  // Plan View Base Scaling
  const planSpanE = Math.max(bounds.maxE - bounds.minE, 200);
  const planSpanN = Math.max(bounds.maxN - bounds.minN, 200);
  const planBaseScale = Math.min(
    (viewWidth - padding * 2) / planSpanE,
    (viewHeight - padding * 2) / planSpanN
  );

  const getPlanX = useCallback(
    (e: number) => {
      const base = padding + (e - bounds.minE) * planBaseScale;
      const center = viewWidth / 2;
      return center + (base - center) * planZoom + planPan.x;
    },
    [bounds.minE, planBaseScale, planZoom, planPan.x]
  );

  const getPlanY = useCallback(
    (n: number) => {
      const base = viewHeight - padding - (n - bounds.minN) * planBaseScale;
      const center = viewHeight / 2;
      return center + (base - center) * planZoom + planPan.y;
    },
    [bounds.minN, planBaseScale, planZoom, planPan.y]
  );

  const invertPlanCoords = useCallback(
    (svgX: number, svgY: number) => {
      const centerW = viewWidth / 2;
      const centerH = viewHeight / 2;
      const unzoomedX = (svgX - centerW - planPan.x) / planZoom + centerW;
      const unzoomedY = (svgY - centerH - planPan.y) / planZoom + centerH;
      const e = bounds.minE + (unzoomedX - padding) / planBaseScale;
      const n = bounds.minN + (viewHeight - padding - unzoomedY) / planBaseScale;
      return { e, n };
    },
    [planPan, planZoom, bounds.minE, bounds.minN, planBaseScale]
  );

  // Vertical Section Base Scaling
  const vsSpanVs = Math.max(bounds.maxVs - bounds.minVs, 200);
  const vsSpanTvd = Math.max(bounds.maxTvd - bounds.minTvd, 1000);
  const vsBaseScaleX = (viewWidth - padding * 2) / vsSpanVs;
  const vsBaseScaleY = (viewHeight - padding * 2) / vsSpanTvd;

  const getVsX = useCallback(
    (vs: number) => {
      const base = padding + (vs - bounds.minVs) * vsBaseScaleX;
      const center = viewWidth / 2;
      return center + (base - center) * vsZoom + vsPan.x;
    },
    [bounds.minVs, vsBaseScaleX, vsZoom, vsPan.x]
  );

  const getVsY = useCallback(
    (tvd: number) => {
      const base = padding + (tvd - bounds.minTvd) * vsBaseScaleY;
      const center = viewWidth / 2;
      return center + (base - center) * vsZoom + vsPan.y;
    },
    [bounds.minTvd, vsBaseScaleY, vsZoom, vsPan.y]
  );

  const invertVsCoords = useCallback(
    (svgX: number, svgY: number) => {
      const centerW = viewWidth / 2;
      const centerH = viewHeight / 2;
      const unzoomedX = (svgX - centerW - vsPan.x) / vsZoom + centerW;
      const unzoomedY = (svgY - centerH - vsPan.y) / vsZoom + centerH;
      const vs = bounds.minVs + (unzoomedX - padding) / vsBaseScaleX;
      const tvd = bounds.minTvd + (unzoomedY - padding) / vsBaseScaleY;
      return { vs, tvd };
    },
    [vsPan, vsZoom, bounds.minVs, bounds.minTvd, vsBaseScaleX, vsBaseScaleY]
  );

  const handleResetPlan = () => {
    setPlanZoom(1.0);
    setPlanPan({ x: 0, y: 0 });
  };

  const handleResetVs = () => {
    setVsZoom(1.0);
    setVsPan({ x: 0, y: 0 });
  };

  // SVG Paths
  const rawPlanPath = useMemo(() => {
    return rawStations
      .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getPlanX(s.easting).toFixed(1)} ${getPlanY(s.northing).toFixed(1)}`)
      .join(' ');
  }, [rawStations, getPlanX, getPlanY]);

  const corrPlanPath = useMemo(() => {
    return stations
      .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getPlanX(s.easting).toFixed(1)} ${getPlanY(s.northing).toFixed(1)}`)
      .join(' ');
  }, [stations, getPlanX, getPlanY]);

  const rawVsPath = useMemo(() => {
    return rawStations
      .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getVsX(s.vs).toFixed(1)} ${getVsY(s.tvd).toFixed(1)}`)
      .join(' ');
  }, [rawStations, getVsX, getVsY]);

  const corrVsPath = useMemo(() => {
    return stations
      .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getVsX(s.vs).toFixed(1)} ${getVsY(s.tvd).toFixed(1)}`)
      .join(' ');
  }, [stations, getVsX, getVsY]);

  const axisColor = isDark ? '#232a3f' : '#cbd5e1';
  const gridColor = isDark ? '#161a29' : '#f1f5f9';
  const textColor = isDark ? '#64748b' : '#94a3b8';

  return (
    <div className="w-full h-full flex flex-col select-none overflow-hidden font-mono text-xs transition-colors bg-slate-100 dark:bg-[#080a10]">
      {/* Top Controls Bar */}
      <div className="h-9 px-3 border-b flex items-center justify-between gap-3 shrink-0 transition-colors bg-white dark:bg-[#0d101a] border-slate-200 dark:border-[#171c2b] text-slate-700 dark:text-slate-300">
        <div className="flex items-center gap-2">
          <Compass className="w-3.5 h-3.5 text-sky-500" />
          <span className="font-semibold text-slate-900 dark:text-white text-3xs sm:text-xs">
            {isRu ? '2D ПРОЕКЦИИ ТРАЕКТОРИИ' : '2D WELLBORE PROJECTIONS'}
          </span>
          <span className="text-3xs text-slate-400 hidden md:inline">
            (MCM • WGS-84)
          </span>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#141828] p-0.5 rounded-md border border-slate-200 dark:border-[#1e2439] text-3xs">
          <button
            onClick={() => setLayoutMode('both')}
            className={`px-2 py-0.5 rounded font-medium transition-colors ${
              layoutMode === 'both'
                ? 'bg-white dark:bg-[#20273d] text-sky-600 dark:text-sky-400 font-semibold shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {isRu ? 'План + Разрез' : 'Split View'}
          </button>
          <button
            onClick={() => setLayoutMode('plan')}
            className={`px-2 py-0.5 rounded font-medium transition-colors ${
              layoutMode === 'plan'
                ? 'bg-white dark:bg-[#20273d] text-sky-600 dark:text-sky-400 font-semibold shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {isRu ? 'Только План (+N/+E)' : 'Plan Only'}
          </button>
          <button
            onClick={() => setLayoutMode('section')}
            className={`px-2 py-0.5 rounded font-medium transition-colors ${
              layoutMode === 'section'
                ? 'bg-white dark:bg-[#20273d] text-sky-600 dark:text-sky-400 font-semibold shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {isRu ? 'Только Разрез (VS/TVD)' : 'Section Only'}
          </button>
        </div>

        {/* Layer Toggles */}
        <div className="flex items-center gap-2 text-3xs text-slate-500 dark:text-slate-400">
          <label className="flex items-center gap-1 cursor-pointer hover:text-slate-900 dark:hover:text-white">
            <input
              type="checkbox"
              checked={showCorrected}
              onChange={(e) => setShowCorrected(e.target.checked)}
              className="rounded-xs accent-sky-500 w-3 h-3"
            />
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
            <span className="hidden xl:inline">{isRu ? 'Скоррект.' : 'Corrected'}</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer hover:text-slate-900 dark:hover:text-white">
            <input
              type="checkbox"
              checked={showRaw}
              onChange={(e) => setShowRaw(e.target.checked)}
              className="rounded-xs accent-amber-500 w-3 h-3"
            />
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span className="hidden xl:inline">{isRu ? 'Сырой MWD' : 'Raw MWD'}</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer hover:text-slate-900 dark:hover:text-white">
            <input
              type="checkbox"
              checked={showStations}
              onChange={(e) => setShowStations(e.target.checked)}
              className="rounded-xs accent-emerald-500 w-3 h-3"
            />
            <span className="hidden xl:inline">{isRu ? 'Точки' : 'Stations'}</span>
          </label>
        </div>
      </div>

      {/* Main Viewport Grid */}
      <div className={`flex-1 p-3 grid gap-3 overflow-hidden ${
        layoutMode === 'both' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
      }`}>
        {/* 1. PLAN VIEW (+North vs +East) */}
        {(layoutMode === 'both' || layoutMode === 'plan') && (
          <div className="flex flex-col rounded-lg border shadow-xs transition-colors bg-white dark:bg-[#0c0f18] border-slate-200 dark:border-[#171c2b] overflow-hidden relative">
            <div className="px-3 py-2 border-b flex items-center justify-between transition-colors bg-slate-50/70 dark:bg-[#101422]/70 border-slate-200 dark:border-[#171c2b]">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {isRu ? 'План ствола (+N / +E)' : 'Plan View (+N / +E)'}
                </span>
                {planCursorCoords && (
                  <span className="text-3xs text-slate-400 hidden sm:inline ml-2">
                    N: {formatLength(planCursorCoords.n, unitSystem)} {lenUnit} | E: {formatLength(planCursorCoords.e, unitSystem)} {lenUnit}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 bg-white dark:bg-[#161a29] p-0.5 rounded-md border border-slate-200 dark:border-[#1e253d] text-3xs">
                <button
                  onClick={() => setPlanZoom((z) => Math.max(0.4, Number((z - 0.25).toFixed(2))))}
                  title={isRu ? 'Уменьшить' : 'Zoom Out'}
                  className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#20273d] transition-colors"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="px-1.5 font-semibold text-sky-600 dark:text-sky-400">
                  {Math.round(planZoom * 100)}%
                </span>
                <button
                  onClick={() => setPlanZoom((z) => Math.min(5.0, Number((z + 0.25).toFixed(2))))}
                  title={isRu ? 'Увеличить' : 'Zoom In'}
                  className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#20273d] transition-colors"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
                <button
                  onClick={handleResetPlan}
                  title={isRu ? 'Сбросить масштаб и положение' : 'Reset View'}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#20273d] transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div
              className="flex-1 w-full h-full relative cursor-grab active:cursor-grabbing overflow-hidden flex items-center justify-center"
              onMouseDown={(e) => {
                isDraggingPlan.current = true;
                planDragStart.current = { x: e.clientX - planPan.x, y: e.clientY - planPan.y };
              }}
              onMouseMove={(e) => {
                if (isDraggingPlan.current) {
                  setPlanPan({
                    x: e.clientX - planDragStart.current.x,
                    y: e.clientY - planDragStart.current.y,
                  });
                }
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const svgX = ((e.clientX - rect.left) / rect.width) * viewWidth;
                const svgY = ((e.clientY - rect.top) / rect.height) * viewHeight;
                setPlanCursorCoords(invertPlanCoords(svgX, svgY));
              }}
              onMouseUp={() => {
                isDraggingPlan.current = false;
              }}
              onMouseLeave={() => {
                isDraggingPlan.current = false;
                setPlanCursorCoords(null);
              }}
              onWheel={(e) => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.15 : -0.15;
                setPlanZoom((z) => Math.min(5.0, Math.max(0.4, Number((z + delta).toFixed(2)))));
              }}
            >
              <svg
                viewBox={`0 0 ${viewWidth} ${viewHeight}`}
                className="w-full h-full select-none"
              >
                {showGrid && (
                  <g opacity="0.6">
                    <line
                      x1={0}
                      y1={getPlanY(0)}
                      x2={viewWidth}
                      y2={getPlanY(0)}
                      stroke={axisColor}
                      strokeWidth="1.2"
                      strokeDasharray="4 3"
                    />
                    <line
                      x1={getPlanX(0)}
                      y1={0}
                      x2={getPlanX(0)}
                      y2={viewHeight}
                      stroke={axisColor}
                      strokeWidth="1.2"
                      strokeDasharray="4 3"
                    />
                  </g>
                )}

                <g transform={`translate(${getPlanX(0)}, ${getPlanY(0)})`}>
                  <circle r="4" fill="#0284c7" />
                  <circle r="7" fill="none" stroke="#0284c7" strokeWidth="1" strokeDasharray="2 2" />
                  <text x="9" y="3" fill={textColor} fontSize="8" fontWeight="bold">
                    Wellhead (0,0)
                  </text>
                </g>

                {showRaw && rawStations.length > 1 && (
                  <path
                    d={rawPlanPath}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="1.8"
                    strokeOpacity="0.75"
                    strokeDasharray="4 3"
                  />
                )}

                {showCorrected && stations.length > 1 && (
                  <path
                    d={corrPlanPath}
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Survey station circles with enlarged transparent hit-targets */}
                {showStations &&
                  stations.map((s) => {
                    const cx = getPlanX(s.easting);
                    const cy = getPlanY(s.northing);
                    const isHovered = hovered2DStation?.station.id === s.id;

                    return (
                      <g
                        key={s.id}
                        className="cursor-pointer"
                        onMouseEnter={(e) =>
                          setHovered2DStation({
                            station: s,
                            clientX: e.clientX,
                            clientY: e.clientY,
                          })
                        }
                        onMouseMove={(e) =>
                          setHovered2DStation((prev) =>
                            prev ? { ...prev, clientX: e.clientX, clientY: e.clientY } : null
                          )
                        }
                        onMouseLeave={() => setHovered2DStation(null)}
                      >
                        {/* Larger hit-box for smooth hovering */}
                        <circle cx={cx} cy={cy} r={9} fill="transparent" />
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isHovered ? 5.5 : 2.5}
                          fill={s.isQcPass ? '#0284c7' : '#f59e0b'}
                          stroke={isDark ? '#0c0f18' : '#fff'}
                          strokeWidth={isHovered ? 1.5 : 1}
                          pointerEvents="none"
                        />
                      </g>
                    );
                  })}

                <g transform="translate(520, 35)">
                  <line x1="0" y1="15" x2="0" y2="-15" stroke="#ef4444" strokeWidth="2" />
                  <polygon points="0,-18 -4,-10 4,-10" fill="#ef4444" />
                  <text x="0" y="-22" fill="#ef4444" fontSize="9" fontWeight="bold" textAnchor="middle">
                    N
                  </text>
                </g>
              </svg>

              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/40 backdrop-blur-xs text-3xs text-white/80 pointer-events-none">
                {isRu ? 'ЛКМ: Перемещение | Колесо: Масштаб' : 'Drag: Pan | Scroll: Zoom'}
              </div>
            </div>
          </div>
        )}

        {/* 2. VERTICAL SECTION VIEW (TVD vs VS) */}
        {(layoutMode === 'both' || layoutMode === 'section') && (
          <div className="flex flex-col rounded-lg border shadow-xs transition-colors bg-white dark:bg-[#0c0f18] border-slate-200 dark:border-[#171c2b] overflow-hidden relative">
            <div className="px-3 py-2 border-b flex items-center justify-between transition-colors bg-slate-50/70 dark:bg-[#101422]/70 border-slate-200 dark:border-[#171c2b]">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {isRu ? 'Вертикальная секция (TVD vs VS)' : 'Vertical Section (TVD vs VS)'}
                </span>
                {vsCursorCoords && (
                  <span className="text-3xs text-slate-400 hidden sm:inline ml-2">
                    VS: {formatLength(vsCursorCoords.vs, unitSystem)} {lenUnit} | TVD: {formatLength(vsCursorCoords.tvd, unitSystem)} {lenUnit}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 bg-white dark:bg-[#161a29] p-0.5 rounded-md border border-slate-200 dark:border-[#1e253d] text-3xs">
                <button
                  onClick={() => setVsZoom((z) => Math.max(0.4, Number((z - 0.25).toFixed(2))))}
                  title={isRu ? 'Уменьшить' : 'Zoom Out'}
                  className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#20273d] transition-colors"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="px-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                  {Math.round(vsZoom * 100)}%
                </span>
                <button
                  onClick={() => setVsZoom((z) => Math.min(5.0, Number((z + 0.25).toFixed(2))))}
                  title={isRu ? 'Увеличить' : 'Zoom In'}
                  className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#20273d] transition-colors"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
                <button
                  onClick={handleResetVs}
                  title={isRu ? 'Сбросить масштаб и положение' : 'Reset View'}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#20273d] transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div
              className="flex-1 w-full h-full relative cursor-grab active:cursor-grabbing overflow-hidden flex items-center justify-center"
              onMouseDown={(e) => {
                isDraggingVs.current = true;
                vsDragStart.current = { x: e.clientX - vsPan.x, y: e.clientY - vsPan.y };
              }}
              onMouseMove={(e) => {
                if (isDraggingVs.current) {
                  setVsPan({
                    x: e.clientX - vsDragStart.current.x,
                    y: e.clientY - vsDragStart.current.y,
                  });
                }
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const svgX = ((e.clientX - rect.left) / rect.width) * viewWidth;
                const svgY = ((e.clientY - rect.top) / rect.height) * viewHeight;
                setVsCursorCoords(invertVsCoords(svgX, svgY));
              }}
              onMouseUp={() => {
                isDraggingVs.current = false;
              }}
              onMouseLeave={() => {
                isDraggingVs.current = false;
                setVsCursorCoords(null);
              }}
              onWheel={(e) => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.15 : -0.15;
                setVsZoom((z) => Math.min(5.0, Math.max(0.4, Number((z + delta).toFixed(2)))));
              }}
            >
              <svg
                viewBox={`0 0 ${viewWidth} ${viewHeight}`}
                className="w-full h-full select-none"
              >
                <line
                  x1={0}
                  y1={getVsY(0)}
                  x2={viewWidth}
                  y2={getVsY(0)}
                  stroke={axisColor}
                  strokeWidth="1.2"
                  strokeDasharray="4 2"
                />
                <text x="10" y={getVsY(0) - 5} fill={textColor} fontSize="8">
                  Surface Datum (0.0 m)
                </text>

                {showHorizon && (
                  <g>
                    <line
                      x1={0}
                      y1={getVsY(2480)}
                      x2={viewWidth}
                      y2={getVsY(2480)}
                      stroke="#10b981"
                      strokeWidth="1.2"
                      strokeDasharray="5 3"
                      strokeOpacity="0.8"
                    />
                    <text
                      x={viewWidth - 10}
                      y={getVsY(2480) - 4}
                      fill="#10b981"
                      fontSize="8"
                      textAnchor="end"
                      fontWeight="bold"
                    >
                      Achimov Target Horizon (TVD: 2,480m)
                    </text>
                  </g>
                )}

                {showRaw && rawStations.length > 1 && (
                  <path
                    d={rawVsPath}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="1.8"
                    strokeOpacity="0.75"
                    strokeDasharray="4 3"
                  />
                )}

                {showCorrected && stations.length > 1 && (
                  <path
                    d={corrVsPath}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Survey station circles with enlarged transparent hit-targets */}
                {showStations &&
                  stations.map((s) => {
                    const cx = getVsX(s.vs);
                    const cy = getVsY(s.tvd);
                    const isHovered = hovered2DStation?.station.id === s.id;

                    return (
                      <g
                        key={s.id}
                        className="cursor-pointer"
                        onMouseEnter={(e) =>
                          setHovered2DStation({
                            station: s,
                            clientX: e.clientX,
                            clientY: e.clientY,
                          })
                        }
                        onMouseMove={(e) =>
                          setHovered2DStation((prev) =>
                            prev ? { ...prev, clientX: e.clientX, clientY: e.clientY } : null
                          )
                        }
                        onMouseLeave={() => setHovered2DStation(null)}
                      >
                        {/* Larger hit-box for smooth hovering */}
                        <circle cx={cx} cy={cy} r={9} fill="transparent" />
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isHovered ? 5.5 : 2.5}
                          fill={s.isQcPass ? '#10b981' : '#f59e0b'}
                          stroke={isDark ? '#0c0f18' : '#fff'}
                          strokeWidth={isHovered ? 1.5 : 1}
                          pointerEvents="none"
                        />
                      </g>
                    );
                  })}
              </svg>

              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/40 backdrop-blur-xs text-3xs text-white/80 pointer-events-none">
                {isRu ? 'ЛКМ: Перемещение | Колесо: Масштаб' : 'Drag: Pan | Scroll: Zoom'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Cursor-Following Tooltip (Adaptive Light & Dark theme) */}
      {hovered2DStation && (
        <div
          className="fixed z-50 pointer-events-none p-3 rounded-lg shadow-2xl text-3xs border bg-white/95 dark:bg-slate-900/95 text-slate-800 dark:text-white border-slate-200 dark:border-slate-700 backdrop-blur-md font-mono min-w-60 transition-transform ease-out"
          style={{
            left: `${Math.min(window.innerWidth - 270, hovered2DStation.clientX + 16)}px`,
            top: `${Math.min(window.innerHeight - 240, Math.max(16, hovered2DStation.clientY - 40))}px`,
          }}
        >
          {/* Header */}
          <div className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1.5 mb-2 flex items-center justify-between gap-3 text-sky-600 dark:text-sky-400">
            <span className="flex items-center gap-1.5">
              <CircleDot className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>{isRu ? `Точка замера #${hovered2DStation.station.id}` : `Survey Station #${hovered2DStation.station.id}`}</span>
            </span>
            <span className="text-slate-600 dark:text-slate-200">
              MD: <strong className="text-slate-900 dark:text-white">{formatLength(hovered2DStation.station.md, unitSystem)}</strong> {lenUnit}
            </span>
          </div>

          {/* Directional Angles */}
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded text-slate-700 dark:text-slate-300 mb-2">
            <div>
              <span className="text-slate-500 dark:text-slate-400">{isRu ? 'Зенитный (Inc):' : 'Inc:'} </span>
              <strong className="text-slate-900 dark:text-white">{hovered2DStation.station.inc.toFixed(2)}°</strong>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">{isRu ? 'Азимут (Azim):' : 'Azim:'} </span>
              <strong className="text-slate-900 dark:text-white">{hovered2DStation.station.azim.toFixed(2)}°</strong>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">TVD: </span>
              <strong className="text-slate-900 dark:text-white">{formatLength(hovered2DStation.station.tvd, unitSystem)} {lenUnit}</strong>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">DLS: </span>
              <strong className="text-slate-900 dark:text-white">{hovered2DStation.station.dls.toFixed(2)}°/30{lenUnit}</strong>
            </div>
          </div>

          {/* Spatial Coordinates */}
          <div className="space-y-1 text-slate-600 dark:text-slate-300 mb-2">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">{isRu ? 'Север (+N/-S):' : 'Northing (+N/-S):'}</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {formatLength(hovered2DStation.station.northing, unitSystem)} {lenUnit}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">{isRu ? 'Восток (+E/-W):' : 'Easting (+E/-W):'}</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {formatLength(hovered2DStation.station.easting, unitSystem)} {lenUnit}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">{isRu ? 'Вертикальная секция (VS):' : 'Vert. Section (VS):'}</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {formatLength(hovered2DStation.station.vs, unitSystem)} {lenUnit}
              </span>
            </div>
          </div>

          {/* MWD Sensors */}
          <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700/80 grid grid-cols-3 gap-1 text-center text-3xs">
            <div className="bg-slate-100 dark:bg-slate-800/60 p-1 rounded">
              <div className="text-slate-500 dark:text-slate-400">Btotal</div>
              <div className="font-bold text-sky-600 dark:text-sky-400">{hovered2DStation.station.bTotal} nT</div>
            </div>
            <div className="bg-slate-100 dark:bg-slate-800/60 p-1 rounded">
              <div className="text-slate-500 dark:text-slate-400">Gtotal</div>
              <div className="font-bold text-emerald-600 dark:text-emerald-400">{hovered2DStation.station.gTotal.toFixed(3)} g</div>
            </div>
            <div className="bg-slate-100 dark:bg-slate-800/60 p-1 rounded">
              <div className="text-slate-500 dark:text-slate-400">Dip</div>
              <div className="font-bold text-indigo-600 dark:text-indigo-400">{hovered2DStation.station.dipAngle.toFixed(2)}°</div>
            </div>
          </div>

          {/* QC Status Badge */}
          <div className="mt-2 pt-1.5 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400">{isRu ? 'Контроль качества (QC):' : 'QC Quality:'}</span>
            {hovered2DStation.station.isQcPass ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                <CheckCircle2 className="w-3 h-3" />
                {isRu ? 'В норме' : 'Pass'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                <AlertTriangle className="w-3 h-3" />
                {isRu ? 'Отклонение QC' : 'Warning'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};