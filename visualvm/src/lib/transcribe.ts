const CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5';
const MODEL = 'onnx-community/whisper-base.en';

/**
 * The worker is built from a string so the heavy runtime is fetched lazily from
 * the CDN instead of being bundled. Nothing but the model weights ever leaves
 * the browser, and audio is never uploaded anywhere.
 */
const WORKER_SOURCE = `
const CDN = '${CDN}';
const MODEL = '${MODEL}';
let pipelinePromise = null;

function getPipeline() {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const mod = await import(CDN);
      mod.env.allowLocalModels = false;
      mod.env.useBrowserCache = true;
      return mod.pipeline('automatic-speech-recognition', MODEL, {
        dtype: 'q8',
        progress_callback: (event) => {
          if (!event) return;
          if (event.status === 'progress' && typeof event.progress === 'number') {
            self.postMessage({
              type: 'progress',
              progress: Math.min(1, event.progress / 100),
              file: event.file || ''
            });
          } else if (event.status === 'initiate' || event.status === 'download') {
            self.postMessage({ type: 'progress', progress: 0, file: event.file || '' });
          }
        }
      });
    })();
    pipelinePromise.catch(() => {
      pipelinePromise = null;
    });
  }
  return pipelinePromise;
}

self.onmessage = async (event) => {
  const data = event.data || {};
  if (data.type !== 'transcribe') return;
  try {
    const asr = await getPipeline();
    self.postMessage({ type: 'stage', stage: 'transcribing' });
    const output = await asr(data.samples, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: 'en',
      task: 'transcribe',
      return_timestamps: false
    });
    const text = Array.isArray(output)
      ? output.map((part) => part.text || '').join(' ')
      : (output && output.text) || '';
    self.postMessage({ type: 'done', text: String(text).replace(/\\s+/g, ' ').trim() });
  } catch (error) {
    self.postMessage({ type: 'error', message: (error && error.message) || String(error) });
  }
};
`;

export type TranscribeEvent = {
  stage: 'download' | 'transcribe';
  progress: number;
  file?: string;
};

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    const blob = new Blob([WORKER_SOURCE], { type: 'text/javascript' });
    worker = new Worker(URL.createObjectURL(blob), { type: 'module' });
  }
  return worker;
}

export function transcribe(
  samples: Float32Array,
  onEvent: (event: TranscribeEvent) => void,
): Promise<string> {
  const instance = getWorker();

  return new Promise<string>((resolve, reject) => {
    const detach = () => {
      instance.removeEventListener('message', handleMessage);
      instance.removeEventListener('error', handleError);
    };

    function handleMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'progress') {
        onEvent({ stage: 'download', progress: Number(data.progress) || 0, file: data.file });
      } else if (data.type === 'stage') {
        onEvent({ stage: 'transcribe', progress: 0 });
      } else if (data.type === 'done') {
        detach();
        resolve(String(data.text ?? ''));
      } else if (data.type === 'error') {
        detach();
        reject(new Error(String(data.message ?? 'Transcription failed')));
      }
    }

    function handleError(event: ErrorEvent) {
      detach();
      // A broken worker cannot be reused; drop it so the next attempt starts clean.
      worker?.terminate();
      worker = null;
      reject(new Error(event.message || 'Transcription worker crashed'));
    }

    instance.addEventListener('message', handleMessage);
    instance.addEventListener('error', handleError);
    instance.postMessage({ type: 'transcribe', samples }, [samples.buffer]);
  });
}
