import React from 'react';
import { useWellbore } from '@/context/WellboreContext';
import {
  Plus,
  Upload,
  Download,
  Sliders,
  GitCompare,
  Magnet,
  Compass,
} from 'lucide-react';

interface RibbonProps {
  onOpenAddModal: () => void;
  onOpenImportModal: () => void;
  onOpenExportModal: () => void;
  onOpenGeoModal: () => void;
}

export const WorkspaceRibbon: React.FC<RibbonProps> = ({
  onOpenAddModal,
  onOpenImportModal,
  onOpenExportModal,
  onOpenGeoModal,
}) => {
  const {
    azimuthCorrection,
    isSagEnabled,
    showDeltaDiff,
    setShowDeltaDiff,
    runMSA,
    runSCC,
    runSAG,
    resetSurveys,
    isCalculatingMSA,
    isCalculatingSAG,
    language,
    t,
  } = useWellbore();

  const isRu = language === 'ru';

  return (
    <div className="h-10 px-3 flex items-center justify-between border-b shrink-0 select-none transition-colors bg-white dark:bg-[#0b0d14] border-slate-200 dark:border-[#161a29] text-slate-700 dark:text-slate-300">
      {/* Left: Professional Engineering Segmented Controls */}
      <div className="flex items-center gap-2.5">
        {/* Module 1: Azimuth Magnetic Corrections (Exclusive: Raw | MSA | SCC) */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 text-slate-400 text-3xs font-medium uppercase tracking-wider pl-1">
            <Magnet className="w-3 h-3 text-sky-500" />
            <span className="hidden sm:inline">{isRu ? 'Азимут' : 'Azimuth'}</span>
          </div>

          <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-[#121624] border border-slate-200 dark:border-[#1a2035] text-xs">
            {/* Raw */}
            <button
              onClick={resetSurveys}
              disabled={isCalculatingMSA || isCalculatingSAG}
              title={isRu ? 'Сырой ствол без поправок азимута' : 'Raw baseline azimuth'}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                azimuthCorrection === 'none'
                  ? 'bg-white dark:bg-[#1e253c] text-slate-900 dark:text-white font-semibold shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {isRu ? 'Исходный' : 'Raw'}
            </button>

            {/* MSA (Multi-Station Analysis via mwdstdcore) с мигающей индикацией */}
            <button
              onClick={runMSA}
              disabled={isCalculatingMSA}
              title={
                isRu
                  ? isCalculatingMSA
                    ? 'Выполняется оптимизация MSA (дифференциальная эволюция mwdstdcore)...'
                    : 'Multi-Station Analysis (mwdstdcore differential evolution)'
                  : isCalculatingMSA
                  ? 'Computing MSA optimization (mwdstdcore differential evolution)...'
                  : 'Multi-Station Analysis (mwdstdcore differential evolution)'
              }
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                azimuthCorrection === 'msa' && !isCalculatingMSA
                  ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 font-semibold border border-sky-500/30 shadow-xs'
                  : isCalculatingMSA
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/40 font-semibold animate-pulse shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <span>{isCalculatingMSA ? (isRu ? 'MSA...' : 'MSA...') : 'MSA'}</span>

              {/* Точка-индикатор с миганием при расчете */}
              {isCalculatingMSA ? (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
              ) : azimuthCorrection === 'msa' ? (
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              ) : null}
            </button>

            {/* SCC (Short Collar Correction) */}
            <button
              onClick={runSCC}
              disabled={isCalculatingMSA || isCalculatingSAG}
              title={isRu ? 'Short Collar Correction' : 'Short Collar Correction (SCC)'}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                azimuthCorrection === 'scc'
                  ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 font-semibold border border-sky-500/30 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <span>SCC</span>
              {azimuthCorrection === 'scc' && (
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              )}
            </button>
          </div>
        </div>

        <div className="h-4 w-px bg-slate-200 dark:border-r dark:border-[#1a2035]" />

        {/* Module 2: Inclination SAG Correction (Beam Deflection via mwdstdcore) с мигающей индикацией */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 text-slate-400 text-3xs font-medium uppercase tracking-wider pl-1 hidden sm:flex">
            <Compass className="w-3 h-3 text-emerald-500" />
            <span>{isRu ? 'Зенит' : 'Inc'}</span>
          </div>

          <button
            onClick={runSAG}
            disabled={isCalculatingSAG}
            title={
              isRu
                ? isCalculatingSAG
                  ? 'Выполняется расчет деформации КНБК в буровом растворе...'
                  : 'Поправка на гравитационный прогиб КНБК (механика балки mwdstdcore sagcor)'
                : isCalculatingSAG
                ? 'Computing BHA beam bending in drilling fluid...'
                : 'BHA Gravity Sag Correction (mwdstdcore beam bending solver)'
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
              isSagEnabled && !isCalculatingSAG
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold shadow-xs'
                : isCalculatingSAG
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/40 font-semibold animate-pulse shadow-xs'
                : 'bg-slate-100 dark:bg-[#121624] text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 border-slate-200 dark:border-[#1a2035]'
            }`}
          >
            <span>{isCalculatingSAG ? (isRu ? 'SAG...' : 'SAG...') : 'SAG'}</span>

            {/* Точка-индикатор с миганием при расчете */}
            {isCalculatingSAG ? (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            ) : isSagEnabled ? (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400/40" />
            )}
          </button>
        </div>
      </div>

      {/* Right: Tools & Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Toggle Delta diffs */}
        <button
          onClick={() => setShowDeltaDiff((prev) => !prev)}
          title={isRu ? 'Показать изменения (Δ)' : 'Toggle Delta (Δ)'}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
            showDeltaDiff
              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30 font-semibold'
              : 'text-slate-500 dark:text-slate-400 border-transparent hover:bg-slate-100 dark:hover:bg-[#141828]'
          }`}
        >
          <GitCompare className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">{t('showDiff')}</span>
        </button>

        <div className="h-4 w-px bg-slate-200 dark:border-r dark:border-[#1a2035] mx-0.5" />

        {/* Add Station */}
        <button
          onClick={onOpenAddModal}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors bg-sky-600 hover:bg-sky-500 text-white shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t('addSurvey')}</span>
        </button>

        {/* Import */}
        <button
          onClick={onOpenImportModal}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors hover:bg-slate-100 dark:hover:bg-[#141828] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#1a2035]"
        >
          <Upload className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">{t('importSurvey')}</span>
        </button>

        {/* Export */}
        <button
          onClick={onOpenExportModal}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors hover:bg-slate-100 dark:hover:bg-[#141828] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#1a2035]"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">{t('exportSurvey')}</span>
        </button>

        {/* Engineering Settings (Geomagnetic WMM + BHA/Mud Parameters) */}
        <button
          onClick={onOpenGeoModal}
          title={isRu ? 'Настройки геомагнитной модели и КНБК' : 'Geomagnetic Model & BHA Settings'}
          className="p-1 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#141828] transition-colors"
        >
          <Sliders className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};