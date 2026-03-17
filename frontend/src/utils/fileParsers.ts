import { SurveyStation } from '@/types';

/**
 * Generates comma-separated values (CSV) string for directional survey export.
 */
export function exportSurveyToCsv(stations: SurveyStation[], wellName: string): string {
  const header = [
    'Station_ID',
    'MD_m',
    'Inc_deg',
    'Azim_deg',
    'TVD_m',
    'Northing_m',
    'Easting_m',
    'DLS_deg_30m',
    'VS_m',
    'ClosureDist_m',
    'ClosureAzim_deg',
    'Gx_g',
    'Gy_g',
    'Gz_g',
    'Gtotal_g',
    'Bx_nT',
    'By_nT',
    'Bz_nT',
    'Btotal_nT',
    'Dip_deg',
    'QC_Status',
    'Corrections_Applied',
  ].join(',');

  const rows = stations.map((s) =>
    [
      s.id,
      s.md.toFixed(2),
      s.inc.toFixed(2),
      s.azim.toFixed(2),
      s.tvd.toFixed(2),
      s.northing.toFixed(2),
      s.easting.toFixed(2),
      s.dls.toFixed(2),
      s.vs.toFixed(2),
      s.closureDist.toFixed(2),
      s.closureAzim.toFixed(2),
      s.sensor.gx.toFixed(4),
      s.sensor.gy.toFixed(4),
      s.sensor.gz.toFixed(4),
      s.gTotal.toFixed(4),
      Math.round(s.sensor.bx),
      Math.round(s.sensor.by),
      Math.round(s.sensor.bz),
      Math.round(s.bTotal),
      s.dipAngle.toFixed(2),
      s.status,
      `"${s.appliedCorrections.join('+') || 'None'}"`,
    ].join(',')
  );

  return [`# ArroWell Directional Survey Export`, `# Well: ${wellName}`, header, ...rows].join('\n');
}

/**
 * Generates industry-standard CWLS LAS 2.0 directional survey log.
 */
export function exportSurveyToLasFormat(
  stations: SurveyStation[],
  wellName: string,
  fieldName: string = 'Field',
  country: string = 'International'
): string {
  const dateStr = new Date().toISOString().split('T')[0];
  const startMd = stations[0]?.md.toFixed(2) || '0.00';
  const stopMd = stations[stations.length - 1]?.md.toFixed(2) || '0.00';

  const lines = [
    '~VERSION INFORMATION',
    ' VERS.                          2.0 :   CWLS LOG ASCII STANDARD - VERSION 2.0',
    ' WRAP.                           NO :   ONE LINE PER DEPTH STEP',
    '#----------------------------------------------------------------------',
    '~WELL INFORMATION',
    ` WELL.                     ${wellName} :   WELL NAME`,
    ` FLD .                     ${fieldName} :   FIELD NAME`,
    ` CTRY.                     ${country} :   COUNTRY`,
    ` DATE.                 ${dateStr} :   LOG DATE`,
    ` STRT.                     ${startMd} M :   START MEASURED DEPTH`,
    ` STOP.                     ${stopMd} M :   STOP MEASURED DEPTH`,
    ' STEP.                       0.00 :   NON-EQUIDISTANT SURVEY STATIONS',
    ' NULL.                  -999.2500 :   NULL VALUE',
    '#----------------------------------------------------------------------',
    '~CURVE INFORMATION',
    ' MD      .M                       : MEASURED DEPTH',
    ' INC     .DEG                     : INCLINATION ANGLE',
    ' AZI     .DEG                     : AZIMUTH (TRUE NORTH)',
    ' TVD     .M                       : TRUE VERTICAL DEPTH',
    ' NS      .M                       : NORTH / SOUTH COORDINATE',
    ' EW      .M                       : EAST / WEST COORDINATE',
    ' DLS     .DEG/30M                 : DOGLEG SEVERITY',
    ' VS      .M                       : VERTICAL SECTION',
    ' GTOT    .G                       : TOTAL GRAVITATIONAL ACCELERATION',
    ' BTOT    .NT                      : TOTAL GEOMAGNETIC INTENSITY',
    ' DIP     .DEG                     : MAGNETIC DIP ANGLE',
    '#----------------------------------------------------------------------',
    '~A  MD       INC       AZI       TVD        NS        EW       DLS        VS      GTOT      BTOT     DIP',
  ];

  stations.forEach((s) => {
    const md = s.md.toFixed(2).padStart(8);
    const inc = s.inc.toFixed(2).padStart(9);
    const azi = s.azim.toFixed(2).padStart(10);
    const tvd = s.tvd.toFixed(2).padStart(10);
    const ns = s.northing.toFixed(2).padStart(10);
    const ew = s.easting.toFixed(2).padStart(10);
    const dls = s.dls.toFixed(2).padStart(9);
    const vs = s.vs.toFixed(2).padStart(10);
    const gtot = s.gTotal.toFixed(4).padStart(10);
    const btot = Math.round(s.bTotal).toString().padStart(10);
    const dip = s.dipAngle.toFixed(2).padStart(8);

    lines.push(`${md}${inc}${azi}${tvd}${ns}${ew}${dls}${vs}${gtot}${btot}${dip}`);
  });

  return lines.join('\n');
}

