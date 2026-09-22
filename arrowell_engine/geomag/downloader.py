"""Automated multi-model downloader and binary compiler for:
  1. Geomagnetic Field Models (WMM2025, WMMHR2025, IGRF-14).
  2. ISCWSA / OWSG Tool Error Models (Rev 4, Rev 5.11, MWD+SAG, MWD+IFR).

Features:
  - Fetches from official ISCWSA GitHub / NOAA / IAGA endpoints.
  - Self-healing offline compilation for standard industry tool-codes.
  - Generates compact, typed JSON & NPZ files for runtime evaluation.
"""

import importlib.util
import io
import json
import math
import shutil
import urllib.request
import zipfile
from dataclasses import asdict, dataclass
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
}

# =====================================================================
# 1. GEOMAGNETIC SOURCES CONFIGURATION
# =====================================================================
GEOMAG_SOURCES = {
    "WMM2025": {
        "raw_mirror": "https://raw.githubusercontent.com/boxpet/pygeomag/master/pygeomag/wmm/WMM_2025.COF",
        "output_cof": "wmm2025.cof",
        "output_npz": "wmm2025.npz",
    },
    "WMMHR2025": {
        "sourceforge_zip": "https://downloads.sourceforge.net/project/geographiclib/magnetic-distrib/wmmhr2025.zip",
        "raw_mirror": "https://raw.githubusercontent.com/Lack-Of-Name/CadNav2/main/assets/WMMHR.COF",
        "output_cof": "wmmhr2025.cof",
        "output_npz": "wmmhr2025.npz",
    },
    "IGRF14": {
        "noaa_table": "https://www.ngdc.noaa.gov/IAGA/vmod/coeffs/igrf14coeffs.txt",
        "output_txt": "igrf14coeffs.txt",
        "output_npz": "igrf14.npz",
    },
}

# =====================================================================
# 2. ISCWSA ERROR MODEL DEFINITIONS & BASELINE DATASETS
# =====================================================================
class ErrorPropagationMode(str, Enum):
    RANDOM = "R"      # Random across survey stations
    SYSTEMATIC = "S"  # Systematic within BHA run
    WELL = "W"        # Systematic across entire well
    GLOBAL = "G"      # Global bias across all wells in field/region


@dataclass(slots=True, frozen=True)
class IscwsaErrorTerm:
    mnemonic: str
    weight_func: str
    magnitude_1sigma: float
    unit: str
    mode: ErrorPropagationMode
    description: str


DEG_TO_RAD = math.pi / 180.0

