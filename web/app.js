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
const sourceButtons = [...document.querySelectorAll("[data-source]")];
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

const particles = Array.from({ length: 72 }, (_, index) => ({
  angle: (Math.PI * 2 * index) / 72,
  radius: 42 + (index % 9) * 7,
  trail: [],
  speed: 0.004 + (index % 11) * 0.0008,
  band: ["delta", "theta", "alpha", "beta", "gamma"][index % 5],
}));

const state = {
  frame: null,
  heldFrame: null,
  bands: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  normalized: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
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
let activeSource = "synthetic";

sourceButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeSource = button.dataset.source;
    sourceButtons.forEach((item) => item.classList.toggle("active", item === button));
    connectStream();
  });
});

pauseButton.addEventListener("click", () => {
  state.paused = !state.paused;
  pauseButton.textContent = state.paused ? "Play" : "Pause";
  pauseButton.setAttribute("aria-pressed", String(state.paused));
  if (!state.paused && state.heldFrame) {
    applyFrame(state.heldFrame);
    state.heldFrame = null;
  }
});

function connectStream() {
  if (stream) stream.close();
  stateEl.textContent = "connecting";
  artifactEl.textContent = activeSource === "openneuro" ? "loading real EEG" : "stream warming";
  const params = new URLSearchParams({ source: activeSource, seconds: "24", speed: "1.35" });
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
    artifactEl.textContent = activeSource === "openneuro" ? "real EEG not found" : "stream reconnecting";
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
  const centerX = width * 0.48;
  const centerY = height * 0.55;
  const alpha = state.normalized.alpha || 0.2;
  const theta = state.normalized.theta || 0.2;
  const beta = state.normalized.beta || 0.2;
  const gamma = state.normalized.gamma || 0.2;
  state.phase += 0.012 + beta * 0.018;

  fieldCtx.fillStyle = "rgba(3, 4, 6, 0.18)";
  fieldCtx.fillRect(0, 0, width, height);

  const bloom = 90 + alpha * 210;
  const glow = fieldCtx.createRadialGradient(centerX, centerY, 10, centerX, centerY, bloom);
  glow.addColorStop(0, `rgba(255, 228, 92, ${0.18 + alpha * 0.25})`);
  glow.addColorStop(0.42, `rgba(77, 246, 255, ${0.08 + theta * 0.1})`);
  glow.addColorStop(1, "rgba(3, 4, 6, 0)");
  fieldCtx.fillStyle = glow;
  fieldCtx.beginPath();
  fieldCtx.arc(centerX, centerY, bloom, 0, Math.PI * 2);
  fieldCtx.fill();

  for (const particle of particles) {
    const drive = state.normalized[particle.band] || 0.18;
    particle.angle += particle.speed + drive * 0.026;
    const wobble = Math.sin(state.phase * (1.2 + drive) + particle.radius) * (16 + gamma * 44);
    const radius = particle.radius + alpha * 72 + wobble;
    const x = centerX + Math.cos(particle.angle * 1.7) * radius + Math.sin(state.phase + particle.angle) * 80 * theta;
    const y = centerY + Math.sin(particle.angle * 1.15) * radius * 0.72 + Math.cos(state.phase * 0.7 + particle.angle) * 52 * beta;
    particle.trail.push({ x, y });
    if (particle.trail.length > 44) particle.trail.shift();

    fieldCtx.strokeStyle = bandColors[particle.band];
    fieldCtx.lineWidth = 1 + drive * 2.2;
    fieldCtx.shadowBlur = 20 + drive * 28;
    fieldCtx.shadowColor = bandColors[particle.band];
    fieldCtx.beginPath();
    particle.trail.forEach((point, index) => {
      if (index === 0) fieldCtx.moveTo(point.x, point.y);
      else fieldCtx.lineTo(point.x, point.y);
    });
    fieldCtx.stroke();

    fieldCtx.fillStyle = "#f9fff8";
    fieldCtx.beginPath();
    fieldCtx.arc(x, y, 1.5 + drive * 2.2, 0, Math.PI * 2);
    fieldCtx.fill();
  }
  fieldCtx.shadowBlur = 0;
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

  headCtx.strokeStyle = "rgba(244,247,244,0.42)";
  headCtx.lineWidth = 1.4;
  headCtx.beginPath();
  headCtx.ellipse(cx, cy, rx, ry, -0.08, Math.PI * 0.12, Math.PI * 1.88);
  headCtx.stroke();

  headCtx.beginPath();
  headCtx.moveTo(cx - rx * 1.02, cy - ry * 0.16);
  headCtx.lineTo(cx - rx * 1.2, cy - ry * 0.08);
  headCtx.lineTo(cx - rx * 1.02, cy + ry * 0.02);
  headCtx.stroke();

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
    drawField();
    drawTraces();
    drawHeadmap();
  }
  requestAnimationFrame(animate);
}

animate();
