(() => {
const SETUP_CHANNELS = {
  SETUP_PROGRESS: 'setup:progress',
} as const;

type SetupIpcChannel = (typeof SETUP_CHANNELS)[keyof typeof SETUP_CHANNELS];

interface SetupProgressPayload {
  message: string;
  percent: number;
}

interface MyVoiceIpcBridge {
  on: (channel: SetupIpcChannel, listener: (...args: unknown[]) => void) => void;
}

function onIpc(channel: SetupIpcChannel, listener: (...args: unknown[]) => void): void {
  const ipcBridge = (window as any).myvoiceIpc as MyVoiceIpcBridge | undefined;
  if (!ipcBridge) {
    throw new Error('MyVoice IPC bridge is unavailable');
  }
  ipcBridge.on(channel, listener);
}

const statusEl = document.getElementById('status');
const progressEl = document.getElementById('bar') as HTMLProgressElement | null;

if (!statusEl || !progressEl) {
  throw new Error('Setup window is missing required DOM elements');
}

onIpc(
  SETUP_CHANNELS.SETUP_PROGRESS,
  (data: unknown) => {
    const payload = data as SetupProgressPayload | undefined;
    if (!payload) return;
    statusEl.textContent = payload.message;
    if (payload.percent < 0) {
      progressEl.removeAttribute('value');
      return;
    }
    progressEl.value = payload.percent;
  }
);
})();
