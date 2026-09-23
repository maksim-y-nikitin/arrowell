export type UnitSystem = 'metric' | 'imperial';
export type Language = 'en' | 'ru';
export type Theme = 'dark' | 'light';
export type ViewLayoutMode = 'split' | 'trajectory' | 'table' | 'analytics' | 'anticollision';

export type NodeLevel = 'field' | 'pad' | 'well' | 'run';

export type WellStatus = 'active' | 'warning' | 'completed' | 'planned';

export interface Ellipsoid3D {
  semiMajor: number;        // Максимальная 3D полуось (м)
  semiIntermediate: number; // Промежуточная 3D полуось (м)
  semiMinor: number;        // Минимальная 3D полуось (м)
  horizMajor: number;       // Полуось горизонтальной проекции (м)
  horizMinor: number;       // Малая полуось горизонтальной проекции (м)
  horizAzimuth: number;     // Азимут ориентации эллипса в плане (градусы)
  eigenvectors?: number[][]; // 3x3 матрица собственных векторов поворота
}

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
  uwi: string;
  slot: string;
  targetFormation: string;
  datumElevation: number;
  groundElevation: number;
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
  datum: string;
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
  gx: number;
  gy: number;
  gz: number;
  bx: number;
  by: number;
  bz: number;
}

export interface SurveyStation {
  id: number;
  md: number;
  inc: number;
  azim: number;
  tvd: number;
  northing: number;
  easting: number;
  dls: number;
  vs: number;
  closureDist: number;
  closureAzim: number;

  sensor: RawStationSensor;
  gTotal: number;
  bTotal: number;
  dipAngle: number;

  deltaG: number;
  deltaB: number;
  deltaDip: number;
  isQcPass: boolean;
  qcIssues: string[];

  status: 'Raw' | 'MSA Corrected' | 'SAG Applied' | 'SCC Applied' | 'QC Warning';
  appliedCorrections: ('MSA' | 'SAG' | 'SCC')[];

  // Истинный 3D эллипсоид неопределенности ISCWSA из arrowell_engine
  eou?: Ellipsoid3D;

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
  bTotalRef: number;
  dipRef: number;
  declination: number;
  gridConvergence: number;
  gTotalRef: number;
  toleranceG: number;
  toleranceB: number;
  toleranceDip: number;
}

export interface MsaOptimizationResult {
  collarInterference: number;
  sensorBiasZ: number;
  scaleFactorError: number;
  iterations: number;
  convergenceRms: number;
  correctedStationsCount: number;
}

export interface BhaConfig {
  collarOdMm: number;
  collarIdMm: number;
  sensorToBitM: number;
  stabilizerDistM: number;
  mudWeightGcm3: number;
  bhaMaterial: 'nm_steel' | 'steel';
}

export interface WellPropertiesUpdate {
  padName?: string;
  latitude?: number;
  longitude?: number;
  groundElevation?: number;
  datum?: string;
  wellName?: string;
  slot?: string;
  datumElevation?: number;
  targetFormation?: string;
}

export interface AntiCollisionPoint {
  md: number;
  tvd: number;
  northing: number;
  easting: number;
  offsetWellName: string;
  offsetMd: number;
  centerDistance: number;
  clearanceDistance: number;
  sigmaSubject: number;
  sigmaOffset: number;
  combinedUncertainty: number;
  separationFactor: number;
  isViolation: boolean;
  status: 'safe' | 'warning' | 'critical';
  warningLevel: string;
  subject_eou?: Ellipsoid3D;
  offset_eou?: Ellipsoid3D;
}

export interface AntiCollisionScanResponse {
  status: string;
  well_id: string;
  offset_well_name: string;
  min_separation_factor: number;
  closest_distance_m: number;
  closest_md_m: number;
  scan_points: {
    md: number;
    tvd: number;
    northing: number;
    easting: number;
    offset_well_name: string;
    offset_md: number;
    center_distance: number;
    clearance_distance: number;
    sigma_subject: number;
    sigma_offset: number;
    combined_uncertainty: number;
    separation_factor: number;
    is_violation: boolean;
    warning_level: string;
    subject_eou?: Ellipsoid3D;
    offset_eou?: Ellipsoid3D;
  }[];
}