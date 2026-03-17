export type UnitSystem = 'metric' | 'imperial';
export type Language = 'en' | 'ru';
export type Theme = 'dark' | 'light';
export type ViewLayoutMode = 'split' | 'trajectory' | 'table' | 'analytics' | 'anticollision';

export type NodeLevel = 'field' | 'pad' | 'well' | 'run';

export type WellStatus = 'active' | 'warning' | 'completed' | 'planned';

export interface SurveyRun {
  id: string;
  name: string;
  runNumber: number;
  toolType: 'MWD' | 'EMS' | 'Gyro' | 'LWD';
  collarDiameterMm: number;
  startMd: number;
  endMd: number;
  surveyCount: number;
  status: 'raw' | 'msa_corrected' | 'sag_corrected' | 'qc_flagged';
  date: string;
}

export interface WellNode {
  id: string;
  name: string;
  padId: string;
  fieldId: string;
  status: WellStatus;
  uwi: string; // Unique Well Identifier
  slot: string;
  targetFormation: string;
  datumElevation: number; // RKB elevation (m)
  groundElevation: number; // GL (m)
  latitude: number;
  longitude: number;
  runs: SurveyRun[];
  activeRunId: string;
}

export interface PadNode {
  id: string;
  name: string;
  fieldId: string;
  latitude: number;
  longitude: number;
  groundElevation: number;
  datum: string; // e.g. MSL or WGS84
  wells: WellNode[];
}

export interface FieldNode {
  id: string;
  name: string;
  nameRu: string;
  country: string;
  basin: string;
  pads: PadNode[];
}

export interface RawStationSensor {
  gx: number; // g
  gy: number; // g
  gz: number; // g
  bx: number; // nT
  by: number; // nT
  bz: number; // nT
}

export interface SurveyStation {
  id: number;
  md: number; // Measured Depth (m)
  inc: number; // Inclination (deg)
  azim: number; // Azimuth (deg True)
  tvd: number; // True Vertical Depth (m)
  northing: number; // +N / -S (m)
  easting: number; // +E / -W (m)
  dls: number; // Dogleg Severity (°/30m)
  vs: number; // Vertical Section (m)
  closureDist: number; // Closure Distance (m)
  closureAzim: number; // Closure Azimuth (deg)

  // Sensors
  sensor: RawStationSensor;
  gTotal: number; // g (calculated or measured)
  bTotal: number; // nT (calculated or measured)
  dipAngle: number; // deg

  // Quality Control
  deltaG: number; // gTotal - gRef (1.0000)
  deltaB: number; // bTotal - bRef (nT)
  deltaDip: number; // dipAngle - dipRef (deg)
  isQcPass: boolean;
  qcIssues: string[];

  // Corrections state
  status: 'Raw' | 'MSA Corrected' | 'SAG Applied' | 'SCC Applied' | 'QC Warning';
  appliedCorrections: ('MSA' | 'SAG' | 'SCC')[];

  // Store raw baseline for comparison & diffing
  rawValues?: {
    inc: number;
    azim: number;
    tvd: number;
    northing: number;
    easting: number;
    dls: number;
    gTotal: number;
    bTotal: number;
    dipAngle: number;
  };
}

export interface GeomagneticReference {
  model: 'WMM 2025' | 'IGRF-13' | 'HDGM' | 'BGGM' | 'IFR';
  calcDate: string;
  bTotalRef: number; // nT (e.g. 52480 nT)
  dipRef: number; // deg (e.g. 72.15°)
  declination: number; // deg (e.g. 12.42°)
  gridConvergence: number; // deg (e.g. 1.25°)
  gTotalRef: number; // g (1.0000 g)
  toleranceG: number; // ±0.005 g
  toleranceB: number; // ±200 nT
  toleranceDip: number; // ±0.30 deg
}

export interface MsaOptimizationResult {
  collarInterference: number; // nT
  sensorBiasZ: number; // nT
  scaleFactorError: number; // %
  iterations: number;
  convergenceRms: number;
  correctedStationsCount: number;
}

export interface BhaConfig {
  collarOdMm: number;        // Наружный диаметр УБТ (мм), например 171.5 (6-3/4")
  collarIdMm: number;        // Внутренний диаметр УБТ (мм), например 71.4
  sensorToBitM: number;      // Расстояние от долота до датчика MWD (м), например 14.5
  stabilizerDistM: number;   // Расстояние от долота до центратора/стабилизатора (м), например 21.0
  mudWeightGcm3: number;     // Плотность бурового раствора (г/см³), например 1.20
  bhaMaterial: 'nm_steel' | 'steel'; // Материал: немагнитная или углеродистая сталь
}

export interface WellPropertiesUpdate {
  padName?: string;
  latitude?: number;
  longitude?: number;
  groundElevation?: number;
  datum?: string;
  wellName?: string;
  slot?: string;
  datumElevation?: number; // RKB
  targetFormation?: string;
}