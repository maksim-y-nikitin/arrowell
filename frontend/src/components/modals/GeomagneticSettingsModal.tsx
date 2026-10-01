import React, { useState, useEffect } from 'react';
import { useWellbore } from '@/context/WellboreContext';
import { GeomagneticReference, BhaConfig } from '@/types';
import { calculatePhysicalSagAngle } from '@/utils/directionalMath';
import { calculateGeomagReference } from '@/utils/api';
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

  // Wellhead & Datum state
  const [padName, setPadName] = useState<string>(activePad?.name || '');
  const [wellName, setWellName] = useState<string>(activeWell?.name || '');
  const [slot, setSlot] = useState<string>(activeWell?.slot || 'Slot #1');
  const [latitude, setLatitude] = useState<number>(activePad?.latitude ?? 61.1245);
  const [longitude, setLongitude] = useState<number>(activePad?.longitude ?? 76.7132);
  const [rkbElevation, setRkbElevation] = useState<number>(activeWell?.datumElevation ?? 54.2);
  const [glElevation, setGlElevation] = useState<number>(activePad?.groundElevation ?? 48.5);
  const [datum, setDatum] = useState<string>(activePad?.datum || 'MSL WGS-84');
  const [targetFormation, setTargetFormation] = useState<string>(activeWell?.targetFormation || 'BV8');

  // Geomagnetic reference state
  const [model, setModel] = useState<GeomagneticReference['model']>(geoRef?.model || 'WMM 2025');
  const [bRef, setBRef] = useState<number>(geoRef?.bTotalRef ?? 52480);
  const [dipRef, setDipRef] = useState<number>(geoRef?.dipRef ?? 72.15);
  const [declination, setDeclination] = useState<number>(geoRef?.declination ?? 12.42);
  const [gridConvergence, setGridConvergence] = useState<number>(geoRef?.gridConvergence ?? 1.25);
  const [tolG, setTolG] = useState<number>(geoRef?.toleranceG ?? 0.005);
  const [tolB, setTolB] = useState<number>(geoRef?.toleranceB ?? 200);
  const [tolDip, setTolDip] = useState<number>(geoRef?.toleranceDip ?? 0.30);

  // BHA geometry state
  const [collarOd, setCollarOd] = useState<number>(bhaConfig?.collarOdMm ?? 171.5);
  const [collarId, setCollarId] = useState<number>(bhaConfig?.collarIdMm ?? 71.4);
  const [sensorToBit, setSensorToBit] = useState<number>(bhaConfig?.sensorToBitM ?? 14.2);
  const [stabDist, setStabDist] = useState<number>(bhaConfig?.stabilizerDistM ?? 21.5);
  const [mudWeight, setMudWeight] = useState<number>(bhaConfig?.mudWeightGcm3 ?? 1.20);
  const [material, setMaterial] = useState<BhaConfig['bhaMaterial']>(bhaConfig?.bhaMaterial ?? 'nm_steel');

  // MSA engine configuration (Default: 100 generations for LRA-CMA convergence)
  const [maxIter, setMaxIter] = useState<number>(msaConfig?.maxIter || 100);
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

  if (!isOpen) return null;

  const airGap = Number(((rkbElevation || 0) - (glElevation || 0)).toFixed(2));

  // Compute theoretical sag angle for live preview
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
          ? `WMM рассчитан: Btotal=${res.b_total_ref} нТл, Dip=${res.dip_ref}°, Dec=${res.declination}°`
          : `WMM computed: Btotal=${res.b_total_ref} nT, Dip=${res.dip_ref}°, Dec=${res.declination}°`,
        'success'
      );
    } catch {
      notify(
        isRu ? 'Не удалось рассчитать опорные параметры' : 'Failed to compute reference parameters',
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

    updateBhaConfig({
      collarOdMm: collarOd,
      collarIdMm: collarId,
      sensorToBitM: sensorToBit,
      stabilizerDistM: stabDist,
      mudWeightGcm3: mudWeight,
      bhaMaterial: material,
    });

    updateMsaConfig({
      maxIter,
      enableMisalignment,
      enableRefCorrections,
    });

    notify(
      isRu ? 'Инженерная конфигурация сохранена' : 'Engineering configuration successfully saved',
      'success'
    );
    onClose();
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
          <button type="button" onClick={onClose} className="iconbtn">
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
                <div className="nav-title whitespace-nowrap">{isRu ? 'Геомагнитная модель' : 'Geomagnetic Model'}</div>
                <div className="nav-sub">WMM 2025 Ref</div>
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
                ? 'Регуляризация по 1-sigma модели погрешностей OWSG.'
                : 'Regularized against 1-sigma OWSG error model.'}
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
                          step="0.000001"
                          value={latitude}
                          onChange={(e) => setLatitude(parseFloat(e.target.value) || 0)}
                          className="input mono"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">
                          {isRu ? 'Долгота (°)' : 'Longitude (°)'}
                        </label>
                        <input
                          type="number"
                          step="0.000001"
                          value={longitude}
                          onChange={(e) => setLongitude(parseFloat(e.target.value) || 0)}
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
                          step="0.1"
                          value={rkbElevation}
                          onChange={(e) => setRkbElevation(parseFloat(e.target.value) || 0)}
                          className="input mono okc"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">
                          {isRu ? 'Уровень земли (м)' : 'Ground GL (m)'}
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={glElevation}
                          onChange={(e) => setGlElevation(parseFloat(e.target.value) || 0)}
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
                        onChange={(e) => setModel(e.target.value as any)}
                        className="select"
                      >
                        <option value="WMM 2025">
                          {isRu
                            ? 'Мировая магнитная модель 2025 (WMM)'
                            : 'World Magnetic Model 2025 (WMM)'}
                        </option>
                        <option value="IGRF-13">
                          {isRu
                            ? 'Международное геомагнитное поле (IGRF)'
                            : 'IAGA International Field (IGRF)'}
                        </option>
                        <option value="HDGM">
                          {isRu
                            ? 'Высокоточная геомагнитная модель (HDGM)'
                            : 'High Definition Geomagnetic Model (HDGM)'}
                        </option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={handleAutoCalculateGeomag}
                      disabled={isAutoCalculating}
                      className="btn h-[30px] flex items-center gap-1.5"
                    >
                      <Sparkles
                        className={`w-3.5 h-3.5 text-[var(--accent)] ${
                          isAutoCalculating ? 'animate-spin' : ''
                        }`}
                      />
                      <span>
                        {isAutoCalculating
                          ? isRu
                            ? 'Расчёт…'
                            : 'Computing...'
                          : isRu
                          ? 'Рассчитать WMM по координатам'
                          : 'Auto WMM from Coords'}
                      </span>
                    </button>
                  </div>

                  <div className="field-card">
                    <div className="field-card-head">
                      <span>
                        {isRu
                          ? 'Компоненты опорного поля'
                          : 'Reference Field Components'}
                      </span>
                    </div>
                    <div className="field-grid cols-4">
                      <div className="field">
                        <label className="field-label">Btotal (nT)</label>
                        <input
                          type="number"
                          value={bRef}
                          onChange={(e) => setBRef(parseFloat(e.target.value) || 0)}
                          className="input mono acc"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">
                          {isRu ? 'Угол наклонения (°)' : 'Dip Angle (°)'}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={dipRef}
                          onChange={(e) => setDipRef(parseFloat(e.target.value) || 0)}
                          className="input mono"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">
                          {isRu ? 'Магнитное склонение (°В)' : 'Declination (°E)'}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={declination}
                          onChange={(e) => setDeclination(parseFloat(e.target.value) || 0)}
                          className="input mono"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">
                          {isRu ? 'Сближение меридианов (°)' : 'Convergence (°)'}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={gridConvergence}
                          onChange={(e) => setGridConvergence(parseFloat(e.target.value) || 0)}
                          className="input mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="field-card">
                    <div className="field-card-head">
                      <span>
                        {isRu
                          ? 'Допуски контроля качества'
                          : 'QC Acceptance Tolerances'}
                      </span>
                    </div>
                    <div className="field-grid cols-3">
                      <div className="field">
                        <label className="field-label">Δ Gtotal Tol (g)</label>
                        <input
                          type="number"
                          step="0.001"
                          value={tolG}
                          onChange={(e) => setTolG(parseFloat(e.target.value) || 0)}
                          className="input mono"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">Δ Btotal Tol (nT)</label>
                        <input
                          type="number"
                          value={tolB}
                          onChange={(e) => setTolB(parseInt(e.target.value, 10) || 0)}
                          className="input mono"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">Δ Dip Tol (°)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={tolDip}
                          onChange={(e) => setTolDip(parseFloat(e.target.value) || 0)}
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
                      <button type="button" onClick={() => applyPreset('standard')}>
                        6-3/4" (171 mm)
                      </button>
                      <button type="button" onClick={() => applyPreset('slim')}>
                        4-3/4" (121 mm)
                      </button>
                      <button type="button" onClick={() => applyPreset('heavy')}>
                        8" (203 mm)
                      </button>
                    </div>
                  </div>

                  <div className="field-card">
                    <div className="field-card-head">
                      <span>
                        {isRu
                          ? 'Размеры и разнос УБТ'
                          : 'Collar Dimensions & Spacing'}
                      </span>
                    </div>
                    <div className="field-grid cols-4">
                      <div className="field">
                        <label className="field-label">OD (mm)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={collarOd}
                          onChange={(e) => setCollarOd(parseFloat(e.target.value) || 0)}
                          className="input mono okc"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">ID (mm)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={collarId}
                          onChange={(e) => setCollarId(parseFloat(e.target.value) || 0)}
                          className="input mono"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">
                          {isRu ? 'Долото — датчик (м)' : 'Bit to Sensor (m)'}
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={sensorToBit}
                          onChange={(e) => setSensorToBit(parseFloat(e.target.value) || 0)}
                          className="input mono"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">
                          {isRu ? 'Долото — калибратор (м)' : 'Bit to Stab (m)'}
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={stabDist}
                          onChange={(e) => setStabDist(parseFloat(e.target.value) || 0)}
                          className="input mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="field-grid cols-2">
                    <div className="field-card">
                      <div className="field-card-head">
                        <span>
                          {isRu
                            ? 'Плотность раствора и материал'
                            : 'Fluid Density & Material'}
                        </span>
                      </div>
                      <div className="field-grid">
                        <div className="field">
                          <label className="field-label">
                            {isRu
                              ? 'Плотность раствора (г/см³)'
                              : 'Mud Weight (g/cm³)'}
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={mudWeight}
                            onChange={(e) => setMudWeight(parseFloat(e.target.value) || 0)}
                            className="input mono acc"
                          />
                        </div>
                        <div className="field">
                          <label className="field-label">
                            {isRu ? 'Материал УБТ' : 'Collar Material'}
                          </label>
                          <select
                            value={material}
                            onChange={(e) => setMaterial(e.target.value as any)}
                            className="select"
                          >
                            <option value="nm_steel">
                              {isRu
                                ? 'Немагнитная сталь (190 ГПа)'
                                : 'Non-Magnetic Steel (190 GPa)'}
                            </option>
                            <option value="steel">
                              {isRu
                                ? 'Углеродистая сталь (205 ГПа)'
                                : 'Carbon Steel (205 GPa)'}
                            </option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="stat-card">
                      <div>
                        <div className="stat-head">
                          <Ruler />
                          <span>
                            {isRu
                              ? 'Теоретический прогиб (при Inc = 90°)'
                              : 'Theoretical Sag (at Inc = 90°)'}
                          </span>
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
                      <span className="pill acc ml-auto">LRA-CMA + TRF</span>
                    </div>

                    <div className="p-3 rounded-[var(--r2)] border border-[var(--mag-line)] bg-[var(--mag-soft)] text-[var(--fg-0)] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[13px] text-[var(--mag)]">
                          {isRu
                            ? 'LRA-CMA + TRF (Двухстадийный адаптивный гибрид)'
                            : 'LRA-CMA + TRF (Two-Stage Adaptive Hybrid)'}
                        </span>
                        <span className="pill ok flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{isRu ? 'Индустриальный стандарт' : 'Active Standard'}</span>
                        </span>
                      </div>

                      <p className="text-[11.5px] leading-relaxed text-[var(--fg-1)]">
                        {isRu
                          ? '1. Глобальный адаптивный поиск: LRA-CMA (Learning Rate Adaptation) с динамическим контролем соотношения сигнал/шум (SNR) и активным сжатием ковариаций (aCMA). Предотвращает преждевременное схлопывание дисперсии и преодолевает ложные минимумы при ограниченном тулфейсе.\n2. Прецизионная доводка: Локальная квадратичная минимизация доверительными областями (TRF) в пределах мягких физических ограничений сенсора с байесовской регуляризацией ISCWSA 1-sigma.'
                          : '1. Global Adaptive Search: LRA-CMA (Learning Rate Adaptation) with dynamic signal-to-noise (SNR) tracking and active covariance updates (aCMA). Prevents premature step collapse and circumvents local minima under restricted toolface coverage.\n2. Precision Polish: Local quadratic Trust Region Reflective (TRF) minimization within physical sanity bounds and ISCWSA 1-sigma Bayesian MAP regularization.'}
                      </p>

                      <div className="flex flex-wrap gap-2 pt-1 border-t border-[var(--mag-line)] text-[10.5px] font-mono text-[var(--fg-2)]">
                        <span>✓ LRA (SNR-based)</span>
                        <span>✓ Active Covariance (aCMA)</span>
                        <span>✓ Whitening (u = p/σ)</span>
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
                          {isRu ? 'Поколений LRA-CMA (Бюджет поиска)' : 'LRA-CMA Generations (Budget)'}
                        </label>
                        <input
                          type="number"
                          min={30}
                          max={300}
                          value={maxIter}
                          onChange={(e) => setMaxIter(parseInt(e.target.value, 10) || 100)}
                          className="input mono mag font-bold"
                        />
                        <span className="text-[10px] text-[var(--fg-3)] mt-1">
                          {isRu
                            ? 'Рекомендуется: 80–120 поколений (~1000–1500 вычислений для полной адаптации LRA)'
                            : 'Recommended: 80–120 generations (~1000–1500 evaluations for full LRA adaptation)'}
                        </span>
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
                  ? 'Настройки применяются ко всем замерам немедленно.'
                  : 'Settings apply immediately across all surveys.'}
              </span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={onClose} className="btn">
                  {isRu ? 'Отмена' : 'Cancel'}
                </button>
                <button type="submit" className="btn solid">
                  <Check className="w-3.5 h-3.5" />
                  <span>{isRu ? 'Сохранить и применить' : 'Save & Apply'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};