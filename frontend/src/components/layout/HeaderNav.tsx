import React from 'react';
import { useWellbore, type ViewLayoutMode } from '@/context/WellboreContext';
import {
  Compass,
  LayoutGrid,
  Box,
  TableProperties,
  Activity,
  ShieldCheck,
  PanelLeftClose,
  PanelLeft,
  Sun,
  Moon,
  Languages,
} from 'lucide-react';

interface HeaderNavProps {
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
}

export const HeaderNav: React.FC<HeaderNavProps> = ({ onToggleSidebar, isSidebarOpen }) => {
  const {
    activeField,
    activePad,
    activeWell,
    viewMode,
    setViewMode,
    unitSystem,
    setUnitSystem,
    language,
    setLanguage,
    theme,
    toggleTheme,
    t,
  } = useWellbore();

  const navItems: { id: ViewLayoutMode; label: string; icon: React.ReactNode; tooltip: string }[] = [
    {
      id: 'split',
      label: t('splitView'),
      icon: <LayoutGrid className="w-3.5 h-3.5" />,
      tooltip: language === 'ru' ? 'Сводный вид: 3D + Таблица замеров' : 'Overview: 3D + Survey Table',
    },
    {
      id: 'trajectory',
      label: t('trajectoryView'),
      icon: <Box className="w-3.5 h-3.5" />,
      tooltip: language === 'ru' ? 'Визуализация траектории скважины (3D / 2D)' : 'Wellbore Trajectory Visualizer (3D / 2D)',
    },
    {
      id: 'table',
      label: t('tableView'),
      icon: <TableProperties className="w-3.5 h-3.5" />,
      tooltip: language === 'ru' ? 'Инклинометрия: журнал замеров и поправок' : 'Directional survey log and corrections',
    },
    {
      id: 'analytics',
      label: t('analyticsView'),
      icon: <Activity className="w-3.5 h-3.5" />,
      tooltip: language === 'ru' ? 'Контроль качества MWD датчиков и расчет MSA' : 'MWD Sensor QC Residuals & MSA',
    },
    {
      id: 'anticollision',
      label: t('anticollisionView'),
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
      tooltip: language === 'ru' ? 'Анализ сближения стволов и фактор разделения (ISCWSA)' : 'Anti-Collision Proximity Scan (ISCWSA)',
    },
  ];

  return (
    <header className="h-11 border-b px-3 flex items-center justify-between shrink-0 select-none z-30 transition-colors bg-white dark:bg-[#0b0d14] border-slate-200 dark:border-[#1a1e2f] text-slate-800 dark:text-slate-200">
      {/* Left: Sidebar Toggle + Brand + Breadcrumb */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={onToggleSidebar}
          title={isSidebarOpen ? (language === 'ru' ? 'Скрыть структуру' : 'Collapse hierarchy') : (language === 'ru' ? 'Показать структуру' : 'Expand hierarchy')}
          className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#161a29] transition-colors"
        >
          {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
        </button>

        <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200 dark:border-[#1c2236]">
          <div className="w-6 h-6 rounded-md bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
            <Compass className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-xs tracking-tight text-slate-900 dark:text-white">
            ArroWell
          </span>
        </div>

        {/* Minimal Breadcrumbs */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
          <span>{activeField.name}</span>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span>{activePad.name}</span>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">{activeWell.name}</span>
        </div>
      </div>

      {/* Center: View Switcher */}
      <div className="flex items-center bg-slate-100 dark:bg-[#121624] p-0.5 rounded-lg border border-slate-200 dark:border-[#1b2135]">
        {navItems.map((item) => {
          const isActive = viewMode === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setViewMode(item.id)}
              title={item.tooltip}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors duration-150 ${
                isActive
                  ? 'bg-white dark:bg-[#1e2439] text-sky-600 dark:text-sky-400 border border-slate-200/80 dark:border-slate-700/60'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
              }`}
            >
              {item.icon}
              <span className="hidden md:inline">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right: Theme Toggle, Unit System, Language */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={toggleTheme}
          title={
            theme === 'dark'
              ? (language === 'ru' ? 'Включить светлую тему' : 'Switch to Light Mode')
              : (language === 'ru' ? 'Включить темную тему' : 'Switch to Dark Mode')
          }
          className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#161a29] transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={() => setUnitSystem(unitSystem === 'metric' ? 'imperial' : 'metric')}
          title={
            language === 'ru'
              ? `Текущие единицы: ${unitSystem === 'metric' ? 'Метры (°/30м)' : 'Футы (°/100ft)'}. Нажмите для переключения.`
              : `Current units: ${unitSystem === 'metric' ? 'Meters (°/30m)' : 'Feet (°/100ft)'}. Click to switch.`
          }
          className="px-2 py-1 rounded-md text-xs font-mono font-semibold bg-slate-100 dark:bg-[#141827] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1c2237] transition-colors"
        >
          {unitSystem === 'metric' ? 'M' : 'FT'}
        </button>

        <button
          onClick={() => setLanguage(language === 'ru' ? 'en' : 'ru')}
          title={
            language === 'ru'
              ? 'Сменить язык на English'
              : 'Switch language to Russian'
          }
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-[#141827] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1c2237] transition-colors"
        >
          <Languages className="w-3 h-3 text-slate-400" />
          <span>{language.toUpperCase()}</span>
        </button>
      </div>
    </header>
  );
};