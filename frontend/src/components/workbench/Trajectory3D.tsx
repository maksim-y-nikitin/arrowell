import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useWellbore } from '@/context/WellboreContext';
import { offsetWellsData } from '@/data/wellsData';
import { SurveyStation } from '@/types';
import {
  Sliders,
  Layers,
  ChevronDown,
  CircleDot,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { formatLength } from '@/utils/directionalMath';

type ThicknessMode = 'ultra' | 'slim' | 'regular';

interface Hovered3DStationInfo {
  station: SurveyStation;
  clientX: number;
  clientY: number;
}

export const Trajectory3D: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { stations, rawStations, unitSystem, activeWell, theme, language } = useWellbore();

  // Layer visibility toggles
  const [showRaw, setShowRaw] = useState(true);
  const [showCorrected, setShowCorrected] = useState(true);
  const [showPlanned, setShowPlanned] = useState(true);
  const [showOffsets, setShowOffsets] = useState(true);
  const [showTargetHorizon, setShowTargetHorizon] = useState(true);
  const [showStationsPoints, setShowStationsPoints] = useState(true);
  const [showLayersMenu, setShowLayersMenu] = useState(false);

  // Wellbore visual caliper configuration
  const [thicknessMode, setThicknessMode] = useState<ThicknessMode>('slim');

  // Trajectory measured depth clipping threshold
  const maxMd = useMemo(() => {
    return Math.max(...stations.map((s) => s.md), 3500);
  }, [stations]);

  const [clipMd, setClipMd] = useState<number>(maxMd);

  useEffect(() => {
    setClipMd(maxMd);
  }, [maxMd]);

  // Three.js core references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);

  // Station mesh picking references
  const stationMeshesRef = useRef<
    { hitMesh: THREE.Mesh; visualMesh: THREE.Mesh; station: SurveyStation }[]
  >([]);
  const lastHoveredVisualRef = useRef<THREE.Mesh | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseVecRef = useRef(new THREE.Vector2());
  const [hovered3DStation, setHovered3DStation] = useState<Hovered3DStationInfo | null>(null);

  // Viewport camera interaction state
  const isDraggingRef = useRef(false);
  const isPanningRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const cameraRotationRef = useRef({ theta: Math.PI / 4, phi: Math.PI / 3, radius: 250 });
  const cameraTargetRef = useRef(new THREE.Vector3(0, -60, 0));

  const isRu = language === 'ru';
  const lenUnit = unitSystem === 'metric' ? 'm' : 'ft';

  // Initialize WebGL scene and rendering pipeline
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme === 'dark' ? '#090a0f' : '#f8fafc');
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

    // Illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
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

    // Render loop
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

  // Synchronize canvas background with active theme
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(theme === 'dark' ? '#090a0f' : '#f8fafc');
    }
  }, [theme]);

  // Construct 3D trajectory geometries with complete GPU memory reclamation
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    // Recursively dispose geometries and materials across all meshes and nested groups
    group.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });

    // Detach all child objects from root group
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    stationMeshesRef.current = [];
    lastHoveredVisualRef.current = null;

    // Spatial coordinate scale (1 meter = 0.05 units in Three.js world space)
    const scale = 0.05;

    let tubeRadius = 0.45;
    let rawTubeRadius = 0.35;
    if (thicknessMode === 'ultra') {
      tubeRadius = 0.25;
      rawTubeRadius = 0.2;
    } else if (thicknessMode === 'regular') {
      tubeRadius = 0.75;
      rawTubeRadius = 0.55;
    }

    // Reference surface grid
    const gridHelper = new THREE.GridHelper(
      180,
      18,
      theme === 'dark' ? 0x22293f : 0xcbd5e1,
      theme === 'dark' ? 0x151a2a : 0xe2e8f0
    );
    gridHelper.position.y = 0;
    group.add(gridHelper);

    // Wellhead Kelly Bushing marker at origin
    const wellheadGeo = new THREE.CylinderGeometry(1.2, 1.8, 2.5, 16);
    const wellheadMat = new THREE.MeshStandardMaterial({
      color: theme === 'dark' ? 0x38bdf8 : 0x0284c7,
      metalness: 0.5,
      roughness: 0.3,
    });
    const wellhead = new THREE.Mesh(wellheadGeo, wellheadMat);
    wellhead.position.set(0, 1.25, 0);
    group.add(wellhead);

    // Raw uncorrected MWD trajectory
    if (showRaw && rawStations.length > 1) {
      const filteredRaw = rawStations.filter((s) => s.md <= clipMd);
      if (filteredRaw.length > 1) {
        const rawPoints = filteredRaw.map(
          (s) => new THREE.Vector3(s.easting * scale, -s.tvd * scale, s.northing * scale)
        );
        const rawCurve = new THREE.CatmullRomCurve3(rawPoints);
        const rawGeo = new THREE.TubeGeometry(rawCurve, rawPoints.length * 3, rawTubeRadius, 8, false);
        const rawMat = new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          wireframe: false,
          transparent: true,
          opacity: 0.7,
        });
        group.add(new THREE.Mesh(rawGeo, rawMat));
      }
    }

    // Corrected main trajectory
    if (showCorrected && stations.length > 1) {
      const filteredStations = stations.filter((s) => s.md <= clipMd);
      if (filteredStations.length > 1) {
        const points = filteredStations.map(
          (s) => new THREE.Vector3(s.easting * scale, -s.tvd * scale, s.northing * scale)
        );
        const curve = new THREE.CatmullRomCurve3(points);
        const tubeGeo = new THREE.TubeGeometry(curve, points.length * 4, tubeRadius, 12, false);
        const tubeMat = new THREE.MeshStandardMaterial({
          color: theme === 'dark' ? 0x38bdf8 : 0x0284c7,
          metalness: 0.25,
          roughness: 0.35,
        });
        const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
        group.add(tubeMesh);

        // Survey station pick targets with enlarged invisible hit spheres
        if (showStationsPoints) {
          const pointGeo = new THREE.SphereGeometry(tubeRadius * 1.6, 10, 10);
          const hitGeo = new THREE.SphereGeometry(Math.max(tubeRadius * 4.2, 3.2), 8, 8);
          const hitMat = new THREE.MeshBasicMaterial({ visible: false });

          filteredStations.forEach((stn) => {
            const pt = new THREE.Vector3(stn.easting * scale, -stn.tvd * scale, stn.northing * scale);
            const visualMesh = new THREE.Mesh(
              pointGeo,
              new THREE.MeshStandardMaterial({
                color: stn.isQcPass
                  ? theme === 'dark'
                    ? 0x38bdf8
                    : 0x0284c7
                  : 0xf59e0b,
                roughness: 0.2,
                metalness: 0.2,
              })
            );
            visualMesh.position.copy(pt);
            group.add(visualMesh);

            const hitMesh = new THREE.Mesh(hitGeo, hitMat);
            hitMesh.position.copy(pt);
            group.add(hitMesh);

            stationMeshesRef.current.push({
              hitMesh,
              visualMesh,
              station: stn,
            });
          });
        }

        // BHA and drill bit assembly aligned with trajectory tangent vector
        const lastStn = filteredStations[filteredStations.length - 1];
        const bitPos = new THREE.Vector3(
          lastStn.easting * scale,
          -lastStn.tvd * scale,
          lastStn.northing * scale
        );

        const collarGeo = new THREE.CylinderGeometry(tubeRadius * 1.25, tubeRadius * 1.25, 1.6, 12);
        const collarMat = new THREE.MeshStandardMaterial({
          color: 0x64748b,
          metalness: 0.6,
          roughness: 0.3,
        });
        const collarMesh = new THREE.Mesh(collarGeo, collarMat);

        const bitGeo = new THREE.ConeGeometry(tubeRadius * 1.5, 0.7, 12);
        bitGeo.rotateX(Math.PI);
        const bitMat = new THREE.MeshStandardMaterial({
          color: 0x10b981,
          metalness: 0.4,
          roughness: 0.25,
        });
        const bitMesh = new THREE.Mesh(bitGeo, bitMat);
        bitMesh.position.set(0, -0.8 - 0.35, 0);

        const bhaGroup = new THREE.Group();
        bhaGroup.add(collarMesh);
        bhaGroup.add(bitMesh);
        bhaGroup.position.copy(bitPos);

        try {
          const tangent = curve.getTangentAt(1).normalize();
          const defaultDir = new THREE.Vector3(0, -1, 0);
          const quat = new THREE.Quaternion().setFromUnitVectors(defaultDir, tangent);
          bhaGroup.setRotationFromQuaternion(quat);
        } catch {
          // Maintain default orientation on degenerate tangent
        }

        group.add(bhaGroup);
      }
    }

    // Planned trajectory profile
    if (showPlanned && stations.length > 1) {
      const planPoints = stations.map(
        (s) => new THREE.Vector3((s.easting * 1.05) * scale, (-s.tvd * 0.98) * scale, (s.northing * 1.02) * scale)
      );
      const planCurve = new THREE.CatmullRomCurve3(planPoints);
      const planGeo = new THREE.TubeGeometry(planCurve, planPoints.length * 2, tubeRadius * 0.5, 6, false);
      const planMat = new THREE.MeshBasicMaterial({
        color: theme === 'dark' ? 0x64748b : 0x94a3b8,
        wireframe: false,
        transparent: true,
        opacity: 0.4,
      });
      group.add(new THREE.Mesh(planGeo, planMat));
    }

    // Offset wellbores for proximity visualization
    if (showOffsets) {
      offsetWellsData.forEach((offset) => {
        const offPoints = offset.stations.map(
          (s) => new THREE.Vector3(s.easting * scale, -s.tvd * scale, s.northing * scale)
        );
        if (offPoints.length > 1) {
          const offCurve = new THREE.CatmullRomCurve3(offPoints);
          const offGeo = new THREE.TubeGeometry(offCurve, offPoints.length * 2, tubeRadius * 0.7, 6, false);
          const offMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0xa855f7),
            roughness: 0.5,
            transparent: true,
            opacity: 0.65,
          });
          group.add(new THREE.Mesh(offGeo, offMat));
        }
      });
    }

    // Target geological payzone horizon
    if (showTargetHorizon) {
      const targetTvd = 2480;
      const targetY = -targetTvd * scale;
      const horizonGeo = new THREE.PlaneGeometry(160, 160);
      horizonGeo.rotateX(-Math.PI / 2);
      const horizonMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: theme === 'dark' ? 0.08 : 0.05,
        side: THREE.DoubleSide,
      });
      const horizonMesh = new THREE.Mesh(horizonGeo, horizonMat);
      horizonMesh.position.set(20, targetY, 20);
      group.add(horizonMesh);
    }
  }, [
    stations,
    rawStations,
    clipMd,
    thicknessMode,
    showRaw,
    showCorrected,
    showPlanned,
    showOffsets,
    showTargetHorizon,
    showStationsPoints,
    activeWell,
    theme,
  ]);

  // Viewport input handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      isDraggingRef.current = true;
    } else if (e.button === 2) {
      isPanningRef.current = true;
    }
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingRef.current || isPanningRef.current) {
      if (hovered3DStation) setHovered3DStation(null);
      if (lastHoveredVisualRef.current) {
        lastHoveredVisualRef.current.scale.set(1, 1, 1);
        lastHoveredVisualRef.current = null;
      }

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

    if (!containerRef.current || !cameraRef.current || stationMeshesRef.current.length === 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    mouseVecRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseVecRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseVecRef.current, cameraRef.current);
    const hitObjects = stationMeshesRef.current.map((item) => item.hitMesh);
    const intersects = raycasterRef.current.intersectObjects(hitObjects, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const found = stationMeshesRef.current.find((item) => item.hitMesh === hit.object);
      if (found) {
        if (lastHoveredVisualRef.current && lastHoveredVisualRef.current !== found.visualMesh) {
          lastHoveredVisualRef.current.scale.set(1, 1, 1);
        }
        found.visualMesh.scale.set(2.2, 2.2, 2.2);
        lastHoveredVisualRef.current = found.visualMesh;

        setHovered3DStation({
          station: found.station,
          clientX: e.clientX,
          clientY: e.clientY,
        });
        return;
      }
    }

    if (lastHoveredVisualRef.current) {
      lastHoveredVisualRef.current.scale.set(1, 1, 1);
      lastHoveredVisualRef.current = null;
    }
    if (hovered3DStation) {
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
    if (lastHoveredVisualRef.current) {
      lastHoveredVisualRef.current.scale.set(1, 1, 1);
      lastHoveredVisualRef.current = null;
    }
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
      cameraRotationRef.current = { theta: Math.PI / 4, phi: Math.PI / 3, radius: 250 };
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
    <div className="w-full h-full flex flex-col relative select-none overflow-hidden font-mono text-xs transition-colors bg-white dark:bg-[#090a0f]">
      {/* HUD Navigation Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1 p-1 rounded-lg border shadow-md pointer-events-auto backdrop-blur-md transition-colors bg-white/90 dark:bg-[#0c0e17]/90 border-slate-200 dark:border-[#171c2b]">
          <button
            onClick={() => setCameraView('iso')}
            className="px-2.5 py-1 rounded text-3xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-[#1a2035] transition-colors"
          >
            {isRu ? 'Изометрия' : 'Isometric'}
          </button>
          <button
            onClick={() => setCameraView('top')}
            className="px-2.5 py-1 rounded text-3xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-[#1a2035] transition-colors"
          >
            {isRu ? 'План (Top)' : 'Top Plan'}
          </button>
          <button
            onClick={() => setCameraView('side')}
            className="px-2.5 py-1 rounded text-3xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-[#1a2035] transition-colors"
          >
            {isRu ? 'Профиль (Side)' : 'Side View'}
          </button>
          <button
            onClick={() => setCameraView('bit')}
            className="px-2.5 py-1 rounded text-3xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-slate-200/70 dark:hover:bg-[#1a2035] transition-colors"
          >
            {isRu ? 'Долото (BHA)' : 'Drill Bit'}
          </button>
        </div>

        <div className="hidden md:flex items-center gap-1 p-1 rounded-lg border shadow-md pointer-events-auto backdrop-blur-md transition-colors bg-white/90 dark:bg-[#0c0e17]/90 border-slate-200 dark:border-[#171c2b] text-3xs">
          <span className="text-slate-400 px-1.5 font-medium">{isRu ? 'Ствол:' : 'Caliber:'}</span>
          <button
            onClick={() => setThicknessMode('ultra')}
            className={`px-2 py-0.5 rounded transition-colors ${
              thicknessMode === 'ultra'
                ? 'bg-sky-500 text-white font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[#1a2035]'
            }`}
          >
            {isRu ? 'Тонкий' : 'Slim'}
          </button>
          <button
            onClick={() => setThicknessMode('slim')}
            className={`px-2 py-0.5 rounded transition-colors ${
              thicknessMode === 'slim'
                ? 'bg-sky-500 text-white font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[#1a2035]'
            }`}
          >
            {isRu ? 'Стандарт' : 'Standard'}
          </button>
          <button
            onClick={() => setThicknessMode('regular')}
            className={`px-2 py-0.5 rounded transition-colors ${
              thicknessMode === 'regular'
                ? 'bg-sky-500 text-white font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[#1a2035]'
            }`}
          >
            {isRu ? 'Утолщенный' : 'Wide'}
          </button>
        </div>

        <div className="relative pointer-events-auto">
          <button
            onClick={() => setShowLayersMenu(!showLayersMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border shadow-md backdrop-blur-md transition-colors bg-white/90 dark:bg-[#0c0e17]/90 border-slate-200 dark:border-[#171c2b] text-slate-700 dark:text-slate-300 text-3xs font-semibold"
          >
            <Layers className="w-3 h-3 text-sky-500" />
            <span>{isRu ? 'Слои' : 'Layers'}</span>
            <ChevronDown className="w-2.5 h-2.5 opacity-60" />
          </button>

          {showLayersMenu && (
            <div className="absolute top-8 right-0 w-56 p-2.5 rounded-lg border shadow-xl z-30 space-y-2 transition-colors bg-white dark:bg-[#111422] border-slate-200 dark:border-[#20273d] text-3xs font-mono text-slate-700 dark:text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={showCorrected}
                  onChange={(e) => setShowCorrected(e.target.checked)}
                  className="rounded-xs accent-sky-500"
                />
                <span className="w-2 h-2 rounded-full bg-sky-500 inline-block" />
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
                <span>{isRu ? 'Точки замеров (Stations)' : 'Survey Station Points'}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={showRaw}
                  onChange={(e) => setShowRaw(e.target.checked)}
                  className="rounded-xs accent-amber-500"
                />
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                <span>{isRu ? 'Сырой ствол MWD (исходный)' : 'Raw MWD Path'}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={showPlanned}
                  onChange={(e) => setShowPlanned(e.target.checked)}
                  className="rounded-xs accent-slate-400"
                />
                <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                <span>{isRu ? 'Проектный профиль' : 'Planned Profile'}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={showOffsets}
                  onChange={(e) => setShowOffsets(e.target.checked)}
                  className="rounded-xs accent-purple-500"
                />
                <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
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
            </div>
          )}
        </div>
      </div>

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

      {hovered3DStation && (
        <div
          className="fixed z-50 pointer-events-none p-3 rounded-lg shadow-2xl text-3xs border bg-white/95 dark:bg-slate-900/95 text-slate-800 dark:text-white border-slate-200 dark:border-slate-700 backdrop-blur-md font-mono min-w-60 transition-transform ease-out"
          style={{
            left: `${Math.min(window.innerWidth - 270, hovered3DStation.clientX + 16)}px`,
            top: `${Math.min(window.innerHeight - 240, Math.max(16, hovered3DStation.clientY - 40))}px`,
          }}
        >
          <div className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1.5 mb-2 flex items-center justify-between gap-3 text-sky-600 dark:text-sky-400">
            <span className="flex items-center gap-1.5">
              <CircleDot className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>{isRu ? `Точка замера #${hovered3DStation.station.id}` : `Survey Station #${hovered3DStation.station.id}`}</span>
            </span>
            <span className="text-slate-600 dark:text-slate-200">
              MD: <strong className="text-slate-900 dark:text-white">{formatLength(hovered3DStation.station.md, unitSystem)}</strong> {lenUnit}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-1 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded text-slate-700 dark:text-slate-300 mb-2">
            <div>
              <span className="text-slate-500 dark:text-slate-400">{isRu ? 'Зенитный (Inc):' : 'Inc:'} </span>
              <strong className="text-slate-900 dark:text-white">{hovered3DStation.station.inc.toFixed(2)}°</strong>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">{isRu ? 'Азимут (Azim):' : 'Azim:'} </span>
              <strong className="text-slate-900 dark:text-white">{hovered3DStation.station.azim.toFixed(2)}°</strong>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">TVD: </span>
              <strong className="text-slate-900 dark:text-white">{formatLength(hovered3DStation.station.tvd, unitSystem)} {lenUnit}</strong>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">DLS: </span>
              <strong className="text-slate-900 dark:text-white">{hovered3DStation.station.dls.toFixed(2)}°/30{lenUnit}</strong>
            </div>
          </div>

          <div className="space-y-1 text-slate-600 dark:text-slate-300 mb-2">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">{isRu ? 'Север (+N/-S):' : 'Northing (+N/-S):'}</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {formatLength(hovered3DStation.station.northing, unitSystem)} {lenUnit}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">{isRu ? 'Восток (+E/-W):' : 'Easting (+E/-W):'}</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {formatLength(hovered3DStation.station.easting, unitSystem)} {lenUnit}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">{isRu ? 'Вертикальная секция (VS):' : 'Vert. Section (VS):'}</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {formatLength(hovered3DStation.station.vs, unitSystem)} {lenUnit}
              </span>
            </div>
          </div>

          <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700/80 grid grid-cols-3 gap-1 text-center text-3xs">
            <div className="bg-slate-100 dark:bg-slate-800/60 p-1 rounded">
              <div className="text-slate-500 dark:text-slate-400">Btotal</div>
              <div className="font-bold text-sky-600 dark:text-sky-400">{hovered3DStation.station.bTotal} nT</div>
            </div>
            <div className="bg-slate-100 dark:bg-slate-800/60 p-1 rounded">
              <div className="text-slate-500 dark:text-slate-400">Gtotal</div>
              <div className="font-bold text-emerald-600 dark:text-emerald-400">{hovered3DStation.station.gTotal.toFixed(3)} g</div>
            </div>
            <div className="bg-slate-100 dark:bg-slate-800/60 p-1 rounded">
              <div className="text-slate-500 dark:text-slate-400">Dip</div>
              <div className="font-bold text-indigo-600 dark:text-indigo-400">{hovered3DStation.station.dipAngle.toFixed(2)}°</div>
            </div>
          </div>

          <div className="mt-2 pt-1.5 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400">{isRu ? 'Контроль качества (QC):' : 'QC Quality:'}</span>
            {hovered3DStation.station.isQcPass ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                <CheckCircle2 className="w-3 h-3" />
                {isRu ? 'В норме' : 'Pass'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                <AlertTriangle className="w-3 h-3" />
                {isRu ? 'Отклонение QC' : 'Warning'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Trajectory Depth Clipping Slider */}
      <div className="h-8 border-t px-3 flex items-center justify-between gap-3 text-3xs font-mono z-10 shrink-0 transition-colors bg-white/90 dark:bg-[#0c0e17]/90 border-slate-200 dark:border-[#171c2b] text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-2 shrink-0">
          <Sliders className="w-3 h-3 text-sky-500" />
          <span>MD:</span>
          <span className="text-sky-600 dark:text-sky-400 font-semibold">
            {formatLength(clipMd, unitSystem)} {unitSystem === 'metric' ? 'm' : 'ft'}
          </span>
        </div>

        <input
          type="range"
          min="0"
          max={maxMd}
          step="10"
          value={clipMd}
          onChange={(e) => setClipMd(parseFloat(e.target.value))}
          className="flex-1 max-w-sm accent-sky-500 h-1 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
        />

        <div className="text-3xs text-slate-400 hidden sm:block">
          {isRu ? 'Наведите на точку замера для данных | ЛКМ: Вращение | ПКМ: Панорамирование | Колесо: Зум' : 'Hover survey point for info | Drag: Orbit | Right-Click: Pan | Wheel: Zoom'}
        </div>
      </div>
    </div>
  );
};