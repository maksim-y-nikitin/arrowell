import { FieldNode, GeomagneticReference, SurveyStation } from '@/types';
import { calculateMinimumCurvature, evaluateSurveyQC } from '@/utils/directionalMath';

export const initialGeoRef: GeomagneticReference = {
  model: 'WMM 2025',
  calcDate: '2026-09-18',
  bTotalRef: 52480, // nT
  dipRef: 72.15, // deg
  declination: 12.42, // deg East
  gridConvergence: 1.25, // deg
  gTotalRef: 1.0000, // g
  toleranceG: 0.005, // ±0.005 g
  toleranceB: 200, // ±200 nT
  toleranceDip: 0.30, // ±0.30 deg
};

export const offsetWellsData = [
  {
    name: 'Well 101-V (Vertical Producer)',
    slot: 'Slot #1',
    distanceAtSurface: 24.5,
    stations: [
      { md: 0, tvd: 0, northing: 24.5, easting: 0 },
      { md: 500, tvd: 500, northing: 25.1, easting: 1.2 },
      { md: 1000, tvd: 999.8, northing: 26.2, easting: 2.8 },
      { md: 1500, tvd: 1499.2, northing: 28.5, easting: 4.1 },
      { md: 2000, tvd: 1998.1, northing: 31.0, easting: 5.5 },
      { md: 2500, tvd: 2496.8, northing: 33.4, easting: 7.2 },
      { md: 2800, tvd: 2795.5, northing: 35.1, easting: 8.4 },
    ],
  },
  {
    name: 'Well 103-S (S-type Injector)',
    slot: 'Slot #3',
    distanceAtSurface: 12.0,
    stations: [
      { md: 0, tvd: 0, northing: 0, easting: 12.0 },
      { md: 600, tvd: 599.5, northing: 8.0, easting: 28.0 },
      { md: 1100, tvd: 1080.0, northing: 45.0, easting: 85.0 },
      { md: 1600, tvd: 1540.0, northing: 110.0, easting: 180.0 },
      { md: 2100, tvd: 1980.0, northing: 175.0, easting: 260.0 },
      { md: 2600, tvd: 2410.0, northing: 230.0, easting: 320.0 },
    ],
  },
];

