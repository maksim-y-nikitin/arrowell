import React, { useState } from 'react';
import { useWellbore } from '@/context/WellboreContext';
import {
  FolderTree,
  Grid3X3,
  CircleDot,
  Layers,
  Search,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

export const SidebarTree: React.FC = () => {
  const { fields, activeWell, setActiveWellById, language, t } = useWellbore();
  const [search, setSearch] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'field-samotlor': true,
    'pad-10': true,
    'field-north-sea': true,
    'pad-bravo': true,
  });

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    fields.forEach((f) => {
      next[f.id] = true;
      f.pads.forEach((p) => {
        next[p.id] = true;
      });
    });
    setExpandedNodes(next);
  };

  const collapseAll = () => {
    setExpandedNodes({});
  };

  return (
    <aside className="w-64 sm:w-72 h-full flex flex-col select-none shrink-0 z-20 border-r transition-colors bg-slate-50 dark:bg-[#0c0e16] border-slate-200 dark:border-[#171c2b] text-slate-700 dark:text-slate-300">
      {/* Header with Search */}
      <div className="p-2.5 border-b border-slate-200 dark:border-[#171c2b] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
            <FolderTree className="w-3.5 h-3.5 text-sky-500" />
            <span>{t('wellHierarchy')}</span>
          </div>
          <div className="flex items-center gap-1 text-3xs font-mono">
            <button
              onClick={expandAll}
              className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 px-1 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-[#161a29]"
            >
              {t('expandAll')}
            </button>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <button
              onClick={collapseAll}
              className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 px-1 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-[#161a29]"
            >
              {t('collapseAll')}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={language === 'ru' ? 'Поиск скважины...' : 'Filter wells...'}
            className="w-full bg-white dark:bg-[#121624] border border-slate-200 dark:border-[#1c2236] rounded-md pl-7 pr-2 py-1 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* Tree View Body */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-xs">
        {fields.map((field) => {
          const isFieldExpanded = expandedNodes[field.id] ?? false;

          return (
            <div key={field.id} className="space-y-0.5">
              {/* Field Level Item */}
              <div
                onClick={(e) => toggleExpand(field.id, e)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-slate-200/70 dark:hover:bg-[#141828] cursor-pointer text-slate-800 dark:text-slate-200 font-semibold"
              >
                <span className="text-slate-400">
                  {isFieldExpanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                </span>
                <Layers className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                <span className="truncate">{field.name}</span>
              </div>

              {/* Pads */}
              {isFieldExpanded && (
                <div className="pl-4 space-y-0.5 border-l border-slate-200 dark:border-[#171c2b] ml-3">
                  {field.pads.map((pad) => {
                    const isPadExpanded = expandedNodes[pad.id] ?? false;

                    return (
                      <div key={pad.id} className="space-y-0.5">
                        {/* Pad Item */}
                        <div
                          onClick={(e) => toggleExpand(pad.id, e)}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-slate-200/70 dark:hover:bg-[#141828] cursor-pointer text-slate-700 dark:text-slate-300"
                        >
                          <span className="text-slate-400">
                            {isPadExpanded ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                          </span>
                          <Grid3X3 className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{pad.name}</span>
                        </div>

                        {/* Wells under Pad */}
                        {isPadExpanded && (
                          <div className="pl-4 space-y-0.5 border-l border-slate-200 dark:border-[#171c2b] ml-3">
                            {pad.wells
                              .filter((w) =>
                                search
                                  ? w.name.toLowerCase().includes(search.toLowerCase())
                                  : true
                              )
                              .map((well) => {
                                const isActive = activeWell.id === well.id;

                                return (
                                  <div
                                    key={well.id}
                                    onClick={() => setActiveWellById(well.id)}
                                    className={`flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition-colors ${
                                      isActive
                                        ? 'bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 font-semibold'
                                        : 'hover:bg-slate-200/60 dark:hover:bg-[#141828] text-slate-600 dark:text-slate-400'
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5 truncate">
                                      <CircleDot
                                        className={`w-3 h-3 shrink-0 ${
                                          isActive
                                            ? 'text-sky-500 animate-pulse'
                                            : 'text-slate-400'
                                        }`}
                                      />
                                      <span className="truncate">{well.name}</span>
                                    </div>

                                    {/* Quiet status dot instead of bulky badge */}
                                    <div
                                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                        well.status === 'active'
                                          ? 'bg-emerald-500'
                                          : well.status === 'warning'
                                          ? 'bg-amber-500'
                                          : 'bg-slate-400'
                                      }`}
                                      title={well.status}
                                    />
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
