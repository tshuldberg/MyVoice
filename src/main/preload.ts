import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from '../shared/types';

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
});
