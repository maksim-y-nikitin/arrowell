import React, { useState, useEffect, useRef } from 'react';
import { WellboreProvider, useWellbore } from '@/context/WellboreContext';
import { HeaderNav } from '@/components/layout/HeaderNav';
import { StatusBar } from '@/components/layout/StatusBar';
import { SidebarTree } from '@/components/layout/SidebarTree';
import { WorkspaceRibbon } from '@/components/workbench/WorkspaceRibbon';
import { Trajectory3D } from '@/components/workbench/Trajectory3D';
import { Projections2D } from '@/components/workbench/Projections2D';
import { TrajectoryWorkspace } from '@/components/workbench/TrajectoryWorkspace';
import { SurveyLogTable } from '@/components/workbench/SurveyLogTable';
import { SensorQCDashboard, SensorQCStrip } from '@/components/workbench/SensorQCDashboard';
import { AntiCollisionScan } from '@/components/workbench/AntiCollisionScan';
import { AddSurveyModal } from '@/components/modals/AddSurveyModal';
import { ImportModal } from '@/components/modals/ImportModal';
import { ExportModal } from '@/components/modals/ExportModal';
import { GeomagneticSettingsModal } from '@/components/modals/GeomagneticSettingsModal';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const WorkstationContent: React.FC = () => {
  const { viewMode, notification, dismissNotification, theme } = useWellbore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isGeoModalOpen, setIsGeoModalOpen] = useState(false);

  const [visualSubTab, setVisualSubTab] = useState<'3d' | '2d'>('3d');

  const [splitPercent, setSplitPercent] = useState<number>(58);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const handleSplitMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const handleMouseMove = (ev: MouseEvent) => {
      if (!splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const rawPercent = ((ev.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(25, Math.min(75, rawPercent));
      setSplitPercent(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleSplitDoubleClick = () => {
    setSplitPercent(58);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden select-none bg-[var(--bg-0)] text-[var(--fg-0)] font-sans">
      <HeaderNav
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        isSidebarOpen={isSidebarOpen}
      />

      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <div
          className={`h-full transition-all duration-150 ease-in-out shrink-0 overflow-hidden z-20 ${
            isSidebarOpen ? 'w-[216px]' : 'w-0 pointer-events-none'
          }`}
        >
          <div className="w-[216px] h-full">
            <SidebarTree />
          </div>
        </div>

        <main className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-[var(--bg-0)]">
          <WorkspaceRibbon
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onOpenImportModal={() => setIsImportModalOpen(true)}
            onOpenExportModal={() => setIsExportModalOpen(true)}
            onOpenGeoModal={() => setIsGeoModalOpen(true)}
          />

          <div className="flex-1 min-h-0 min-w-0 overflow-hidden p-2">
            {viewMode === 'split' && (
              <div
                ref={splitContainerRef}
                className="w-full h-full flex flex-col lg:flex-row min-h-0 min-w-0 overflow-hidden"
                style={{ '--split-w': `${splitPercent}%` } as React.CSSProperties}
              >
                <div className="w-full lg:w-[var(--split-w)] h-full flex flex-col min-h-0 min-w-0 gap-2 shrink-0">
                  <div className="flex-1 min-h-0 min-w-0 flex flex-col rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-1)] overflow-hidden shadow-[var(--shadow-1)]">
                    {visualSubTab === '3d' ? (
                      <Trajectory3D visualSubTab={visualSubTab} onSubTabChange={setVisualSubTab} />
                    ) : (
                      <Projections2D visualSubTab={visualSubTab} onSubTabChange={setVisualSubTab} />
                    )}
                  </div>

                  <div className="h-[200px] min-h-[160px] shrink-0 flex flex-col rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-1)] overflow-hidden shadow-[var(--shadow-1)]">
                    <SensorQCStrip />
                  </div>
                </div>

                <div
                  onMouseDown={handleSplitMouseDown}
                  onDoubleClick={handleSplitDoubleClick}
                  className="hidden lg:flex w-2.5 h-full cursor-col-resize items-center justify-center shrink-0 group select-none hover:bg-[var(--accent-soft)] active:bg-[var(--accent-soft)] transition-colors"
                  title="Перетащите для изменения ширины (двойной клик для сброса)"
                >
                  <div className="w-[2px] h-8 rounded-full bg-[var(--line-strong)] group-hover:bg-[var(--accent)] group-active:bg-[var(--accent)] transition-colors" />
                </div>

                <div className="flex-1 w-full lg:w-auto h-full min-h-0 min-w-0 flex flex-col rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-1)] overflow-hidden shadow-[var(--shadow-1)]">
                  <SurveyLogTable />
                </div>
              </div>
            )}

            {viewMode === 'trajectory' && (
              <div className="w-full h-full flex flex-col rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-1)] overflow-hidden shadow-[var(--shadow-1)]">
                <TrajectoryWorkspace />
              </div>
            )}

            {viewMode === 'table' && (
              <div className="w-full h-full flex flex-col rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-1)] overflow-hidden shadow-[var(--shadow-1)]">
                <SurveyLogTable />
              </div>
            )}

            {viewMode === 'analytics' && (
              <div className="w-full h-full flex flex-col rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-1)] overflow-hidden shadow-[var(--shadow-1)]">
                <SensorQCDashboard />
              </div>
            )}

            {viewMode === 'anticollision' && (
              <div className="w-full h-full flex flex-col rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-1)] overflow-hidden shadow-[var(--shadow-1)]">
                <AntiCollisionScan />
              </div>
            )}
          </div>
        </main>
      </div>

      <StatusBar />

      {isDragging && (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none pointer-events-auto" />
      )}

      {notification && (
        <div
          className={`fixed bottom-8 right-4 z-50 px-3 py-1.5 rounded-[var(--r1)] border shadow-[var(--shadow-2)] flex items-center gap-2 text-[11px] font-mono transition-all ${
            notification.type === 'success'
              ? 'bg-[var(--ok-soft)] border-[var(--ok-line)] text-[var(--ok)]'
              : notification.type === 'warning'
              ? 'bg-[var(--warn-soft)] border-[var(--warn-line)] text-[var(--warn)]'
              : notification.type === 'error'
              ? 'bg-[var(--crit-soft)] border-[var(--crit-line)] text-[var(--crit)]'
              : 'bg-[var(--bg-1)] border-[var(--line)] text-[var(--fg-0)]'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[var(--ok)]" />
          ) : notification.type === 'warning' ? (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-[var(--warn)]" />
          ) : (
            <Info className="w-3.5 h-3.5 shrink-0 text-[var(--accent)]" />
          )}
          <span>{notification.message}</span>
          <button
            onClick={dismissNotification}
            className="ml-1 p-0.5 text-[var(--fg-2)] hover:text-[var(--fg-0)] rounded"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <AddSurveyModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
      <ImportModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} />
      <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} />
      <GeomagneticSettingsModal isOpen={isGeoModalOpen} onClose={() => setIsGeoModalOpen(false)} />
    </div>
  );
};

export default function App() {
  return (
    <WellboreProvider>
      <WorkstationContent />
    </WellboreProvider>
  );
}