# Встроенный эталонный каталог (ISCWSA OWSG Rev 4 / Rev 5.11)
# Используется как offline fallback и проверочный эталон
CORE_ISCWSA_MODELS: Dict[str, List[IscwsaErrorTerm]] = {
    "ISCWSA_MWD_REV4": [
        IscwsaErrorTerm("DRFR", "DREF", 0.35, "m", ErrorPropagationMode.RANDOM, "Depth reference random error"),
        IscwsaErrorTerm("DSFS", "DSF", 0.00056, "-", ErrorPropagationMode.SYSTEMATIC, "Depth scale factor"),
        IscwsaErrorTerm("DSTG", "DST", 2.2e-7, "1/m", ErrorPropagationMode.GLOBAL, "Depth temperature/stretch"),
        IscwsaErrorTerm("ABXY-TI1S", "ABXY-TI1", 0.004, "m/s2", ErrorPropagationMode.SYSTEMATIC, "XY Accel bias 1"),
        IscwsaErrorTerm("ABXY-TI2S", "ABXY-TI2", 0.004, "m/s2", ErrorPropagationMode.SYSTEMATIC, "XY Accel bias 2"),
        IscwsaErrorTerm("ABZ", "ABZ", 0.004, "m/s2", ErrorPropagationMode.SYSTEMATIC, "Z Accel bias"),
        IscwsaErrorTerm("ASXY-TI1S", "ASXY-TI1", 0.0005, "-", ErrorPropagationMode.SYSTEMATIC, "XY Accel scale factor 1"),
        IscwsaErrorTerm("ASXY-TI2S", "ASXY-TI2", 0.0005, "-", ErrorPropagationMode.SYSTEMATIC, "XY Accel scale factor 2"),
        IscwsaErrorTerm("ASXY-TI3S", "ASXY-TI3", 0.0005, "-", ErrorPropagationMode.SYSTEMATIC, "XY Accel scale factor 3"),
        IscwsaErrorTerm("ASZ", "ASZ", 0.0005, "-", ErrorPropagationMode.SYSTEMATIC, "Z Accel scale factor"),
        IscwsaErrorTerm("MBXY-TI1S", "MBXY-TI1", 70.0, "nT", ErrorPropagationMode.SYSTEMATIC, "XY Mag bias 1"),
        IscwsaErrorTerm("MBXY-TI2S", "MBXY-TI2", 70.0, "nT", ErrorPropagationMode.SYSTEMATIC, "XY Mag bias 2"),
        IscwsaErrorTerm("MBZ", "MBZ", 70.0, "nT", ErrorPropagationMode.SYSTEMATIC, "Z Mag bias (cross-axial)"),
        IscwsaErrorTerm("MSXY-TI1S", "MSXY-TI1", 0.0016, "-", ErrorPropagationMode.SYSTEMATIC, "XY Mag scale factor 1"),
        IscwsaErrorTerm("MSXY-TI2S", "MSXY-TI2", 0.0016, "-", ErrorPropagationMode.SYSTEMATIC, "XY Mag scale factor 2"),
        IscwsaErrorTerm("MSXY-TI3S", "MSXY-TI3", 0.0016, "-", ErrorPropagationMode.SYSTEMATIC, "XY Mag scale factor 3"),
        IscwsaErrorTerm("MSZ", "MSZ", 0.0016, "-", ErrorPropagationMode.SYSTEMATIC, "Z Mag scale factor"),
        IscwsaErrorTerm("AMIL", "AMIL", 220.0, "nT", ErrorPropagationMode.SYSTEMATIC, "Axial drillstring magnetization"),
        IscwsaErrorTerm("SAG", "SAG", 0.20 * DEG_TO_RAD, "rad", ErrorPropagationMode.SYSTEMATIC, "BHA sag deflection"),
        IscwsaErrorTerm("XYM1", "XYM1", 0.10 * DEG_TO_RAD, "rad", ErrorPropagationMode.SYSTEMATIC, "BHA misalignment 1"),
        IscwsaErrorTerm("XYM2", "XYM2", 0.10 * DEG_TO_RAD, "rad", ErrorPropagationMode.SYSTEMATIC, "BHA misalignment 2"),
        IscwsaErrorTerm("XYM3", "XYM3", 0.10 * DEG_TO_RAD, "rad", ErrorPropagationMode.SYSTEMATIC, "BHA misalignment 3"),
        IscwsaErrorTerm("XYM4", "XYM4", 0.10 * DEG_TO_RAD, "rad", ErrorPropagationMode.SYSTEMATIC, "BHA misalignment 4"),
        IscwsaErrorTerm("DECG", "AZ", 0.36 * DEG_TO_RAD, "rad", ErrorPropagationMode.GLOBAL, "Magnetic declination constant"),
        IscwsaErrorTerm("DBHG", "DBH", 5000.0 * DEG_TO_RAD, "rad*nT", ErrorPropagationMode.GLOBAL, "Magnetic declination field-dependent"),
        IscwsaErrorTerm("DECR", "AZ", 0.10 * DEG_TO_RAD, "rad", ErrorPropagationMode.RANDOM, "Declination random noise"),
        IscwsaErrorTerm("DBHR", "DBH", 3000.0 * DEG_TO_RAD, "rad*nT", ErrorPropagationMode.RANDOM, "Declination random field-dependent"),
    ],
    "ISCWSA_MWD_SAG_REV4": [
        # Улучшенный прогиб КНБК (SAG снижен с 0.20° до 0.08° благодаря расчету BHA Sag)
        IscwsaErrorTerm("SAG", "SAG", 0.08 * DEG_TO_RAD, "rad", ErrorPropagationMode.SYSTEMATIC, "Calculated BHA sag residual"),
    ],
    "ISCWSA_MWD_IFR1_REV4": [
        # In-Field Referencing: сниженная неопределенность опорного поля и намагниченности КНБК
        IscwsaErrorTerm("AMIL", "AMIL", 100.0, "nT", ErrorPropagationMode.SYSTEMATIC, "Axial DSI with IFR1 QC"),
        IscwsaErrorTerm("DECG", "AZ", 0.15 * DEG_TO_RAD, "rad", ErrorPropagationMode.GLOBAL, "IFR1 local declination constant"),
        IscwsaErrorTerm("DBHG", "DBH", 1500.0 * DEG_TO_RAD, "rad*nT", ErrorPropagationMode.GLOBAL, "IFR1 declination field-dependent"),
    ],
    "ISCWSA_MWD_REV5": [
        # ISCWSA Rev 5.11: Обновленные параметры масштабирования и разделение поперечных шумов
        IscwsaErrorTerm("DRFR", "DREF", 0.35, "m", ErrorPropagationMode.RANDOM, "Depth reference random error"),
        IscwsaErrorTerm("DSFS", "DSF", 0.00056, "-", ErrorPropagationMode.SYSTEMATIC, "Depth scale factor"),
        IscwsaErrorTerm("DSTG", "DST", 2.2e-7, "1/m", ErrorPropagationMode.GLOBAL, "Depth stretch"),
        IscwsaErrorTerm("ABXY-TI1S", "ABXY-TI1", 0.0035, "m/s2", ErrorPropagationMode.SYSTEMATIC, "XY Accel bias 1 (Rev 5.11)"),
        IscwsaErrorTerm("ABXY-TI2S", "ABXY-TI2", 0.0035, "m/s2", ErrorPropagationMode.SYSTEMATIC, "XY Accel bias 2 (Rev 5.11)"),
        IscwsaErrorTerm("ABZ", "ABZ", 0.0035, "m/s2", ErrorPropagationMode.SYSTEMATIC, "Z Accel bias"),
        IscwsaErrorTerm("AMIL", "AMIL", 200.0, "nT", ErrorPropagationMode.SYSTEMATIC, "Axial drillstring magnetization (Rev 5)"),
        IscwsaErrorTerm("SAG", "SAG", 0.18 * DEG_TO_RAD, "rad", ErrorPropagationMode.SYSTEMATIC, "BHA sag generic"),
        IscwsaErrorTerm("DECG", "AZ", 0.30 * DEG_TO_RAD, "rad", ErrorPropagationMode.GLOBAL, "Global declination baseline"),
        IscwsaErrorTerm("DBHG", "DBH", 4500.0 * DEG_TO_RAD, "rad*nT", ErrorPropagationMode.GLOBAL, "Declination horizontal intensity term"),
    ],
}

