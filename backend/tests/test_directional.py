"""Mathematical verification tests for Minimum Curvature Method and mwdstdcore calculations."""

from fastapi.testclient import TestClient


def test_calculate_trajectory_mwdcore(client: TestClient):
    """Test on-the-fly 3D trajectory computation using mwdstdcore Minimum Curvature Method."""
    payload = {
        "proposal_azimuth": 45.0,
        "stations": [
            {"md": 0.0, "inc": 0.0, "azim": 0.0},
            {"md": 100.0, "inc": 2.0, "azim": 45.0},
            {"md": 200.0, "inc": 10.0, "azim": 45.0},
            {"md": 300.0, "inc": 20.0, "azim": 45.0},
        ],
    }

    response = client.post("/api/v1/surveys/calculate-trajectory", json=payload)
    assert response.status_code == 200
    result = response.json()

    assert result["station_count"] == 4
    assert result["total_md"] == 300.0
    assert result["total_tvd"] > 0.0
    assert result["max_dls"] > 0.0

    stations = result["stations"]
    assert stations[-1]["northing"] > 0.0
    assert stations[-1]["easting"] > 0.0
    assert stations[-1]["tvd"] < 300.0