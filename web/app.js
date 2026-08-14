const field = document.querySelector("#field");
const fieldCtx = field.getContext("2d");
const traces = document.querySelector("#traces");
const traceCtx = traces.getContext("2d");
const headmap = document.querySelector("#headmap");
const headCtx = headmap.getContext("2d");
const labTrace = document.querySelector("#lab-trace");
const labTraceCtx = labTrace.getContext("2d");
const stateEl = document.querySelector("#state");
const timeEl = document.querySelector("#time");
const artifactEl = document.querySelector("#artifact");
const alphaRatioEl = document.querySelector("#alpha-ratio");
const qualityEl = document.querySelector("#quality");
const bandsEl = document.querySelector("#bands");
const pauseButton = document.querySelector("#pause");
const dominantEl = document.querySelector("#dominant");
const amplitudeEl = document.querySelector("#amplitude");
const artifactIntensityEl = document.querySelector("#artifact-intensity");
const spreadEl = document.querySelector("#spread");
const balanceEl = document.querySelector("#balance");
const asymmetryEl = document.querySelector("#asymmetry");
const syncStatusEl = document.querySelector("#sync-status");
const syncFrameEl = document.querySelector("#sync-frame");
const syncTimeEl = document.querySelector("#sync-time");
const syncModulesEl = document.querySelector("#sync-modules");
const syncO1AlphaEl = document.querySelector("#sync-o1-alpha");
const syncO2AlphaEl = document.querySelector("#sync-o2-alpha");
const syncAlphaNormEl = document.querySelector("#sync-alpha-norm");
const labChannelsEl = document.querySelector("#lab-channels");
const labFrameEl = document.querySelector("#lab-frame");
const labChannelEl = document.querySelector("#lab-channel");
const labDominantEl = document.querySelector("#lab-dominant");
const labConfidenceEl = document.querySelector("#lab-confidence");
const labArtifactEl = document.querySelector("#lab-artifact");
const labBandsEl = document.querySelector("#lab-bands");
const experimentWindowCountEl = document.querySelector("#experiment-window-count");
const experimentRowsEl = document.querySelector("#experiment-rows");

const bandColors = {
  delta: "#4df6ff",
  theta: "#8dff7a",
  alpha: "#ffe45c",
  beta: "#ff4ea3",
  gamma: "#ff5a53",
};
const bandNames = Object.keys(bandColors);
const fallbackNormalizedBands = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };

const brainRegions = {
  frontal: { x: 0.34, y: 0.4, rx: 0.21, ry: 0.14, color: "rgba(77, 246, 255, 0.08)" },
  central: { x: 0.54, y: 0.34, rx: 0.18, ry: 0.14, color: "rgba(141, 255, 122, 0.07)" },
  temporal: { x: 0.52, y: 0.58, rx: 0.23, ry: 0.1, color: "rgba(255, 78, 163, 0.06)" },
  posterior: { x: 0.72, y: 0.42, rx: 0.18, ry: 0.14, color: "rgba(255, 228, 92, 0.07)" },
  occipital: { x: 0.8, y: 0.48, rx: 0.13, ry: 0.13, color: "rgba(255, 90, 83, 0.07)" },
};

const channelRegions = {
  Fp1: "frontal",
  Fp2: "frontal",
  C3: "central",
  C4: "central",
  O1: "occipital",
  O2: "occipital",
};

const projectionAnchors = [
  { label: "Fp1/Fp2", channels: ["Fp1", "Fp2"], region: "frontal", baseline: -7 },
  { label: "C3/C4", channels: ["C3", "C4"], region: "central", baseline: -4 },
  { label: "O1/O2", channels: ["O1", "O2"], region: "occipital", baseline: 2 },
];

const bandTracePhase = { delta: 0.2, theta: 1.1, alpha: 2.0, beta: 2.9, gamma: 3.8 };
const bandLaneOffset = { delta: -34, theta: -17, alpha: 0, beta: 17, gamma: 34 };
const streamFrameDelayMs = (0.25 / 1.35) * 1000;

const state = {
  frame: null,
  bands: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  normalized: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  displayNormalized: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  trails: Object.fromEntries(bandNames.map((band) => [band, []])),
  latestPoints: {},
  lastFrameTime: null,
  pendingFrames: [],
  drainingQueue: false,
  queueTimer: null,
  renderedFrames: {
    field: null,
    inset: null,
    bars: null,
    raw: null,
    lab: null,
    metrics: null,
  },
  selectedChannel: "O1",
  phase: 0,
  paused: false,
};

// MNE standard_1020 montage coordinates projected into the sagittal inset:
// montage y axis -> anterior/posterior, montage x axis -> left/right separation.
const electrodeLayout = {
  Fp1: electrodePoint(-0.0294367, 0.0839171, "frontal"),
  Fp2: electrodePoint(0.0298723, 0.0848959, "frontal"),
  C3: electrodePoint(-0.0653581, -0.0116317, "central"),
  C4: electrodePoint(0.0671179, -0.0109003, "central"),
  O1: electrodePoint(-0.0294134, -0.112449, "posterior"),
  O2: electrodePoint(0.0298426, -0.112156, "posterior"),
};

for (const band of bandNames) {
  const row = document.createElement("div");
  row.className = "band";
  row.innerHTML = `<span>${band}</span><div class="bar"><span style="color:${bandColors[band]};background:${bandColors[band]}"></span></div><output>0%</output>`;
  bandsEl.appendChild(row);

  const labRow = document.createElement("div");
  labRow.className = "lab-band";
  labRow.dataset.band = band;
  labRow.innerHTML = `<span>${band}</span><strong>0.00 µV²</strong><output>0.00</output>`;
  labBandsEl.appendChild(labRow);
}

