import React, { useState, useMemo } from 'react';
import { useWellbore } from '@/context/WellboreContext';
import { SurveyStation } from '@/types';
import { formatLength, formatDLS } from '@/utils/directionalMath';
import {
  ChevronDown,
  ChevronRight,
  Search,
  ArrowUpDown,
  Trash2,
  Filter,
} from 'lucide-react';

export const SurveyLogTable: React.FC = () => {
  const {
    stations,
    rawStations,
    unitSystem,
    showDeltaDiff,
    deleteStation,
    selectedStationId,
    setSelectedStationId,
    language,
    t,
  } = useWellbore();

  const [search, setSearch] = useState('');
  const [filterWarningOnly, setFilterWarningOnly] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);

  const [sortField, setSortField] = useState<keyof SurveyStation>('md');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const handleSort = (field: keyof SurveyStation) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const filteredStations = useMemo(() => {
    return stations
      .filter((s) => {
        if (filterWarningOnly && s.isQcPass) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          s.md.toString().includes(q) ||
          s.inc.toString().includes(q) ||
          s.azim.toString().includes(q) ||
          s.id.toString().includes(q)
        );
      })
      .sort((a, b) => {
        const valA = (a[sortField] as any) ?? 0;
        const valB = (b[sortField] as any) ?? 0;
        return sortAsc ? valA - valB : valB - valA;
      });
  }, [stations, search, filterWarningOnly, sortField, sortAsc]);

  const lenUnit = unitSystem === 'metric' ? 'm' : 'ft';
  const dlsUnit = unitSystem === 'metric' ? '°/30m' : '°/100ft';
  const isRu = language === 'ru';

  return (
    <div className="w-full h-full flex flex-col select-none overflow-hidden font-mono text-xs transition-colors bg-white dark:bg-[#090a10] text-slate-800 dark:text-slate-200">
      {/* Table Filter / Search Sub-Header */}
      <div className="h-9 px-3 flex items-center justify-between gap-3 shrink-0 border-b border-slate-200 dark:border-[#171c2b] bg-slate-50/80 dark:bg-[#0c0e17]">
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchStations')}
            className="w-full bg-transparent text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Warnings Only Filter */}
          <button
            onClick={() => setFilterWarningOnly((prev) => !prev)}
            title={isRu ? 'Показать только замеры с отклонениями' : 'Show out-of-spec stations only'}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-3xs font-medium transition-colors border ${
              filterWarningOnly
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                : 'text-slate-500 dark:text-slate-400 border-transparent hover:bg-slate-200 dark:hover:bg-[#181d2e]'
            }`}
          >
            <Filter className="w-3 h-3" />
            <span className="hidden md:inline">
              {isRu ? 'Только отклонения' : 'Warnings only'}
            </span>
          </button>

          <span className="text-3xs text-slate-400 border-l border-slate-200 dark:border-[#1b2136] pl-2">
            {filteredStations.length} / {stations.length}
          </span>
        </div>
      </div>

      {/* Main High-Density Grid */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-right border-collapse text-xs">
          {/* Sticky Header */}
          <thead className="sticky top-0 z-10 border-b border-slate-200 dark:border-[#1c2235] bg-slate-100 dark:bg-[#0c0f18] text-slate-600 dark:text-slate-400 text-3xs uppercase tracking-wider font-semibold">
            <tr>
              <th className="py-2 px-1 w-6 text-center"></th>
              <th
                onClick={() => handleSort('md')}
                className="py-2 px-2 text-right cursor-pointer hover:text-sky-500 transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>MD ({lenUnit})</span>
                  <ArrowUpDown className="w-2.5 h-2.5 opacity-50" />
                </div>
              </th>
              <th
                onClick={() => handleSort('inc')}
                className="py-2 px-2 text-right cursor-pointer hover:text-sky-500 transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Inc (°)</span>
                  <ArrowUpDown className="w-2.5 h-2.5 opacity-50" />
                </div>
              </th>
              <th
                onClick={() => handleSort('azim')}
                className="py-2 px-2 text-right cursor-pointer hover:text-sky-500 transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Azim (°)</span>
                  <ArrowUpDown className="w-2.5 h-2.5 opacity-50" />
                </div>
              </th>
              <th
                onClick={() => handleSort('tvd')}
                className="py-2 px-2 text-right cursor-pointer hover:text-sky-500 transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>TVD ({lenUnit})</span>
                  <ArrowUpDown className="w-2.5 h-2.5 opacity-50" />
                </div>
              </th>
              <th
                onClick={() => handleSort('northing')}
                className="py-2 px-2 text-right cursor-pointer hover:text-sky-500 transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>+N/-S ({lenUnit})</span>
                  <ArrowUpDown className="w-2.5 h-2.5 opacity-50" />
                </div>
              </th>
              <th
                onClick={() => handleSort('easting')}
                className="py-2 px-2 text-right cursor-pointer hover:text-sky-500 transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>+E/-W ({lenUnit})</span>
                  <ArrowUpDown className="w-2.5 h-2.5 opacity-50" />
                </div>
              </th>
              <th
                onClick={() => handleSort('dls')}
                className="py-2 px-2 text-right cursor-pointer hover:text-sky-500 transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>DLS ({dlsUnit})</span>
                  <ArrowUpDown className="w-2.5 h-2.5 opacity-50" />
                </div>
              </th>
              <th className="py-2 px-2 text-right">VS ({lenUnit})</th>
              <th className="py-2 px-2 text-right">Btot (nT)</th>
              <th className="py-2 px-2 text-right">Dip (°)</th>
              {/* Dedicated Applied Corrections Column */}
              <th className="py-2 px-2 text-center">
                {isRu ? 'Поправки' : 'Corrections'}
              </th>
              <th className="py-2 px-2 w-6 text-center"></th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-100 dark:divide-[#141828]">
            {filteredStations.map((stn) => {
              const isSelected = selectedStationId === stn.id;
              const isExpanded = expandedRowId === stn.id;
              const raw = rawStations.find((r) => r.id === stn.id) || stn.rawValues || {
                inc: stn.inc,
                azim: stn.azim,
                tvd: stn.tvd,
                northing: stn.northing,
                easting: stn.easting,
                bTotal: stn.bTotal,
                gTotal: stn.gTotal,
                dipAngle: stn.dipAngle,
              };

              const rawB = (raw as any).bTotal ?? stn.bTotal;
              const rawG = (raw as any).gTotal ?? stn.gTotal;
              const rawDip = (raw as any).dipAngle ?? stn.dipAngle;

              const dInc = Number((stn.inc - raw.inc).toFixed(2));
              const dAzim = Number((stn.azim - raw.azim).toFixed(2));
              const dB = Number((stn.bTotal - rawB).toFixed(1));

              return (
                <React.Fragment key={stn.id}>
                  <tr
                    onClick={() => setSelectedStationId(stn.id)}
                    className={`transition-colors cursor-pointer group ${
                      isSelected
                        ? 'bg-sky-50 dark:bg-sky-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-[#111422]'
                    }`}
                  >
                    {/* Expand Chevron */}
                    <td className="py-1 px-1 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedRowId(isExpanded ? null : stn.id);
                        }}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                      </button>
                    </td>

                    {/* MD */}
                    <td className="py-1 px-2 font-semibold text-sky-600 dark:text-sky-400">
                      {formatLength(stn.md, unitSystem)}
                    </td>

                    {/* Inc + optional subtle delta */}
                    <td className="py-1 px-2">
                      <span>{stn.inc.toFixed(2)}</span>
                      {showDeltaDiff && Math.abs(dInc) > 0.01 && (
                        <span
                          className={`ml-1 text-3xs font-mono opacity-80 ${
                            dInc > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                          }`}
                        >
                          {dInc > 0 ? `+${dInc}` : dInc}
                        </span>
                      )}
                    </td>

                    {/* Azim + optional subtle delta */}
                    <td className="py-1 px-2">
                      <span>{stn.azim.toFixed(2)}</span>
                      {showDeltaDiff && Math.abs(dAzim) > 0.01 && (
                        <span
                          className={`ml-1 text-3xs font-mono opacity-80 ${
                            dAzim > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                          }`}
                        >
                          {dAzim > 0 ? `+${dAzim}` : dAzim}
                        </span>
                      )}
                    </td>

                    {/* TVD */}
                    <td className="py-1 px-2 text-slate-700 dark:text-slate-300">
                      {formatLength(stn.tvd, unitSystem)}
                    </td>

                    {/* Northing */}
                    <td className="py-1 px-2 text-slate-600 dark:text-slate-400">
                      {formatLength(stn.northing, unitSystem)}
                    </td>

                    {/* Easting */}
                    <td className="py-1 px-2 text-slate-600 dark:text-slate-400">
                      {formatLength(stn.easting, unitSystem)}
                    </td>

                    {/* DLS */}
                    <td className="py-1 px-2">
                      <span
                        className={
                          stn.dls > 5.0
                            ? 'text-rose-600 dark:text-rose-400 font-semibold'
                            : stn.dls > 3.0
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-600 dark:text-slate-400'
                        }
                      >
                        {formatDLS(stn.dls, unitSystem)}
                      </span>
                    </td>

                    {/* VS */}
                    <td className="py-1 px-2 text-slate-600 dark:text-slate-400">
                      {formatLength(stn.vs, unitSystem)}
                    </td>

                    {/* Btotal */}
                    <td className="py-1 px-2">
                      <span
                        className={
                          Math.abs(stn.deltaB) > 200
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-600 dark:text-slate-400'
                        }
                      >
                        {Math.round(stn.bTotal)}
                      </span>
                    </td>

                    {/* Dip Angle */}
                    <td className="py-1 px-2">
                      <span
                        className={
                          Math.abs(stn.deltaDip) > 0.3
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-600 dark:text-slate-400'
                        }
                      >
                        {stn.dipAngle.toFixed(2)}
                      </span>
                    </td>

                    {/* Applied Corrections Column */}
                    <td className="py-1 px-2 text-center">
                      {stn.appliedCorrections && stn.appliedCorrections.length > 0 ? (
                        <div className="flex items-center justify-center gap-1">
                          {stn.appliedCorrections.map((corr) => (
                            <span
                              key={corr}
                              className={`px-1.5 py-0.5 rounded text-3xs font-semibold ${
                                corr === 'MSA'
                                  ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30'
                                  : corr === 'SAG'
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                                  : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30'
                              }`}
                            >
                              {corr}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-600 text-3xs">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-1 px-1 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteStation(stn.id);
                        }}
                        title={isRu ? 'Удалить замер' : 'Delete station'}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-opacity p-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>

                  {/* Expanded Telemetry Details */}
                  {isExpanded && (
                    <tr className="bg-slate-50/90 dark:bg-[#0c0e17] border-y border-slate-200 dark:border-[#1a1f33]">
                      <td colSpan={13} className="py-3 px-6">
                        <div className="flex flex-col gap-2 text-2xs text-slate-600 dark:text-slate-300">
                          <div className="flex flex-wrap items-center gap-6">
                            <div>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {isRu ? 'Акселерометры (G-axes):' : 'Accelerometers (G-axes):'}
                              </span>{' '}
                              Gx: {stn.sensor.gx.toFixed(4)} | Gy: {stn.sensor.gy.toFixed(4)} | Gz:{' '}
                              {stn.sensor.gz.toFixed(4)} g |{' '}
                              <strong className="text-emerald-600 dark:text-emerald-400">
                                Gtot: {stn.gTotal.toFixed(4)} g
                              </strong>
                            </div>

                            <div>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {isRu ? 'Магнитометры (B-axes):' : 'Magnetometers (B-axes):'}
                              </span>{' '}
                              Bx: {stn.sensor.bx} | By: {stn.sensor.by} | {isRu ? 'Bz (Осевая ось):' : 'Bz (Axial):'}{' '}
                              <strong className="text-sky-600 dark:text-sky-400">{stn.sensor.bz} nT</strong> |{' '}
                              <strong>Btot: {stn.bTotal} nT</strong>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-3xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-[#171c2b]">
                            <div>
                              <span>{isRu ? 'Исходные (сырые) углы:' : 'Raw MWD Angles:'}</span>{' '}
                              <span className="text-amber-600 dark:text-amber-400 font-mono">
                                Inc {raw.inc.toFixed(2)}° | Azim {raw.azim.toFixed(2)}°
                              </span>
                            </div>

                            <div>
                              <span>{isRu ? 'Поправка MSA/SAG:' : 'Applied Delta (MSA/SAG):'}</span>{' '}
                              <span className="text-sky-600 dark:text-sky-400 font-mono">
                                ΔInc {dInc > 0 ? `+${dInc}` : dInc}° | ΔAzim {dAzim > 0 ? `+${dAzim}` : dAzim}°
                              </span>
                            </div>

                            {stn.appliedCorrections.length > 0 && (
                              <div className="flex items-center gap-1">
                                <span>{isRu ? 'Примененные поправки:' : 'Applied Corrections:'}</span>
                                {stn.appliedCorrections.map((corr) => (
                                  <span
                                    key={corr}
                                    className="px-1.5 py-0.5 rounded text-3xs font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-300 border border-sky-500/20"
                                  >
                                    {corr}
                                  </span>
                                ))}
                              </div>
                            )}

                            {stn.qcIssues.length > 0 && (
                              <div className="text-rose-500 font-medium">
                                {isRu ? 'Предупреждения QC:' : 'QC Diagnostics:'} {stn.qcIssues.join('; ')}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
