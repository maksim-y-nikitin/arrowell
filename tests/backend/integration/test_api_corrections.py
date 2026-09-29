from fastapi.testclient import TestClient


def test_run_msa_endpoint(client: TestClient):
    response = client.post("/api/v1/wells/well-102h/run-msa")
    assert response.status_code == 200
    data = response.json()
    if isinstance(data, list):
        assert len(data) > 0
        assert any(s.get("correction_type") == "MSA" or "MSA" in s.get("status", "") for s in data)
    else:
        assert data["status"] == "success"
        assert "axial_bias_bz" in data


def test_run_sag_endpoint(client: TestClient):
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
    if isinstance(data, list):
        assert len(data) > 0
        assert any(s.get("correction_type") == "SAG" or "SAG" in s.get("status", "") for s in data)
    else:
        assert data["status"] == "success"
        assert data["stations_corrected"] > 0


def test_calculate_trajectory_endpoint(client: TestClient):
    payload = {
        "proposal_azimuth": 45.0,
        "stations": [
            {"md": 0.0, "inc": 0.0, "azim": 0.0},
            {"md": 100.0, "inc": 2.0, "azim": 45.0},
            {"md": 200.0, "inc": 10.0, "azim": 45.0},
        ],
    }
    response = client.post("/api/v1/surveys/calculate-trajectory", json=payload)
    assert response.status_code == 200
    assert response.json()["station_count"] == 3