for (const channel of Object.keys(electrodeLayout)) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = channel;
  button.className = channel === state.selectedChannel ? "is-selected" : "";
  button.addEventListener("click", () => {
    state.selectedChannel = channel;
    updateChannelButtons();
    renderSignalLab();
  });
  labChannelsEl.appendChild(button);
}

const experimentRows = [
  ["O1 α", "O1_alpha"],
  ["O2 α", "O2_alpha"],
  ["Posterior α", "posterior_alpha"],
  ["C3 α", "C3_alpha"],
  ["C4 α", "C4_alpha"],
];

for (const [label, key] of experimentRows) {
  const row = document.createElement("div");
  row.className = "experiment-row";
  row.dataset.key = key;
  row.innerHTML = `<span>${label}</span><strong>-- → --</strong><output>--</output>`;
  experimentRowsEl.appendChild(row);
}

function updateChannelButtons() {
  [...labChannelsEl.querySelectorAll("button")].forEach((button) => {
    button.classList.toggle("is-selected", button.textContent === state.selectedChannel);
  });
}

function resizeCanvas(canvas, ctx) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function resize() {
  resizeCanvas(field, fieldCtx);
  resizeCanvas(traces, traceCtx);
  resizeCanvas(headmap, headCtx);
  resizeCanvas(labTrace, labTraceCtx);
}

window.addEventListener("resize", resize);
resize();

let stream = null;
pauseButton.addEventListener("click", () => {
  state.paused = !state.paused;
  pauseButton.classList.toggle("is-paused", state.paused);
  pauseButton.setAttribute("aria-label", state.paused ? "Play replay" : "Pause replay");
  pauseButton.setAttribute("aria-pressed", String(state.paused));
  if (state.paused) {
    stopQueuedPlayback();
    return;
  }
  drainQueuedFrames();
});

function closeStream() {
  if (!stream) return;
  stream.close();
  stream = null;
}

function connectStream(startAfter = null) {
  closeStream();
  if (!state.frame) {
    stateEl.textContent = "connecting";
    artifactEl.textContent = "loading real EEG";
  }
  const params = new URLSearchParams({ source: "openneuro", seconds: "24", speed: "1.35" });
  if (Number.isFinite(startAfter)) {
    params.set("start_after", startAfter.toFixed(3));
  }
  stream = new EventSource(`/api/stream?${params}`);
  stream.onmessage = (event) => {
    const frame = JSON.parse(event.data);
    if (state.paused || state.drainingQueue) {
      queueFrame(frame);
      return;
    }
    applyFrame(frame);
  };
  stream.onerror = () => {
    if (state.paused) return;
    artifactEl.textContent = "real EEG not found";
    artifactEl.style.color = "var(--yellow)";
  };
}

function queueFrame(frame) {
  state.pendingFrames.push(frame);
  if (state.pendingFrames.length > 900) {
    state.pendingFrames.shift();
  }
}

function stopQueuedPlayback() {
  if (state.queueTimer) {
    window.clearTimeout(state.queueTimer);
    state.queueTimer = null;
  }
  state.drainingQueue = false;
}

function drainQueuedFrames() {
  stopQueuedPlayback();
  if (state.paused || state.pendingFrames.length === 0) return;

  state.drainingQueue = true;
  applyFrame(state.pendingFrames.shift());
  state.queueTimer = window.setTimeout(() => {
    state.queueTimer = null;
    drainQueuedFrames();
  }, streamFrameDelayMs);
}

function applyFrame(frame) {
  if (state.lastFrameTime !== null && frame.time_s < state.lastFrameTime) {
    resetStateTrails();
  }
  state.frame = frame;
  state.bands = averageBands(frame.features);
  state.normalized = frame.normalized_bands || normalizeBands(state.bands);
  if (!state.displayInitialized) {
    state.displayNormalized = { ...state.normalized };
    state.displayInitialized = true;
  }
  appendTrajectoryFrame(frame);
  updateHud(frame);
  state.lastFrameTime = frame.time_s;
}

function resetStateTrails() {
  for (const band of bandNames) {
    state.trails[band] = [];
  }
  state.latestPoints = {};
}

connectStream();

function averageBands(features) {
  const bands = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };
  const channels = Object.values(features);
  for (const channel of channels) {
    for (const band of Object.keys(bands)) {
      bands[band] += channel[band] || 0;
    }
  }
  for (const band of Object.keys(bands)) {
    bands[band] /= Math.max(1, channels.length);
  }
  return bands;
}

function normalizeBands(bands) {
  const values = Object.values(bands);
  const max = Math.max(...values, 1e-16);
  return Object.fromEntries(Object.entries(bands).map(([key, value]) => [key, Math.min(1, value / max)]));
}

function updateHud(frame) {
  markRendered("metrics", frame);
  stateEl.textContent = frame.state.replace("_", " ");
  timeEl.textContent = `${frame.time_s.toFixed(3)}s`;
  artifactEl.textContent = frame.summary.blink_like_artifact ? "blink-like artifact · µV²" : "signal clean · µV²";
  artifactEl.style.color = frame.summary.blink_like_artifact ? "var(--yellow)" : "var(--green)";
  alphaRatioEl.textContent = `${frame.summary.posterior_alpha_ratio.toFixed(2)}x`;
  qualityEl.textContent = `${Math.round(numberOrZero(frame.summary.measurement_confidence || 1) * 100)}%`;
  dominantEl.textContent = frame.summary.dominant_rhythm || "warming";
  amplitudeEl.textContent = `${numberOrZero(frame.summary.signal_amplitude_uv).toFixed(1)} µV`;
  artifactIntensityEl.textContent = `${Math.round(numberOrZero(frame.summary.artifact_intensity) * 100)}%`;
  spreadEl.textContent = `${Math.round(numberOrZero(frame.summary.spectral_spread) * 100)}%`;
  balanceEl.textContent = signedLabel(numberOrZero(frame.summary.hemispheric_balance), "left", "right");
  asymmetryEl.textContent = signedLabel(numberOrZero(frame.summary.posterior_alpha_asymmetry), "O1", "O2");
  updateExperimentPanel(frame);
}