// Raw survey stations generator for Well 102-H (Achimov lateral)
function generateInitialStations(): SurveyStation[] {
  const surveyLog = [
    { md: 0, inc: 0.0, azim: 0.0, gx: 0.0, gy: 0.0, gz: 1.0, bx: 16120, by: 0, bz: 49950 },
    { md: 150, inc: 0.12, azim: 42.1, gx: 0.001, gy: 0.001, gz: 0.9999, bx: 16125, by: 80, bz: 49948 },
    { md: 320, inc: 0.25, azim: 45.3, gx: 0.002, gy: 0.003, gz: 0.9999, bx: 16110, by: 120, bz: 49952 },
    { md: 500, inc: 0.38, azim: 46.0, gx: 0.003, gy: 0.004, gz: 0.9998, bx: 16130, by: 95, bz: 49945 },
    { md: 710, inc: 0.52, azim: 48.2, gx: 0.004, gy: 0.006, gz: 0.9998, bx: 16140, by: 150, bz: 49940 },
    { md: 900, inc: 0.85, azim: 50.1, gx: 0.007, gy: 0.010, gz: 0.9997, bx: 16115, by: 190, bz: 49960 },
    // Kick-Off Point (KOP ~1000m) - Start Build Section
    { md: 1020, inc: 4.2, azim: 51.5, gx: 0.038, gy: 0.062, gz: 0.9972, bx: 16210, by: 410, bz: 50220 },
    { md: 1150, inc: 9.8, azim: 52.0, gx: 0.088, gy: 0.144, gz: 0.9855, bx: 16350, by: 750, bz: 50450 },
    { md: 1280, inc: 15.5, azim: 52.2, gx: 0.140, gy: 0.228, gz: 0.9636, bx: 16480, by: 1100, bz: 50680 },
    { md: 1410, inc: 21.4, azim: 52.5, gx: 0.191, gy: 0.312, gz: 0.9310, bx: 16620, by: 1490, bz: 50850 },
    { md: 1540, inc: 28.0, azim: 52.7, gx: 0.248, gy: 0.398, gz: 0.8830, bx: 16790, by: 1850, bz: 50980 },
    { md: 1670, inc: 35.2, azim: 53.0, gx: 0.303, gy: 0.490, gz: 0.8171, bx: 16950, by: 2200, bz: 51150 },
    { md: 1800, inc: 43.1, azim: 53.2, gx: 0.358, gy: 0.582, gz: 0.7302, bx: 17100, by: 2540, bz: 51320 },
    { md: 1930, inc: 51.5, azim: 53.4, gx: 0.408, gy: 0.668, gz: 0.6225, bx: 17240, by: 2890, bz: 51480 },
    { md: 2060, inc: 60.2, azim: 53.8, gx: 0.450, gy: 0.742, gz: 0.4970, bx: 17350, by: 3200, bz: 51640 },
    { md: 2190, inc: 69.4, azim: 54.0, gx: 0.481, gy: 0.800, gz: 0.3518, bx: 17450, by: 3510, bz: 51780 },
    { md: 2320, inc: 78.5, azim: 54.2, gx: 0.501, gy: 0.840, gz: 0.1994, bx: 17520, by: 3780, bz: 51920 },
    { md: 2450, inc: 86.8, azim: 54.5, gx: 0.510, gy: 0.860, gz: 0.0558, bx: 17580, by: 3950, bz: 52020 },
    // Landing in Reservoir (BV8 Achimov payzone ~2550m MD, 89.5 deg horizontal)
    { md: 2560, inc: 89.8, azim: 54.8, gx: 0.513, gy: 0.866, gz: 0.0035, bx: 17610, by: 4050, bz: 52120 },
    { md: 2680, inc: 90.2, azim: 55.0, gx: 0.512, gy: 0.865, gz: -0.0035, bx: 17630, by: 4100, bz: 52180 },
    { md: 2800, inc: 89.5, azim: 55.2, gx: 0.513, gy: 0.866, gz: 0.0087, bx: 17640, by: 4150, bz: 52210 },
    { md: 2920, inc: 90.5, azim: 55.4, gx: 0.511, gy: 0.864, gz: -0.0087, bx: 17650, by: 4200, bz: 52260 },
    { md: 3050, inc: 91.1, azim: 55.7, gx: 0.510, gy: 0.863, gz: -0.0192, bx: 17660, by: 4250, bz: 52310 },
    { md: 3180, inc: 89.8, azim: 55.9, gx: 0.513, gy: 0.866, gz: 0.0035, bx: 17670, by: 4300, bz: 52350 },
    { md: 3300, inc: 90.2, azim: 56.1, gx: 0.512, gy: 0.865, gz: -0.0035, bx: 17680, by: 4340, bz: 52390 },
    { md: 3420, inc: 90.0, azim: 56.3, gx: 0.513, gy: 0.865, gz: 0.0, bx: 17690, by: 4380, bz: 52420 },
  ];

  const rawStations: SurveyStation[] = surveyLog.map((s, idx) => {
    const gTot = Math.sqrt(s.gx * s.gx + s.gy * s.gy + s.gz * s.gz);
    const bTot = Math.round(Math.hypot(s.bx, s.by, s.bz));
    const bH = Math.hypot(s.bx, s.by);
    let dip = Math.atan2(s.bz, bH) * (180 / Math.PI);
    if (dip < 0) dip = Math.abs(dip);

    const deltaG = Number((gTot - initialGeoRef.gTotalRef).toFixed(4));
    const deltaB = Math.round(bTot - initialGeoRef.bTotalRef);
    const deltaDip = Number((dip - initialGeoRef.dipRef).toFixed(2));

    const isPass =
      Math.abs(deltaG) <= initialGeoRef.toleranceG &&
      Math.abs(deltaB) <= initialGeoRef.toleranceB &&
      Math.abs(deltaDip) <= initialGeoRef.toleranceDip;

    const issues: string[] = [];
    if (Math.abs(deltaG) > initialGeoRef.toleranceG) issues.push(`Gtotal out of tolerance: ${deltaG} g`);
    if (Math.abs(deltaB) > initialGeoRef.toleranceB) issues.push(`Btotal collar bias: ${deltaB} nT`);
    if (Math.abs(deltaDip) > initialGeoRef.toleranceDip) issues.push(`Dip out of tolerance: ${deltaDip}°`);

    return {
      id: idx + 1,
      md: s.md,
      inc: s.inc,
      azim: s.azim,
      tvd: 0,
      northing: 0,
      easting: 0,
      dls: 0,
      vs: 0,
      closureDist: 0,
      closureAzim: 0,
      sensor: {
        gx: s.gx,
        gy: s.gy,
        gz: s.gz,
        bx: s.bx,
        by: s.by,
        bz: s.bz,
      },
      gTotal: Number(gTot.toFixed(4)),
      bTotal: bTot,
      dipAngle: Number(dip.toFixed(2)),
      deltaG,
      deltaB,
      deltaDip,
      isQcPass: isPass,
      qcIssues: issues,
      status: isPass ? 'Raw' : 'QC Warning',
      appliedCorrections: [],
      rawValues: {
        inc: s.inc,
        azim: s.azim,
        tvd: 0,
        northing: 0,
        easting: 0,
        dls: 0,
        gTotal: Number(gTot.toFixed(4)),
        bTotal: bTot,
        dipAngle: Number(dip.toFixed(2)),
      },
    };
  });

  const calculated = calculateMinimumCurvature(rawStations, 55.0);

  // Save raw baseline values after trajectory calculation
  calculated.forEach((stn) => {
    if (stn.rawValues) {
      stn.rawValues.tvd = stn.tvd;
      stn.rawValues.northing = stn.northing;
      stn.rawValues.easting = stn.easting;
      stn.rawValues.dls = stn.dls;
    }
  });

  return calculated;
}