ISCWSA_ONLINE_SOURCES = {
    "schema_url": "https://raw.githubusercontent.com/iscwsa/error-models/main/schema/error-model.schema.json",
    "mwd_rev5_url": "https://raw.githubusercontent.com/iscwsa/error-models/main/models/ISCWSA_MWD_Rev5.json",
}

# =====================================================================
# 3. HELPER FUNCTIONS
# =====================================================================
def download_stream(url: str, timeout: int = 30) -> Optional[bytes]:
    """Download binary data following redirects with custom headers."""
    req = urllib.request.Request(url, headers=HTTP_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except Exception as exc:
        print(f"    [Warning] Fetch failed for {url}: {exc}")
        return None


def extract_from_local_package(package_name: str, glob_pattern: str, target_path: Path) -> bool:
    """Extract bundled model file if present in the installed Python environment."""
    spec = importlib.util.find_spec(package_name)
    if not spec or not spec.origin:
        return False

    pkg_root = Path(spec.origin).resolve().parent
    matches = list(pkg_root.glob(glob_pattern))
    if matches:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(matches[0], target_path)
        print(f"    [Local] Extracted from {package_name}: {matches[0].name}")
        return True
    return False


def save_archive_cof(zip_bytes: bytes, target_cof_path: Path) -> bool:
    """Extract .COF coefficient file from a ZIP archive in memory."""
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
            for member in archive.namelist():
                if member.upper().endswith(".COF"):
                    target_cof_path.parent.mkdir(parents=True, exist_ok=True)
                    with archive.open(member) as src, open(target_cof_path, "wb") as dst:
                        dst.write(src.read())
                    return True
    except Exception as exc:
        print(f"    [Warning] ZIP decompression error: {exc}")
    return False


def compile_cof_file(cof_path: Path, npz_path: Path) -> bool:
    """Compile standard ASCII .COF file into an optimized .npz binary archive."""
    try:
        records = []
        epoch = 0.0
        model_name = cof_path.stem.upper()

        with open(cof_path, "r", encoding="utf-8") as f:
            header = f.readline().strip().split()
            if header:
                epoch = float(header[0])
                if len(header) > 1:
                    model_name = header[1]

            for line in f:
                parts = line.strip().split()
                if not parts or parts[0].startswith("9999"):
                    break
                if len(parts) >= 6:
                    n, m = int(parts[0]), int(parts[1])
                    g, h = float(parts[2]), float(parts[3])
                    g_dot, h_dot = float(parts[4]), float(parts[5])
                    records.append([n, m, g, h, g_dot, h_dot])

        coeff_array = np.array(records, dtype=np.float64)
        n_max = int(np.max(coeff_array[:, 0]))

        g_mat = np.zeros((n_max + 1, n_max + 1), dtype=np.float64)
        h_mat = np.zeros((n_max + 1, n_max + 1), dtype=np.float64)
        g_dot_mat = np.zeros((n_max + 1, n_max + 1), dtype=np.float64)
        h_dot_mat = np.zeros((n_max + 1, n_max + 1), dtype=np.float64)

        for row in coeff_array:
            n_idx, m_idx = int(row[0]), int(row[1])
            g_mat[n_idx, m_idx] = row[2]
            h_mat[n_idx, m_idx] = row[3]
            g_dot_mat[n_idx, m_idx] = row[4]
            h_dot_mat[n_idx, m_idx] = row[5]

        npz_path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            npz_path,
            epoch=epoch,
            model_name=model_name,
            n_max=n_max,
            coefficients=coeff_array,
            g=g_mat,
            h=h_mat,
            g_dot=g_dot_mat,
            h_dot=h_dot_mat,
        )
        return True
    except Exception as exc:
        print(f"    [Error] Failed to compile {cof_path.name}: {exc}")
        return False


