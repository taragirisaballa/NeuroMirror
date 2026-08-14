const field = document.querySelector("#field");
const fieldCtx = field.getContext("2d");
const traces = document.querySelector("#traces");
const traceCtx = traces.getContext("2d");
const headmap = document.querySelector("#headmap");
const headCtx = headmap.getContext("2d");
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

const bandColors = {
  delta: "#4df6ff",
  theta: "#8dff7a",
  alpha: "#ffe45c",
  beta: "#ff4ea3",
  gamma: "#ff5a53",
};
const bandNames = Object.keys(bandColors);

const brainRegions = {
  frontal: { x: 0.36, y: 0.43, rx: 0.23, ry: 0.18, color: "rgba(77, 246, 255, 0.14)" },
  central: { x: 0.54, y: 0.42, rx: 0.2, ry: 0.2, color: "rgba(141, 255, 122, 0.13)" },
  temporal: { x: 0.52, y: 0.59, rx: 0.26, ry: 0.13, color: "rgba(255, 78, 163, 0.12)" },
  posterior: { x: 0.73, y: 0.45, rx: 0.2, ry: 0.19, color: "rgba(255, 228, 92, 0.13)" },
  occipital: { x: 0.79, y: 0.52, rx: 0.14, ry: 0.17, color: "rgba(255, 90, 83, 0.13)" },
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
  { label: "Fp1/Fp2", channels: ["Fp1", "Fp2"], region: "frontal" },
  { label: "C3/C4", channels: ["C3", "C4"], region: "central" },
  { label: "O1/O2", channels: ["O1", "O2"], region: "occipital" },
];

const bandTracePhase = { delta: 0.2, theta: 1.1, alpha: 2.0, beta: 2.9, gamma: 3.8 };

const state = {
  frame: null,
  heldFrame: null,
  bands: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  normalized: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  displayNormalized: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  phase: 0,
  paused: false,
};

const electrodeLayout = {
  Fp1: { x: 0.24, y: 0.38, region: "frontal" },
  Fp2: { x: 0.24, y: 0.55, region: "frontal" },
  C3: { x: 0.52, y: 0.34, region: "central" },
  C4: { x: 0.52, y: 0.58, region: "central" },
  O1: { x: 0.79, y: 0.39, region: "posterior" },
  O2: { x: 0.79, y: 0.55, region: "posterior" },
};

for (const band of bandNames) {
  const row = document.createElement("div");
  row.className = "band";
  row.innerHTML = `<span>${band}</span><div class="bar"><span style="color:${bandColors[band]};background:${bandColors[band]}"></span></div><output>0%</output>`;
  bandsEl.appendChild(row);
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
}

window.addEventListener("resize", resize);
resize();

let stream = null;
pauseButton.addEventListener("click", () => {
  state.paused = !state.paused;
  pauseButton.classList.toggle("is-paused", state.paused);
  pauseButton.setAttribute("aria-label", state.paused ? "Play replay" : "Pause replay");
  pauseButton.setAttribute("aria-pressed", String(state.paused));
  if (!state.paused && state.heldFrame) {
    applyFrame(state.heldFrame);
    state.heldFrame = null;
  }
});

function connectStream() {
  if (stream) stream.close();
  stateEl.textContent = "connecting";
  artifactEl.textContent = "loading real EEG";
  const params = new URLSearchParams({ source: "openneuro", seconds: "24", speed: "1.35" });
  stream = new EventSource(`/api/stream?${params}`);
  stream.onmessage = (event) => {
    const frame = JSON.parse(event.data);
    if (state.paused) {
      state.heldFrame = frame;
      return;
    }
    applyFrame(frame);
  };
  stream.onerror = () => {
    artifactEl.textContent = "real EEG not found";
    artifactEl.style.color = "var(--yellow)";
  };
}

function applyFrame(frame) {
  state.frame = frame;
  state.bands = averageBands(frame.features);
  state.normalized = normalizeBands(state.bands);
  if (!state.displayInitialized) {
    state.displayNormalized = { ...state.normalized };
    state.displayInitialized = true;
  }
  updateHud(frame);
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
  stateEl.textContent = frame.state.replace("_", " ");
  timeEl.textContent = `${frame.time_s.toFixed(3)}s`;
  artifactEl.textContent = frame.summary.blink_like_artifact ? "blink-like artifact" : "signal clean";
  artifactEl.style.color = frame.summary.blink_like_artifact ? "var(--yellow)" : "var(--green)";
  alphaRatioEl.textContent = `${frame.summary.posterior_alpha_ratio.toFixed(2)}x`;
  qualityEl.textContent = Object.values(frame.summary.channel_quality).includes("noisy") ? "review" : "ok";
  dominantEl.textContent = frame.summary.dominant_rhythm || "warming";
  amplitudeEl.textContent = `${numberOrZero(frame.summary.signal_amplitude_uv).toFixed(1)} uV`;
  artifactIntensityEl.textContent = `${Math.round(numberOrZero(frame.summary.artifact_intensity) * 100)}%`;
  spreadEl.textContent = `${Math.round(numberOrZero(frame.summary.spectral_spread) * 100)}%`;
  balanceEl.textContent = signedLabel(numberOrZero(frame.summary.hemispheric_balance), "left", "right");
  asymmetryEl.textContent = signedLabel(numberOrZero(frame.summary.posterior_alpha_asymmetry), "O1", "O2");
}