export const initialSurveyStations = generateInitialStations();

// Generator for Well 104-B (Sidetrack to Vartov Sand)
function generate104bStations(): SurveyStation[] {
  const log = [
    { md: 1450, inc: 0.8, azim: 45.0, gx: 0.007, gy: 0.010, gz: 0.9999, bx: 16120, by: 120, bz: 49950 },
    { md: 1550, inc: 4.5, azim: 110.2, gx: 0.040, gy: 0.065, gz: 0.9970, bx: 16180, by: 350, bz: 50120 },
    { md: 1680, inc: 11.2, azim: 125.4, gx: 0.100, gy: 0.165, gz: 0.9810, bx: 16320, by: 780, bz: 50380 },
    { md: 1810, inc: 18.5, azim: 129.8, gx: 0.165, gy: 0.270, gz: 0.9480, bx: 16500, by: 1250, bz: 50650 },
    { md: 1940, inc: 26.2, azim: 131.2, gx: 0.230, gy: 0.375, gz: 0.8980, bx: 16680, by: 1720, bz: 50920 },
    { md: 2070, inc: 33.4, azim: 132.0, gx: 0.290, gy: 0.468, gz: 0.8350, bx: 16850, by: 2120, bz: 51180 },
    { md: 2200, inc: 39.8, azim: 132.5, gx: 0.335, gy: 0.545, gz: 0.7680, bx: 17010, by: 2460, bz: 51420 },
    { md: 2330, inc: 42.1, azim: 133.0, gx: 0.352, gy: 0.570, gz: 0.7420, bx: 17120, by: 2600, bz: 51600 },
    { md: 2460, inc: 42.5, azim: 133.2, gx: 0.355, gy: 0.575, gz: 0.7370, bx: 17150, by: 2650, bz: 51680 },
    { md: 2580, inc: 42.6, azim: 133.4, gx: 0.356, gy: 0.576, gz: 0.7360, bx: 17180, by: 2680, bz: 51720 },
    { md: 2650, inc: 42.8, azim: 133.5, gx: 0.357, gy: 0.578, gz: 0.7340, bx: 17200, by: 2710, bz: 51760 },
  ];

  const stns: SurveyStation[] = log.map((s, idx) => {
    const gTot = Math.sqrt(s.gx * s.gx + s.gy * s.gy + s.gz * s.gz);
    const bTot = Math.round(Math.hypot(s.bx, s.by, s.bz));
    const bH = Math.hypot(s.bx, s.by);
    let dip = Math.atan2(s.bz, bH) * (180 / Math.PI);
    if (dip < 0) dip = Math.abs(dip);

    const deltaG = Number((gTot - initialGeoRef.gTotalRef).toFixed(4));
    const deltaB = Math.round(bTot - initialGeoRef.bTotalRef);
    const deltaDip = Number((dip - initialGeoRef.dipRef).toFixed(2));
    const isPass = Math.abs(deltaG) <= 0.005 && Math.abs(deltaB) <= 200 && Math.abs(deltaDip) <= 0.30;

    return {
      id: idx + 1,
      md: s.md,
      inc: s.inc,
      azim: s.azim,
      tvd: 0,
      northing: 0,
      easting: 0,
      dls: 0,
      vs: 0,
      closureDist: 0,
      closureAzim: 0,
      sensor: { gx: s.gx, gy: s.gy, gz: s.gz, bx: s.bx, by: s.by, bz: s.bz },
      gTotal: Number(gTot.toFixed(4)),
      bTotal: bTot,
      dipAngle: Number(dip.toFixed(2)),
      deltaG,
      deltaB,
      deltaDip,
      isQcPass: isPass,
      qcIssues: isPass ? [] : ['Magnetic interference'],
      status: isPass ? 'Raw' : 'QC Warning',
      appliedCorrections: [],
      rawValues: {
        inc: s.inc,
        azim: s.azim,
        tvd: 0,
        northing: 0,
        easting: 0,
        dls: 0,
        gTotal: Number(gTot.toFixed(4)),
        bTotal: bTot,
        dipAngle: Number(dip.toFixed(2)),
      },
    };
  });

  const calculated = calculateMinimumCurvature(stns, 133.0);
  calculated.forEach((stn) => {
    if (stn.rawValues) {
      stn.rawValues.tvd = stn.tvd;
      stn.rawValues.northing = stn.northing;
      stn.rawValues.easting = stn.easting;
      stn.rawValues.dls = stn.dls;
    }
  });
  return calculated;
}