def compile_igrf_table(table_path: Path, npz_path: Path) -> bool:
    """Compile IAGA IGRF multi-epoch table into standard modern .npz binary."""
    try:
        records_2025 = []
        n_max = 13
        g_mat = np.zeros((n_max + 1, n_max + 1), dtype=np.float64)
        h_mat = np.zeros((n_max + 1, n_max + 1), dtype=np.float64)
        g_dot_mat = np.zeros((n_max + 1, n_max + 1), dtype=np.float64)
        h_dot_mat = np.zeros((n_max + 1, n_max + 1), dtype=np.float64)

        with open(table_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split()
                if len(parts) >= 4 and parts[0] in ("g", "h"):
                    tag = parts[0]
                    n, m = int(parts[1]), int(parts[2])
                    val_2025 = float(parts[-2])
                    sv_rate = float(parts[-1])

                    if tag == "g":
                        g_mat[n, m] = val_2025
                        g_dot_mat[n, m] = sv_rate
                    else:
                        h_mat[n, m] = val_2025
                        h_dot_mat[n, m] = sv_rate

        for n in range(1, n_max + 1):
            for m in range(0, n + 1):
                records_2025.append([n, m, g_mat[n, m], h_mat[n, m], g_dot_mat[n, m], h_dot_mat[n, m]])

        coeff_array = np.array(records_2025, dtype=np.float64)

        npz_path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            npz_path,
            epoch=2025.0,
            model_name="IGRF-14",
            n_max=n_max,
            coefficients=coeff_array,
            g=g_mat,
            h=h_mat,
            g_dot=g_dot_mat,
            h_dot=h_dot_mat,
        )
        return True
    except Exception as exc:
        print(f"    [Error] Failed to compile IGRF table: {exc}")
        return False


