#!/usr/bin/env python3
"""Verify every artifact and smoke-test the host binary over its real HTTP API."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

from build import ROOT, TARGETS, source_digest
from install import host_target, verify


def main():
    manifest = json.loads((ROOT / "dist/manifest.json").read_text())
    verify(manifest)
    assert manifest["source_sha256"] == source_digest(), "source changed after release build"
    assert {(t["os"], t["arch"]) for t in manifest["targets"]} == set(TARGETS), "six release targets required"
    target = host_target()
    binary = ROOT / "dist" / next(t["file"] for t in manifest["targets"] if (t["os"], t["arch"]) == target)
    assert manifest["version"] in subprocess.check_output([str(binary), "--version"], text=True)
    with tempfile.TemporaryDirectory(prefix="herdr-release-") as temporary:
        directory = Path(temporary)
        state_file = directory / "state/engine.json"
        source = directory / "App.kt"
        source.write_text('package demo\nimport org.springframework.stereotype.Service\ninterface Store {}\n@Service\nclass DiskStore : Store {}\n@Service\nclass AppService(val store: Store)\n')
        (directory / "application.properties").write_text("app.title=PRIVATE_FIXTURE_VALUE\n")
        process = subprocess.Popen([str(binary), "--port", "0", "--state", str(state_file), "--config", str(ROOT.parent / "mods/codenav/bridge/servers.json")], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            for _ in range(100):
                if state_file.exists():
                    break
                if process.poll() is not None:
                    raise AssertionError("host executable exited before state creation")
                time.sleep(0.05)
            state = json.loads(state_file.read_text())
            if os.name != "nt":
                assert state_file.stat().st_mode & 0o777 == 0o600

            def call(method, body, authorized=True):
                # Only this owned temporary service; no live user's token is read.
                headers = {"Content-Type": "application/json", "X-Codenav-Token": state["token"] if authorized else "invalid-fixture"}
                request = urllib.request.Request(f"http://127.0.0.1:{state['port']}/{method}", data=json.dumps(body).encode(), headers=headers)
                return json.load(urllib.request.urlopen(request, timeout=10))

            health = call("health", {})
            assert health["ok"] and health["result"]["version"] == manifest["version"]
            try:
                call("health", {}, authorized=False)
                raise AssertionError("unauthenticated request accepted")
            except urllib.error.HTTPError as error:
                assert error.code == 401
            markers = call("spring_markers", {"path": str(source)})
            assert markers["ok"]
            injected = next(marker for marker in markers["result"] if marker["kind"] == "spring")
            candidates = call("related", {"path": str(source), "root": str(directory), **injected})
            assert candidates["ok"] and len(candidates["result"]) == 1
            assert candidates["result"][0]["name"] == "diskStore"
            properties = call("spring_project", {"path": str(source), "root": str(directory), "kind": "properties"})
            assert properties["ok"] and properties["result"][0]["name"] == "app.title"
            assert "PRIVATE_FIXTURE_VALUE" not in json.dumps(properties)
        finally:
            if process.poll() is None:
                process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            process.stderr.close()
        assert not state_file.exists(), "owned state not removed on shutdown"
    print(f"PASS six binary checksums/source identity; host {target[0]}/{target[1]} version, HTTP auth, Spring DI/keys and owned shutdown")


if __name__ == "__main__":
    main()
