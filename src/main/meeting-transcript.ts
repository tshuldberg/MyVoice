// Meeting transcripts from two tracks: the microphone ("You") and the Mac's
// own audio ("Others"). Each track is transcribed with timestamps, then the
// segments are interleaved. Without headphones the microphone also hears the
// other people, so microphone segments that repeat what the system track said
// at the same time are dropped. Pure, so merging is unit tested.

export interface TimedSegment {
  /** Milliseconds from the start of the recording. */
  startMs: number;
  endMs: number;
  text: string;
}

export interface SpeakerSegment extends TimedSegment {
  speaker: 'You' | 'Others';
}

/** Reads whisper-cli's --output-json file: transcription[].offsets.{from,to} and text. */
export function parseWhisperJson(body: unknown): TimedSegment[] {
  const items = (body as { transcription?: unknown })?.transcription;
  if (!Array.isArray(items)) return [];
  const segments: TimedSegment[] = [];
  for (const item of items) {
    const offsets = (item as { offsets?: { from?: unknown; to?: unknown } })?.offsets;
    const text = String((item as { text?: unknown })?.text ?? '').trim();
    const startMs = Number(offsets?.from);
    const endMs = Number(offsets?.to);
    if (!text || !Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    // whisper marks silence and noise this way; never a speaker turn.
    if (/^[[(].*[\])]$/.test(text)) continue;
    segments.push({ startMs, endMs: Math.max(endMs, startMs), text });
  }
  return segments;
}

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter((word) => word.length > 1));
}

/** Share of words two segments have in common (Jaccard similarity). */
export function wordOverlap(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return shared / (left.size + right.size - shared);
}

function overlapsInTime(a: TimedSegment, b: TimedSegment, slackMs: number): boolean {
  return a.startMs <= b.endMs + slackMs && b.startMs <= a.endMs + slackMs;
}

/** True when a microphone segment is the speakers' audio picked up again. */
export function isEcho(mine: TimedSegment, theirs: TimedSegment[], threshold = 0.5, slackMs = 1500): boolean {
  return theirs.some((segment) => overlapsInTime(mine, segment, slackMs) && wordOverlap(mine.text, segment.text) >= threshold);
}

export function mergeMeetingSegments(mine: TimedSegment[], theirs: TimedSegment[]): SpeakerSegment[] {
  const merged: SpeakerSegment[] = [
    ...mine.filter((segment) => !isEcho(segment, theirs)).map((segment) => ({ ...segment, speaker: 'You' as const })),
    ...theirs.map((segment) => ({ ...segment, speaker: 'Others' as const })),
  ];
  merged.sort((a, b) => a.startMs - b.startMs || (a.speaker === 'Others' ? -1 : 1));

  // Consecutive segments from the same speaker read as one turn.
  const turns: SpeakerSegment[] = [];
  for (const segment of merged) {
    const last = turns[turns.length - 1];
    if (last && last.speaker === segment.speaker && segment.startMs - last.endMs < 2000) {
      last.text = `${last.text} ${segment.text}`;
      last.endMs = Math.max(last.endMs, segment.endMs);
    } else {
      turns.push({ ...segment });
    }
  }
  return turns;
}

export function formatTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** "[0:05] Others: Hi everyone." one line per turn. */
export function formatMeetingTranscript(turns: SpeakerSegment[]): string {
  return turns.map((turn) => `[${formatTimestamp(turn.startMs)}] ${turn.speaker}: ${turn.text}`).join('\n');
}
