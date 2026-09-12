#!/usr/bin/env python3
"""Boundary and failure tests for the isolated landmark candidate runner.

Does not import city_mesh. The live Tencent export is a separate command; this
file checks that bad inputs cannot write public/source paths or emit a success
report after a subprocess failure.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
HOST = SCRIPTS / "landmark_candidate.py"
PYTHON = ROOT / ".venv/bin/python"
PILOT = ROOT / "artifacts/landmark-candidates/tencent-runner-pilot"
UNIT = PILOT / "_unittest"

sys.path.insert(0, str(SCRIPTS))
import landmark_candidate as lc  # noqa: E402


class TopOrthoFrameTests(unittest.TestCase):
    def test_horizontal_fit_covers_deeper_plan_after_aspect(self):
        size_x, size_y = 80.890625, 80.7413330078125
        aspect = 1280 / 960
        padding = 1.32
        scale = lc.top_ortho_scale(size_x, size_y)
        horizontal, vertical = lc.top_ortho_extents(scale)
        self.assertAlmostEqual(scale, max(size_x, size_y * aspect) * padding)
        self.assertGreaterEqual(horizontal + 1e-9, size_x * padding)
        self.assertGreaterEqual(vertical + 1e-9, size_y * padding)
        old = max(size_x, size_y) * padding
        self.assertGreater(scale, old)
        self.assertLess(old / aspect, size_y)


class HostImportTests(unittest.TestCase):
    def test_host_does_not_import_city_mesh_or_bpy(self):
        self.assertNotIn("city_mesh", sys.modules)
        self.assertNotIn("bpy", sys.modules)
        self.assertTrue(hasattr(lc, "validate_request"))


class PathBoundaryTests(unittest.TestCase):
    def test_missing_output_rejected(self):
        with self.assertRaises(lc.CandidateError):
            lc.resolve_output_dir("")
        with self.assertRaises(lc.CandidateError):
            lc.resolve_output_dir(None)

    def test_forbidden_public_and_source_paths(self):
        for value in (
            "public/city/leak",
            str(ROOT / "public/city"),
            "src/city-world.ts",
            "scripts/landmarks/tencent.py",
            "data/landmarks/tencent.json",
            "/tmp/landmark-candidate-outside",
        ):
            with self.subTest(value=value):
                with self.assertRaises(lc.CandidateError):
                    lc.resolve_output_dir(value)

    def test_supported_output_stays_in_candidate_root(self):
        path = lc.resolve_output_dir("artifacts/landmark-candidates/tencent-runner-pilot")
        self.assertTrue(lc.is_relative_to(path, lc.CANDIDATE_ROOT))

    def test_missing_module_and_spec(self):
        output = "artifacts/landmark-candidates/tencent-runner-pilot"
        with self.assertRaises(lc.CandidateError):
            lc.validate_request(
                "tencent",
                "scripts/landmarks/does-not-exist.py",
                "data/landmarks/tencent.json",
                output,
            )
        with self.assertRaises(lc.CandidateError):
            lc.validate_request(
                "tencent",
                "scripts/landmarks/tencent.py",
                "data/landmarks/does-not-exist.json",
                output,
            )
        with self.assertRaises(lc.CandidateError):
            lc.validate_request(
                "tencent",
                "scripts/landmarks/tencent.py",
                "data/landmarks/tencent.json",
                output,
                city=str(UNIT / "missing-city.json"),
            )

    def test_unsupported_object_is_explicit(self):
        with self.assertRaises(lc.CandidateError) as ctx:
            lc.validate_request(
                "fortune-plaza",
                "scripts/landmarks/priority.py",
                "data/landmarks/priority-models.json",
                "artifacts/landmark-candidates/tencent-runner-pilot",
            )
        self.assertIn("unsupported object", str(ctx.exception))

    def test_valid_bamboo_request_reads_live_coordinates(self):
        request = lc.validate_request(
            "bamboo",
            "scripts/landmarks/bamboo.py",
            "data/landmarks/bamboo.json",
            "artifacts/landmark-candidates/bamboo-visual-v1",
        )
        self.assertEqual(request["landmark"]["id"], "bamboo")
        self.assertEqual(request["landmark"]["lon"], 113.94161)
        self.assertEqual(request["landmark"]["lat"], 22.517785)
        self.assertEqual(request["scale"], 0.6)
        self.assertEqual(request["moduleKind"], "canonical")
        self.assertNotEqual(request["landmark"]["x"], 0)

    def test_spec_anchor_used_when_city_has_no_landmark(self):
        request = lc.validate_request(
            "guomao",
            "scripts/landmarks/guomao.py",
            "data/landmarks/guomao.json",
            "artifacts/landmark-candidates/guomao-visual-v1",
        )
        self.assertEqual(request["landmark"]["id"], "guomao")
        self.assertEqual(request["landmark"]["source"], "spec-anchor-reported")
        self.assertAlmostEqual(request["landmark"]["lon"], 114.114662)
        self.assertAlmostEqual(request["landmark"]["lat"], 22.543038)
        self.assertNotEqual(request["landmark"]["x"], 0)

    def test_qijie_uses_osm_spec_anchor(self):
        request = lc.validate_request(
            "qijie-gongguan",
            "scripts/landmarks/qijie_gongguan.py",
            "data/landmarks/qijie-gongguan.json",
            "artifacts/landmark-candidates/qijie-gongguan-visual-v1",
        )
        self.assertEqual(request["landmark"]["id"], "qijie-gongguan")
        self.assertEqual(request["landmark"]["source"], "spec-anchor-reported")
        self.assertAlmostEqual(request["landmark"]["lon"], 114.02751878)
        self.assertAlmostEqual(request["landmark"]["lat"], 22.56047975)
        self.assertNotEqual(request["landmark"]["x"], 0)

    def test_valid_tencent_request_reads_live_coordinates(self):
        request = lc.validate_request(
            "tencent",
            "scripts/landmarks/tencent.py",
            "data/landmarks/tencent.json",
            "artifacts/landmark-candidates/tencent-runner-pilot",
        )
        self.assertEqual(request["landmark"]["id"], "tencent")
        self.assertEqual(request["landmark"]["lon"], 113.93108)
        self.assertEqual(request["landmark"]["lat"], 22.525955)
        self.assertEqual(request["scale"], 0.6)
        self.assertEqual(request["moduleKind"], "canonical")
        self.assertEqual(request["specKind"], "canonical")
        self.assertNotEqual(request["landmark"]["x"], 0)

    def test_candidate_module_and_spec_under_artifacts_are_accepted(self):
        request = lc.validate_request(
            "tencent",
            "artifacts/landmark-candidates/tencent-runner-pilot/probe/tencent_probe.py",
            "artifacts/landmark-candidates/tencent-runner-pilot/probe/tencent_probe.json",
            "artifacts/landmark-candidates/tencent-runner-pilot",
        )
        self.assertEqual(request["moduleKind"], "candidate")
        self.assertEqual(request["specKind"], "candidate")
        self.assertEqual(request["module"].name, "tencent_probe.py")
        self.assertEqual(request["spec"].name, "tencent_probe.json")
        self.assertEqual(request["landmark"]["id"], "tencent")

    def test_spec_defaults_to_canonical_when_omitted(self):
        request = lc.validate_request(
            "tencent",
            "artifacts/landmark-candidates/tencent-runner-pilot/probe/tencent_probe.py",
            None,
            "artifacts/landmark-candidates/tencent-runner-pilot",
        )
        self.assertEqual(request["moduleKind"], "candidate")
        self.assertEqual(request["specKind"], "canonical")
        self.assertEqual(request["spec"], (ROOT / "data/landmarks/tencent.json").resolve())

    def test_rejects_wrong_suffix_escape_and_non_candidate_modules(self):
        output = "artifacts/landmark-candidates/tencent-runner-pilot"
        cases = (
            ("artifacts/landmark-candidates/tencent-runner-pilot/probe/tencent_probe.json", "data/landmarks/tencent.json"),
            ("/tmp/tencent_candidate.py", "data/landmarks/tencent.json"),
            ("scripts/landmarks/priority.py", "data/landmarks/tencent.json"),
            ("scripts/landmarks/tencent.py", "/tmp/tencent.json"),
            ("scripts/landmarks/tencent.py", "data/landmarks/priority-models.json"),
            (
                "artifacts/landmark-candidates/../../../tmp/tencent_candidate.py",
                "data/landmarks/tencent.json",
            ),
        )
        for module, spec in cases:
            with self.subTest(module=module, spec=spec):
                with self.assertRaises(lc.CandidateError):
                    lc.validate_request("tencent", module, spec, output)

    def test_candidate_spec_id_must_match(self):
        folder = UNIT / "wrong-spec-id"
        folder.mkdir(parents=True, exist_ok=True)
        spec = folder / "bad.json"
        spec.write_text('{"id":"fortune-plaza"}\n', encoding="utf-8")
        with self.assertRaises(lc.CandidateError) as ctx:
            lc.validate_request(
                "tencent",
                "scripts/landmarks/tencent.py",
                str(spec),
                "artifacts/landmark-candidates/tencent-runner-pilot",
            )
        self.assertIn("spec id", str(ctx.exception))

    def test_missing_candidate_module_under_artifacts_fails(self):
        with self.assertRaises(lc.CandidateError) as ctx:
            lc.validate_request(
                "tencent",
                "artifacts/landmark-candidates/tencent-runner-pilot/missing-candidate.py",
                "data/landmarks/tencent.json",
                "artifacts/landmark-candidates/tencent-runner-pilot",
            )
        self.assertIn("missing module", str(ctx.exception))

    def test_visual_v1_candidate_path_is_accepted_when_present(self):
        module = "artifacts/landmark-candidates/tencent-visual-v1/tencent_candidate.py"
        if not (ROOT / module).is_file():
            self.skipTest("tencent-visual-v1 module not present")
        request = lc.validate_request(
            "tencent",
            module,
            None,
            "artifacts/landmark-candidates/tencent-runner-pilot",
        )
        self.assertEqual(request["moduleKind"], "candidate")
        self.assertEqual(request["specKind"], "canonical")
        self.assertEqual(request["module"].name, "tencent_candidate.py")


class ModuleLoadTests(unittest.TestCase):
    def test_loads_requested_probe_module_not_hardcoded_tencent(self):
        probe = ROOT / "artifacts/landmark-candidates/tencent-runner-pilot/probe/tencent_probe.py"
        module = lc.load_build_module(probe)
        self.assertEqual(Path(module.__file__).resolve(), probe.resolve())
        self.assertTrue(callable(module.build))

        class FakeB:
            def __init__(self):
                self.calls = []

            def box(self, *args):
                self.calls.append(args)

        spec = json.loads((probe.parent / "tencent_probe.json").read_text(encoding="utf-8"))
        report = module.build(FakeB(), {"x": -5795.8, "z": -670.93}, spec, 0.6)
        self.assertEqual(report["probe"], "runner-pilot-module-path")
        self.assertEqual(report["id"], "tencent")

    def test_canonical_tencent_module_still_exposes_build(self):
        module = lc.load_build_module(ROOT / "scripts/landmarks/tencent.py")
        self.assertTrue(callable(module.build))
        self.assertTrue(str(module.__file__).endswith("scripts/landmarks/tencent.py"))


class OccupiedDirectoryTests(unittest.TestCase):
    def setUp(self):
        self.folder = UNIT / "occupied"
        if self.folder.exists():
            shutil.rmtree(self.folder)
        self.folder.mkdir(parents=True)
        (self.folder / "keep.txt").write_text("do-not-overwrite\n", encoding="utf-8")

    def tearDown(self):
        if self.folder.exists():
            shutil.rmtree(self.folder)

    def test_nonempty_output_gets_new_run_subdir(self):
        run = lc.allocate_run_dir(self.folder)
        self.assertTrue(run.name.startswith("run-"))
        self.assertEqual(run.parent, self.folder)
        self.assertEqual((self.folder / "keep.txt").read_text(encoding="utf-8"), "do-not-overwrite\n")
        self.assertTrue(run.is_dir())
        self.assertNotEqual(run, self.folder)


class SubprocessFailureTests(unittest.TestCase):
    def setUp(self):
        self.folder = UNIT / "subprocess-failure"
        if self.folder.exists():
            shutil.rmtree(self.folder)
        self.folder.mkdir(parents=True)
        (self.folder / "keep.txt").write_text("keep\n", encoding="utf-8")
        self.fake = self.folder / "fake-blender"
        self.fake.write_text("#!/usr/bin/env python3\nimport sys\nsys.exit(9)\n", encoding="utf-8")
        self.fake.chmod(0o755)

    def tearDown(self):
        if self.folder.exists():
            shutil.rmtree(self.folder)

    def test_failed_blender_does_not_write_success_report(self):
        result = subprocess.run(
            [
                str(PYTHON),
                str(HOST),
                "export",
                "--id", "tencent",
                "--module", "scripts/landmarks/tencent.py",
                "--spec", "data/landmarks/tencent.json",
                "--output", str(self.folder),
                "--blender", str(self.fake),
            ],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("CANDIDATE_ERROR", result.stderr)
        self.assertEqual((self.folder / "keep.txt").read_text(encoding="utf-8"), "keep\n")
        runs = sorted(self.folder.glob("run-*"))
        self.assertEqual(len(runs), 1)
        self.assertFalse((runs[0] / "report.json").exists())
        self.assertFalse((runs[0] / "review.md").exists())
        failure = json.loads((runs[0] / "failure.json").read_text(encoding="utf-8"))
        self.assertFalse(failure["ok"])
        self.assertEqual(failure["reason"], "blender_subprocess_failed")
        self.assertEqual(failure["returncode"], 9)


class CliUsageTests(unittest.TestCase):
    def test_cli_missing_output_fails(self):
        result = subprocess.run(
            [
                str(PYTHON),
                str(HOST),
                "export",
                "--id", "tencent",
                "--module", "scripts/landmarks/tencent.py",
                "--spec", "data/landmarks/tencent.json",
            ],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)

    def test_cli_forbidden_output_fails(self):
        result = subprocess.run(
            [
                str(PYTHON),
                str(HOST),
                "export",
                "--id", "tencent",
                "--module", "scripts/landmarks/tencent.py",
                "--spec", "data/landmarks/tencent.json",
                "--output", "public/city/leak-candidate",
            ],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("forbidden", result.stderr)


def latest_canonical_tencent_run():
    if not PILOT.is_dir():
        return None
    runs = []
    for path in PILOT.glob("run-*"):
        report_path = path / "report.json"
        if not report_path.is_file():
            continue
        report = json.loads(report_path.read_text(encoding="utf-8"))
        module = report.get("inputs", {}).get("module", {}).get("path", "")
        if report.get("ok") and module.endswith("scripts/landmarks/tencent.py"):
            runs.append(path)
    return sorted(runs, key=lambda path: path.name)[-1] if runs else None


class LiveExportChecks(unittest.TestCase):
    """Inspect a completed canonical Tencent run when one already exists."""

    def test_completed_run_has_glb_and_twelve_views(self):
        run = latest_canonical_tencent_run()
        if run is None:
            self.skipTest("no successful Tencent candidate run yet")
        report = json.loads((run / "report.json").read_text(encoding="utf-8"))
        self.assertTrue(report["ok"])
        self.assertTrue((run / "landmark_tencent.glb").is_file())
        stats = lc.glb_stats(run / "landmark_tencent.glb")
        self.assertGreater(stats["triangles"], 0)
        self.assertGreater(stats["meshes"], 0)
        self.assertGreater(stats["materials"], 0)
        views = lc.collect_views(run)
        self.assertEqual(len(views["clay"]), 6)
        self.assertEqual(len(views["material"]), 6)
        self.assertTrue(report["publicCity"]["unchanged"])
        top = report.get("preview", {}).get("cameras", {}).get("top", {})
        self.assertEqual(top.get("type"), "ORTHO")
        size = report.get("preview", {}).get("bounds", {}).get("size")
        if size and top.get("ortho_vertical") is not None:
            self.assertGreaterEqual(top["ortho_vertical"] + 1e-6, size[1] * 1.32)
            self.assertGreaterEqual(top["ortho_horizontal"] + 1e-6, size[0] * 1.32)


if __name__ == "__main__":
    unittest.main()
