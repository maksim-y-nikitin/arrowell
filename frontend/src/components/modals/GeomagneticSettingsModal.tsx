import React, { useState, useEffect } from 'react';
import { useWellbore } from '@/context/WellboreContext';
import { BhaConfig } from '@/types';
import { calculatePhysicalSagAngle } from '@/utils/directionalMath';
import { calculateGeomagReference, updateWellGeomagReference } from '@/utils/api';
import {
  X,
  Compass,
  Check,
  Layers,
  Sliders,
  Sparkles,
  MapPin,
  Building2,
  Navigation,
  Cpu,
  ShieldCheck,
  Ruler,
  CheckCircle2,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'location' | 'geomag' | 'bha' | 'msa';

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

  const isRu = language === 'ru';

  const [activeTab, setActiveTab] = useState<SettingsTab>('location');
  const [isAutoCalculating, setIsAutoCalculating] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Wellhead & Datum state
  const [padName, setPadName] = useState<string>('');
  const [wellName, setWellName] = useState<string>('');
  const [slot, setSlot] = useState<string>('Slot #1');
  const [latitude, setLatitude] = useState<number | string>(61.1245);
  const [longitude, setLongitude] = useState<number | string>(76.7132);
  const [rkbElevation, setRkbElevation] = useState<number | string>(54.2);
  const [glElevation, setGlElevation] = useState<number | string>(48.5);
  const [datum, setDatum] = useState<string>('MSL WGS-84');
  const [targetFormation, setTargetFormation] = useState<string>('BV8');

  // Geomagnetic reference and ISCWSA tool error model state
  const [model, setModel] = useState<string>('WMM 2025');
  const [errorModel, setErrorModel] = useState<string>('ISCWSA_MWD_REV4');
  const [bRef, setBRef] = useState<number | string>(52480);
  const [dipRef, setDipRef] = useState<number | string>(72.15);
  const [declination, setDeclination] = useState<number | string>(12.42);
  const [gridConvergence, setGridConvergence] = useState<number | string>(1.25);
  const [gRef, setGRef] = useState<number | string>(1.0000);
  const [tolG, setTolG] = useState<number | string>(0.005);
  const [tolB, setTolB] = useState<number | string>(200);
  const [tolDip, setTolDip] = useState<number | string>(0.30);

  // BHA geometry state
  const [collarOd, setCollarOd] = useState<number | string>(171.5);
  const [collarId, setCollarId] = useState<number | string>(71.4);
  const [sensorToBit, setSensorToBit] = useState<number | string>(14.2);
  const [stabDist, setStabDist] = useState<number | string>(21.5);
  const [mudWeight, setMudWeight] = useState<number | string>(1.20);
  const [material, setMaterial] = useState<BhaConfig['bhaMaterial']>('nm_steel');

  // MSA engine configuration
  const [maxIter, setMaxIter] = useState<number | string>(100);
  const [enableMisalignment, setEnableMisalignment] = useState<boolean>(true);
  const [enableRefCorrections, setEnableRefCorrections] = useState<boolean>(true);

  // Синхронизация полей формы: срабатывает КАЖДЫЙ РАЗ при открытии окна (isOpen === true)
  useEffect(() => {
    if (!isOpen) return;

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

    if (geoRef) {
      setModel(geoRef.model || 'WMM 2025');
      setErrorModel(geoRef.errorModel || 'ISCWSA_MWD_REV4');
      setBRef(geoRef.bTotalRef ?? 52480);
      setDipRef(geoRef.dipRef ?? 72.15);
      setDeclination(geoRef.declination ?? 12.42);
      setGridConvergence(geoRef.gridConvergence ?? 1.25);
      setGRef(geoRef.gTotalRef ?? 1.0000);
      setTolG(geoRef.toleranceG ?? 0.005);
      setTolB(geoRef.toleranceB ?? 200);
      setTolDip(geoRef.toleranceDip ?? 0.30);
    }

    if (bhaConfig) {
      setCollarOd(bhaConfig.collarOdMm ?? 171.5);
      setCollarId(bhaConfig.collarIdMm ?? 71.4);
      setSensorToBit(bhaConfig.sensorToBitM ?? 14.2);
      setStabDist(bhaConfig.stabilizerDistM ?? 21.5);
      setMudWeight(bhaConfig.mudWeightGcm3 ?? 1.20);
      setMaterial(bhaConfig.bhaMaterial ?? 'nm_steel');
    }

    if (msaConfig) {
      setMaxIter(msaConfig.maxIter || 100);
      setEnableMisalignment(msaConfig.enableMisalignment ?? true);
      setEnableRefCorrections(msaConfig.enableRefCorrections ?? true);
    }
  }, [isOpen, activePad, activeWell, geoRef, bhaConfig, msaConfig]);

  if (!isOpen) return null;

  const numRkb = Number(rkbElevation) || 0;
  const numGl = Number(glElevation) || 0;
  const airGap = Number((numRkb - numGl).toFixed(2));

  // Расчет провисания КНБК в реальном времени
  const previewSagAngle = calculatePhysicalSagAngle({
    collarOdMm: Number(collarOd) || 171.5,
    collarIdMm: Number(collarId) || 71.4,
    sensorToBitM: Number(sensorToBit) || 14.2,
    stabilizerDistM: Number(stabDist) || 21.5,
    mudWeightGcm3: Number(mudWeight) || 1.20,
    bhaMaterial: material,
  });

  const handleAutoCalculateGeomag = async () => {
    setIsAutoCalculating(true);
    try {
      const cleanModelIdentifier = model.replace(/[^a-zA-Z0-9]/g, '');

      const res = await calculateGeomagReference({
        latitude: Number(latitude) || 0,
        longitude: Number(longitude) || 0,
        altitude_m: Number(glElevation) || 0,
        model: cleanModelIdentifier,
      });

      setBRef(res.b_total_ref);
      setDipRef(res.dip_ref);
      setDeclination(res.declination);
      setGridConvergence(res.grid_convergence);
      setGRef(res.g_total_ref);

      if (res.tolerance_g !== undefined) setTolG(res.tolerance_g);
      if (res.tolerance_b !== undefined) setTolB(res.tolerance_b);
      if (res.tolerance_dip !== undefined) setTolDip(res.tolerance_dip);

      notify(
        isRu
          ? `${model}: Btotal=${res.b_total_ref} нТл, Dip=${res.dip_ref}°, Gtotal=${res.g_total_ref} g`
          : `${model} computed: Btotal=${res.b_total_ref} nT, Dip=${res.dip_ref}°, Gtotal=${res.g_total_ref} g`,
        'success'
      );
    } catch {
      notify(
        isRu ? `Ошибка расчета параметров по модели ${model}` : `Failed to compute reference for ${model}`,
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const numBRef = Number(bRef) || 0;
      const numDipRef = Number(dipRef) || 0;
      const numDeclination = Number(declination) || 0;
      const numGridConv = Number(gridConvergence) || 0;
      const numGRef = Number(gRef) || 1.0;
      const numTolG = Number(tolG) || 0.005;
      const numTolB = Number(tolB) || 200;
      const numTolDip = Number(tolDip) || 0.30;

      const numLat = Number(latitude) || 0;
      const numLon = Number(longitude) || 0;
      const numRkbVal = Number(rkbElevation) || 0;
      const numGlVal = Number(glElevation) || 0;

      const numCollarOd = Number(collarOd) || 171.5;
      const numCollarId = Number(collarId) || 71.4;
      const numSensorToBit = Number(sensorToBit) || 14.2;
      const numStabDist = Number(stabDist) || 21.5;
      const numMudWeight = Number(mudWeight) || 1.20;
      const numMaxIter = Number(maxIter) || 100;

      // 1. Сохранение конфигурации в DuckDB на сервере
      if (activeWell?.id) {
        await updateWellGeomagReference(activeWell.id, {
          model,
          error_model: errorModel,
          b_total_ref: numBRef,
          dip_ref: numDipRef,
          declination: numDeclination,
          grid_convergence: numGridConv,
          g_total_ref: numGRef,
          tolerance_g: numTolG,
          tolerance_b: numTolB,
          tolerance_dip: numTolDip,
        });
      }

      // 2. Синхронизация глобального контекста React
      updateWellProperties({
        padName,
        wellName,
        slot,
        latitude: numLat,
        longitude: numLon,
        datumElevation: numRkbVal,
        groundElevation: numGlVal,
        datum,
        targetFormation,
      });

      updateGeoRef({
        model,
        errorModel,
        bTotalRef: numBRef,
        dipRef: numDipRef,
        declination: numDeclination,
        gridConvergence: numGridConv,
        gTotalRef: numGRef,
        toleranceG: numTolG,
        toleranceB: numTolB,
        toleranceDip: numTolDip,
      });

      updateBhaConfig({
        collarOdMm: numCollarOd,
        collarIdMm: numCollarId,
        sensorToBitM: numSensorToBit,
        stabilizerDistM: numStabDist,
        mudWeightGcm3: numMudWeight,
        bhaMaterial: material,
      });

      updateMsaConfig({
        maxIter: numMaxIter,
        enableMisalignment,
        enableRefCorrections,
        errorModel,
        geomagModel: model,
      });

      notify(
        isRu
          ? 'Конфигурация сохранена в DuckDB и применена к скважине'
          : 'Configuration saved to DuckDB and applied to wellbore',
        'success'
      );
    } catch (err: any) {
      notify(err.message || 'Error saving settings to database', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const navItemClass = (tab: SettingsTab, color: '' | 'acc' | 'okc' | 'mag') =>
    `nav-item ${activeTab === tab ? `on ${color}` : ''}`;

  return (
    <div className="modal-overlay">
      <div className="modal-window">
        <div className="modal-head">
          <div className="modal-title">
            <span className="modal-title-mark">
              <Sliders />
            </span>
            <span>{isRu ? 'Инженерная конфигурация' : 'Engineering Configuration'}</span>
            <span className="pill acc">{activeWell?.name}</span>
          </div>
          <button type="button" onClick={onClose} className="iconbtn" title={isRu ? 'Закрыть' : 'Close'}>
            <X />
          </button>
        </div>

        <div className="modal-body">
          <nav className="modal-nav !w-[236px]">
            <button
              type="button"
              onClick={() => setActiveTab('location')}
              className={navItemClass('location', 'acc')}
            >
              <MapPin />
              <div>
                <div className="nav-title whitespace-nowrap">{isRu ? 'Устье и датум' : 'Wellhead & Datum'}</div>
                <div className="nav-sub">WGS-84, RKB, GL</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('geomag')}
              className={navItemClass('geomag', 'acc')}
            >
              <Compass />
              <div>
                <div className="nav-title whitespace-nowrap">{isRu ? 'Геомагнетизм и ISCWSA' : 'Geomag & ISCWSA'}</div>
                <div className="nav-sub">Model & Error Setup</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('bha')}
              className={navItemClass('bha', 'okc')}
            >
              <Layers />
              <div>
                <div className="nav-title whitespace-nowrap">{isRu ? 'КНБК и прогиб' : 'BHA & Sag Deflection'}</div>
                <div className="nav-sub">Euler-Bernoulli</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('msa')}
              className={navItemClass('msa', 'mag')}
            >
              <Cpu />
              <div>
                <div className="nav-title whitespace-nowrap">{isRu ? 'Решатель MSA' : 'MSA Solver Engine'}</div>
                <div className="nav-sub">LRA-CMA + TRF Hybrid</div>
              </div>
            </button>

            <div className="side-note">
              <div className="side-note-head">
                <ShieldCheck />
                <span>ISCWSA Standard</span>
              </div>
              {isRu
                ? 'Параметры сохраняются в DuckDB и управляют расчетом MSA и траектории.'
                : 'Settings persist in DuckDB to drive MSA and trajectory calculations.'}
            </div>
          </nav>

          <form onSubmit={handleSave} className="modal-form">
            <div className="modal-content">
              {activeTab === 'location' && (
                <>
                  <div className="field-card">
                    <div className="field-card-head acc">
                      <Building2 />
                      <span>{isRu ? 'Идентификация скважины' : 'Wellbore Identification'}</span>
                    </div>
                    <div className="field-grid cols-3">
                      <div className="field">
                        <label className="field-label">{isRu ? 'Куст' : 'Pad Name'}</label>
                        <input
                          type="text"
                          value={padName}
                          onChange={(e) => setPadName(e.target.value)}
                          className="input"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">{isRu ? 'Скважина' : 'Well Name'}</label>
                        <input
                          type="text"
                          value={wellName}
                          onChange={(e) => setWellName(e.target.value)}
                          className="input bold acc"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">{isRu ? 'Слот' : 'Slot'}</label>
                        <input
                          type="text"
                          value={slot}
                          onChange={(e) => setSlot(e.target.value)}
                          className="input"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="field-card">
                    <div className="field-card-head acc">
                      <Navigation />
                      <span>
                        {isRu
                          ? 'Геодезические координаты (WGS-84)'
                          : 'Geodetic Coordinates (WGS-84)'}
                      </span>
                    </div>
                    <div className="field-grid cols-2">
                      <div className="field">
                        <label className="field-label">
                          {isRu ? 'Широта (°)' : 'Latitude (°)'}
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={latitude}
                          onChange={(e) => setLatitude(e.target.value)}
                          className="input mono"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">
                          {isRu ? 'Долгота (°)' : 'Longitude (°)'}
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={longitude}
                          onChange={(e) => setLongitude(e.target.value)}
                          className="input mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="field-card">
                    <div className="field-card-head acc">
                      <Ruler />
                      <span>{isRu ? 'Высоты и датум' : 'Elevations & Datum'}</span>
                    </div>
                    <div className="field-grid cols-3">
                      <div className="field">
                        <label className="field-label">RKB (m)</label>
                        <input
                          type="number"
                          step="any"
                          value={rkbElevation}
                          onChange={(e) => setRkbElevation(e.target.value)}
                          className="input mono okc"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">
                          {isRu ? 'Уровень земли (м)' : 'Ground GL (m)'}
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={glElevation}
                          onChange={(e) => setGlElevation(e.target.value)}
                          className="input mono"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">{isRu ? 'Зазор' : 'Air Gap'}</label>
                        <div className="readonly">+{airGap} m</div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'geomag' && (
                <>
                  <div className="preset-bar !items-end gap-3">
                    <div className="field flex-1 max-w-sm">
                      <label className="field-label">
                        {isRu ? 'Геомагнитный стандарт' : 'Geomagnetic Standard'}
                      </label>
                      <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="select font-semibold"
                      >
                        <option value="WMM 2025">WMM 2025 (World Magnetic Model)</option>
                        <option value="IGRF-14">IGRF-14 (IAGA Scientific Standard)</option>
                        <option value="HDGM">HDGM (High Definition Model)</option>
                        <option value="IFR1">IFR1 (Static In-Field Referencing)</option>
                        <option value="IFR2">IFR2 (Dynamic Base Station IFR)</option>
                      </select>
                    </div>

                    <div className="field flex-1 max-w-sm">
                      <label className="field-label">
                        {isRu ? 'Модель погрешности ISCWSA' : 'ISCWSA Tool Error Model'}
                      </label>
                      <select
                        value={errorModel}
                        onChange={(e) => setErrorModel(e.target.value)}
                        className="select font-semibold"
                      >
                        <option value="ISCWSA_MWD_REV4">ISCWSA MWD Rev 4 (Standard Industry)</option>
                        <option value="ISCWSA_MWD_REV5">ISCWSA MWD Rev 5.11 (Updated Noise)</option>
                        <option value="ISCWSA_MWD_IFR1_REV4">ISCWSA MWD + IFR1 (High Precision)</option>
                        <option value="ISCWSA_MWD_SAG_REV4">ISCWSA MWD + SAG (Corrected Sag)</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={handleAutoCalculateGeomag}
                      disabled={isAutoCalculating}
                      className="btn h-[30px] flex items-center gap-1.5 whitespace-nowrap"
                      title={isRu ? `Рассчитать параметры поля по модели ${model}` : `Compute field parameters using ${model}`}
                    >
                      <Sparkles
                        className={`w-3.5 h-3.5 text-[var(--accent)] ${
                          isAutoCalculating ? 'animate-spin' : ''
                        }`}
                      />
                      <span>
                        {isAutoCalculating
                          ? isRu ? 'Расчёт…' : 'Computing...'
                          : isRu ? 'Рассчитать по координатам' : 'Compute from Coords'}
                      </span>
                    </button>
                  </div>

                  <div className="field-card">
                    <div className="field-card-head">
                      <span>
                        {isRu
                          ? 'Компоненты опорного поля на скважине'
                          : 'Wellbore Reference Field Components'}
                      </span>
                    </div>
                    <div className="field-grid cols-5">
                      <div className="field">
                        <label className="field-label">Btotal (nT)</label>
                        <input
                          type="number"
                          step="any"
                          value={bRef}
                          onChange={(e) => setBRef(e.target.value)}
                          className="input mono acc"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">
                          {isRu ? 'Наклонение (°)' : 'Dip Angle (°)'}
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={dipRef}
                          onChange={(e) => setDipRef(e.target.value)}
                          className="input mono"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">
                          {isRu ? 'Склонение (°В)' : 'Declination (°E)'}
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={declination}
                          onChange={(e) => setDeclination(e.target.value)}
                          className="input mono"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">
                          {isRu ? 'Сближение (°)' : 'Convergence (°)'}
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={gridConvergence}
                          onChange={(e) => setGridConvergence(e.target.value)}
                          className="input mono"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">Gtotal (g)</label>
                        <input
                          type="number"
                          step="any"
                          value={gRef}
                          onChange={(e) => setGRef(e.target.value)}
                          className="input mono okc"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="field-card">
                    <div className="field-card-head">
                      <span>
                        {isRu
                          ? 'Допуски контроля качества (Дельты QC)'
                          : 'QC Acceptance Tolerances (Deltas)'}
                      </span>
                    </div>
                    <div className="field-grid cols-3">
                      <div className="field">
                        <label className="field-label">Δ Gtotal Tol (g)</label>
                        <input
                          type="number"
                          step="any"
                          value={tolG}
                          onChange={(e) => setTolG(e.target.value)}
                          className="input mono"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">Δ Btotal Tol (nT)</label>
                        <input
                          type="number"
                          step="any"
                          value={tolB}
                          onChange={(e) => setTolB(e.target.value)}
                          className="input mono"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">Δ Dip Tol (°)</label>
                        <input
                          type="number"
                          step="any"
                          value={tolDip}
                          onChange={(e) => setTolDip(e.target.value)}
                          className="input mono"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'bha' && (
                <>
                  <div className="preset-bar">
                    <span className="preset-label">{isRu ? 'Пресеты' : 'Presets'}</span>
                    <div className="seg">
                      <button
                        type="button"
                        onClick={() => applyPreset('standard')}
                      >
                        6-3/4" (171 mm)
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPreset('slim')}
                      >
                        4-3/4" (121 mm)
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPreset('heavy')}
                      >
                        8" (203 mm)
                      </button>
                    </div>
                  </div>

                  <div className="field-card">
                    <div className="field-card-head">
                      <span>{isRu ? 'Размеры и разнос УБТ' : 'Collar Dimensions & Spacing'}</span>
                    </div>
                    <div className="field-grid cols-4">
                      <div className="field">
                        <label className="field-label">OD (mm)</label>
                        <input
                          type="number"
                          step="any"
                          value={collarOd}
                          onChange={(e) => setCollarOd(e.target.value)}
                          className="input mono okc"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">ID (mm)</label>
                        <input
                          type="number"
                          step="any"
                          value={collarId}
                          onChange={(e) => setCollarId(e.target.value)}
                          className="input mono"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">{isRu ? 'Долото — датчик (м)' : 'Bit to Sensor (m)'}</label>
                        <input
                          type="number"
                          step="any"
                          value={sensorToBit}
                          onChange={(e) => setSensorToBit(e.target.value)}
                          className="input mono"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">{isRu ? 'Долото — калибратор (м)' : 'Bit to Stab (m)'}</label>
                        <input
                          type="number"
                          step="any"
                          value={stabDist}
                          onChange={(e) => setStabDist(e.target.value)}
                          className="input mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="field-grid cols-2">
                    <div className="field-card">
                      <div className="field-card-head">
                        <span>{isRu ? 'Плотность раствора и материал' : 'Fluid Density & Material'}</span>
                      </div>
                      <div className="field-grid">
                        <div className="field">
                          <label className="field-label">{isRu ? 'Плотность раствора (г/см³)' : 'Mud Weight (g/cm³)'}</label>
                          <input
                            type="number"
                            step="any"
                            value={mudWeight}
                            onChange={(e) => setMudWeight(e.target.value)}
                            className="input mono acc"
                          />
                        </div>
                        <div className="field">
                          <label className="field-label">{isRu ? 'Материал УБТ' : 'Collar Material'}</label>
                          <select
                            value={material}
                            onChange={(e) => setMaterial(e.target.value as any)}
                            className="select"
                          >
                            <option value="nm_steel">
                              {isRu ? 'Немагнитная сталь (190 ГПа)' : 'Non-Magnetic Steel (190 GPa)'}
                            </option>
                            <option value="steel">
                              {isRu ? 'Углеродистая сталь (205 ГПа)' : 'Carbon Steel (205 GPa)'}
                            </option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="stat-card">
                      <div>
                        <div className="stat-head">
                          <Ruler />
                          <span>{isRu ? 'Теоретический прогиб (при Inc = 90°)' : 'Theoretical Sag (at Inc = 90°)'}</span>
                        </div>
                        <p className="stat-desc">
                          {isRu
                            ? 'Прогиб балки Эйлера-Бернулли с учётом гидростатической плавучести.'
                            : 'Euler-Bernoulli beam slope deflection with hydrostatic buoyancy factor.'}
                        </p>
                      </div>
                      <div className="stat-value">
                        <span className="k">{isRu ? 'Прогиб:' : 'Deflection:'}</span>
                        <span className="v">{previewSagAngle}°</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'msa' && (
                <>
                  <div className="field-card">
                    <div className="field-card-head mag">
                      <Cpu />
                      <span>{isRu ? 'Вычислительное ядро MSA' : 'MSA Computation Engine'}</span>
                      <span className="pill acc ml-auto">{errorModel}</span>
                    </div>

                    <div className="p-3 rounded-[var(--r2)] border border-[var(--mag-line)] bg-[var(--mag-soft)] text-[var(--fg-0)] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[13px] text-[var(--mag)]">
                          {isRu
                            ? `LRA-CMA + TRF (Модель: ${errorModel})`
                            : `LRA-CMA + TRF (Model: ${errorModel})`}
                        </span>
                        <span className="pill ok flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{model}</span>
                        </span>
                      </div>

                      <p className="text-[11.5px] leading-relaxed text-[var(--fg-1)]">
                        {isRu
                          ? `Априорные сигмы калибровки извлекаются строго из паспорта ${errorModel}. Допуски дельт вычисляются по геомагнитной спецификации ${model}.`
                          : `Bayesian prior tolerances extracted directly from ${errorModel}. Delta thresholds driven by ${model} reference specs.`}
                      </p>

                      <div className="flex flex-wrap gap-2 pt-1 border-t border-[var(--mag-line)] text-[10.5px] font-mono text-[var(--fg-2)]">
                        <span>✓ {errorModel}</span>
                        <span>✓ {model}</span>
                        <span>✓ DuckDB Persistent</span>
                        <span>✓ Cov(p) = (JᵀJ)⁻¹</span>
                      </div>
                    </div>
                  </div>

                  <div className="field-card">
                    <div className="field-card-head">
                      <span>{isRu ? 'Бюджет оптимизации' : 'Optimization Budget'}</span>
                    </div>
                    <div className="field-grid cols-2">
                      <div className="field">
                        <label className="field-label">
                          {isRu ? 'Поколений LRA-CMA' : 'LRA-CMA Generations'}
                        </label>
                        <input
                          type="number"
                          min={30}
                          max={300}
                          step="1"
                          value={maxIter}
                          onChange={(e) => setMaxIter(e.target.value)}
                          className="input mono mag font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="field-card">
                    <div className="field-card-head">
                      <span>{isRu ? 'Степени свободы калибровки' : 'Calibration Degrees of Freedom'}</span>
                    </div>
                    <div className="field-grid">
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={enableMisalignment}
                          onChange={(e) => setEnableMisalignment(e.target.checked)}
                          className="accent-[var(--mag)]"
                        />
                        <span>
                          {isRu
                            ? 'Калибровать углы перекоса блока датчиков (Mxy, Mxz, Myz)'
                            : 'Calibrate sensor block misalignments (Mxy, Mxz, Myz)'}
                        </span>
                      </label>

                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={enableRefCorrections}
                          onChange={(e) => setEnableRefCorrections(e.target.checked)}
                          className="accent-[var(--mag)]"
                        />
                        <span>
                          {isRu
                            ? 'Оценивать остаточные смещения опорного поля (ΔG, ΔB, ΔDip)'
                            : 'Estimate residual reference field offsets (ΔG, ΔB, ΔDip)'}
                        </span>
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="modal-foot">
              <span className="foot-hint">
                {isRu
                  ? 'Параметры сохраняются в DuckDB и применяются ко всей скважине.'
                  : 'Parameters persist in DuckDB and apply across entire wellbore.'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn"
                  disabled={isSaving}
                >
                  {isRu ? 'Закрыть' : 'Close'}
                </button>
                <button
                  type="submit"
                  className="btn solid"
                  disabled={isSaving}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {isSaving
                      ? isRu ? 'Сохранение в DuckDB…' : 'Saving to DuckDB...'
                      : isRu ? 'Сохранить в DuckDB' : 'Save to DuckDB'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};