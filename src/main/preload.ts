import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron';

const IPC_CHANNELS = {
  DICTATION_START: 'dictation:start',
  DICTATION_STOP: 'dictation:stop',
  DICTATION_CANCEL: 'dictation:cancel',
  DICTATION_AUDIO_LEVEL: 'dictation:audio-level',
  DICTATION_PARTIAL_TEXT: 'dictation:partial-text',
  DICTATION_ERROR: 'dictation:error',
  DICTATION_CONTEXT: 'dictation:context',
  DICTATION_NOTICE: 'dictation:notice',
  SETUP_PROGRESS: 'setup:progress',
  WAVEFORM_CONFIG: 'waveform:config',
  OVERLAY_READY: 'overlay:ready',
  OVERLAY_DISMISSED: 'overlay:dismissed',
  OVERLAY_SET_SIZE: 'overlay:set-size',
  APP_GET_STATE: 'app:get-state',
  APP_SET_AUTO_STOP: 'app:set-auto-stop',
  APP_SET_WAVEFORM_SENSITIVITY: 'app:set-waveform-sensitivity',
  APP_SET_WAVEFORM_DEBUG: 'app:set-waveform-debug',
  APP_SET_TRIGGER_SHORTCUT: 'app:set-trigger-shortcut',
  APP_SET_AUDIO_DEVICE: 'app:set-audio-device',
  APP_GET_TODAY_LOG: 'app:get-today-log',
  APP_GET_LOG_BY_DATE: 'app:get-log-by-date',
  APP_LIST_LOG_DATES: 'app:list-log-dates',
  APP_EXPORT_LOG: 'app:export-log',
  APP_LOG_UPDATED: 'app:log-updated',
  APP_NAVIGATE: 'app:navigate',
  APP_GET_PERMISSIONS: 'app:get-permissions',
  APP_REQUEST_MICROPHONE: 'app:request-microphone',
  APP_REQUEST_ACCESSIBILITY: 'app:request-accessibility',
  APP_COMPLETE_SETUP: 'app:complete-setup',
  APP_STATE_CHANGED: 'app:state-changed',
  MODES_SELECT: 'app:modes-select',
  MODES_CREATE: 'app:modes-create',
  MODES_UPDATE: 'app:modes-update',
  MODES_DELETE: 'app:modes-delete',
  MODES_ADD_APP: 'app:modes-add-app',
  MODES_REMOVE_APP: 'app:modes-remove-app',
  DICTIONARY_ADD_TERM: 'app:dictionary-add-term',
  DICTIONARY_REMOVE_TERM: 'app:dictionary-remove-term',
  DICTIONARY_UPSERT_RULE: 'app:dictionary-upsert-rule',
  DICTIONARY_REMOVE_RULE: 'app:dictionary-remove-rule',
  DICTIONARY_IMPORT: 'app:dictionary-import',
  DICTIONARY_EXPORT: 'app:dictionary-export',
  MODELS_DOWNLOAD: 'app:models-download',
  MODELS_CANCEL: 'app:models-cancel',
  MODELS_DELETE: 'app:models-delete',
  MODELS_UPDATED: 'app:models-updated',
  PREFERENCES_UPDATE: 'app:preferences-update',
  HISTORY_SEARCH: 'app:history-search',
  HISTORY_DELETE: 'app:history-delete',
  HISTORY_CLEAR: 'app:history-clear',
  HISTORY_REFORMAT: 'app:history-reformat',
  HISTORY_COPY: 'app:history-copy',
  FILE_CHOOSE: 'app:file-choose',
  FILE_TRANSCRIBE: 'app:file-transcribe',
  FILE_CANCEL: 'app:file-cancel',
  FILE_PROGRESS: 'app:file-progress',
  AI_TEST: 'app:ai-test',
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
  IPC_CHANNELS.DICTATION_CONTEXT,
  IPC_CHANNELS.DICTATION_NOTICE,
  IPC_CHANNELS.SETUP_PROGRESS,
  IPC_CHANNELS.WAVEFORM_CONFIG,
  IPC_CHANNELS.APP_LOG_UPDATED,
  IPC_CHANNELS.APP_NAVIGATE,
  IPC_CHANNELS.APP_STATE_CHANGED,
  IPC_CHANNELS.MODELS_UPDATED,
  IPC_CHANNELS.FILE_PROGRESS,
]);

const invokeChannels = new Set<IpcChannel>([
  IPC_CHANNELS.APP_GET_STATE,
  IPC_CHANNELS.APP_SET_AUTO_STOP,
  IPC_CHANNELS.APP_SET_WAVEFORM_SENSITIVITY,
  IPC_CHANNELS.APP_SET_WAVEFORM_DEBUG,
  IPC_CHANNELS.APP_SET_TRIGGER_SHORTCUT,
  IPC_CHANNELS.APP_SET_AUDIO_DEVICE,
  IPC_CHANNELS.APP_GET_TODAY_LOG,
  IPC_CHANNELS.APP_GET_LOG_BY_DATE,
  IPC_CHANNELS.APP_LIST_LOG_DATES,
  IPC_CHANNELS.APP_EXPORT_LOG,
  IPC_CHANNELS.APP_GET_PERMISSIONS,
  IPC_CHANNELS.APP_REQUEST_MICROPHONE,
  IPC_CHANNELS.APP_REQUEST_ACCESSIBILITY,
  IPC_CHANNELS.APP_COMPLETE_SETUP,
  IPC_CHANNELS.MODES_SELECT,
  IPC_CHANNELS.MODES_CREATE,
  IPC_CHANNELS.MODES_UPDATE,
  IPC_CHANNELS.MODES_DELETE,
  IPC_CHANNELS.MODES_ADD_APP,
  IPC_CHANNELS.MODES_REMOVE_APP,
  IPC_CHANNELS.DICTIONARY_ADD_TERM,
  IPC_CHANNELS.DICTIONARY_REMOVE_TERM,
  IPC_CHANNELS.DICTIONARY_UPSERT_RULE,
  IPC_CHANNELS.DICTIONARY_REMOVE_RULE,
  IPC_CHANNELS.DICTIONARY_IMPORT,
  IPC_CHANNELS.DICTIONARY_EXPORT,
  IPC_CHANNELS.MODELS_DOWNLOAD,
  IPC_CHANNELS.MODELS_CANCEL,
  IPC_CHANNELS.MODELS_DELETE,
  IPC_CHANNELS.PREFERENCES_UPDATE,
  IPC_CHANNELS.HISTORY_SEARCH,
  IPC_CHANNELS.HISTORY_DELETE,
  IPC_CHANNELS.HISTORY_CLEAR,
  IPC_CHANNELS.HISTORY_REFORMAT,
  IPC_CHANNELS.HISTORY_COPY,
  IPC_CHANNELS.FILE_CHOOSE,
  IPC_CHANNELS.FILE_TRANSCRIBE,
  IPC_CHANNELS.FILE_CANCEL,
  IPC_CHANNELS.AI_TEST,
]);

// Drag and drop: the renderer cannot see file paths, so the preload resolves them.
contextBridge.exposeInMainWorld('myvoiceFiles', {
  pathForFile(file: File): string {
    return webUtils.getPathForFile(file);
  },
});

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
