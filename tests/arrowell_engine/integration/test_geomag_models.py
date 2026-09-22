"""Integration tests for pre-compiled WMM2025 and IGRF-14 spherical harmonic models."""

import math
from datetime import date
from pathlib import Path

import numpy as np
import pytest

from arrowell_engine.geomag.calculator import GeomagneticModelEngine


@pytest.fixture(scope="module")
def models_dir():
    # Resolve package assets path
    base_dir = Path(__file__).resolve().parents[3] / "arrowell_engine" / "geomag" / "assets" / "models"
    if not base_dir.exists():
        base_dir = Path("arrowell_engine/geomag/assets/models")
    return base_dir


def test_wmm_and_igrf_binaries_consistency(models_dir):
    """Verify loading from .npz and convergence between WMM2025 and IGRF-14."""
    wmm_path = models_dir / "wmm2025.npz"
    igrf_path = models_dir / "igrf14.npz"

    if not wmm_path.exists() or not igrf_path.exists():
        pytest.skip("Compiled .npz models are not downloaded on this machine")

    wmm = GeomagneticModelEngine(wmm_path)
    igrf = GeomagneticModelEngine(igrf_path)

    test_date = date(2025, 6, 1)
    wmm_res = wmm.calculate(61.25, 73.40, 100.0, test_date)
    igrf_res = igrf.calculate(61.25, 73.40, 100.0, test_date)

    assert 56000.0 <= wmm_res.total_field_nt <= 60000.0
    assert 75.0 <= wmm_res.dip_deg <= 82.0
    assert abs(wmm_res.total_field_nt - igrf_res.total_field_nt) < 150.0


def test_geomagnetic_batch_vs_scalar(models_dir):
    """Verify that vectorized batch calculation strictly reproduces scalar calculations."""
    wmm_path = models_dir / "wmm2025.npz"
    if not wmm_path.exists():
        pytest.skip("wmm2025.npz model binary missing")

    engine = GeomagneticModelEngine(wmm_path)
    test_date = date(2025, 6, 1)

    scalar_res = engine.calculate(61.25, 73.40, 100.0, test_date)

    batch_lats = np.array([60.0, 61.25, 62.5])
    batch_lons = np.array([70.0, 73.40, 76.0])
    batch_alts = np.array([0.0, 100.0, 200.0])

    batch_res = engine.calculate_batch(batch_lats, batch_lons, batch_alts, test_date)

    assert len(batch_res.total_field_nt) == 3
    assert math.isclose(batch_res.total_field_nt[1], scalar_res.total_field_nt, abs_tol=1e-5)
    assert math.isclose(batch_res.declination_deg[1], scalar_res.declination_deg, abs_tol=1e-5)