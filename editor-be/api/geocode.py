from __future__ import annotations

import requests
from flask import Blueprint, request

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

bp = Blueprint("geocode", __name__)


@bp.get("/api/geocode")
def geocode_location() -> tuple[dict[str, object], int]:
    query = request.args.get("q", "").strip()
    if not query:
        return {"error": "A search query is required."}, 400

    try:
        response = requests.get(
            NOMINATIM_URL,
            params={"q": query, "format": "jsonv2", "limit": 5},
            headers={"User-Agent": "RasmViewFloorplan/0.1"},
            timeout=15,
        )
        response.raise_for_status()
        results = response.json()
    except requests.RequestException:
        return {"error": "Location search is temporarily unavailable."}, 503

    if not results:
        return {"error": "No location found for that search."}, 404

    return {
        "results": [
            {
                "display_name": r.get("display_name"),
                "lat": float(r["lat"]),
                "lng": float(r["lon"]),
            }
            for r in results
        ]
    }, 200
