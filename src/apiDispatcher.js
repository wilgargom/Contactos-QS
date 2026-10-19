const { Worker } = require('node:worker_threads');
const path = require('node:path');
const config = require('./config');

// Un solo ejecutor de operaciones SQLite; HTTP y los archivos públicos siguen disponibles.
class ApiDispatcher {
  constructor() {
    this.queue = [];
    this.active = null;
    this.bytes = 0;
    this.nextId = 0;
    this.closed = false;
    this.restarts = 0;
    this.started = new Promise(resolve => { this.onReady = resolve; });
    this.start();
  }
  start() {
    this.ready = false;
    const worker = this.worker = new Worker(path.join(__dirname, 'apiWorker.js'), {
      resourceLimits: { maxOldGenerationSizeMb: 192 }
    });
    worker.on('message', result => {
      if (result.ready) { this.ready = true; this.onReady(); this.pump(); return; }
      if (this.active?.id !== result.id) return;
      const item = this.active;
      this.active = null;
      this.bytes -= item.bytes;
      item.resolve(result);
      this.pump();
    });
    worker.on('error', err => { console.error('Ejecutor API:', err.code || err.name); });
    worker.on('exit', () => {
      this.ready = false;
      const pending = [this.active, ...this.queue].filter(Boolean);
      this.active = null; this.queue = []; this.bytes = 0;
      for (const item of pending) {
        clearTimeout(item.timer);
        item.reject(new Error('El servicio se reinició. Consulte el resultado antes de repetir un guardado.'));
      }
      if (!this.closed && ++this.restarts <= 3) this.start();
    });
  }
  run(task, bytes = 0) {
    if (this.closed || this.queue.length >= config.MAX_API_QUEUE || this.bytes + bytes > config.MAX_BUFFERED_BYTES) {
      return Promise.reject(new Error('Hay demasiadas operaciones pendientes. Intente nuevamente en unos segundos.'));
    }
    return new Promise((resolve, reject) => {
      const item = { ...task, id: ++this.nextId, bytes, resolve, reject };
      item.timer = setTimeout(() => {
        const index = this.queue.indexOf(item);
        if (index < 0) return;
        this.queue.splice(index, 1); this.bytes -= bytes;
        reject(new Error('La operación no llegó a ejecutarse. Intente nuevamente en unos segundos.'));
      }, config.MAX_QUEUE_WAIT_MS);
      this.bytes += bytes;
      this.queue.push(item);
      this.pump();
    });
  }
  pump() {
    if (!this.ready || this.active || !this.queue.length) return;
    const item = this.active = this.queue.shift();
    clearTimeout(item.timer);
    const { resolve, reject, timer, bytes, ...task } = item;
    this.worker.postMessage(task);
  }
  async close() { this.closed = true; await this.worker.terminate(); }
}

module.exports = { ApiDispatcher };
