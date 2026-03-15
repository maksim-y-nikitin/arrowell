"""API integration tests for health check, hierarchy endpoints, and cascade calculations."""

from fastapi.testclient import TestClient


def test_health_endpoint(client: TestClient):
    """Verify that health check endpoint returns 200 OK and expected status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "service" in data


def test_get_wells_hierarchy(client: TestClient):
    """Verify that hierarchy endpoint returns seeded fields, pads, and wells."""
    response = client.get("/api/v1/wells/hierarchy")
    assert response.status_code == 200
    fields = response.json()
    assert len(fields) >= 1
    samotlor = next((f for f in fields if f["id"] == "field-samotlor"), None)
    assert samotlor is not None
    assert samotlor["name"] == "Samotlor Oil Field"
    assert len(samotlor["pads"]) >= 1
    pad_10 = samotlor["pads"][0]
    assert pad_10["id"] == "pad-10"
    assert len(pad_10["wells"]) >= 1
    well_102 = pad_10["wells"][0]
    assert well_102["id"] == "well-102h"


def test_get_well_stations(client: TestClient):
    """Verify that stations endpoint returns valid survey stations for well-102h."""
    response = client.get("/api/v1/wells/well-102h/stations")
    assert response.status_code == 200
    stations = response.json()

    assert len(stations) == 26
    assert stations[0]["md"] == 0.0
    assert stations[-1]["md"] == 3420.0
    assert "sensor" in stations[0]
    assert "gx" in stations[0]["sensor"]


def test_run_msa_endpoint(client: TestClient):
    """Verify execution of Multi-Station Analysis (MSA) optimization via mwdstdcore."""
    response = client.post("/api/v1/wells/well-102h/run-msa")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "axial_bias_bz" in data
    assert data["stations_analyzed"] >= 4
    assert isinstance(data["axial_bias_bz"], (int, float))


def test_create_and_delete_station(client: TestClient):
    """Verify survey station insertion with cascade recalculation and subsequent deletion."""
    payload = {
        "md": 3500.0,
        "inc": 90.2,
        "azim": 56.4,
        "sensor": {
            "gx": 0.513,
            "gy": 0.865,
            "gz": 0.0,
            "bx": 17690.0,
            "by": 4380.0,
            "bz": 52400.0,
        },
    }
    create_res = client.post("/api/v1/wells/well-102h/stations", json=payload)
    assert create_res.status_code == 201
    created_station = create_res.json()
    assert created_station["md"] == 3500.0
    assert created_station["tvd"] > 0.0
    assert created_station["northing"] > 0.0
    assert "sensor" in created_station
    assert created_station["sensor"]["bx"] == 17690.0
    station_id = created_station["id"]

    list_res = client.get("/api/v1/wells/well-102h/stations")
    assert list_res.status_code == 200
    stations = list_res.json()
    assert len(stations) == 27
    assert any(s["id"] == station_id for s in stations)

    del_res = client.delete(f"/api/v1/wells/well-102h/stations/{station_id}")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "success"

    list_after_res = client.get("/api/v1/wells/well-102h/stations")
    stations_after = list_after_res.json()
    assert len(stations_after) == 26
    assert not any(s["id"] == station_id for s in stations_after)


def test_delete_nonexistent_station(client: TestClient):
    """Verify 404 response on attempting to delete non-existent survey station."""
    del_res = client.delete("/api/v1/wells/well-102h/stations/999999")
    assert del_res.status_code == 404


def test_run_sag_endpoint(client: TestClient):
    """Verify analytical BHA SAG correction calculation via mwdstdcore on well survey stations."""
    payload = {
        "collar_od_mm": 171.5,
        "collar_id_mm": 71.4,
        "sensor_to_bit_m": 14.2,
        "stabilizer_dist_m": 21.5,
        "mud_weight_gcm3": 1.20,
        "bha_material": "nm_steel",
    }
    response = client.post("/api/v1/wells/well-102h/run-sag", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["well_id"] == "well-102h"
    assert data["stations_corrected"] == 26
    assert data["peak_sag_deg"] > 0.0
    vertical_stn = data["corrections"][0]
    assert vertical_stn["sag_correction_deg"] == 0.0
    horizontal_stn = data["corrections"][-1]
    assert abs(horizontal_stn["sag_correction_deg"]) > 0.05
    assert horizontal_stn["valid"] is True
    assert horizontal_stn["corrected_inc"] == round(horizontal_stn["raw_inc"] - horizontal_stn["sag_correction_deg"], 2)


def test_cascade_trajectory_recalculation_on_insert(client: TestClient):
    """
    Verify that inserting an intermediate station cascades recalculation
    to all downstream stations, preserving spatial Minimum Curvature continuity.
    """
    # 1. Fetch initial station coordinates at 1280m
    initial_stations = client.get("/api/v1/wells/well-102h/stations").json()
    stn_1280_before = next(s for s in initial_stations if s["md"] == 1280.0)

    # 2. Insert intermediate station at 1200m with inclination deviation
    intermediate_payload = {
        "md": 1200.0,
        "inc": 25.0,
        "azim": 75.0,
        "sensor": {
            "gx": 0.20,
            "gy": 0.35,
            "gz": 0.91,
            "bx": 16400.0,
            "by": 900.0,
            "bz": 50500.0,
        },
    }
    create_res = client.post("/api/v1/wells/well-102h/stations", json=intermediate_payload)
    assert create_res.status_code == 201
    inserted_id = create_res.json()["id"]

    # 3. Verify downstream station coordinates shifted due to cascade recalculation
    stations_after = client.get("/api/v1/wells/well-102h/stations").json()
    stn_1280_after = next(s for s in stations_after if s["md"] == 1280.0)
    assert stn_1280_after["tvd"] != stn_1280_before["tvd"]
    assert stn_1280_after["northing"] != stn_1280_before["northing"]

    # 4. Cleanup: delete intermediate station and verify downstream coordinates revert back
    del_res = client.delete(f"/api/v1/wells/well-102h/stations/{inserted_id}")
    assert del_res.status_code == 200

    stations_reverted = client.get("/api/v1/wells/well-102h/stations").json()
    stn_1280_reverted = next(s for s in stations_reverted if s["md"] == 1280.0)
    assert stn_1280_reverted["tvd"] == stn_1280_before["tvd"]
    assert stn_1280_reverted["northing"] == stn_1280_before["northing"]