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
    <div className="w-full h-full flex flex-col select-none overflow-hidden font-mono text-xs transition-colors bg-white dark:bg-[#0b0e17] text-slate-800 dark:text-slate-200">
      {/* Строка поиска и фильтрации */}
      <div className="h-8 px-2.5 flex items-center justify-between gap-3 shrink-0 border-b border-slate-200 dark:border-[#1a2030] bg-slate-50/80 dark:bg-[#0e111c]">
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchStations')}
            className="w-full bg-transparent text-3xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 text-3xs">
          <button
            onClick={() => setFilterWarningOnly((prev) => !prev)}
            title={isRu ? 'Показать только замеры с отклонениями QC' : 'Show QC deviations only'}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded transition-colors border ${
              filterWarningOnly
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 font-semibold'
                : 'text-slate-500 dark:text-slate-400 border-slate-200 dark:border-[#22293e] hover:bg-slate-200/60 dark:hover:bg-[#161a29]'
            }`}
          >
            <Filter className="w-3 h-3" />
            <span className="hidden md:inline">
              {isRu ? 'Только отклонения' : 'QC Warnings'}
            </span>
          </button>

          <span className="text-slate-400 border-l border-slate-200 dark:border-[#1e2538] pl-2 font-mono">
            {filteredStations.length} / {stations.length}
          </span>
        </div>
      </div>

      {/* Основная таблица замеров */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-right border-collapse text-3xs font-mono">
          <thead className="sticky top-0 z-10 border-b border-slate-200 dark:border-[#1a2030] bg-slate-100/90 dark:bg-[#111422] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold select-none">
            <tr>
              <th className="py-1.5 px-1 w-5 text-center"></th>
              <th
                onClick={() => handleSort('md')}
                className="py-1.5 px-2 text-right cursor-pointer hover:text-sky-500 transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>MD ({lenUnit})</span>
                  <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />
                </div>
              </th>
              <th
                onClick={() => handleSort('inc')}
                className="py-1.5 px-2 text-right cursor-pointer hover:text-sky-500 transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Inc (°)</span>
                  <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />
                </div>
              </th>
              <th
                onClick={() => handleSort('azim')}
                className="py-1.5 px-2 text-right cursor-pointer hover:text-sky-500 transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Azim (°)</span>
                  <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />
                </div>
              </th>
              <th
                onClick={() => handleSort('tvd')}
                className="py-1.5 px-2 text-right cursor-pointer hover:text-sky-500 transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>TVD ({lenUnit})</span>
                  <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />
                </div>
              </th>
              <th
                onClick={() => handleSort('northing')}
                className="py-1.5 px-2 text-right cursor-pointer hover:text-sky-500 transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>+N/-S ({lenUnit})</span>
                  <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />
                </div>
              </th>
              <th
                onClick={() => handleSort('easting')}
                className="py-1.5 px-2 text-right cursor-pointer hover:text-sky-500 transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>+E/-W ({lenUnit})</span>
                  <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />
                </div>
              </th>
              <th
                onClick={() => handleSort('dls')}
                className="py-1.5 px-2 text-right cursor-pointer hover:text-sky-500 transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>DLS</span>
                  <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />
                </div>
              </th>
              <th className="py-1.5 px-2 text-right">VS ({lenUnit})</th>
              <th className="py-1.5 px-2 text-right">Btot (nT)</th>
              <th className="py-1.5 px-2 text-right">Dip (°)</th>
              <th className="py-1.5 px-2 text-center">{isRu ? 'Поправки' : 'Corrections'}</th>
              <th className="py-1.5 px-2 text-center">QC</th>
              <th className="py-1.5 px-1 w-5 text-center"></th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 dark:divide-[#151928]">
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

              const rawN = (raw as any).northing ?? (stn.rawValues?.northing ?? stn.northing);
              const rawE = (raw as any).easting ?? (stn.rawValues?.easting ?? stn.easting);
              const rawTvd = (raw as any).tvd ?? (stn.rawValues?.tvd ?? stn.tvd);
              const rawInc = raw.inc;
              const rawAzim = raw.azim;

              const dInc = Number((stn.inc - rawInc).toFixed(2));
              const dAzim = Number((stn.azim - rawAzim).toFixed(2));

              // Точные физические сдвиги координат из-за поправок
              const dN = stn.northing - rawN;
              const dE = stn.easting - rawE;
              const dTvd = stn.tvd - rawTvd;
              const dist3D = Math.hypot(dN, dE, dTvd);
              const distHoriz = Math.hypot(dN, dE);

              return (
                <React.Fragment key={stn.id}>
                  <tr
                    onClick={() => setSelectedStationId(stn.id)}
                    className={`transition-colors cursor-pointer group tabular-nums ${
                      isSelected
                        ? 'bg-sky-500/10 dark:bg-sky-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-[#121624]'
                    }`}
                  >
                    <td className="py-1 px-1 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedRowId(isExpanded ? null : stn.id);
                        }}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3 text-sky-500" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                      </button>
                    </td>

                    <td className="py-1 px-2 font-semibold text-sky-600 dark:text-sky-400">
                      {formatLength(stn.md, unitSystem)}
                    </td>

                    <td className="py-1 px-2">
                      <span>{stn.inc.toFixed(2)}</span>
                      {showDeltaDiff && Math.abs(dInc) > 0.01 && (
                        <span
                          className={`ml-1 text-4xs font-mono font-semibold ${
                            dInc > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                          }`}
                        >
                          {dInc > 0 ? `+${dInc}` : dInc}
                        </span>
                      )}
                    </td>

                    <td className="py-1 px-2">
                      <span>{stn.azim.toFixed(2)}</span>
                      {showDeltaDiff && Math.abs(dAzim) > 0.01 && (
                        <span
                          className={`ml-1 text-4xs font-mono font-semibold ${
                            dAzim > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                          }`}
                        >
                          {dAzim > 0 ? `+${dAzim}` : dAzim}
                        </span>
                      )}
                    </td>

                    <td className="py-1 px-2 text-slate-700 dark:text-slate-300">
                      {formatLength(stn.tvd, unitSystem)}
                    </td>

                    <td className="py-1 px-2 text-slate-600 dark:text-slate-400">
                      {formatLength(stn.northing, unitSystem)}
                    </td>

                    <td className="py-1 px-2 text-slate-600 dark:text-slate-400">
                      {formatLength(stn.easting, unitSystem)}
                    </td>

                    <td className="py-1 px-2">
                      <span
                        className={
                          stn.dls > 5.0
                            ? 'text-rose-600 dark:text-rose-400 font-bold'
                            : stn.dls > 3.0
                            ? 'text-amber-600 dark:text-amber-400 font-medium'
                            : 'text-slate-600 dark:text-slate-400'
                        }
                      >
                        {formatDLS(stn.dls, unitSystem)}
                      </span>
                    </td>

                    <td className="py-1 px-2 text-slate-600 dark:text-slate-400">
                      {formatLength(stn.vs, unitSystem)}
                    </td>

                    <td className="py-1 px-2 text-slate-600 dark:text-slate-300">
                      {Math.round(stn.bTotal)}
                    </td>

                    <td className="py-1 px-2 text-slate-600 dark:text-slate-300">
                      {stn.dipAngle.toFixed(2)}
                    </td>

                    {/* ПОПРАВКИ */}
                    <td className="py-1 px-2 text-center whitespace-nowrap">
                      {stn.appliedCorrections && stn.appliedCorrections.length > 0 ? (
                        <div className="flex items-center justify-center gap-1">
                          {stn.appliedCorrections.map((corr) => (
                            <span
                              key={corr}
                              className={`px-1 py-0.2 rounded font-bold text-4xs uppercase ${
                                corr === 'MSA'
                                  ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/25'
                                  : corr === 'SAG'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25'
                                  : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25'
                              }`}
                              title={corr}
                            >
                              {corr}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-600 text-3xs font-mono">—</span>
                      )}
                    </td>

                    {/* СТАТУС QC */}
                    <td className="py-1 px-2 text-center whitespace-nowrap">
                      {stn.isQcPass ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold text-3xs">
                          OK
                        </span>
                      ) : (
                        <span
                          className="inline-block px-1 py-0.2 rounded text-4xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                          title={stn.qcIssues.join('; ') || 'Отклонение полей от WMM'}
                        >
                          WARN
                        </span>
                      )}
                    </td>

                    {/* Удаление замера */}
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

                  {/* РАСКРЫТАЯ СТРОКА: Строгий паспорт замера с профессиональной терминологией ННБ */}
                  {isExpanded && (
                    <tr className="bg-slate-50/90 dark:bg-[#0d101a] border-y border-slate-200 dark:border-[#1a2030]">
                      <td colSpan={14} className="p-2.5">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-3xs">

                          {/* БЛОК 1: СДВИГ СТВОЛА ОТ ПОПРАВОК */}
                          <div className="p-2.5 rounded bg-white dark:bg-[#121624] border border-slate-200 dark:border-[#1e2538] flex flex-col justify-between">
                            <div>
                              <div className="text-4xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-[#1a2030] pb-1 mb-1.5 flex justify-between items-center">
                                <span>{isRu ? '1. Сдвиг ствола от поправок' : '1. Shift due to Corrections'}</span>
                                <span className="text-slate-400 text-4xs">MD: {formatLength(stn.md, unitSystem)} {lenUnit}</span>
                              </div>
                              <table className="w-full text-right text-3xs border-collapse">
                                <thead>
                                  <tr className="text-slate-400 text-4xs uppercase border-b border-slate-100 dark:border-[#161a26]">
                                    <th className="text-left py-0.5 font-medium">{isRu ? 'Координата' : 'Coordinate'}</th>
                                    <th className="py-0.5 font-medium">{isRu ? 'Без поправок' : 'Raw'}</th>
                                    <th className="py-0.5 font-medium">{isRu ? 'С поправками' : 'Corrected'}</th>
                                    <th className="py-0.5 font-bold text-sky-600 dark:text-sky-400">{isRu ? 'Сдвиг (Δ)' : 'Shift (Δ)'}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-[#161a26] font-mono">
                                  <tr>
                                    <td className="text-left py-1 text-slate-500 font-semibold">{isRu ? 'Север (+N)' : 'North (+N)'}</td>
                                    <td className="py-1 text-slate-600 dark:text-slate-400">{formatLength(rawN, unitSystem)}</td>
                                    <td className="py-1 text-slate-800 dark:text-slate-200 font-semibold">{formatLength(stn.northing, unitSystem)}</td>
                                    <td className="py-1 font-bold text-slate-700 dark:text-slate-300">
                                      {dN >= 0 ? `+${formatLength(dN, unitSystem)}` : formatLength(dN, unitSystem)}
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="text-left py-1 text-slate-500 font-semibold">{isRu ? 'Восток (+E)' : 'East (+E)'}</td>
                                    <td className="py-1 text-slate-600 dark:text-slate-400">{formatLength(rawE, unitSystem)}</td>
                                    <td className="py-1 text-slate-800 dark:text-slate-200 font-semibold">{formatLength(stn.easting, unitSystem)}</td>
                                    <td className="py-1 font-bold text-slate-700 dark:text-slate-300">
                                      {dE >= 0 ? `+${formatLength(dE, unitSystem)}` : formatLength(dE, unitSystem)}
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="text-left py-1 text-slate-500 font-semibold">{isRu ? 'Ист. глубина (TVD)' : 'Depth (TVD)'}</td>
                                    <td className="py-1 text-slate-600 dark:text-slate-400">{formatLength(rawTvd, unitSystem)}</td>
                                    <td className="py-1 text-slate-800 dark:text-slate-200 font-semibold">{formatLength(stn.tvd, unitSystem)}</td>
                                    <td className={`py-1 font-bold ${Math.abs(dTvd) > 0.05 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                      {dTvd >= 0 ? `+${formatLength(dTvd, unitSystem)}` : formatLength(dTvd, unitSystem)}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>

                            {/* Результирующие сдвиги ствола */}
                            <div className="pt-1.5 mt-1 border-t border-slate-100 dark:border-[#1a2030] flex flex-col gap-1 font-mono text-4xs">
                              <div className="flex justify-between items-center text-slate-500">
                                <span>{isRu ? 'Сдвиг в плане (ΔHoriz):' : 'Plan shift (ΔHoriz):'} <strong className="text-slate-700 dark:text-slate-300">{formatLength(distHoriz, unitSystem)} {lenUnit}</strong></span>
                                <span>{isRu ? 'Сдвиг по верт. (ΔTVD):' : 'TVD shift (ΔTVD):'} <strong className="text-emerald-600 dark:text-emerald-400">{dTvd >= 0 ? `+${formatLength(dTvd, unitSystem)}` : formatLength(dTvd, unitSystem)} {lenUnit}</strong></span>
                              </div>
                              <div className="flex justify-between items-center bg-slate-50 dark:bg-[#161a26] px-1.5 py-0.5 rounded border border-slate-200/60 dark:border-[#1e2538]">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">{isRu ? 'РЕЗУЛЬТИРУЮЩИЙ 3D-СДВИГ:' : 'TOTAL 3D SPATIAL SHIFT:'}</span>
                                <span className="font-bold text-sky-600 dark:text-sky-400 text-3xs">{formatLength(dist3D, unitSystem)} {lenUnit}</span>
                              </div>
                            </div>
                          </div>

                          {/* БЛОК 2: ПОПРАВКИ К УГЛАМ MWD */}
                          <div className="p-2.5 rounded bg-white dark:bg-[#121624] border border-slate-200 dark:border-[#1e2538] flex flex-col justify-between">
                            <div>
                              <div className="text-4xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-[#1a2030] pb-1 mb-1.5 flex justify-between items-center">
                                <span>{isRu ? '2. Поправки к углам MWD' : '2. MWD Angle Corrections'}</span>
                                <span className="text-slate-500 font-semibold">{stn.appliedCorrections.join(' + ') || 'Raw'}</span>
                              </div>
                              <table className="w-full text-right text-3xs border-collapse">
                                <thead>
                                  <tr className="text-slate-400 text-4xs uppercase border-b border-slate-100 dark:border-[#161a26]">
                                    <th className="text-left py-0.5 font-medium">{isRu ? 'Параметр' : 'Parameter'}</th>
                                    <th className="py-0.5 font-medium">{isRu ? 'Без поправок' : 'Raw'}</th>
                                    <th className="py-0.5 font-medium">{isRu ? 'С поправками' : 'Corrected'}</th>
                                    <th className="py-0.5 font-bold text-sky-600 dark:text-sky-400">{isRu ? 'Поправка (Δ)' : 'Delta (Δ)'}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-[#161a26] font-mono">
                                  <tr>
                                    <td className="text-left py-1 text-slate-500 font-semibold">{isRu ? 'Зенитный (Inc)' : 'Inclination (Inc)'}</td>
                                    <td className="py-1 text-amber-600 dark:text-amber-400">{rawInc.toFixed(2)}°</td>
                                    <td className="py-1 text-slate-800 dark:text-slate-200 font-semibold">{stn.inc.toFixed(2)}°</td>
                                    <td className="py-1 font-bold text-sky-600 dark:text-sky-400">
                                      {dInc > 0 ? `+${dInc}` : dInc}°
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="text-left py-1 text-slate-500 font-semibold">{isRu ? 'Азимут (Azim)' : 'Azimuth (Azim)'}</td>
                                    <td className="py-1 text-amber-600 dark:text-amber-400">{rawAzim.toFixed(2)}°</td>
                                    <td className="py-1 text-slate-800 dark:text-slate-200 font-semibold">{stn.azim.toFixed(2)}°</td>
                                    <td className="py-1 font-bold text-sky-600 dark:text-sky-400">
                                      {dAzim > 0 ? `+${dAzim}` : dAzim}°
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <div className="pt-1.5 mt-1 border-t border-slate-100 dark:border-[#1a2030] flex justify-between text-4xs text-slate-500 font-mono">
                              <span>{isRu ? 'Интенсивность искривления (DLS):' : 'Dogleg severity (DLS):'}</span>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">{formatDLS(stn.dls, unitSystem)} {dlsUnit}</span>
                            </div>
                          </div>

                          {/* БЛОК 3: АКСЕЛЕРОМЕТРЫ — КАЖДАЯ ОСЬ ОТДЕЛЬНО */}
                          <div className="p-2.5 rounded bg-white dark:bg-[#121624] border border-slate-200 dark:border-[#1e2538] flex flex-col justify-between">
                            <div>
                              <div className="text-4xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-[#1a2030] pb-1 mb-1.5 flex justify-between items-center">
                                <span>{isRu ? '3. Акселерометры (G)' : '3. Accelerometers'}</span>
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">Gtot: {stn.gTotal.toFixed(4)} g</span>
                              </div>
                              <div className="space-y-1 font-mono text-3xs">
                                <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                                  <span className="text-slate-400">{isRu ? 'Ось Gx (поперечная):' : 'Axis Gx:'}</span>
                                  <span>{stn.sensor.gx.toFixed(4)} g</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                                  <span className="text-slate-400">{isRu ? 'Ось Gy (поперечная):' : 'Axis Gy:'}</span>
                                  <span>{stn.sensor.gy.toFixed(4)} g</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                                  <span className="text-slate-400">{isRu ? 'Ось Gz (продольная):' : 'Axis Gz (axial):'}</span>
                                  <span className="font-semibold text-slate-800 dark:text-slate-200">{stn.sensor.gz.toFixed(4)} g</span>
                                </div>
                              </div>
                            </div>
                            <div className="pt-1.5 mt-1 border-t border-slate-100 dark:border-[#1a2030] flex justify-between text-4xs font-mono">
                              <span className="text-slate-400">{isRu ? 'Невязка поля |Gtot - Gref|:' : 'Gravity delta ΔG:'}</span>
                              <span className={`font-semibold ${Math.abs(stn.deltaG) > 0.005 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                {stn.deltaG > 0 ? `+${stn.deltaG.toFixed(4)}` : stn.deltaG.toFixed(4)} g
                              </span>
                            </div>
                          </div>

                          {/* БЛОК 4: МАГНИТОМЕТРЫ — КАЖДАЯ ОСЬ ОТДЕЛЬНО */}
                          <div className="p-2.5 rounded bg-white dark:bg-[#121624] border border-slate-200 dark:border-[#1e2538] flex flex-col justify-between">
                            <div>
                              <div className="text-4xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-[#1a2030] pb-1 mb-1.5 flex justify-between items-center">
                                <span>{isRu ? '4. Магнитометры (B)' : '4. Magnetometers'}</span>
                                <span className="text-sky-600 dark:text-sky-400 font-bold">Btot: {Math.round(stn.bTotal)} nT</span>
                              </div>
                              <div className="space-y-1 font-mono text-3xs">
                                <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                                  <span className="text-slate-400">{isRu ? 'Ось Bx (поперечная):' : 'Axis Bx:'}</span>
                                  <span>{Math.round(stn.sensor.bx)} nT</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                                  <span className="text-slate-400">{isRu ? 'Ось By (поперечная):' : 'Axis By:'}</span>
                                  <span>{Math.round(stn.sensor.by)} nT</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                                  <span className="text-slate-400">{isRu ? 'Ось Bz (осевая намагн.):' : 'Axis Bz (axial):'}</span>
                                  <span className="font-semibold text-sky-600 dark:text-sky-400">{Math.round(stn.sensor.bz)} nT</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-[#161a26] pt-0.5">
                                  <span className="text-slate-400">{isRu ? 'Магнитный угол (Dip):' : 'Dip Angle:'}</span>
                                  <span className="font-semibold text-slate-800 dark:text-slate-200">{stn.dipAngle.toFixed(2)}°</span>
                                </div>
                              </div>
                            </div>
                            <div className="pt-1.5 mt-1 border-t border-slate-100 dark:border-[#1a2030] flex justify-between text-4xs font-mono">
                              <span className="text-slate-400">{isRu ? 'Невязки ΔB / ΔDip:' : 'Residuals ΔB / ΔDip:'}</span>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {stn.deltaB > 0 ? `+${Math.round(stn.deltaB)}` : Math.round(stn.deltaB)} nT | {stn.deltaDip > 0 ? `+${Number(stn.deltaDip).toFixed(2)}` : Number(stn.deltaDip).toFixed(2)}°
                              </span>
                            </div>
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