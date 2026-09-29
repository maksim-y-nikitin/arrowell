import React from 'react';
import { useWellbore } from '@/context/WellboreContext';
import { Plus, Upload, Download, Settings, GitCompare } from 'lucide-react';

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
    isCalculatingSCC,
  } = useWellbore();

  const isBusy = isCalculatingMSA || isCalculatingSAG || isCalculatingSCC;

  return (
    <div className="actionbar">
      <div className="group">
        <span className="group-label">Azimuth</span>
        <div className="seg">
          <button
            onClick={resetSurveys}
            disabled={isBusy}
            className={azimuthCorrection === 'none' ? 'on' : ''}
          >
            Raw
          </button>
          <button
            onClick={runMSA}
            disabled={isBusy}
            className={azimuthCorrection === 'msa' ? 'on acc' : ''}
          >
            <span>MSA</span>
            {isCalculatingMSA ? (
              <span className="led pulse text-[var(--warn)]" />
            ) : azimuthCorrection === 'msa' ? (
              <span className="led text-[var(--accent)]" />
            ) : null}
          </button>
          <button
            onClick={runSCC}
            disabled={isBusy}
            className={azimuthCorrection === 'scc' ? 'on acc' : ''}
          >
            <span>SCC</span>
            {isCalculatingSCC ? (
              <span className="led pulse text-[var(--warn)]" />
            ) : azimuthCorrection === 'scc' ? (
              <span className="led text-[var(--accent)]" />
            ) : null}
          </button>
        </div>
      </div>

      <div className="group-sep"></div>

      <div className="group">
        <span className="group-label">Inclination</span>
        <div className="seg">
          <button
            onClick={runSAG}
            disabled={isBusy}
            className={isSagEnabled ? 'on okc' : ''}
          >
            <span>SAG</span>
            <span
              className={`led ${
                isCalculatingSAG
                  ? 'pulse text-[var(--warn)]'
                  : isSagEnabled
                  ? 'text-[var(--ok)]'
                  : 'opacity-25'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="group-sep"></div>

      <div className="group">
        <button
          onClick={() => setShowDeltaDiff((prev) => !prev)}
          title="Toggle residual delta display (Δ)"
          className={`btn ${showDeltaDiff ? 'on' : 'bare'}`}
        >
          <GitCompare className="w-3.5 h-3.5" />
          <span>Δ</span>
        </button>

        <button onClick={onOpenAddModal} className="btn">
          <Plus className="w-3.5 h-3.5" />
          <span>New</span>
        </button>

        <button onClick={onOpenImportModal} className="btn">
          <Upload className="w-3.5 h-3.5" />
          <span>Import</span>
        </button>

        <button onClick={onOpenExportModal} className="btn">
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>
      </div>

      <div className="flex-1" />

      <div className="group">
        <button
          onClick={onOpenGeoModal}
          title="Geomagnetic & BHA Settings"
          className="btn bare"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};