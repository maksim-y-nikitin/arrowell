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
import { SensorQCDashboard } from '@/components/workbench/SensorQCDashboard';
import { AntiCollisionScan } from '@/components/workbench/AntiCollisionScan';
import { AddSurveyModal } from '@/components/modals/AddSurveyModal';
import { ImportModal } from '@/components/modals/ImportModal';
import { ExportModal } from '@/components/modals/ExportModal';
import { GeomagneticSettingsModal } from '@/components/modals/GeomagneticSettingsModal';
import { Compass, CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const WorkstationContent: React.FC = () => {
  const { viewMode, notification, dismissNotification, theme, language } = useWellbore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Modal dialog visibility states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isGeoModalOpen, setIsGeoModalOpen] = useState(false);

  // Split view sub-tab selector
  const [visualSubTab, setVisualSubTab] = useState<'3d' | '2d'>('3d');

  // Synchronize document root class with persisted theme state
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return (
    <div className={`flex flex-col h-screen w-screen bg-slate-100 dark:bg-[#07090e] text-slate-900 dark:text-slate-100 overflow-hidden font-sans select-none ${theme === 'dark' ? 'dark' : ''}`}>
      {/* 1. Global Navigation Header */}
      <HeaderNav
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        isSidebarOpen={isSidebarOpen}
      />

      {/* 2. Workspace Body (Sidebar + Central Canvas/Grid) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Landmark EDM Hierarchy Sidebar */}
        <div
          className={`h-full transition-all duration-300 ease-in-out overflow-hidden shrink-0 z-20 ${
            isSidebarOpen ? 'w-64 sm:w-72 opacity-100' : 'w-0 opacity-0 pointer-events-none'
          }`}
        >
          <div className="w-64 sm:w-72 h-full">
            <SidebarTree />
          </div>
        </div>

        {/* Central Engineering Workspace */}
        <main className="flex-1 flex flex-col overflow-hidden relative bg-white dark:bg-[#090b11]">
          {/* Engineering Command Ribbon */}
          <WorkspaceRibbon
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onOpenImportModal={() => setIsImportModalOpen(true)}
            onOpenExportModal={() => setIsExportModalOpen(true)}
            onOpenGeoModal={() => setIsGeoModalOpen(true)}
          />

          {/* Dynamic Workspace Layouts */}
          <div className="flex-1 overflow-hidden relative">
            {/* Split Workbench: Trajectory Left + Survey Grid Right */}
            {viewMode === 'split' && (
              <div className="w-full h-full grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
                {/* Visualizer Column (7 cols) */}
                <div className="lg:col-span-7 h-full flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-[#1e2439] relative overflow-hidden">
                  {/* Visualizer sub-tab switcher */}
                  <div className="h-8 bg-slate-100 dark:bg-[#0c0f18] px-3 border-b border-slate-200 dark:border-[#1b2135] flex items-center justify-between text-3xs font-mono shrink-0 z-10">
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <Compass className="w-3 h-3 text-sky-500" />
                      <span>{language === 'ru' ? 'ВИЗУАЛИЗАЦИЯ:' : 'VISUALIZATION VIEWPORT:'}</span>
                    </div>

                    <div className="flex items-center gap-1 bg-white dark:bg-[#131724] p-0.5 rounded-md border border-slate-200 dark:border-[#1f263c]">
                      <button
                        onClick={() => setVisualSubTab('3d')}
                        className={`px-2 py-0.5 rounded-xs font-medium transition-colors ${
                          visualSubTab === '3d'
                            ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 font-semibold'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {language === 'ru' ? '3D Траектория' : '3D Trajectory'}
                      </button>
                      <button
                        onClick={() => setVisualSubTab('2d')}
                        className={`px-2 py-0.5 rounded-xs font-medium transition-colors ${
                          visualSubTab === '2d'
                            ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 font-semibold'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {language === 'ru' ? '2D План и Секция' : '2D Plan & Section'}
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 relative overflow-hidden">
                    {visualSubTab === '3d' ? <Trajectory3D /> : <Projections2D />}
                  </div>
                </div>

                {/* Survey Table Column (5 cols) */}
                <div className="lg:col-span-5 h-full overflow-hidden">
                  <SurveyLogTable />
                </div>
              </div>
            )}

            {/* Trajectory Only View */}
            {viewMode === 'trajectory' && (
              <div className="w-full h-full flex flex-col">
                <TrajectoryWorkspace />
              </div>
            )}

            {/* Table Only View */}
            {viewMode === 'table' && (
              <div className="w-full h-full flex flex-col">
                <SurveyLogTable />
              </div>
            )}

            {/* Analytics / Sensor QC Dashboard */}
            {viewMode === 'analytics' && (
              <div className="w-full h-full flex flex-col">
                <SensorQCDashboard />
              </div>
            )}

            {/* Anti-Collision Proximity Scan */}
            {viewMode === 'anticollision' && (
              <div className="w-full h-full flex flex-col">
                <AntiCollisionScan />
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div
          className={`fixed bottom-9 right-4 z-50 px-3.5 py-2 rounded-lg border shadow-xl flex items-center gap-2.5 text-xs font-mono transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-50 dark:bg-[#0c2419] border-emerald-500/50 text-emerald-800 dark:text-emerald-300'
              : notification.type === 'warning'
              ? 'bg-amber-50 dark:bg-[#291e0a] border-amber-500/50 text-amber-800 dark:text-amber-300'
              : notification.type === 'error'
              ? 'bg-rose-50 dark:bg-[#2e1014] border-rose-500/50 text-rose-800 dark:text-rose-300'
              : 'bg-white dark:bg-[#121626] border-slate-300 dark:border-[#202742] text-slate-800 dark:text-slate-200'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : notification.type === 'warning' ? (
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-sky-500 shrink-0" />
          )}
          <span>{notification.message}</span>
          <button
            onClick={dismissNotification}
            className="ml-2 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
            title={language === 'ru' ? 'Закрыть' : 'Close'}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. Bottom Telemetry Bar */}
      <StatusBar />

      {/* Modals */}
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