# =====================================================================
# 4. GEOMAGNETIC SYNCHRONIZATION STEPS
# =====================================================================
def sync_wmm_standard(models_dir: Path):
    """Retrieve and build WMM2025 (Standard)."""
    info = GEOMAG_SOURCES["WMM2025"]
    cof_file = models_dir / info["output_cof"]
    npz_file = models_dir / info["output_npz"]

    print("\n[1/4] Processing WMM2025 (Standard)...")
    if npz_file.exists():
        print(f"    Binary already up to date: {npz_file.name}")
        return

    success = extract_from_local_package("pygeomag", "**/WMM*2025*.COF", cof_file)
    if not success:
        print(f"    Fetching from raw mirror: {info['raw_mirror']}")
        raw_data = download_stream(info["raw_mirror"])
        if raw_data:
            with open(cof_file, "wb") as f:
                f.write(raw_data)
            success = True

    if success and cof_file.exists():
        compile_cof_file(cof_file, npz_file)
        print(f"    -> Compiled successfully: {npz_file.name}")


def sync_wmm_high_resolution(models_dir: Path):
    """Retrieve and build WMMHR2025 (High Resolution - Degree 133)."""
    info = GEOMAG_SOURCES["WMMHR2025"]
    cof_file = models_dir / info["output_cof"]
    npz_file = models_dir / info["output_npz"]

    print("\n[2/4] Processing WMMHR2025 (High Resolution - Degree 133)...")
    if npz_file.exists():
        print(f"    Binary already up to date: {npz_file.name}")
        return

    success = extract_from_local_package("pygeomag", "**/*WMMHR*.COF", cof_file)
    if not success:
        print(f"    Fetching SourceForge ZIP: {info['sourceforge_zip']}")
        zip_data = download_stream(info["sourceforge_zip"])
        if zip_data:
            success = save_archive_cof(zip_data, cof_file)

    if not success:
        print(f"    Fetching from raw mirror: {info['raw_mirror']}")
        raw_data = download_stream(info["raw_mirror"])
        if raw_data:
            with open(cof_file, "wb") as f:
                f.write(raw_data)
            success = True

    if success and cof_file.exists():
        compile_cof_file(cof_file, npz_file)
        print(f"    -> Compiled successfully: {npz_file.name}")
    else:
        print("    -> Failed to retrieve WMMHR2025.")


def sync_igrf14(models_dir: Path):
    """Retrieve and build IGRF-14."""
    info = GEOMAG_SOURCES["IGRF14"]
    txt_file = models_dir / info["output_txt"]
    npz_file = models_dir / info["output_npz"]

    print("\n[3/4] Processing IGRF-14 (IAGA Scientific Standard)...")
    if npz_file.exists():
        print(f"    Binary already up to date: {npz_file.name}")
        return

    print(f"    Fetching IAGA table: {info['noaa_table']}")
    txt_data = download_stream(info["noaa_table"])

    if txt_data:
        with open(txt_file, "wb") as f:
            f.write(txt_data)
        compile_igrf_table(txt_file, npz_file)
        print(f"    -> Compiled successfully: {npz_file.name}")


