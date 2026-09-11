export function round(value, places = 1) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function spread(values) {
  if (values.length < 2) return 0;
  const centre = median(values);
  return centre === 0 ? 0 : round(((Math.max(...values) - Math.min(...values)) / centre) * 100);
}

export function lifecycleResult(cycles) {
  const baseline = cycles[1];
  const last = cycles.at(-1);
  const growth = Object.fromEntries([
    'gpuGeometries', 'gpuTextures', 'programs', 'sceneObjects', 'sceneGeometries', 'sceneMaterials',
    'sceneTextures', 'domNodes', 'browserEventListeners', 'trackedEventListeners', 'documents', 'audioLive', 'jsHeapMb',
  ].map((key) => [key, round(last[key] - baseline[key])]));
  const violations = [];
  for (const key of ['gpuGeometries', 'gpuTextures', 'programs', 'sceneObjects', 'sceneGeometries',
    'sceneMaterials', 'sceneTextures', 'trackedEventListeners', 'documents', 'audioLive']) {
    if (growth[key] > 0) violations.push(`${key} grew by ${growth[key]}`);
  }
  if (growth.domNodes > 8) violations.push(`domNodes grew by ${growth.domNodes}`);
  if (growth.jsHeapMb > Math.max(8, baseline.jsHeapMb * .2)) violations.push(`jsHeapMb grew by ${growth.jsHeapMb}`);
  return { cycles, growth, violations, passed: violations.length === 0 };
}

export function performanceSummary({ mission, settings, runs, errors, lifecycle }) {
  const fps = runs.map((run) => run.fps);
  const frameTimes = runs.map((run) => run.p95FrameMs);
  const drawCalls = runs.map((run) => run.peakDrawCalls);
  const triangles = runs.map((run) => run.peakTriangles);
  return {
    mission,
    settings,
    repeatability: {
      medianFps: median(fps), fpsSpreadPercent: spread(fps),
      medianP95FrameMs: median(frameTimes), p95FrameSpreadPercent: spread(frameTimes),
      medianDrawCalls: median(drawCalls), drawCallSpreadPercent: spread(drawCalls),
      medianTriangles: median(triangles), triangleSpreadPercent: spread(triangles),
    },
    errors,
    passed: errors.length === 0 && lifecycle.passed,
  };
}

export function performanceMarkdown({ summary, repeatRuns, stress, lifecycle, environment }) {
  return `# Wreckright performance and cleanup report

- Result: **${summary.passed ? 'PASS' : 'FAIL'}**
- Mission: \`${summary.mission}\` (${repeatRuns[0]?.fixture.friendlies ?? 0}v${repeatRuns[0]?.fixture.enemies ?? 0})
- Repeat samples: ${summary.settings.runs} × ${(summary.settings.sampleMs / 1000).toFixed(1)}s
- Median frame rate: ${summary.repeatability.medianFps} fps (spread ${summary.repeatability.fpsSpreadPercent}%)
- Median p95 frame time: ${summary.repeatability.medianP95FrameMs} ms (spread ${summary.repeatability.p95FrameSpreadPercent}%)
- Median draw calls: ${summary.repeatability.medianDrawCalls} (spread ${summary.repeatability.drawCallSpreadPercent}%)
- Median triangles: ${summary.repeatability.medianTriangles} (spread ${summary.repeatability.triangleSpreadPercent}%)
- Extended simulation: ${stress.simulation.secondsAdvanced}s
- Restart cycles: ${summary.settings.redeploys}
- Lifecycle growth: \`${JSON.stringify(lifecycle.growth)}\`
- Violations: ${lifecycle.violations.length ? lifecycle.violations.join('; ') : 'none'}
- Browser: ${environment.browser}; ${environment.webglRenderer}
- Host: ${environment.host.platform} ${environment.host.arch}; ${environment.host.cpu}

The machine and software renderer make frame rate useful for before/after comparison on this host. Draw calls,
triangles and resource counts are the more portable regression signals. Full samples are in \`performance.json\`.
`;
}
