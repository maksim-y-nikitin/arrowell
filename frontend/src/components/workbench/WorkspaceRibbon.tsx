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
  } = useWellbore();

  return (
    <div className="actionbar">
      {/* Group 1: Azimuth */}
      <div className="group">
        <span className="group-label">Azimuth</span>
        <div className="seg">
          <button
            onClick={resetSurveys}
            disabled={isCalculatingMSA || isCalculatingSAG}
            className={azimuthCorrection === 'none' ? 'on' : ''}
          >
            Raw
          </button>
          <button
            onClick={runMSA}
            disabled={isCalculatingMSA}
            className={azimuthCorrection === 'msa' ? 'on acc' : ''}
          >
            <span>{isCalculatingMSA ? 'MSA' : 'MSA'}</span>
            {isCalculatingMSA ? (
              <span className="led pulse text-[var(--warn)]" />
            ) : azimuthCorrection === 'msa' ? (
              <span className="led text-[var(--accent)]" />
            ) : null}
          </button>
          <button
            onClick={runSCC}
            disabled={isCalculatingMSA || isCalculatingSAG}
            className={azimuthCorrection === 'scc' ? 'on acc' : ''}
          >
            <span>SCC</span>
            {azimuthCorrection === 'scc' && <span className="led text-[var(--accent)]" />}
          </button>
        </div>
      </div>

      <div className="group-sep"></div>

      {/* Group 2: Inclination */}
      <div className="group">
        <span className="group-label">Inclination</span>
        <div className="seg">
          <button
            onClick={runSAG}
            disabled={isCalculatingSAG}
            className={isSagEnabled ? 'on okc' : ''}
          >
            <span>{isCalculatingSAG ? 'SAG' : 'SAG'}</span>
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

      {/* Group 3: Core Actions */}
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

      {/* Spacer pushes Settings to the far right */}
      <div className="flex-1" />

      {/* Group 4: Settings (Right-aligned) */}
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