/**
 * Generates structured JSON representation of survey stations and telemetry metadata.
 */
export function exportSurveyToJsonFormat(stations: SurveyStation[], wellName: string): string {
  const exportPayload = {
    metadata: {
      application: 'ArroWell Directional Workstation',
      version: '0.1.0',
      exportedAt: new Date().toISOString(),
      wellName,
      calculationMethod: 'Minimum Curvature Method (MCM)',
      units: 'Metric (meters, degrees, nT, g)',
      stationCount: stations.length,
    },
    surveys: stations.map((s) => ({
      id: s.id,
      md: s.md,
      inc: s.inc,
      azim: s.azim,
      tvd: s.tvd,
      northing: s.northing,
      easting: s.easting,
      dls: s.dls,
      vs: s.vs,
      closureDistance: s.closureDist,
      closureAzimuth: s.closureAzim,
      mwdTelemetry: {
        gTotal: s.gTotal,
        bTotal: s.bTotal,
        dipAngle: s.dipAngle,
        sensor: s.sensor,
      },
      residuals: {
        deltaG: s.deltaG,
        deltaB: s.deltaB,
        deltaDip: s.deltaDip,
      },
      qcPass: s.isQcPass,
      appliedCorrections: s.appliedCorrections,
    })),
  };

  return JSON.stringify(exportPayload, null, 2);
}

/**
 * Generates Halliburton Landmark COMPASS compatible survey export (.txt).
 */
export function exportLandmarkCompassFormat(stations: SurveyStation[], wellName: string): string {
  const lines: string[] = [
    '----------------------------------------------------------------------',
    'LANDMARK GRAPHICS CORPORATION - COMPASS DIRECTIONAL SURVEY EXPORT',
    `WELLBORE: ${wellName}`,
    'COORDINATE SYSTEM: UTM Zone 43N / WGS84',
    'DEPTH DATUM: RKB',
    'CALCULATION METHOD: Minimum Curvature Method (MCM)',
    '----------------------------------------------------------------------',
    '     MD       INC      AZIM       TVD       +N/-S      +E/-W       DLS        VS',
    '    (m)      (deg)    (deg)       (m)        (m)        (m)    (deg/30m)     (m)',
    '----------------------------------------------------------------------',
  ];

  stations.forEach((s) => {
    const md = s.md.toFixed(2).padStart(9);
    const inc = s.inc.toFixed(2).padStart(9);
    const azim = s.azim.toFixed(2).padStart(9);
    const tvd = s.tvd.toFixed(2).padStart(10);
    const n = s.northing.toFixed(2).padStart(11);
    const e = s.easting.toFixed(2).padStart(11);
    const dls = s.dls.toFixed(2).padStart(10);
    const vs = s.vs.toFixed(2).padStart(10);
    lines.push(`${md}${inc}${azim}${tvd}${n}${e}${dls}${vs}`);
  });

  lines.push('----------------------------------------------------------------------');
  lines.push(`TOTAL STATIONS: ${stations.length}`);
  lines.push(`END MD: ${stations[stations.length - 1]?.md || 0} m`);
  lines.push(`END TVD: ${stations[stations.length - 1]?.tvd || 0} m`);
  lines.push('----------------------------------------------------------------------');

  return lines.join('\n');
}

/**
 * Generates standalone printable HTML directional survey report.
 */
