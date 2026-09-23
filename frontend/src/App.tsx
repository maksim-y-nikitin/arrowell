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
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const WorkstationContent: React.FC = () => {
  const { viewMode, notification, dismissNotification, theme } = useWellbore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Модальные окна
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isGeoModalOpen, setIsGeoModalOpen] = useState(false);

  // Подвкладка в режиме Split (управляется нативно внутри вьюпорта)
  const [visualSubTab, setVisualSubTab] = useState<'3d' | '2d'>('3d');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return (
    <div
      className={`flex flex-col h-screen w-screen bg-[#f1f5f9] dark:bg-[#07090e] text-slate-900 dark:text-slate-100 overflow-hidden font-sans select-none ${
        theme === 'dark' ? 'dark' : ''
      }`}
    >
      {/* 1. Глобальная панель навигации */}
      <HeaderNav
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        isSidebarOpen={isSidebarOpen}
      />

      {/* 2. Рабочее пространство */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Иерархия скважин (боковая панель) */}
        <div
          className={`h-full transition-all duration-300 ease-in-out overflow-hidden shrink-0 z-20 ${
            isSidebarOpen ? 'w-64 sm:w-72 opacity-100' : 'w-0 opacity-0 pointer-events-none'
          }`}
        >
          <div className="w-64 sm:w-72 h-full">
            <SidebarTree />
          </div>
        </div>

        {/* Главная рабочая плоскость */}
        <main className="flex-1 flex flex-col overflow-hidden relative bg-white dark:bg-[#0b0e17]">
          {/* Инженерная командная строка */}
          <WorkspaceRibbon
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onOpenImportModal={() => setIsImportModalOpen(true)}
            onOpenExportModal={() => setIsExportModalOpen(true)}
            onOpenGeoModal={() => setIsGeoModalOpen(true)}
          />

          {/* Рабочие окна */}
          <div className="flex-1 overflow-hidden relative">
            {/* Split View: Ликвидирован лишний ярус шапки, переключатель 3D/2D встроен прямо во вьюпорт */}
            {viewMode === 'split' && (
              <div className="w-full h-full grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
                <div className="lg:col-span-7 h-full flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-[#171c2b] relative overflow-hidden">
                  {visualSubTab === '3d' ? (
                    <Trajectory3D visualSubTab={visualSubTab} onSubTabChange={setVisualSubTab} />
                  ) : (
                    <Projections2D visualSubTab={visualSubTab} onSubTabChange={setVisualSubTab} />
                  )}
                </div>

                <div className="lg:col-span-5 h-full overflow-hidden">
                  <SurveyLogTable />
                </div>
              </div>
            )}

            {viewMode === 'trajectory' && (
              <div className="w-full h-full flex flex-col">
                <TrajectoryWorkspace />
              </div>
            )}

            {viewMode === 'table' && (
              <div className="w-full h-full flex flex-col">
                <SurveyLogTable />
              </div>
            )}

            {viewMode === 'analytics' && (
              <div className="w-full h-full flex flex-col">
                <SensorQCDashboard />
              </div>
            )}

            {viewMode === 'anticollision' && (
              <div className="w-full h-full flex flex-col">
                <AntiCollisionScan />
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Уведомления */}
      {notification && (
        <div
          className={`fixed bottom-8 right-4 z-50 px-3 py-1.5 rounded-md border shadow-xl flex items-center gap-2 text-3xs font-mono transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-50 dark:bg-[#0c2419] border-emerald-500/40 text-emerald-800 dark:text-emerald-300'
              : notification.type === 'warning'
              ? 'bg-amber-50 dark:bg-[#291e0a] border-amber-500/40 text-amber-800 dark:text-amber-300'
              : notification.type === 'error'
              ? 'bg-rose-50 dark:bg-[#2e1014] border-rose-500/40 text-rose-800 dark:text-rose-300'
              : 'bg-white dark:bg-[#121626] border-slate-200 dark:border-[#202742] text-slate-800 dark:text-slate-200'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          ) : notification.type === 'warning' ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          ) : (
            <Info className="w-3.5 h-3.5 text-sky-500 shrink-0" />
          )}
          <span>{notification.message}</span>
          <button
            onClick={dismissNotification}
            className="ml-1 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 3. Статус-бар */}
      <StatusBar />

      {/* Модалки */}
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