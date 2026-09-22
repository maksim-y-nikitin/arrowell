"""Integration tests for well hierarchy and survey stations REST API."""

from fastapi.testclient import TestClient


def test_health_endpoint(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_get_wells_hierarchy(client: TestClient):
    response = client.get("/api/v1/wells/hierarchy")
    assert response.status_code == 200
    fields = response.json()
    assert len(fields) >= 1
    assert fields[0]["id"] == "field-samotlor"


def test_get_well_stations(client: TestClient):
    response = client.get("/api/v1/wells/well-102h/stations")
    assert response.status_code == 200
    stations = response.json()
    assert len(stations) == 26
    assert stations[0]["md"] == 0.0


def test_delete_nonexistent_station(client: TestClient):
    del_res = client.delete("/api/v1/wells/well-102h/stations/999999")
    assert del_res.status_code == 404