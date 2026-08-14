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

const brainRegions = {
  frontal: { x: 0.25, y: 0.46, rx: 0.22, ry: 0.22, color: "rgba(77, 246, 255, 0.045)" },
  central: { x: 0.48, y: 0.31, rx: 0.2, ry: 0.18, color: "rgba(141, 255, 122, 0.04)" },
  temporal: { x: 0.44, y: 0.64, rx: 0.2, ry: 0.12, color: "rgba(255, 78, 163, 0.035)" },
  posterior: { x: 0.74, y: 0.42, rx: 0.18, ry: 0.2, color: "rgba(255, 228, 92, 0.04)" },
  occipital: { x: 0.82, y: 0.52, rx: 0.14, ry: 0.18, color: "rgba(255, 90, 83, 0.035)" },
};

const channelRegions = {
  Fp1: "frontal",
  Fp2: "frontal",
  C3: "central",
  C4: "central",
  O1: "occipital",
  O2: "occipital",
};

const channelStreams = ["Fp1", "Fp2", "C3", "C4", "O1", "O2"].flatMap((channel, channelIndex) =>
  ["theta", "alpha", "beta"].map((band, bandIndex) => ({
    channel,
    band,
    phase: channelIndex * 0.8 + bandIndex * 1.7,
    lane: bandIndex - 1,
  })),
);

const particles = Array.from({ length: 108 }, (_, index) => {
  const channels = ["Fp1", "Fp2", "C3", "C4", "O1", "O2"];
  const bands = ["delta", "theta", "alpha", "beta", "gamma"];
  return {
    angle: (Math.PI * 2 * index) / 108,
    radius: 0.08 + (index % 12) * 0.012,
    trail: [],
    speed: 0.006 + (index % 13) * 0.0009,
    band: bands[index % bands.length],
    channel: channels[index % channels.length],
    lane: (index % 5) - 2,
    phase: index * 0.71,
  };
});

const state = {
  frame: null,
  heldFrame: null,
  bands: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  normalized: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  phase: 0,
  paused: false,
};

const electrodeLayout = {
  Fp1: { x: 0.21, y: 0.39, region: "frontal", pairOffset: -1 },
  Fp2: { x: 0.24, y: 0.48, region: "frontal", pairOffset: 1 },
  C3: { x: 0.48, y: 0.23, region: "central", pairOffset: -1 },
  C4: { x: 0.53, y: 0.3, region: "central", pairOffset: 1 },
  O1: { x: 0.78, y: 0.38, region: "posterior", pairOffset: -1 },
  O2: { x: 0.82, y: 0.47, region: "posterior", pairOffset: 1 },
};

for (const band of Object.keys(bandColors)) {
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
  const alpha = state.normalized.alpha || 0.2;
  const theta = state.normalized.theta || 0.2;
  const beta = state.normalized.beta || 0.2;
  state.phase += 0.012 + beta * 0.018;

  fieldCtx.fillStyle = "rgba(3, 4, 6, 0.16)";
  fieldCtx.fillRect(0, 0, width, height);
  drawBrainMesh(fieldCtx, brain, alpha, theta);

  const glow = fieldCtx.createRadialGradient(brain.cx + brain.rx * 0.2, brain.cy - brain.ry * 0.04, 10, brain.cx, brain.cy, brain.rx * 1.18);
  glow.addColorStop(0, `rgba(255, 228, 92, ${0.1 + alpha * 0.18})`);
  glow.addColorStop(0.42, `rgba(77, 246, 255, ${0.08 + theta * 0.1})`);
  glow.addColorStop(1, "rgba(3, 4, 6, 0)");
  fieldCtx.fillStyle = glow;
  fieldCtx.beginPath();
  traceBrainPath(fieldCtx, brain);
  fieldCtx.fill();

  fieldCtx.save();
  fieldCtx.beginPath();
  traceBrainPath(fieldCtx, brain);
  fieldCtx.clip();
  drawChannelTrailField(fieldCtx, brain);
  fieldCtx.restore();
  drawRegionLabels(fieldCtx, brain);
  fieldCtx.shadowBlur = 0;
}

