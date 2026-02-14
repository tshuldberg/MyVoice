const { ipcRenderer } = require('electron');

const SAMPLE_COUNT = 64;
const BAR_WIDTH = 3;
const BAR_GAP = 2;
const MIN_HEIGHT = 3;
const MAX_HEIGHT = 50;
const SMOOTHING_ALPHA = 0.5;

// DOM elements
const overlay = document.getElementById('overlay')!;
const statusEl = document.getElementById('status')!;
const transcriptEl = document.getElementById('transcript')!;
const btnMinimize = document.getElementById('btn-minimize')!;
const btnExpand = document.getElementById('btn-expand')!;
const mainCanvas = document.getElementById('waveform-canvas') as HTMLCanvasElement;
const miniCanvas = document.getElementById('mini-waveform-canvas') as HTMLCanvasElement;

// Ring buffer for audio levels
const ringBuffer = new Float32Array(SAMPLE_COUNT);
let writeIndex = 0;
let bufferFilled = false;

// Animation state
let animFrameId: number | null = null;
let isRecording = false;
let breathPhase = 0;

// ─── Ring Buffer ──────────────────────────────────────────────

function pushLevel(level: number) {
  // EMA smoothing on incoming level
  const prev = ringBuffer[(writeIndex - 1 + SAMPLE_COUNT) % SAMPLE_COUNT];
  const smoothed = prev * (1 - SMOOTHING_ALPHA) + level * SMOOTHING_ALPHA;
  ringBuffer[writeIndex] = smoothed;
  writeIndex = (writeIndex + 1) % SAMPLE_COUNT;
  if (writeIndex === 0) bufferFilled = true;
}

function getSample(i: number): number {
  // Read from oldest to newest
  const start = bufferFilled ? writeIndex : 0;
  const count = bufferFilled ? SAMPLE_COUNT : writeIndex;
  if (i >= count) return 0;
  return ringBuffer[(start + i) % SAMPLE_COUNT];
}

function getSampleCount(): number {
  return bufferFilled ? SAMPLE_COUNT : writeIndex;
}

// ─── Canvas Rendering ─────────────────────────────────────────

function setupCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return { ctx, w: rect.width, h: rect.height };
}

function drawWaveform(
  canvas: HTMLCanvasElement,
  barWidth: number,
  barGap: number,
  minH: number,
  maxH: number,
  dimEdges: boolean
) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  // Resize if needed
  if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const totalBarWidth = barWidth + barGap;
  const maxBars = Math.floor(rect.width / totalBarWidth);
  const count = getSampleCount();
  const barsToRender = Math.min(maxBars, count || 1);

  // Center the bar cluster horizontally
  const totalWidth = barsToRender * totalBarWidth - barGap;
  const startX = (rect.width - totalWidth) / 2;
  const midY = rect.height / 2;

  for (let i = 0; i < barsToRender; i++) {
    const sampleIdx = count > maxBars ? count - maxBars + i : i;
    let level = getSample(sampleIdx);

    // Idle breathing pulse
    if (!isRecording || count === 0) {
      level = 0;
    }

    const barH = Math.max(minH, minH + level * (maxH - minH));
    const x = startX + i * totalBarWidth;
    const y = midY - barH / 2;

    // Slight edge dimming
    let alpha = 0.85;
    if (dimEdges && barsToRender > 4) {
      const norm = i / (barsToRender - 1); // 0..1
      const edgeFade = 1 - Math.pow(2 * norm - 1, 4) * 0.35;
      alpha *= edgeFade;
    }

    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    const radius = Math.min(barWidth / 2, barH / 2);
    ctx.roundRect(x, y, barWidth, barH, radius);
    ctx.fill();
  }

  // Idle breathing: flat dots with gentle pulse
  if (!isRecording || count === 0) {
    ctx.clearRect(0, 0, rect.width, rect.height);
    const idleBars = Math.min(maxBars, SAMPLE_COUNT);
    const idleTotal = idleBars * totalBarWidth - barGap;
    const idleStartX = (rect.width - idleTotal) / 2;

    breathPhase += 0.03;
    for (let i = 0; i < idleBars; i++) {
      const pulse = 1 + 0.4 * Math.sin(breathPhase + i * 0.15);
      const h = minH * pulse;
      const x = idleStartX + i * totalBarWidth;
      const y = midY - h / 2;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      const r = Math.min(barWidth / 2, h / 2);
      ctx.roundRect(x, y, barWidth, h, r);
      ctx.fill();
    }
  }
}

function renderLoop() {
  // Draw expanded canvas (always, even if hidden — cheap and keeps state)
  drawWaveform(mainCanvas, BAR_WIDTH, BAR_GAP, MIN_HEIGHT, MAX_HEIGHT, true);
  // Draw mini canvas with smaller scale
  drawWaveform(miniCanvas, 2, 1.5, 2, 24, false);

  animFrameId = requestAnimationFrame(renderLoop);
}

function startRenderLoop() {
  if (animFrameId !== null) return;
  animFrameId = requestAnimationFrame(renderLoop);
}

function stopRenderLoop() {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

// ─── Minimize / Expand ────────────────────────────────────────

function setOverlayMode(mode: 'expanded' | 'minimized') {
  overlay.classList.add('transitioning');
  overlay.classList.remove('expanded', 'minimized');
  overlay.classList.add(mode);

  const payload = mode === 'expanded'
    ? { width: 620, height: 160, position: 'center' as const }
    : { width: 260, height: 56, position: 'top-left' as const };
  ipcRenderer.send('overlay:set-size', payload);

  // Remove transitioning class after animation completes
  setTimeout(() => overlay.classList.remove('transitioning'), 220);
}

btnMinimize.addEventListener('click', () => setOverlayMode('minimized'));
btnExpand.addEventListener('click', () => setOverlayMode('expanded'));

// ─── IPC Handlers ─────────────────────────────────────────────

ipcRenderer.on('dictation:start', () => {
  overlay.classList.remove('dismissing', 'transitioning');
  overlay.classList.remove('minimized');
  overlay.classList.add('expanded');
  statusEl.textContent = 'Listening...';
  transcriptEl.textContent = '';
  ringBuffer.fill(0);
  writeIndex = 0;
  bufferFilled = false;
  isRecording = true;
  breathPhase = 0;
  startRenderLoop();
});

ipcRenderer.on('dictation:audio-level', (_event: any, level: number) => {
  pushLevel(level);
});

ipcRenderer.on('dictation:partial-text', (_event: any, text: string) => {
  transcriptEl.textContent = text;
  statusEl.textContent = 'Listening...';
});

ipcRenderer.on('dictation:stop', (_event: any, finalText: string) => {
  isRecording = false;
  statusEl.textContent = 'Done';
  transcriptEl.textContent = finalText;
  dismiss();
});

ipcRenderer.on('dictation:cancel', () => {
  isRecording = false;
  statusEl.textContent = 'Cancelled';
  dismiss();
});

ipcRenderer.on('dictation:error', (_event: any, message: string) => {
  isRecording = false;
  statusEl.textContent = `Error: ${message}`;
  setTimeout(dismiss, 1500);
});

// ─── Dismiss ──────────────────────────────────────────────────

function dismiss() {
  overlay.classList.add('dismissing');
  setTimeout(() => {
    stopRenderLoop();
    ipcRenderer.send('overlay:dismissed');
  }, 200);
}
