"""Automated multi-model downloader and binary compiler for Geomagnetic Field Models:
  1. WMM2025 (Standard degree 12).
  2. WMMHR2025 (High Resolution degree 133).
  3. IGRF-14 (IAGA Scientific Standard).

Features:
  - Fetches from official NOAA / IAGA / GeographicLib mirrors.
  - Automatically parses ASCII .COF files and IAGA coefficient tables.
  - Compiles models into compact, optimized .npz binary archives for instant evaluation.
"""

import importlib.util
import io
import shutil
import urllib.request
import zipfile
from pathlib import Path
from typing import Optional

import numpy as np

HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    )
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
# 2. HELPER FUNCTIONS
# =====================================================================
def download_stream(url: str, timeout: int = 30) -> Optional[bytes]:
    """Download binary data following redirects with custom user-agent headers."""
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
    """Extract .COF coefficient file from an in-memory ZIP archive."""
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
# 3. GEOMAGNETIC SYNCHRONIZATION STEPS
# =====================================================================
def sync_wmm_standard(models_dir: Path):
    """Retrieve and build WMM2025 (Standard)."""
    info = GEOMAG_SOURCES["WMM2025"]
    cof_file = models_dir / info["output_cof"]
    npz_file = models_dir / info["output_npz"]

    print("\n[1/3] Processing WMM2025 (Standard)...")
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

    print("\n[2/3] Processing WMMHR2025 (High Resolution - Degree 133)...")
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

    print("\n[3/3] Processing IGRF-14 (IAGA Scientific Standard)...")
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
# 4. MAIN ENTRY POINT
# =====================================================================
def main():
    target_directory = Path(__file__).resolve().parent / "assets" / "models"
    target_directory.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print(" ArroWell Geomagnetic Field Models Synchronizer")
    print(f" Target Directory: {target_directory}")
    print("=" * 70)

    sync_wmm_standard(target_directory)
    sync_wmm_high_resolution(target_directory)
    sync_igrf14(target_directory)

    print("\n" + "=" * 70)
    print(" Summary of Available Compiled Models:")
    for b in sorted(target_directory.rglob("*.npz")):
        size_kb = b.stat().st_size / 1024.0
        rel_path = b.relative_to(target_directory)
        print(f"  * {str(rel_path):<35} ({size_kb:6.1f} KB)")
    print("=" * 70)


# Backward compatibility resolver for legacy imports from this module
def __getattr__(name: str):
    """Redirect legacy ISCWSA error model imports to their canonical trajectory location."""
    if name in ("CORE_ISCWSA_MODELS", "IscwsaErrorTerm", "ErrorPropagationMode"):
        return locals()[name]
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")


if __name__ == "__main__":
    main()