function updateSmoothBands() {
  if (!state.frame) return;
  markRendered("bars", state.frame);
  const smoothing = 0.34;
  for (const band of bandNames) {
    state.displayNormalized[band] = lerpNumber(state.displayNormalized[band] || 0, state.normalized[band] || 0, smoothing);
  }

  [...bandsEl.querySelectorAll(".band")].forEach((row) => {
    const band = row.firstElementChild.textContent;
    const value = state.displayNormalized[band] || 0;
    row.querySelector(".bar span").style.width = `${Math.round(value * 100)}%`;
    row.querySelector("output").textContent = formatBandPowerUv2(state.bands[band]);
  });
}

function lerpNumber(current, target, amount) {
  return current + (target - current) * amount;
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatBandPowerUv2(value) {
  const uv2 = numberOrZero(value) * 1e12;
  if (uv2 >= 100) return uv2.toFixed(0);
  if (uv2 >= 10) return uv2.toFixed(1);
  return uv2.toFixed(2);
}

function formatFrameId(frame) {
  if (!frame) return "--";
  return Number.isFinite(frame.frame_id) ? `#${frame.frame_id}` : "--";
}

function markRendered(module, frame) {
  if (!frame) return;
  state.renderedFrames[module] = frame.frame_id;
  updateSyncAudit();
}

function updateSyncAudit() {
  if (!state.frame) return;
  const currentFrameId = state.frame.frame_id;
  const frameValues = Object.values(state.renderedFrames);
  const renderedCount = frameValues.filter((value) => value !== null && value !== undefined).length;
  const allSynced = renderedCount === frameValues.length && frameValues.every((value) => value === currentFrameId);
  const rawO1Alpha = state.frame.features?.O1?.alpha || 0;
  const rawO2Alpha = state.frame.features?.O2?.alpha || 0;
  const normalizedO1Alpha = state.frame.normalized_features?.O1?.alpha ?? 0;
  const normalizedO2Alpha = state.frame.normalized_features?.O2?.alpha ?? 0;

  syncStatusEl.textContent = allSynced ? "single frame" : "rendering";
  syncStatusEl.style.color = allSynced ? "var(--green)" : "var(--yellow)";
  syncFrameEl.textContent = formatFrameId(state.frame);
  syncTimeEl.textContent = `${state.frame.time_s.toFixed(3)}s`;
  syncModulesEl.textContent = Object.entries(state.renderedFrames)
    .map(([module, frameId]) => `${module}:${frameId ?? "--"}`)
    .join(" ");
  syncO1AlphaEl.textContent = `${formatBandPowerUv2(rawO1Alpha)} µV²`;
  syncO2AlphaEl.textContent = `${formatBandPowerUv2(rawO2Alpha)} µV²`;
  syncAlphaNormEl.textContent = `${normalizedO1Alpha.toFixed(2)} / ${normalizedO2Alpha.toFixed(2)}`;
}

function updateExperimentPanel(frame) {
  const experiment = frame.experiment;
  if (!experiment) return;
  experimentWindowCountEl.textContent = `${experiment.clean_windows}/${experiment.total_windows} clean`;
  [...experimentRowsEl.querySelectorAll(".experiment-row")].forEach((row) => {
    const comparison = experiment.comparisons?.[row.dataset.key];
    if (!comparison) return;
    row.querySelector("strong").textContent = `${formatOptionalUv2(comparison.eyes_open_uv2)} → ${formatOptionalUv2(comparison.eyes_closed_uv2)}`;
    row.querySelector("output").textContent = formatPercentChange(comparison.percent_change);
    row.classList.toggle("is-increase", numberOrZero(comparison.percent_change) > 0);
  });
}

function formatOptionalUv2(value) {
  return Number.isFinite(value) ? `${formatUv2Number(value)} µV²` : "--";
}

function formatUv2Number(value) {
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatPercentChange(value) {
  if (!Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(0)}%`;
}

function signedLabel(value, positive, negative) {
  if (Math.abs(value) < 0.08) return "centered";
  return `${Math.abs(value * 100).toFixed(0)}% ${value > 0 ? positive : negative}`;
}

function drawField() {
  if (state.frame) markRendered("field", state.frame);
  const rect = field.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const alpha = state.normalized.alpha || 0.2;
  const beta = state.normalized.beta || 0.2;
  state.phase += 0.012 + beta * 0.018;

  fieldCtx.fillStyle = "rgba(3, 4, 6, 0.26)";
  fieldCtx.fillRect(0, 0, width, height);
  drawStateSpaceMap(fieldCtx, width, height, alpha);
  fieldCtx.shadowBlur = 0;
}

function appendTrajectoryFrame(frame) {
  if (!frame?.features) return;
  const layout = stateSpaceLayout(field.getBoundingClientRect().width, field.getBoundingClientRect().height);
  for (const band of bandNames) {
    const metrics = bandStateMetrics(frame, band);
    const projected = projectStatePoint(layout, metrics, band);
    const previous = state.latestPoints[band];
    const point = previous
      ? {
          ...projected,
          x: lerpNumber(previous.x, projected.x, 0.38),
          y: lerpNumber(previous.y, projected.y, 0.38),
        }
      : projected;
    point.time = frame.time_s;
    state.latestPoints[band] = point;
    state.trails[band].push(point);
    if (state.trails[band].length > 190) {
      state.trails[band].shift();
    }
  }
}

function bandStateMetrics(frame, band) {
  const features = frame.normalized_features || frame.features;
  const summary = frame.summary || {};
  const frontal = channelBandMean(features, ["Fp1", "Fp2"], band);
  const central = channelBandMean(features, ["C3", "C4"], band);
  const posterior = channelBandMean(features, ["O1", "O2"], band);
  const total = frontal + central + posterior + 1e-18;
  const left = channelBandMean(features, ["Fp1", "C3", "O1"], band);
  const right = channelBandMean(features, ["Fp2", "C4", "O2"], band);
  const regionalBalance = (left - right) / (left + right + 1e-18);
  const anteriorPosterior = (posterior - frontal) / total;
  const centralPull = (central - (frontal + posterior) / 2) / total;
  const relativePower = frame.normalized_bands?.[band] ?? state.normalized[band] ?? 0;
  const posteriorAlpha = Math.log2(Math.max(0.15, numberOrZero(summary.posterior_alpha_ratio)));
  const artifact = numberOrZero(summary.artifact_intensity);
  const spread = numberOrZero(summary.spectral_spread);
  const wholeFieldLateral = numberOrZero(summary.hemispheric_balance);
  const wholeFieldPosterior = clamp(posteriorAlpha / 2.2, -1, 1);
  const wholeFieldSpread = clamp(spread * 2 - 1, -1, 1);
  const confidence = numberOrZero(summary.measurement_confidence || 1);

  return {
    lateral: clamp(wholeFieldLateral * 0.66 + regionalBalance * 0.28, -1, 1),
    posterior: clamp(wholeFieldPosterior * 0.72 + anteriorPosterior * 0.46, -1, 1),
    central: clamp(wholeFieldSpread * 0.48 + centralPull * 0.36, -1, 1),
    relativePower,
    artifact: clamp(artifact, 0, 1),
    confidence: clamp(confidence, 0.05, 1),
    spread: clamp(spread, 0, 1),
  };
}

function channelBandMean(features, channels, band) {
  return channels.reduce((sum, channel) => sum + (features[channel]?.[band] || 0), 0) / channels.length;
}

function stateSpaceLayout(width, height) {
  return {
    cx: width * 0.47,
    cy: height * 0.52,
    rx: Math.min(width * 0.2, height * 0.3),
    ry: Math.min(width * 0.13, height * 0.22),
  };
}

function projectStatePoint(layout, metrics, band) {
  const bandOffset = { delta: -0.08, theta: -0.04, alpha: 0.01, beta: 0.04, gamma: 0.08 }[band] || 0;
  const angle = -0.72;
  const xAxis = metrics.lateral * layout.rx;
  const yAxis = -metrics.posterior * layout.ry;
  const zAxis = metrics.central * layout.ry * 0.32;
  const orbit = bandOffset * layout.ry * (0.6 + metrics.relativePower * 0.6);

  return {
    x: layout.cx + xAxis * Math.cos(angle) - yAxis * Math.sin(angle) + orbit,
    y: layout.cy + xAxis * Math.sin(angle) + yAxis * Math.cos(angle) - zAxis + orbit * 0.32,
    power: metrics.relativePower,
    artifact: metrics.artifact,
    confidence: metrics.confidence,
    spread: metrics.spread,
  };
}

function drawStateSpaceMap(ctx, width, height, alphaPower) {
  const layout = stateSpaceLayout(width, height);
  drawStateSpaceGlow(ctx, layout, alphaPower);
  drawStateSpaceAxes(ctx, layout);
  drawStateTrails(ctx);
  drawCurrentStateMarker(ctx);
}

function drawStateSpaceGlow(ctx, layout, alphaPower) {
  const dominant = state.frame?.summary?.dominant_rhythm || "alpha";
  const glow = ctx.createRadialGradient(layout.cx, layout.cy, 8, layout.cx, layout.cy, layout.rx * 1.18);
  glow.addColorStop(0, colorWithAlpha(bandColors[dominant] || bandColors.alpha, 0.08 + alphaPower * 0.06));
  glow.addColorStop(0.38, "rgba(255, 228, 92, 0.028)");
  glow.addColorStop(1, "rgba(3, 4, 6, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(layout.cx, layout.cy, layout.rx * 0.88, layout.ry * 0.98, -0.72, 0, Math.PI * 2);
  ctx.fill();
}

function drawStateSpaceAxes(ctx, layout) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(244,247,244,0.055)";
  ctx.lineWidth = 1;
  const axes = [
    { dx: layout.rx * 1.1, dy: -layout.ry * 0.96, a: "left alpha", b: "right alpha" },
    { dx: layout.rx * 1.15, dy: layout.ry * 0.52, a: "frontal", b: "posterior alpha" },
    { dx: 0, dy: -layout.ry * 0.9, a: "low spread", b: "high spread" },
  ];
  for (const axis of axes) {
    ctx.beginPath();
    ctx.moveTo(layout.cx - axis.dx, layout.cy - axis.dy);
    ctx.lineTo(layout.cx + axis.dx, layout.cy + axis.dy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStateTrails(ctx) {
  for (const band of bandNames) {
    const trail = state.trails[band];
    if (trail.length < 2) continue;
    drawBandTrail(ctx, band, trail);
  }
}

function drawBandTrail(ctx, band, trail) {
  const color = bandColors[band];
  const latest = trail[trail.length - 1];
  const dominance = latest.power || 0;
  if (dominance < 0.05) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = color;

  for (let index = 1; index < trail.length; index += 1) {
    const previous = trail[index - 1];
    const current = trail[index];
    const age = index / trail.length;
    const localPower = (previous.power + current.power) / 2;
    const confidence = (previous.confidence + current.confidence) / 2;
    const alpha = Math.max(0, Math.pow(age, 2.2) * (0.08 + localPower * 0.62) * confidence);
    ctx.strokeStyle = colorWithAlpha(color, alpha);
    ctx.lineWidth = 0.45 + localPower * 4.4 * confidence;
    ctx.shadowBlur = 1 + localPower * 14 * confidence;
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
  }

  for (let index = Math.max(0, trail.length - 88); index < trail.length; index += 13) {
    const point = trail[index];
    const age = index / trail.length;
    ctx.fillStyle = colorWithAlpha("#f4f7f4", (0.14 + age * 0.56) * (point.confidence || 1));
    ctx.shadowBlur = 4 + point.power * 12 * (point.confidence || 1);
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 1.1 + point.power * 2.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = colorWithAlpha(color, (0.24 + dominance * 0.56) * (latest.confidence || 1));
  ctx.shadowBlur = 8 + dominance * 22 * (latest.confidence || 1);
  ctx.beginPath();
  ctx.arc(latest.x, latest.y, 2 + dominance * 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCurrentStateMarker(ctx) {
  if (!state.frame) return;
  const dominant = state.frame.summary?.dominant_rhythm || "alpha";
  const point = state.latestPoints[dominant];
  if (!point) return;
  ctx.save();
  ctx.fillStyle = colorWithAlpha("#f4f7f4", 0.28 + (point.confidence || 1) * 0.62);
  ctx.shadowBlur = 6 + 12 * (point.confidence || 1);
  ctx.shadowColor = bandColors[dominant] || "#f4f7f4";
  ctx.beginPath();
  ctx.arc(point.x, point.y, 2.4 + (point.power || 0) * 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function brainBox(width, height) {
  const availableWidth = width * 0.72;
  return {
    cx: width * 0.5,
    cy: height * 0.54,
    rx: Math.min(availableWidth * 0.48, height * 0.43),
    ry: Math.min(width * 0.26, height * 0.28),
  };
}

function drawBrainMesh(ctx, brain, alpha, theta) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const lobes = Object.values(brainRegions);
  for (const region of lobes) {
    const x = brain.cx + (region.x - 0.5) * brain.rx * 2;
    const y = brain.cy + (region.y - 0.5) * brain.ry * 2;
    const glow = ctx.createRadialGradient(x, y, 8, x, y, brain.rx * region.rx * 1.9);
    glow.addColorStop(0, region.color);
    glow.addColorStop(1, "rgba(3,4,6,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(x, y, brain.rx * region.rx * 1.75, brain.ry * region.ry * 1.75, -0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = `rgba(244, 247, 244, ${0.24 + alpha * 0.1})`;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  traceBrainPath(ctx, brain);
  ctx.stroke();

  drawBrainstem(ctx, brain);

  ctx.strokeStyle = "rgba(244,247,244,0.07)";
  ctx.lineWidth = 0.9;
  for (const region of Object.values(brainRegions)) {
    const x = brain.cx + (region.x - 0.5) * brain.rx * 2;
    const y = brain.cy + (region.y - 0.5) * brain.ry * 2;
    ctx.beginPath();
    ctx.ellipse(x, y, brain.rx * region.rx * 1.02, brain.ry * region.ry * 1.02, -0.1, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function traceBrainPath(ctx, brain) {
  const x = brain.cx;
  const y = brain.cy;
  const rx = brain.rx;
  const ry = brain.ry;
  ctx.moveTo(x - rx * 0.98, y - ry * 0.1);
  ctx.bezierCurveTo(x - rx * 1.04, y - ry * 0.48, x - rx * 0.78, y - ry * 0.82, x - rx * 0.34, y - ry * 0.9);
  ctx.bezierCurveTo(x + rx * 0.02, y - ry * 1.02, x + rx * 0.48, y - ry * 0.86, x + rx * 0.74, y - ry * 0.58);
  ctx.bezierCurveTo(x + rx * 1.0, y - ry * 0.3, x + rx * 1.03, y + ry * 0.12, x + rx * 0.84, y + ry * 0.35);
  ctx.bezierCurveTo(x + rx * 0.72, y + ry * 0.52, x + rx * 0.43, y + ry * 0.5, x + rx * 0.28, y + ry * 0.62);
  ctx.bezierCurveTo(x + rx * 0.02, y + ry * 0.82, x - rx * 0.46, y + ry * 0.72, x - rx * 0.72, y + ry * 0.45);
  ctx.bezierCurveTo(x - rx * 0.92, y + ry * 0.25, x - rx * 0.98, y + ry * 0.08, x - rx * 0.98, y - ry * 0.1);
  ctx.closePath();
}

function drawBrainstem(ctx, brain) {
  const x = brain.cx;
  const y = brain.cy;
  const rx = brain.rx;
  const ry = brain.ry;

  ctx.strokeStyle = "rgba(244,247,244,0.22)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(x - rx * 0.12, y + ry * 0.58);
  ctx.bezierCurveTo(x - rx * 0.1, y + ry * 0.88, x - rx * 0.02, y + ry * 1.05, x + rx * 0.05, y + ry * 1.26);
  ctx.lineTo(x - rx * 0.08, y + ry * 1.3);
  ctx.bezierCurveTo(x - rx * 0.16, y + ry * 1.1, x - rx * 0.23, y + ry * 0.88, x - rx * 0.24, y + ry * 0.65);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(x + rx * 0.32, y + ry * 0.68, rx * 0.24, ry * 0.18, -0.08, 0, Math.PI * 2);
  ctx.stroke();
}

function channelIntensity(channel) {
  const bands = state.frame?.normalized_features?.[channel] || state.frame?.features?.[channel];
  if (!bands) return 0.2;
  const total = Object.values(bands).reduce((sum, value) => sum + value, 0) || 1e-18;
  return Math.min(1, total / Object.values(fallbackNormalizedBands).length);
}

function drawSpectralProfileTraces(ctx, brain) {
  if (!state.frame?.features) return;
  ctx.save();
  ctx.beginPath();
  traceBrainPath(ctx, brain);
  ctx.clip();

  bandNames.forEach((band, bandIndex) => {
    drawBandProfile(ctx, brain, band, bandIndex);
  });
  ctx.restore();
}

function drawBandProfile(ctx, brain, band, bandIndex) {
  const profile = projectionAnchors.map((anchor) => ({
    anchor,
    point: anchorPoint(brain, anchor),
    value: normalizedAnchorBandPower(anchor, band),
  }));
  const strongest = Math.max(...profile.map((entry) => entry.value));
  const globalBand = state.normalized[band] || 0;
  if (strongest < 0.06) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = bandColors[band];
  ctx.globalAlpha = 0.48 + globalBand * 0.52;

  drawReferenceProfile(ctx, band, profile, globalBand);
  for (let index = 0; index < profile.length - 1; index += 1) {
    drawMeasuredSegment(ctx, band, profile[index], profile[index + 1], globalBand);
  }
  for (const entry of profile) {
    drawBandAnchorBehavior(ctx, band, entry, globalBand);
  }
  ctx.restore();
}

function drawReferenceProfile(ctx, band, profile, globalBand) {
  ctx.save();
  ctx.strokeStyle = colorWithAlpha(bandColors[band], 0.12 + globalBand * 0.12);
  ctx.lineWidth = 0.8 + globalBand * 0.7;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  profile.forEach((entry, index) => {
    const point = spectralPointBetween(entry.point, entry.point, 0, band, entry.value, entry.value);
    if (index === 0) ctx.moveTo(point.x, point.y);
    else {
      const previous = profile[index - 1];
      for (let step = 1; step <= 18; step += 1) {
        const t = step / 18;
        const next = spectralPointBetween(previous.point, entry.point, t, band, previous.value, entry.value);
        ctx.lineTo(next.x, next.y);
      }
    }
  });
  ctx.stroke();
  ctx.restore();
}

function drawMeasuredSegment(ctx, band, start, end, globalBand) {
  const steps = 30;
  let previous = spectralPointBetween(start.point, end.point, 0, band, start.value, end.value);
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const current = spectralPointBetween(start.point, end.point, t, band, start.value, end.value);
    const value = start.value + (end.value - start.value) * t;
    const localShape = anchorInfluence(t, start.value, end.value);
    const inferred = Math.sin(Math.PI * t);
    ctx.strokeStyle = colorWithAlpha(bandColors[band], 0.12 + globalBand * 0.22 + localShape * 0.6 - inferred * 0.05);
    ctx.lineWidth = 0.8 + globalBand * 1.1 + localShape * 9.8;
    ctx.shadowBlur = 4 + globalBand * 10 + localShape * 28;
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
    previous = current;
  }
}

function spectralPointBetween(start, end, t, band, startValue, endValue) {
  const x = start.x + (end.x - start.x) * t;
  const y = start.y + (end.y - start.y) * t;
  const localValue = startValue + (endValue - startValue) * t;
  const betweenOnly = Math.sin(Math.PI * t);
  const baseLift = (bandLaneOffset[band] || 0) * betweenOnly;
  const localShape = anchorInfluence(t, startValue, endValue);
  const oscillation = Math.sin(state.phase * bandMotionRate(band) + t * Math.PI * 5 + bandTracePhase[band]) * betweenOnly;
  const anchorBreath = Math.sin(state.phase * 1.6 + bandTracePhase[band]) * (startValue - endValue) * betweenOnly;
  return {
    x,
    y: y + baseLift + anchorBreath * 10 + oscillation * (2 + localValue * 6 + localShape * 12),
  };
}

function anchorInfluence(t, startValue, endValue) {
  const startPulse = Math.exp(-Math.pow(t / 0.24, 2)) * startValue;
  const endPulse = Math.exp(-Math.pow((1 - t) / 0.24, 2)) * endValue;
  return Math.max(startPulse, endPulse);
}

function drawBandAnchorBehavior(ctx, band, entry, globalBand) {
  if (entry.value < 0.08) return;
  const { x, y } = entry.point;
  const pulse = (Math.sin(state.phase * bandMotionRate(band) + bandTracePhase[band]) + 1) / 2;
  const radius = 3 + entry.value * 13 + pulse * entry.value * 4;
  const glow = ctx.createRadialGradient(x, y, 1, x, y, radius * 3.2);
  glow.addColorStop(0, colorWithAlpha(bandColors[band], 0.2 + entry.value * 0.42));
  glow.addColorStop(0.45, colorWithAlpha(bandColors[band], 0.06 + entry.value * 0.16));
  glow.addColorStop(1, colorWithAlpha(bandColors[band], 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius * 3.2, 0, Math.PI * 2);
  ctx.fill();

  drawLocalWavelet(ctx, band, entry, globalBand);

  ctx.fillStyle = colorWithAlpha(bandColors[band], 0.14 + globalBand * 0.2 + entry.value * 0.52);
  ctx.shadowBlur = 8 + entry.value * 18;
  ctx.shadowColor = bandColors[band];
  ctx.beginPath();
  ctx.arc(x, y, 1.2 + entry.value * 3.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawLocalWavelet(ctx, band, entry, globalBand) {
  const { x, y } = entry.point;
  const span = 20 + entry.value * 42;
  const amplitude = 2 + entry.value * 13;
  ctx.save();
  ctx.strokeStyle = colorWithAlpha(bandColors[band], 0.2 + globalBand * 0.24 + entry.value * 0.34);
  ctx.lineWidth = 0.8 + globalBand * 1.2 + entry.value * 3.8;
  ctx.shadowBlur = 7 + entry.value * 18;
  ctx.shadowColor = bandColors[band];
  ctx.beginPath();
  for (let step = 0; step <= 28; step += 1) {
    const t = step / 28;
    const localX = x - span / 2 + span * t;
    const envelope = Math.sin(Math.PI * t);
    const localY = y + Math.sin(t * Math.PI * 4 + state.phase * bandMotionRate(band) + bandTracePhase[band]) * amplitude * envelope;
    if (step === 0) ctx.moveTo(localX, localY);
    else ctx.lineTo(localX, localY);
  }
  ctx.stroke();
  ctx.restore();
}

function normalizedAnchorBandPower(anchor, band) {
  const rawValues = projectionAnchors.map((candidate) => rawAnchorBandPower(candidate, band));
  const logValues = rawValues.map((value) => Math.log10(value + 1e-18));
  const min = Math.min(...logValues);
  const max = Math.max(...logValues);
  const anchorLog = Math.log10(rawAnchorBandPower(anchor, band) + 1e-18);
  const spatial = max === min ? 0.62 : (anchorLog - min) / (max - min);
  const globalBand = state.normalized[band] || 0;
  return Math.min(1, 0.07 + globalBand * (0.2 + spatial * 0.76));
}

function rawAnchorBandPower(anchor, band) {
  const values = anchor.channels.map((channel) => state.frame?.features?.[channel]?.[band] || 0);
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function anchorPoint(brain, anchor) {
  const region = brainRegions[anchor.region];
  return {
    x: brain.cx + (region.x - 0.5) * brain.rx * 2,
    y: brain.cy + (region.y - 0.5) * brain.ry * 2 + anchor.baseline,
  };
}

function bandMotionRate(band) {
  return { delta: 0.42, theta: 0.64, alpha: 0.92, beta: 1.18, gamma: 1.38 }[band] || 1;
}

function colorWithAlpha(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawRegionLabels(ctx, brain) {
  ctx.save();
  ctx.fillStyle = "rgba(244,247,244,0.42)";
  ctx.font = "700 11px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  const labels = [
    ["frontal", brainRegions.frontal],
    ["central", brainRegions.central],
    ["occipital", brainRegions.occipital],
  ];
  for (const [label, region] of labels) {
    const x = brain.cx + (region.x - 0.5) * brain.rx * 2;
    const y = brain.cy + (region.y - 0.5) * brain.ry * 2 - brain.ry * region.ry * 1.5;
    ctx.fillText(label, x, y);
  }
  ctx.restore();
}

function drawProjectionAnchors(ctx, brain) {
  ctx.save();
  ctx.font = "700 9px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (const anchor of projectionAnchors) {
    const { x, y } = anchorPoint(brain, anchor);
    const strength = anchor.channels.reduce((sum, channel) => sum + channelIntensity(channel), 0) / anchor.channels.length;
    const dominant = dominantAnchorBand(anchor);
    ctx.shadowBlur = 6 + strength * 14;
    ctx.shadowColor = bandColors[dominant];
    ctx.fillStyle = colorWithAlpha(bandColors[dominant], 0.38 + strength * 0.32);
    ctx.beginPath();
    ctx.arc(x, y, 2.2 + strength * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(244,247,244,0.38)";
    ctx.fillText(anchor.label, x, y - 8);
  }
  ctx.restore();
}

function dominantAnchorBand(anchor) {
  return bandNames.reduce((best, band) => (
    rawAnchorBandPower(anchor, band) > rawAnchorBandPower(anchor, best) ? band : best
  ), "delta");
}

function drawTraces() {
  if (state.frame) markRendered("raw", state.frame);
  const rect = traces.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  traceCtx.clearRect(0, 0, width, height);
  traceCtx.fillStyle = "rgba(255,255,255,0.025)";
  traceCtx.fillRect(0, 0, width, height);

  if (!state.frame?.raw_preview) return;
  const channels = Object.entries(state.frame.raw_preview);
  const lane = height / channels.length;
  channels.forEach(([channel, samples], channelIndex) => {
    const yMid = lane * channelIndex + lane / 2;
    traceCtx.strokeStyle = ["#4df6ff", "#8dff7a", "#ffe45c", "#ff4ea3", "#ff5a53", "#ffffff"][channelIndex % 6];
    traceCtx.lineWidth = 1.2;
    traceCtx.beginPath();
    samples.forEach((sample, index) => {
      const x = (index / Math.max(1, samples.length - 1)) * width;
      const y = yMid - Math.max(-1, Math.min(1, sample / 80)) * lane * 0.42;
      if (index === 0) traceCtx.moveTo(x, y);
      else traceCtx.lineTo(x, y);
    });
    traceCtx.stroke();
    traceCtx.fillStyle = "rgba(244,247,244,0.72)";
    traceCtx.font = "11px ui-sans-serif, system-ui";
    traceCtx.fillText(channel, 8, yMid - lane * 0.25);
  });
}

function renderSignalLab() {
  if (state.frame) markRendered("lab", state.frame);
  const rect = labTrace.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  labTraceCtx.clearRect(0, 0, width, height);
  labTraceCtx.fillStyle = "rgba(255,255,255,0.025)";
  labTraceCtx.fillRect(0, 0, width, height);

  if (!state.frame) return;
  const channel = state.selectedChannel;
  const rawBands = state.frame.features?.[channel] || {};
  const normalizedBands = state.frame.normalized_features?.[channel] || {};
  const samples = state.frame.raw_preview?.[channel] || [];
  const dominant = dominantChannelBand(rawBands);
  const confidence = numberOrZero(state.frame.summary.measurement_confidence || 1);

  labFrameEl.textContent = `${formatFrameId(state.frame)} · ${state.frame.time_s.toFixed(3)}s`;
  labChannelEl.textContent = channel;
  labDominantEl.textContent = dominant;
  labConfidenceEl.textContent = `${Math.round(confidence * 100)}%`;
  labArtifactEl.textContent = state.frame.summary.blink_like_artifact ? "blink-like" : "clean";
  labArtifactEl.style.color = state.frame.summary.blink_like_artifact ? "var(--yellow)" : "var(--green)";

  drawSelectedRawTrace(samples, dominant, width, height);

  [...labBandsEl.querySelectorAll(".lab-band")].forEach((row) => {
    const band = row.dataset.band;
    const raw = rawBands[band] || 0;
    const normalized = normalizedBands[band] || 0;
    row.style.borderColor = band === dominant ? colorWithAlpha(bandColors[band], 0.42) : "rgba(255, 255, 255, 0.08)";
    row.querySelector("strong").textContent = `${formatBandPowerUv2(raw)} µV²`;
    row.querySelector("output").textContent = normalized.toFixed(2);
  });
}

function drawSelectedRawTrace(samples, dominant, width, height) {
  if (!samples.length) return;
  labTraceCtx.strokeStyle = bandColors[dominant] || "#f4f7f4";
  labTraceCtx.lineWidth = 1.3;
  labTraceCtx.beginPath();
  samples.forEach((sample, index) => {
    const x = (index / Math.max(1, samples.length - 1)) * width;
    const y = height * 0.5 - Math.max(-1, Math.min(1, sample / 80)) * height * 0.4;
    if (index === 0) labTraceCtx.moveTo(x, y);
    else labTraceCtx.lineTo(x, y);
  });
  labTraceCtx.stroke();

  labTraceCtx.fillStyle = "rgba(244,247,244,0.54)";
  labTraceCtx.font = "10px ui-sans-serif, system-ui";
  labTraceCtx.fillText(`${state.selectedChannel} raw preview · µV`, 8, 14);
}

function dominantChannelBand(rawBands) {
  return bandNames.reduce((best, band) => (
    (rawBands[band] || 0) > (rawBands[best] || 0) ? band : best
  ), "delta");
}

function drawHeadmap() {
  if (state.frame) markRendered("inset", state.frame);
  const rect = headmap.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  headCtx.clearRect(0, 0, width, height);
  headCtx.fillStyle = "rgba(255,255,255,0.025)";
  headCtx.fillRect(0, 0, width, height);

  const cx = width * 0.52;
  const cy = height * 0.52;
  const rx = width * 0.34;
  const ry = height * 0.36;
  const miniBrain = { cx, cy, rx, ry };

  headCtx.strokeStyle = "rgba(244,247,244,0.42)";
  headCtx.lineWidth = 1.4;
  headCtx.beginPath();
  traceBrainPath(headCtx, miniBrain);
  headCtx.stroke();
  drawBrainstem(headCtx, miniBrain);

  headCtx.fillStyle = "rgba(141,155,159,0.82)";
  headCtx.font = "11px ui-sans-serif, system-ui";
  headCtx.fillText("front", cx - rx * 1.3, cy - ry * 0.24);
  headCtx.fillText("posterior", cx + rx * 0.58, cy - ry * 0.24);

  if (!state.frame?.features) return;
  for (const [channel, point] of Object.entries(electrodeLayout)) {
    const bands = state.frame.normalized_features?.[channel] || state.frame.features[channel];
    if (!bands) continue;
    const dominantBand = state.frame.summary.dominant_rhythm || "alpha";
    const bandPower = bands[dominantBand] || 0;
    const confidence = numberOrZero(state.frame.summary.measurement_confidence || 1);
    const x = width * point.x;
    const y = height * point.y;
    const radius = 3 + Math.min(16, bandPower * 17);

    const glow = headCtx.createRadialGradient(x, y, 2, x, y, radius * 3.4);
    glow.addColorStop(0, colorWithAlpha(bandColors[dominantBand] || bandColors.alpha, (0.18 + bandPower * 0.5) * confidence));
    glow.addColorStop(1, colorWithAlpha(bandColors[dominantBand] || bandColors.alpha, 0));
    headCtx.fillStyle = glow;
    headCtx.beginPath();
    headCtx.arc(x, y, radius * 3.4, 0, Math.PI * 2);
    headCtx.fill();

    headCtx.fillStyle = colorWithAlpha(bandColors[dominantBand] || "#f4f7f4", 0.38 + bandPower * 0.54 * confidence);
    headCtx.beginPath();
    headCtx.arc(x, y, radius, 0, Math.PI * 2);
    headCtx.fill();

    headCtx.fillStyle = "#f4f7f4";
    headCtx.font = "700 11px ui-sans-serif, system-ui";
    headCtx.textAlign = point.x > 0.7 ? "right" : "left";
    headCtx.fillText(channel, point.x > 0.7 ? x - 9 : x + 9, y + 4);
    headCtx.textAlign = "left";
  }
}

function electrodePoint(montageX, montageY, region) {
  const frontY = 0.0848959;
  const backY = -0.112449;
  const maxAbsX = 0.0671179;
  return {
    x: 0.19 + ((frontY - montageY) / (frontY - backY)) * 0.62,
    y: 0.5 + (montageX / maxAbsX) * 0.17,
    region,
  };
}

function animate() {
  if (!state.paused) {
    updateSmoothBands();
    drawField();
    drawTraces();
    renderSignalLab();
    drawHeadmap();
  }
  requestAnimationFrame(animate);
}

animate();