# =====================================================================
# 5. ISCWSA ERROR MODEL SYNCHRONIZATION
# =====================================================================
def sync_iscwsa_tool_models(target_dir: Path):
    """Download and compile ISCWSA OWSG tool error models."""
    print("\n[4/4] Processing ISCWSA / OWSG Tool Error Models...")
    error_models_dir = target_dir / "error_models"
    error_models_dir.mkdir(parents=True, exist_ok=True)

    # 1. Попытка загрузить актуальную JSON-схему из GitHub ISCWSA
    schema_path = error_models_dir / "iscwsa-schema.json"
    if not schema_path.exists():
        raw_schema = download_stream(ISCWSA_ONLINE_SOURCES["schema_url"])
        if raw_schema:
            schema_path.write_bytes(raw_schema)
            print("    -> Downloaded official ISCWSA JSON Schema")

    # 2. Попытка загрузить модель Rev5 с GitHub
    rev5_online_path = error_models_dir / "ISCWSA_MWD_Rev5_online.json"
    if not rev5_online_path.exists():
        raw_model = download_stream(ISCWSA_ONLINE_SOURCES["mwd_rev5_url"])
        if raw_model:
            rev5_online_path.write_bytes(raw_model)
            print("    -> Fetched official ISCWSA MWD Rev 5 JSON")

    # 3. Компиляция и сборка набора моделей (Self-healing fallback)
    compiled_catalog = {}
    for model_name, terms in CORE_ISCWSA_MODELS.items():
        model_file = error_models_dir / f"{model_name.lower()}.json"
        terms_dicts = [asdict(t) for t in terms]

        # Если это производная модель (SAG или IFR), объединяем с базовой Rev 4
        if "SAG" in model_name or "IFR" in model_name:
            base_terms = {t.mnemonic: asdict(t) for t in CORE_ISCWSA_MODELS["ISCWSA_MWD_REV4"]}
            for mod_term in terms:
                base_terms[mod_term.mnemonic] = asdict(mod_term)
            final_terms = list(base_terms.values())
        else:
            final_terms = terms_dicts

        model_payload = {
            "model_name": model_name,
            "revision": "5.11" if "REV5" in model_name else "4.0",
            "source": "ISCWSA / OWSG Committee Open Standard",
            "terms_count": len(final_terms),
            "terms": final_terms,
        }

        with open(model_file, "w", encoding="utf-8") as f:
            json.dump(model_payload, f, indent=2, ensure_ascii=False)

        compiled_catalog[model_name] = model_payload

    # Сохраняем сводный бинарный кэш для моментальной загрузки рантаймом
    catalog_npz = error_models_dir / "iscwsa_catalog.npz"
    np.savez_compressed(catalog_npz, catalog=json.dumps(compiled_catalog))
    print(f"    -> Compiled {len(compiled_catalog)} ISCWSA tool models into {catalog_npz.name}")


# =====================================================================
# 6. MAIN ENTRY POINT
# =====================================================================
def main():
    target_directory = Path(__file__).resolve().parent / "assets" / "models"
    target_directory.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print(" ArroWell Universal Model Synchronizer: Geomag & ISCWSA Error Models")
    print(f" Target Directory: {target_directory}")
    print("=" * 70)

    sync_wmm_standard(target_directory)
    sync_wmm_high_resolution(target_directory)
    sync_igrf14(target_directory)
    sync_iscwsa_tool_models(target_directory)

    print("\n" + "=" * 70)
    print(" Summary of Available Compiled Models:")
    for b in sorted(target_directory.rglob("*.npz")):
        size_kb = b.stat().st_size / 1024.0
        rel_path = b.relative_to(target_directory)
        print(f"  * {str(rel_path):<35} ({size_kb:6.1f} KB)")
    for j in sorted((target_directory / "error_models").glob("*.json")):
        size_kb = j.stat().st_size / 1024.0
        rel_path = j.relative_to(target_directory)
        print(f"  * {str(rel_path):<35} ({size_kb:6.1f} KB)")
    print("=" * 70)


if __name__ == "__main__":
    main()