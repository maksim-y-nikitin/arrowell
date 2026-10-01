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
  subject_stations?: {
    id: number;
    md: number;
    inc: number;
    azim: number;
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
    let errorDetail = res.statusText;
    try {
      const errJson = await res.json();
      if (errJson?.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
    }
    throw new Error(`Anti-Collision API failed (${res.status}): ${errorDetail}`);
  }
  return res.json();
}

export interface ApiEou {
  semi_major: number;
  semi_intermediate: number;
  semi_minor: number;
  horiz_semi_major: number;
  horiz_semi_minor: number;
  horiz_azimuth: number;
  eigenvectors: number[][];
}

export interface ApiStation {
  id: number;
  well_id: string;
  parent_station_id?: number | null;
  survey_type?: string;
  correction_type?: string | null;
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
  eou?: ApiEou;
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
  tolerance_g?: number;
  tolerance_b?: number;
  tolerance_dip?: number;
}

export interface GeomagReferenceUpdatePayload {
  model: string;
  error_model: string;
  b_total_ref: number;
  dip_ref: number;
  declination: number;
  grid_convergence: number;
  g_total_ref: number;
  tolerance_g: number;
  tolerance_b: number;
  tolerance_dip: number;
}

export interface MsaConfig {
  maxIter: number;
  enableMisalignment: boolean;
  enableRefCorrections: boolean;
}

export async function fetchHierarchy(): Promise<any[]> {
  const res = await fetch(`${API_BASE_URL}/wells/hierarchy`);
  if (!res.ok) {
    throw new Error(`Failed to fetch hierarchy: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchWellStations(wellId: string, surveyType?: string): Promise<ApiStation[]> {
  const url = surveyType
    ? `${API_BASE_URL}/wells/${wellId}/stations?survey_type=${surveyType}`
    : `${API_BASE_URL}/wells/${wellId}/stations`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch stations for ${wellId}: ${res.statusText}`);
  }
  return res.json();
}

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

export async function deleteWellStation(wellId: string, stationId: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/wells/${wellId}/stations/${stationId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Failed to delete station: ${res.statusText}`);
  }
}

export async function triggerMsaAnalysis(
  wellId: string,
  config?: {
    cma_generations?: number;
    max_iter?: number;
    enable_misalignment?: boolean;
    enable_ref_corrections?: boolean;
  }
): Promise<ApiStation[]> {
  const res = await fetch(`${API_BASE_URL}/wells/${wellId}/run-msa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: config ? JSON.stringify(config) : undefined,
  });

  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const errJson = await res.json();
      if (errJson?.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
    }
    throw new Error(`MSA computation failed (${res.status}): ${errorDetail}`);
  }

  return res.json();
}

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
): Promise<ApiStation[]> {
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
    let errorDetail = res.statusText;
    try {
      const errJson = await res.json();
      if (errJson?.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
    }
    throw new Error(`SAG calculation failed (${res.status}): ${errorDetail}`);
  }
  return res.json();
}

export async function triggerSccAnalysis(wellId: string): Promise<ApiStation[]> {
  const res = await fetch(`${API_BASE_URL}/wells/${wellId}/run-scc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const errJson = await res.json();
      if (errJson?.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
    }
    throw new Error(`SCC computation failed (${res.status}): ${errorDetail}`);
  }

  return res.json();
}

export async function resetWellCorrections(well_id: string, target?: string): Promise<ApiStation[]> {
  const url = target
    ? `${API_BASE_URL}/wells/${well_id}/reset-corrections?target=${target}`
    : `${API_BASE_URL}/wells/${well_id}/reset-corrections`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Reset corrections failed: ${res.statusText}`);
  }

  return res.json();
}

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

export async function updateWellGeomagReference(
  wellId: string,
  payload: GeomagReferenceUpdatePayload
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/wells/${wellId}/geomag-reference`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const errJson = await res.json();
      if (errJson?.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
    }
    throw new Error(`Failed to update geomagnetic reference (${res.status}): ${errorDetail}`);
  }
}