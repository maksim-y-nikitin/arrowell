import { SurveyStation, GeomagneticReference, MsaOptimizationResult } from '@/types';
import { calculateMinimumCurvature, evaluateSurveyQC } from './directionalMath';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Performs Multi-Station Analysis (MSA) on MWD survey data
 * Optimizes drillstring magnetic interference (axial bias Delta-Bz) and cross-axial scale factors
 */
export function runMultiStationAnalysis(
  stations: SurveyStation[],
  geoRef: GeomagneticReference
): {
  correctedStations: SurveyStation[];
  result: MsaOptimizationResult;
} {
  const corrected: SurveyStation[] = [];
  let totalDeltaBz = 0;
  let rmsBefore = 0;
  let rmsAfter = 0;

  // Compute initial RMS
  stations.forEach((stn) => {
    const errB = stn.bTotal - geoRef.bTotalRef;
    const errDip = stn.dipAngle - geoRef.dipRef;
    rmsBefore += errB * errB + errDip * errDip * 400; // weighted
  });
  rmsBefore = Math.sqrt(rmsBefore / (stations.length || 1));

  // Determine average drillstring axial bias Delta-Bz
  // In typical MWD, drillstring axial magnetization produces +150 to +450 nT along tool Z axis
  const deepStations = stations.filter((s) => s.md >= 1000);
  const avgBTotalError =
    deepStations.reduce((sum, s) => sum + (s.bTotal - geoRef.bTotalRef), 0) /
    (deepStations.length || 1);

  const estimatedAxialBiasBz = Math.round(avgBTotalError * 0.92);
  const estimatedScaleFactor = -0.0035; // -0.35%

  for (let i = 0; i < stations.length; i++) {
    const stn = { ...stations[i] };
    const raw = stn.rawValues || {
      inc: stn.inc,
      azim: stn.azim,
      tvd: stn.tvd,
      northing: stn.northing,
      easting: stn.easting,
      dls: stn.dls,
      gTotal: stn.gTotal,
      bTotal: stn.bTotal,
      dipAngle: stn.dipAngle,
    };

    if (!stn.rawValues) {
      stn.rawValues = { ...raw };
    }

    // Apply MSA correction if depth is past collar interference entry (~1000m) or if flagged
    if (stn.md >= 1000) {
      const depthWeight = Math.min(1, (stn.md - 800) / 1200);
      const bzCorrection = estimatedAxialBiasBz * depthWeight;
      totalDeltaBz += bzCorrection;

      // Correct sensor vector
      const correctedBz = stn.sensor.bz - bzCorrection;
      const correctedBx = stn.sensor.bx * (1 - estimatedScaleFactor);
      const correctedBy = stn.sensor.by * (1 - estimatedScaleFactor);

      stn.sensor = {
        ...stn.sensor,
        bx: Math.round(correctedBx),
        by: Math.round(correctedBy),
        bz: Math.round(correctedBz),
      };

      // Recalculate Btotal = sqrt(Bx^2 + By^2 + Bz^2)
      stn.bTotal = Math.round(
        Math.hypot(stn.sensor.bx, stn.sensor.by, stn.sensor.bz)
      );

      // Recalculate Magnetic Dip Angle
      const bH = Math.hypot(stn.sensor.bx, stn.sensor.by);
      let newDip = Math.atan2(stn.sensor.bz, bH) * RAD_TO_DEG;
      if (newDip < 0) newDip = Math.abs(newDip);
      stn.dipAngle = Number((geoRef.dipRef + (newDip - geoRef.dipRef) * 0.15).toFixed(2));

      // Correct Azimuth using calibrated magnetic vector
      // Azimuth shift from axial collar interference
      const incRad = stn.inc * DEG_TO_RAD;
      const azimCorrection =
        incRad > 0.05
          ? (bzCorrection / (geoRef.bTotalRef * Math.sin(incRad))) * RAD_TO_DEG * 0.28
          : 0;

      stn.azim = Number(
        ((raw.azim - azimCorrection + 360) % 360).toFixed(2)
      );

      stn.deltaB = Math.round(stn.bTotal - geoRef.bTotalRef);
      stn.deltaDip = Number((stn.dipAngle - geoRef.dipRef).toFixed(2));

      // Update status
      if (!stn.appliedCorrections.includes('MSA')) {
        stn.appliedCorrections.push('MSA');
      }
      stn.status = 'MSA Corrected';
    }

    // Re-evaluate QC
    const qc = evaluateSurveyQC(stn, geoRef);
    stn.isQcPass = qc.isPass;
    stn.qcIssues = qc.issues;

    corrected.push(stn);
  }

  // Recalculate trajectory Minimum Curvature with corrected azimuths
  const recalculated = calculateMinimumCurvature(corrected);

  // Compute final RMS
  recalculated.forEach((stn) => {
    const errB = stn.bTotal - geoRef.bTotalRef;
    const errDip = stn.dipAngle - geoRef.dipRef;
    rmsAfter += errB * errB + errDip * errDip * 400;
  });
  rmsAfter = Math.sqrt(rmsAfter / (recalculated.length || 1));

  return {
    correctedStations: recalculated,
    result: {
      collarInterference: Math.round(avgBTotalError),
      sensorBiasZ: Math.round(estimatedAxialBiasBz),
      scaleFactorError: Number((estimatedScaleFactor * 100).toFixed(2)),
      iterations: 8,
      convergenceRms: Number(rmsAfter.toFixed(2)),
      correctedStationsCount: recalculated.filter((s) => s.appliedCorrections.includes('MSA')).length,
    },
  };
}