function brainBox(width, height) {
  const availableWidth = width * 0.78;
  return {
    cx: width * 0.5,
    cy: height * 0.53,
    rx: Math.min(availableWidth * 0.5, height * 0.58),
    ry: Math.min(width * 0.32, height * 0.38),
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

  ctx.strokeStyle = `rgba(244, 247, 244, ${0.42 + alpha * 0.12})`;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  traceBrainPath(ctx, brain);
  ctx.stroke();

  drawSagittalLandmarks(ctx, brain, alpha, theta);

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
  ctx.moveTo(x - rx * 0.98, y + ry * 0.12);
  ctx.bezierCurveTo(x - rx * 1.08, y - ry * 0.08, x - rx * 1.02, y - ry * 0.28, x - rx * 0.86, y - ry * 0.44);
  ctx.bezierCurveTo(x - rx * 0.82, y - ry * 0.62, x - rx * 0.64, y - ry * 0.76, x - rx * 0.42, y - ry * 0.79);
  ctx.bezierCurveTo(x - rx * 0.24, y - ry * 0.95, x - rx * 0.03, y - ry * 0.95, x + rx * 0.08, y - ry * 0.9);
  ctx.bezierCurveTo(x + rx * 0.22, y - ry * 1.01, x + rx * 0.42, y - ry * 0.96, x + rx * 0.52, y - ry * 0.84);
  ctx.bezierCurveTo(x + rx * 0.66, y - ry * 0.88, x + rx * 0.82, y - ry * 0.78, x + rx * 0.9, y - ry * 0.63);
  ctx.bezierCurveTo(x + rx * 1.08, y - ry * 0.58, x + rx * 1.14, y - ry * 0.37, x + rx * 1.18, y - ry * 0.18);
  ctx.bezierCurveTo(x + rx * 1.34, y - ry * 0.08, x + rx * 1.3, y + ry * 0.18, x + rx * 1.17, y + ry * 0.3);
  ctx.bezierCurveTo(x + rx * 1.2, y + ry * 0.48, x + rx * 1.06, y + ry * 0.65, x + rx * 0.86, y + ry * 0.66);
  ctx.bezierCurveTo(x + rx * 0.72, y + ry * 0.83, x + rx * 0.46, y + ry * 0.78, x + rx * 0.32, y + ry * 0.65);
  ctx.bezierCurveTo(x + rx * 0.1, y + ry * 0.74, x - rx * 0.16, y + ry * 0.64, x - rx * 0.22, y + ry * 0.48);
  ctx.bezierCurveTo(x - rx * 0.52, y + ry * 0.58, x - rx * 0.84, y + ry * 0.42, x - rx * 0.98, y + ry * 0.12);
  ctx.closePath();
}

function drawSagittalLandmarks(ctx, brain, alpha, theta) {
  const x = brain.cx;
  const y = brain.cy;
  const rx = brain.rx;
  const ry = brain.ry;

  ctx.strokeStyle = "rgba(244,247,244,0.34)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x - rx * 0.66, y - ry * 0.1);
  ctx.bezierCurveTo(x - rx * 0.36, y - ry * 0.48, x + rx * 0.25, y - ry * 0.56, x + rx * 0.68, y - ry * 0.18);
  ctx.bezierCurveTo(x + rx * 0.84, y - ry * 0.02, x + rx * 0.72, y + ry * 0.16, x + rx * 0.54, y + ry * 0.16);
  ctx.bezierCurveTo(x + rx * 0.3, y - ry * 0.12, x - rx * 0.24, y - ry * 0.24, x - rx * 0.66, y - ry * 0.1);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - rx * 0.4, y + ry * 0.06);
  ctx.bezierCurveTo(x - rx * 0.2, y - ry * 0.2, x + rx * 0.25, y - ry * 0.25, x + rx * 0.46, y + ry * 0.02);
  ctx.bezierCurveTo(x + rx * 0.28, y + ry * 0.02, x + rx * 0.02, y + ry * 0.12, x - rx * 0.08, y + ry * 0.28);
  ctx.bezierCurveTo(x - rx * 0.2, y + ry * 0.45, x - rx * 0.34, y + ry * 0.34, x - rx * 0.3, y + ry * 0.14);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + rx * 0.44, y + ry * 0.02);
  ctx.bezierCurveTo(x + rx * 0.58, y + ry * 0.06, x + rx * 0.56, y + ry * 0.22, x + rx * 0.46, y + ry * 0.28);
  ctx.bezierCurveTo(x + rx * 0.66, y + ry * 0.44, x + rx * 0.96, y + ry * 0.36, x + rx * 1.05, y + ry * 0.14);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(x + rx * 0.76, y + ry * 0.43, rx * 0.27, ry * 0.24, -0.08, 0, Math.PI * 2);
  ctx.stroke();

  for (let branch = 0; branch < 7; branch += 1) {
    const angle = -0.95 + branch * 0.32;
    const sx = x + rx * 0.75;
    const sy = y + ry * 0.43;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(angle) * rx * 0.2, sy + Math.sin(angle) * ry * 0.19);
    ctx.stroke();
  }

  ctx.strokeStyle = `rgba(255,228,92,${0.12 + alpha * 0.1})`;
  ctx.lineWidth = 0.9;
  for (let i = 0; i < 24; i += 1) {
    const t = i / 23;
    const sx = x - rx * 0.7 + t * rx * 1.62;
    const sy = y - ry * (0.66 + 0.18 * Math.sin(t * Math.PI * 1.3));
    const ex = x - rx * 0.62 + t * rx * 1.42;
    const ey = y + ry * (0.32 + 0.22 * Math.sin(t * Math.PI * 1.6));
    ctx.strokeStyle = colorWithAlpha(Object.values(bandColors)[i % 5], 0.05 + theta * 0.04);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.bezierCurveTo(x - rx * 0.2 + t * rx * 0.9, y - ry * 0.18, x + rx * 0.2, y + ry * 0.14, ex, ey);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(244,247,244,0.36)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x + rx * 0.05, y + ry * 0.26);
  ctx.bezierCurveTo(x + rx * 0.2, y + ry * 0.44, x + rx * 0.12, y + ry * 0.83, x + rx * 0.22, y + ry * 1.08);
  ctx.lineTo(x + rx * 0.35, y + ry * 1.02);
  ctx.bezierCurveTo(x + rx * 0.28, y + ry * 0.7, x + rx * 0.28, y + ry * 0.44, x + rx * 0.17, y + ry * 0.25);
  ctx.stroke();
}