export function exportSurveyToHtmlReport(stations: SurveyStation[], wellName: string): string {
  const last = stations[stations.length - 1];
  const dateStr = new Date().toLocaleDateString();

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Directional Survey Report - ${wellName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; font-size: 11px; margin: 24px; color: #1e293b; background: #fff; }
    .header { border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; }
    h1 { margin: 0; font-size: 18px; color: #0f172a; }
    .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
    .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; background: #f8fafc; padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 20px; }
    .meta-item span { display: block; font-size: 10px; color: #64748b; text-transform: uppercase; }
    .meta-item strong { font-size: 13px; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    th { background: #0f172a; color: #fff; text-align: right; padding: 6px 8px; font-weight: 600; }
    th:first-child, td:first-child { text-align: center; }
    td { padding: 5px 8px; text-align: right; border-bottom: 1px solid #e2e8f0; font-family: monospace; }
    tr:nth-child(even) { background: #f8fafc; }
    .pass { color: #16a34a; font-weight: 600; }
    .fail { color: #dc2626; font-weight: 600; }
    .footer { margin-top: 24px; border-top: 1px solid #cbd5e1; padding-top: 12px; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
    @media print { body { margin: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>DIRECTIONAL SURVEY REPORT</h1>
      <div class="subtitle">ArroWell Workstation • Minimum Curvature Method (MCM)</div>
    </div>
    <div style="text-align: right;">
      <div><strong>Wellbore:</strong> ${wellName}</div>
      <div><strong>Date:</strong> ${dateStr}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-item"><span>Total Stations</span><strong>${stations.length}</strong></div>
    <div class="meta-item"><span>Final Depth (MD)</span><strong>${last?.md.toFixed(2) || 0} m</strong></div>
    <div class="meta-item"><span>True Vertical Depth (TVD)</span><strong>${last?.tvd.toFixed(2) || 0} m</strong></div>
    <div class="meta-item"><span>Closure Distance</span><strong>${last?.closureDist.toFixed(2) || 0} m @ ${last?.closureAzim.toFixed(1) || 0}°</strong></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>MD (m)</th>
        <th>Inc (°)</th>
        <th>Azim (°)</th>
        <th>TVD (m)</th>
        <th>+N/-S (m)</th>
        <th>+E/-W (m)</th>
        <th>DLS (°/30m)</th>
        <th>VS (m)</th>
        <th>Btot (nT)</th>
        <th>Gtot (g)</th>
        <th>Dip (°)</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${stations
        .map(
          (s) => `<tr>
        <td>${s.id}</td>
        <td>${s.md.toFixed(2)}</td>
        <td>${s.inc.toFixed(2)}</td>
        <td>${s.azim.toFixed(2)}</td>
        <td>${s.tvd.toFixed(2)}</td>
        <td>${s.northing.toFixed(2)}</td>
        <td>${s.easting.toFixed(2)}</td>
        <td>${s.dls.toFixed(2)}</td>
        <td>${s.vs.toFixed(2)}</td>
        <td>${Math.round(s.bTotal)}</td>
        <td>${s.gTotal.toFixed(4)}</td>
        <td>${s.dipAngle.toFixed(2)}</td>
        <td class="${s.isQcPass ? 'pass' : 'fail'}">${s.isQcPass ? 'PASS' : 'WARN'}</td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>

  <div class="footer">
    <span>Calculated using Minimum Curvature Method (MCM). Geomagnetic reference applied: WMM-2025.</span>
    <span>Page 1 of 1</span>
  </div>
</body>
</html>`;
}

export const exportToCsvFormat = exportSurveyToCsv;
export const exportToCompassFormat = exportLandmarkCompassFormat;

/**
 * Robust parser for survey text tables (CSV, tab-separated, whitespace-delimited).
 */
export function parseSurveyFileContent(text: string): Partial<SurveyStation>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('-') && !l.startsWith('~'));

  if (lines.length === 0) return [];

  const delimiter = lines[0].includes(',') ? ',' : lines[0].includes('\t') ? '\t' : /\s+/;
  const rawHeaderTokens = lines[0].toLowerCase().split(delimiter).map((c) => c.replace(/[^a-z0-9]/g, ''));

  const mdIdx = rawHeaderTokens.findIndex((c) => c.includes('md') || c.includes('depth'));
  const incIdx = rawHeaderTokens.findIndex((c) => c.includes('inc') || c.includes('inclin'));
  const azimIdx = rawHeaderTokens.findIndex((c) => c.includes('az') || c.includes('dir'));

  // Header row detected
  if (mdIdx !== -1 && incIdx !== -1 && azimIdx !== -1) {
    const result: Partial<SurveyStation>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(delimiter);
      const md = parseFloat(parts[mdIdx]);
      const inc = parseFloat(parts[incIdx]);
      const azim = parseFloat(parts[azimIdx]);
      if (!isNaN(md) && !isNaN(inc) && !isNaN(azim)) {
        result.push({
          id: result.length + 1,
          md,
          inc,
          azim,
        });
      }
    }
    return result;
  }

  // Fallback: parse lines from index 0 without dropping the surface tie-in
  const fallback: Partial<SurveyStation>[] = [];
  lines.forEach((line) => {
    const parts = line.split(delimiter).map((p) => parseFloat(p));
    if (!isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      fallback.push({
        id: fallback.length + 1,
        md: parts[0],
        inc: parts[1],
        azim: parts[2],
      });
    }
  });

  return fallback;
}