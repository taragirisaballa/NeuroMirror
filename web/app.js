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

const bands = ["delta", "theta", "alpha", "beta", "gamma"];
const bandColors = {
  delta: "#4df6ff",
  theta: "#8dff7a",
  alpha: "#ffe45c",
  beta: "#ff4ea3",
  gamma: "#ff5a53",
};

// Pipeline facts from the OpenNeuro ds005385 sidecars and Python replay code:
// original EDF = 1000 Hz, 64 EEG channels, 10-20 cap, FCz reference, no EOG.
// NeuroMirror currently selects Fp1/Fp2/C3/C4/O1/O2, filters 1-45 Hz,
// resamples to 256 Hz, and streams Welch bandpower over 2 s windows every 0.25 s.
// No electrode coordinate file is present in the fetched subset, so these are
// documented 10-20 projections rather than subject-specific digitized locations.
const sagittalAnchors = [
  { id: "frontal", region: "frontal", label: "Fp1/Fp2", channels: ["Fp1", "Fp2"], x: 0.24, y: 0.48 },
  { id: "central", region: "central", label: "C3/C4", channels: ["C3", "C4"], x: 0.52, y: 0.37 },
  { id: "occipital", region: "occipital", label: "O1/O2", channels: ["O1", "O2"], x: 0.79, y: 0.49 },
];

const topDownLayout = {
  Fp1: { x: 0.39, y: 0.18 },
  Fp2: { x: 0.61, y: 0.18 },
  C3: { x: 0.32, y: 0.5 },
  C4: { x: 0.68, y: 0.5 },
  O1: { x: 0.42, y: 0.82 },
  O2: { x: 0.58, y: 0.82 },
};

const traceOffsets = [-0.035, 0, 0.035];
const bandPhase = { delta: 0.5, theta: 1.7, alpha: 2.9, beta: 4.1, gamma: 5.3 };

const state = {
  frame: null,
  heldFrame: null,
  bands: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  normalized: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  channelBands: {},
  renderedChannelBands: {},
  phase: 0,
  paused: false,
};

for (const band of bands) {
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
  state.channelBands = normalizeChannelBands(frame.features);
  if (!Object.keys(state.renderedChannelBands).length) {
    state.renderedChannelBands = cloneChannelBands(state.channelBands);
  }
  updateHud(frame);
}

connectStream();

function averageBands(features) {
  const totals = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };
  const channels = Object.values(features);
  for (const channel of channels) {
    for (const band of Object.keys(totals)) {
      totals[band] += channel[band] || 0;
    }
  }
  for (const band of Object.keys(totals)) {
    totals[band] /= Math.max(1, channels.length);
  }
  return totals;
}

function normalizeBands(values) {
  const logs = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Math.log10(value + 1e-18)]));
  const min = Math.min(...Object.values(logs));
  const max = Math.max(...Object.values(logs));
  return Object.fromEntries(Object.entries(logs).map(([key, value]) => [key, (value - min) / (max - min + 1e-9)]));
}

function normalizeChannelBands(features) {
  const normalized = {};
  for (const band of bands) {
    const logs = Object.fromEntries(
      Object.entries(features).map(([channel, channelBands]) => [channel, Math.log10((channelBands[band] || 0) + 1e-18)]),
    );
    const min = Math.min(...Object.values(logs));
    const max = Math.max(...Object.values(logs));
    for (const [channel, value] of Object.entries(logs)) {
      normalized[channel] = normalized[channel] || {};
      normalized[channel][band] = (value - min) / (max - min + 1e-9);
    }
  }
  return normalized;
}

function cloneChannelBands(channelBands) {
  return Object.fromEntries(
    Object.entries(channelBands).map(([channel, values]) => [channel, { ...values }]),
  );
}

function advanceRenderedBands() {
  const smoothing = 0.16;
  for (const channel of Object.keys(state.channelBands)) {
    state.renderedChannelBands[channel] = state.renderedChannelBands[channel] || {};
    for (const band of bands) {
      const current = state.renderedChannelBands[channel][band] || 0;
      const target = state.channelBands[channel]?.[band] || 0;
      state.renderedChannelBands[channel][band] = current + (target - current) * smoothing;
    }
  }
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

  [...bandsEl.querySelectorAll(".band")].forEach((row) => {
    const band = row.firstElementChild.textContent;
    const value = state.normalized[band] || 0;
    row.querySelector(".bar span").style.width = `${Math.round(value * 100)}%`;
    row.querySelector("output").textContent = `${Math.round(value * 100)}%`;
  });
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
  state.phase += 0.018 + (state.normalized.beta || 0) * 0.01;
  advanceRenderedBands();

  fieldCtx.fillStyle = "rgba(3, 4, 6, 0.22)";
  fieldCtx.fillRect(0, 0, width, height);
  drawBrainSilhouette(fieldCtx, brain);
  drawSagittalBandTraces(fieldCtx, brain);
  drawSagittalAnchors(fieldCtx, brain);
}