// Generator for Well B-12 (Ekofisk North Sea ERD Well)
function generateB12Stations(): SurveyStation[] {
  const log = [
    { md: 0, inc: 0.0, azim: 0.0, gx: 0.0, gy: 0.0, gz: 1.0, bx: 15200, by: 0, bz: 48900 },
    { md: 300, inc: 1.2, azim: 210.0, gx: 0.010, gy: 0.018, gz: 0.9998, bx: 15210, by: 110, bz: 48920 },
    { md: 700, inc: 4.8, azim: 212.5, gx: 0.041, gy: 0.073, gz: 0.9965, bx: 15320, by: 420, bz: 49100 },
    { md: 1200, inc: 15.6, azim: 213.8, gx: 0.132, gy: 0.235, gz: 0.9631, bx: 15640, by: 1100, bz: 49650 },
    { md: 1800, inc: 32.4, azim: 214.2, gx: 0.270, gy: 0.462, gz: 0.8443, bx: 16180, by: 2200, bz: 50400 },
    { md: 2400, inc: 51.2, azim: 214.6, gx: 0.395, gy: 0.672, gz: 0.6266, bx: 16750, by: 3100, bz: 51200 },
    { md: 3000, inc: 68.5, azim: 215.0, gx: 0.472, gy: 0.803, gz: 0.3665, bx: 17200, by: 3750, bz: 51850 },
    { md: 3600, inc: 78.4, azim: 215.2, gx: 0.498, gy: 0.844, gz: 0.2011, bx: 17450, by: 4100, bz: 52200 },
    { md: 4200, inc: 81.2, azim: 215.4, gx: 0.502, gy: 0.852, gz: 0.1530, bx: 17580, by: 4250, bz: 52380 },
    { md: 4800, inc: 82.0, azim: 215.5, gx: 0.503, gy: 0.855, gz: 0.1392, bx: 17650, by: 4320, bz: 52450 },
  ];

  const stns: SurveyStation[] = log.map((s, idx) => {
    const gTot = Math.sqrt(s.gx * s.gx + s.gy * s.gy + s.gz * s.gz);
    const bTot = Math.round(Math.hypot(s.bx, s.by, s.bz));
    const bH = Math.hypot(s.bx, s.by);
    let dip = Math.atan2(s.bz, bH) * (180 / Math.PI);
    if (dip < 0) dip = Math.abs(dip);

    const deltaG = Number((gTot - initialGeoRef.gTotalRef).toFixed(4));
    const deltaB = Math.round(bTot - initialGeoRef.bTotalRef);
    const deltaDip = Number((dip - initialGeoRef.dipRef).toFixed(2));
    const isPass = Math.abs(deltaG) <= 0.005 && Math.abs(deltaB) <= 200 && Math.abs(deltaDip) <= 0.30;

    return {
      id: idx + 1,
      md: s.md,
      inc: s.inc,
      azim: s.azim,
      tvd: 0,
      northing: 0,
      easting: 0,
      dls: 0,
      vs: 0,
      closureDist: 0,
      closureAzim: 0,
      sensor: { gx: s.gx, gy: s.gy, gz: s.gz, bx: s.bx, by: s.by, bz: s.bz },
      gTotal: Number(gTot.toFixed(4)),
      bTotal: bTot,
      dipAngle: Number(dip.toFixed(2)),
      deltaG,
      deltaB,
      deltaDip,
      isQcPass: isPass,
      qcIssues: isPass ? [] : ['Dip anomaly'],
      status: isPass ? 'Raw' : 'QC Warning',
      appliedCorrections: [],
      rawValues: {
        inc: s.inc,
        azim: s.azim,
        tvd: 0,
        northing: 0,
        easting: 0,
        dls: 0,
        gTotal: Number(gTot.toFixed(4)),
        bTotal: bTot,
        dipAngle: Number(dip.toFixed(2)),
      },
    };
  });

  const calculated = calculateMinimumCurvature(stns, 215.5);
  calculated.forEach((stn) => {
    if (stn.rawValues) {
      stn.rawValues.tvd = stn.tvd;
      stn.rawValues.northing = stn.northing;
      stn.rawValues.easting = stn.easting;
      stn.rawValues.dls = stn.dls;
    }
  });
  return calculated;
}

