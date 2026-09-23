import React from 'react';
import { useWellbore, type ViewLayoutMode } from '@/context/WellboreContext';
import {
  LayoutGrid,
  Box,
  TableProperties,
  Activity,
  ShieldCheck,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeft,
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
  } = useWellbore();

  const isRu = language === 'ru';

  // Navigation tab configuration matching active language
  const navItems: { id: ViewLayoutMode; label: string; icon: React.ReactNode }[] = [
    {
      id: 'split',
      label: isRu ? 'Сводный вид' : 'Overview',
      icon: <LayoutGrid className="w-3.5 h-3.5" />,
    },
    {
      id: 'trajectory',
      label: isRu ? 'Траектория' : 'Trajectory',
      icon: <Box className="w-3.5 h-3.5" />,
    },
    {
      id: 'table',
      label: isRu ? 'Инклинометрия' : 'Survey',
      icon: <TableProperties className="w-3.5 h-3.5" />,
    },
    {
      id: 'analytics',
      label: isRu ? 'Диагностика QC' : 'QC',
      icon: <Activity className="w-3.5 h-3.5" />,
    },
    {
      id: 'anticollision',
      label: isRu ? 'Сближение' : 'Anti-Collision',
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <header className="topbar">
      {/* Brand & Sidebar Collapse Toggle */}
      <div className="brand">
        <button
          onClick={onToggleSidebar}
          title={
            isSidebarOpen
              ? isRu
                ? 'Скрыть структуру'
                : 'Collapse hierarchy'
              : isRu
              ? 'Показать структуру'
              : 'Expand hierarchy'
          }
          className="iconbtn mr-1"
        >
          {isSidebarOpen ? (
            <PanelLeftClose className="w-3.5 h-3.5" />
          ) : (
            <PanelLeft className="w-3.5 h-3.5" />
          )}
        </button>
        <span className="brand-name">ArroWell</span>
      </div>

      {/* Raw Database Breadcrumbs (No translation modifications) */}
      <nav className="crumbs">
        <span className="crumb">{activeField.name}</span>
        <span className="sep">›</span>
        <span className="crumb">{activePad.name}</span>
        <span className="sep">›</span>
        <span className="active">{activeWell.name}</span>
      </nav>

      {/* Reactive Language Navigation Tabs */}
      <nav className="tabs">
        {navItems.map((item) => {
          const isActive = viewMode === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setViewMode(item.id)}
              className={`tab ${isActive ? 'on' : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Right Controls: Theme, Unit, and Language Toggles */}
      <div className="topright">
        <button
          onClick={toggleTheme}
          title={
            theme === 'dark'
              ? isRu
                ? 'Включить светлую тему'
                : 'Switch to Light theme'
              : isRu
              ? 'Включить тёмную тему'
              : 'Switch to Dark theme'
          }
          className="themebtn"
        >
          {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={() => setUnitSystem(unitSystem === 'metric' ? 'imperial' : 'metric')}
          title={isRu ? 'Единицы измерения (Метры / Футы)' : 'Toggle Unit System (Meters / Feet)'}
          className="tag"
        >
          {unitSystem === 'metric' ? 'M' : 'FT'}
        </button>

        <button
          onClick={() => setLanguage(language === 'ru' ? 'en' : 'ru')}
          title={isRu ? 'Сменить язык' : 'Toggle Language'}
          className="tag"
        >
          {language.toUpperCase()}
        </button>
      </div>
    </header>
  );
};