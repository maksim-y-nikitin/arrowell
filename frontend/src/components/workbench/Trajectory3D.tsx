import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useWellbore } from '@/context/WellboreContext';
import { offsetWellsData } from '@/data/wellsData';
import { SurveyStation } from '@/types';
import {
  Layers,
  ChevronDown,
  CircleDot,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';
import { formatLength, calculateStationEou } from '@/utils/directionalMath';

interface Hovered3DStationInfo {
  station: SurveyStation;
  clientX: number;
  clientY: number;
}

interface Trajectory3DProps {
  visualSubTab?: '3d' | '2d';
  onSubTabChange?: (tab: '3d' | '2d') => void;
}

export const Trajectory3D: React.FC<Trajectory3DProps> = ({ visualSubTab = '3d', onSubTabChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { stations, rawStations, unitSystem, theme, language } = useWellbore();

  // Слои
  const [showRaw, setShowRaw] = useState(true);
  const [showCorrected, setShowCorrected] = useState(true);
  const [showPlanned, setShowPlanned] = useState(true);
  const [showOffsets, setShowOffsets] = useState(true);
  const [showTargetHorizon, setShowTargetHorizon] = useState(true);
  const [showStationsPoints, setShowStationsPoints] = useState(true);
  const [showLayersMenu, setShowLayersMenu] = useState(false);

  // Физический масштаб 1:1 для эллипсоидов
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

  // Three.js Core
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);

  // GPU Clipping ссылки
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

  // Управление камерой
  const isDraggingRef = useRef(false);
  const isPanningRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const cameraRotationRef = useRef({ theta: Math.PI / 4, phi: Math.PI / 3, radius: 240 });
  const cameraTargetRef = useRef(new THREE.Vector3(0, -60, 0));

  const isRu = language === 'ru';
  const lenUnit = unitSystem === 'metric' ? 'm' : 'ft';

  // Контрастная круглая текстура точек
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

  // Инициализация WebGL
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme === 'dark' ? '#0a0d14' : '#eef2f6');
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

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.3);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(100, 200, 100);
    scene.add(dirLight);

    const updateCameraPos = () => {
      if (!cameraRef.current) return;
      const { theta, phi, radius } = cameraRotationRef.current;
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
  }, []);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(theme === 'dark' ? '#0a0d14' : '#eef2f6');
    }
  }, [theme]);

  // Сборка 3D-геометрии
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    group.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });

    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    surveyEouMeshesRef.current = [];
    corrLineMeshRef.current = null;
    rawLineMeshRef.current = null;
    stationsPointsMeshRef.current = null;
    bhaGroupRef.current = null;
    bitEouGroupRef.current = null;
    antiCollisionGroupRef.current = null;
    activeCurveRef.current = null;

    const scale = 0.05;

    // Сетка
    const gridHelper = new THREE.GridHelper(
      180,
      18,
      theme === 'dark' ? 0x22293f : 0x94a3b8,
      theme === 'dark' ? 0x141826 : 0xcbd5e1
    );
    gridHelper.position.y = 0;
    group.add(gridHelper);

    // Устье
    const wellheadGeo = new THREE.CylinderGeometry(0.6, 0.8, 1.2, 16);
    const wellheadMat = new THREE.MeshStandardMaterial({
      color: theme === 'dark' ? 0x38bdf8 : 0x0284c7,
      metalness: 0.4,
      roughness: 0.3,
    });
    const wellhead = new THREE.Mesh(wellheadGeo, wellheadMat);
    wellhead.position.set(0, 0.6, 0);
    group.add(wellhead);

    // 1. Сырая траектория MWD (Линия)
    if (showRaw && rawStations.length > 1) {
      const rawPoints = rawStations.map(
        (s) => new THREE.Vector3(s.easting * scale, -s.tvd * scale, s.northing * scale)
      );
      const rawCurve = new THREE.CatmullRomCurve3(rawPoints);
      const smoothRawPoints = rawCurve.getPoints(Math.max(50, rawPoints.length * 6));
      linePointsCountRef.current.raw = smoothRawPoints.length;

      const rawGeo = new THREE.BufferGeometry().setFromPoints(smoothRawPoints);
      const rawMat = new THREE.LineBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.8,
      });
      const rawLine = new THREE.Line(rawGeo, rawMat);
      rawLineMeshRef.current = rawLine;
      group.add(rawLine);
    }

    // 2. Скорректированная траектория (Линия)
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
        color: theme === 'dark' ? 0x38bdf8 : 0x0284c7,
      });
      const corrLine = new THREE.Line(lineGeo, lineMat);
      corrLineMeshRef.current = corrLine;
      group.add(corrLine);

      // 3. Точки станций: ровно 6 пикселей, не изменяются при зуме
      if (showStationsPoints && stations.length > 0) {
        const positions: number[] = [];
        const colors: number[] = [];
        const colorPass = new THREE.Color(theme === 'dark' ? 0x38bdf8 : 0x0284c7);
        const colorWarn = new THREE.Color(0xf59e0b);

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

      // Генератор эллипсоида 1:1
      const baseEouGeo = new THREE.SphereGeometry(1, 24, 24);

      const createEouMeshGroup = (
        majorAlongHole: number,
        intermediateCross: number,
        minorNormal: number,
        colorHex: number,
        opacityVal: number = 0.25
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

      // Эллипсоид забоя
      if (showBitEou && stations.length > 0) {
        const lastStn = stations[stations.length - 1];
        const eouData = lastStn.eou || calculateStationEou(lastStn.md, lastStn.inc, lastStn.azim);
        const bitEou = createEouMeshGroup(
          eouData.semiMajor,
          eouData.semiIntermediate,
          eouData.semiMinor,
          theme === 'dark' ? 0x38bdf8 : 0x0284c7,
          0.30
        );
        const bitPos = new THREE.Vector3(lastStn.easting * scale, -lastStn.tvd * scale, lastStn.northing * scale);
        bitEou.position.copy(bitPos);

        try {
          const tangent = curve.getTangentAt(1).normalize();
          alignGroupToTangent(bitEou, tangent);
        } catch {
          // retain
        }

        bitEouGroupRef.current = bitEou;
        group.add(bitEou);
      }

      // Эллипсоиды всех замеров
      if (showSurveyEou) {
        stations.forEach((stn, idx) => {
          if (idx === 0) return;
          const eouData = stn.eou || calculateStationEou(stn.md, stn.inc, stn.azim);
          const stnEou = createEouMeshGroup(
            eouData.semiMajor,
            eouData.semiIntermediate,
            eouData.semiMinor,
            stn.isQcPass ? (theme === 'dark' ? 0x38bdf8 : 0x0284c7) : 0xf59e0b,
            0.15
          );
          const pos = new THREE.Vector3(stn.easting * scale, -stn.tvd * scale, stn.northing * scale);
          stnEou.position.copy(pos);

          const tIdx = Math.max(0.001, idx / (stations.length - 1));
          try {
            const tangent = curve.getTangentAt(tIdx).normalize();
            alignGroupToTangent(stnEou, tangent);
          } catch {
            // retain
          }

          group.add(stnEou);
          surveyEouMeshesRef.current.push({ mesh: stnEou, md: stn.md });
        });
      }

      // Предупреждение о сближении (только при угрозе SF < 1.5)
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
              const alertColor = sf < 1.0 ? 0xef4444 : 0xf59e0b;

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
                // retain
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
                linewidth: 2,
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

      // Компактный наконечник долота
      const collarGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 12);
      const collarMat = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        metalness: 0.5,
        roughness: 0.3,
      });
      const collarMesh = new THREE.Mesh(collarGeo, collarMat);

      const bitGeo = new THREE.ConeGeometry(0.4, 0.5, 12);
      bitGeo.rotateX(Math.PI);
      const bitMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        metalness: 0.3,
        roughness: 0.25,
      });
      const bitMesh = new THREE.Mesh(bitGeo, bitMat);
      bitMesh.position.set(0, -0.6 - 0.25, 0);

      const bhaGroup = new THREE.Group();
      bhaGroup.add(collarMesh);
      bhaGroup.add(bitMesh);
      bhaGroupRef.current = bhaGroup;
      group.add(bhaGroup);
    }

    // 4. Проектный ствол
    if (showPlanned && stations.length > 1) {
      const planPoints = stations.map(
        (s) => new THREE.Vector3((s.easting * 1.05) * scale, (-s.tvd * 0.98) * scale, (s.northing * 1.02) * scale)
      );
      const planCurve = new THREE.CatmullRomCurve3(planPoints);
      const smoothPlanPoints = planCurve.getPoints(Math.max(40, planPoints.length * 4));
      const planGeo = new THREE.BufferGeometry().setFromPoints(smoothPlanPoints);
      const planMat = new THREE.LineDashedMaterial({
        color: theme === 'dark' ? 0x64748b : 0x94a3b8,
        dashSize: 2,
        gapSize: 1.5,
      });
      const planLine = new THREE.Line(planGeo, planMat);
      planLine.computeLineDistances();
      group.add(planLine);
    }

    // 5. Соседние скважины
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
            color: 0xa855f7,
            transparent: true,
            opacity: 0.75,
          });
          const offLine = new THREE.Line(offGeo, offMat);
          group.add(offLine);
        }
      });
    }

    // 6. Геологический горизонт (сетка)
    if (showTargetHorizon) {
      const targetTvd = 2480;
      const targetY = -targetTvd * scale;
      const horizonGrid = new THREE.GridHelper(
        160,
        16,
        0x10b981,
        theme === 'dark' ? 0x064e3b : 0xa7f3d0
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
    theme,
  ]);

  // Fast GPU Line & Points Clipping
  useEffect(() => {
    if (stations.length < 2) return;

    const minMdVal = stations[0].md;
    const maxMdVal = stations[stations.length - 1].md;
    const span = maxMdVal - minMdVal || 1.0;
    const fraction = Math.max(0.001, Math.min(1.0, (clipMd - minMdVal) / span));

    if (corrLineMeshRef.current?.geometry) {
      const totalPoints = linePointsCountRef.current.corr;
      const activeCount = Math.max(2, Math.round(fraction * totalPoints));
      corrLineMeshRef.current.geometry.setDrawRange(0, activeCount);
    }

    if (rawLineMeshRef.current?.geometry) {
      const totalPoints = linePointsCountRef.current.raw;
      const activeCount = Math.max(2, Math.round(fraction * totalPoints));
      rawLineMeshRef.current.geometry.setDrawRange(0, activeCount);
    }

    if (stationsPointsMeshRef.current?.geometry) {
      const visibleStationCount = stations.filter((s) => s.md <= clipMd).length;
      stationsPointsMeshRef.current.geometry.setDrawRange(0, visibleStationCount);
    }

    surveyEouMeshesRef.current.forEach((item) => {
      item.mesh.visible = item.md <= clipMd;
    });

    if (activeCurveRef.current) {
      const bitPos = activeCurveRef.current.getPointAt(fraction);
      let quat = new THREE.Quaternion();
      try {
        const tangent = activeCurveRef.current.getTangentAt(fraction).normalize();
        const defaultDir = new THREE.Vector3(0, -1, 0);
        quat.setFromUnitVectors(defaultDir, tangent);
      } catch {
        // retain
      }

      if (bhaGroupRef.current) {
        bhaGroupRef.current.position.copy(bitPos);
        bhaGroupRef.current.setRotationFromQuaternion(quat);
      }

      if (bitEouGroupRef.current) {
        bitEouGroupRef.current.position.copy(bitPos);

        const lastVisibleStn = stations.slice().reverse().find((s) => s.md <= clipMd) || stations[0];
        const dynamicEou = lastVisibleStn.eou || calculateStationEou(clipMd, lastVisibleStn.inc, lastVisibleStn.azim);
        const visualScale = 0.05 * EOU_SCALE;

        const sx = Math.max(0.05, dynamicEou.semiIntermediate * visualScale);
        const sy = Math.max(0.05, dynamicEou.semiMajor * visualScale);
        const sz = Math.max(0.05, dynamicEou.semiMinor * visualScale);

        bitEouGroupRef.current.children.forEach((child) => {
          child.scale.set(sx, sy, sz);
        });

        try {
          const tangent = activeCurveRef.current.getTangentAt(fraction).normalize();
          const defaultUp = new THREE.Vector3(0, 1, 0);
          const eouQuat = new THREE.Quaternion().setFromUnitVectors(defaultUp, tangent);
          bitEouGroupRef.current.setRotationFromQuaternion(eouQuat);
        } catch {
          // retain
        }
      }
    }
  }, [clipMd, stations]);

  // Обработчики мыши
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) isDraggingRef.current = true;
    else if (e.button === 2) isPanningRef.current = true;
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingRef.current || isPanningRef.current) {
      if (hovered3DStation) setHovered3DStation(null);

      const deltaX = e.clientX - previousMousePositionRef.current.x;
      const deltaY = e.clientY - previousMousePositionRef.current.y;
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };

      if (isDraggingRef.current) {
        cameraRotationRef.current.theta -= deltaX * 0.008;
        cameraRotationRef.current.phi = Math.max(
          0.1,
          Math.min(Math.PI - 0.1, cameraRotationRef.current.phi - deltaY * 0.008)
        );
      } else if (isPanningRef.current) {
        const panSpeed = 0.3;
        cameraTargetRef.current.x -= deltaX * panSpeed;
        cameraTargetRef.current.y += deltaY * panSpeed;
      }

      if (cameraRef.current) {
        const { theta, phi, radius } = cameraRotationRef.current;
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

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    isPanningRef.current = false;
    if (hovered3DStation) {
      setHovered3DStation(null);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    cameraRotationRef.current.radius = Math.max(
      30,
      Math.min(800, cameraRotationRef.current.radius + e.deltaY * 0.2)
    );

    if (cameraRef.current) {
      const { theta, phi, radius } = cameraRotationRef.current;
      const target = cameraTargetRef.current;
      cameraRef.current.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta)
      );
      cameraRef.current.lookAt(target);
    }
  };

  const setCameraView = (view: 'iso' | 'top' | 'side' | 'bit') => {
    if (view === 'iso') {
      cameraRotationRef.current = { theta: Math.PI / 4, phi: Math.PI / 3, radius: 240 };
      cameraTargetRef.current = new THREE.Vector3(0, -60, 0);
    } else if (view === 'top') {
      cameraRotationRef.current = { theta: 0, phi: 0.001, radius: 280 };
      cameraTargetRef.current = new THREE.Vector3(0, 0, 0);
    } else if (view === 'side') {
      cameraRotationRef.current = { theta: 0, phi: Math.PI / 2, radius: 280 };
      cameraTargetRef.current = new THREE.Vector3(0, -60, 0);
    } else if (view === 'bit') {
      const last = stations[stations.length - 1];
      if (last) {
        cameraTargetRef.current = new THREE.Vector3(
          last.easting * 0.05,
          -last.tvd * 0.05,
          last.northing * 0.05
        );
        cameraRotationRef.current.radius = 60;
      }
    }

    if (cameraRef.current) {
      const { theta, phi, radius } = cameraRotationRef.current;
      const target = cameraTargetRef.current;
      cameraRef.current.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta)
      );
      cameraRef.current.lookAt(target);
    }
  };

  return (
    <div className="w-full h-full flex flex-col select-none overflow-hidden font-mono text-xs transition-colors bg-[#eef2f6] dark:bg-[#0a0d14]">
      {/* СТАТИЧНАЯ ШАПКА ВЬЮПОРТА (h-8): 1-в-1 как в 2D-режиме, тумблер 3D/2D не прыгает! */}
      <div className="h-8 px-2.5 border-b flex items-center justify-between gap-2 shrink-0 bg-white dark:bg-[#0c0f18] border-slate-200 dark:border-[#171c2b] text-3xs font-mono z-20">
        <div className="flex items-center gap-2">
          {/* Главный тумблер 3D / 2D */}
          {onSubTabChange && (
            <div className="inline-flex items-center p-0.5 rounded-md bg-slate-100 dark:bg-[#111422] border border-slate-200 dark:border-[#1e2538]">
              <button
                onClick={() => onSubTabChange('3d')}
                className={`px-2.5 py-0.5 rounded font-semibold transition-all ${
                  visualSubTab === '3d'
                    ? 'bg-white dark:bg-[#1c2233] text-sky-600 dark:text-sky-400 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                3D
              </button>
              <button
                onClick={() => onSubTabChange('2d')}
                className={`px-2.5 py-0.5 rounded font-semibold transition-all ${
                  visualSubTab === '2d'
                    ? 'bg-white dark:bg-[#1c2233] text-sky-600 dark:text-sky-400 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                2D
              </button>
            </div>
          )}

          {/* Быстрые ракурсы камеры 3D */}
          <div className="inline-flex items-center p-0.5 rounded-md bg-slate-100 dark:bg-[#111422] border border-slate-200 dark:border-[#1e2538]">
            <button
              onClick={() => setCameraView('iso')}
              className="px-2 py-0.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1c2233] transition-colors"
            >
              {isRu ? 'Изометрия' : 'Iso'}
            </button>
            <button
              onClick={() => setCameraView('top')}
              className="px-2 py-0.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1c2233] transition-colors"
            >
              {isRu ? 'План' : 'Plan'}
            </button>
            <button
              onClick={() => setCameraView('side')}
              className="px-2 py-0.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1c2233] transition-colors"
            >
              {isRu ? 'Разрез' : 'Section'}
            </button>
            <button
              onClick={() => setCameraView('bit')}
              className="px-2 py-0.5 rounded text-sky-600 dark:text-sky-400 font-semibold hover:bg-slate-100 dark:hover:bg-[#1c2233] transition-colors"
            >
              {isRu ? 'Долото' : 'Bit'}
            </button>
          </div>
        </div>

        {/* Выпадающее меню слоев — идентичное положение и размер */}
        <div className="relative">
          <button
            onClick={() => setShowLayersMenu(!showLayersMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white dark:bg-[#111422] border border-slate-200 dark:border-[#1e2538] text-slate-700 dark:text-slate-300 text-3xs font-semibold shadow-2xs"
          >
            <Layers className="w-3.5 h-3.5 text-sky-500" />
            <span>{isRu ? 'Слои' : 'Layers'}</span>
            <ChevronDown className="w-2.5 h-2.5 opacity-60" />
          </button>

          {showLayersMenu && (
            <div className="absolute top-8 right-0 w-64 p-2.5 rounded-md border shadow-xl z-30 space-y-2 bg-white dark:bg-[#111422] border-slate-200 dark:border-[#1e2538] text-3xs font-mono text-slate-700 dark:text-slate-300">
              <div className="text-4xs font-bold uppercase text-slate-400 pb-1 border-b border-slate-100 dark:border-[#1a2030]">
                {isRu ? 'Траектория' : 'Wellbore'}
              </div>

              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={showCorrected}
                  onChange={(e) => setShowCorrected(e.target.checked)}
                  className="rounded-xs accent-sky-500"
                />
                <span className="w-2 h-0.5 bg-sky-500 inline-block" />
                <span>{isRu ? 'Скорректированный ствол' : 'Corrected Path'}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={showStationsPoints}
                  onChange={(e) => setShowStationsPoints(e.target.checked)}
                  className="rounded-xs accent-sky-600"
                />
                <CircleDot className="w-2.5 h-2.5 text-sky-500" />
                <span>{isRu ? 'Точки замеров' : 'Survey Stations'}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={showRaw}
                  onChange={(e) => setShowRaw(e.target.checked)}
                  className="rounded-xs accent-amber-500"
                />
                <span className="w-2 h-0.5 bg-amber-500 inline-block" />
                <span>{isRu ? 'Сырой ствол MWD' : 'Raw MWD'}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={showOffsets}
                  onChange={(e) => setShowOffsets(e.target.checked)}
                  className="rounded-xs accent-purple-500"
                />
                <span className="w-2 h-0.5 bg-purple-500 inline-block" />
                <span>{isRu ? 'Соседние скважины' : 'Offset Wells'}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={showTargetHorizon}
                  onChange={(e) => setShowTargetHorizon(e.target.checked)}
                  className="rounded-xs accent-emerald-500"
                />
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                <span>{isRu ? 'Целевой горизонт' : 'Target Payzone'}</span>
              </label>

              <div className="text-4xs font-bold uppercase text-sky-600 dark:text-sky-400 pt-1.5 border-t border-slate-100 dark:border-[#1a2030] flex items-center gap-1">
                <ShieldAlert className="w-3 h-3 text-sky-500" />
                <span>{isRu ? 'Неопределенность (1:1)' : 'ISCWSA EOU (1:1)'}</span>
              </div>

              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={showBitEou}
                  onChange={(e) => setShowBitEou(e.target.checked)}
                  className="rounded-xs accent-sky-500"
                />
                <span>{isRu ? 'Только забой (Bit EOU)' : 'Bit EOU'}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={showSurveyEou}
                  onChange={(e) => setShowSurveyEou(e.target.checked)}
                  className="rounded-xs accent-sky-400"
                />
                <span>{isRu ? 'Все замеры (Воронка)' : 'All Stations Funnel'}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={showAntiCollisionEou}
                  onChange={(e) => setShowAntiCollisionEou(e.target.checked)}
                  className="rounded-xs accent-rose-500"
                />
                <span className="text-rose-600 dark:text-rose-400 font-semibold">
                  {isRu ? 'Опасное сближение (SF < 1.5)' : 'Proximity Alert (SF < 1.5)'}
                </span>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Интерактивный 3D-холст (начинается СТРОГО под шапкой h-8) */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={handleWheel}
        className={`flex-1 w-full h-full relative ${
          hovered3DStation ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Всплывающая карточка замера */}
      {hovered3DStation && (
        <div
          className="fixed z-50 pointer-events-none p-2.5 rounded-md shadow-xl text-3xs border bg-white/95 dark:bg-[#0e111a]/95 text-slate-800 dark:text-white border-slate-200 dark:border-slate-800 backdrop-blur-md font-mono min-w-56"
          style={{
            left: `${Math.min(window.innerWidth - 260, hovered3DStation.clientX + 16)}px`,
            top: `${Math.min(window.innerHeight - 220, Math.max(16, hovered3DStation.clientY - 40))}px`,
          }}
        >
          <div className="font-bold border-b border-slate-100 dark:border-slate-800 pb-1 mb-1.5 flex items-center justify-between text-sky-600 dark:text-sky-400">
            <span>#{hovered3DStation.station.id}</span>
            <span>MD: {formatLength(hovered3DStation.station.md, unitSystem)} {lenUnit}</span>
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-600 dark:text-slate-300 mb-1.5">
            <div>Inc: <strong className="text-slate-900 dark:text-white">{hovered3DStation.station.inc.toFixed(2)}°</strong></div>
            <div>Azim: <strong className="text-slate-900 dark:text-white">{hovered3DStation.station.azim.toFixed(2)}°</strong></div>
            <div>TVD: <strong className="text-slate-900 dark:text-white">{formatLength(hovered3DStation.station.tvd, unitSystem)} {lenUnit}</strong></div>
            <div>DLS: <strong className="text-slate-900 dark:text-white">{hovered3DStation.station.dls.toFixed(2)}</strong></div>
          </div>

          {hovered3DStation.station.eou && (
            <div className="p-1 rounded bg-sky-500/10 border border-sky-500/20 text-sky-700 dark:text-sky-300 flex justify-between items-center mb-1">
              <span>EOU 2σ:</span>
              <span className="font-bold">±{formatLength(hovered3DStation.station.eou.semiMajor, unitSystem)} {lenUnit}</span>
            </div>
          )}

          <div className="pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-4xs">
            <span className="text-slate-400">QC Status:</span>
            {hovered3DStation.station.isQcPass ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">Pass</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400 font-bold">Warning</span>
            )}
          </div>
        </div>
      )}

      {/* Инженерный скруббер глубины MD */}
      <div className="h-7 border-t px-3 flex items-center justify-between gap-3 text-3xs font-mono z-10 shrink-0 bg-white/95 dark:bg-[#0c0f18]/95 border-slate-200 dark:border-[#1a2030] text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-semibold text-slate-500">DEPTH:</span>
          <span className="text-sky-600 dark:text-sky-400 font-bold">
            {formatLength(clipMd, unitSystem)} {lenUnit}
          </span>
        </div>

        <input
          type="range"
          min="0"
          max={maxMd}
          step="10"
          value={clipMd}
          onChange={(e) => setClipMd(parseFloat(e.target.value))}
          className="flex-1 max-w-md accent-sky-500 h-1 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
        />

        <div className="text-4xs text-slate-400 hidden sm:block">
          {isRu ? 'ЛКМ: Вращение | ПКМ: Панорама | Колесо: Зум' : 'LMB: Orbit | RMB: Pan | Wheel: Zoom'}
        </div>
      </div>
    </div>
  );
};