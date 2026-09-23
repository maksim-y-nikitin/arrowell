import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useWellbore } from '@/context/WellboreContext';
import { offsetWellsData } from '@/data/wellsData';
import { SurveyStation } from '@/types';
import { formatLength, calculateStationEou } from '@/utils/directionalMath';
import { Box, Layers, ChevronDown } from 'lucide-react';

interface Hovered3DStationInfo {
  station: SurveyStation;
  clientX: number;
  clientY: number;
}

interface Trajectory3DProps {
  visualSubTab?: '3d' | '2d';
  onSubTabChange?: (tab: '3d' | '2d') => void;
}

type CameraPreset = 'iso' | 'top' | 'side' | 'bit';

export const Trajectory3D: React.FC<Trajectory3DProps> = ({ visualSubTab = '3d', onSubTabChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { stations, rawStations, unitSystem, theme, language } = useWellbore();
  const isDark = theme === 'dark';
  const isRu = language === 'ru';
  const lenUnit = unitSystem === 'metric' ? 'm' : 'ft';

  const [activeCamPreset, setActiveCamPreset] = useState<CameraPreset>('iso');

  const [showRaw, setShowRaw] = useState(true);
  const [showCorrected, setShowCorrected] = useState(true);
  const [showPlanned, setShowPlanned] = useState(true);
  const [showOffsets, setShowOffsets] = useState(true);
  const [showTargetHorizon, setShowTargetHorizon] = useState(true);
  const [showStationsPoints, setShowStationsPoints] = useState(true);
  const [showLayersMenu, setShowLayersMenu] = useState(false);

  const [showBitEou, setShowBitEou] = useState(true);
  const [showSurveyEou, setShowSurveyEou] = useState(false);
  const [showAntiCollisionEou, setShowAntiCollisionEou] = useState(true);
  const EOU_SCALE = 1.0;

  const maxMd = useMemo(() => {
    return Math.max(...stations.map((s) => s.md), 3500);
  }, [stations]);

  const [clipMd, setClipMd] = useState<number>(maxMd);

  useEffect(() => {
    setClipMd(maxMd);
  }, [maxMd]);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);

  const corrLineMeshRef = useRef<THREE.Line | null>(null);
  const rawLineMeshRef = useRef<THREE.Line | null>(null);
  const stationsPointsMeshRef = useRef<THREE.Points | null>(null);
  const bhaGroupRef = useRef<THREE.Group | null>(null);
  const bitEouGroupRef = useRef<THREE.Group | null>(null);
  const surveyEouMeshesRef = useRef<{ mesh: THREE.Group; md: number }[]>([]);
  const antiCollisionGroupRef = useRef<THREE.Group | null>(null);
  const activeCurveRef = useRef<THREE.CatmullRomCurve3 | null>(null);
  const linePointsCountRef = useRef<{ corr: number; raw: number }>({ corr: 0, raw: 0 });

  const [hovered3DStation, setHovered3DStation] = useState<Hovered3DStationInfo | null>(null);

  const isDraggingRef = useRef(false);
  const isPanningRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const cameraRotRef = useRef({ theta: Math.PI / 4, phi: Math.PI / 3, radius: 240 });
  const cameraTargetRef = useRef(new THREE.Vector3(0, -60, 0));

  const circlePointTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.arc(16, 16, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.stroke();
    }
    return new THREE.CanvasTexture(canvas);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDark ? '#171a22' : '#eceef2');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 5000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(100, 200, 100);
    scene.add(dirLight);

    const updateCameraPos = () => {
      if (!cameraRef.current) return;
      const { theta, phi, radius } = cameraRotRef.current;
      const target = cameraTargetRef.current;

      const x = target.x + radius * Math.sin(phi) * Math.sin(theta);
      const y = target.y + radius * Math.cos(phi);
      const z = target.z + radius * Math.sin(phi) * Math.cos(theta);

      cameraRef.current.position.set(x, y, z);
      cameraRef.current.lookAt(target);
    };

    updateCameraPos();

    let animId: number;
    const render = () => {
      animId = requestAnimationFrame(render);
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    render();

    const resizeObserver = new ResizeObserver(() => {
      if (!container || !cameraRef.current || !rendererRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      renderer.dispose();
    };
  }, [isDark]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    while (group.children.length > 0) {
      const child = group.children[0] as any;
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
        else child.material.dispose();
      }
      group.remove(child);
    }

    const scale = 0.05;

    const gridHelper = new THREE.GridHelper(
      180,
      18,
      isDark ? 0x333844 : 0xc3c8d1,
      isDark ? 0x22262f : 0xd8dce3
    );
    group.add(gridHelper);

    const wellheadGeo = new THREE.CylinderGeometry(0.8, 1.0, 1.4, 16);
    const wellheadMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x4d8dff : 0x0b5fff,
    });
    const wellhead = new THREE.Mesh(wellheadGeo, wellheadMat);
    wellhead.position.set(0, 0.7, 0);
    group.add(wellhead);

    if (showRaw && rawStations.length > 1) {
      const rawPoints = rawStations.map(
        (s) => new THREE.Vector3(s.easting * scale, -s.tvd * scale, s.northing * scale)
      );
      const rawCurve = new THREE.CatmullRomCurve3(rawPoints);
      const smoothRawPoints = rawCurve.getPoints(Math.max(50, rawPoints.length * 6));
      linePointsCountRef.current.raw = smoothRawPoints.length;

      const rawGeo = new THREE.BufferGeometry().setFromPoints(smoothRawPoints);
      const rawMat = new THREE.LineDashedMaterial({
        color: 0xb25f00,
        dashSize: 2,
        gapSize: 1.5,
      });
      const rawLine = new THREE.Line(rawGeo, rawMat);
      rawLine.computeLineDistances();
      rawLineMeshRef.current = rawLine;
      group.add(rawLine);
    }

    if (showCorrected && stations.length > 1) {
      const points = stations.map(
        (s) => new THREE.Vector3(s.easting * scale, -s.tvd * scale, s.northing * scale)
      );
      const curve = new THREE.CatmullRomCurve3(points);
      activeCurveRef.current = curve;

      const smoothCorrPoints = curve.getPoints(Math.max(60, points.length * 8));
      linePointsCountRef.current.corr = smoothCorrPoints.length;

      const lineGeo = new THREE.BufferGeometry().setFromPoints(smoothCorrPoints);
      const lineMat = new THREE.LineBasicMaterial({
        color: isDark ? 0x4d8dff : 0x0b5fff,
      });
      const corrLine = new THREE.Line(lineGeo, lineMat);
      corrLineMeshRef.current = corrLine;
      group.add(corrLine);

      if (showStationsPoints && stations.length > 0) {
        const positions: number[] = [];
        const colors: number[] = [];
        const colorPass = new THREE.Color(isDark ? 0x4d8dff : 0x0b5fff);
        const colorWarn = new THREE.Color(0xb25f00);

        stations.forEach((stn) => {
          positions.push(stn.easting * scale, -stn.tvd * scale, stn.northing * scale);
          const c = stn.isQcPass ? colorPass : colorWarn;
          colors.push(c.r, c.g, c.b);
        });

        const pointsGeo = new THREE.BufferGeometry();
        pointsGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        pointsGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const pointsMat = new THREE.PointsMaterial({
          size: 6,
          sizeAttenuation: false,
          vertexColors: true,
          map: circlePointTexture,
          transparent: true,
          alphaTest: 0.4,
        });

        const pointsMesh = new THREE.Points(pointsGeo, pointsMat);
        stationsPointsMeshRef.current = pointsMesh;
        group.add(pointsMesh);
      }

      const baseEouGeo = new THREE.SphereGeometry(1, 24, 24);

      const createEouMeshGroup = (
        majorAlongHole: number,
        intermediateCross: number,
        minorNormal: number,
        colorHex: number,
        opacityVal = 0.25
      ): THREE.Group => {
        const eouGroup = new THREE.Group();
        const visualScale = scale * EOU_SCALE;

        const sx = Math.max(0.05, intermediateCross * visualScale);
        const sy = Math.max(0.05, majorAlongHole * visualScale);
        const sz = Math.max(0.05, minorNormal * visualScale);

        const coreMat = new THREE.MeshStandardMaterial({
          color: colorHex,
          transparent: true,
          opacity: opacityVal,
          roughness: 0.3,
          metalness: 0.1,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const coreMesh = new THREE.Mesh(baseEouGeo, coreMat);
        coreMesh.scale.set(sx, sy, sz);
        eouGroup.add(coreMesh);

        const wireMat = new THREE.MeshBasicMaterial({
          color: colorHex,
          wireframe: true,
          transparent: true,
          opacity: Math.min(1.0, opacityVal + 0.35),
        });
        const wireMesh = new THREE.Mesh(baseEouGeo, wireMat);
        wireMesh.scale.set(sx, sy, sz);
        eouGroup.add(wireMesh);

        return eouGroup;
      };

      const alignGroupToTangent = (groupObj: THREE.Group, tangent: THREE.Vector3) => {
        const defaultUp = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(defaultUp, tangent.clone().normalize());
        groupObj.setRotationFromQuaternion(quat);
      };

      if (showBitEou && stations.length > 0) {
        const last = stations[stations.length - 1];
        const eouData = last.eou || calculateStationEou(last.md, last.inc, last.azim);
        const bitEou = createEouMeshGroup(
          eouData.semiMajor,
          eouData.semiIntermediate,
          eouData.semiMinor,
          isDark ? 0x4d8dff : 0x0b5fff,
          0.30
        );
        const bitPos = new THREE.Vector3(last.easting * scale, -last.tvd * scale, last.northing * scale);
        bitEou.position.copy(bitPos);

        try {
          const tangent = curve.getTangentAt(1).normalize();
          alignGroupToTangent(bitEou, tangent);
        } catch {
          // keep orientation
        }

        bitEouGroupRef.current = bitEou;
        group.add(bitEou);
      }

      if (showSurveyEou) {
        stations.forEach((stn, idx) => {
          if (idx === 0) return;
          const eouData = stn.eou || calculateStationEou(stn.md, stn.inc, stn.azim);
          const stnEou = createEouMeshGroup(
            eouData.semiMajor,
            eouData.semiIntermediate,
            eouData.semiMinor,
            stn.isQcPass ? (isDark ? 0x4d8dff : 0x0b5fff) : 0xb25f00,
            0.15
          );
          const pos = new THREE.Vector3(stn.easting * scale, -stn.tvd * scale, stn.northing * scale);
          stnEou.position.copy(pos);

          const tIdx = Math.max(0.001, idx / (stations.length - 1));
          try {
            const tangent = curve.getTangentAt(tIdx).normalize();
            alignGroupToTangent(stnEou, tangent);
          } catch {
            // keep orientation
          }

          group.add(stnEou);
          surveyEouMeshesRef.current.push({ mesh: stnEou, md: stn.md });
        });
      }

      if (showAntiCollisionEou && offsetWellsData.length > 0) {
        const antiGroup = new THREE.Group();

        offsetWellsData.forEach((offsetWell) => {
          let minDistance = Infinity;
          let closestSubjectIdx = -1;
          let closestOffsetIdx = -1;

          stations.forEach((stn, sIdx) => {
            if (stn.md < 200) return;
            offsetWell.stations.forEach((off, oIdx) => {
              const dist = Math.hypot(
                stn.northing - off.northing,
                stn.easting - off.easting,
                stn.tvd - off.tvd
              );
              if (dist < minDistance) {
                minDistance = dist;
                closestSubjectIdx = sIdx;
                closestOffsetIdx = oIdx;
              }
            });
          });

          if (closestSubjectIdx >= 0 && closestOffsetIdx >= 0) {
            const sub = stations[closestSubjectIdx];
            const off = offsetWell.stations[closestOffsetIdx];

            const eouSub = sub.eou || calculateStationEou(sub.md, sub.inc, sub.azim);
            const eouOff = calculateStationEou(off.md, 1.5, 45.0);

            const combinedEnvelope = eouSub.semiMajor + eouOff.semiMajor;
            const sf = minDistance / (combinedEnvelope || 1.0);

            if (sf < 1.5) {
              const alertColor = sf < 1.0 ? 0xb81a0f : 0xb25f00;

              const subPos = new THREE.Vector3(sub.easting * scale, -sub.tvd * scale, sub.northing * scale);
              const offPos = new THREE.Vector3(off.easting * scale, -off.tvd * scale, off.northing * scale);

              const activeApproachEou = createEouMeshGroup(
                eouSub.semiMajor,
                eouSub.semiIntermediate,
                eouSub.semiMinor,
                alertColor,
                0.45
              );
              activeApproachEou.position.copy(subPos);
              try {
                const tFraction = closestSubjectIdx / (stations.length - 1 || 1);
                const tangentSub = curve.getTangentAt(tFraction).normalize();
                alignGroupToTangent(activeApproachEou, tangentSub);
              } catch {
                // keep default
              }
              antiGroup.add(activeApproachEou);

              const offsetApproachEou = createEouMeshGroup(
                eouOff.semiMajor,
                eouOff.semiIntermediate,
                eouOff.semiMinor,
                alertColor,
                0.45
              );
              offsetApproachEou.position.copy(offPos);

              let offsetTangent = new THREE.Vector3(0, -1, 0);
              if (closestOffsetIdx < offsetWell.stations.length - 1) {
                const nextOff = offsetWell.stations[closestOffsetIdx + 1];
                offsetTangent.set(
                  (nextOff.easting - off.easting) * scale,
                  -(nextOff.tvd - off.tvd) * scale,
                  (nextOff.northing - off.northing) * scale
                ).normalize();
              }
              alignGroupToTangent(offsetApproachEou, offsetTangent);
              antiGroup.add(offsetApproachEou);

              const lineGeo = new THREE.BufferGeometry().setFromPoints([subPos, offPos]);
              const lineMat = new THREE.LineDashedMaterial({
                color: alertColor,
                dashSize: 1.5,
                gapSize: 0.8,
              });
              const distLine = new THREE.Line(lineGeo, lineMat);
              distLine.computeLineDistances();
              antiGroup.add(distLine);
            }
          }
        });

        if (antiGroup.children.length > 0) {
          antiCollisionGroupRef.current = antiGroup;
          group.add(antiGroup);
        }
      }

      const collarGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 12);
      const collarMat = new THREE.MeshStandardMaterial({ color: 0x7a8394 });
      const collarMesh = new THREE.Mesh(collarGeo, collarMat);

      const bitGeo = new THREE.ConeGeometry(0.4, 0.5, 12);
      bitGeo.rotateX(Math.PI);
      const bitMat = new THREE.MeshStandardMaterial({ color: 0x0e8a4a });
      const bitMesh = new THREE.Mesh(bitGeo, bitMat);
      bitMesh.position.set(0, -0.6 - 0.25, 0);

      const bhaGroup = new THREE.Group();
      bhaGroup.add(collarMesh);
      bhaGroup.add(bitMesh);
      bhaGroupRef.current = bhaGroup;
      group.add(bhaGroup);
    }

    if (showPlanned && stations.length > 1) {
      const planPoints = stations.map(
        (s) => new THREE.Vector3((s.easting * 1.05) * scale, (-s.tvd * 0.98) * scale, (s.northing * 1.02) * scale)
      );
      const planCurve = new THREE.CatmullRomCurve3(planPoints);
      const smoothPlanPoints = planCurve.getPoints(Math.max(40, planPoints.length * 4));
      const planGeo = new THREE.BufferGeometry().setFromPoints(smoothPlanPoints);
      const planMat = new THREE.LineDashedMaterial({
        color: isDark ? 0x626a7a : 0x7a8394,
        dashSize: 2,
        gapSize: 1.5,
      });
      const planLine = new THREE.Line(planGeo, planMat);
      planLine.computeLineDistances();
      group.add(planLine);
    }

    if (showOffsets) {
      offsetWellsData.forEach((offset) => {
        const offPoints = offset.stations.map(
          (s) => new THREE.Vector3(s.easting * scale, -s.tvd * scale, s.northing * scale)
        );
        if (offPoints.length > 1) {
          const offCurve = new THREE.CatmullRomCurve3(offPoints);
          const smoothOffPoints = offCurve.getPoints(Math.max(40, offPoints.length * 4));
          const offGeo = new THREE.BufferGeometry().setFromPoints(smoothOffPoints);
          const offMat = new THREE.LineBasicMaterial({
            color: 0x7a3fd6,
            transparent: true,
            opacity: 0.75,
          });
          const offLine = new THREE.Line(offGeo, offMat);
          group.add(offLine);
        }
      });
    }

    if (showTargetHorizon) {
      const targetTvd = 2480;
      const targetY = -targetTvd * scale;
      const horizonGrid = new THREE.GridHelper(
        160,
        16,
        0x0e8a4a,
        isDark ? 0x1a4a30 : 0xa8d8bd
      );
      horizonGrid.position.set(20, targetY, 20);
      group.add(horizonGrid);
    }
  }, [
    stations,
    rawStations,
    showRaw,
    showCorrected,
    showPlanned,
    showOffsets,
    showTargetHorizon,
    showStationsPoints,
    showBitEou,
    showSurveyEou,
    showAntiCollisionEou,
    circlePointTexture,
    isDark,
  ]);

  useEffect(() => {
    if (stations.length < 2) return;

    const minMdVal = stations[0].md;
    const maxMdVal = stations[stations.length - 1].md;
    const span = maxMdVal - minMdVal || 1.0;
    const fraction = Math.max(0.001, Math.min(1.0, (clipMd - minMdVal) / span));

    if (corrLineMeshRef.current?.geometry) {
      const totalPoints = linePointsCountRef.current.corr;
      corrLineMeshRef.current.geometry.setDrawRange(0, Math.max(2, Math.round(fraction * totalPoints)));
    }

    if (rawLineMeshRef.current?.geometry) {
      const totalPoints = linePointsCountRef.current.raw;
      rawLineMeshRef.current.geometry.setDrawRange(0, Math.max(2, Math.round(fraction * totalPoints)));
    }

    if (stationsPointsMeshRef.current?.geometry) {
      const count = stations.filter((s) => s.md <= clipMd).length;
      stationsPointsMeshRef.current.geometry.setDrawRange(0, count);
    }

    surveyEouMeshesRef.current.forEach((item) => {
      item.mesh.visible = item.md <= clipMd;
    });

    if (activeCurveRef.current) {
      const bitPos = activeCurveRef.current.getPointAt(fraction);
      let quat = new THREE.Quaternion();
      try {
        const tangent = activeCurveRef.current.getTangentAt(fraction).normalize();
        quat.setFromUnitVectors(new THREE.Vector3(0, -1, 0), tangent);
      } catch {
        // retain
      }

      if (bhaGroupRef.current) {
        bhaGroupRef.current.position.copy(bitPos);
        bhaGroupRef.current.setRotationFromQuaternion(quat);
      }

      if (bitEouGroupRef.current) {
        bitEouGroupRef.current.position.copy(bitPos);
      }
    }
  }, [clipMd, stations]);

  const setCameraView = (view: CameraPreset) => {
    setActiveCamPreset(view);

    if (view === 'iso') {
      cameraRotRef.current = { theta: Math.PI / 4, phi: Math.PI / 3, radius: 240 };
      cameraTargetRef.current = new THREE.Vector3(0, -60, 0);
    } else if (view === 'top') {
      cameraRotRef.current = { theta: 0, phi: 0.001, radius: 280 };
      cameraTargetRef.current = new THREE.Vector3(0, 0, 0);
    } else if (view === 'side') {
      cameraRotRef.current = { theta: 0, phi: Math.PI / 2, radius: 280 };
      cameraTargetRef.current = new THREE.Vector3(0, -60, 0);
    } else if (view === 'bit') {
      const last = stations[stations.length - 1];
      if (last) {
        cameraTargetRef.current = new THREE.Vector3(
          last.easting * 0.05,
          -last.tvd * 0.05,
          last.northing * 0.05
        );
        cameraRotRef.current.radius = 60;
      }
    }

    if (cameraRef.current) {
      const { theta, phi, radius } = cameraRotRef.current;
      const target = cameraTargetRef.current;
      cameraRef.current.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta)
      );
      cameraRef.current.lookAt(target);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) isDraggingRef.current = true;
    else if (e.button === 2) isPanningRef.current = true;
    prevMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingRef.current || isPanningRef.current) {
      if (hovered3DStation) setHovered3DStation(null);

      const dx = e.clientX - prevMouseRef.current.x;
      const dy = e.clientY - prevMouseRef.current.y;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };

      if (isDraggingRef.current) {
        cameraRotRef.current.theta -= dx * 0.008;
        cameraRotRef.current.phi = Math.max(
          0.1,
          Math.min(Math.PI - 0.1, cameraRotRef.current.phi - dy * 0.008)
        );
      } else if (isPanningRef.current) {
        cameraTargetRef.current.x -= dx * 0.3;
        cameraTargetRef.current.y += dy * 0.3;
      }

      if (cameraRef.current) {
        const { theta, phi, radius } = cameraRotRef.current;
        const target = cameraTargetRef.current;
        cameraRef.current.position.set(
          target.x + radius * Math.sin(phi) * Math.sin(theta),
          target.y + radius * Math.cos(phi),
          target.z + radius * Math.sin(phi) * Math.cos(theta)
        );
        cameraRef.current.lookAt(target);
      }
      return;
    }

    if (!containerRef.current || !cameraRef.current || stations.length === 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    const scale = 0.05;
    let closestStation: SurveyStation | null = null;
    let minDistancePixels = 12;

    for (const stn of stations) {
      if (stn.md > clipMd) continue;

      const worldPos = new THREE.Vector3(stn.easting * scale, -stn.tvd * scale, stn.northing * scale);
      const ndc = worldPos.project(cameraRef.current);

      if (ndc.z > 1 || ndc.z < -1) continue;

      const screenX = ((ndc.x + 1) / 2) * rect.width + rect.left;
      const screenY = ((-ndc.y + 1) / 2) * rect.height + rect.top;

      const dist = Math.hypot(e.clientX - screenX, e.clientY - screenY);
      if (dist < minDistancePixels) {
        minDistancePixels = dist;
        closestStation = stn;
      }
    }

    if (closestStation) {
      setHovered3DStation({
        station: closestStation,
        clientX: e.clientX,
        clientY: e.clientY,
      });
    } else if (hovered3DStation) {
      setHovered3DStation(null);
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    isPanningRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    cameraRotRef.current.radius = Math.max(
      40,
      Math.min(700, cameraRotRef.current.radius + e.deltaY * 0.2)
    );

    if (cameraRef.current) {
      const { theta, phi, radius } = cameraRotRef.current;
      const target = cameraTargetRef.current;
      cameraRef.current.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta)
      );
      cameraRef.current.lookAt(target);
    }
  };

  const lastStation = stations[stations.length - 1] || {
    md: 0,
    inc: 0,
    azim: 0,
    tvd: 0,
    closureDist: 0,
    closureAzim: 0,
  };

  return (
    <div className="w-full h-full flex flex-col select-none overflow-hidden bg-[var(--bg-1)]">
      <div className="panel-head justify-between">
        <div className="flex items-center gap-2">
          <div className="panel-title">
            <Box className="w-3.5 h-3.5 text-[var(--fg-2)]" />
            <span>{isRu ? 'Траектория скважины' : 'Wellbore Trajectory'}</span>
          </div>
          <span className="pill acc">ISCWSA · k=2.0</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="seg">
            <button
              type="button"
              onClick={() => setCameraView('iso')}
              className={activeCamPreset === 'iso' ? 'on' : ''}
              title={isRu ? 'Изометрический вид' : 'Isometric 3D View'}
            >
              {isRu ? 'Изо' : 'Iso'}
            </button>
            <button
              type="button"
              onClick={() => setCameraView('top')}
              className={activeCamPreset === 'top' ? 'on' : ''}
              title={isRu ? 'Вид сверху (Устье)' : 'Top / Wellhead View'}
            >
              {isRu ? 'Устье' : 'Top'}
            </button>
            <button
              type="button"
              onClick={() => setCameraView('side')}
              className={activeCamPreset === 'side' ? 'on' : ''}
              title={isRu ? 'Вид сбоку (Профиль)' : 'Side Profile View'}
            >
              {isRu ? 'Профиль' : 'Side'}
            </button>
            <button
              type="button"
              onClick={() => setCameraView('bit')}
              className={activeCamPreset === 'bit' ? 'on acc' : ''}
              title={isRu ? 'Фокус на долото (забой)' : 'Focus on Drill Bit'}
            >
              {isRu ? 'Долото' : 'Bit'}
            </button>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowLayersMenu(!showLayersMenu)}
              className="btn"
            >
              <Layers className="w-3.5 h-3.5 text-[var(--fg-2)]" />
              <span>Layers</span>
              <ChevronDown className="w-2.5 h-2.5 text-[var(--fg-3)]" />
            </button>

            {showLayersMenu && (
              <div className="absolute top-8 right-0 w-52 p-2 bg-[var(--bg-1)] border border-[var(--line-strong)] rounded-[var(--r2)] shadow-[var(--shadow-2)] z-30 space-y-1.5 t-xs font-sans">
                <div className="t-2xs uppercase font-semibold text-[var(--fg-3)] border-b border-[var(--line)] pb-1">
                  Trajectory Layers
                </div>
                <label className="flex items-center gap-2 cursor-pointer hover:text-[var(--fg-0)]">
                  <input
                    type="checkbox"
                    checked={showCorrected}
                    onChange={(e) => setShowCorrected(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <span>Corrected Path</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer hover:text-[var(--fg-0)]">
                  <input
                    type="checkbox"
                    checked={showStationsPoints}
                    onChange={(e) => setShowStationsPoints(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <span>Survey Stations</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer hover:text-[var(--fg-0)]">
                  <input
                    type="checkbox"
                    checked={showRaw}
                    onChange={(e) => setShowRaw(e.target.checked)}
                    className="accent-[var(--warn)]"
                  />
                  <span>Raw MWD</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer hover:text-[var(--fg-0)]">
                  <input
                    type="checkbox"
                    checked={showPlanned}
                    onChange={(e) => setShowPlanned(e.target.checked)}
                    className="accent-[var(--fg-2)]"
                  />
                  <span>Planned Path</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer hover:text-[var(--fg-0)]">
                  <input
                    type="checkbox"
                    checked={showOffsets}
                    onChange={(e) => setShowOffsets(e.target.checked)}
                    className="accent-[var(--mag)]"
                  />
                  <span>Offset Wells</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer hover:text-[var(--fg-0)]">
                  <input
                    type="checkbox"
                    checked={showTargetHorizon}
                    onChange={(e) => setShowTargetHorizon(e.target.checked)}
                    className="accent-[var(--ok)]"
                  />
                  <span>Target Horizon</span>
                </label>

                <div className="t-2xs uppercase font-semibold text-[var(--fg-3)] border-b border-[var(--line)] pt-1 pb-1">
                  ISCWSA Ellipsoids
                </div>
                <label className="flex items-center gap-2 cursor-pointer hover:text-[var(--fg-0)]">
                  <input
                    type="checkbox"
                    checked={showBitEou}
                    onChange={(e) => setShowBitEou(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <span>Bit Uncertainty (1:1)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer hover:text-[var(--fg-0)]">
                  <input
                    type="checkbox"
                    checked={showSurveyEou}
                    onChange={(e) => setShowSurveyEou(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <span>All Stations Funnel</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer hover:text-[var(--fg-0)]">
                  <input
                    type="checkbox"
                    checked={showAntiCollisionEou}
                    onChange={(e) => setShowAntiCollisionEou(e.target.checked)}
                    className="accent-[var(--crit)]"
                  />
                  <span className="text-[var(--crit)] font-semibold">Proximity Alert (SF &lt; 1.5)</span>
                </label>
              </div>
            )}
          </div>

          <div className="seg">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSubTabChange?.('3d');
              }}
              className={visualSubTab === '3d' ? 'on acc' : ''}
            >
              3D
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSubTabChange?.('2d');
              }}
              className={visualSubTab === '2d' ? 'on acc' : ''}
            >
              2D
            </button>
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={handleWheel}
        className="flex-1 w-full h-full relative cursor-grab active:cursor-grabbing overflow-hidden bg-[var(--bg-2)]"
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10 pointer-events-none">
          <div className="rd">
            <span className="k">MD</span>
            <span className="v acc">{formatLength(lastStation.md, unitSystem)}</span>
            <span className="k">{lenUnit}</span>
          </div>
          <div className="rd">
            <span className="k">TVD</span>
            <span className="v">{formatLength(lastStation.tvd, unitSystem)}</span>
            <span className="k">{lenUnit}</span>
          </div>
          <div className="rd">
            <span className="k">Closure</span>
            <span className="v">
              {formatLength(lastStation.closureDist, unitSystem)} {lenUnit} @ {lastStation.closureAzim.toFixed(1)}°
            </span>
          </div>
        </div>

        <div className="absolute top-2.5 right-2.5 flex flex-col gap-1 items-end z-10 pointer-events-none">
          <div className="rd">
            <span className="k">Inc</span>
            <span className="v ok">{lastStation.inc.toFixed(2)}°</span>
          </div>
          <div className="rd">
            <span className="k">Azim</span>
            <span className="v acc">{lastStation.azim.toFixed(2)}°</span>
          </div>
        </div>

        <div className="absolute bottom-2.5 left-2.5 z-10 pointer-events-none">
          <div className="rd warn">
            <span className="k">SF min</span>
            <span className="v wn">1.42</span>
            <span className="k">vs Well 103-S</span>
          </div>
        </div>

        <div className="absolute bottom-2.5 right-2.5 z-10 pointer-events-none">
          <div className="rd">
            <span className="k">Layers</span>
            <span className="v">7 active</span>
          </div>
        </div>
      </div>

      {hovered3DStation && (
        <div
          className="fixed z-50 pointer-events-none p-2 rounded-[var(--r2)] shadow-[var(--shadow-2)] t-xs border bg-[var(--bg-1)] text-[var(--fg-0)] border-[var(--line-strong)] font-mono min-w-56"
          style={{
            left: `${Math.min(window.innerWidth - 260, hovered3DStation.clientX + 14)}px`,
            top: `${Math.min(window.innerHeight - 220, Math.max(16, hovered3DStation.clientY - 30))}px`,
          }}
        >
          <div className="font-bold border-b border-[var(--line)] pb-1 mb-1 flex items-center justify-between text-[var(--accent)]">
            <span>#{hovered3DStation.station.id}</span>
            <span>MD: {formatLength(hovered3DStation.station.md, unitSystem)} {lenUnit}</span>
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[var(--fg-1)] mb-1">
            <div>Inc: <strong>{hovered3DStation.station.inc.toFixed(2)}°</strong></div>
            <div>Azim: <strong>{hovered3DStation.station.azim.toFixed(2)}°</strong></div>
            <div>TVD: <strong>{formatLength(hovered3DStation.station.tvd, unitSystem)} {lenUnit}</strong></div>
            <div>DLS: <strong>{hovered3DStation.station.dls.toFixed(2)}</strong></div>
          </div>

          <div className="pt-1 border-t border-[var(--line)] flex items-center justify-between t-2xs">
            <span className="text-[var(--fg-3)]">QC:</span>
            <span className={`font-bold ${hovered3DStation.station.isQcPass ? 'text-[var(--ok)]' : 'text-[var(--warn)]'}`}>
              {hovered3DStation.station.isQcPass ? 'Pass' : 'Warning'}
            </span>
          </div>
        </div>
      )}

      <div className="viz-scrub">
        <span className="lbl">Depth</span>
        <span className="val">
          {formatLength(clipMd, unitSystem)} {lenUnit}
        </span>
        <input
          type="range"
          min="0"
          max={maxMd}
          step="10"
          value={clipMd}
          onChange={(e) => setClipMd(parseFloat(e.target.value))}
        />
        <span className="hint hidden sm:inline">
          LMB orbit · RMB pan · Wheel zoom
        </span>
      </div>
    </div>
  );
};