/**
 * UI workstation preferences context: theme, localization, units, layout, and notifications.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { UnitSystem, Language, Theme } from '@/types';
import { translations, TranslationKey } from '@/utils/i18n';

export type ViewLayoutMode = 'split' | 'trajectory' | 'table' | 'analytics' | 'anticollision';

export interface NotificationState {
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

interface UIContextType {
  unitSystem: UnitSystem;
  language: Language;
  theme: Theme;
  viewMode: ViewLayoutMode;
  showDeltaDiff: boolean;
  notification: NotificationState | null;
  t: (key: TranslationKey) => string;
  setUnitSystem: (u: UnitSystem) => void;
  setLanguage: (l: Language) => void;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setViewMode: (v: ViewLayoutMode) => void;
  setShowDeltaDiff: (val: boolean | ((prev: boolean) => boolean)) => void;
  notify: (msg: string, type?: NotificationState['type']) => void;
  dismissNotification: () => void;
}

const UIContext = createContext<UIContextType | null>(null);

export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [language, setLanguage] = useState<Language>('ru');
  const [theme, setThemeState] = useState<Theme>('dark');
  const [viewMode, setViewMode] = useState<ViewLayoutMode>('split');
  const [showDeltaDiff, setShowDeltaDiff] = useState<boolean>(true);
  const [notification, setNotification] = useState<NotificationState | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => setThemeState(newTheme), []);
  const toggleTheme = useCallback(() => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')), []);

  const notify = useCallback((message: string, type: NotificationState['type'] = 'info') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 4000);
  }, []);

  const dismissNotification = useCallback(() => setNotification(null), []);

  const t = useCallback(
    (key: TranslationKey) => {
      const dict = translations[language] || translations.en;
      return dict[key] || translations.en[key] || key;
    },
    [language]
  );

  return (
    <UIContext.Provider
      value={{
        unitSystem,
        language,
        theme,
        viewMode,
        showDeltaDiff,
        notification,
        t,
        setUnitSystem,
        setLanguage,
        setTheme,
        toggleTheme,
        setViewMode,
        setShowDeltaDiff,
        notify,
        dismissNotification,
      }}
    >
      {children}
    </UIContext.Provider>
  );
};

export const useUI = () => {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
};