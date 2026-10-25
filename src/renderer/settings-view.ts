(() => {
// Settings: starting and stopping, inserting, feedback, audio, privacy and local AI.

const triggerStyleEl = mvElement<HTMLSelectElement>('trigger-style');
const autoStopEl = mvElement<HTMLSelectElement>('auto-stop');
const maxRecordingEl = mvElement<HTMLSelectElement>('max-recording');
const triggerShortcutEl = mvElement<HTMLInputElement>('trigger-shortcut');
const saveTriggerShortcutEl = mvElement<HTMLButtonElement>('save-trigger-shortcut');
const clearTriggerShortcutEl = mvElement<HTMLButtonElement>('clear-trigger-shortcut');
const triggerShortcutStatusEl = mvElement<HTMLElement>('trigger-shortcut-status');
const smartSpacingEl = mvElement<HTMLInputElement>('smart-spacing');
const clipboardEl = mvElement<HTMLSelectElement>('clipboard-behavior');
const pasteLastEl = mvElement<HTMLInputElement>('paste-last-shortcut');
const savePasteLastEl = mvElement<HTMLButtonElement>('save-paste-last-shortcut');
const livePreviewEl = mvElement<HTMLInputElement>('live-preview');
const soundsEl = mvElement<HTMLInputElement>('sounds');
const duckingEl = mvElement<HTMLSelectElement>('ducking');
const audioDeviceEl = mvElement<HTMLSelectElement>('audio-device');
const waveformSensitivityEl = mvElement<HTMLSelectElement>('waveform-sensitivity');
const waveformDebugEl = mvElement<HTMLInputElement>('waveform-debug');
const retentionEl = mvElement<HTMLSelectElement>('history-retention');
const clearHistoryEl = mvElement<HTMLButtonElement>('clear-history');
const allowUrlEl = mvElement<HTMLInputElement>('allow-url-control');
const aiEnabledEl = mvElement<HTMLInputElement>('ai-enabled');
const aiEndpointEl = mvElement<HTMLInputElement>('ai-endpoint');
const aiModelEl = mvElement<HTMLInputElement>('ai-model');
const aiInstructionsEl = mvElement<HTMLTextAreaElement>('ai-instructions');
const aiSaveEl = mvElement<HTMLButtonElement>('ai-save');
const aiTestEl = mvElement<HTMLButtonElement>('ai-test');
const aiStatusEl = mvElement<HTMLElement>('ai-status');

function retentionLabel(days: number): string {
  if (days < 0) return 'Forever';
  if (days === 0) return "Don't keep history";
  if (days === 1) return '1 day';
  if (days === 365) return '1 year';
  return `${days} days`;
}

function autoStopLabel(ms: number): string {
  if (ms === 0) return 'Never: stop with fn or Escape';
  const label = `${(ms / 1000).toFixed(1)} seconds`;
  return ms === 3000 ? `${label} (default)` : label;
}

function render(state: MvAppState): void {
  const prefs = state.features.preferences;
  triggerStyleEl.value = prefs.triggerStyle;
  mvFillSelect(autoStopEl, state.autoStopOptionsMs.map((ms) => ({ value: String(ms), label: autoStopLabel(ms) })), String(state.dictation.autoStopPauseMs));
  mvFillSelect(maxRecordingEl, state.features.options.maxRecordingMinutes.map((minutes) => ({ value: String(minutes), label: `${minutes} minutes` })), String(prefs.maxRecordingMinutes));

  if (document.activeElement !== triggerShortcutEl) triggerShortcutEl.value = state.hotkey.triggerShortcut || '';
  triggerShortcutStatusEl.textContent = state.hotkey.error
    ?? (state.hotkey.activeShortcut ? `Active shortcut: ${state.hotkey.activeShortcut}` : 'No extra shortcut. The fn key works as set above.');

  smartSpacingEl.checked = prefs.smartSpacing;
  clipboardEl.value = prefs.clipboard;
  if (document.activeElement !== pasteLastEl) pasteLastEl.value = prefs.pasteLastShortcut;
  livePreviewEl.checked = prefs.livePreview;
  soundsEl.checked = prefs.sounds;
  duckingEl.value = prefs.ducking;

  mvFillSelect(audioDeviceEl, [
    { value: '', label: 'System Default' },
    ...state.audio.availableDevices.map((device) => ({ value: device.uid, label: device.name })),
  ], state.audio.selectedDeviceUID);

  waveformSensitivityEl.value = state.visualization.sensitivity;
  waveformDebugEl.checked = state.visualization.debugOverlay;

  mvFillSelect(retentionEl, state.features.options.retentionDays.map((days) => ({ value: String(days), label: retentionLabel(days) })), String(prefs.historyRetentionDays));
  allowUrlEl.checked = prefs.allowUrlControl;

  aiEnabledEl.checked = prefs.localAi.enabled;
  if (document.activeElement !== aiEndpointEl) aiEndpointEl.value = prefs.localAi.endpoint;
  if (document.activeElement !== aiModelEl) aiModelEl.value = prefs.localAi.model;
  if (document.activeElement !== aiInstructionsEl) aiInstructionsEl.value = prefs.localAi.instructions;
}

const updatePreferences = (patch: Partial<MvPreferences>) => mvRun(mvUpdate('app:preferences-update', patch), 'Saving preferences failed');

triggerStyleEl.addEventListener('change', () => updatePreferences({ triggerStyle: triggerStyleEl.value as MvPreferences['triggerStyle'] }));
autoStopEl.addEventListener('change', () => mvRun(mvUpdate('app:set-auto-stop', Number(autoStopEl.value)), 'Saving auto-stop failed'));
maxRecordingEl.addEventListener('change', () => updatePreferences({ maxRecordingMinutes: Number(maxRecordingEl.value) }));
saveTriggerShortcutEl.addEventListener('click', () => mvRun(mvUpdate('app:set-trigger-shortcut', triggerShortcutEl.value.trim()), 'Saving shortcut failed'));
clearTriggerShortcutEl.addEventListener('click', () => mvRun(mvUpdate('app:set-trigger-shortcut', ''), 'Clearing shortcut failed'));
smartSpacingEl.addEventListener('change', () => updatePreferences({ smartSpacing: smartSpacingEl.checked }));
clipboardEl.addEventListener('change', () => updatePreferences({ clipboard: clipboardEl.value as MvPreferences['clipboard'] }));
savePasteLastEl.addEventListener('click', () => updatePreferences({ pasteLastShortcut: pasteLastEl.value.trim() }));
livePreviewEl.addEventListener('change', () => updatePreferences({ livePreview: livePreviewEl.checked }));
soundsEl.addEventListener('change', () => updatePreferences({ sounds: soundsEl.checked }));
duckingEl.addEventListener('change', () => updatePreferences({ ducking: duckingEl.value as MvPreferences['ducking'] }));
audioDeviceEl.addEventListener('change', () => mvRun(mvUpdate('app:set-audio-device', audioDeviceEl.value), 'Saving microphone failed'));
waveformSensitivityEl.addEventListener('change', () => mvRun(mvUpdate('app:set-waveform-sensitivity', waveformSensitivityEl.value), 'Saving sensitivity failed'));
waveformDebugEl.addEventListener('change', () => mvRun(mvUpdate('app:set-waveform-debug', waveformDebugEl.checked), 'Saving debug overlay failed'));
retentionEl.addEventListener('change', () => updatePreferences({ historyRetentionDays: Number(retentionEl.value) }));
clearHistoryEl.addEventListener('click', () => mvRun(mvUpdate('app:history-clear'), 'Deleting history failed'));
allowUrlEl.addEventListener('change', () => updatePreferences({ allowUrlControl: allowUrlEl.checked }));

function aiPatch(): Partial<MvPreferences> {
  return {
    localAi: {
      enabled: aiEnabledEl.checked,
      endpoint: aiEndpointEl.value.trim(),
      model: aiModelEl.value.trim(),
      instructions: aiInstructionsEl.value.trim(),
      timeoutMs: mvState?.features.preferences.localAi.timeoutMs ?? 8000,
    },
  };
}

aiEnabledEl.addEventListener('change', () => updatePreferences(aiPatch()));
aiSaveEl.addEventListener('click', () => mvRun((async () => {
  await mvUpdate('app:preferences-update', aiPatch());
  const saved = mvState?.features.preferences.localAi.endpoint;
  aiStatusEl.textContent = saved === aiEndpointEl.value.trim() || !aiEndpointEl.value.trim()
    ? 'Saved.'
    : 'Saved. Only addresses on this Mac are allowed, so the default address was kept.';
})(), 'Saving local AI failed'));

aiTestEl.addEventListener('click', () => mvRun((async () => {
  aiStatusEl.textContent = 'Testing…';
  await mvUpdate('app:preferences-update', aiPatch());
  const outcome = await mvInvoke<{ status: string; text: string; reason?: string }>('app:ai-test');
  aiStatusEl.textContent = outcome.status === 'cleaned'
    ? `Working. Sample result: "${outcome.text}"`
    : `Not working: ${outcome.reason ?? 'unknown error'}`;
})(), 'Testing local AI failed'));

mvOnState(render);
})();
