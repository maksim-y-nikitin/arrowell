import React, { useState, useMemo } from 'react';
import { useWellbore } from '@/context/WellboreContext';
import { SurveyStation } from '@/types';
import { formatLength, formatDLS } from '@/utils/directionalMath';
import {
  TableProperties,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Trash2,
} from 'lucide-react';

type SortKey = keyof SurveyStation;

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
  const [sortField, setSortField] = useState<SortKey>('md');
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (field: SortKey) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
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
  const passCount = stations.filter((s) => s.isQcPass).length;

  const Th = ({
    col,
    label,
    center = false,
  }: {
    col: SortKey;
    label: string;
    center?: boolean;
  }) => (
    <th
      className={`${center ? 'center' : ''} sortable ${
        sortField === col ? 'sorted' : ''
      }`}
      onClick={() => handleSort(col)}
    >
      <span className="th-inner">
        <span>{label}</span>
        <span className="sort-ind">
          {sortField === col ? (sortAsc ? '▲' : '▼') : '⇅'}
        </span>
      </span>
    </th>
  );

  return (
    <div className="w-full h-full flex flex-col select-none overflow-hidden bg-[var(--bg-1)] text-[var(--fg-0)]">
      <div className="h-9 px-3 flex items-center justify-between gap-3 shrink-0 border-b border-[var(--line)] bg-[var(--bg-2)]">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 font-semibold t-sm font-sans text-[var(--fg-0)]">
            <TableProperties className="w-3.5 h-3.5 text-[var(--fg-2)]" />
            <span>{t('tableView') || 'Directional Survey'}</span>
          </div>
          <span className="pill ok">
            {passCount} / {stations.length} {isRu ? 'в норме' : 'in spec'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2 top-2 text-[var(--fg-3)] pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isRu ? 'Поиск…' : 'Search…'}
              className="h-6 w-32 sm:w-40 bg-[var(--bg-1)] border border-[var(--line)] rounded-[var(--r1)] pl-6 pr-1.5 t-xs text-[var(--fg-0)] placeholder-[var(--fg-3)] outline-none focus:border-[var(--accent)]"
            />
          </div>

          <button
            type="button"
            onClick={() => setFilterWarningOnly((v) => !v)}
            aria-pressed={filterWarningOnly}
            title={
              filterWarningOnly
                ? isRu
                  ? 'Фильтр активен: только отклонения'
                  : 'Active filter: warnings only'
                : isRu
                ? 'Показать только отклонения'
                : 'Show warnings only'
            }
            className={`filter-toggle ${filterWarningOnly ? 'on' : ''}`}
          >
            <Filter />
            <span className="hidden sm:inline">
              {isRu ? 'Отклонения' : 'Warnings'}
            </span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="survey-table">
          <colgroup>
            <col className="c-expand" />
            <col className="c-md" />
            <col className="c-inc" />
            <col className="c-azim" />
            <col className="c-tvd" />
            <col className="c-n" />
            <col className="c-e" />
            <col className="c-dls" />
            <col className="c-vs" />
            <col className="c-btot" />
            <col className="c-dip" />
            <col className="c-corr" />
            <col className="c-qc" />
            <col className="c-del" />
          </colgroup>

          <thead>
            <tr>
              <th className="center"></th>
              <Th col="md"       label={`MD (${lenUnit})`} />
              <Th col="inc"      label="Inc (°)" />
              <Th col="azim"     label="Azim (°)" />
              <Th col="tvd"      label={`TVD (${lenUnit})`} />
              <Th col="northing" label={`+N/−S (${lenUnit})`} />
              <Th col="easting"  label={`+E/−W (${lenUnit})`} />
              <Th col="dls"      label="DLS" />
              <th><span className="th-inner">VS ({lenUnit})</span></th>
              <Th col="bTotal"   label="Btot (nT)" />
              <Th col="dipAngle" label="Dip (°)" />
              <th className="center">
                <span className="th-inner">{isRu ? 'Поправки' : 'Corrections'}</span>
              </th>
              <th className="center">
                <span className="th-inner">QC</span>
              </th>
              <th className="center"></th>
            </tr>
          </thead>

          <tbody>
            {filteredStations.map((stn) => {
              const isSelected = selectedStationId === stn.id;
              const isExpanded = expandedRowId === stn.id;

              const raw =
                rawStations.find((r) => r.id === stn.id) ||
                stn.rawValues || {
                  inc: stn.inc,
                  azim: stn.azim,
                  tvd: stn.tvd,
                  northing: stn.northing,
                  easting: stn.easting,
                  bTotal: stn.bTotal,
                  gTotal: stn.gTotal,
                  dipAngle: stn.dipAngle,
                };

              const rawN   = (raw as any).northing ?? stn.rawValues?.northing ?? stn.northing;
              const rawE   = (raw as any).easting  ?? stn.rawValues?.easting  ?? stn.easting;
              const rawTvd = (raw as any).tvd      ?? stn.rawValues?.tvd      ?? stn.tvd;
              const rawInc  = raw.inc;
              const rawAzim = raw.azim;

              const dInc  = Number((stn.inc  - rawInc).toFixed(2));
              const dAzim = Number((stn.azim - rawAzim).toFixed(2));
              const dN    = stn.northing - rawN;
              const dE    = stn.easting  - rawE;
              const dTvd  = stn.tvd      - rawTvd;
              const dist3D    = Math.hypot(dN, dE, dTvd);
              const distHoriz = Math.hypot(dN, dE);

              return (
                <React.Fragment key={stn.id}>
                  <tr
                    className={isSelected ? 'sel' : ''}
                    onClick={() => setSelectedStationId(stn.id)}
                  >
                    <td className="center">
                      <button
                        type="button"
                        className="rowbtn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedRowId(isExpanded ? null : stn.id);
                        }}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-[var(--accent)]" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </td>

                    <td className="md">{formatLength(stn.md, unitSystem)}</td>

                    <td>
                      {stn.inc.toFixed(2)}
                      {showDeltaDiff && Math.abs(dInc) > 0.01 && (
                        <span
                          className={`ml-1 t-2xs font-semibold ${
                            dInc > 0 ? 'text-[var(--ok)]' : 'text-[var(--fg-3)]'
                          }`}
                        >
                          {dInc > 0 ? `+${dInc}` : dInc}
                        </span>
                      )}
                    </td>

                    <td>
                      {stn.azim.toFixed(2)}
                      {showDeltaDiff && Math.abs(dAzim) > 0.01 && (
                        <span
                          className={`ml-1 t-2xs font-semibold ${
                            dAzim > 0 ? 'text-[var(--ok)]' : 'text-[var(--fg-3)]'
                          }`}
                        >
                          {dAzim > 0 ? `+${dAzim}` : dAzim}
                        </span>
                      )}
                    </td>

                    <td className="strong">{formatLength(stn.tvd, unitSystem)}</td>
                    <td className="muted">{formatLength(stn.northing, unitSystem)}</td>
                    <td className="muted">{formatLength(stn.easting, unitSystem)}</td>

                    <td
                      className={
                        stn.dls > 5.0
                          ? 'dls-crit'
                          : stn.dls > 3.0
                          ? 'dls-warn'
                          : 'muted'
                      }
                    >
                      {formatDLS(stn.dls, unitSystem)}
                    </td>

                    <td className="muted">{formatLength(stn.vs, unitSystem)}</td>
                    <td>{Math.round(stn.bTotal)}</td>
                    <td>{stn.dipAngle.toFixed(2)}</td>

                    <td className="center">
                      {stn.appliedCorrections && stn.appliedCorrections.length > 0 ? (
                        <span className="pill acc">
                          {stn.appliedCorrections.join('+')}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>

                    <td className={stn.isQcPass ? 'ok' : 'warn'}>
                      {stn.isQcPass ? 'OK' : 'WARN'}
                    </td>

                    <td className="center">
                      <button
                        type="button"
                        className="rowbtn del"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteStation(stn.id);
                        }}
                        title={isRu ? 'Удалить замер' : 'Delete station'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="expanded">
                      <td colSpan={14}>
                        <div className="passport">
                          <div className="pp-card">
                            <div className="pp-head">
                              <span>{isRu ? '1. Сдвиг координат' : '1. Position Shifts'}</span>
                              <span className="pp-tag acc">
                                MD {formatLength(stn.md, unitSystem)} {lenUnit}
                              </span>
                            </div>

                            <div className="pp-list">
                              <div className="pp-row header">
                                <span className="k">Axis</span>
                                <span className="v">Raw</span>
                                <span className="v">Corr</span>
                                <span className="v">Δ</span>
                              </div>

                              <div className="pp-row">
                                <span className="k">+N</span>
                                <span className="v muted">
                                  {formatLength(rawN, unitSystem)}
                                </span>
                                <span className="v strong">
                                  {formatLength(stn.northing, unitSystem)}
                                </span>
                                <span className="v acc">
                                  {dN >= 0 ? '+' : ''}
                                  {formatLength(dN, unitSystem)}
                                </span>
                              </div>

                              <div className="pp-row">
                                <span className="k">+E</span>
                                <span className="v muted">
                                  {formatLength(rawE, unitSystem)}
                                </span>
                                <span className="v strong">
                                  {formatLength(stn.easting, unitSystem)}
                                </span>
                                <span className="v acc">
                                  {dE >= 0 ? '+' : ''}
                                  {formatLength(dE, unitSystem)}
                                </span>
                              </div>

                              <div className="pp-row">
                                <span className="k">TVD</span>
                                <span className="v muted">
                                  {formatLength(rawTvd, unitSystem)}
                                </span>
                                <span className="v strong">
                                  {formatLength(stn.tvd, unitSystem)}
                                </span>
                                <span className="v acc">
                                  {dTvd >= 0 ? '+' : ''}
                                  {formatLength(dTvd, unitSystem)}
                                </span>
                              </div>
                            </div>

                            <div className="pp-foot">
                              <span className="k">ΔHoriz</span>
                              <span className="v">
                                {formatLength(distHoriz, unitSystem)} {lenUnit}
                              </span>
                            </div>
                            <div className="pp-foot">
                              <span className="k">
                                {isRu ? '3D сдвиг' : 'Total 3D'}
                              </span>
                              <span className="v acc">
                                {formatLength(dist3D, unitSystem)} {lenUnit}
                              </span>
                            </div>
                          </div>

                          <div className="pp-card">
                            <div className="pp-head">
                              <span>
                                {isRu ? '2. Поправки углов' : '2. Angle Corrections'}
                              </span>
                              <span className="pp-tag acc">
                                {stn.appliedCorrections.join('+') || 'Raw'}
                              </span>
                            </div>

                            <div className="pp-list">
                              <div className="pp-row header">
                                <span className="k">Angle</span>
                                <span className="v">Raw</span>
                                <span className="v">Corr</span>
                                <span className="v">Δ</span>
                              </div>

                              <div className="pp-row">
                                <span className="k">Inc</span>
                                <span className="v muted">
                                  {rawInc.toFixed(2)}°
                                </span>
                                <span className="v strong">
                                  {stn.inc.toFixed(2)}°
                                </span>
                                <span className="v acc">
                                  {dInc > 0 ? '+' : ''}
                                  {dInc}°
                                </span>
                              </div>

                              <div className="pp-row">
                                <span className="k">Azim</span>
                                <span className="v muted">
                                  {rawAzim.toFixed(2)}°
                                </span>
                                <span className="v strong">
                                  {stn.azim.toFixed(2)}°
                                </span>
                                <span className="v acc">
                                  {dAzim > 0 ? '+' : ''}
                                  {dAzim}°
                                </span>
                              </div>
                            </div>

                            <div className="pp-foot">
                              <span className="k">DLS</span>
                              <span className="v">
                                {formatDLS(stn.dls, unitSystem)} {dlsUnit}
                              </span>
                            </div>
                          </div>

                          <div className="pp-card">
                            <div className="pp-head">
                              <span>
                                {isRu ? '3. Акселерометры' : '3. Accelerometers'}
                              </span>
                              <span className="pp-tag ok">
                                Gtot {stn.gTotal.toFixed(4)} g
                              </span>
                            </div>

                            <div className="pp-list">
                              <div className="pp-row">
                                <span className="k">Gx</span>
                                <span className="v strong">
                                  {stn.sensor.gx.toFixed(4)} g
                                </span>
                              </div>
                              <div className="pp-row">
                                <span className="k">Gy</span>
                                <span className="v strong">
                                  {stn.sensor.gy.toFixed(4)} g
                                </span>
                              </div>
                              <div className="pp-row">
                                <span className="k">Gz</span>
                                <span className="v strong">
                                  {stn.sensor.gz.toFixed(4)} g
                                </span>
                              </div>
                            </div>

                            <div className="pp-foot">
                              <span className="k">ΔG</span>
                              <span
                                className={`v ${
                                  Math.abs(stn.deltaG) > 0.005 ? 'warn' : 'ok'
                                }`}
                              >
                                {stn.deltaG > 0 ? '+' : ''}
                                {stn.deltaG.toFixed(4)} g
                              </span>
                            </div>
                          </div>

                          <div className="pp-card">
                            <div className="pp-head">
                              <span>
                                {isRu ? '4. Магнитометры' : '4. Magnetometers'}
                              </span>
                              <span className="pp-tag acc">
                                Btot {Math.round(stn.bTotal)} nT
                              </span>
                            </div>

                            <div className="pp-list">
                              <div className="pp-row">
                                <span className="k">Bx</span>
                                <span className="v strong">
                                  {Math.round(stn.sensor.bx)} nT
                                </span>
                              </div>
                              <div className="pp-row">
                                <span className="k">By</span>
                                <span className="v strong">
                                  {Math.round(stn.sensor.by)} nT
                                </span>
                              </div>
                              <div className="pp-row">
                                <span className="k">Bz</span>
                                <span className="v acc">
                                  {Math.round(stn.sensor.bz)} nT
                                </span>
                              </div>
                            </div>

                            <div className="pp-foot">
                              <span className="k">ΔB</span>
                              <span className="v">
                                {stn.deltaB > 0 ? '+' : ''}
                                {Math.round(stn.deltaB)} nT
                              </span>
                            </div>
                            <div className="pp-foot">
                              <span className="k">ΔDip</span>
                              <span className="v">
                                {stn.deltaDip > 0 ? '+' : ''}
                                {stn.deltaDip.toFixed(2)}°
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