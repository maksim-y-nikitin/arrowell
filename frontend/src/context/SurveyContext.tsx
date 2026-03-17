/**
 * Directional survey calculation engine context: hierarchy navigation, telemetry CRUD, and corrections.
 */

import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import {
  SurveyStation,
  FieldNode,
  PadNode,
  WellNode,
  SurveyRun,
  MsaOptimizationResult,
  BhaConfig,
  WellPropertiesUpdate,
} from '@/types';
import { mockHierarchy, initialSurveyStations, wellStationsMap } from '@/data/wellsData';
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
import { useUI } from './UIContext';
import { useEngineering, calculatePhysicalSagAngle } from './EngineeringContext';

const wellProposalAzimuthMap: Record<string, number> = {
  'well-102h': 55.0,
  'well-104b': 133.0,
  'well-b12': 215.5,
};

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

interface SurveyContextType {
  fields: FieldNode[];
  activeField: FieldNode;
  activePad: PadNode;
  activeWell: WellNode;
  activeRun: SurveyRun;
  stations: SurveyStation[];
  rawStations: SurveyStation[];
  selectedStationId: number | null;
  isCalculatingMSA: boolean;
  isCalculatingSAG: boolean;
  msaResult: MsaOptimizationResult | null;
  azimuthCorrection: 'none' | 'msa' | 'scc';
  isSagEnabled: boolean;
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

const SurveyContext = createContext<SurveyContextType | null>(null);

export const SurveyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { notify, language } = useUI();
  const { geoRef, bhaConfig, updateBhaConfig } = useEngineering();

