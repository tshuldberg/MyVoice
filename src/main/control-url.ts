// myvoice:// links let Shortcuts, Raycast, Alfred or a script control MyVoice.
// They only work after the user turns on "Allow other apps to control MyVoice",
// because any website can open a link. Pure, so parsing is unit tested.

export type ControlAction =
  | { kind: 'start' }
  | { kind: 'stop' }
  | { kind: 'toggle' }
  | { kind: 'cancel' }
  | { kind: 'paste-last' }
  | { kind: 'select-mode'; modeId: string };

export function parseControlUrl(value: string): ControlAction | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'myvoice:') return null;

  // myvoice://start parses with "start" as the host; myvoice:start as the path.
  const parts = [url.hostname, ...url.pathname.split('/')].filter(Boolean).map((part) => part.toLowerCase());
  const [action, argument] = parts;
  switch (action) {
    case 'start':
    case 'stop':
    case 'toggle':
    case 'cancel':
      return parts.length === 1 ? { kind: action } : null;
    case 'paste-last':
      return parts.length === 1 ? { kind: 'paste-last' } : null;
    case 'mode': {
      const modeId = argument ?? url.searchParams.get('id') ?? '';
      return /^[a-z0-9-]{1,64}$/.test(modeId) ? { kind: 'select-mode', modeId } : null;
    }
    default:
      return null;
  }
}
