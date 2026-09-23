import React, { useState, useEffect } from 'react';
import { useWellbore } from '@/context/WellboreContext';
import { GeomagneticReference, BhaConfig, MsaConfig } from '@/types';
import { calculatePhysicalSagAngle } from '@/utils/directionalMath';
import { calculateGeomagReference } from '@/utils/api';
import {
  X,
  Compass,
  Check,
  Layers,
  Sliders,
  Info,
  Sparkles,
  MapPin,
  Building2,
  Navigation,
  Cpu,
  Zap,
  Gauge,
  RotateCcw,
  ShieldCheck,
  Ruler,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'location' | 'geomag' | 'bha' | 'msa';

/**
 * Enterprise-grade engineering configuration dialog for wellbore coordinates,
 * geomagnetic references, BHA sag mechanics, and MSA optimization solvers.
 *
 * @param props - Component properties containing open state and close trigger.
 * @returns Responsive full-scale settings modal component.
 */
export const GeomagneticSettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const {
    geoRef,
    updateGeoRef,
    bhaConfig,
    updateBhaConfig,
    msaConfig,
    updateMsaConfig,
    activePad,
    activeWell,
    updateWellProperties,
    notify,
    language,
  } = useWellbore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('location');
  const [isAutoCalculating, setIsAutoCalculating] = useState<boolean>(false);

  const [padName, setPadName] = useState<string>(activePad?.name || '');
  const [wellName, setWellName] = useState<string>(activeWell?.name || '');
  const [slot, setSlot] = useState<string>(activeWell?.slot || 'Slot #1');
  const [latitude, setLatitude] = useState<number>(activePad?.latitude ?? 61.1245);
  const [longitude, setLongitude] = useState<number>(activePad?.longitude ?? 76.7132);
  const [rkbElevation, setRkbElevation] = useState<number>(activeWell?.datumElevation ?? 54.2);
  const [glElevation, setGlElevation] = useState<number>(activePad?.groundElevation ?? 48.5);
  const [datum, setDatum] = useState<string>(activePad?.datum || 'MSL WGS-84');
  const [targetFormation, setTargetFormation] = useState<string>(activeWell?.targetFormation || 'BV8');

  const [model, setModel] = useState<GeomagneticReference['model']>(geoRef?.model || 'WMM 2025');
  const [bRef, setBRef] = useState<number>(geoRef?.bTotalRef ?? 52480);
  const [dipRef, setDipRef] = useState<number>(geoRef?.dipRef ?? 72.15);
  const [declination, setDeclination] = useState<number>(geoRef?.declination ?? 12.42);
  const [gridConvergence, setGridConvergence] = useState<number>(geoRef?.gridConvergence ?? 1.25);
  const [tolG, setTolG] = useState<number>(geoRef?.toleranceG ?? 0.005);
  const [tolB, setTolB] = useState<number>(geoRef?.toleranceB ?? 200);
  const [tolDip, setTolDip] = useState<number>(geoRef?.toleranceDip ?? 0.30);

  const [collarOd, setCollarOd] = useState<number>(bhaConfig?.collarOdMm ?? 171.5);
  const [collarId, setCollarId] = useState<number>(bhaConfig?.collarIdMm ?? 71.4);
  const [sensorToBit, setSensorToBit] = useState<number>(bhaConfig?.sensorToBitM ?? 14.2);
  const [stabDist, setStabDist] = useState<number>(bhaConfig?.stabilizerDistM ?? 21.5);
  const [mudWeight, setMudWeight] = useState<number>(bhaConfig?.mudWeightGcm3 ?? 1.20);
  const [material, setMaterial] = useState<BhaConfig['bhaMaterial']>(bhaConfig?.bhaMaterial ?? 'nm_steel');

  const [solverMethod, setSolverMethod] = useState<'trf' | 'de'>(msaConfig?.method || 'trf');
  const [maxIter, setMaxIter] = useState<number>(msaConfig?.maxIter || 50);
  const [popsize, setPopsize] = useState<number>(msaConfig?.popsize || 15);
  const [enableMisalignment, setEnableMisalignment] = useState<boolean>(msaConfig?.enableMisalignment ?? true);
  const [enableRefCorrections, setEnableRefCorrections] = useState<boolean>(msaConfig?.enableRefCorrections ?? true);

  useEffect(() => {
    if (activePad) {
      setPadName(activePad.name || '');
      setLatitude(activePad.latitude ?? 61.1245);
      setLongitude(activePad.longitude ?? 76.7132);
      setGlElevation(activePad.groundElevation ?? 48.5);
      setDatum(activePad.datum || 'MSL WGS-84');
    }
    if (activeWell) {
      setWellName(activeWell.name || '');
      setSlot(activeWell.slot || 'Slot #1');
      setRkbElevation(activeWell.datumElevation ?? 54.2);
      setTargetFormation(activeWell.targetFormation || 'BV8');
    }
  }, [activePad, activeWell]);

  useEffect(() => {
    if (msaConfig) {
      setSolverMethod(msaConfig.method || 'trf');
      setMaxIter(msaConfig.maxIter || 50);
      setPopsize(msaConfig.popsize || 15);
      setEnableMisalignment(msaConfig.enableMisalignment ?? true);
      setEnableRefCorrections(msaConfig.enableRefCorrections ?? true);
    }
  }, [msaConfig]);

  if (!isOpen) return null;

  const isRu = language === 'ru';
  const airGap = Number(((rkbElevation || 0) - (glElevation || 0)).toFixed(2));

  const previewSagAngle = calculatePhysicalSagAngle({
    collarOdMm: collarOd,
    collarIdMm: collarId,
    sensorToBitM: sensorToBit,
    stabilizerDistM: stabDist,
    mudWeightGcm3: mudWeight,
    bhaMaterial: material,
  });

  const handleAutoCalculateGeomag = async () => {
    setIsAutoCalculating(true);
    try {
      const res = await calculateGeomagReference({
        latitude: latitude,
        longitude: longitude,
        altitude_m: glElevation,
        model: model.includes('IGRF') ? 'IGRF14' : 'WMM2025',
      });

      setBRef(res.b_total_ref);
      setDipRef(res.dip_ref);
      setDeclination(res.declination);
      setGridConvergence(res.grid_convergence);

      notify(
        isRu
          ? `Эталон WMM рассчитан: Btotal=${res.b_total_ref} nT, Dip=${res.dip_ref}°, Склонение=${res.declination}°`
          : `WMM computed: Btotal=${res.b_total_ref} nT, Dip=${res.dip_ref}°, Dec=${res.declination}°`,
        'success'
      );
    } catch (err) {
      console.error(err);
      notify(
        isRu
          ? 'Не удалось рассчитать эталон (проверьте подключение к бэкенду)'
          : 'Failed to compute reference parameters',
        'error'
      );
    } finally {
      setIsAutoCalculating(false);
    }
  };

  const applyPreset = (preset: 'standard' | 'slim' | 'heavy') => {
    if (preset === 'standard') {
      setCollarOd(171.5);
      setCollarId(71.4);
      setSensorToBit(14.2);
      setStabDist(21.5);
      setMaterial('nm_steel');
    } else if (preset === 'slim') {
      setCollarOd(120.7);
      setCollarId(57.2);
      setSensorToBit(11.8);
      setStabDist(18.0);
      setMaterial('nm_steel');
    } else if (preset === 'heavy') {
      setCollarOd(203.2);
      setCollarId(76.2);
      setSensorToBit(15.5);
      setStabDist(24.0);
      setMaterial('steel');
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (typeof updateWellProperties === 'function') {
      updateWellProperties({
        padName,
        wellName,
        slot,
        latitude,
        longitude,
        datumElevation: rkbElevation,
        groundElevation: glElevation,
        datum,
        targetFormation,
      });
    }

    if (typeof updateGeoRef === 'function') {
      updateGeoRef({
        model,
        bTotalRef: bRef,
        dipRef,
        declination,
        gridConvergence,
        toleranceG: tolG,
        toleranceB: tolB,
        toleranceDip: tolDip,
      });
    }

    if (typeof updateBhaConfig === 'function') {
      updateBhaConfig({
        collarOdMm: collarOd,
        collarIdMm: collarId,
        sensorToBitM: sensorToBit,
        stabilizerDistM: stabDist,
        mudWeightGcm3: mudWeight,
        bhaMaterial: material,
      });
    }

    if (typeof updateMsaConfig === 'function') {
      updateMsaConfig({
        method: solverMethod,
        maxIter,
        popsize,
        enableMisalignment,
        enableRefCorrections,
      });
    }

    notify(
      isRu
        ? 'Все инженерные параметры успешно применены к проекту'
        : 'All engineering parameters successfully applied',
      'success'
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 sm:p-6 select-none font-mono text-xs">
      <div className="w-full max-w-5xl h-[86vh] rounded-2xl border shadow-2xl overflow-hidden flex flex-col transition-colors bg-white dark:bg-[#0c0e17] border-slate-200 dark:border-[#1e253c] text-slate-800 dark:text-slate-200">

        <div className="h-13 px-6 border-b flex items-center justify-between border-slate-200 dark:border-[#1c2236] bg-slate-50/90 dark:bg-[#090b12] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span>{isRu ? 'Инженерная конфигурация скважины и площадки' : 'Engineering Wellbore & Pad Configuration'}</span>
                <span className="px-2 py-0.5 rounded-full text-4xs font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                  {activeWell?.name}
                </span>
              </div>
              <div className="text-4xs text-slate-500 dark:text-slate-400">
                {activePad?.name} • {datum}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-200/50 dark:hover:bg-[#1a2034] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">

          <nav className="w-64 bg-slate-50 dark:bg-[#080a11] border-r border-slate-200 dark:border-[#171c2b] flex flex-col p-3 gap-1 shrink-0 select-none">
            <button
              type="button"
              onClick={() => setActiveTab('location')}
              className={`w-full px-3 py-2.5 rounded-lg font-medium text-left flex items-center gap-3 transition-all ${
                activeTab === 'location'
                  ? 'bg-white dark:bg-[#151a2a] text-sky-600 dark:text-sky-400 shadow-xs border border-slate-200 dark:border-[#20273f]'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#111422]'
              }`}
            >
              <div className={`p-1.5 rounded-md ${activeTab === 'location' ? 'bg-sky-500/15 text-sky-500' : 'bg-slate-200/50 dark:bg-[#1a2033]'}`}>
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold text-xs">{isRu ? 'Устье и геодезия' : 'Wellhead & Datum'}</div>
                <div className="text-4xs text-slate-400">{isRu ? 'Координаты, RKB, GL' : 'Coordinates, RKB, GL'}</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('geomag')}
              className={`w-full px-3 py-2.5 rounded-lg font-medium text-left flex items-center gap-3 transition-all ${
                activeTab === 'geomag'
                  ? 'bg-white dark:bg-[#151a2a] text-sky-600 dark:text-sky-400 shadow-xs border border-slate-200 dark:border-[#20273f]'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#111422]'
              }`}
            >
              <div className={`p-1.5 rounded-md ${activeTab === 'geomag' ? 'bg-sky-500/15 text-sky-500' : 'bg-slate-200/50 dark:bg-[#1a2033]'}`}>
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold text-xs">{isRu ? 'Геомагнетизм WMM' : 'Geomagnetic Model'}</div>
                <div className="text-4xs text-slate-400">{isRu ? 'Btotal, Dip, склонение' : 'Btotal, Dip, Declination'}</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('bha')}
              className={`w-full px-3 py-2.5 rounded-lg font-medium text-left flex items-center gap-3 transition-all ${
                activeTab === 'bha'
                  ? 'bg-white dark:bg-[#151a2a] text-emerald-600 dark:text-emerald-400 shadow-xs border border-slate-200 dark:border-[#20273f]'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#111422]'
              }`}
            >
              <div className={`p-1.5 rounded-md ${activeTab === 'bha' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-slate-200/50 dark:bg-[#1a2033]'}`}>
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold text-xs">{isRu ? 'КНБК и прогиб SAG' : 'BHA & Sag Deflection'}</div>
                <div className="text-4xs text-slate-400">{isRu ? 'Геометрия, изгиб балки' : 'Collar, Beam Bending'}</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('msa')}
              className={`w-full px-3 py-2.5 rounded-lg font-medium text-left flex items-center gap-3 transition-all ${
                activeTab === 'msa'
                  ? 'bg-white dark:bg-[#151a2a] text-purple-600 dark:text-purple-400 shadow-xs border border-slate-200 dark:border-[#20273f]'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#111422]'
              }`}
            >
              <div className={`p-1.5 rounded-md ${activeTab === 'msa' ? 'bg-purple-500/15 text-purple-500' : 'bg-slate-200/50 dark:bg-[#1a2033]'}`}>
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold text-xs">{isRu ? 'Алгоритм MSA' : 'MSA Solver Engine'}</div>
                <div className="text-4xs text-slate-400">{isRu ? 'TRF против DE, итерации' : 'TRF vs DE, Iterations'}</div>
              </div>
            </button>

            <div className="mt-auto p-3 rounded-lg border border-slate-200/60 dark:border-[#1a2033] bg-white/40 dark:bg-[#0c0f18]/60 text-4xs text-slate-500 space-y-1.5">
              <div className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>ISCWSA OWSG Spec</span>
              </div>
              <div>
                {isRu
                  ? 'Параметры автоматически каскадируются в расчет эллипсоидов EOU и антиколлизию.'
                  : 'Settings automatically cascade into 3D EOU and proximity calculations.'}
              </div>
            </div>
          </nav>

          <form onSubmit={handleSave} className="flex-1 flex flex-col justify-between overflow-hidden bg-white dark:bg-[#0c0e17]">
            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              {activeTab === 'location' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-[#1c2236] bg-slate-50/50 dark:bg-[#0e111d] space-y-3">
                    <div className="text-3xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-sky-500" />
                      <span>{isRu ? 'ИДЕНТИФИКАЦИЯ И РАСПОЛОЖЕНИЕ СКВАЖИНЫ' : 'WELLBORE IDENTIFICATION'}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">{isRu ? 'Кустовая площадка' : 'Pad Name'}</label>
                        <input
                          type="text"
                          value={padName}
                          onChange={(e) => setPadName(e.target.value)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">{isRu ? 'Имя скважины' : 'Wellbore Name'}</label>
                        <input
                          type="text"
                          value={wellName}
                          onChange={(e) => setWellName(e.target.value)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 font-bold text-sky-600 dark:text-sky-400 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">{isRu ? 'Слот / Ось направления' : 'Slot Identifier'}</label>
                        <input
                          type="text"
                          value={slot}
                          onChange={(e) => setSlot(e.target.value)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 dark:border-[#1c2236] bg-slate-50/50 dark:bg-[#0e111d] space-y-3">
                    <div className="text-3xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <Navigation className="w-3.5 h-3.5 text-sky-500" />
                      <span>{isRu ? 'ГЕОДЕЗИЧЕСКИЕ КООРДИНАТЫ (WGS-84 / UTM)' : 'GEODETIC POSITIONING (WGS-84)'}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">
                          {isRu ? 'Географическая широта (Latitude, °)' : 'Latitude (°)'}
                        </label>
                        <input
                          type="number"
                          step="0.000001"
                          value={latitude}
                          onChange={(e) => setLatitude(parseFloat(e.target.value) || 0)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 font-semibold text-sky-600 dark:text-sky-400 focus:outline-none focus:border-sky-500"
                        />
                        <div className="text-4xs text-slate-400 mt-1">
                          {latitude >= 0 ? `${latitude.toFixed(6)}° N (Northern Hemisphere)` : `${Math.abs(latitude).toFixed(6)}° S`}
                        </div>
                      </div>

                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">
                          {isRu ? 'Географическая долгота (Longitude, °)' : 'Longitude (°)'}
                        </label>
                        <input
                          type="number"
                          step="0.000001"
                          value={longitude}
                          onChange={(e) => setLongitude(parseFloat(e.target.value) || 0)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 font-semibold text-sky-600 dark:text-sky-400 focus:outline-none focus:border-sky-500"
                        />
                        <div className="text-4xs text-slate-400 mt-1">
                          {longitude >= 0 ? `${longitude.toFixed(6)}° E (Eastern Hemisphere)` : `${Math.abs(longitude).toFixed(6)}° W`}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 dark:border-[#1c2236] bg-slate-50/50 dark:bg-[#0e111d] space-y-3">
                    <div className="text-3xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <Ruler className="w-3.5 h-3.5 text-sky-500" />
                      <span>{isRu ? 'ВЫСОТНЫЕ ОТМЕТКИ И СТРУКТУРНЫЙ ДАТУМ' : 'ELEVATIONS & VERTICAL DATUM'}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">{isRu ? 'Стол ротора RKB (м)' : 'RKB Datum Elevation (m)'}</label>
                        <input
                          type="number"
                          step="0.1"
                          value={rkbElevation}
                          onChange={(e) => setRkbElevation(parseFloat(e.target.value) || 0)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 font-semibold text-emerald-600 dark:text-emerald-400 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">{isRu ? 'Уровень земли GL (м)' : 'Ground Level GL (m)'}</label>
                        <input
                          type="number"
                          step="0.1"
                          value={glElevation}
                          onChange={(e) => setGlElevation(parseFloat(e.target.value) || 0)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">{isRu ? 'Высота ротора Air Gap' : 'Air Gap (RKB - GL)'}</label>
                        <div className="w-full bg-slate-100 dark:bg-[#151928] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 font-bold text-slate-700 dark:text-slate-300">
                          +{airGap} m
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'geomag' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-[#1c2236] bg-slate-50/50 dark:bg-[#0e111d]">
                    <div>
                      <label className="block text-3xs text-slate-400 uppercase font-semibold mb-1">
                        {isRu ? 'Глобальная модель геомагнетизма' : 'Reference Model Standard'}
                      </label>
                      <select
                        value={model}
                        onChange={(e) => setModel(e.target.value as any)}
                        className="bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                      >
                        <option value="WMM 2025">World Magnetic Model 2025 (WMM Open Standard)</option>
                        <option value="IGRF-13">International Geomagnetic Reference Field (IAGA IGRF)</option>
                        <option value="HDGM">High Definition Geomagnetic Model (HDGM Crustal)</option>
                        <option value="BGGM">British Geological Survey Global Model (BGGM)</option>
                        <option value="IFR">Interpolated In-Field Referencing (IFR1 Local Aeromag)</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={handleAutoCalculateGeomag}
                      disabled={isAutoCalculating}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs bg-sky-500/15 text-sky-600 dark:text-sky-400 hover:bg-sky-500/25 border border-sky-500/30 transition-all disabled:opacity-50 shrink-0"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${isAutoCalculating ? 'animate-spin' : ''}`} />
                      <span>{isAutoCalculating ? (isRu ? 'Вычисление...' : 'Computing...') : (isRu ? 'Авторасчет WMM из координат' : 'Auto WMM from Coordinates')}</span>
                    </button>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 dark:border-[#1c2236] bg-slate-50/50 dark:bg-[#0e111d] space-y-3">
                    <div className="text-3xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      {isRu ? 'ОПОРНЫЕ ПАРАМЕТРЫ ПОЛЯ КУСТОВОЙ ПЛОЩАДКИ' : 'REFERENCE FIELD COMPONENTS'}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">Btotal (nT)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={bRef}
                          onChange={(e) => setBRef(parseFloat(e.target.value) || 0)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 font-bold text-sky-600 dark:text-sky-400 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">Dip Angle (°)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={dipRef}
                          onChange={(e) => setDipRef(parseFloat(e.target.value) || 0)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">Declination (°E)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={declination}
                          onChange={(e) => setDeclination(parseFloat(e.target.value) || 0)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">Convergence (°)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={gridConvergence}
                          onChange={(e) => setGridConvergence(parseFloat(e.target.value) || 0)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 dark:border-[#1c2236] bg-slate-50/50 dark:bg-[#0e111d] space-y-3">
                    <div className="text-3xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      {isRu ? 'ДОПУСКИ КОНТРОЛЯ КАЧЕСТВА (QC SPECIFICATION)' : 'QC ACCEPTANCE TOLERANCE WINDOWS'}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">Δ Gtotal Tolerance (g)</label>
                        <input
                          type="number"
                          step="0.001"
                          value={tolG}
                          onChange={(e) => setTolG(parseFloat(e.target.value) || 0)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">Δ Btotal Tolerance (nT)</label>
                        <input
                          type="number"
                          value={tolB}
                          onChange={(e) => setTolB(parseInt(e.target.value, 10) || 0)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">Δ Dip Tolerance (°)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={tolDip}
                          onChange={(e) => setTolDip(parseFloat(e.target.value) || 0)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'bha' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-[#1c2236] bg-slate-50/50 dark:bg-[#0e111d]">
                    <div className="text-3xs uppercase font-bold text-slate-400">{isRu ? 'Шаблоны типоразмеров КНБК:' : 'BHA Presets:'}</div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => applyPreset('standard')}
                        className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#151928] border border-slate-200 dark:border-[#26304b] hover:border-sky-500 text-3xs font-semibold transition-colors"
                      >
                        6-3/4" (171 mm)
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPreset('slim')}
                        className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#151928] border border-slate-200 dark:border-[#26304b] hover:border-sky-500 text-3xs font-semibold transition-colors"
                      >
                        4-3/4" (121 mm)
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPreset('heavy')}
                        className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#151928] border border-slate-200 dark:border-[#26304b] hover:border-sky-500 text-3xs font-semibold transition-colors"
                      >
                        8" (203 mm)
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 dark:border-[#1c2236] bg-slate-50/50 dark:bg-[#0e111d] space-y-3">
                    <div className="text-3xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      {isRu ? 'ГЕОМЕТРИЯ ВОРОТНИКА (УБТ/НБТ) И РАССТОЯНИЯ' : 'COLLAR DIMENSIONS & COMPONENT SPACING'}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">{isRu ? 'Наружный OD (мм)' : 'Collar OD (mm)'}</label>
                        <input
                          type="number"
                          step="0.1"
                          value={collarOd}
                          onChange={(e) => setCollarOd(parseFloat(e.target.value) || 0)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">{isRu ? 'Внутренний ID (мм)' : 'Collar ID (mm)'}</label>
                        <input
                          type="number"
                          step="0.1"
                          value={collarId}
                          onChange={(e) => setCollarId(parseFloat(e.target.value) || 0)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">{isRu ? 'Долото → Датчик (м)' : 'Bit to Sensor (m)'}</label>
                        <input
                          type="number"
                          step="0.1"
                          value={sensorToBit}
                          onChange={(e) => setSensorToBit(parseFloat(e.target.value) || 0)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">{isRu ? 'Долото → Центратор (м)' : 'Bit to Stabilizer (m)'}</label>
                        <input
                          type="number"
                          step="0.1"
                          value={stabDist}
                          onChange={(e) => setStabDist(parseFloat(e.target.value) || 0)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-[#1c2236] bg-slate-50/50 dark:bg-[#0e111d] space-y-3">
                      <div className="text-3xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        {isRu ? 'ПАРАМЕТРЫ РАСТВОРА И СТАЛИ' : 'FLUID DENSITY & MATERIAL'}
                      </div>
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">{isRu ? 'Удельный вес раствора (г/см³)' : 'Mud Weight (g/cm³)'}</label>
                        <input
                          type="number"
                          step="0.01"
                          value={mudWeight}
                          onChange={(e) => setMudWeight(parseFloat(e.target.value) || 0)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 font-bold text-sky-600 dark:text-sky-400 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">{isRu ? 'Материал секции датчика' : 'Collar Material'}</label>
                        <select
                          value={material}
                          onChange={(e) => setMaterial(e.target.value as any)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                        >
                          <option value="nm_steel">{isRu ? 'Немагнитная сталь (E = 190 GPa)' : 'Non-Magnetic Steel (190 GPa)'}</option>
                          <option value="steel">{isRu ? 'Конструкционная сталь (E = 205 GPa)' : 'Carbon Steel (205 GPa)'}</option>
                        </select>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex flex-col justify-between">
                      <div className="space-y-1">
                        <div className="text-3xs font-bold text-emerald-900 dark:text-emerald-300 uppercase flex items-center gap-1.5">
                          <Gauge className="w-4 h-4 text-emerald-500" />
                          <span>{isRu ? 'Расчетный прогиб балки (Inc = 90°)' : 'Max Theoretical Sag (at Inc = 90°)'}</span>
                        </div>
                        <div className="text-4xs text-emerald-700/80 dark:text-emerald-400/80 leading-relaxed">
                          {isRu
                            ? 'Аналитический изгиб балки Эйлера-Бернулли с компенсацией плавучести в растворе по стандарту ISCWSA SAG Rev 4.'
                            : 'Euler-Bernoulli beam slope deflection with hydrostatic buoyancy factor according to ISCWSA SAG Rev 4 standard.'}
                        </div>
                      </div>
                      <div className="pt-3 border-t border-emerald-500/20 flex items-baseline justify-between">
                        <span className="text-3xs text-emerald-800 dark:text-emerald-300 font-semibold">{isRu ? 'Угол отклонения:' : 'Deflection Angle:'}</span>
                        <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                          {previewSagAngle}°
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'msa' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-[#1c2236] bg-slate-50/50 dark:bg-[#0e111d] space-y-3">
                    <div className="text-3xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-purple-500" />
                      <span>{isRu ? 'ВЫБОР ОПТИМИЗАТОРА ЭКСТРЕМУМА ДЛЯ КАЛИБРОВКИ MSA' : 'OPTIMIZATION SOLVER SELECTION'}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setSolverMethod('trf')}
                        className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between ${
                          solverMethod === 'trf'
                            ? 'border-purple-500 bg-purple-500/10 shadow-sm'
                            : 'border-slate-200 dark:border-[#1f263c] bg-white dark:bg-[#121624] hover:border-slate-300'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-sm text-purple-600 dark:text-purple-400">TRF (NLLS)</span>
                            <span className="px-2 py-0.5 rounded text-4xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                              ~25 ms • Рекомендуется
                            </span>
                          </div>
                          <p className="text-4xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            {isRu
                              ? 'Trust Region Reflective: скоростной детерминированный градиентный спуск нелинейных наименьших квадратов. Идеален для онлайн-контроля бурения.'
                              : 'Trust Region Reflective: high-speed deterministic gradient least squares. Recommended for real-time wellbore monitoring.'}
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSolverMethod('de')}
                        className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between ${
                          solverMethod === 'de'
                            ? 'border-purple-500 bg-purple-500/10 shadow-sm'
                            : 'border-slate-200 dark:border-[#1f263c] bg-white dark:bg-[#121624] hover:border-slate-300'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-sm text-purple-600 dark:text-purple-400">DE (Global)</span>
                            <span className="px-2 py-0.5 rounded text-4xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400">
                              ~2-4 s • Глобальный поиск
                            </span>
                          </div>
                          <p className="text-4xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            {isRu
                              ? 'Differential Evolution: стохастический генетический алгоритм с глобальным перебором. Полезен при сильных аномалиях и подозрении на локальные минимумы.'
                              : 'Differential Evolution: stochastic global search. Robust against multi-modal deceptive parameter landscapes.'}
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 dark:border-[#1c2236] bg-slate-50/50 dark:bg-[#0e111d] space-y-3">
                    <div className="text-3xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      {isRu ? 'ВЫЧИСЛИТЕЛЬНЫЙ БЮДЖЕТ И ПАРАМЕТРЫ СХОДИМОСТИ' : 'CONVERGENCE BUDGET & ITERATIONS'}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-3xs text-slate-400 mb-1">
                          {isRu ? 'Лимит итераций / поколений (Max Iterations)' : 'Max Iterations Budget'}
                        </label>
                        <input
                          type="number"
                          min={10}
                          max={300}
                          value={maxIter}
                          onChange={(e) => setMaxIter(parseInt(e.target.value, 10) || 50)}
                          className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 font-bold text-purple-600 dark:text-purple-400 focus:outline-none focus:border-sky-500"
                        />
                      </div>

                      {solverMethod === 'de' && (
                        <div>
                          <label className="block text-3xs text-slate-400 mb-1">
                            {isRu ? 'Множитель популяции (DE Popsize)' : 'Population Multiplier'}
                          </label>
                          <input
                            type="number"
                            min={5}
                            max={30}
                            value={popsize}
                            onChange={(e) => setPopsize(parseInt(e.target.value, 10) || 15)}
                            className="w-full bg-white dark:bg-[#141826] border border-slate-200 dark:border-[#222a42] rounded-md px-3 py-1.5 font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 dark:border-[#1c2236] bg-slate-50/50 dark:bg-[#0e111d] space-y-3">
                    <div className="text-3xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      {isRu ? 'ФИЗИЧЕСКИЕ СТЕПЕНИ СВОБОДЫ КАЛИБРОВКИ' : 'CALIBRATION DEGREES OF FREEDOM'}
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#131726] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={enableMisalignment}
                          onChange={(e) => setEnableMisalignment(e.target.checked)}
                          className="w-4 h-4 rounded-xs accent-purple-600"
                        />
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {isRu ? 'Калибровать взаимные перекосы осей (Mxy, Mxz, Myz)' : 'Calibrate sensor block misalignments'}
                          </div>
                          <div className="text-4xs text-slate-400">
                            {isRu ? 'Оценивает угловую неортогональность между триадами акселерометров и магнитометров.' : 'Solves for angular cross-talk between accelerometer and magnetometer frames.'}
                          </div>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#131726] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={enableRefCorrections}
                          onChange={(e) => setEnableRefCorrections(e.target.checked)}
                          className="w-4 h-4 rounded-xs accent-purple-600"
                        />
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {isRu ? 'Оценивать дельты опорного геополя (ΔG, ΔB, ΔDip)' : 'Estimate residual reference field offsets'}
                          </div>
                          <div className="text-4xs text-slate-400">
                            {isRu ? 'Позволяет компенсировать локальные геофизические аномалии вмещающих пород.' : 'Accounts for local crustal anomalies around the drilling platform.'}
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="h-14 px-6 border-t flex items-center justify-between border-slate-200 dark:border-[#1c2236] bg-slate-50/80 dark:bg-[#090b12] shrink-0">
              <div className="text-4xs text-slate-400 hidden sm:block">
                {isRu ? 'Изменения сохраняются локально и передаются в ядро ArroWell Engine' : 'Changes apply immediately across trajectory computations'}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-[#1f263c] hover:bg-slate-100 dark:hover:bg-[#161a29] text-slate-600 dark:text-slate-400 font-semibold transition-colors"
                >
                  {isRu ? 'Отмена' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold shadow-md flex items-center gap-2 transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>{isRu ? 'Применить конфигурацию' : 'Save & Apply'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};