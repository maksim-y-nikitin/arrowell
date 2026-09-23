import React, { useState } from 'react';
import { useWellbore } from '@/context/WellboreContext';
import {
  Search,
  ChevronDown,
  ChevronRight,
  Layers,
  Grid3X3,
  CircleDot,
  AlignLeft,
  ChevronsDownUp,
} from 'lucide-react';

export const SidebarTree: React.FC = () => {
  const { fields, activeWell, setActiveWellById, language } = useWellbore();
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
    <aside className="w-[216px] h-full flex flex-col select-none shrink-0 bg-[var(--bg-1)] border-r border-[var(--line)] text-[var(--fg-1)] transition-colors overflow-hidden">
      {/* Sidebar Header with Actions */}
      <div className="p-2 border-b border-[var(--line)] flex items-center justify-between shrink-0">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--fg-2)]">
          Hierarchy
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={expandAll}
            title="Expand all nodes"
            className="w-5 h-5 rounded-[var(--r1)] text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)] grid place-items-center transition-colors"
          >
            <AlignLeft className="w-3 h-3" />
          </button>
          <button
            onClick={collapseAll}
            title="Collapse all nodes"
            className="w-5 h-5 rounded-[var(--r1)] text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)] grid place-items-center transition-colors"
          >
            <ChevronsDownUp className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Filter Search Input */}
      <div className="p-2 border-b border-[var(--line)] shrink-0">
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2 top-2 text-[var(--fg-3)] pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={language === 'ru' ? 'Поиск скважины...' : 'Filter wells...'}
            className="w-full h-[26px] bg-[var(--bg-2)] border border-transparent rounded-[var(--r1)] pl-7 pr-2 text-[12px] text-[var(--fg-0)] placeholder-[var(--fg-3)] outline-none focus:bg-[var(--bg-1)] focus:border-[var(--accent)] transition-all"
          />
        </div>
      </div>

      {/* Hierarchical Tree Body */}
      <div className="flex-1 overflow-y-auto py-1 text-[12px]">
        {fields.map((field, fieldIdx) => {
          const isFieldExpanded = expandedNodes[field.id] ?? false;

          return (
            <React.Fragment key={field.id}>
              {/* Optional Divider Between Fields */}
              {fieldIdx > 0 && <div className="h-[1px] bg-[var(--line)] my-2 mx-3" />}

              {/* Field Level Item */}
              <div
                onClick={(e) => toggleExpand(field.id, e)}
                className="flex items-center gap-1.5 px-2 py-1 text-[var(--fg-0)] font-semibold hover:bg-[var(--bg-2)] cursor-pointer transition-colors"
              >
                <span className="text-[var(--fg-3)] shrink-0">
                  {isFieldExpanded ? (
                    <ChevronDown className="w-2.5 h-2.5" />
                  ) : (
                    <ChevronRight className="w-2.5 h-2.5" />
                  )}
                </span>
                <Layers className="w-3 h-3 text-[var(--fg-2)] shrink-0" />
                <span className="truncate flex-1">{field.name}</span>
              </div>

              {/* Pads Level */}
              {isFieldExpanded &&
                field.pads.map((pad) => {
                  const isPadExpanded = expandedNodes[pad.id] ?? false;

                  return (
                    <div key={pad.id}>
                      <div
                        onClick={(e) => toggleExpand(pad.id, e)}
                        className="flex items-center gap-1.5 pl-5 pr-2 py-1 text-[var(--fg-1)] hover:bg-[var(--bg-2)] hover:text-[var(--fg-0)] cursor-pointer transition-colors"
                      >
                        <span className="text-[var(--fg-3)] shrink-0">
                          {isPadExpanded ? (
                            <ChevronDown className="w-2.5 h-2.5" />
                          ) : (
                            <ChevronRight className="w-2.5 h-2.5" />
                          )}
                        </span>
                        <Grid3X3 className="w-3 h-3 text-[var(--fg-3)] shrink-0" />
                        <span className="truncate flex-1">{pad.name}</span>
                      </div>

                      {/* Wells Under Pad */}
                      {isPadExpanded &&
                        pad.wells
                          .filter((w) =>
                            search ? w.name.toLowerCase().includes(search.toLowerCase()) : true
                          )
                          .map((well) => {
                            const isActive = activeWell.id === well.id;

                            return (
                              <div
                                key={well.id}
                                onClick={() => setActiveWellById(well.id)}
                                className={`flex items-center justify-between pr-2.5 py-1 cursor-pointer transition-colors border-l-2 ${
                                  isActive
                                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)] pl-[34px] font-medium'
                                    : 'border-transparent pl-9 text-[var(--fg-1)] hover:bg-[var(--bg-2)] hover:text-[var(--fg-0)]'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                                  <CircleDot
                                    className={`w-3 h-3 shrink-0 ${
                                      isActive ? 'text-[var(--accent)]' : 'text-[var(--fg-3)]'
                                    }`}
                                  />
                                  <span className="truncate">{well.name}</span>
                                </div>

                                {/* Status Pip Indicator */}
                                <span
                                  className={`pip ml-2 ${
                                    well.status === 'active'
                                      ? 'ok'
                                      : well.status === 'warning'
                                      ? 'warn'
                                      : 'crit'
                                  }`}
                                  title={`Status: ${well.status}`}
                                />
                              </div>
                            );
                          })}
                    </div>
                  );
                })}
            </React.Fragment>
          );
        })}
      </div>
    </aside>
  );
};