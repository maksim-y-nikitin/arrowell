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
  MsaConfig,
  MsaOptimizationResult,
  UnitSystem,
  Language,
  Theme,
  ViewLayoutMode,
  WellPropertiesUpdate,
} from '@/types';
import { translations, TranslationKey } from '@/utils/i18n';
import { initialGeoRef, initialSurveyStations, mockHierarchy, wellStationsMap } from '@/data/wellsData';
import { calculateMinimumCurvature, initialBhaConfig } from '@/utils/directionalMath';
import {
  ApiStation,
  fetchHierarchy,
  fetchWellStations,
  createWellStation,
  deleteWellStation,
  triggerMsaAnalysis,
  triggerSagAnalysis,
  triggerSccAnalysis,
  resetWellCorrections,
} from '@/utils/api';

const wellProposalAzimuthMap: Record<string, number> = {
  'well-102h': 55.0,
  'well-104b': 133.0,
  'well-b12': 215.5,
};

export interface NotificationState {
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

function mapApiStationToLocal(s: ApiStation, rawBaselineMap?: Map<number, SurveyStation>): SurveyStation {
  const rawMatch = rawBaselineMap?.get(s.md);

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
    appliedCorrections: s.correction_type ? [s.correction_type as any] : [],
    eou: s.eou
      ? {
          semiMajor: s.eou.semi_major,
          semiIntermediate: s.eou.semi_intermediate,
          semiMinor: s.eou.semi_minor,
          horizMajor: s.eou.horiz_semi_major,
          horizMinor: s.eou.horiz_semi_minor,
          horizAzimuth: s.eou.horiz_azimuth,
          eigenvectors: s.eou.eigenvectors,
        }
      : undefined,
    rawValues: rawMatch
      ? {
          inc: rawMatch.inc,
          azim: rawMatch.azim,
          tvd: rawMatch.tvd,
          northing: rawMatch.northing,
          easting: rawMatch.easting,
          dls: rawMatch.dls,
          gTotal: rawMatch.gTotal,
          bTotal: rawMatch.bTotal,
          dipAngle: rawMatch.dipAngle,
        }
      : {
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
  unitSystem: UnitSystem;
  language: Language;
  theme: Theme;
  viewMode: ViewLayoutMode;
  showDeltaDiff: boolean;
  notification: NotificationState | null;

  geoRef: GeomagneticReference;
  bhaConfig: BhaConfig;
  msaConfig: MsaConfig;

  fields: FieldNode[];
  activeWellId: string;
  stations: SurveyStation[];
  rawStations: SurveyStation[];
  selectedStationId: number | null;
  isCalculatingMSA: boolean;
  isCalculatingSAG: boolean;
  isCalculatingSCC: boolean;
  msaResult: MsaOptimizationResult | null;
  azimuthCorrection: 'none' | 'msa' | 'scc';
  isSagEnabled: boolean;

  getActiveField: () => FieldNode;
  getActivePad: () => PadNode;
  getActiveWell: () => WellNode;
  getActiveRun: () => SurveyRun;
  getActiveProposalAzimuth: () => number;

  setUnitSystem: (u: UnitSystem) => void;
  setLanguage: (l: Language) => void;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setViewMode: (v: ViewLayoutMode) => void;
  setShowDeltaDiff: (val: boolean | ((prev: boolean) => boolean)) => void;
  notify: (msg: string, type?: NotificationState['type']) => void;
  dismissNotification: () => void;
  t: (key: TranslationKey) => string;

  updateGeoRef: (partial: Partial<GeomagneticReference>) => void;
  updateBhaConfig: (partial: Partial<BhaConfig>) => void;
  updateMsaConfig: (partial: Partial<MsaConfig>) => void;

  initWorkstation: () => Promise<void>;
  setActiveWellById: (wellId: string) => Promise<void>;
  setSelectedStationId: (id: number | null) => void;
  updateWellProperties: (props: WellPropertiesUpdate) => void;
  runMSA: () => Promise<void>;
  runSAG: () => Promise<void>;
  runSCC: () => Promise<void>;
  resetSurveys: () => Promise<void>;
  addStation: (stn: Partial<SurveyStation>) => Promise<void>;
  deleteStation: (id: number) => Promise<void>;
  importStations: (stns: Partial<SurveyStation>[]) => void;
}

export const useWellboreStore = create<WellboreStoreState>()(
  devtools(
    persist(
      (set, get) => ({
        unitSystem: 'metric',
        language: 'ru',
        theme: 'dark',
        viewMode: 'split',
        showDeltaDiff: true,
        notification: null,

        geoRef: initialGeoRef,
        bhaConfig: initialBhaConfig,
        msaConfig: {
          maxIter: 70,
          enableMisalignment: true,
          enableRefCorrections: true,
        },

        fields: mockHierarchy,
        activeWellId: 'well-102h',
        stations: initialSurveyStations,
        rawStations: initialSurveyStations,
        selectedStationId: null,
        isCalculatingMSA: false,
        isCalculatingSAG: false,
        isCalculatingSCC: false,
        msaResult: null,
        azimuthCorrection: 'none',
        isSagEnabled: false,

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

        updateGeoRef: (partial) =>
          set((state) => ({ geoRef: { ...state.geoRef, ...partial } })),

        updateBhaConfig: async (partial) => {
          const nextBha = { ...get().bhaConfig, ...partial };
          set({ bhaConfig: nextBha });

          if (get().isSagEnabled) {
            const { activeWellId, getActiveProposalAzimuth, rawStations, language, notify } = get();
            try {
              const remoteStations = await triggerSagAnalysis(activeWellId, nextBha);
              const rawMap = new Map<number, SurveyStation>(rawStations.map((s) => [s.md, s]));
              const mapped = remoteStations.map((s) => mapApiStationToLocal(s, rawMap));
              set({
                stations: calculateMinimumCurvature(mapped, getActiveProposalAzimuth()),
              });
            } catch (err: any) {
              set({ isSagEnabled: false, stations: get().rawStations });
              notify(
                language === 'ru'
                  ? `Ошибка перерасчета SAG на сервере: ${err?.message || 'Сервер недоступен'}`
                  : `Server error updating SAG: ${err?.message || 'Server unavailable'}`,
                'error'
              );
            }
          }
        },

        updateMsaConfig: (partial) =>
          set((state) => ({
            msaConfig: { ...state.msaConfig, ...partial },
          })),

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

              const rawList = await fetchWellStations(activeWellId, 'raw');
              const mappedRaw = rawList.map((s) => mapApiStationToLocal(s));
              const calculatedRaw = calculateMinimumCurvature(mappedRaw, getActiveProposalAzimuth());

              const rawMap = new Map<number, SurveyStation>(calculatedRaw.map((s) => [s.md, s]));

              const activeList = await fetchWellStations(activeWellId);
              const mappedActive = activeList.map((s) => mapApiStationToLocal(s, rawMap));
              const calculatedActive = calculateMinimumCurvature(mappedActive, getActiveProposalAzimuth());

              const hasMsa = activeList.some((s) => s.correction_type?.includes('MSA'));
              const hasSag = activeList.some((s) => s.correction_type?.includes('SAG'));
              const hasScc = activeList.some((s) => s.correction_type?.includes('SCC'));

              set({
                rawStations: calculatedRaw,
                stations: calculatedActive,
                azimuthCorrection: hasMsa ? 'msa' : hasScc ? 'scc' : 'none',
                isSagEnabled: hasSag,
              });
            }
          } catch (err) {
            console.warn('Backend service offline:', err);
          }
        },

        setActiveWellById: async (wellId) => {
          set({
            activeWellId: wellId,
            selectedStationId: null,
            msaResult: null,
            azimuthCorrection: 'none',
            isSagEnabled: false,
          });

          try {
            const { getActiveProposalAzimuth } = get();
            const rawList = await fetchWellStations(wellId, 'raw');
            const mappedRaw = rawList.map((s) => mapApiStationToLocal(s));
            const calculatedRaw = calculateMinimumCurvature(mappedRaw, getActiveProposalAzimuth());

            const rawMap = new Map<number, SurveyStation>(calculatedRaw.map((s) => [s.md, s]));

            const activeList = await fetchWellStations(wellId);
            const mappedActive = activeList.map((s) => mapApiStationToLocal(s, rawMap));
            const calculatedActive = calculateMinimumCurvature(mappedActive, getActiveProposalAzimuth());

            const hasMsa = activeList.some((s) => s.correction_type?.includes('MSA'));
            const hasSag = activeList.some((s) => s.correction_type?.includes('SAG'));
            const hasScc = activeList.some((s) => s.correction_type?.includes('SCC'));

            set({
              rawStations: calculatedRaw,
              stations: calculatedActive,
              azimuthCorrection: hasMsa ? 'msa' : hasScc ? 'scc' : 'none',
              isSagEnabled: hasSag,
            });
          } catch {
            const fallback = wellStationsMap[wellId] || initialSurveyStations;
            set({
              stations: [...fallback],
              rawStations: [...fallback],
            });
          }
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
          const { activeWellId, azimuthCorrection, getActiveProposalAzimuth, rawStations, language, notify, msaConfig } = get();

          if (azimuthCorrection === 'msa') {
            try {
              const remoteStations = await resetWellCorrections(activeWellId, 'msa');
              const rawMap = new Map<number, SurveyStation>(rawStations.map((s) => [s.md, s]));
              const mapped = remoteStations.map((s) => mapApiStationToLocal(s, rawMap));
              const hasSag = remoteStations.some((s) => s.correction_type?.includes('SAG'));
              set({
                stations: calculateMinimumCurvature(mapped, getActiveProposalAzimuth()),
                azimuthCorrection: 'none',
                isSagEnabled: hasSag,
              });
              notify(language === 'ru' ? 'Поправка MSA отключена' : 'MSA disabled', 'info');
            } catch (err: any) {
              notify(language === 'ru' ? 'Ошибка отключения MSA' : 'Error disabling MSA', 'error');
            }
            return;
          }

          set({ isCalculatingMSA: true });
          try {
            const remoteStations = await triggerMsaAnalysis(activeWellId, {
              cma_generations: msaConfig.maxIter,
              max_iter: msaConfig.maxIter,
              enable_misalignment: msaConfig.enableMisalignment,
              enable_ref_corrections: msaConfig.enableRefCorrections,
            });
            const rawMap = new Map<number, SurveyStation>(rawStations.map((s) => [s.md, s]));
            const mapped = remoteStations.map((s) => mapApiStationToLocal(s, rawMap));
            const hasSag = remoteStations.some((s) => s.correction_type?.includes('SAG'));
            set({
              stations: calculateMinimumCurvature(mapped, getActiveProposalAzimuth()),
              azimuthCorrection: 'msa',
              isSagEnabled: hasSag,
              isCalculatingMSA: false,
            });
            notify(language === 'ru' ? 'MSA рассчитан' : 'MSA calculated', 'success');
          } catch (err: any) {
            set({ isCalculatingMSA: false });
            notify(
              language === 'ru'
                ? `Ошибка сервера при расчете MSA: ${err?.message || 'Сервер недоступен'}`
                : `Server error during MSA calculation: ${err?.message || 'Server unavailable'}`,
              'error'
            );
          }
        },

        runSAG: async () => {
          const { activeWellId, isSagEnabled, bhaConfig, getActiveProposalAzimuth, rawStations, language, notify } = get();

          if (isSagEnabled) {
            try {
              const remoteStations = await resetWellCorrections(activeWellId, 'sag');
              const rawMap = new Map<number, SurveyStation>(rawStations.map((s) => [s.md, s]));
              const mapped = remoteStations.map((s) => mapApiStationToLocal(s, rawMap));
              const hasMsa = remoteStations.some((s) => s.correction_type?.includes('MSA'));
              const hasScc = remoteStations.some((s) => s.correction_type?.includes('SCC'));
              set({
                stations: calculateMinimumCurvature(mapped, getActiveProposalAzimuth()),
                isSagEnabled: false,
                azimuthCorrection: hasMsa ? 'msa' : hasScc ? 'scc' : 'none',
              });
              notify(language === 'ru' ? 'Поправка SAG отключена' : 'SAG disabled', 'info');
            } catch (err: any) {
              notify(language === 'ru' ? 'Ошибка отключения SAG' : 'Error disabling SAG', 'error');
            }
            return;
          }

          set({ isCalculatingSAG: true });
          try {
            const remoteStations = await triggerSagAnalysis(activeWellId, bhaConfig);
            const rawMap = new Map<number, SurveyStation>(rawStations.map((s) => [s.md, s]));
            const mapped = remoteStations.map((s) => mapApiStationToLocal(s, rawMap));
            const hasMsa = remoteStations.some((s) => s.correction_type?.includes('MSA'));
            const hasScc = remoteStations.some((s) => s.correction_type?.includes('SCC'));
            set({
              stations: calculateMinimumCurvature(mapped, getActiveProposalAzimuth()),
              isSagEnabled: true,
              azimuthCorrection: hasMsa ? 'msa' : hasScc ? 'scc' : 'none',
              isCalculatingSAG: false,
            });
            notify(language === 'ru' ? 'SAG рассчитан' : 'SAG calculated', 'success');
          } catch (err: any) {
            set({ isCalculatingSAG: false });
            notify(
              language === 'ru'
                ? `Ошибка сервера при расчете SAG: ${err?.message || 'Сервер недоступен'}`
                : `Server error during SAG calculation: ${err?.message || 'Server unavailable'}`,
              'error'
            );
          }
        },

        runSCC: async () => {
          const { activeWellId, azimuthCorrection, getActiveProposalAzimuth, rawStations, language, notify } = get();

          if (azimuthCorrection === 'scc') {
            try {
              const remoteStations = await resetWellCorrections(activeWellId, 'scc');
              const rawMap = new Map<number, SurveyStation>(rawStations.map((s) => [s.md, s]));
              const mapped = remoteStations.map((s) => mapApiStationToLocal(s, rawMap));
              const hasSag = remoteStations.some((s) => s.correction_type?.includes('SAG'));
              set({
                stations: calculateMinimumCurvature(mapped, getActiveProposalAzimuth()),
                azimuthCorrection: 'none',
                isSagEnabled: hasSag,
              });
              notify(language === 'ru' ? 'Поправка SCC отключена' : 'SCC disabled', 'info');
            } catch (err: any) {
              notify(language === 'ru' ? 'Ошибка отключения SCC' : 'Error disabling SCC', 'error');
            }
            return;
          }

          set({ isCalculatingSCC: true });
          try {
            const remoteStations = await triggerSccAnalysis(activeWellId);
            const rawMap = new Map<number, SurveyStation>(rawStations.map((s) => [s.md, s]));
            const mapped = remoteStations.map((s) => mapApiStationToLocal(s, rawMap));
            const hasSag = remoteStations.some((s) => s.correction_type?.includes('SAG'));
            set({
              stations: calculateMinimumCurvature(mapped, getActiveProposalAzimuth()),
              azimuthCorrection: 'scc',
              isSagEnabled: hasSag,
              isCalculatingSCC: false,
            });
            notify(language === 'ru' ? 'SCC рассчитан' : 'SCC calculated', 'success');
          } catch (err: any) {
            set({ isCalculatingSCC: false });
            notify(
              language === 'ru'
                ? `Ошибка сервера при расчете SCC: ${err?.message || 'Сервер недоступен'}`
                : `Server error during SCC calculation: ${err?.message || 'Server unavailable'}`,
              'error'
            );
          }
        },

        resetSurveys: async () => {
          const { activeWellId, getActiveProposalAzimuth, language, notify } = get();
          try {
            const remoteStations = await resetWellCorrections(activeWellId, 'all');
            const mappedRaw = remoteStations.map((s) => mapApiStationToLocal(s));
            const calculatedRaw = calculateMinimumCurvature(mappedRaw, getActiveProposalAzimuth());

            set({
              rawStations: calculatedRaw,
              stations: calculatedRaw,
              azimuthCorrection: 'none',
              isSagEnabled: false,
              msaResult: null,
            });
            notify(language === 'ru' ? 'Все поправки сброшены к Raw' : 'All corrections reset to Raw', 'info');
          } catch (err: any) {
            notify(
              language === 'ru'
                ? `Ошибка сброса на сервере: ${err?.message || 'Сервер недоступен'}`
                : `Server reset error: ${err?.message || 'Server unavailable'}`,
              'error'
            );
          }
        },

        resetSurveys: async () => {
          const { activeWellId, getActiveProposalAzimuth, language, notify } = get();
          try {
            const remoteStations = await resetWellCorrections(activeWellId);
            const mappedRaw = remoteStations.map((s) => mapApiStationToLocal(s));
            const calculatedRaw = calculateMinimumCurvature(mappedRaw, getActiveProposalAzimuth());

            set({
              rawStations: calculatedRaw,
              stations: calculatedRaw,
              azimuthCorrection: 'none',
              isSagEnabled: false,
              msaResult: null,
            });
            notify(language === 'ru' ? 'Все поправки сброшены к Raw' : 'All corrections reset to Raw', 'info');
          } catch (err: any) {
            notify(
              language === 'ru'
                ? `Ошибка сброса на сервере: ${err?.message || 'Сервер недоступен'}`
                : `Server reset error: ${err?.message || 'Server unavailable'}`,
              'error'
            );
          }
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

            const rawList = await fetchWellStations(activeWellId, 'raw');
            const mappedRaw = rawList.map((s) => mapApiStationToLocal(s));
            const calculatedRaw = calculateMinimumCurvature(mappedRaw, getActiveProposalAzimuth());

            const rawMap = new Map<number, SurveyStation>(calculatedRaw.map((s) => [s.md, s]));

            const activeList = await fetchWellStations(activeWellId);
            const mappedActive = activeList.map((s) => mapApiStationToLocal(s, rawMap));
            const calculatedActive = calculateMinimumCurvature(mappedActive, getActiveProposalAzimuth());

            set({
              rawStations: calculatedRaw,
              stations: calculatedActive,
              azimuthCorrection: 'none',
              isSagEnabled: false,
            });

            notify(
              language === 'ru' ? `Замер на ${md} м сохранен в DuckDB` : `Station at ${md} m saved to DuckDB`,
              'success'
            );
          } catch (err: any) {
            notify(
              language === 'ru'
                ? `Ошибка сервера при добавлении замера: ${err?.message || 'Сервер недоступен'}`
                : `Server error adding survey station: ${err?.message || 'Server unavailable'}`,
              'error'
            );
          }
        },

        deleteStation: async (id) => {
          const { activeWellId, getActiveProposalAzimuth, language, notify } = get();
          try {
            await deleteWellStation(activeWellId, id);

            const rawList = await fetchWellStations(activeWellId, 'raw');
            const mappedRaw = rawList.map((s) => mapApiStationToLocal(s));
            const calculatedRaw = calculateMinimumCurvature(mappedRaw, getActiveProposalAzimuth());

            const rawMap = new Map<number, SurveyStation>(calculatedRaw.map((s) => [s.md, s]));

            const activeList = await fetchWellStations(activeWellId);
            const mappedActive = activeList.map((s) => mapApiStationToLocal(s, rawMap));
            const calculatedActive = calculateMinimumCurvature(mappedActive, getActiveProposalAzimuth());

            set({
              rawStations: calculatedRaw,
              stations: calculatedActive,
            });

            notify(language === 'ru' ? 'Замер удален из DuckDB' : 'Station deleted from DuckDB', 'info');
          } catch (err: any) {
            notify(
              language === 'ru'
                ? `Ошибка сервера при удалении замера: ${err?.message || 'Сервер недоступен'}`
                : `Server error deleting survey station: ${err?.message || 'Server unavailable'}`,
              'error'
            );
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
          msaConfig: state.msaConfig,
        }),
      }
    ),
    { name: 'WellboreStore' }
  )
);