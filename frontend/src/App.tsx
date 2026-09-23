import React, { useState, useEffect } from 'react';
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

  // Modal dialog visibility states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isGeoModalOpen, setIsGeoModalOpen] = useState(false);

  // Sub-view toggle in Overview mode (3D vs 2D)
  const [visualSubTab, setVisualSubTab] = useState<'3d' | '2d'>('3d');

  // Synchronize root html class for dark/light themes
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden select-none bg-[var(--bg-0)] text-[var(--fg-0)] font-sans">
      {/* 1. Header Navigation Bar (40px) */}
      <HeaderNav
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        isSidebarOpen={isSidebarOpen}
      />

      {/* 2. Workspace Body (1fr) */}
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        {/* Collapsible Hierarchy Sidebar (216px) */}
        <div
          className={`h-full transition-all duration-150 ease-in-out shrink-0 overflow-hidden z-20 ${
            isSidebarOpen ? 'w-[216px]' : 'w-0 pointer-events-none'
          }`}
        >
          <div className="w-[216px] h-full">
            <SidebarTree />
          </div>
        </div>

        {/* Main Workstation Plane */}
        <main className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-[var(--bg-0)]">
          {/* Engineering Action Toolbar */}
          <WorkspaceRibbon
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onOpenImportModal={() => setIsImportModalOpen(true)}
            onOpenExportModal={() => setIsExportModalOpen(true)}
            onOpenGeoModal={() => setIsGeoModalOpen(true)}
          />

          {/* Primary Viewport Area */}
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden p-2">
            {/* Split / Overview Layout */}
            {viewMode === 'split' && (
              <div className="w-full h-full grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] grid-rows-[1fr_200px] gap-2">
                {/* Visualizer Panel (Top Left) */}
                <div className="min-h-0 min-w-0 flex flex-col rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-1)] overflow-hidden shadow-[var(--shadow-1)]">
                  {visualSubTab === '3d' ? (
                    <Trajectory3D visualSubTab={visualSubTab} onSubTabChange={setVisualSubTab} />
                  ) : (
                    <Projections2D visualSubTab={visualSubTab} onSubTabChange={setVisualSubTab} />
                  )}
                </div>

                {/* Directional Survey Table (Full Right Column) */}
                <div className="lg:row-span-2 min-h-0 min-w-0 flex flex-col rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-1)] overflow-hidden shadow-[var(--shadow-1)]">
                  <SurveyLogTable />
                </div>

                {/* Sensor QC Strip (Bottom Left) */}
                <div className="min-h-0 min-w-0 flex flex-col rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-1)] overflow-hidden shadow-[var(--shadow-1)]">
                  <SensorQCStrip />
                </div>
              </div>
            )}

            {/* Standalone Trajectory View */}
            {viewMode === 'trajectory' && (
              <div className="w-full h-full flex flex-col rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-1)] overflow-hidden shadow-[var(--shadow-1)]">
                <TrajectoryWorkspace />
              </div>
            )}

            {/* Standalone Table View */}
            {viewMode === 'table' && (
              <div className="w-full h-full flex flex-col rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-1)] overflow-hidden shadow-[var(--shadow-1)]">
                <SurveyLogTable isFullPage />
              </div>
            )}

            {/* Standalone QC Analytics View */}
            {viewMode === 'analytics' && (
              <div className="w-full h-full flex flex-col rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-1)] overflow-hidden shadow-[var(--shadow-1)]">
                <SensorQCDashboard />
              </div>
            )}

            {/* Standalone Anti-Collision Scan View */}
            {viewMode === 'anticollision' && (
              <div className="w-full h-full flex flex-col rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-1)] overflow-hidden shadow-[var(--shadow-1)]">
                <AntiCollisionScan />
              </div>
            )}
          </div>
        </main>
      </div>

      {/* 3. Status Bar Footer (22px) */}
      <StatusBar />

      {/* Global Notifications Toast */}
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

      {/* Engineering Configuration Modals */}
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