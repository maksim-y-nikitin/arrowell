import React, { useState, useEffect } from 'react';
import { useWellbore } from '@/context/WellboreContext';
import { GeomagneticReference, BhaConfig } from '@/types';
import { calculatePhysicalSagAngle } from '@/context/WellboreContext';
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
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'location' | 'geomag' | 'bha';

export const GeomagneticSettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const {
    geoRef,
    updateGeoRef,
    bhaConfig,
    updateBhaConfig,
    activePad,
    activeWell,
    updateWellProperties,
    notify,
    language,
  } = useWellbore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('location');
  const [isAutoCalculating, setIsAutoCalculating] = useState<boolean>(false);

  // Safe defaults against undefined to avoid "uncontrolled to controlled" warning
  const [padName, setPadName] = useState<string>(activePad?.name || '');
  const [wellName, setWellName] = useState<string>(activeWell?.name || '');
  const [slot, setSlot] = useState<string>(activeWell?.slot || 'Slot #1');
  const [latitude, setLatitude] = useState<number>(activePad?.latitude ?? 61.1245);
  const [longitude, setLongitude] = useState<number>(activePad?.longitude ?? 76.7132);
  const [rkbElevation, setRkbElevation] = useState<number>(activeWell?.datumElevation ?? 54.2);
  const [glElevation, setGlElevation] = useState<number>(activePad?.groundElevation ?? 48.5);
  const [datum, setDatum] = useState<string>(activePad?.datum || 'MSL WGS-84');
  const [targetFormation, setTargetFormation] = useState<string>(activeWell?.targetFormation || 'BV8');

  // Tab 2: Geomagnetic Reference State
  const [model, setModel] = useState<GeomagneticReference['model']>(geoRef?.model || 'WMM 2025');
  const [bRef, setBRef] = useState<number>(geoRef?.bTotalRef ?? 52480);
  const [dipRef, setDipRef] = useState<number>(geoRef?.dipRef ?? 72.15);
  const [declination, setDeclination] = useState<number>(geoRef?.declination ?? 12.42);
  const [gridConvergence, setGridConvergence] = useState<number>(geoRef?.gridConvergence ?? 1.25);
  const [tolG, setTolG] = useState<number>(geoRef?.toleranceG ?? 0.005);
  const [tolB, setTolB] = useState<number>(geoRef?.toleranceB ?? 200);
  const [tolDip, setTolDip] = useState<number>(geoRef?.toleranceDip ?? 0.30);

  // Tab 3: BHA / SAG State
  const [collarOd, setCollarOd] = useState<number>(bhaConfig?.collarOdMm ?? 171.5);
  const [collarId, setCollarId] = useState<number>(bhaConfig?.collarIdMm ?? 71.4);
  const [sensorToBit, setSensorToBit] = useState<number>(bhaConfig?.sensorToBitM ?? 14.2);
  const [stabDist, setStabDist] = useState<number>(bhaConfig?.stabilizerDistM ?? 21.5);
  const [mudWeight, setMudWeight] = useState<number>(bhaConfig?.mudWeightGcm3 ?? 1.20);
  const [material, setMaterial] = useState<BhaConfig['bhaMaterial']>(bhaConfig?.bhaMaterial ?? 'nm_steel');

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
        model: model.includes('IGRF') ? 'IGRF2020' : 'WMM2020',
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
          ? 'Не удалось рассчитать эталон (проверьте связь с сервером)'
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

    // Безопасный вызов updateWellProperties
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

    notify(
      isRu
        ? 'Параметры устья, геомагнетизма и КНБК успешно сохранены'
        : 'Wellhead location, geomagnetic, and BHA properties saved',
      'success'
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none font-mono text-xs">
      <div className="w-full max-w-xl rounded-xl border shadow-2xl overflow-hidden flex flex-col transition-colors bg-white dark:bg-[#0f121d] border-slate-200 dark:border-[#20273d] text-slate-800 dark:text-slate-200">
        {/* Header */}
        <div className="h-11 px-4 border-b flex items-center justify-between border-slate-200 dark:border-[#1e2439] bg-slate-50 dark:bg-[#131726]">
          <div className="flex items-center gap-2 font-semibold">
            <Sliders className="w-4 h-4 text-sky-500" />
            <span>{isRu ? 'Инженерные параметры скважины и куста' : 'Wellbore Engineering & Pad Properties'}</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3 Tabs Segmented Switcher */}
        <div className="flex border-b border-slate-200 dark:border-[#1c2236] bg-slate-100/70 dark:bg-[#111524] p-1 gap-1 text-3xs">
          <button
            type="button"
            onClick={() => setActiveTab('location')}
            className={`flex-1 py-1.5 rounded-md font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'location'
                ? 'bg-white dark:bg-[#1e253c] text-sky-600 dark:text-sky-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{isRu ? '1. Устье и геодезия' : '1. Location & Datum'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('geomag')}
            className={`flex-1 py-1.5 rounded-md font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'geomag'
                ? 'bg-white dark:bg-[#1e253c] text-sky-600 dark:text-sky-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>{isRu ? '2. Геомагнетизм (WMM)' : '2. Geomagnetic (WMM)'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('bha')}
            className={`flex-1 py-1.5 rounded-md font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'bha'
                ? 'bg-white dark:bg-[#1e253c] text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{isRu ? '3. КНБК и SAG' : '3. BHA & SAG'}</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-4 space-y-3.5 max-h-[78vh] overflow-y-auto">
          {/* TAB 1: WELLHEAD LOCATION & DATUMS */}
          {activeTab === 'location' && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg border border-slate-200 dark:border-[#1e253c] bg-slate-50 dark:bg-[#121624] space-y-2.5">
                <div className="text-3xs font-semibold text-slate-600 dark:text-slate-400 uppercase flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 text-sky-500" />
                  <span>{isRu ? 'ИДЕНТИФИКАЦИЯ СКВАЖИНЫ' : 'WELL IDENTIFICATION'}</span>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-3xs text-slate-400">{isRu ? 'Кустовая площ.' : 'Pad / Cluster'}</label>
                    <input
                      type="text"
                      value={padName ?? ''}
                      onChange={(e) => setPadName(e.target.value)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                    />
                  </div>

                  <div>
                    <label className="block text-3xs text-slate-400">{isRu ? 'Имя скважины' : 'Wellbore Name'}</label>
                    <input
                      type="text"
                      value={wellName ?? ''}
                      onChange={(e) => setWellName(e.target.value)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1 font-semibold text-sky-600 dark:text-sky-400"
                    />
                  </div>

                  <div>
                    <label className="block text-3xs text-slate-400">{isRu ? 'Слот / Ось' : 'Slot #'}</label>
                    <input
                      type="text"
                      value={slot ?? ''}
                      onChange={(e) => setSlot(e.target.value)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                    />
                  </div>
                </div>
              </div>

              {/* Surface Coordinates */}
              <div className="p-3 rounded-lg border border-slate-200 dark:border-[#1e253c] bg-slate-50 dark:bg-[#121624] space-y-2.5">
                <div className="text-3xs font-semibold text-slate-600 dark:text-slate-400 uppercase flex items-center gap-1.5">
                  <Navigation className="w-3 h-3 text-sky-500" />
                  <span>{isRu ? 'ГЕОГРАФИЧЕСКИЕ КООРДИНАТЫ УСТЬЯ' : 'SURFACE GEOGRAPHIC COORDINATES'}</span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-3xs text-slate-400">
                      {isRu ? 'Широта (Latitude, °)' : 'Latitude (°)'}
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      value={latitude ?? 0}
                      onChange={(e) => setLatitude(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1 font-semibold text-sky-600 dark:text-sky-400"
                    />
                    <span className="text-4xs text-slate-400">{latitude >= 0 ? `${latitude.toFixed(6)}° N` : `${Math.abs(latitude).toFixed(6)}° S`}</span>
                  </div>

                  <div>
                    <label className="block text-3xs text-slate-400">
                      {isRu ? 'Долгота (Longitude, °)' : 'Longitude (°)'}
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      value={longitude ?? 0}
                      onChange={(e) => setLongitude(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1 font-semibold text-sky-600 dark:text-sky-400"
                    />
                    <span className="text-4xs text-slate-400">{longitude >= 0 ? `${longitude.toFixed(6)}° E` : `${Math.abs(longitude).toFixed(6)}° W`}</span>
                  </div>
                </div>
              </div>

              {/* Elevations & Datums */}
              <div className="p-3 rounded-lg border border-slate-200 dark:border-[#1e253c] bg-slate-50 dark:bg-[#121624] space-y-2.5">
                <div className="text-3xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                  {isRu ? 'ВЫСОТНЫЕ ОТМЕТКИ И ДАТУМ (ELEVATIONS)' : 'VERTICAL DATUMS & ELEVATIONS'}
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-3xs text-slate-400">
                      {isRu ? 'Стол ротора RKB (м)' : 'RKB Datum (m)'}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={rkbElevation ?? 0}
                      onChange={(e) => setRkbElevation(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1 font-semibold text-emerald-600 dark:text-emerald-400"
                    />
                  </div>

                  <div>
                    <label className="block text-3xs text-slate-400">
                      {isRu ? 'Уровень земли GL (м)' : 'Ground Level GL (m)'}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={glElevation ?? 0}
                      onChange={(e) => setGlElevation(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                    />
                  </div>

                  <div>
                    <label className="block text-3xs text-slate-400">
                      {isRu ? 'Высота ротора (м)' : 'Air Gap (m)'}
                    </label>
                    <div className="w-full bg-slate-100 dark:bg-[#161a29] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1 text-slate-700 dark:text-slate-300 font-semibold">
                      +{airGap} m
                    </div>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-3xs text-slate-400">{isRu ? 'Вертикальный датум' : 'Elevation Datum'}</label>
                    <input
                      type="text"
                      value={datum ?? ''}
                      onChange={(e) => setDatum(e.target.value)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                    />
                  </div>

                  <div className="col-span-1">
                    <label className="block text-3xs text-slate-400">{isRu ? 'Целевой пласт' : 'Target Zone'}</label>
                    <input
                      type="text"
                      value={targetFormation ?? ''}
                      onChange={(e) => setTargetFormation(e.target.value)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GEOMAGNETIC & QC */}
          {activeTab === 'geomag' && (
            <div className="space-y-3">
              <div>
                <label className="block text-3xs text-slate-500 uppercase mb-1">
                  {isRu ? 'Базовая глобальная модель' : 'Global Reference Model'}
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value as any)}
                  className="w-full bg-white dark:bg-[#161a29] border border-slate-200 dark:border-[#242c43] rounded-md px-2.5 py-1.5 font-medium focus:outline-none focus:border-sky-500"
                >
                  <option value="WMM 2025">World Magnetic Model 2025 (WMM)</option>
                  <option value="IGRF-13">International Geomagnetic Reference Field (IGRF-13)</option>
                  <option value="HDGM">High Definition Geomagnetic Model (HDGM)</option>
                  <option value="BGGM">British Geological Survey Global Model (BGGM)</option>
                  <option value="IFR">Interpolated In-Field Referencing (IFR)</option>
                </select>
              </div>

              <div className="p-3 rounded-lg border border-slate-200 dark:border-[#1e253c] bg-slate-50 dark:bg-[#121624] space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-3xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <MapPin className="w-3 h-3 text-sky-500" />
                    <span>{isRu ? `КУСТ: ${padName}` : `PAD: ${padName}`}</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleAutoCalculateGeomag}
                    disabled={isAutoCalculating}
                    className="flex items-center gap-1 px-2.5 py-1 rounded text-3xs font-semibold bg-sky-500/15 text-sky-600 dark:text-sky-400 hover:bg-sky-500/25 border border-sky-500/30 transition-colors disabled:opacity-50"
                  >
                    <Sparkles className={`w-3 h-3 ${isAutoCalculating ? 'animate-spin' : ''}`} />
                    <span>
                      {isAutoCalculating
                        ? (isRu ? 'Расчет...' : 'Computing...')
                        : (isRu ? 'Авторасчет WMM по координатам' : 'Auto WMM from Coords')}
                    </span>
                  </button>
                </div>

                <div className="text-4xs text-slate-400 flex items-center gap-3 bg-white/50 dark:bg-[#0c0e17]/50 p-1.5 rounded border border-slate-200/50 dark:border-[#1c2236]">
                  <span>Lat: {latitude.toFixed(4)}°</span>
                  <span>•</span>
                  <span>Lon: {longitude.toFixed(4)}°</span>
                  <span>•</span>
                  <span>Alt: {glElevation}m MSL</span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <label className="block text-3xs text-slate-400">Btotal (nT)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={bRef ?? 0}
                      onChange={(e) => setBRef(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1 font-semibold text-sky-600 dark:text-sky-400"
                    />
                  </div>

                  <div>
                    <label className="block text-3xs text-slate-400">Dip Angle (°)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={dipRef ?? 0}
                      onChange={(e) => setDipRef(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                    />
                  </div>

                  <div>
                    <label className="block text-3xs text-slate-400">Declination (°E)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={declination ?? 0}
                      onChange={(e) => setDeclination(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                    />
                  </div>

                  <div>
                    <label className="block text-3xs text-slate-400">Convergence (°)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={gridConvergence ?? 0}
                      onChange={(e) => setGridConvergence(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                    />
                  </div>
                </div>
              </div>

              {/* QC Tolerances */}
              <div className="p-3 rounded-lg border border-slate-200 dark:border-[#1e253c] bg-slate-50 dark:bg-[#121624] space-y-2.5">
                <div className="text-3xs font-semibold text-slate-600 dark:text-slate-400">
                  {isRu ? 'ДОПУСКИ QC ОТКЛОНЕНИЙ' : 'QC ACCEPTANCE TOLERANCES'}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-3xs text-slate-400">Δ Gtot (g)</label>
                    <input
                      type="number"
                      step="0.001"
                      value={tolG ?? 0}
                      onChange={(e) => setTolG(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                    />
                  </div>

                  <div>
                    <label className="block text-3xs text-slate-400">Δ Btot (nT)</label>
                    <input
                      type="number"
                      value={tolB ?? 0}
                      onChange={(e) => setTolB(parseInt(e.target.value, 10) || 0)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                    />
                  </div>

                  <div>
                    <label className="block text-3xs text-slate-400">Δ Dip (°)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tolDip ?? 0}
                      onChange={(e) => setTolDip(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BHA & SAG DEFLECTION */}
          {activeTab === 'bha' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-[#121624] border border-slate-200 dark:border-[#1e253c]">
                <span className="text-3xs text-slate-400 uppercase font-semibold">
                  {isRu ? 'Шаблоны КНБК:' : 'BHA Presets:'}
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyPreset('standard')}
                    className="px-2 py-0.5 rounded text-3xs bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#26304a] hover:border-sky-500 transition-colors"
                  >
                    6-3/4" (171мм)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('slim')}
                    className="px-2 py-0.5 rounded text-3xs bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#26304a] hover:border-sky-500 transition-colors"
                  >
                    4-3/4" (121мм)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('heavy')}
                    className="px-2 py-0.5 rounded text-3xs bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#26304a] hover:border-sky-500 transition-colors"
                  >
                    8" (203мм)
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-slate-200 dark:border-[#1e253c] bg-slate-50 dark:bg-[#121624] space-y-2.5">
                <div className="text-3xs font-semibold text-slate-600 dark:text-slate-400">
                  {isRu ? 'ГЕОМЕТРИЯ УБТ И ДАТЧИКА' : 'COLLAR & SENSOR GEOMETRY'}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-3xs text-slate-400">{isRu ? 'Наружный диам. OD (мм)' : 'Collar OD (mm)'}</label>
                    <input
                      type="number"
                      step="0.1"
                      value={collarOd ?? 0}
                      onChange={(e) => setCollarOd(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1 font-semibold text-emerald-600 dark:text-emerald-400"
                    />
                  </div>

                  <div>
                    <label className="block text-3xs text-slate-400">{isRu ? 'Внутренний диам. ID (мм)' : 'Collar ID (mm)'}</label>
                    <input
                      type="number"
                      step="0.1"
                      value={collarId ?? 0}
                      onChange={(e) => setCollarId(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                    />
                  </div>

                  <div>
                    <label className="block text-3xs text-slate-400">{isRu ? 'Долото → Датчик MWD (м)' : 'Bit to MWD Sensor (m)'}</label>
                    <input
                      type="number"
                      step="0.1"
                      value={sensorToBit ?? 0}
                      onChange={(e) => setSensorToBit(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                    />
                  </div>

                  <div>
                    <label className="block text-3xs text-slate-400">{isRu ? 'Долото → Центратор (м)' : 'Bit to 1st Stabilizer (m)'}</label>
                    <input
                      type="number"
                      step="0.1"
                      value={stabDist ?? 0}
                      onChange={(e) => setStabDist(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                    />
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-slate-200 dark:border-[#1e253c] bg-slate-50 dark:bg-[#121624] space-y-2.5">
                <div className="text-3xs font-semibold text-slate-600 dark:text-slate-400">
                  {isRu ? 'БУРОВОЙ РАСТВОР И МАТЕРИАЛ' : 'DRILLING FLUID & MATERIAL'}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-3xs text-slate-400">{isRu ? 'Плотность раствора (г/см³)' : 'Mud Weight (g/cm³)'}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={mudWeight ?? 0}
                      onChange={(e) => setMudWeight(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1 font-semibold text-sky-600 dark:text-sky-400"
                    />
                  </div>

                  <div>
                    <label className="block text-3xs text-slate-400">{isRu ? 'Материал воротника' : 'Collar Material'}</label>
                    <select
                      value={material}
                      onChange={(e) => setMaterial(e.target.value as any)}
                      className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                    >
                      <option value="nm_steel">{isRu ? 'Немагнитная сталь (190 ГПа)' : 'Non-Magnetic (190 GPa)'}</option>
                      <option value="steel">{isRu ? 'Конструкционная сталь (205 ГПа)' : 'Carbon Steel (205 GPa)'}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-3xs font-semibold text-emerald-900 dark:text-emerald-300">
                      {isRu ? 'Расчетный угол прогиба датчика (при Inc = 90°):' : 'Analytical Sensor Sag (at Inc = 90°):'}
                    </div>
                    <div className="text-4xs text-emerald-700/80 dark:text-emerald-400/70">
                      {isRu ? 'Формула изгиба балки Эйлера-Бернулли с учетом плавучести' : 'Euler-Bernoulli beam deflection with fluid buoyancy'}
                    </div>
                  </div>
                </div>
                <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {previewSagAngle}°
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#1e2439]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-[#1c2236] text-slate-600 dark:text-slate-400"
            >
              {isRu ? 'Отмена' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white font-medium shadow-xs flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{isRu ? 'Применить параметры' : 'Apply Settings'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};