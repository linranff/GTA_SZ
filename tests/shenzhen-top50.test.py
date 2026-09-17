#!/usr/bin/env python3
"""Catalog integrity and Commons license allow-list. No network."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "landmarks"))
sys.path.insert(0, str(ROOT / "scripts"))
import fetch_reference_photos as fetch  # noqa: E402
import landmark_candidate as lc  # noqa: E402

CATALOG = ROOT / "data/landmarks/shenzhen-top50.json"
REQUIRED = ("id", "order", "name", "kind", "group", "coverage", "owner", "nextStage")
COVER = {"in_bbox", "edge", "outside"}


class Top50CatalogTests(unittest.TestCase):
    def setUp(self):
        self.catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
        self.places = self.catalog["places"]

    def test_exactly_fifty_unique_ids_and_orders(self):
        ids = [place["id"] for place in self.places]
        orders = [place["order"] for place in self.places]
        self.assertEqual(len(self.places), 50)
        self.assertEqual(len(set(ids)), 50)
        self.assertEqual(sorted(orders), list(range(1, 51)))

    def test_required_fields_and_coverage(self):
        source_ids = {item["id"] for item in self.catalog["sources"]}
        for place in self.places:
            for key in REQUIRED:
                self.assertTrue(place.get(key), msg=f"{place.get('id')} missing {key}")
            self.assertIn(place["coverage"], COVER)
            for source_id in place.get("sourceIds") or []:
                self.assertIn(source_id, source_ids, msg=f"{place['id']} unknown source {source_id}")
            center = (place.get("location") or {}).get("center")
            if center is not None:
                self.assertEqual(len(center), 2)
                self.assertTrue(all(isinstance(value, (int, float)) for value in center))

    def test_city_named_landmarks_are_present(self):
        named = {"tencent", "bamboo", "pingan", "civic", "kk100", "diwang", "baypark", "talent", "lianhua", "xiangmi"}
        found = {place["cityLandmarkId"] for place in self.places if place.get("cityLandmarkId")}
        self.assertTrue(named <= found)

    def test_campaign_skips_map_outside_places(self):
        policy = self.catalog["campaignPolicy"]
        self.assertEqual(policy["districts"], ["南山", "福田", "罗湖"])
        self.assertTrue(policy["requireInBbox"])
        skip = set(policy["skipPlaceIds"])
        outside = {place["id"] for place in self.places if place["coverage"] == "outside"}
        self.assertEqual(skip, outside)
        for place in self.places:
            if place["id"] in skip:
                self.assertEqual(place["nextStage"], "skip_outside_map")
        self.assertEqual(set(lc.CAMPAIGN_SKIP), skip)

    def test_license_allow_list(self):
        self.assertTrue(fetch.license_allowed("CC BY-SA 4.0"))
        self.assertTrue(fetch.license_allowed("CC BY 4.0"))
        self.assertTrue(fetch.license_allowed("CC0"))
        self.assertTrue(fetch.license_allowed("Public domain"))
        self.assertFalse(fetch.license_allowed("All rights reserved"))
        self.assertFalse(fetch.license_allowed(""))
        self.assertFalse(fetch.license_allowed("Fair use"))


if __name__ == "__main__":
    unittest.main()
