import React, { useMemo, useState, useRef, useCallback } from 'react';
import { useWellbore } from '@/context/WellboreContext';
import { offsetWellsData } from '@/data/wellsData';
import { SurveyStation } from '@/types';
import { formatLength, calculateStationEou } from '@/utils/directionalMath';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  CircleDot,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ChevronDown,
} from 'lucide-react';

type ViewMode2D = 'both' | 'plan' | 'section';

interface Hovered2DStationInfo {
  station: SurveyStation;
  clientX: number;
  clientY: number;
}

interface Projections2DProps {
  visualSubTab?: '3d' | '2d';
  onSubTabChange?: (tab: '3d' | '2d') => void;
}

export const Projections2D: React.FC<Projections2DProps> = ({
  visualSubTab = '2d',
  onSubTabChange,
}) => {
  const { stations, rawStations, unitSystem, language, theme } = useWellbore();

  const [layoutMode, setLayoutMode] = useState<ViewMode2D>('both');

  // Переключатели слоев
  const [showRaw, setShowRaw] = useState(true);
  const [showCorrected, setShowCorrected] = useState(true);
  const [showStations, setShowStations] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showHorizon, setShowHorizon] = useState(true);
  const [showEou2D, setShowEou2D] = useState(true);
  const [showLayersMenu, setShowLayersMenu] = useState(false);

  // Всплывающая подсказка
  const [hovered2DStation, setHovered2DStation] = useState<Hovered2DStationInfo | null>(null);

  // Панорамирование и зум для Плана (+N / +E)
  const [planZoom, setPlanZoom] = useState<number>(1.0);
  const [planPan, setPlanPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [planCursorCoords, setPlanCursorCoords] = useState<{ n: number; e: number } | null>(null);
  const isDraggingPlan = useRef(false);
  const planDragStart = useRef({ x: 0, y: 0 });

  // Панорамирование и зум для Вертикальной секции (VS / TVD)
  const [vsZoom, setVsZoom] = useState<number>(1.0);
  const [vsPan, setVsPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [vsCursorCoords, setVsCursorCoords] = useState<{ vs: number; tvd: number } | null>(null);
  const isDraggingVs = useRef(false);
  const vsDragStart = useRef({ x: 0, y: 0 });

  const isRu = language === 'ru';
  const isDark = theme === 'dark';
  const lenUnit = unitSystem === 'metric' ? 'm' : 'ft';

  // Границы для автомасштабирования
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

  // Размеры SVG канваса
  const viewWidth = 560;
  const viewHeight = 380;
  const padding = 44;

  // Масштабирование Плана (+N / +E)
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

  // Масштабирование Вертикальной секции (VS / TVD)
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

  // SVG-траектории
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

  // Расчет точки опасного сближения (ТОЛЬКО при угрозе: SF < 1.5)
  const closestApproach2D = useMemo(() => {
    if (stations.length < 2 || offsetWellsData.length === 0) return null;
    let minD = Infinity;
    let subStn: SurveyStation | null = null;
    let offStn: { md: number; tvd: number; northing: number; easting: number } | null = null;

    stations.forEach((s) => {
      if (s.md < 200) return;
      offsetWellsData.forEach((offsetWell) => {
        offsetWell.stations.forEach((off) => {
          const d = Math.hypot(s.northing - off.northing, s.easting - off.easting, s.tvd - off.tvd);
          if (d < minD) {
            minD = d;
            subStn = s;
            offStn = off;
          }
        });
      });
    });

    if (!subStn || !offStn) return null;

    const eouS =
      (subStn as SurveyStation).eou ||
      calculateStationEou(
        (subStn as SurveyStation).md,
        (subStn as SurveyStation).inc,
        (subStn as SurveyStation).azim
      );
    const eouO = calculateStationEou(offStn.md, 1.5, 45.0);
    const sf = minD / (eouS.semiMajor + eouO.semiMajor || 1.0);

    if (sf >= 1.5) return null;

    const color = sf < 1.0 ? '#ef4444' : '#f59e0b';

    return {
      sub: subStn,
      off: offStn,
      minD,
      sf,
      color,
      eouS,
      eouO,
    };
  }, [stations]);

  const axisColor = isDark ? '#232a3f' : '#cbd5e1';
  const textColor = isDark ? '#64748b' : '#94a3b8';

  return (
    <div className="w-full h-full flex flex-col select-none overflow-hidden font-mono text-xs transition-colors bg-[#eef2f6] dark:bg-[#0a0d14]">
      {/* СТАТИЧНАЯ ШАПКА ВЬЮПОРТА (h-8): 1-в-1 как в 3D, тумблер 3D/2D не прыгает! */}
      <div className="h-8 px-2.5 border-b flex items-center justify-between gap-2 shrink-0 bg-white dark:bg-[#0c0f18] border-slate-200 dark:border-[#171c2b] text-3xs font-mono z-20">
        <div className="flex items-center gap-2">
          {/* Главный тумблер 3D / 2D */}
          {onSubTabChange && (
            <div className="inline-flex items-center p-0.5 rounded-md bg-slate-100 dark:bg-[#111422] border border-slate-200 dark:border-[#1e2538]">
              <button
                onClick={() => onSubTabChange('3d')}
                className={`px-2.5 py-0.5 rounded font-semibold transition-all ${
                  visualSubTab === '3d'
                    ? 'bg-white dark:bg-[#1c2233] text-sky-600 dark:text-sky-400 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                3D
              </button>
              <button
                onClick={() => onSubTabChange('2d')}
                className={`px-2.5 py-0.5 rounded font-semibold transition-all ${
                  visualSubTab === '2d'
                    ? 'bg-white dark:bg-[#1c2233] text-sky-600 dark:text-sky-400 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                2D
              </button>
            </div>
          )}

          {/* Режимы проекций 2D */}
          <div className="inline-flex items-center p-0.5 rounded-md bg-slate-100 dark:bg-[#111422] border border-slate-200 dark:border-[#1e2538]">
            <button
              onClick={() => setLayoutMode('both')}
              className={`px-2 py-0.5 rounded font-medium transition-all ${
                layoutMode === 'both'
                  ? 'bg-white dark:bg-[#1c2233] text-sky-600 dark:text-sky-400 font-semibold shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {isRu ? 'План + Разрез' : 'Split'}
            </button>
            <button
              onClick={() => setLayoutMode('plan')}
              className={`px-2 py-0.5 rounded font-medium transition-all ${
                layoutMode === 'plan'
                  ? 'bg-white dark:bg-[#1c2233] text-sky-600 dark:text-sky-400 font-semibold shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {isRu ? 'План (+N/+E)' : 'Plan'}
            </button>
            <button
              onClick={() => setLayoutMode('section')}
              className={`px-2 py-0.5 rounded font-medium transition-all ${
                layoutMode === 'section'
                  ? 'bg-white dark:bg-[#1c2233] text-sky-600 dark:text-sky-400 font-semibold shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {isRu ? 'Разрез (VS/TVD)' : 'Section'}
            </button>
          </div>
        </div>

        {/* Выпадающее меню слоев — идентичное положение и размер */}
        <div className="relative">
          <button
            onClick={() => setShowLayersMenu(!showLayersMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white dark:bg-[#111422] border border-slate-200 dark:border-[#1e2538] text-slate-700 dark:text-slate-300 text-3xs font-semibold shadow-2xs"
          >
            <Layers className="w-3.5 h-3.5 text-sky-500" />
            <span>{isRu ? 'Слои' : 'Layers'}</span>
            <ChevronDown className="w-2.5 h-2.5 opacity-60" />
          </button>

          {showLayersMenu && (
            <div className="absolute top-8 right-0 w-64 p-2.5 rounded-md border shadow-xl z-30 space-y-2 bg-white dark:bg-[#111422] border-slate-200 dark:border-[#1e2538] text-3xs font-mono text-slate-700 dark:text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={showCorrected}
                  onChange={(e) => setShowCorrected(e.target.checked)}
                  className="rounded-xs accent-sky-500"
                />
                <span className="w-2 h-0.5 bg-sky-500 inline-block" />
                <span>{isRu ? 'Скорректированный ствол' : 'Corrected Path'}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={showStations}
                  onChange={(e) => setShowStations(e.target.checked)}
                  className="rounded-xs accent-sky-600"
                />
                <CircleDot className="w-2.5 h-2.5 text-sky-500" />
                <span>{isRu ? 'Точки станций' : 'Survey Stations'}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={showRaw}
                  onChange={(e) => setShowRaw(e.target.checked)}
                  className="rounded-xs accent-amber-500"
                />
                <span className="w-2 h-0.5 bg-amber-500 inline-block" />
                <span>{isRu ? 'Сырой ствол MWD' : 'Raw MWD'}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={showEou2D}
                  onChange={(e) => setShowEou2D(e.target.checked)}
                  className="rounded-xs accent-sky-600"
                />
                <ShieldAlert className="w-3 h-3 text-sky-500" />
                <span>{isRu ? 'Эллипсы EOU (1:1)' : 'EOU Ellipses (1:1)'}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={showHorizon}
                  onChange={(e) => setShowHorizon(e.target.checked)}
                  className="rounded-xs accent-emerald-500"
                />
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                <span>{isRu ? 'Целевой пласт' : 'Target Payzone'}</span>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Основная область проекций (начинается строго под шапкой h-8) */}
      <div
        className={`flex-1 p-2 grid gap-2 overflow-hidden ${
          layoutMode === 'both' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {/* 1. ПЛАН (+North vs +East) */}
        {(layoutMode === 'both' || layoutMode === 'plan') && (
          <div className="flex flex-col rounded-md border shadow-2xs transition-colors bg-white dark:bg-[#0c0f18] border-slate-200 dark:border-[#171c2b] overflow-hidden relative">
            <div className="px-2.5 py-1.5 border-b flex items-center justify-between transition-colors bg-slate-50/70 dark:bg-[#101422]/70 border-slate-200 dark:border-[#171c2b]">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-3xs">
                  {isRu ? 'План (+N / +E)' : 'Plan (+N / +E)'}
                </span>
                {planCursorCoords && (
                  <span className="text-4xs text-slate-400 hidden sm:inline ml-1 font-mono">
                    N: {formatLength(planCursorCoords.n, unitSystem)} | E: {formatLength(planCursorCoords.e, unitSystem)} {lenUnit}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 bg-white dark:bg-[#161a29] p-0.5 rounded border border-slate-200 dark:border-[#1e253d] text-4xs">
                <button
                  onClick={() => setPlanZoom((z) => Math.max(0.4, Number((z - 0.25).toFixed(2))))}
                  className="p-0.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#20273d]"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="px-1 font-semibold text-sky-600 dark:text-sky-400">
                  {Math.round(planZoom * 100)}%
                </span>
                <button
                  onClick={() => setPlanZoom((z) => Math.min(5.0, Number((z + 0.25).toFixed(2))))}
                  className="p-0.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#20273d]"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
                <button
                  onClick={handleResetPlan}
                  className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
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
              <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} className="w-full h-full select-none">
                {showGrid && (
                  <g opacity="0.6">
                    <line x1={0} y1={getPlanY(0)} x2={viewWidth} y2={getPlanY(0)} stroke={axisColor} strokeWidth="1" strokeDasharray="4 3" />
                    <line x1={getPlanX(0)} y1={0} x2={getPlanX(0)} y2={viewHeight} stroke={axisColor} strokeWidth="1" strokeDasharray="4 3" />
                  </g>
                )}

                <g transform={`translate(${getPlanX(0)}, ${getPlanY(0)})`}>
                  <circle r="3" fill="#0284c7" />
                  <circle r="6" fill="none" stroke="#0284c7" strokeWidth="0.8" strokeDasharray="2 2" />
                  <text x="8" y="3" fill={textColor} fontSize="8" fontWeight="bold">
                    (0,0)
                  </text>
                </g>

                {showRaw && rawStations.length > 1 && (
                  <path d={rawPlanPath} fill="none" stroke="#f59e0b" strokeWidth="1.6" strokeOpacity="0.75" strokeDasharray="4 3" />
                )}

                {showCorrected && stations.length > 1 && (
                  <path d={corrPlanPath} fill="none" stroke="#0284c7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                )}

                {/* 2D Эллипсоиды на плане */}
                {showEou2D &&
                  stations.map((s, idx) => {
                    if (idx === 0) return null;
                    const isBit = idx === stations.length - 1;
                    const eou = s.eou || calculateStationEou(s.md, s.inc, s.azim);
                    const cx = getPlanX(s.easting);
                    const cy = getPlanY(s.northing);

                    const rx = eou.horizMajor * planBaseScale * planZoom;
                    const ry = eou.horizMinor * planBaseScale * planZoom;

                    return (
                      <ellipse
                        key={`plan-eou-${s.id}`}
                        cx={cx}
                        cy={cy}
                        rx={Math.max(1.5, rx)}
                        ry={Math.max(1.0, ry)}
                        transform={`rotate(${eou.horizAzimuth - 90}, ${cx}, ${cy})`}
                        fill={isBit ? 'rgba(2, 132, 199, 0.25)' : 'rgba(56, 189, 248, 0.08)'}
                        stroke={isBit ? '#0284c7' : '#38bdf8'}
                        strokeWidth={isBit ? 1.5 : 0.75}
                        strokeDasharray={isBit ? 'none' : '3 2'}
                        pointerEvents="none"
                      />
                    );
                  })}

                {/* Линия опасного сближения (SF < 1.5) */}
                {showEou2D && closestApproach2D && (
                  <g pointerEvents="none">
                    <line
                      x1={getPlanX(closestApproach2D.sub.easting)}
                      y1={getPlanY(closestApproach2D.sub.northing)}
                      x2={getPlanX(closestApproach2D.off.easting)}
                      y2={getPlanY(closestApproach2D.off.northing)}
                      stroke={closestApproach2D.color}
                      strokeWidth="1.5"
                      strokeDasharray="4 2"
                    />
                    <circle cx={getPlanX(closestApproach2D.off.easting)} cy={getPlanY(closestApproach2D.off.northing)} r={3} fill={closestApproach2D.color} />
                  </g>
                )}

                {/* Точки станций */}
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
                        <circle cx={cx} cy={cy} r={8} fill="transparent" />
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isHovered ? 4.5 : 2.2}
                          fill={s.isQcPass ? '#0284c7' : '#f59e0b'}
                          stroke={isDark ? '#0c0f18' : '#fff'}
                          strokeWidth={isHovered ? 1.2 : 0.8}
                          pointerEvents="none"
                        />
                      </g>
                    );
                  })}

                <g transform="translate(520, 30)">
                  <line x1="0" y1="12" x2="0" y2="-12" stroke="#ef4444" strokeWidth="1.8" />
                  <polygon points="0,-15 -3,-8 3,-8" fill="#ef4444" />
                  <text x="0" y="-18" fill="#ef4444" fontSize="8" fontWeight="bold" textAnchor="middle">
                    N
                  </text>
                </g>
              </svg>
            </div>
          </div>
        )}

        {/* 2. ВЕРТИКАЛЬНАЯ СЕКЦИЯ (TVD vs VS) */}
        {(layoutMode === 'both' || layoutMode === 'section') && (
          <div className="flex flex-col rounded-md border shadow-2xs transition-colors bg-white dark:bg-[#0c0f18] border-slate-200 dark:border-[#171c2b] overflow-hidden relative">
            <div className="px-2.5 py-1.5 border-b flex items-center justify-between transition-colors bg-slate-50/70 dark:bg-[#101422]/70 border-slate-200 dark:border-[#171c2b]">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-3xs">
                  {isRu ? 'Разрез (TVD vs VS)' : 'Section (TVD vs VS)'}
                </span>
                {vsCursorCoords && (
                  <span className="text-4xs text-slate-400 hidden sm:inline ml-1 font-mono">
                    VS: {formatLength(vsCursorCoords.vs, unitSystem)} | TVD: {formatLength(vsCursorCoords.tvd, unitSystem)} {lenUnit}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 bg-white dark:bg-[#161a29] p-0.5 rounded border border-slate-200 dark:border-[#1e253d] text-4xs">
                <button
                  onClick={() => setVsZoom((z) => Math.max(0.4, Number((z - 0.25).toFixed(2))))}
                  className="p-0.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#20273d]"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="px-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  {Math.round(vsZoom * 100)}%
                </span>
                <button
                  onClick={() => setVsZoom((z) => Math.min(5.0, Number((z + 0.25).toFixed(2))))}
                  className="p-0.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#20273d]"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
                <button
                  onClick={handleResetVs}
                  className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
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
              <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} className="w-full h-full select-none">
                <line x1={0} y1={getVsY(0)} x2={viewWidth} y2={getVsY(0)} stroke={axisColor} strokeWidth="1" strokeDasharray="4 2" />
                <text x="10" y={getVsY(0) - 4} fill={textColor} fontSize="8">
                  Datum (0.0 m)
                </text>

                {showHorizon && (
                  <g>
                    <line x1={0} y1={getVsY(2480)} x2={viewWidth} y2={getVsY(2480)} stroke="#10b981" strokeWidth="1" strokeDasharray="5 3" strokeOpacity="0.8" />
                    <text x={viewWidth - 10} y={getVsY(2480) - 4} fill="#10b981" fontSize="8" textAnchor="end" fontWeight="bold">
                      Achimov Target Horizon (TVD: 2,480m)
                    </text>
                  </g>
                )}

                {showRaw && rawStations.length > 1 && (
                  <path d={rawVsPath} fill="none" stroke="#f59e0b" strokeWidth="1.6" strokeOpacity="0.75" strokeDasharray="4 3" />
                )}

                {showCorrected && stations.length > 1 && (
                  <path d={corrVsPath} fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                )}

                {/* 2D Эллипсоиды на разрезе */}
                {showEou2D &&
                  stations.map((s, idx) => {
                    if (idx === 0) return null;
                    const isBit = idx === stations.length - 1;

                    const eou = s.eou || calculateStationEou(s.md, s.inc, s.azim);
                    const cx = getVsX(s.vs);
                    const cy = getVsY(s.tvd);

                    const rx = eou.semiMajor * vsBaseScaleX * vsZoom;
                    const ry = eou.semiMinor * vsBaseScaleY * vsZoom;
                    const rotAngle = s.inc - 90;

                    return (
                      <ellipse
                        key={`vs-eou-${s.id}`}
                        cx={cx}
                        cy={cy}
                        rx={Math.max(1.5, rx)}
                        ry={Math.max(1.0, ry)}
                        transform={`rotate(${rotAngle}, ${cx}, ${cy})`}
                        fill={isBit ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.08)'}
                        stroke="#10b981"
                        strokeWidth={isBit ? 1.5 : 0.75}
                        strokeDasharray={isBit ? 'none' : '3 2'}
                        pointerEvents="none"
                      />
                    );
                  })}

                {/* Точки станций */}
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
                        <circle cx={cx} cy={cy} r={8} fill="transparent" />
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isHovered ? 4.5 : 2.2}
                          fill={s.isQcPass ? '#10b981' : '#f59e0b'}
                          stroke={isDark ? '#0c0f18' : '#fff'}
                          strokeWidth={isHovered ? 1.2 : 0.8}
                          pointerEvents="none"
                        />
                      </g>
                    );
                  })}
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Всплывающая подсказка станции */}
      {hovered2DStation && (
        <div
          className="fixed z-50 pointer-events-none p-2.5 rounded-md shadow-xl text-3xs border bg-white/95 dark:bg-[#0e111a]/95 text-slate-800 dark:text-white border-slate-200 dark:border-slate-800 backdrop-blur-md font-mono min-w-56"
          style={{
            left: `${Math.min(window.innerWidth - 260, hovered2DStation.clientX + 16)}px`,
            top: `${Math.min(window.innerHeight - 220, Math.max(16, hovered2DStation.clientY - 40))}px`,
          }}
        >
          <div className="font-bold border-b border-slate-100 dark:border-slate-800 pb-1 mb-1.5 flex items-center justify-between text-sky-600 dark:text-sky-400">
            <span>#{hovered2DStation.station.id}</span>
            <span>MD: {formatLength(hovered2DStation.station.md, unitSystem)} {lenUnit}</span>
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-600 dark:text-slate-300 mb-1.5">
            <div>Inc: <strong className="text-slate-900 dark:text-white">{hovered2DStation.station.inc.toFixed(2)}°</strong></div>
            <div>Azim: <strong className="text-slate-900 dark:text-white">{hovered2DStation.station.azim.toFixed(2)}°</strong></div>
            <div>TVD: <strong className="text-slate-900 dark:text-white">{formatLength(hovered2DStation.station.tvd, unitSystem)} {lenUnit}</strong></div>
            <div>DLS: <strong className="text-slate-900 dark:text-white">{hovered2DStation.station.dls.toFixed(2)}</strong></div>
          </div>

          {hovered2DStation.station.eou && (
            <div className="p-1 rounded bg-sky-500/10 border border-sky-500/20 text-sky-700 dark:text-sky-300 flex justify-between items-center mb-1">
              <span>EOU 2σ:</span>
              <span className="font-bold">±{formatLength(hovered2DStation.station.eou.semiMajor, unitSystem)} {lenUnit}</span>
            </div>
          )}

          <div className="pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-4xs">
            <span className="text-slate-400">QC Status:</span>
            {hovered2DStation.station.isQcPass ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">Pass</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400 font-bold">Warning</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};