function updateSmoothBands() {
  if (!state.frame) return;
  const smoothing = 0.34;
  for (const band of bandNames) {
    state.displayNormalized[band] = lerpNumber(state.displayNormalized[band] || 0, state.normalized[band] || 0, smoothing);
  }

  [...bandsEl.querySelectorAll(".band")].forEach((row) => {
    const band = row.firstElementChild.textContent;
    const value = state.displayNormalized[band] || 0;
    row.querySelector(".bar span").style.width = `${Math.round(value * 100)}%`;
    row.querySelector("output").textContent = `${Math.round(value * 100)}%`;
  });
}

function lerpNumber(current, target, amount) {
  return current + (target - current) * amount;
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function signedLabel(value, positive, negative) {
  if (Math.abs(value) < 0.08) return "centered";
  return `${Math.abs(value * 100).toFixed(0)}% ${value > 0 ? positive : negative}`;
}

function drawField() {
  const rect = field.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const brain = brainBox(width, height);
  const alpha = state.normalized.alpha || 0.2;
  const theta = state.normalized.theta || 0.2;
  const beta = state.normalized.beta || 0.2;
  const gamma = state.normalized.gamma || 0.2;
  state.phase += 0.012 + beta * 0.018;

  fieldCtx.fillStyle = "rgba(3, 4, 6, 0.2)";
  fieldCtx.fillRect(0, 0, width, height);
  drawBrainMesh(fieldCtx, brain, alpha, theta);

  const glow = fieldCtx.createRadialGradient(brain.cx, brain.cy, 10, brain.cx, brain.cy, brain.rx * 1.18);
  glow.addColorStop(0, `rgba(255, 228, 92, ${0.1 + alpha * 0.18})`);
  glow.addColorStop(0.42, `rgba(77, 246, 255, ${0.08 + theta * 0.1})`);
  glow.addColorStop(1, "rgba(3, 4, 6, 0)");
  fieldCtx.fillStyle = glow;
  fieldCtx.beginPath();
  traceBrainPath(fieldCtx, brain);
  fieldCtx.fill();

  drawSpectralProfileTraces(fieldCtx, brain);
  drawRegionLabels(fieldCtx, brain);
  drawProjectionAnchors(fieldCtx, brain);
  fieldCtx.shadowBlur = 0;
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
    const glow = ctx.createRadialGradient(x, y, 8, x, y, brain.rx * region.rx * 2.2);
    glow.addColorStop(0, region.color);
    glow.addColorStop(1, "rgba(3,4,6,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(x, y, brain.rx * region.rx * 2.1, brain.ry * region.ry * 2.1, -0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = `rgba(244, 247, 244, ${0.24 + alpha * 0.1})`;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  traceBrainPath(ctx, brain);
  ctx.stroke();

  drawBrainstem(ctx, brain);

  ctx.strokeStyle = "rgba(244,247,244,0.15)";
  ctx.lineWidth = 0.9;
  for (const region of Object.values(brainRegions)) {
    const x = brain.cx + (region.x - 0.5) * brain.rx * 2;
    const y = brain.cy + (region.y - 0.5) * brain.ry * 2;
    ctx.beginPath();
    ctx.ellipse(x, y, brain.rx * region.rx * 1.2, brain.ry * region.ry * 1.2, -0.1, 0, Math.PI * 2);
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
  const bands = state.frame?.features?.[channel];
  if (!bands) return 0.2;
  const total = Object.values(bands).reduce((sum, value) => sum + value, 0) || 1e-18;
  return Math.min(1, total / (total + 4e-11));
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
  if (strongest < 0.08) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = bandColors[band];

  for (let index = 0; index < profile.length - 1; index += 1) {
    drawMeasuredSegment(ctx, band, bandIndex, profile[index], profile[index + 1]);
  }
  for (const entry of profile) {
    drawBandAnchorGlow(ctx, band, entry);
  }
  ctx.restore();
}

function drawMeasuredSegment(ctx, band, bandIndex, start, end) {
  const steps = 22;
  let previous = spectralPointBetween(start.point, end.point, 0, band, bandIndex, start.value, end.value);
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const current = spectralPointBetween(start.point, end.point, t, band, bandIndex, start.value, end.value);
    const value = start.value + (end.value - start.value) * t;
    const inferred = Math.sin(Math.PI * t);
    ctx.strokeStyle = colorWithAlpha(bandColors[band], 0.18 + value * 0.62 - inferred * 0.08);
    ctx.lineWidth = 1.0 + value * 8.5;
    ctx.shadowBlur = 8 + value * 24;
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
    previous = current;
  }
}

function spectralPointBetween(start, end, t, band, bandIndex, startValue, endValue) {
  const x = start.x + (end.x - start.x) * t;
  const y = start.y + (end.y - start.y) * t;
  const localValue = startValue + (endValue - startValue) * t;
  const betweenOnly = Math.sin(Math.PI * t);
  const direction = bandIndex % 2 === 0 ? -1 : 1;
  const baseLift = direction * (bandIndex - 2) * 8 * betweenOnly;
  const oscillation = Math.sin(state.phase * bandMotionRate(band) + t * Math.PI * 3 + bandTracePhase[band]) * betweenOnly;
  return {
    x,
    y: y + baseLift + oscillation * (3 + localValue * 13),
  };
}

function drawBandAnchorGlow(ctx, band, entry) {
  if (entry.value < 0.1) return;
  const { x, y } = entry.point;
  ctx.fillStyle = colorWithAlpha(bandColors[band], 0.16 + entry.value * 0.46);
  ctx.shadowBlur = 8 + entry.value * 20;
  ctx.shadowColor = bandColors[band];
  ctx.beginPath();
  ctx.arc(x, y, 1.4 + entry.value * 4.6, 0, Math.PI * 2);
  ctx.fill();
}

function normalizedAnchorBandPower(anchor, band) {
  const rawValues = projectionAnchors.map((candidate) => rawAnchorBandPower(candidate, band));
  const logValues = rawValues.map((value) => Math.log10(value + 1e-18));
  const min = Math.min(...logValues);
  const max = Math.max(...logValues);
  const anchorLog = Math.log10(rawAnchorBandPower(anchor, band) + 1e-18);
  const spatial = max === min ? 0.62 : (anchorLog - min) / (max - min);
  const globalBand = state.displayNormalized[band] || state.normalized[band] || 0;
  return Math.min(1, 0.11 + globalBand * (0.26 + spatial * 0.63));
}

function rawAnchorBandPower(anchor, band) {
  const values = anchor.channels.map((channel) => state.frame?.features?.[channel]?.[band] || 0);
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function anchorPoint(brain, anchor) {
  const region = brainRegions[anchor.region];
  return {
    x: brain.cx + (region.x - 0.5) * brain.rx * 2,
    y: brain.cy + (region.y - 0.5) * brain.ry * 2,
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
  ctx.fillStyle = "rgba(244,247,244,0.58)";
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
  ctx.font = "700 10px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (const anchor of projectionAnchors) {
    const { x, y } = anchorPoint(brain, anchor);
    const strength = anchor.channels.reduce((sum, channel) => sum + channelIntensity(channel), 0) / anchor.channels.length;
    ctx.shadowBlur = 10 + strength * 18;
    ctx.shadowColor = "rgba(244,247,244,0.9)";
    ctx.fillStyle = "rgba(249,255,248,0.92)";
    ctx.beginPath();
    ctx.arc(x, y, 3.2 + strength * 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(244,247,244,0.66)";
    ctx.fillText(anchor.label, x, y - 10);
  }
  ctx.restore();
}

function drawTraces() {
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

function drawHeadmap() {
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
    const bands = state.frame.features[channel];
    if (!bands) continue;
    const alpha = bands.alpha || 0;
    const total = Object.values(bands).reduce((sum, value) => sum + value, 0) || 1e-18;
    const alphaShare = alpha / total;
    const x = width * point.x;
    const y = height * point.y;
    const radius = 5 + Math.min(16, alphaShare * 34);

    const glow = headCtx.createRadialGradient(x, y, 2, x, y, radius * 3.4);
    glow.addColorStop(0, `rgba(255, 228, 92, ${0.36 + alphaShare * 0.46})`);
    glow.addColorStop(1, "rgba(255, 228, 92, 0)");
    headCtx.fillStyle = glow;
    headCtx.beginPath();
    headCtx.arc(x, y, radius * 3.4, 0, Math.PI * 2);
    headCtx.fill();

    headCtx.fillStyle = bandColors[state.frame.summary.dominant_rhythm] || "#f4f7f4";
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

function animate() {
  if (!state.paused) {
    updateSmoothBands();
    drawField();
    drawTraces();
    drawHeadmap();
  }
  requestAnimationFrame(animate);
}

animate();
