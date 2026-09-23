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
  Layers,
  ChevronDown,
  ShieldAlert,
  Compass,
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
  const { stations, rawStations, unitSystem, language } = useWellbore();
  const isRu = language === 'ru';
  const lenUnit = unitSystem === 'metric' ? 'm' : 'ft';

  const [layoutMode, setLayoutMode] = useState<ViewMode2D>('both');

  const [showRaw, setShowRaw] = useState(true);
  const [showCorrected, setShowCorrected] = useState(true);
  const [showStations, setShowStations] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showHorizon, setShowHorizon] = useState(true);
  const [showEou2D, setShowEou2D] = useState(true);
  const [showLayersMenu, setShowLayersMenu] = useState(false);

  const [hovered2DStation, setHovered2DStation] = useState<Hovered2DStationInfo | null>(null);

  const [planZoom, setPlanZoom] = useState<number>(1.0);
  const [planPan, setPlanPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [planCursorCoords, setPlanCursorCoords] = useState<{ n: number; e: number } | null>(null);
  const isDraggingPlan = useRef(false);
  const planDragStart = useRef({ x: 0, y: 0 });

  const [vsZoom, setVsZoom] = useState<number>(1.0);
  const [vsPan, setVsPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [vsCursorCoords, setVsCursorCoords] = useState<{ vs: number; tvd: number } | null>(null);
  const isDraggingVs = useRef(false);
  const vsDragStart = useRef({ x: 0, y: 0 });

  const bounds = useMemo(() => {
    const allN = stations.map((s) => s.northing);
    const allE = stations.map((s) => s.easting);
    const allTvd = stations.map((s) => s.tvd);
    const allVs = stations.map((s) => s.vs);

    return {
      minN: Math.min(0, ...allN),
      maxN: Math.max(100, ...allN),
      minE: Math.min(0, ...allE),
      maxE: Math.max(100, ...allE),
      minTvd: 0,
      maxTvd: Math.max(2600, ...allTvd),
      minVs: Math.min(0, ...allVs),
      maxVs: Math.max(100, ...allVs),
    };
  }, [stations]);

  const viewWidth = 560;
  const viewHeight = 380;
  const padding = 44;

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
      const center = viewHeight / 2;
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
      calculateStationEou((subStn as SurveyStation).md, (subStn as SurveyStation).inc, (subStn as SurveyStation).azim);
    const eouO = calculateStationEou(offStn.md, 1.5, 45.0);
    const sf = minD / (eouS.semiMajor + eouO.semiMajor || 1.0);

    if (sf >= 1.5) return null;

    return {
      sub: subStn,
      off: offStn,
      minD,
      sf,
      color: sf < 1.0 ? 'var(--crit)' : 'var(--warn)',
      eouS,
      eouO,
    };
  }, [stations]);

  return (
    <div className="w-full h-full flex flex-col select-none overflow-hidden bg-[var(--bg-1)] font-mono t-sm">
      <div className="panel-head justify-between">
        <div className="flex items-center gap-2">
          <div className="panel-title">
            <Compass className="w-3.5 h-3.5 text-[var(--fg-2)]" />
            <span>{isRu ? '2D Проекции' : '2D Projections'}</span>
          </div>

          <div className="seg">
            <button
              type="button"
              onClick={() => setLayoutMode('both')}
              className={layoutMode === 'both' ? 'on acc' : ''}
            >
              {isRu ? 'План + Разрез' : 'Split'}
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('plan')}
              className={layoutMode === 'plan' ? 'on acc' : ''}
            >
              {isRu ? 'План (+N/+E)' : 'Plan'}
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('section')}
              className={layoutMode === 'section' ? 'on acc' : ''}
            >
              {isRu ? 'Разрез (VS/TVD)' : 'Section'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowLayersMenu(!showLayersMenu)}
              className="btn"
            >
              <Layers className="w-3.5 h-3.5 text-[var(--fg-2)]" />
              <span>Layers</span>
              <ChevronDown className="w-2.5 h-2.5 text-[var(--fg-3)]" />
            </button>

            {showLayersMenu && (
              <div className="absolute top-8 right-0 w-52 p-2 bg-[var(--bg-1)] border border-[var(--line-strong)] rounded-[var(--r2)] shadow-[var(--shadow-2)] z-30 space-y-1.5 t-xs font-sans">
                <label className="flex items-center gap-2 cursor-pointer hover:text-[var(--fg-0)]">
                  <input
                    type="checkbox"
                    checked={showCorrected}
                    onChange={(e) => setShowCorrected(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <span className="w-2 h-0.5 bg-[var(--accent)] inline-block" />
                  <span>{isRu ? 'Скорректированный ствол' : 'Corrected Path'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer hover:text-[var(--fg-0)]">
                  <input
                    type="checkbox"
                    checked={showStations}
                    onChange={(e) => setShowStations(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <CircleDot className="w-2.5 h-2.5 text-[var(--accent)]" />
                  <span>{isRu ? 'Точки станций' : 'Survey Stations'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer hover:text-[var(--fg-0)]">
                  <input
                    type="checkbox"
                    checked={showRaw}
                    onChange={(e) => setShowRaw(e.target.checked)}
                    className="accent-[var(--warn)]"
                  />
                  <span className="w-2 h-0.5 bg-[var(--warn)] inline-block" />
                  <span>{isRu ? 'Сырой ствол MWD' : 'Raw MWD'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer hover:text-[var(--fg-0)]">
                  <input
                    type="checkbox"
                    checked={showEou2D}
                    onChange={(e) => setShowEou2D(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <ShieldAlert className="w-3 h-3 text-[var(--accent)]" />
                  <span>{isRu ? 'Эллипсы EOU (1:1)' : 'EOU Ellipses (1:1)'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer hover:text-[var(--fg-0)]">
                  <input
                    type="checkbox"
                    checked={showHorizon}
                    onChange={(e) => setShowHorizon(e.target.checked)}
                    className="accent-[var(--ok)]"
                  />
                  <span className="w-2 h-2 rounded-full bg-[var(--ok)] inline-block" />
                  <span>{isRu ? 'Целевой пласт' : 'Target Payzone'}</span>
                </label>
              </div>
            )}
          </div>

          <div className="seg">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSubTabChange?.('3d');
              }}
              className={visualSubTab === '3d' ? 'on acc' : ''}
            >
              3D
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSubTabChange?.('2d');
              }}
              className={visualSubTab === '2d' ? 'on acc' : ''}
            >
              2D
            </button>
          </div>
        </div>
      </div>

      <div
        className={`flex-1 p-2 grid gap-2 overflow-hidden bg-[var(--bg-0)] ${
          layoutMode === 'both' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {(layoutMode === 'both' || layoutMode === 'plan') && (
          <div className="flex flex-col rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-1)] overflow-hidden relative shadow-[var(--shadow-1)]">
            <div className="h-9 px-2.5 border-b border-[var(--line)] flex items-center justify-between bg-[var(--bg-2)]">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                <span className="font-semibold text-[var(--fg-0)] t-sm font-sans">
                  {isRu ? 'План (+N / +E)' : 'Plan (+N / +E)'}
                </span>
                {planCursorCoords && (
                  <span className="t-2xs text-[var(--fg-2)] ml-1 font-mono hidden sm:inline">
                    N: {formatLength(planCursorCoords.n, unitSystem)} | E: {formatLength(planCursorCoords.e, unitSystem)} {lenUnit}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 bg-[var(--bg-1)] p-0.5 rounded border border-[var(--line)] t-2xs">
                <button
                  type="button"
                  onClick={() => setPlanZoom((z) => Math.max(0.4, Number((z - 0.25).toFixed(2))))}
                  className="p-0.5 text-[var(--fg-2)] hover:text-[var(--fg-0)]"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="px-1 font-semibold text-[var(--accent)]">
                  {Math.round(planZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setPlanZoom((z) => Math.min(5.0, Number((z + 0.25).toFixed(2))))}
                  className="p-0.5 text-[var(--fg-2)] hover:text-[var(--fg-0)]"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={handleResetPlan}
                  className="p-0.5 text-[var(--fg-3)] hover:text-[var(--fg-0)]"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div
              className="flex-1 w-full h-full relative cursor-grab active:cursor-grabbing overflow-hidden flex items-center justify-center bg-[var(--bg-2)]"
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
                    <line x1={0} y1={getPlanY(0)} x2={viewWidth} y2={getPlanY(0)} stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="4 3" />
                    <line x1={getPlanX(0)} y1={0} x2={getPlanX(0)} y2={viewHeight} stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="4 3" />
                  </g>
                )}

                <g transform={`translate(${getPlanX(0)}, ${getPlanY(0)})`}>
                  <circle r="3" fill="var(--accent)" />
                  <circle r="6" fill="none" stroke="var(--accent)" strokeWidth="0.8" strokeDasharray="2 2" />
                  <text x="8" y="3" fill="var(--fg-3)" fontSize="9" fontWeight="bold">
                    (0,0)
                  </text>
                </g>

                {showRaw && rawStations.length > 1 && (
                  <path d={rawPlanPath} fill="none" stroke="var(--warn)" strokeWidth="1.6" strokeOpacity="0.75" strokeDasharray="4 3" />
                )}

                {showCorrected && stations.length > 1 && (
                  <path d={corrPlanPath} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                )}

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
                        fill={isBit ? 'color-mix(in srgb, var(--accent) 25%, transparent)' : 'color-mix(in srgb, var(--accent) 8%, transparent)'}
                        stroke="var(--accent)"
                        strokeWidth={isBit ? 1.5 : 0.75}
                        strokeDasharray={isBit ? 'none' : '3 2'}
                        pointerEvents="none"
                      />
                    );
                  })}

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
                          fill={s.isQcPass ? 'var(--accent)' : 'var(--warn)'}
                          stroke="var(--bg-1)"
                          strokeWidth={isHovered ? 1.2 : 0.8}
                          pointerEvents="none"
                        />
                      </g>
                    );
                  })}

                <g transform="translate(520, 30)">
                  <line x1="0" y1="12" x2="0" y2="-12" stroke="var(--crit)" strokeWidth="1.8" />
                  <polygon points="0,-15 -3,-8 3,-8" fill="var(--crit)" />
                  <text x="0" y="-18" fill="var(--crit)" fontSize="9" fontWeight="bold" textAnchor="middle">
                    N
                  </text>
                </g>
              </svg>
            </div>
          </div>
        )}

        {(layoutMode === 'both' || layoutMode === 'section') && (
          <div className="flex flex-col rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-1)] overflow-hidden relative shadow-[var(--shadow-1)]">
            <div className="h-9 px-2.5 border-b border-[var(--line)] flex items-center justify-between bg-[var(--bg-2)]">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)]" />
                <span className="font-semibold text-[var(--fg-0)] t-sm font-sans">
                  {isRu ? 'Разрез (TVD vs VS)' : 'Section (TVD vs VS)'}
                </span>
                {vsCursorCoords && (
                  <span className="t-2xs text-[var(--fg-2)] ml-1 font-mono hidden sm:inline">
                    VS: {formatLength(vsCursorCoords.vs, unitSystem)} | TVD: {formatLength(vsCursorCoords.tvd, unitSystem)} {lenUnit}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 bg-[var(--bg-1)] p-0.5 rounded border border-[var(--line)] t-2xs">
                <button
                  type="button"
                  onClick={() => setVsZoom((z) => Math.max(0.4, Number((z - 0.25).toFixed(2))))}
                  className="p-0.5 text-[var(--fg-2)] hover:text-[var(--fg-0)]"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="px-1 font-semibold text-[var(--ok)]">
                  {Math.round(vsZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setVsZoom((z) => Math.min(5.0, Number((z + 0.25).toFixed(2))))}
                  className="p-0.5 text-[var(--fg-2)] hover:text-[var(--fg-0)]"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={handleResetVs}
                  className="p-0.5 text-[var(--fg-3)] hover:text-[var(--fg-0)]"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div
              className="flex-1 w-full h-full relative cursor-grab active:cursor-grabbing overflow-hidden flex items-center justify-center bg-[var(--bg-2)]"
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
                <line x1={0} y1={getVsY(0)} x2={viewWidth} y2={getVsY(0)} stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="4 2" />
                <text x="10" y={getVsY(0) - 4} fill="var(--fg-3)" fontSize="9">
                  Datum (0.0 m)
                </text>

                {showHorizon && (
                  <g>
                    <line x1={0} y1={getVsY(2480)} x2={viewWidth} y2={getVsY(2480)} stroke="var(--ok)" strokeWidth="1" strokeDasharray="5 3" strokeOpacity="0.8" />
                    <text x={viewWidth - 10} y={getVsY(2480) - 4} fill="var(--ok)" fontSize="9" textAnchor="end" fontWeight="bold">
                      Achimov Target Horizon (TVD: 2,480m)
                    </text>
                  </g>
                )}

                {showRaw && rawStations.length > 1 && (
                  <path d={rawVsPath} fill="none" stroke="var(--warn)" strokeWidth="1.6" strokeOpacity="0.75" strokeDasharray="4 3" />
                )}

                {showCorrected && stations.length > 1 && (
                  <path d={corrVsPath} fill="none" stroke="var(--ok)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                )}

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
                        fill={isBit ? 'color-mix(in srgb, var(--ok) 25%, transparent)' : 'color-mix(in srgb, var(--ok) 8%, transparent)'}
                        stroke="var(--ok)"
                        strokeWidth={isBit ? 1.5 : 0.75}
                        strokeDasharray={isBit ? 'none' : '3 2'}
                        pointerEvents="none"
                      />
                    );
                  })}

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
                          fill={s.isQcPass ? 'var(--ok)' : 'var(--warn)'}
                          stroke="var(--bg-1)"
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

      {hovered2DStation && (
        <div
          className="fixed z-50 pointer-events-none p-2.5 rounded-[var(--r2)] shadow-[var(--shadow-2)] t-xs border bg-[var(--bg-1)] text-[var(--fg-0)] border-[var(--line-strong)] backdrop-blur-md font-mono min-w-56"
          style={{
            left: `${Math.min(window.innerWidth - 260, hovered2DStation.clientX + 16)}px`,
            top: `${Math.min(window.innerHeight - 220, Math.max(16, hovered2DStation.clientY - 40))}px`,
          }}
        >
          <div className="font-bold border-b border-[var(--line)] pb-1 mb-1.5 flex items-center justify-between text-[var(--accent)]">
            <span>#{hovered2DStation.station.id}</span>
            <span>MD: {formatLength(hovered2DStation.station.md, unitSystem)} {lenUnit}</span>
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[var(--fg-1)] mb-1.5">
            <div>Inc: <strong>{hovered2DStation.station.inc.toFixed(2)}°</strong></div>
            <div>Azim: <strong>{hovered2DStation.station.azim.toFixed(2)}°</strong></div>
            <div>TVD: <strong>{formatLength(hovered2DStation.station.tvd, unitSystem)} {lenUnit}</strong></div>
            <div>DLS: <strong>{hovered2DStation.station.dls.toFixed(2)}</strong></div>
          </div>

          {hovered2DStation.station.eou && (
            <div className="p-1 rounded bg-[var(--accent-soft)] text-[var(--accent)] flex justify-between items-center mb-1">
              <span>EOU 2σ:</span>
              <span className="font-bold">±{formatLength(hovered2DStation.station.eou.semiMajor, unitSystem)} {lenUnit}</span>
            </div>
          )}

          <div className="pt-1 border-t border-[var(--line)] flex items-center justify-between t-2xs">
            <span className="text-[var(--fg-3)]">QC:</span>
            <span className={`font-bold ${hovered2DStation.station.isQcPass ? 'text-[var(--ok)]' : 'text-[var(--warn)]'}`}>
              {hovered2DStation.station.isQcPass ? 'Pass' : 'Warning'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};