export const wellStationsMap: Record<string, SurveyStation[]> = {
  'well-102h': initialSurveyStations,
  'well-104b': generate104bStations(),
  'well-b12': generateB12Stations(),
};

export const mockHierarchy: FieldNode[] = [
  {
    id: 'field-samotlor',
    name: 'Samotlor Oil Field',
    nameRu: 'Самотлорское месторождение',
    country: 'Russia',
    basin: 'West Siberian Basin',
    pads: [
      {
        id: 'pad-10',
        name: 'Cluster Pad 10-bis',
        fieldId: 'field-samotlor',
        latitude: 61.1245,
        longitude: 76.7132,
        groundElevation: 48.5,
        datum: 'MSL (Baltic Datum)',
        wells: [
          {
            id: 'well-102h',
            name: 'Well 102-H (Achimov Lateral)',
            padId: 'pad-10',
            fieldId: 'field-samotlor',
            status: 'active',
            uwi: 'RU-SAM-P10-102H',
            slot: 'Slot #4',
            targetFormation: 'BV8 (Achimov Deep Sand)',
            datumElevation: 54.2,
            groundElevation: 48.5,
            latitude: 61.12458,
            longitude: 76.71342,
            activeRunId: 'run-01',
            runs: [
              {
                id: 'run-01',
                name: 'Run 01 — MWD 6-3/4" Collar',
                runNumber: 1,
                toolType: 'MWD',
                collarDiameterMm: 171.5,
                startMd: 0,
                endMd: 3420,
                surveyCount: 26,
                status: 'raw',
                date: '2026-09-18',
              },
              {
                id: 'run-02',
                name: 'Run 02 — Gyro Verification Run',
                runNumber: 2,
                toolType: 'Gyro',
                collarDiameterMm: 120.7,
                startMd: 0,
                endMd: 1200,
                surveyCount: 14,
                status: 'qc_flagged',
                date: '2026-09-19',
              },
            ],
          },
          {
            id: 'well-104b',
            name: 'Well 104-B (Sidetrack)',
            padId: 'pad-10',
            fieldId: 'field-samotlor',
            status: 'warning',
            uwi: 'RU-SAM-P10-104B',
            slot: 'Slot #2',
            targetFormation: 'AV1 (Vartov Sand)',
            datumElevation: 54.1,
            groundElevation: 48.5,
            latitude: 61.12465,
            longitude: 76.71318,
            activeRunId: 'run-01',
            runs: [
              {
                id: 'run-01',
                name: 'Run 01 — 4-3/4" Slim MWD',
                runNumber: 1,
                toolType: 'MWD',
                collarDiameterMm: 120.7,
                startMd: 1450,
                endMd: 2650,
                surveyCount: 18,
                status: 'raw',
                date: '2026-09-17',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'field-north-sea',
    name: 'Ekofisk Field',
    nameRu: 'Месторождение Экофиск',
    country: 'Norway (North Sea)',
    basin: 'Central Graben',
    pads: [
      {
        id: 'pad-bravo',
        name: 'Ekofisk Bravo Platform',
        fieldId: 'field-north-sea',
        latitude: 56.5472,
        longitude: 3.2105,
        groundElevation: 28.0,
        datum: 'MSL WGS84',
        wells: [
          {
            id: 'well-b12',
            name: 'Well B-12 Extended Reach',
            padId: 'pad-bravo',
            fieldId: 'field-north-sea',
            status: 'active',
            uwi: 'NO-EKO-B12-ERD',
            slot: 'Slot B-08',
            targetFormation: 'Tor Chalk Formation',
            datumElevation: 32.0,
            groundElevation: 28.0,
            latitude: 56.5473,
            longitude: 3.2108,
            activeRunId: 'run-01',
            runs: [
              {
                id: 'run-01',
                name: 'Run 01 — LWD Scope 8"',
                runNumber: 1,
                toolType: 'LWD',
                collarDiameterMm: 203.2,
                startMd: 0,
                endMd: 4800,
                surveyCount: 38,
                status: 'raw',
                date: '2026-09-15',
              },
            ],
          },
        ],
      },
    ],
  },
];
