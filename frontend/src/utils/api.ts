/**
 * API client module for interacting with ArroWell FastAPI backend.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
import { AntiCollisionScanResponse } from '@/types';


export interface AntiCollisionApiRequest {
  offset_well_name: string;
  offset_stations: {
    md: number;
    inc?: number;
    azim?: number;
    tvd: number;
    northing: number;
    easting: number;
  }[];
  model_name?: string;
  expansion_k?: number;
  well_radius_subject_m?: number;
  well_radius_offset_m?: number;
  b_total_ref?: number;
  dip_ref_deg?: number;
  declination_deg?: number;
}

/**
 * Triggers full 3D ISCWSA position uncertainty and Separation Factor (SF) calculation on backend.
 */
export async function triggerAntiCollisionScan(
  wellId: string,
  payload: AntiCollisionApiRequest
): Promise<AntiCollisionScanResponse> {
  const res = await fetch(`${API_BASE_URL}/wells/${wellId}/run-anti-collision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Anti-Collision API failed: ${res.statusText}`);
  }
  return res.json();
}

export interface ApiStation {
  id: number;
  well_id: string;
  md: number;
  inc: number;
  azim: number;
  tvd: number;
  northing: number;
  easting: number;
  dls: number;
  vs: number;
  closure_dist: number;
  closure_azim: number;
  sensor: {
    gx: number;
    gy: number;
    gz: number;
    bx: number;
    by: number;
    bz: number;
  };
  g_total: number;
  b_total: number;
  dip_angle: number;
  delta_g: number;
  delta_b: number;
  delta_dip: number;
  is_qc_pass: boolean;
  status: string;
}

export interface MsaResponse {
  status: string;
  axial_bias_bz: number;
  cross_bias_bx: number;
  cross_bias_by: number;
  scale_factor_z: number;
  misalignment_mxy: number;
  stations_analyzed: number;
  quality_assessment: {
    accuracy: boolean;
    expectation: boolean;
    reference: boolean;
  };
}

export interface SagStationCorrection {
  station_id: number;
  md: number;
  raw_inc: number;
  sag_correction_deg: number;
  corrected_inc: number;
  valid: boolean;
}

export interface SagResponse {
  status: string;
  well_id: string;
  mud_weight_gcm3: number;
  peak_sag_deg: number;
  stations_corrected: number;
  corrections: SagStationCorrection[];
}

export interface GeomagReferenceRequest {
  latitude: number;
  longitude: number;
  altitude_m: number;
  model?: string;
  date_iso?: string;
}

export interface GeomagReferenceResponse {
  model: string;
  b_total_ref: number;
  dip_ref: number;
  declination: number;
  grid_convergence: number;
  g_total_ref: number;
  g_ms2: number;
}

/**
 * Fetch full oilfield hierarchy tree from DuckDB.
 */
export async function fetchHierarchy(): Promise<any[]> {
  const res = await fetch(`${API_BASE_URL}/wells/hierarchy`);
  if (!res.ok) {
    throw new Error(`Failed to fetch hierarchy: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch directional survey stations for a specific wellbore.
 */
export async function fetchWellStations(wellId: string): Promise<ApiStation[]> {
  const res = await fetch(`${API_BASE_URL}/wells/${wellId}/stations`);
  if (!res.ok) {
    throw new Error(`Failed to fetch stations for ${wellId}: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Create a new directional survey station and persist it to DuckDB.
 */
export async function createWellStation(
  wellId: string,
  stationData: {
    md: number;
    inc: number;
    azim: number;
    sensor?: {
      gx: number;
      gy: number;
      gz: number;
      bx: number;
      by: number;
      bz: number;
    };
  }
): Promise<ApiStation> {
  const res = await fetch(`${API_BASE_URL}/wells/${wellId}/stations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stationData),
  });
  if (!res.ok) {
    throw new Error(`Failed to create station: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Delete a directional survey station from DuckDB.
 */
export async function deleteWellStation(wellId: string, stationId: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/wells/${wellId}/stations/${stationId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Failed to delete station: ${res.statusText}`);
  }
}

/**
 * Trigger mwdstdcore differential evolution MSA optimization on backend.
 */
export async function triggerMsaAnalysis(wellId: string): Promise<MsaResponse> {
  const res = await fetch(`${API_BASE_URL}/wells/${wellId}/run-msa`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error(`MSA computation failed: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Trigger mwdstdcore analytical BHA SAG deflection calculation on backend.
 */
export async function triggerSagAnalysis(
  wellId: string,
  bhaConfig: {
    collarOdMm: number;
    collarIdMm: number;
    sensorToBitM: number;
    stabilizerDistM: number;
    mudWeightGcm3: number;
    bhaMaterial: string;
  }
): Promise<SagResponse> {
  const payload = {
    collar_od_mm: bhaConfig.collarOdMm,
    collar_id_mm: bhaConfig.collarIdMm,
    sensor_to_bit_m: bhaConfig.sensorToBitM,
    stabilizer_dist_m: bhaConfig.stabilizerDistM,
    mud_weight_gcm3: bhaConfig.mudWeightGcm3,
    bha_material: bhaConfig.bhaMaterial,
  };

  const res = await fetch(`${API_BASE_URL}/wells/${wellId}/run-sag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`SAG calculation failed: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Compute exact geomagnetic reference parameters (WMM/IGRF) via mwdstdcore.
 */
export async function calculateGeomagReference(
  req: GeomagReferenceRequest
): Promise<GeomagReferenceResponse> {
  const res = await fetch(`${API_BASE_URL}/wells/calculate-geomag-reference`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(`Failed to calculate geomagnetic reference: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Calculate 3D trajectory on-the-fly using Minimum Curvature Method via mwdstdcore.
 */
export async function calculateTrajectory(
  stations: { md: number; inc: number; azim: number }[],
  proposalAzimuth: number = 45.0
) {
  const res = await fetch(`${API_BASE_URL}/surveys/calculate-trajectory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      proposal_azimuth: proposalAzimuth,
      stations,
    }),
  });
  if (!res.ok) {
    throw new Error(`Trajectory calculation failed: ${res.statusText}`);
  }
  return res.json();
}