function drawPhysiologyOverlays(ctx, brain) {
  if (!state.frame?.features) return;
  const posteriorAlpha = averageChannelBand(["O1", "O2"], "alpha");
  const frontalDelta = averageChannelBand(["Fp1", "Fp2"], "delta");
  const blink = state.frame.summary.blink_like_artifact ? numberOrZero(state.frame.summary.artifact_intensity) : 0;
  const alphaGlow = Math.min(1, posteriorAlpha / (posteriorAlpha + 9e-12));
  const blinkGlow = Math.min(1, frontalDelta / (frontalDelta + 8e-10)) * blink;

  const occ = electrodePoint(brain, { x: 0.82, y: 0.46 });
  const alphaGradient = ctx.createRadialGradient(occ.x, occ.y, 8, occ.x, occ.y, brain.rx * 0.46);
  alphaGradient.addColorStop(0, `rgba(255,228,92,${0.1 + alphaGlow * 0.34})`);
  alphaGradient.addColorStop(1, "rgba(255,228,92,0)");
  ctx.fillStyle = alphaGradient;
  ctx.beginPath();
  ctx.arc(occ.x, occ.y, brain.rx * 0.46, 0, Math.PI * 2);
  ctx.fill();

  if (blinkGlow > 0.02) {
    const frontal = electrodePoint(brain, { x: 0.22, y: 0.43 });
    const blinkGradient = ctx.createRadialGradient(frontal.x, frontal.y, 4, frontal.x, frontal.y, brain.rx * 0.34);
    blinkGradient.addColorStop(0, `rgba(255,90,83,${0.24 + blinkGlow * 0.5})`);
    blinkGradient.addColorStop(1, "rgba(255,90,83,0)");
    ctx.fillStyle = blinkGradient;
    ctx.beginPath();
    ctx.arc(frontal.x, frontal.y, brain.rx * 0.34, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawChannelTrailField(ctx, brain) {
  if (!state.frame?.features) return;
  for (const particle of particles) {
    const bandPower = bandChannelShare(particle.channel, particle.band);
    const channelDrive = channelIntensity(particle.channel);
    const blinkBoost = blinkDriveForParticle(particle);
    const drive = Math.min(1, bandPower * 0.72 + channelDrive * 0.28 + blinkBoost);
    particle.angle += particle.speed * (0.7 + bandSpeed(particle.band) * 0.16) + drive * 0.036 + blinkBoost * 0.06;

    const point = channelParticlePoint(brain, particle, drive, blinkBoost);
    particle.trail.push(point);
    const maxTrail = Math.round(22 + drive * 46 + blinkBoost * 28);
    while (particle.trail.length > maxTrail) particle.trail.shift();

    const color = bandColors[particle.band];
    ctx.save();
    ctx.strokeStyle = colorWithAlpha(color, 0.2 + drive * 0.58);
    ctx.lineWidth = 0.7 + drive * 2.8 + blinkBoost * 2.2;
    ctx.shadowBlur = 14 + drive * 34 + blinkBoost * 32;
    ctx.shadowColor = color;
    ctx.setLineDash(particle.band === "beta" || particle.band === "gamma" ? [8, 8] : []);
    ctx.lineDashOffset = -state.phase * (20 + drive * 70);
    ctx.beginPath();
    particle.trail.forEach((trailPoint, index) => {
      if (index === 0) ctx.moveTo(trailPoint.x, trailPoint.y);
      else ctx.lineTo(trailPoint.x, trailPoint.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#f9fff8";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 1.1 + drive * 2.5 + blinkBoost * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  drawElectrodes(ctx, brain);
}

function channelParticlePoint(brain, particle, drive, blinkBoost) {
  const electrode = electrodeLayout[particle.channel];
  const region = brainRegions[channelRegions[particle.channel]];
  const center = regionCenter(brain, region);
  const path = corticalPathForChannel(brain, particle.channel);
  const pathT = (Math.sin(state.phase * (0.72 + drive) + particle.phase) + 1) / 2;
  const pathPoint = pointOnCubic(path, pathT);
  const orbitX = Math.cos(particle.angle * 1.25 + particle.phase) * brain.rx * region.rx * (0.22 + particle.radius + drive * 0.2);
  const orbitY = Math.sin(particle.angle * 1.55) * brain.ry * region.ry * (0.28 + particle.radius + drive * 0.22);
  const bandOffset = particle.lane * brain.ry * 0.012;
  const anchor = electrodePoint(brain, electrode);
  const anchorBias = particle.channel === "Fp1" || particle.channel === "Fp2" ? 0.22 : 0.12;
  const x = center.x * 0.45 + pathPoint.x * 0.43 + anchor.x * anchorBias + orbitX;
  const y = center.y * 0.45 + pathPoint.y * 0.43 + anchor.y * anchorBias + orbitY + bandOffset;

  if (blinkBoost <= 0) return { x, y };
  return {
    x: x * (1 - blinkBoost * 0.38) + (anchor.x - brain.rx * 0.06 + Math.sin(particle.angle) * brain.rx * 0.08) * blinkBoost * 0.38,
    y: y * (1 - blinkBoost * 0.38) + (anchor.y + Math.cos(particle.angle * 1.3) * brain.ry * 0.22) * blinkBoost * 0.38,
  };
}

function bandChannelShare(channel, band) {
  const bands = state.frame?.features?.[channel];
  if (!bands) return 0.1;
  const total = Object.values(bands).reduce((sum, value) => sum + value, 0) || 1e-18;
  return Math.min(1, ((bands[band] || 0) / total) * 4.2);
}

function blinkDriveForParticle(particle) {
  if (!state.frame?.summary?.blink_like_artifact) return 0;
  if (particle.channel !== "Fp1" && particle.channel !== "Fp2") return 0;
  const artifact = numberOrZero(state.frame.summary.artifact_intensity);
  return Math.min(0.9, artifact * (particle.band === "delta" || particle.band === "gamma" ? 0.9 : 0.45));
}

function drawChannelSignals(ctx, brain) {
  if (!state.frame?.features) return;
  for (const streamDef of channelStreams) {
    const bands = state.frame.features[streamDef.channel];
    if (!bands) continue;
    const point = electrodeLayout[streamDef.channel];
    const power = bands[streamDef.band] || 0;
    const total = Object.values(bands).reduce((sum, value) => sum + value, 0) || 1e-18;
    const relative = Math.min(1, power / total * 4.5);
    const absolute = channelIntensity(streamDef.channel);
    const amplitude = Math.max(0.03, relative * 0.8 + absolute * 0.2);
    drawChannelWave(ctx, brain, streamDef, point, amplitude);
  }

  if (state.frame.summary.blink_like_artifact) {
    drawBlinkVector(ctx, brain, numberOrZero(state.frame.summary.artifact_intensity));
  }
  drawElectrodes(ctx, brain);
}

function drawChannelWave(ctx, brain, streamDef, point, amplitude) {
  const anchor = electrodePoint(brain, point);
  const path = corticalPathForChannel(brain, streamDef.channel);
  const color = bandColors[streamDef.band];
  ctx.save();
  ctx.strokeStyle = colorWithAlpha(color, 0.18 + amplitude * 0.48);
  ctx.lineWidth = 0.7 + amplitude * 2.4;
  ctx.shadowBlur = 14 + amplitude * 26;
  ctx.shadowColor = color;
  ctx.beginPath();
  const steps = 54;
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    const base = pointOnCubic(path, t);
    const normal = cubicNormal(path, t);
    const phase = state.phase * bandSpeed(streamDef.band) + streamDef.phase + t * Math.PI * 6;
    const wave = Math.sin(phase) * brain.ry * 0.026 * amplitude;
    const taper = Math.sin(t * Math.PI);
    const x = base.x + normal.x * wave * taper + (anchor.x - base.x) * 0.08;
    const y = base.y + normal.y * wave * taper + streamDef.lane * brain.ry * 0.018;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawBlinkVector(ctx, brain, intensity) {
  const left = electrodePoint(brain, electrodeLayout.Fp1);
  const right = electrodePoint(brain, electrodeLayout.Fp2);
  const color = bandColors.gamma;
  ctx.save();
  ctx.strokeStyle = colorWithAlpha(color, 0.3 + intensity * 0.55);
  ctx.lineWidth = 1.6 + intensity * 3.2;
  ctx.shadowBlur = 26 + intensity * 32;
  ctx.shadowColor = color;
  for (const point of [left, right]) {
    ctx.beginPath();
    ctx.moveTo(point.x - brain.rx * 0.04, point.y - brain.ry * 0.16);
    ctx.bezierCurveTo(point.x - brain.rx * 0.12, point.y - brain.ry * 0.05, point.x - brain.rx * 0.08, point.y + brain.ry * 0.16, point.x + brain.rx * 0.08, point.y + brain.ry * 0.2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawElectrodes(ctx, brain) {
  ctx.save();
  ctx.font = "700 11px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  for (const [channel, point] of Object.entries(electrodeLayout)) {
    const pos = electrodePoint(brain, point);
    const intensity = channelIntensity(channel);
    ctx.fillStyle = "rgba(249,255,248,0.92)";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 2.6 + intensity * 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(244,247,244,0.68)";
    ctx.fillText(channel, pos.x, pos.y - 10);
  }
  ctx.restore();
}

function corticalPathForChannel(brain, channel) {
  const p = electrodeLayout[channel];
  const start = electrodePoint(brain, p);
  if (channel.startsWith("Fp")) {
    return {
      p0: start,
      p1: electrodePoint(brain, { x: 0.22, y: 0.3 }),
      p2: electrodePoint(brain, { x: 0.34, y: 0.24 }),
      p3: electrodePoint(brain, { x: 0.45, y: 0.26 }),
    };
  }
  if (channel.startsWith("C")) {
    return {
      p0: start,
      p1: electrodePoint(brain, { x: 0.45, y: 0.18 }),
      p2: electrodePoint(brain, { x: 0.58, y: 0.22 }),
      p3: electrodePoint(brain, { x: 0.66, y: 0.32 }),
    };
  }
  return {
    p0: start,
    p1: electrodePoint(brain, { x: 0.78, y: 0.28 }),
    p2: electrodePoint(brain, { x: 0.9, y: 0.42 }),
    p3: electrodePoint(brain, { x: 0.76, y: 0.58 }),
  };
}

function pointOnCubic(path, t) {
  const u = 1 - t;
  return {
    x: u ** 3 * path.p0.x + 3 * u ** 2 * t * path.p1.x + 3 * u * t ** 2 * path.p2.x + t ** 3 * path.p3.x,
    y: u ** 3 * path.p0.y + 3 * u ** 2 * t * path.p1.y + 3 * u * t ** 2 * path.p2.y + t ** 3 * path.p3.y,
  };
}

function cubicNormal(path, t) {
  const u = 1 - t;
  const dx =
    3 * u ** 2 * (path.p1.x - path.p0.x) +
    6 * u * t * (path.p2.x - path.p1.x) +
    3 * t ** 2 * (path.p3.x - path.p2.x);
  const dy =
    3 * u ** 2 * (path.p1.y - path.p0.y) +
    6 * u * t * (path.p2.y - path.p1.y) +
    3 * t ** 2 * (path.p3.y - path.p2.y);
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

function electrodePoint(brain, point) {
  return {
    x: brain.cx + (point.x - 0.5) * brain.rx * 2,
    y: brain.cy + (point.y - 0.5) * brain.ry * 2,
  };
}

function regionCenter(brain, region) {
  return {
    x: brain.cx + (region.x - 0.5) * brain.rx * 2,
    y: brain.cy + (region.y - 0.5) * brain.ry * 2,
  };
}

function bandSpeed(band) {
  return { theta: 2.2, alpha: 3.0, beta: 4.6, delta: 1.1, gamma: 5.5 }[band] || 2.8;
}

function averageChannelBand(channels, band) {
  if (!state.frame?.features) return 0;
  const total = channels.reduce((sum, channel) => sum + (state.frame.features[channel]?.[band] || 0), 0);
  return total / Math.max(1, channels.length);
}

function channelIntensity(channel) {
  const bands = state.frame?.features?.[channel];
  if (!bands) return 0.2;
  const total = Object.values(bands).reduce((sum, value) => sum + value, 0) || 1e-18;
  return Math.min(1, total / (total + 4e-11));
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
  drawSagittalLandmarks(headCtx, miniBrain, state.normalized.alpha || 0.1, state.normalized.theta || 0.1);

  headCtx.fillStyle = "rgba(141,155,159,0.82)";
  headCtx.font = "11px ui-sans-serif, system-ui";
  headCtx.fillText("frontal", cx - rx * 1.2, cy - ry * 0.24);
  headCtx.fillText("posterior", cx + rx * 0.56, cy - ry * 0.24);

  if (!state.frame?.features) return;
  for (const [channel, point] of Object.entries(electrodeLayout)) {
    const bands = state.frame.features[channel];
    if (!bands) continue;
    const alpha = bands.alpha || 0;
    const total = Object.values(bands).reduce((sum, value) => sum + value, 0) || 1e-18;
    const alphaShare = alpha / total;
    const position = electrodePoint(miniBrain, point);
    const x = position.x;
    const y = position.y;
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
    drawField();
    drawTraces();
    drawHeadmap();
  }
  requestAnimationFrame(animate);
}

animate();
