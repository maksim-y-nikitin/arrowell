from fastapi.testclient import TestClient


def test_cascade_trajectory_recalculation_on_insert(client: TestClient):
    initial_stations = client.get("/api/v1/wells/well-102h/stations").json()
    target_stn_before = next(s for s in initial_stations if s["md"] >= 1200.0)
    target_md = target_stn_before["md"]
    insert_md = target_md - 15.0

    intermediate_payload = {
        "md": insert_md,
        "inc": 25.0,
        "azim": 75.0,
        "sensor": {
            "gx": 0.20, "gy": 0.35, "gz": 0.91,
            "bx": 16400.0, "by": 900.0, "bz": 50500.0,
        },
    }
    create_res = client.post("/api/v1/wells/well-102h/stations", json=intermediate_payload)
    assert create_res.status_code == 201
    inserted_id = create_res.json()["id"]

    stations_after = client.get("/api/v1/wells/well-102h/stations").json()
    target_stn_after = next(s for s in stations_after if s["md"] == target_md)
    assert target_stn_after["tvd"] != target_stn_before["tvd"]

    del_res = client.delete(f"/api/v1/wells/well-102h/stations/{inserted_id}")
    assert del_res.status_code == 200

    stations_reverted = client.get("/api/v1/wells/well-102h/stations").json()
    target_stn_reverted = next(s for s in stations_reverted if s["md"] == target_md)
    assert target_stn_reverted["tvd"] == target_stn_before["tvd"]