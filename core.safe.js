
// SAFE CORE LAYER

window.addEventListener('error', (e) => {
  console.error('🔥 Global Error:', e.message, e.filename, e.lineno);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('🔥 Unhandled Promise Rejection:', e.reason);
});

export const Log = {
  info: (...args) => console.log('ℹ️', ...args),
  warn: (...args) => console.warn('⚠️', ...args),
  error: (...args) => console.error('❌', ...args),
};

export const DEBUG = true;

export function debug(...args) {
  if (DEBUG) console.log('🐞', ...args);
}

export async function safeFetch(fn, label = 'API Call') {
  try {
    const res = await fn();
    if (!res) {
      Log.warn(`${label} returned empty response`);
    }
    return res;
  } catch (err) {
    Log.error(`${label} failed:`, err);
    alert('حصل خطأ، حاول مرة تانية');
    return null;
  }
}

export const State = {
  data: {},
  set(key, value) {
    Log.info(`🧠 State Update: ${key}`, value);
    this.data[key] = value;
  },
  get(key) {
    return this.data[key];
  }
};