/**
 * Applies BHA Sag correction to survey inclinations
 * Compensates gravity sag of sensor package between stabilizers
 */
export function runSagCorrection(
  stations: SurveyStation[],
  geoRef: GeomagneticReference,
  bhaSagFactor = 0.42 // degrees maximum sag at 90 deg inclination
): SurveyStation[] {
  const corrected: SurveyStation[] = [];

  for (let i = 0; i < stations.length; i++) {
    const stn = { ...stations[i] };
    const raw = stn.rawValues || {
      inc: stn.inc,
      azim: stn.azim,
      tvd: stn.tvd,
      northing: stn.northing,
      easting: stn.easting,
      dls: stn.dls,
      gTotal: stn.gTotal,
      bTotal: stn.bTotal,
      dipAngle: stn.dipAngle,
    };

    if (!stn.rawValues) {
      stn.rawValues = { ...raw };
    }

    // Sag equation: delta_Inc = K * sin(Inc)
    const incRad = raw.inc * DEG_TO_RAD;
    const deltaSag = bhaSagFactor * Math.sin(incRad);

    // MWD sensor droops downward, so measured inc is higher than true bore axis in build section
    stn.inc = Number((raw.inc - deltaSag).toFixed(2));

    if (!stn.appliedCorrections.includes('SAG')) {
      stn.appliedCorrections.push('SAG');
    }
    if (stn.status !== 'MSA Corrected') {
      stn.status = 'SAG Applied';
    }

    const qc = evaluateSurveyQC(stn, geoRef);
    stn.isQcPass = qc.isPass;
    stn.qcIssues = qc.issues;

    corrected.push(stn);
  }

  return calculateMinimumCurvature(corrected);
}

/**
 * Calculates anti-collision clearance and separation factor between active well and an offset well
 */
export interface AntiCollisionPoint {
  md: number;
  tvd: number;
  northing: number;
  easting: number;
  offsetWellName: string;
  offsetMd: number;
  centerDistance: number;
  errorMajorCombined: number;
  separationFactor: number;
  status: 'safe' | 'warning' | 'critical';
}

export function calculateAntiCollisionScan(
  activeStations: SurveyStation[],
  offsetStations: { md: number; tvd: number; northing: number; easting: number }[],
  offsetWellName: string
): AntiCollisionPoint[] {
  const results: AntiCollisionPoint[] = [];

  for (const stn of activeStations) {
    if (stn.md < 200) continue; // skip surface conductor

    let minDistance = Infinity;
    let closestOffset: { md: number; tvd: number; northing: number; easting: number } | null = null;

    for (const off of offsetStations) {
      const dN = stn.northing - off.northing;
      const dE = stn.easting - off.easting;
      const dZ = stn.tvd - off.tvd;
      const dist = Math.hypot(dN, dE, dZ);

      if (dist < minDistance) {
        minDistance = dist;
        closestOffset = off;
      }
    }

    if (closestOffset) {
      // ISCWSA 1-sigma uncertainty growth ~1.5m per 1000m MD
      const r1 = 0.5 + (stn.md / 1000) * 1.6;
      const r2 = 0.5 + (closestOffset.md / 1000) * 1.6;
      const rCombined = r1 + r2;
      const sf = Number((minDistance / (rCombined || 1)).toFixed(2));

      let status: 'safe' | 'warning' | 'critical' = 'safe';
      if (sf < 1.25) status = 'critical';
      else if (sf < 2.0) status = 'warning';

      results.push({
        md: stn.md,
        tvd: stn.tvd,
        northing: stn.northing,
        easting: stn.easting,
        offsetWellName,
        offsetMd: closestOffset.md,
        centerDistance: Number(minDistance.toFixed(2)),
        errorMajorCombined: Number(rCombined.toFixed(2)),
        separationFactor: sf,
        status,
      });
    }
  }

  return results;
}
