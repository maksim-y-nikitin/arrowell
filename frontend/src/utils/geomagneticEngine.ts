import { SurveyStation } from '@/types';

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
    if (stn.md < 200) continue;

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