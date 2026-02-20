import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

const IPC_CHANNELS = {
  DICTATION_START: 'dictation:start',
  DICTATION_STOP: 'dictation:stop',
  DICTATION_CANCEL: 'dictation:cancel',
  DICTATION_AUDIO_LEVEL: 'dictation:audio-level',
  DICTATION_PARTIAL_TEXT: 'dictation:partial-text',
  DICTATION_ERROR: 'dictation:error',
  SETUP_PROGRESS: 'setup:progress',
  WAVEFORM_CONFIG: 'waveform:config',
  OVERLAY_READY: 'overlay:ready',
  OVERLAY_DISMISSED: 'overlay:dismissed',
  OVERLAY_SET_SIZE: 'overlay:set-size',
  APP_GET_STATE: 'app:get-state',
  APP_SET_FORMATTING_MODE: 'app:set-formatting-mode',
  APP_SET_AI_ENHANCEMENT: 'app:set-ai-enhancement',
  APP_SET_AUTO_STOP: 'app:set-auto-stop',
  APP_SET_WAVEFORM_SENSITIVITY: 'app:set-waveform-sensitivity',
  APP_SET_WAVEFORM_DEBUG: 'app:set-waveform-debug',
  APP_SET_TRIGGER_SHORTCUT: 'app:set-trigger-shortcut',
  APP_GET_TODAY_LOG: 'app:get-today-log',
  APP_GET_LOG_BY_DATE: 'app:get-log-by-date',
  APP_LIST_LOG_DATES: 'app:list-log-dates',
  APP_EXPORT_LOG: 'app:export-log',
  APP_LOG_UPDATED: 'app:log-updated',
  APP_NAVIGATE: 'app:navigate',
} as const;

type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
type BridgeListener = (...args: unknown[]) => void;

const sendChannels = new Set<IpcChannel>([
  IPC_CHANNELS.OVERLAY_READY,
  IPC_CHANNELS.OVERLAY_DISMISSED,
  IPC_CHANNELS.OVERLAY_SET_SIZE,
]);

const receiveChannels = new Set<IpcChannel>([
  IPC_CHANNELS.DICTATION_START,
  IPC_CHANNELS.DICTATION_STOP,
  IPC_CHANNELS.DICTATION_CANCEL,
  IPC_CHANNELS.DICTATION_AUDIO_LEVEL,
  IPC_CHANNELS.DICTATION_PARTIAL_TEXT,
  IPC_CHANNELS.DICTATION_ERROR,
  IPC_CHANNELS.SETUP_PROGRESS,
  IPC_CHANNELS.WAVEFORM_CONFIG,
  IPC_CHANNELS.APP_LOG_UPDATED,
  IPC_CHANNELS.APP_NAVIGATE,
]);

const invokeChannels = new Set<IpcChannel>([
  IPC_CHANNELS.APP_GET_STATE,
  IPC_CHANNELS.APP_SET_FORMATTING_MODE,
  IPC_CHANNELS.APP_SET_AI_ENHANCEMENT,
  IPC_CHANNELS.APP_SET_AUTO_STOP,
  IPC_CHANNELS.APP_SET_WAVEFORM_SENSITIVITY,
  IPC_CHANNELS.APP_SET_WAVEFORM_DEBUG,
  IPC_CHANNELS.APP_SET_TRIGGER_SHORTCUT,
  IPC_CHANNELS.APP_GET_TODAY_LOG,
  IPC_CHANNELS.APP_GET_LOG_BY_DATE,
  IPC_CHANNELS.APP_LIST_LOG_DATES,
  IPC_CHANNELS.APP_EXPORT_LOG,
]);

contextBridge.exposeInMainWorld('myvoiceIpc', {
  send(channel: IpcChannel, payload?: unknown): void {
    if (!sendChannels.has(channel)) {
      throw new Error(`Blocked IPC send channel: ${channel}`);
    }
    ipcRenderer.send(channel, payload);
  },
  on(channel: IpcChannel, listener: BridgeListener): void {
    if (!receiveChannels.has(channel)) {
      throw new Error(`Blocked IPC receive channel: ${channel}`);
    }
    ipcRenderer.on(channel, (_event: IpcRendererEvent, ...args: unknown[]) => {
      listener(...args);
    });
  },
  invoke(channel: IpcChannel, payload?: unknown): Promise<unknown> {
    if (!invokeChannels.has(channel)) {
      throw new Error(`Blocked IPC invoke channel: ${channel}`);
    }
    return ipcRenderer.invoke(channel, payload);
  },
});