  const [fields, setFields] = useState<FieldNode[]>(mockHierarchy);
  const [activeWellId, setActiveWellId] = useState<string>('well-102h');
  const [rawStations, setRawStations] = useState<SurveyStation[]>(initialSurveyStations);
  const [stations, setStations] = useState<SurveyStation[]>(initialSurveyStations);
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);

  const [isCalculatingMSA, setIsCalculatingMSA] = useState<boolean>(false);
  const [isCalculatingSAG, setIsCalculatingSAG] = useState<boolean>(false);
  const [msaResult, setMsaResult] = useState<MsaOptimizationResult | null>(null);

  const [azimuthCorrection, setAzimuthCorrection] = useState<'none' | 'msa' | 'scc'>('none');
  const [isSagEnabled, setIsSagEnabled] = useState<boolean>(false);
  const [cachedMsaBz, setCachedMsaBz] = useState<number>(280);
  const [mwdcoreSagMap, setMwdcoreSagMap] = useState<Record<number, number>>({});

  const activeProposalAzimuth = useMemo(() => {
    return wellProposalAzimuthMap[activeWellId] ?? 55.0;
  }, [activeWellId]);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const remoteHierarchy = await fetchHierarchy();
        if (remoteHierarchy && remoteHierarchy.length > 0 && isMounted) {
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

          setFields(normalizedHierarchy);

          const remoteStations = await fetchWellStations(activeWellId);
          if (remoteStations && remoteStations.length > 0 && isMounted) {
            const mappedStations = remoteStations.map(mapApiStationToLocal);
            const calculated = calculateMinimumCurvature(mappedStations, activeProposalAzimuth);
            setStations(calculated);
            setRawStations(calculated);
            setAzimuthCorrection('none');
            setIsSagEnabled(false);
          }
        }
      } catch (err) {
        console.warn('Backend is unreachable, using local fallback dataset:', err);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [activeWellId, activeProposalAzimuth]);

  const activeField = useMemo(() => {
    for (const f of fields) {
      for (const p of f.pads) {
        if (p.wells.some((w) => w.id === activeWellId)) return f;
      }
    }
    return fields[0];
  }, [fields, activeWellId]);

  const activePad = useMemo(() => {
    for (const p of activeField.pads) {
      if (p.wells.some((w) => w.id === activeWellId)) return p;
    }
    return activeField.pads[0];
  }, [activeField, activeWellId]);

  const activeWell = useMemo(() => {
    return activePad.wells.find((w) => w.id === activeWellId) || activePad.wells[0];
  }, [activePad, activeWellId]);

  const activeRun = useMemo(() => {
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
  }, [activeWell, stations.length]);

  const setActiveWellById = useCallback((wellId: string) => {
    setActiveWellId(wellId);
    const newStns = wellStationsMap[wellId] || initialSurveyStations;
    setStations([...newStns]);
    setRawStations([...newStns]);
    setSelectedStationId(null);
    setMsaResult(null);
    setMwdcoreSagMap({});
    setAzimuthCorrection('none');
    setIsSagEnabled(false);
  }, []);

  const updateWellProperties = useCallback((update: WellPropertiesUpdate) => {
    setFields((prevFields) =>
      prevFields.map((field) => ({
        ...field,
        pads: field.pads.map((pad) => {
          const hasWell = pad.wells.some((w) => w.id === activeWellId);
          if (!hasWell) return pad;

          return {
            ...pad,
            name: update.padName ?? pad.name,
            latitude: update.latitude !== undefined ? update.latitude : pad.latitude,
            longitude: update.longitude !== undefined ? update.longitude : pad.longitude,
            groundElevation: update.groundElevation !== undefined ? update.groundElevation : pad.groundElevation,
            datum: update.datum ?? pad.datum,
            wells: pad.wells.map((well) => {
              if (well.id !== activeWellId) return well;
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
      }))
    );
  }, [activeWellId]);

  const applyCombinedCorrections = useCallback(
    (
      azimMode: 'none' | 'msa' | 'scc',
      sagActive: boolean,
      msaBz: number = cachedMsaBz,
      sagMap: Record<number, number> = mwdcoreSagMap,
      currentBha: BhaConfig = bhaConfig
    ) => {
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
          appliedCorrections: activeCorrectionsList,
          status:
            activeCorrectionsList.length > 0
              ? (`${activeCorrectionsList.join('+')} Applied` as any)
              : 'Raw',
        };
      });

      setStations(calculateMinimumCurvature(updated, activeProposalAzimuth));
    },
    [rawStations, geoRef, cachedMsaBz, mwdcoreSagMap, bhaConfig, activeProposalAzimuth]
  );

  const runSAG = useCallback(async () => {
    if (isSagEnabled) {
      setIsSagEnabled(false);
      applyCombinedCorrections(azimuthCorrection, false);
      notify(language === 'ru' ? 'Поправка SAG выключена' : 'SAG disabled', 'info');
      return;
    }

    setIsCalculatingSAG(true);
    try {
      const res = await triggerSagAnalysis(activeWell.id, bhaConfig);
      const newSagMap: Record<number, number> = {};
      res.corrections.forEach((c) => {
        newSagMap[c.station_id] = c.sag_correction_deg;
      });

      setMwdcoreSagMap(newSagMap);
      setIsSagEnabled(true);
      applyCombinedCorrections(azimuthCorrection, true, cachedMsaBz, newSagMap);
      setIsCalculatingSAG(false);

      notify(
        language === 'ru'
          ? `SAG рассчитан через mwdstdcore (пик: ${res.peak_sag_deg}°, точек: ${res.stations_corrected})`
          : `SAG computed via mwdstdcore (peak: ${res.peak_sag_deg}°, stations: ${res.stations_corrected})`,
        'success'
      );
    } catch (err) {
      console.warn('Backend SAG failed, using local beam mechanics fallback:', err);
      setIsSagEnabled(true);
      applyCombinedCorrections(azimuthCorrection, true);
      setIsCalculatingSAG(false);

      const sagPeak = calculatePhysicalSagAngle(bhaConfig);
      notify(
        language === 'ru'
          ? `SAG включен (локально, расчетный пик: ${sagPeak}°)`
          : `SAG active (local fallback, peak: ${sagPeak}°)`,
        'info'
      );
    }
  }, [isSagEnabled, activeWell.id, bhaConfig, azimuthCorrection, cachedMsaBz, language, notify, applyCombinedCorrections]);

  const runMSA = useCallback(async () => {
    if (azimuthCorrection === 'msa') {
      setAzimuthCorrection('none');
      applyCombinedCorrections('none', isSagEnabled);
      notify(language === 'ru' ? 'Поправка MSA отключена' : 'MSA disabled', 'info');
      return;
    }

    setIsCalculatingMSA(true);
    try {
      const res = await triggerMsaAnalysis(activeWell.id);
      const bz = res.axial_bias_bz;
      setCachedMsaBz(bz);
      setMsaResult({
        collarInterference: Math.round(bz),
        sensorBiasZ: bz,
        scaleFactorError: res.scale_factor_z,
        iterations: 60,
        convergenceRms: 0.12,
        correctedStationsCount: res.stations_analyzed,
      });

      setAzimuthCorrection('msa');
      applyCombinedCorrections('msa', isSagEnabled, bz);
      setIsCalculatingMSA(false);

      notify(
        language === 'ru'
          ? `MSA включен (mwdstdcore): ΔBz = ${bz} нТл (${res.stations_analyzed} замеров)`
          : `MSA active (mwdstdcore): ΔBz = ${bz} nT (${res.stations_analyzed} stations)`,
        'success'
      );
    } catch (err) {
      console.warn('Backend MSA failed, running local optimization fallback:', err);
      const { result } = runMultiStationAnalysis(rawStations, geoRef);
      setCachedMsaBz(result.sensorBiasZ);
      setAzimuthCorrection('msa');
      applyCombinedCorrections('msa', isSagEnabled, result.sensorBiasZ);
      setIsCalculatingMSA(false);

      notify(
        language === 'ru'
          ? `MSA включен (локально): ΔBz = ${result.sensorBiasZ} нТл`
          : `MSA active (local fallback): ΔBz = ${result.sensorBiasZ} nT`,
        'info'
      );
    }
  }, [azimuthCorrection, isSagEnabled, activeWell.id, rawStations, geoRef, language, notify, applyCombinedCorrections]);

  const runSCC = useCallback(() => {
    if (azimuthCorrection === 'scc') {
      setAzimuthCorrection('none');
      applyCombinedCorrections('none', isSagEnabled);
      notify(language === 'ru' ? 'Поправка SCC отключена' : 'SCC disabled', 'info');
      return;
    }

    setAzimuthCorrection('scc');
    applyCombinedCorrections('scc', isSagEnabled);
    notify(language === 'ru' ? 'Поправка SCC включена (MSA выключен)' : 'SCC active (MSA disabled)', 'success');
  }, [azimuthCorrection, isSagEnabled, language, notify, applyCombinedCorrections]);

  const resetSurveys = useCallback(() => {
    setAzimuthCorrection('none');
    setIsSagEnabled(false);
    setStations([...rawStations]);
    setMsaResult(null);
    notify(language === 'ru' ? 'Все поправки сброшены (режим Raw)' : 'All corrections reset (Raw)', 'info');
  }, [rawStations, language, notify]);

  const addStation = useCallback(
    async (stn: Partial<SurveyStation>) => {
      const md = stn.md || (stations[stations.length - 1]?.md || 0) + 30;
      const inc = stn.inc ?? 90.0;
      const azim = stn.azim ?? (stations[stations.length - 1]?.azim || 55.0);

      const gx = stn.sensor?.gx ?? 0.513;
      const gy = stn.sensor?.gy ?? 0.865;
      const gz = stn.sensor?.gz ?? 0.0;
      const bx = stn.sensor?.bx ?? 17690;
      const by = stn.sensor?.by ?? 4380;
      const bz = stn.sensor?.bz ?? 50200;
      const sensor = { gx, gy, gz, bx, by, bz };

      try {
        await createWellStation(activeWell.id, { md, inc, azim, sensor });
        const remoteStations = await fetchWellStations(activeWell.id);
        const mapped = remoteStations.map(mapApiStationToLocal);
        const calculated = calculateMinimumCurvature(mapped, activeProposalAzimuth);

        setRawStations(calculated);
        setStations(calculated);
        setAzimuthCorrection('none');
        setIsSagEnabled(false);

        notify(
          language === 'ru'
            ? `Замер на ${md} м сохранен в базе DuckDB`
            : `Station at ${md} m saved to DuckDB`,
          'success'
        );
      } catch (err) {
        console.warn('Backend unavailable, saving locally:', err);
        const newId = stations.length + 1;
        const gTot = Number(Math.sqrt(gx * gx + gy * gy + gz * gz).toFixed(4));
        const bTot = Math.round(Math.hypot(bx, by, bz));
        const bH = Math.hypot(bx, by);
        let dip = Math.atan2(bz, bH) * (180 / Math.PI);
        if (dip < 0) dip = Math.abs(dip);

        const newStn: SurveyStation = {
          id: newId,
          md,
          inc,
          azim,
          tvd: 0,
          northing: 0,
          easting: 0,
          dls: 0,
          vs: 0,
          closureDist: 0,
          closureAzim: 0,
          sensor,
          gTotal: gTot,
          bTotal: bTot,
          dipAngle: Number(dip.toFixed(2)),
          deltaG: Number((gTot - geoRef.gTotalRef).toFixed(4)),
          deltaB: Math.round(bTot - geoRef.bTotalRef),
          deltaDip: Number((dip - geoRef.dipRef).toFixed(2)),
          isQcPass: true,
          qcIssues: [],
          status: 'Raw',
          appliedCorrections: [],
          rawValues: {
            inc,
            azim,
            tvd: 0,
            northing: 0,
            easting: 0,
            dls: 0,
            gTotal: gTot,
            bTotal: bTot,
            dipAngle: Number(dip.toFixed(2)),
          },
        };

        const qc = evaluateSurveyQC(newStn, geoRef);
        newStn.isQcPass = qc.isPass;
        newStn.qcIssues = qc.issues;

        const nextRaw = [...rawStations, newStn].sort((a, b) => a.md - b.md);
        nextRaw.forEach((s, idx) => {
          s.id = idx + 1;
        });

        const calculated = calculateMinimumCurvature(nextRaw, activeProposalAzimuth);
        setRawStations(calculated);
        setStations(calculated);
        setAzimuthCorrection('none');
        setIsSagEnabled(false);
      }
    },
    [activeWell.id, stations, rawStations, geoRef, activeProposalAzimuth, language, notify]
  );

  const deleteStation = useCallback(
    async (id: number) => {
      try {
        await deleteWellStation(activeWell.id, id);
        const remoteStations = await fetchWellStations(activeWell.id);
        const mapped = remoteStations.map(mapApiStationToLocal);
        const calculated = calculateMinimumCurvature(mapped, activeProposalAzimuth);

        setRawStations(calculated);
        setStations(calculated);
        setAzimuthCorrection('none');
        setIsSagEnabled(false);

        notify(language === 'ru' ? 'Замер удален из DuckDB' : 'Station deleted from DuckDB', 'info');
      } catch (err) {
        console.warn('Backend unavailable, deleting locally:', err);
        const filtered = rawStations.filter((s) => s.id !== id);
        filtered.forEach((s, idx) => {
          s.id = idx + 1;
        });
        const calculated = calculateMinimumCurvature(filtered, activeProposalAzimuth);
        setRawStations(calculated);
        setStations(calculated);
      }
    },
    [activeWell.id, rawStations, activeProposalAzimuth, language, notify]
  );

  const importStations = useCallback(
    (imported: Partial<SurveyStation>[]) => {
      if (imported.length === 0) return;
      const converted: SurveyStation[] = imported.map((item, idx) => {
        const md = item.md || (idx + 1) * 50;
        const inc = item.inc || 0;
        const azim = item.azim || 0;
        return {
          id: idx + 1,
          md,
          inc,
          azim,
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
            inc,
            azim,
            tvd: 0,
            northing: 0,
            easting: 0,
            dls: 0,
            gTotal: 1.0,
            bTotal: 52500,
            dipAngle: 72.15,
          },
        };
      });

      const calculated = calculateMinimumCurvature(converted, activeProposalAzimuth);
      setRawStations(calculated);
      setStations(calculated);
      setAzimuthCorrection('none');
      setIsSagEnabled(false);
    },
    [activeProposalAzimuth]
  );

  return (
    <SurveyContext.Provider
      value={{
        fields,
        activeField,
        activePad,
        activeWell,
        activeRun,
        stations,
        rawStations,
        selectedStationId,
        isCalculatingMSA,
        isCalculatingSAG,
        msaResult,
        azimuthCorrection,
        isSagEnabled,
        setActiveWellById,
        setSelectedStationId,
        updateWellProperties,
        runMSA,
        runSAG,
        runSCC,
        resetSurveys,
        addStation,
        deleteStation,
        importStations,
      }}
    >
      {children}
    </SurveyContext.Provider>
  );
};

export const useSurvey = () => {
  const ctx = useContext(SurveyContext);
  if (!ctx) throw new Error('useSurvey must be used within SurveyProvider');
  return ctx;
};