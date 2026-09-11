# Performance and resource cleanup check

`npm run perf:probe` measures a real Skirmish deployment served by Vite. It fails instead of reporting misleading numbers when the requested mission is missing, deployment is blocked, the battle does not start, the page errors, or repeated restarts leave unexplained live resources.

The probe records three repeat samples of the same seeded crowded combat frame, advances a live battle through 90 simulated seconds, then restarts it four times. Each restart is given time to finish the score fade and close its audio graph. Snapshots include Three.js GPU counters, unique live scene resources, scene objects, DOM nodes, documents, JavaScript heap after collection, and created, closed and live audio contexts. Listener accounting explicitly balances registrations and removals on the window, document and battle canvases. Chromium's broader listener count remains in the raw report because it is useful diagnostic context, but React may retain internal listener objects between alternate render trees, so that aggregate is not itself a release gate. The report also records the browser, WebGL renderer, viewport, pixel ratio, operating system, CPU and memory so two runs can be compared honestly.

Run a local Vite server first:

```sh
npm run dev -- --host 127.0.0.1 --port 5199
npm run perf:probe
```

The focused release check starts its own server and uses a shorter, still repeated profile:

```sh
npm run verify:focus:performance
```

Evidence is written to `reports/performance/` or `reports/focused/performance/probe/`. Reports are intentionally ignored by Git because they describe the machine that produced them. Use `PERF_RUNS`, `PERF_SAMPLE_MS`, `PERF_EXTENDED_SECONDS`, `PERF_REDEPLOYS`, `PERF_MISSION`, `PERF_BATTLE_CODE`, `BASE_URL`, and `PERF_REPORT_DIR` to change the profile without editing the probe.

Frame rate from the headless software renderer is a before and after signal for the same host. Draw calls, triangles and live resource counts are more portable. JavaScript heap can retain module and browser caches, so the gate permits a small bounded change while requiring renderer, scene, document and audio context counts to return to their warmed baseline.
