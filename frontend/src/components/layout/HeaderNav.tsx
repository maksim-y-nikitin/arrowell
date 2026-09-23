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

  const navItems: { id: ViewLayoutMode; label: string; icon: React.ReactNode }[] = [
    { id: 'split', label: t('splitView'), icon: <LayoutGrid className="w-3.5 h-3.5" /> },
    { id: 'trajectory', label: t('trajectoryView'), icon: <Box className="w-3.5 h-3.5" /> },
    { id: 'table', label: t('tableView'), icon: <TableProperties className="w-3.5 h-3.5" /> },
    { id: 'analytics', label: t('analyticsView'), icon: <Activity className="w-3.5 h-3.5" /> },
    { id: 'anticollision', label: t('anticollisionView'), icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  ];

  return (
    <header className="h-10 border-b px-2.5 flex items-center justify-between shrink-0 select-none z-30 transition-colors bg-white dark:bg-[#0a0d14] border-slate-200 dark:border-[#171c2b] text-slate-800 dark:text-slate-200 font-mono text-xs">
      {/* Левая часть: Brand + Breadcrumbs */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSidebar}
          title={isSidebarOpen ? 'Скрыть структуру' : 'Показать структуру'}
          className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#161a29] transition-colors"
        >
          {isSidebarOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
        </button>

        <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200 dark:border-[#1c2236]">
          <div className="w-5 h-5 rounded bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
            <Compass className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-xs tracking-tight text-slate-900 dark:text-white">
            ArroWell
          </span>
        </div>

        {/* Навигационные «хлебные крошки» */}
        <div className="hidden sm:flex items-center gap-1.5 text-3xs text-slate-500 dark:text-slate-400">
          <span>{activeField.name}</span>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span>{activePad.name}</span>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">{activeWell.name}</span>
        </div>
      </div>

      {/* Центр: Единый стандартизированный переключатель видов (Segmented Control) */}
      <div className="inline-flex items-center p-0.5 rounded-md bg-slate-100 dark:bg-[#121624] border border-slate-200 dark:border-[#1a2032]">
        {navItems.map((item) => {
          const isActive = viewMode === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setViewMode(item.id)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-3xs font-medium transition-all ${
                isActive
                  ? 'bg-white dark:bg-[#1c2235] text-sky-600 dark:text-sky-400 font-semibold shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {item.icon}
              <span className="hidden md:inline">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Правая часть: Системные тулы */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Включить светлую тему' : 'Включить темную тему'}
          className="p-1 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#161a29] transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={() => setUnitSystem(unitSystem === 'metric' ? 'imperial' : 'metric')}
          className="px-1.5 py-0.5 rounded text-3xs font-semibold bg-slate-100 dark:bg-[#141827] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1c2237] transition-colors"
        >
          {unitSystem === 'metric' ? 'M' : 'FT'}
        </button>

        <button
          onClick={() => setLanguage(language === 'ru' ? 'en' : 'ru')}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-3xs font-medium bg-slate-100 dark:bg-[#141827] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1c2237] transition-colors"
        >
          <Languages className="w-3 h-3 text-slate-400" />
          <span>{language.toUpperCase()}</span>
        </button>
      </div>
    </header>
  );
};