const { ipcRenderer } = require('electron');

// DOM elements
const pill = document.getElementById('pill')!;
const bars = Array.from({ length: 10 }, (_, i) => document.getElementById(`bar-${i}`)!);
const statusEl = document.getElementById('status')!;
const transcript = document.getElementById('transcript')!;

// Smooth audio levels (exponential moving average)
let smoothedLevels: number[] = new Array(10).fill(0);
const SMOOTHING = 0.3;

// ─── IPC Handlers ──────────────────────────────────────────────

ipcRenderer.on('dictation:start', () => {
  pill.classList.remove('dismissing');
  pill.classList.add('idle');
  statusEl.textContent = 'Listening...';
  transcript.textContent = '';
  smoothedLevels.fill(0);
});

ipcRenderer.on('dictation:audio-level', (_event: any, level: number) => {
  pill.classList.remove('idle');
  updateWaveform(level);
});

ipcRenderer.on('dictation:partial-text', (_event: any, text: string) => {
  transcript.textContent = text;
  statusEl.textContent = 'Listening...';
});

ipcRenderer.on('dictation:stop', (_event: any, finalText: string) => {
  statusEl.textContent = 'Done';
  transcript.textContent = finalText;
  dismiss();
});

ipcRenderer.on('dictation:cancel', () => {
  statusEl.textContent = 'Cancelled';
  dismiss();
});

ipcRenderer.on('dictation:error', (_event: any, message: string) => {
  statusEl.textContent = `Error: ${message}`;
  setTimeout(dismiss, 1500);
});

// ─── Waveform ──────────────────────────────────────────────────

function updateWaveform(level: number) {
  // Distribute level across bars with some randomness for organic feel
  for (let i = 0; i < bars.length; i++) {
    const variance = 0.5 + Math.random() * 0.5; // 0.5-1.0 random multiplier
    const targetHeight = 4 + level * 24 * variance; // 4px min, 28px max

    smoothedLevels[i] = smoothedLevels[i] * (1 - SMOOTHING) + targetHeight * SMOOTHING;
    bars[i].style.height = `${Math.round(smoothedLevels[i])}px`;
  }
}

// ─── Dismiss ───────────────────────────────────────────────────

function dismiss() {
  pill.classList.add('dismissing');
  // Window will be hidden by main process after animation
  setTimeout(() => {
    ipcRenderer.send('overlay:dismissed');
  }, 200);
}
