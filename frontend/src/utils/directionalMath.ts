import { SurveyStation, GeomagneticReference, UnitSystem, BhaConfig } from '@/types';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export const initialBhaConfig: BhaConfig = {
  collarOdMm: 171.5,
  collarIdMm: 71.4,
  sensorToBitM: 14.2,
  stabilizerDistM: 21.5,
  mudWeightGcm3: 1.20,
  bhaMaterial: 'nm_steel',
};

/**
 * Calculates analytical beam deflection (Euler-Bernoulli) at MWD sensor position.
 */
export function calculatePhysicalSagAngle(bha: BhaConfig): number {
  const od = (bha?.collarOdMm || 171.5) / 1000;
  const id = (bha?.collarIdMm || 71.4) / 1000;
  const eModulus = bha?.bhaMaterial === 'nm_steel' ? 1.90e11 : 2.05e11;
  const momentOfInertia = (Math.PI * (Math.pow(od, 4) - Math.pow(id, 4))) / 64;
  const bendingStiffness = eModulus * momentOfInertia;

  const rhoSteel = 7850;
  const rhoMud = (bha?.mudWeightGcm3 || 1.20) * 1000;
  const buoyancyFactor = Math.max(0.1, 1 - rhoMud / rhoSteel);

  const area = (Math.PI * (od * od - id * id)) / 4;
  const weightPerMeter = rhoSteel * area * 9.81 * buoyancyFactor;

  const stabilizerSpan = Math.max(1, bha?.stabilizerDistM || 21.5);
  const sensorOffset = Math.min(bha?.sensorToBitM || 14.2, stabilizerSpan);

  const deflectionAngleRad =
    (weightPerMeter / (24 * bendingStiffness)) *
    (Math.pow(stabilizerSpan, 3) -
      6 * stabilizerSpan * sensorOffset * sensorOffset +
      4 * Math.pow(sensorOffset, 3));

  return Number(Math.abs(deflectionAngleRad * RAD_TO_DEG).toFixed(3));
}

/**
 * Recalculates entire trajectory using the industry-standard ISCWSA Minimum Curvature Method
 */
export function calculateMinimumCurvature(
  stations: SurveyStation[],
  proposalAzimuth = 45
): SurveyStation[] {
  if (stations.length === 0) return [];

  const result: SurveyStation[] = [];

  for (let i = 0; i < stations.length; i++) {
    const curr = { ...stations[i] };

    if (i === 0) {
      curr.tvd = curr.tvd ?? 0;
      curr.northing = curr.northing ?? 0;
      curr.easting = curr.easting ?? 0;
      curr.dls = 0;
      curr.closureDist = Math.hypot(curr.northing, curr.easting);
      let az = Math.atan2(curr.easting, curr.northing) * RAD_TO_DEG;
      if (az < 0) az += 360;
      curr.closureAzim = az;
      curr.vs = curr.closureDist * Math.cos((curr.closureAzim - proposalAzimuth) * DEG_TO_RAD);
      result.push(curr);
      continue;
    }

    const prev = result[i - 1];
    const dMd = curr.md - prev.md;

    if (dMd <= 0) {
      curr.tvd = prev.tvd;
      curr.northing = prev.northing;
      curr.easting = prev.easting;
      curr.dls = 0;
      curr.vs = prev.vs;
      curr.closureDist = prev.closureDist;
      curr.closureAzim = prev.closureAzim;
      result.push(curr);
      continue;
    }

    const i1 = prev.inc * DEG_TO_RAD;
    const i2 = curr.inc * DEG_TO_RAD;
    const a1 = prev.azim * DEG_TO_RAD;
    const a2 = curr.azim * DEG_TO_RAD;

    // Dogleg angle (radians)
    const cosDl = Math.cos(i2 - i1) - Math.sin(i1) * Math.sin(i2) * (1 - Math.cos(a2 - a1));
    const dl = Math.acos(Math.max(-1, Math.min(1, cosDl)));

    // Ratio Factor (RF)
    let rf = 1.0;
    if (dl > 1e-6) {
      rf = (2 / dl) * Math.tan(dl / 2);
    }

    const dN = 0.5 * dMd * (Math.sin(i1) * Math.cos(a1) + Math.sin(i2) * Math.cos(a2)) * rf;
    const dE = 0.5 * dMd * (Math.sin(i1) * Math.sin(a1) + Math.sin(i2) * Math.sin(a2)) * rf;
    const dTVD = 0.5 * dMd * (Math.cos(i1) + Math.cos(i2)) * rf;

    curr.northing = Number((prev.northing + dN).toFixed(2));
    curr.easting = Number((prev.easting + dE).toFixed(2));
    curr.tvd = Number((prev.tvd + dTVD).toFixed(2));

    // DLS in °/30m
    curr.dls = Number(((dl * RAD_TO_DEG * 30) / dMd).toFixed(2));

    // Closure Distance & Azimuth
    curr.closureDist = Number(Math.hypot(curr.northing, curr.easting).toFixed(2));
    let closureAz = Math.atan2(curr.easting, curr.northing) * RAD_TO_DEG;
    if (closureAz < 0) closureAz += 360;
    curr.closureAzim = Number(closureAz.toFixed(2));

    // Vertical Section
    curr.vs = Number(
      (curr.closureDist * Math.cos((curr.closureAzim - proposalAzimuth) * DEG_TO_RAD)).toFixed(2)
    );

    result.push(curr);
  }

  return result;
}

/**
 * Quality Control evaluation against Geomagnetic Reference tolerances
 */
export function evaluateSurveyQC(
  station: SurveyStation,
  geoRef: GeomagneticReference
): { isPass: boolean; issues: string[] } {
  const issues: string[] = [];

  const deltaG = Math.abs(station.gTotal - geoRef.gTotalRef);
  if (deltaG > geoRef.toleranceG) {
    issues.push(`Gtotal deviation: ${deltaG.toFixed(4)} g (limit: ±${geoRef.toleranceG} g)`);
  }

  const deltaB = Math.abs(station.bTotal - geoRef.bTotalRef);
  if (deltaB > geoRef.toleranceB) {
    issues.push(`Btotal deviation: ${Math.round(deltaB)} nT (limit: ±${geoRef.toleranceB} nT)`);
  }

  const deltaDip = Math.abs(station.dipAngle - geoRef.dipRef);
  if (deltaDip > geoRef.toleranceDip) {
    issues.push(`Dip deviation: ${deltaDip.toFixed(2)}° (limit: ±${geoRef.toleranceDip}°)`);
  }

  return {
    isPass: issues.length === 0,
    issues,
  };
}

/**
 * Converts length units between metric (m) and imperial (ft)
 */
export function formatLength(valMeters: number, unit: UnitSystem, decimals = 2): string {
  if (unit === 'imperial') {
    return (valMeters * 3.28084).toFixed(decimals);
  }
  return valMeters.toFixed(decimals);
}

/**
 * Formats DLS (°/30m or °/100ft)
 */
export function formatDLS(dlsMetric: number, unit: UnitSystem): string {
  if (unit === 'imperial') {
    // 30m is 98.425ft, so °/100ft = °/30m * (100 / 98.425) ≈ 1.016
    return (dlsMetric * 1.01605).toFixed(2);
  }
  return dlsMetric.toFixed(2);
}
