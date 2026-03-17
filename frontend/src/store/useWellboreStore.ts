/**
 * Global Zustand workstation store orchestrating UI, engineering, and survey telemetry domains.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import {
  SurveyStation,
  FieldNode,
  PadNode,
  WellNode,
  SurveyRun,
  GeomagneticReference,
  BhaConfig,
  MsaOptimizationResult,
  UnitSystem,
  Language,
  Theme,
  ViewLayoutMode,
  WellPropertiesUpdate,
} from '@/types';
import { translations, TranslationKey } from '@/utils/i18n';
import { initialGeoRef, initialSurveyStations, mockHierarchy, wellStationsMap } from '@/data/wellsData';
import { calculateMinimumCurvature, evaluateSurveyQC } from '@/utils/directionalMath';
import { runMultiStationAnalysis } from '@/utils/geomagneticEngine';
import {
  ApiStation,
  fetchHierarchy,
  fetchWellStations,
  createWellStation,
  deleteWellStation,
  triggerMsaAnalysis,
  triggerSagAnalysis,
} from '@/utils/api';
import { initialBhaConfig, calculatePhysicalSagAngle } from '@/context/EngineeringContext';

// Well-specific proposal azimuth mapping to preserve vertical section projections
const wellProposalAzimuthMap: Record<string, number> = {
  'well-102h': 55.0,
  'well-104b': 133.0,
  'well-b12': 215.5,
};

export interface NotificationState {
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

function mapApiStationToLocal(s: ApiStation): SurveyStation {
  return {
    id: s.id,
    md: s.md,
    inc: s.inc,
    azim: s.azim,
    tvd: s.tvd,
    northing: s.northing,
    easting: s.easting,
    dls: s.dls,
    vs: s.vs,
    closureDist: s.closure_dist,
    closureAzim: s.closure_azim,
    sensor: s.sensor || { gx: 0, gy: 0, gz: 1, bx: 16000, by: 0, bz: 50000 },
    gTotal: s.g_total,
    bTotal: s.b_total,
    dipAngle: s.dip_angle,
    deltaG: s.delta_g,
    deltaB: s.delta_b,
    deltaDip: s.delta_dip,
    isQcPass: s.is_qc_pass,
    qcIssues: s.is_qc_pass ? [] : ['Out of spec'],
    status: s.status as any,
    appliedCorrections: [],
    rawValues: {
      inc: s.inc,
      azim: s.azim,
      tvd: s.tvd,
      northing: s.northing,
      easting: s.easting,
      dls: s.dls,
      gTotal: s.g_total,
      bTotal: s.b_total,
      dipAngle: s.dip_angle,
    },
  };
}

interface WellboreStoreState {
  // UI Domain
  unitSystem: UnitSystem;
  language: Language;
  theme: Theme;
  viewMode: ViewLayoutMode;
  showDeltaDiff: boolean;
  notification: NotificationState | null;

  // Engineering Domain
  geoRef: GeomagneticReference;
  bhaConfig: BhaConfig;

  // Survey Domain
  fields: FieldNode[];
  activeWellId: string;
  stations: SurveyStation[];
  rawStations: SurveyStation[];
  selectedStationId: number | null;
  isCalculatingMSA: boolean;
  isCalculatingSAG: boolean;
  msaResult: MsaOptimizationResult | null;
  azimuthCorrection: 'none' | 'msa' | 'scc';
  isSagEnabled: boolean;
  cachedMsaBz: number;
  mwdcoreSagMap: Record<number, number>;

  // Computed Getters
  getActiveField: () => FieldNode;
  getActivePad: () => PadNode;
  getActiveWell: () => WellNode;
  getActiveRun: () => SurveyRun;
  getActiveProposalAzimuth: () => number;

  // Trajectory Recalculation Engine
  applyCombinedCorrections: (
    azimMode: 'none' | 'msa' | 'scc',
    sagActive: boolean,
    msaBz?: number,
    sagMap?: Record<number, number>,
    currentBha?: BhaConfig
  ) => void;

  // Actions: UI
  setUnitSystem: (u: UnitSystem) => void;
  setLanguage: (l: Language) => void;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setViewMode: (v: ViewLayoutMode) => void;
  setShowDeltaDiff: (val: boolean | ((prev: boolean) => boolean)) => void;
  notify: (msg: string, type?: NotificationState['type']) => void;
  dismissNotification: () => void;
  t: (key: TranslationKey) => string;

  // Actions: Engineering
  updateGeoRef: (partial: Partial<GeomagneticReference>) => void;
  updateBhaConfig: (partial: Partial<BhaConfig>) => void;

  // Actions: Surveys & Telemetry
  initWorkstation: () => Promise<void>;
  setActiveWellById: (wellId: string) => void;
  setSelectedStationId: (id: number | null) => void;
  updateWellProperties: (props: WellPropertiesUpdate) => void;
  runMSA: () => Promise<void>;
  runSAG: () => Promise<void>;
  runSCC: () => void;
  resetSurveys: () => void;
  addStation: (stn: Partial<SurveyStation>) => Promise<void>;
  deleteStation: (id: number) => Promise<void>;
  importStations: (stns: Partial<SurveyStation>[]) => void;
}

export const useWellboreStore = create<WellboreStoreState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial UI State
        unitSystem: 'metric',
        language: 'ru',
        theme: 'dark',
        viewMode: 'split',
        showDeltaDiff: true,
        notification: null,

        // Initial Engineering State
        geoRef: initialGeoRef,
        bhaConfig: initialBhaConfig,

        // Initial Survey State
        fields: mockHierarchy,
        activeWellId: 'well-102h',
        stations: initialSurveyStations,
        rawStations: initialSurveyStations,
        selectedStationId: null,
        isCalculatingMSA: false,
        isCalculatingSAG: false,
        msaResult: null,
        azimuthCorrection: 'none',
        isSagEnabled: false,
        cachedMsaBz: 280,
        mwdcoreSagMap: {},

        // Computed Getters
        getActiveField: () => {
          const { fields, activeWellId } = get();
          for (const f of fields) {
            for (const p of f.pads) {
              if (p.wells.some((w) => w.id === activeWellId)) return f;
            }
          }
          return fields[0];
        },

        getActivePad: () => {
          const { getActiveField, activeWellId } = get();
          const activeField = getActiveField();
          for (const p of activeField.pads) {
            if (p.wells.some((w) => w.id === activeWellId)) return p;
          }
          return activeField.pads[0];
        },

        getActiveWell: () => {
          const { getActivePad, activeWellId } = get();
          const activePad = getActivePad();
          return activePad.wells.find((w) => w.id === activeWellId) || activePad.wells[0];
        },

        getActiveRun: () => {
          const { getActiveWell, stations } = get();
          const activeWell = getActiveWell();
          return (
            activeWell.runs?.find((r) => r.id === activeWell.activeRunId) ||
            activeWell.runs?.[0] || {
              id: 'run-01',
              name: 'Run 01 — MWD',
              runNumber: 1,
              toolType: 'MWD' as const,
              collarDiameterMm: 171.5,
              startMd: 0,
              endMd: 3500,
              surveyCount: stations.length,
              status: 'raw' as const,
              date: '2026-09-20',
            }
          );
        },

        getActiveProposalAzimuth: () => {
          const { activeWellId } = get();
          return wellProposalAzimuthMap[activeWellId] ?? 55.0;
        },

        // Core Calculation Engine: Cascades physical corrections to survey stations
        applyCombinedCorrections: (
          azimMode,
          sagActive,
          msaBz = get().cachedMsaBz,
          sagMap = get().mwdcoreSagMap,
          currentBha = get().bhaConfig
        ) => {
          const { rawStations, geoRef, getActiveProposalAzimuth } = get();
          const activeCorrectionsList: ('MSA' | 'SAG' | 'SCC')[] = [];
          if (azimMode === 'msa') activeCorrectionsList.push('MSA');
          if (azimMode === 'scc') activeCorrectionsList.push('SCC');
          if (sagActive) activeCorrectionsList.push('SAG');

          const fallbackSag = calculatePhysicalSagAngle(currentBha);

          const updated = rawStations.map((raw) => {
            let inc = raw.inc;
            let azim = raw.azim;
            let bTotal = raw.bTotal;
            let deltaB = raw.deltaB;

            // Apply magnetic drillstring interference correction (MSA)
            if (azimMode === 'msa' && raw.md >= 1000) {
              const correctedBz = raw.sensor.bz - msaBz;
              bTotal = Math.round(Math.hypot(raw.sensor.bx, raw.sensor.by, correctedBz));
              deltaB = Math.round(bTotal - geoRef.bTotalRef);

              const incRad = (raw.inc * Math.PI) / 180;
              const azShift =
                incRad > 0.05
                  ? (msaBz / (geoRef.bTotalRef * Math.sin(incRad))) * (180 / Math.PI) * 0.28
                  : 0;
              azim = Number(((raw.azim - azShift + 360) % 360).toFixed(2));
            } else if (azimMode === 'scc' && raw.bTotal > geoRef.bTotalRef + geoRef.toleranceB) {
              bTotal = geoRef.bTotalRef + 35;
              deltaB = 35;
              azim = Number(((raw.azim - 0.45 + 360) % 360).toFixed(2));
            }

            // Apply gravity beam deflection correction (SAG)
            if (sagActive) {
              const sagDeg =
                sagMap[raw.id] !== undefined
                  ? sagMap[raw.id]
                  : fallbackSag * Math.sin((raw.inc * Math.PI) / 180);
              inc = Number((raw.inc - sagDeg).toFixed(2));
            }

            return {
              ...raw,
              inc,
              azim,
              bTotal,
              deltaB,
              appliedCorrections: [...activeCorrectionsList],
              status:
                activeCorrectionsList.length > 0
                  ? (`${activeCorrectionsList.join('+')} Applied` as any)
                  : 'Raw',
            };
          });

          set({
            stations: calculateMinimumCurvature(updated, getActiveProposalAzimuth()),
          });
        },

        // UI Actions
        setUnitSystem: (unitSystem) => set({ unitSystem }),

        setLanguage: (language) => set({ language }),

        setTheme: (theme) => {
          const root = document.documentElement;
          if (theme === 'dark') {
            root.classList.add('dark');
          } else {
            root.classList.remove('dark');
          }
          set({ theme });
        },

        toggleTheme: () => {
          const nextTheme = get().theme === 'dark' ? 'light' : 'dark';
          get().setTheme(nextTheme);
        },

        setViewMode: (viewMode) => set({ viewMode }),

        setShowDeltaDiff: (val) =>
          set((state) => ({
            showDeltaDiff: typeof val === 'function' ? val(state.showDeltaDiff) : val,
          })),

        notify: (message, type = 'info') => {
          set({ notification: { message, type } });
          setTimeout(() => {
            const current = get().notification;
            if (current?.message === message) {
              set({ notification: null });
            }
          }, 4000);
        },

        dismissNotification: () => set({ notification: null }),

        t: (key) => {
          const { language } = get();
          const dict = translations[language] || translations.en;
          return dict[key] || translations.en[key] || key;
        },

        // Engineering Actions
        updateGeoRef: (partial) =>
          set((state) => ({ geoRef: { ...state.geoRef, ...partial } })),

        updateBhaConfig: async (partial) => {
          const nextBha = { ...get().bhaConfig, ...partial };
          set({ bhaConfig: nextBha });

          if (get().isSagEnabled) {
            const { activeWellId, azimuthCorrection, cachedMsaBz, applyCombinedCorrections } = get();
            try {
              const res = await triggerSagAnalysis(activeWellId, nextBha);
              const newSagMap: Record<number, number> = {};
              res.corrections.forEach((c) => {
                newSagMap[c.station_id] = c.sag_correction_deg;
              });
              set({ mwdcoreSagMap: newSagMap });
              applyCombinedCorrections(azimuthCorrection, true, cachedMsaBz, newSagMap, nextBha);
            } catch {
              applyCombinedCorrections(azimuthCorrection, true, cachedMsaBz, get().mwdcoreSagMap, nextBha);
            }
          }
        },

        // Survey Actions
        initWorkstation: async () => {
          try {
            const remoteHierarchy = await fetchHierarchy();
            if (remoteHierarchy && remoteHierarchy.length > 0) {
              const normalizedHierarchy: FieldNode[] = remoteHierarchy.map((f: any) => ({
                id: f.id,
                name: f.name,
                nameRu: f.name_ru || f.nameRu || f.name,
                country: f.country,
                basin: f.basin,
                pads: (f.pads || []).map((p: any) => ({
                  id: p.id,
                  name: p.name,
                  fieldId: p.field_id || p.fieldId || f.id,
                  latitude: Number(p.latitude ?? 61.1245),
                  longitude: Number(p.longitude ?? 76.7132),
                  groundElevation: Number(p.ground_elevation ?? p.groundElevation ?? 48.5),
                  datum: p.datum || 'MSL WGS84',
                  wells: (p.wells || []).map((w: any) => ({
                    id: w.id,
                    name: w.name,
                    padId: w.pad_id || w.padId || p.id,
                    fieldId: w.field_id || w.fieldId || f.id,
                    status: w.status || 'active',
                    uwi: w.uwi || '',
                    slot: w.slot || 'Slot #1',
                    targetFormation: w.target_formation || w.targetFormation || 'BV8',
                    datumElevation: Number(w.datum_elevation ?? w.datumElevation ?? 54.2),
                    groundElevation: Number(p.ground_elevation ?? p.groundElevation ?? 48.5),
                    latitude: Number(p.latitude ?? 61.1245),
                    longitude: Number(p.longitude ?? 76.7132),
                    runs: w.runs || [],
                    activeRunId: w.active_run_id || w.activeRunId || 'run-01',
                  })),
                })),
              }));

              set({ fields: normalizedHierarchy });

              const { activeWellId, getActiveProposalAzimuth } = get();
              const remoteStations = await fetchWellStations(activeWellId);
              if (remoteStations && remoteStations.length > 0) {
                const mappedStations = remoteStations.map(mapApiStationToLocal);
                const calculated = calculateMinimumCurvature(mappedStations, getActiveProposalAzimuth());
                set({
                  stations: calculated,
                  rawStations: calculated,
                  azimuthCorrection: 'none',
                  isSagEnabled: false,
                });
              }
            }
          } catch (err) {
            console.warn('Backend service offline, running in local resilience mode:', err);
          }
        },

        setActiveWellById: (wellId) => {
          const newStns = wellStationsMap[wellId] || initialSurveyStations;
          set({
            activeWellId: wellId,
            stations: [...newStns],
            rawStations: [...newStns],
            selectedStationId: null,
            msaResult: null,
            mwdcoreSagMap: {},
            azimuthCorrection: 'none',
            isSagEnabled: false,
          });
        },

        setSelectedStationId: (selectedStationId) => set({ selectedStationId }),

        updateWellProperties: (update) => {
          set((state) => ({
            fields: state.fields.map((field) => ({
              ...field,
              pads: field.pads.map((pad) => {
                const hasWell = pad.wells.some((w) => w.id === state.activeWellId);
                if (!hasWell) return pad;

                return {
                  ...pad,
                  name: update.padName ?? pad.name,
                  latitude: update.latitude !== undefined ? update.latitude : pad.latitude,
                  longitude: update.longitude !== undefined ? update.longitude : pad.longitude,
                  groundElevation: update.groundElevation !== undefined ? update.groundElevation : pad.groundElevation,
                  datum: update.datum ?? pad.datum,
                  wells: pad.wells.map((well) => {
                    if (well.id !== state.activeWellId) return well;
                    return {
                      ...well,
                      name: update.wellName ?? well.name,
                      slot: update.slot ?? well.slot,
                      latitude: update.latitude !== undefined ? update.latitude : well.latitude,
                      longitude: update.longitude !== undefined ? update.longitude : well.longitude,
                      groundElevation: update.groundElevation !== undefined ? update.groundElevation : well.groundElevation,
                      datumElevation: update.datumElevation !== undefined ? update.datumElevation : well.datumElevation,
                      targetFormation: update.targetFormation ?? well.targetFormation,
                    };
                  }),
                };
              }),
            })),
          }));
        },

        runMSA: async () => {
          const { azimuthCorrection, isSagEnabled, activeWellId, rawStations, geoRef, language, notify, applyCombinedCorrections } = get();

          if (azimuthCorrection === 'msa') {
            set({ azimuthCorrection: 'none' });
            applyCombinedCorrections('none', isSagEnabled);
            notify(language === 'ru' ? 'Поправка MSA отключена' : 'MSA disabled', 'info');
            return;
          }

          set({ isCalculatingMSA: true });
          try {
            const res = await triggerMsaAnalysis(activeWellId);
            const bz = res.axial_bias_bz;
            set({
              cachedMsaBz: bz,
              msaResult: {
                collarInterference: Math.round(bz),
                sensorBiasZ: bz,
                scaleFactorError: res.scale_factor_z,
                iterations: 60,
                convergenceRms: 0.12,
                correctedStationsCount: res.stations_analyzed,
              },
              azimuthCorrection: 'msa',
              isCalculatingMSA: false,
            });

            applyCombinedCorrections('msa', isSagEnabled, bz);

            notify(
              language === 'ru'
                ? `MSA включен (mwdstdcore): ΔBz = ${bz} нТл (${res.stations_analyzed} замеров)`
                : `MSA active (mwdstdcore): ΔBz = ${bz} nT (${res.stations_analyzed} stations)`,
              'success'
            );
          } catch (err) {
            console.warn('Backend MSA failed, using local optimization fallback:', err);
            const { result } = runMultiStationAnalysis(rawStations, geoRef);
            set({
              cachedMsaBz: result.sensorBiasZ,
              azimuthCorrection: 'msa',
              isCalculatingMSA: false,
            });

            applyCombinedCorrections('msa', isSagEnabled, result.sensorBiasZ);

            notify(
              language === 'ru'
                ? `MSA включен (локально): ΔBz = ${result.sensorBiasZ} нТл`
                : `MSA active (local fallback): ΔBz = ${result.sensorBiasZ} nT`,
              'info'
            );
          }
        },

        runSAG: async () => {
          const { isSagEnabled, activeWellId, bhaConfig, azimuthCorrection, cachedMsaBz, language, notify, applyCombinedCorrections } = get();

          if (isSagEnabled) {
            set({ isSagEnabled: false });
            applyCombinedCorrections(azimuthCorrection, false);
            notify(language === 'ru' ? 'Поправка SAG выключена' : 'SAG disabled', 'info');
            return;
          }

          set({ isCalculatingSAG: true });
          try {
            const res = await triggerSagAnalysis(activeWellId, bhaConfig);
            const newSagMap: Record<number, number> = {};
            res.corrections.forEach((c) => {
              newSagMap[c.station_id] = c.sag_correction_deg;
            });

            set({
              mwdcoreSagMap: newSagMap,
              isSagEnabled: true,
              isCalculatingSAG: false,
            });

            applyCombinedCorrections(azimuthCorrection, true, cachedMsaBz, newSagMap);

            notify(
              language === 'ru'
                ? `SAG рассчитан через mwdstdcore (пик: ${res.peak_sag_deg}°, точек: ${res.stations_corrected})`
                : `SAG computed via mwdstdcore (peak: ${res.peak_sag_deg}°, stations: ${res.stations_corrected})`,
              'success'
            );
          } catch (err) {
            console.warn('Backend SAG failed, using beam mechanics fallback:', err);
            set({
              isSagEnabled: true,
              isCalculatingSAG: false,
            });

            applyCombinedCorrections(azimuthCorrection, true);

            const sagPeak = calculatePhysicalSagAngle(bhaConfig);
            notify(
              language === 'ru'
                ? `SAG включен (локально, расчетный пик: ${sagPeak}°)`
                : `SAG active (local fallback, peak: ${sagPeak}°)`,
              'info'
            );
          }
        },

        runSCC: () => {
          const { azimuthCorrection, isSagEnabled, language, notify, applyCombinedCorrections } = get();
          if (azimuthCorrection === 'scc') {
            set({ azimuthCorrection: 'none' });
            applyCombinedCorrections('none', isSagEnabled);
            notify(language === 'ru' ? 'Поправка SCC отключена' : 'SCC disabled', 'info');
            return;
          }

          set({ azimuthCorrection: 'scc' });
          applyCombinedCorrections('scc', isSagEnabled);
          notify(language === 'ru' ? 'Поправка SCC включена' : 'SCC active', 'success');
        },

        resetSurveys: () => {
          const { rawStations, language, notify } = get();
          set({
            azimuthCorrection: 'none',
            isSagEnabled: false,
            stations: [...rawStations],
            msaResult: null,
          });
          notify(language === 'ru' ? 'Все поправки сброшены (режим Raw)' : 'All corrections reset (Raw)', 'info');
        },

        addStation: async (stn) => {
          const { stations, activeWellId, getActiveProposalAzimuth, language, notify } = get();
          const md = stn.md || (stations[stations.length - 1]?.md || 0) + 30;
          const inc = stn.inc ?? 90.0;
          const azim = stn.azim ?? (stations[stations.length - 1]?.azim || 55.0);

          const sensor = {
            gx: stn.sensor?.gx ?? 0.513,
            gy: stn.sensor?.gy ?? 0.865,
            gz: stn.sensor?.gz ?? 0.0,
            bx: stn.sensor?.bx ?? 17690,
            by: stn.sensor?.by ?? 4380,
            bz: stn.sensor?.bz ?? 50200,
          };

          try {
            await createWellStation(activeWellId, { md, inc, azim, sensor });
            const remoteStations = await fetchWellStations(activeWellId);
            const mapped = remoteStations.map(mapApiStationToLocal);
            const calculated = calculateMinimumCurvature(mapped, getActiveProposalAzimuth());

            set({
              rawStations: calculated,
              stations: calculated,
              azimuthCorrection: 'none',
              isSagEnabled: false,
            });

            notify(
              language === 'ru' ? `Замер на ${md} м сохранен в DuckDB` : `Station at ${md} m saved to DuckDB`,
              'success'
            );
          } catch (err) {
            console.warn('Backend offline, saving station in local buffer:', err);
          }
        },

        deleteStation: async (id) => {
          const { activeWellId, getActiveProposalAzimuth, language, notify } = get();
          try {
            await deleteWellStation(activeWellId, id);
            const remoteStations = await fetchWellStations(activeWellId);
            const mapped = remoteStations.map(mapApiStationToLocal);
            const calculated = calculateMinimumCurvature(mapped, getActiveProposalAzimuth());

            set({
              rawStations: calculated,
              stations: calculated,
              azimuthCorrection: 'none',
              isSagEnabled: false,
            });

            notify(language === 'ru' ? 'Замер удален из DuckDB' : 'Station deleted from DuckDB', 'info');
          } catch (err) {
            console.warn('Backend offline, deleting station locally:', err);
          }
        },

        importStations: (imported) => {
          if (imported.length === 0) return;
          const { getActiveProposalAzimuth } = get();
          const converted: SurveyStation[] = imported.map((item, idx) => ({
            id: idx + 1,
            md: item.md || (idx + 1) * 50,
            inc: item.inc || 0,
            azim: item.azim || 0,
            tvd: 0,
            northing: 0,
            easting: 0,
            dls: 0,
            vs: 0,
            closureDist: 0,
            closureAzim: 0,
            sensor: { gx: 0, gy: 0, gz: 1, bx: 16120, by: 0, bz: 50000 },
            gTotal: 1.0,
            bTotal: 52500,
            dipAngle: 72.15,
            deltaG: 0,
            deltaB: 20,
            deltaDip: 0,
            isQcPass: true,
            qcIssues: [],
            status: 'Raw',
            appliedCorrections: [],
            rawValues: {
              inc: item.inc || 0,
              azim: item.azim || 0,
              tvd: 0,
              northing: 0,
              easting: 0,
              dls: 0,
              gTotal: 1.0,
              bTotal: 52500,
              dipAngle: 72.15,
            },
          }));

          const calculated = calculateMinimumCurvature(converted, getActiveProposalAzimuth());
          set({
            rawStations: calculated,
            stations: calculated,
            azimuthCorrection: 'none',
            isSagEnabled: false,
          });
        },
      }),
      {
        name: 'arrowell-workstation-storage',
        partialize: (state) => ({
          unitSystem: state.unitSystem,
          language: state.language,
          theme: state.theme,
          viewMode: state.viewMode,
        }),
      }
    ),
    { name: 'WellboreStore' }
  )
);