function brainBox(width, height) {
  const availableWidth = width * 0.64;
  return {
    cx: width * 0.43,
    cy: height * 0.54,
    rx: Math.min(availableWidth * 0.48, height * 0.43),
    ry: Math.min(width * 0.26, height * 0.28),
  };
}

function drawBrainSilhouette(ctx, brain) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const baseGlow = ctx.createRadialGradient(brain.cx, brain.cy, 10, brain.cx, brain.cy, brain.rx * 1.18);
  baseGlow.addColorStop(0, "rgba(77,246,255,0.08)");
  baseGlow.addColorStop(0.58, "rgba(141,255,122,0.06)");
  baseGlow.addColorStop(1, "rgba(3,4,6,0)");
  ctx.fillStyle = baseGlow;
  ctx.beginPath();
  traceBrainPath(ctx, brain);
  ctx.fill();

  ctx.strokeStyle = "rgba(244, 247, 244, 0.32)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  traceBrainPath(ctx, brain);
  ctx.stroke();
  drawBrainstem(ctx, brain);
  ctx.restore();
}

function drawSagittalBandTraces(ctx, brain) {
  if (!state.frame?.features) return;
  ctx.save();
  ctx.beginPath();
  traceBrainPath(ctx, brain);
  ctx.clip();

  for (const band of bands) {
    const values = sagittalAnchors.map((anchor) => renderedSagittalPower(anchor, band));
    const strongest = Math.max(...values);
    if (strongest < 0.11) continue;

    for (const offset of traceOffsets) {
      const points = sagittalAnchors.map((anchor, index) =>
        tracePointForAnchor(brain, anchor, band, values[index], offset),
      );
      drawBandSegment(ctx, band, points[0], points[1], values[0], values[1], strongest, offset);
      drawBandSegment(ctx, band, points[1], points[2], values[1], values[2], strongest, offset);
    }

    for (const [index, anchor] of sagittalAnchors.entries()) {
      const value = values[index];
      if (value < 0.14) continue;
      const point = sagittalPoint(brain, anchor);
      ctx.fillStyle = colorWithAlpha(bandColors[band], 0.2 + value * 0.58);
      ctx.shadowBlur = 10 + value * 24;
      ctx.shadowColor = bandColors[band];
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2.2 + value * 4.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function anchorBandPowers(anchor) {
  const powers = {};
  for (const band of bands) {
    const values = anchor.channels.map((channel) => state.channelBands[channel]?.[band] || 0);
    powers[band] = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  }
  return powers;
}

function renderedAnchorPower(anchor, band) {
  const values = anchor.channels.map((channel) => state.renderedChannelBands[channel]?.[band] || 0);
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function renderedSagittalPower(anchor, band) {
  const spatial = renderedAnchorPower(anchor, band);
  const globalBand = state.normalized[band] || 0;
  return Math.min(1, globalBand * 0.42 + spatial * 0.58);
}

function sagittalPoint(brain, anchor) {
  return {
    x: brain.cx + (anchor.x - 0.5) * brain.rx * 2,
    y: brain.cy + (anchor.y - 0.5) * brain.ry * 2,
  };
}

function tracePointForAnchor(brain, anchor, band, value, offset) {
  const point = sagittalPoint(brain, anchor);
  const wave = Math.sin(state.phase * bandSpeed(band) + bandPhase[band] + anchor.x * 7 + offset * 20);
  return {
    x: point.x,
    y: point.y + brain.ry * (offset + wave * 0.018 * value),
  };
}

function drawBandSegment(ctx, band, start, end, startValue, endValue, strongest, offset) {
  const segmentPower = (startValue + endValue) / 2;
  if (segmentPower < 0.12 || Math.max(startValue, endValue) < 0.18) return;

  const color = bandColors[band];
  const controlLift = -14 * (segmentPower + strongest) + offset * 48;
  const controlX = (start.x + end.x) / 2;
  const controlY = (start.y + end.y) / 2 + controlLift;
  const width = 0.9 + segmentPower * 4.1;
  const alpha = Math.min(0.86, 0.1 + segmentPower * 0.58);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = colorWithAlpha(color, alpha * 0.32);
  ctx.lineWidth = width + 4.5;
  ctx.shadowBlur = 14 + segmentPower * 22;
  ctx.shadowColor = color;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.quadraticCurveTo(controlX, controlY, end.x, end.y);
  ctx.stroke();

  ctx.strokeStyle = colorWithAlpha(color, alpha);
  ctx.lineWidth = width;
  ctx.shadowBlur = 7 + segmentPower * 14;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.quadraticCurveTo(controlX, controlY, end.x, end.y);
  ctx.stroke();
  ctx.restore();
}

function bandSpeed(band) {
  return { delta: 0.45, theta: 0.7, alpha: 1.05, beta: 1.35, gamma: 1.75 }[band] || 1;
}

function drawSagittalAnchors(ctx, brain) {
  ctx.save();
  ctx.font = "700 11px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  for (const anchor of sagittalAnchors) {
    const point = sagittalPoint(brain, anchor);
    const dominant = dominantAnchorBand(anchor);
    const strength = anchorBandPowers(anchor)[dominant] || 0;
    ctx.shadowBlur = 10 + strength * 18;
    ctx.shadowColor = bandColors[dominant];
    ctx.fillStyle = "#f9fff8";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.2 + strength * 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(244,247,244,0.72)";
    ctx.fillText(anchor.label, point.x, point.y - 13);
  }
  ctx.restore();
}

function dominantAnchorBand(anchor) {
  const powers = anchorBandPowers(anchor);
  return bands.reduce((best, band) => (powers[band] > powers[best] ? band : best), "delta");
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

function colorWithAlpha(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
  drawTopDownScalp(headCtx, width, height);
}

function drawTopDownScalp(ctx, width, height) {
  if (!state.frame?.features) return;
  const cx = width * 0.5;
  const cy = height * 0.53;
  const radius = Math.min(width, height) * 0.36;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalCompositeOperation = "source-over";

  for (const [channel, point] of Object.entries(topDownLayout)) {
    const x = cx + (point.x - 0.5) * radius * 2;
    const y = cy + (point.y - 0.5) * radius * 2;
    for (const band of bands) {
      const value = Math.pow(renderedChannelPower(channel, band), 1.25);
      if (value < 0.1) continue;
      const glowRadius = radius * (0.18 + value * 0.18);
      const glow = ctx.createRadialGradient(x, y, 2, x, y, glowRadius);
      glow.addColorStop(0, colorWithAlpha(bandColors[band], 0.14 * value));
      glow.addColorStop(1, colorWithAlpha(bandColors[band], 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(244,247,244,0.42)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.12, cy - radius * 0.98);
  ctx.lineTo(cx, cy - radius * 1.14);
  ctx.lineTo(cx + radius * 0.12, cy - radius * 0.98);
  ctx.stroke();

  ctx.font = "700 11px ui-sans-serif, system-ui";
  for (const [channel, point] of Object.entries(topDownLayout)) {
    const x = cx + (point.x - 0.5) * radius * 2;
    const y = cy + (point.y - 0.5) * radius * 2;
    const dominant = dominantChannelBand(channel);
    const strength = state.channelBands[channel]?.[dominant] || 0;
    ctx.fillStyle = bandColors[dominant];
    ctx.shadowBlur = 12 + strength * 18;
    ctx.shadowColor = bandColors[dominant];
    ctx.beginPath();
    ctx.arc(x, y, 4 + strength * 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#f4f7f4";
    ctx.fillText(channel, x + 8, y + 4);
  }
}

function dominantChannelBand(channel) {
  return bands.reduce((best, band) => (renderedChannelPower(channel, band) > renderedChannelPower(channel, best) ? band : best), "delta");
}

function renderedChannelPower(channel, band) {
  const spatial = state.channelBands[channel]?.[band] || 0;
  const globalBand = state.normalized[band] || 0;
  return Math.min(1, globalBand * 0.35 + spatial * 0.65);
}

function animate() {
  if (!state.paused) {
    drawField();
    drawTraces();
    drawHeadmap();
  }
  requestAnimationFrame(animate);
}

animate();
