// Runs the sentence-embedding model off the main thread.
// Messages in:  { id, texts: string[] }
// Messages out: { type: 'progress', loaded, total } | { type: 'ready' }
//               | { id, type: 'result', dim, data: Float32Array } | { id, type: 'error', message }

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js';
const MODEL = 'Xenova/all-MiniLM-L6-v2';

let extractorPromise;

function load() {
  extractorPromise ??= import(LIB).then(({ pipeline, env }) => {
    env.allowLocalModels = false;
    const files = {};
    return pipeline('feature-extraction', MODEL, {
      dtype: 'q8',
      progress_callback: (p) => {
        if (p.status !== 'progress' || !p.total) return;
        files[p.file] = p;
        const all = Object.values(files);
        self.postMessage({
          type: 'progress',
          loaded: all.reduce((s, f) => s + f.loaded, 0),
          total: all.reduce((s, f) => s + f.total, 0),
        });
      },
    });
  });
  return extractorPromise;
}

load().then(
  () => self.postMessage({ type: 'ready' }),
  (err) => self.postMessage({ type: 'error', message: String(err?.message || err) })
);

self.onmessage = async ({ data: { id, texts } }) => {
  try {
    const extractor = await load();
    const out = await extractor(texts, { pooling: 'mean', normalize: true });
    const data = new Float32Array(out.data);
    self.postMessage({ id, type: 'result', dim: out.dims[out.dims.length - 1], data }, [data.buffer]);
  } catch (err) {
    self.postMessage({ id, type: 'error', message: String(err?.message || err) });
  }
};
