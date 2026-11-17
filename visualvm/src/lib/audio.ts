const SPEECH_RATE = 16_000;
const PEAK_BARS = 88;

/**
 * Decode any browser-supported container down to 16 kHz mono float samples,
 * which is the input shape Whisper expects.
 */
export async function decodeForSpeech(blob: Blob): Promise<Float32Array> {
  const bytes = await blob.arrayBuffer();
  const context = new OfflineAudioContext(1, 1, SPEECH_RATE);
  const decoded = await context.decodeAudioData(bytes);

  const channels = decoded.numberOfChannels;
  const samples = new Float32Array(decoded.length);
  for (let channel = 0; channel < channels; channel += 1) {
    const data = decoded.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) samples[i] += data[i] / channels;
  }
  return samples;
}

export function computePeaks(samples: Float32Array, bars = PEAK_BARS): number[] {
  if (!samples.length) return [];
  const block = Math.max(1, Math.floor(samples.length / bars));
  const peaks: number[] = [];
  let loudest = 0;

  for (let bar = 0; bar < bars; bar += 1) {
    const start = bar * block;
    const end = Math.min(samples.length, start + block);
    let peak = 0;
    for (let i = start; i < end; i += 1) {
      const value = Math.abs(samples[i]);
      if (value > peak) peak = value;
    }
    if (peak > loudest) loudest = peak;
    peaks.push(peak);
  }

  if (loudest <= 0) return peaks.map(() => 0.08);
  // Square root keeps quiet speech visible without flattening loud passages.
  return peaks.map((peak) => Math.min(1, Math.sqrt(peak / loudest)));
}

export type Analysed = {
  durationMs: number;
  peaks: number[];
};

export async function analyse(blob: Blob): Promise<Analysed> {
  const samples = await decodeForSpeech(blob);
  return {
    durationMs: Math.round((samples.length / SPEECH_RATE) * 1000),
    peaks: computePeaks(samples),
  };
}

export function mimeForName(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  switch (extension) {
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
    case 'mp4':
      return 'audio/mp4';
    case 'aac':
      return 'audio/aac';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
    case 'oga':
      return 'audio/ogg';
    case 'amr':
      return 'audio/amr';
    case '3gp':
      return 'audio/3gpp';
    default:
      return 'application/octet-stream';
  }
}
