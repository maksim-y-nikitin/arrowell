<div align="center">

# 🧭 ArroWell

**High-Performance Directional Drilling Survey Workstation & MWD Analytics Platform**

[![Engine: arrowell_engine](https://img.shields.io/badge/Math%20Engine-arrowell__engine-0284c7?style=flat&logo=python&logoColor=white)](arrowell_engine/)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL%20120FPS-000000?style=flat&logo=three.js&logoColor=white)](https://threejs.org/)
[![DuckDB](https://img.shields.io/badge/DuckDB-In--Memory%20OLAP-FFF000?style=flat&logo=duckdb&logoColor=black)](https://duckdb.org/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.0-06B6D4?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Pytest Suite](https://img.shields.io/badge/Tests-24%20Passed%20(100%25)-brightgreen?style=flat&logo=pytest&logoColor=white)](https://docs.pytest.org/)
[![Benchmarks](https://img.shields.io/badge/Benchmarks-8%20Verified-purple?style=flat&logo=speedtest&logoColor=white)](#-engine-performance-benchmarks)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

<p align="center">
  A cloud-native, CAD-grade engineering workstation for directional wellbore trajectory calculation, 
  MWD sensor telemetry QA/QC, high-definition continuous inclination fusion, ISCWSA 3D anti-collision clearance scanning, 
  and real-time physical calibration (MSA, BHA Sag) — <b>powered by the native <code>arrowell_engine</code> computational kernel</b>.
</p>

<p align="center">
  <a href="#key-features">Key Features</a> •
  <a href="#-engine-performance-benchmarks">Benchmarks</a> •
  <a href="#computational-core-arrowell_engine">arrowell_engine</a> •
  <a href="#architecture--tech-stack">Architecture</a> •
  <a href="#mathematical-foundation">Math & Physics</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#api-endpoints">API Overview</a> •
  <a href="#project-structure">Project Structure</a>
</p>

</div>

---

## 🌟 Key Features

### 1. 3D WebGL Orbit Visualizer & Synchronized 2D Projections
<p align="center">
  <img src="docs/images/traj.png" alt="3D WebGL Wellbore Trajectory and 2D Projections" width="85%" />
</p>

- **Hardware-Accelerated 3D Orbit (Three.js)**: Sub-millisecond depth clipping slider leveraging native GPU buffer draw-ranges (`geometry.setDrawRange`) without mesh re-allocation at 60–120 FPS.
- **True-to-Scale Caliper Rendering**: Dynamic collar thickness visualization (`Slim`, `Standard`, `Wide`), spatial tangent orientation of the BHA drill-bit assembly via unit quaternions, offset well trajectories, and target payzone horizons.
- **Zero-Jitter Hover Raycaster**: Cursor-following inspection tooltips powered by oversized invisible hit-spheres for stutter-free telemetry picking.
- **Synchronized 2D Projections (SVG)**: Vectorized Plan View ($+N / +E$) and Vertical Section View ($TVD \text{ vs. } VS$) with pan, wheel zoom, and real-time cursor coordinate transformation.

### 2. MWD Sensor Diagnostics & Tolerance Corridors
<p align="center">
  <img src="docs/images/qc.png" alt="MWD Sensor Diagnostics and QC Acceptance Corridors" width="85%" />
</p>

- **Real-Time Sensor QC Corridors**: Station-by-station validation of tri-axial accelerometer ($G_x, G_y, G_z$) and magnetometer ($B_x, B_y, B_z$) measurements against global geomagnetic references (**WMM2025, IGRF-14, WMMHR**).
- **Interactive Multi-Axis SVG Charts**: Independent axis zooming (`Wheel` for MD depth stretching, `Shift + Wheel` for value amplitude scaling) with non-blocking hairline cursor inspection.

### 3. Physical Calibration & Correction Suite
<p align="center">
  <img src="docs/images/overview.png" alt="Directional Corrections Suite Overview" width="85%" />
</p>

- **Multi-Station Analysis (MSA)**: Global optimization combining SciPy **Differential Evolution** with **L-BFGS-B** local polishing, decoupling drillstring axial magnetization bias ($\Delta B_z$), cross-axial biases ($B_x, B_y$), sensor scale factors, and block misalignments.
- **Toolface Coverage Conditioning**: Automatic distribution analysis of Gravity Toolface (GTF) to constrain cross-axial bounds and prevent overfitting during motor sliding intervals.
- **BHA Gravity Sag (SAG)**: Analytical fourth-order beam deflection solver ($< 0.5 \text{ ms}$ execution), resolving bilateral borehole wall contact constraints, drillstring stiffness ($EI$), fluid buoyancy, and local wellbore curvature (DLS).
- **Vertical Regularization**: Analytical singularity protection locking indeterminate azimuths below $Inc < 0.1^\circ$ to prevent noise-induced azimuth jitter.

### 4. High-Definition Continuous Inclination (CI) Trajectory Fusion
- **Dynamic Offset Balancing**: Fuses sparse 6-axis connection surveys (every 30 m) with high-frequency continuous inclination streams (every 0.5–2 m) while drilling and rotating.
- **Curvature-Weighted Azimuth Distribution**: Allocates trajectory azimuth shifts proportionally across true dynamic dogleg intervals rather than assuming uniform curvature.
- **TVD-Bounded Douglas-Peucker Thinning**: Compresses trajectory station counts by ~95% while strictly guaranteeing vertical depth fidelity within $\le 0.05 \text{ m}$ ($\le 5 \text{ cm}$).

### 5. ISCWSA 3D Position Uncertainty & Anti-Collision Scan
<p align="center">
  <img src="docs/images/anticol.png" alt="ISCWSA Anti-Collision Proximity Scan" width="85%" />
</p>

- **Standardized Error Propagation**: Strict adherence to **SPE 67616 / ISCWSA / OWSG** (Rev 4, Rev 5.11, MWD+SAG, IFR1/2) error models.
- **3D Ellipsoid of Uncertainty (EOU)**: Full covariance synthesis ($\Sigma_{NEV} = \Sigma_{\text{rand}} + \sum \vec{e}_{\text{sys}} \vec{e}_{\text{sys}}^T$) with spectral eigen-decomposition.
- **Real-Time Separation Factor (SF)**: True covariance projection along the line of closest approach ($\vec{u}^T \Sigma \vec{u}$), generating clearance metrics, warning levels (`SAFE`, `WARNING`, `CRITICAL`), and breach alerts.

### 6. Unified 3-Tab Engineering Settings Modal
<p align="center">
  <img src="docs/images/settings.png" alt="Unified Engineering Settings Modal" width="85%" />
</p>

- 📍 **1. Location & Geodesy**: Surface coordinates (Latitude, Longitude), elevation datums (Rotary Kelly Bushing **RKB**, Ground Level **GL**), air gap ($RKB - GL$), well slot assignment, and target reservoir formation.
- 🧭 **2. Geomagnetic Reference (WMM)**: One-click **"Auto WMM from Coords"** button that computes spherical harmonics and Somigliana gravity directly from Tab 1 coordinates via backend `arrowell_engine`.
- 🏗 **3. BHA & Mud Properties (SAG)**: Presets (`6-3/4"`, `4-3/4" Slim`, `8" Heavy`), collar OD/ID, stabilizer spacing, sensor-to-bit distance, fluid density $\rho_{\text{mud}}$, and live beam deflection preview.

### 7. Industry-Standard Data Exchange
- **Parsers & Exporters**: Native support for **Halliburton Landmark COMPASS (.txt)**, **CWLS LAS 2.0 (.las)**, CSV, structured JSON, and print-ready **official HTML/PDF survey reports**.
- **Offline-First UI Architecture**: Client-side fallback computation ensuring complete workstation responsiveness even if backend connectivity drops.

---

## ⚡ Engine Performance Benchmarks

Empirically measured with `pytest-benchmark 5.3` on Linux x86_64 (Python 3.11):

| Computational Module | Workload / Dataset Size | Mean Latency | Throughput (OPS) | Performance Profile |
| :--- | :--- | :--- | :--- | :--- |
| **MCM Trajectory (NumPy)** | 100 survey stations | **~58.8 μs** | **17,015 ops/s** | Vectorized Sawaryn-Thorogood $\mathcal{O}(N)$ |
| **MCM Trajectory (NumPy)** | 1,000 survey stations | **~204.4 μs** | **4,892 ops/s** | Zero-latency 120 FPS WebGL resync |
| **MCM Trajectory (NumPy)** | 10,000 survey stations | **~2.02 ms** | **493 ops/s** | Ultra-deep ERD wellbore scale |
| **BHA Gravity Sag Solver** | Pinned-pinned beam ODE | **~437.1 μs** | **2,288 ops/s** | Closed-form analytical contact solver |
| **Continuous Inc Fusion** | 2,000 streaming CI points | **~11.78 ms** | **84.9 ops/s** | 95.4% mesh compression (TVD $\le 5$ cm) |
| **ISCWSA 3D Uncertainty** | 500 stations (3D EOU) | **~139.2 ms** | **7.2 ops/s** | Covariance synthesis & Eigen-decomposition |
| **Geomag WMM2025 Harmonics**| 500 spatial 3D points | **~300.2 ms** | **3.3 ops/s** | Degree 12 Schmidt-normalized Legendre |
| **MSA Global Optimization**| 6-station D&I sensor run | **~776.2 ms** | **1.3 ops/s** | Differential Evolution + L-BFGS-B polishing |

---

## 🔬 Computational Core: `arrowell_engine`

ArroWell relies on its own high-performance, clean-room computational engine (**[`arrowell_engine`](arrowell_engine/)**), completely free of legacy third-party binary blobs:

```text
arrowell_engine/
├── geomag/          # Spherical harmonics (WMM2025/IGRF-14), Schmidt quasi-normalization, model compilers
├── msa/             # Multi-Station Analysis calibration engine & toolface distribution filters
├── sag/             # BHA beam bending solver with bilateral borehole contact boundaries
├── sensors/         # Sensor error models, tri-axial transforms, vertical singularity locks
├── trajectory/
│   ├── mcm.py       # Vectorized Minimum Curvature Method (Sawaryn & Thorogood)
│   ├── continuous.py# High-Definition Continuous Inclination fusion & TVD-bounded thinning
│   └── uncertainty.py# ISCWSA 3D position error propagation, EOU eigen-analysis, and Separation Factor (SF)
└── coords.py        # WGS-84 geodetic transformations and UTM meridian grid convergence
```

- **Zero Factorial Overflow**: Associated Legendre polynomials evaluated with recursive Schmidt quasi-normalization, scaling stably up to degree $n = 133$ (WMMHR).
- **Vectorized NumPy / SciPy Core**: Trajectory integration, batch geomagnetic evaluations, and covariance tensor accumulations run as vectorized array operations compatible with NumPy 2.x.

---

## 🏗 Architecture & Tech Stack

```
                                      ┌─────────────────────────────────────┐
                                      │        ArroWell Frontend            │
                                      │  React 19 • Three.js • TypeScript   │
                                      │    Tailwind CSS v4 • Zustand • Vite │
                                      └──────────────────┬──────────────────┘
                                                         │ HTTP REST / JSON
                                                         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                           ArroWell Backend                                │
│                     FastAPI • Pydantic v2 • SQLAlchemy 2.0                │
├───────────────────────────────┬───────────────────────────────────────────┤
│       Data Storage            │             arrowell_engine               │
│  DuckDB Columnar Storage      │     Pure-Python Computational Kernel      │
│  (Persistent / In-Memory)     │     • MCM Trajectory Integration          │
│                               │     • SciPy Differential Evolution MSA    │
│                               │     • Analytical Euler-Bernoulli Sag      │
│                               │     • ISCWSA 3D Position Uncertainty & SF │
│                               │     • HD Continuous Inclination Fusion    │
└───────────────────────────────┴───────────────────────────────────────────┘
```

| Layer | Technologies | Responsibility |
| :--- | :--- | :--- |
| **Computational Core** | **`arrowell_engine`** | MCM trajectory math, Differential Evolution MSA, BHA Sag solver, ISCWSA 3D EOU, Continuous Inc fusion, WMM2025/IGRF-14 geomagnetics. |
| **Backend API** | Python 3.11+, FastAPI, SQLAlchemy 2.0, DuckDB, `uv` | REST endpoints, DuckDB persistence, survey validation schemas, automated test suites. |
| **Frontend UI** | React 19, TypeScript, Three.js, Zustand, Vite, Tailwind v4 | 3D WebGL viewer, synchronized 2D projections, high-density survey logs, SVG QC dashboards. |
| **DevOps** | Docker, Docker Compose, Nginx (Alpine) | Multi-stage container builds, persistent volume mapping, production reverse-proxying. |

---

## 🧮 Mathematical Foundation

All directional drilling mathematics conform strictly to **ISCWSA / SPE / API RP 78** standards:

### 1. Minimum Curvature Method (MCM)
Implemented via `arrowell_engine.trajectory.mcm` conforming to **Sawaryn & Thorogood (SPE 84246)**. Across measured depth interval $\Delta MD = MD_2 - MD_1$:

$$\Delta DL = \arccos\left(\cos(I_2 - I_1) - \sin I_1 \sin I_2 [1 - \cos(A_2 - A_1)]\right)$$

$$RF = \frac{2}{\Delta DL} \tan\left(\frac{\Delta DL}{2}\right) \quad (\text{Ratio Factor}, \lim_{\Delta DL \to 0} RF = 1)$$

$$\Delta TVD = \frac{\Delta MD}{2} (\cos I_1 + \cos I_2) \cdot RF$$

$$\Delta North = \frac{\Delta MD}{2} (\sin I_1 \cos A_1 + \sin I_2 \cos A_2) \cdot RF$$

$$\Delta East = \frac{\Delta MD}{2} (\sin I_1 \sin A_1 + \sin I_2 \sin A_2) \cdot RF$$

### 2. ISCWSA 3D Position Uncertainty & Anti-Collision (SPE 67616)
Implemented via `arrowell_engine.trajectory.uncertainty`. Positional uncertainty accumulates random and systematic error terms:

$$\Sigma_{NEV} = \Sigma_{\text{random}} + \sum_{i \in \text{systematic}} \vec{e}_i \vec{e}_i^T$$

Where $\vec{e}_i = \sum_{k} \left( \frac{\partial \Delta \vec{r}_k}{\partial MD} \delta MD_{i,k} + \frac{1}{2} \frac{\partial \Delta \vec{r}_k}{\partial I} \delta I_{i,k} + \frac{1}{2} \frac{\partial \Delta \vec{r}_k}{\partial A} \delta A_{i,k} \right) \cdot \sigma_i$.

Along the unit line of closest approach $\vec{u} = \frac{\vec{r}_O - \vec{r}_S}{\|\vec{r}_O - \vec{r}_S\|}$ between subject well ($S$) and offset well ($O$):

$$\sigma_S = \sqrt{\vec{u}^T \Sigma_S \vec{u}}, \quad \sigma_O = \sqrt{\vec{u}^T \Sigma_O \vec{u}}$$

$$SF = \frac{D_{\text{center}} - (R_{\text{well}, S} + R_{\text{well}, O})}{k \cdot (\sigma_S + \sigma_O)}$$

### 3. Multi-Station Analysis (MSA)
Implemented via `arrowell_engine.msa.engine`. Resolves sensor biases and eliminates drillstring axial magnetization bias $\Delta B_z$:

$$\vec{B}_{\text{cor}} = \begin{bmatrix} (B_x / (1 + MS_x)) - MB_x \\ (B_y / (1 + MS_y)) - MB_y \\ (B_z / (1 + MS_z)) - MB_z \end{bmatrix}, \quad \Delta A_m \approx \frac{\Delta B_z \cdot \sin(I) \cdot \sin(A_m)}{B_{\text{total}} \cdot \cos(\theta_{\text{dip}})}$$

### 4. BHA Gravity Sag Deflection (SAG)
Implemented via `arrowell_engine.sag.beam`. Minimizes total variational potential energy under bilateral contact barriers:

$$EI(z) \frac{d^4 x}{dz^4} = q_{\text{linear}}(z) \left(1 - \frac{\rho_{\text{mud}}}{\rho_{\text{steel}}}\right) \sin(I)$$

Solved analytically across pinned-pinned stabilizer boundary spans with contact constraints.

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Service uptime and database connection status. |
| `GET` | `/api/v1/wells/hierarchy` | Full oilfield structure: Field $\rightarrow$ Pad $\rightarrow$ Wellbore. |
| `GET` | `/api/v1/wells/{well_id}/stations` | Retrieve directional survey stations for a wellbore. |
| `POST` | `/api/v1/wells/{well_id}/stations` | Add a survey station, cascade trajectory recomputation, and persist to DuckDB. |
| `DELETE` | `/api/v1/wells/{well_id}/stations/{id}` | Delete a survey station and cascade trajectory resynchronization. |
| `POST` | `/api/v1/wells/{well_id}/run-msa` | Execute SciPy Differential Evolution MSA calibration on telemetry. |
| `POST` | `/api/v1/wells/{well_id}/run-sag` | Execute analytical BHA Sag deflection analysis with ISCWSA QC. |
| `POST` | `/api/v1/wells/calculate-geomag-reference` | Compute WMM2025/IGRF-14 field, dip, declination, and gravity from Lat/Lon. |
| `POST` | `/api/v1/surveys/calculate-trajectory` | On-the-fly 3D Minimum Curvature calculation from station angles. |

---

## 🚀 Quick Start

### Option A: Run with Docker Compose (Recommended)

Launch the entire stack (FastAPI Backend + React Frontend + Nginx) with a single command:

```bash
docker compose up --build
```

- **Frontend Workstation**: Open [http://localhost:3000](http://localhost:3000)
- **FastAPI Interactive Docs (Swagger)**: Open [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check**: Open [http://localhost:8000/health](http://localhost:8000/health)

---

### Option B: Local Monorepo Setup

#### 1. Backend & Engine Setup

The backend and engine use [`uv`](https://github.com/astral-sh/uv) for fast, reproducible dependency management.

```bash
cd backend

# Install arrowell_engine in editable development mode
uv pip install -e ../arrowell_engine

# Sync backend virtual environment
uv sync

# Run the FastAPI server
uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Running the Test Suite & Benchmarks

Run the complete 24-test verification suite:
```bash
# Execute all unit and integration tests
pytest -v
```

Execute the performance benchmark suite:
```bash
# Run statistical benchmarks with execution time breakdown
pytest tests/benchmarks/test_engine_benchmarks.py --benchmark-columns=min,mean,stddev,median,ops --benchmark-sort=mean
```

#### 3. Frontend Setup

```bash
cd frontend

# Install Node modules
npm install

# Start Vite development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📂 Project Structure

```text
.
├── arrowell_engine/             # Standalone Python directional drilling & MWD kernel
│   ├── geomag/                  # Spherical harmonics, WMM2025, IGRF-14, Schmidt normalization
│   ├── msa/                     # SciPy DE optimizer, toolface coverage conditioning, QC filters
│   ├── sag/                     # BHA beam bending solver with bilateral contact boundaries
│   ├── sensors/                 # Sensor error models, tri-axial transforms, vertical locks
│   ├── trajectory/              # MCM trajectory, Continuous Inc fusion, ISCWSA 3D EOU & Anti-Collision
│   ├── coords.py                # Geodetic WGS-84 to UTM coordinate projection & convergence
│   └── pyproject.toml           # Engine packaging and dependencies
│
├── backend/                     # FastAPI backend web service
│   ├── src/
│   │   ├── api/v1/              # REST route controllers (wells, surveys, geomag)
│   │   ├── core/                # App config, DuckDB engine, seed data runner
│   │   ├── crud/                # Database operations & cascade trajectory recomputation
│   │   ├── models/              # SQLAlchemy 2.0 models (Field, Pad, Well, Station)
│   │   ├── schemas/             # Pydantic v2 validation & telemetry serialization schemas
│   │   ├── services/            # Directional core bridge (MCM, MSA, SAG)
│   │   └── main.py              # Application entrypoint & lifespan management
│   ├── Dockerfile               # Multi-stage Python 3.11 container with uv
│   └── pyproject.toml           # Backend dependencies & tool configurations
│
├── frontend/                    # React 19 + TypeScript workstation UI
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/          # HeaderNav, SidebarTree, StatusBar
│   │   │   ├── modals/          # AddSurvey, Import, Export, GeomagneticSettings (3-tab)
│   │   │   └── workbench/       # Trajectory3D, Projections2D, SensorQC,
│   │   │                        # SurveyLogTable, AntiCollisionScan, TrajectoryWorkspace
│   │   ├── data/                # Sample oilfield datasets & offset wells
│   │   ├── store/               # Zustand global workstation store with persistence
│   │   ├── types/               # TypeScript definitions (surveys, sensors, anti-collision)
│   │   ├── utils/               # API client, Minimum Curvature math, file parsers, i18n
│   │   ├── App.tsx              # Main workstation layout orchestrator
│   │   ├── index.css            # Tailwind CSS v4 styling & engineering design tokens
│   │   └── main.tsx             # Application bootstrap & DOM mount
│   ├── Dockerfile               # Production multi-stage Nginx container
│   ├── package.json             # React 19, Three.js, Zustand, Tailwind v4
│   └── vite.config.ts           # Vite 8 bundler configuration
│
├── tests/                       # Automated Verification & Benchmarking Suite
│   ├── arrowell_engine/         # Core engine test suite
│   │   ├── unit/                # Pure mathematical tests (MCM, sensors, SAG, EOU, coords)
│   │   └── integration/         # Multi-module tests (WMM/IGRF .npz, Continuous Inc, MSA)
│   ├── backend/                 # API & Database test suite
│   │   ├── conftest.py          # Isolated in-memory DuckDB fixtures & TestClient
│   │   ├── unit/                # Service layer & schema validation tests
│   │   └── integration/         # REST API endpoints & cascade recalculation tests
│   └── benchmarks/              # Statistical pytest-benchmark execution suite
│
├── docker-compose.yml           # Production multi-container orchestration
├── LICENSE                      # MIT License
└── README.md                    # Workstation documentation & mathematical foundation
```

---

## 📄 License & Standards

This project is licensed under the terms of the **MIT License**. See the [LICENSE](LICENSE) file for details.

Directional trajectory mathematics, position uncertainty propagation, and anti-collision algorithms strictly adhere to published, open industry standards established by the **ISCWSA / SPE Wellbore Positioning Technical Section** and the **IAGA / NOAA National Centers for Environmental Information**.
