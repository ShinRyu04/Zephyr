// extRunner.ts — SKRIP sandbox ekstensi Zephyr (Web Worker terisolasi).
//
// Dipisah dari extHost.ts supaya bisa diuji tanpa dependensi UI (zustand/
// tauri). Fungsi `skripEkstensi(code)` menghasilkan seluruh isi worker:
// shim CommonJS + API vscode minimal + kode ekstensi + trailer aktivasi.
//
// Kenapa shim CommonJS: bundle ekstensi dari marketplace (Open VSX) adalah
// keluaran esbuild/rollup untuk Node — isinya `module.exports`, `exports`,
// dan `require("vscode")`. Dijalankan mentah di Worker, itu meledak dengan
// "Uncaught ReferenceError: module is not defined". Shim di bawah membuat
// bundle itu bisa DIMUAT; modul sistem (fs/child_process/...) tidak tersedia
// dan melempar error yang jelas kalau benar-benar dipakai.

/**
 * Hasilkan skrip worker untuk satu ekstensi.
 * `code` = isi file `main` ekstensi (teks).
 * `files` = peta relpath -> isi SEMUA file JS/JSON ekstensi (dibaca backend
 *   lewat extensions_read_files) — dipakai untuk require('./file') relatif.
 * `mainRel` = path relatif file main di dalam folder ekstensi (untuk
 *   __filename/__dirname, jadi require('./x') di main menyelesaikan benar).
 */
export function skripEkstensi(
  code: string,
  files: Record<string, string> = {},
  mainRel = 'main.js',
): string {
  const header = `
var __zhFiles = ${JSON.stringify(files)};
var __filename = ${JSON.stringify(mainRel)};
var __dirname = ${JSON.stringify(dirRel(mainRel))};
var require = __zhMakeRequire(__dirname);
`;
  return `${PREAMBLE}${header}
try {
${code}
${TRAILER}`;
}

function dirRel(rel: string): string {
  const i = rel.lastIndexOf('/');
  return i < 0 ? '.' : rel.slice(0, i);
}

const PREAMBLE = `// Sandbox ekstensi Zephyr: Web Worker terisolasi (tanpa window/fs).
// Shim CommonJS + API vscode minimal supaya bundle marketplace bisa dimuat.

var __zh = {};
var zephyr = {
  registerCommand: function (id, title, fn) {
    __zh[String(id)] = fn;
    self.postMessage({ type: 'register', id: String(id), title: String(title || id) });
  },
  // fase 34: jalankan runtime eksternal DENGAN IZIN. Eksekusi terjadi di
  // sisi Rust dari binary yang di-whitelist (settings.extensions.trust);
  // worker cuma dapat stdout/stderr/exit — tidak pernah pegang akses exec
  // langsung. Belum diizinkan? Main thread akan meminta persetujuan user
  // dulu, promise ini menunggu sampai user memutuskan.
  exec: function (runtime, args, opts) {
    return new Promise(function (resolve, reject) {
      var seq = ++__zhExecSeq;
      __zhExecPending[seq] = { resolve: resolve, reject: reject };
      self.postMessage({
        type: 'exec-req',
        seq: seq,
        runtime: String(runtime),
        args: Array.isArray(args) ? args.map(String) : [],
        cwd: opts && opts.cwd ? String(opts.cwd) : null,
        timeoutMs: opts && opts.timeoutMs ? Number(opts.timeoutMs) : 60000,
      });
    });
  },
};
var __zhExecSeq = 0;
var __zhExecPending = {};

// ── Shim CommonJS (tanpa ini: "module is not defined") ──
var module = { exports: {} };
var exports = module.exports;
var global = self;
var process = {
  env: {},
  platform: 'win32',
  arch: 'x64',
  version: 'v20.0.0',
  versions: { node: '20.0.0' },
  cwd: function () { return '/'; },
  nextTick: function (fn) { setTimeout(fn, 0); },
  browser: true,
};

// ── path / os / util: modul node MURNI (tanpa akses sistem) — aman. ──
function __zhNorm(p) {
  var out = [];
  var segs = String(p).split('/');
  for (var i = 0; i < segs.length; i++) {
    var s = segs[i];
    if (!s || s === '.') continue;
    if (s === '..') out.pop();
    else out.push(s);
  }
  return '/' + out.join('/');
}
var path = {
  sep: '/',
  delimiter: ':',
  join: function () {
    var p = [];
    for (var i = 0; i < arguments.length; i++) {
      var a = String(arguments[i]);
      if (a) p.push(a);
    }
    return __zhNorm(p.join('/'));
  },
  resolve: function () {
    var p = [];
    for (var i = 0; i < arguments.length; i++) p.push(String(arguments[i]));
    return __zhNorm('/' + p.join('/').replace(/^\\/+/, ''));
  },
  normalize: __zhNorm,
  basename: function (p, ext) {
    var b = String(p).split('/').pop() || '';
    if (ext && b.length > ext.length && b.slice(-ext.length) === ext) b = b.slice(0, -ext.length);
    return b;
  },
  dirname: function (p) {
    var s = String(p);
    var i = s.lastIndexOf('/');
    return i < 0 ? '.' : i === 0 ? '/' : s.slice(0, i);
  },
  extname: function (p) {
    var b = String(p).split('/').pop() || '';
    var i = b.lastIndexOf('.');
    return i > 0 ? b.slice(i) : '';
  },
  isAbsolute: function (p) {
    var s = String(p);
    return s.charAt(0) === '/' || /^[a-zA-Z]:/.test(s);
  },
  relative: function (from, to) { return String(to); },
  parse: function (p) {
    var s = String(p);
    return { root: '/', dir: path.dirname(s), base: path.basename(s), ext: path.extname(s), name: path.basename(s, path.extname(s)) };
  },
  format: function (o) {
    o = o || {};
    return (o.dir ? o.dir + '/' : '') + (o.base || o.name || '');
  },
  posix: {},
  win32: {},
};
path.posix = path;
path.win32 = path;

var os = {
  platform: function () { return 'win32'; },
  arch: function () { return 'x64'; },
  type: function () { return 'Windows_NT'; },
  release: function () { return '10.0.0'; },
  homedir: function () { return '/'; },
  tmpdir: function () { return '/tmp'; },
  EOL: '\\n',
  endianness: function () { return 'LE'; },
  cpus: function () { return []; },
  totalmem: function () { return 0; },
  freemem: function () { return 0; },
  hostname: function () { return 'zephyr'; },
  userInfo: function () {
    return { username: 'user', uid: 0, gid: 0, shell: null, homedir: '/' };
  },
  networkInterfaces: function () { return {}; },
  // os.constants diisi SETELAH constants didefinisikan (lihat bawah).
};

// constants (node:constants): nilai-nilai murni yang sering dipakai untuk
// flag fs (O_RDONLY, S_IFMT, ...). ms-python.python butuh ini saat load.
var constants = {
  O_RDONLY: 0,
  O_WRONLY: 1,
  O_RDWR: 2,
  O_CREAT: 64,
  O_EXCL: 128,
  O_TRUNC: 512,
  O_APPEND: 1024,
  O_DIRECTORY: 65536,
  O_NOFOLLOW: 131072,
  O_SYNC: 1052672,
  O_DSYNC: 4096,
  O_NONBLOCK: 2048,
  S_IFMT: 61440,
  S_IFREG: 32768,
  S_IFDIR: 16384,
  S_IFLNK: 40960,
  S_IRUSR: 256,
  S_IWUSR: 128,
  S_IXUSR: 64,
  S_IRGRP: 32,
  S_IWGRP: 16,
  S_IXGRP: 8,
  S_IROTH: 4,
  S_IWOTH: 2,
  S_IXOTH: 1,
  UV_FS_SYMLINK_DIR: 1,
  UV_FS_SYMLINK_JUNCTION: 2,
  F_OK: 0,
  R_OK: 4,
  W_OK: 2,
  X_OK: 1,
  PRIORITY_LOW: 19,
  PRIORITY_BELOW_NORMAL: 10,
  PRIORITY_NORMAL: 0,
  PRIORITY_ABOVE_NORMAL: -7,
  PRIORITY_HIGH: -14,
  PRIORITY_HIGHEST: -20,
  SIGINT: 2,
  SIGKILL: 9,
  SIGTERM: 15,
  errno: {
    EPERM: -1, ENOENT: -2, ESRCH: -3, EINTR: -4, EIO: -5, ENXIO: -6, E2BIG: -7,
    ENOEXEC: -8, EBADF: -9, ECHILD: -10, EAGAIN: -11, ENOMEM: -12, EACCES: -13,
    EFAULT: -14, ENOTBLK: -15, EBUSY: -16, EEXIST: -17, EXDEV: -18, ENODEV: -19,
    ENOTDIR: -20, EISDIR: -21, EINVAL: -22, ENFILE: -23, EMFILE: -24, ENOTTY: -25,
    ETXTBSY: -26, EFBIG: -27, ENOSPC: -28, ESPIPE: -29, EROFS: -30, EMLINK: -31,
    EPIPE: -32, EDOM: -33, ERANGE: -34,
  },
  signals: {
    SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGILL: 4, SIGTRAP: 5, SIGABRT: 6,
    SIGBUS: 7, SIGFPE: 8, SIGKILL: 9, SIGUSR1: 10, SIGSEGV: 11, SIGUSR2: 12,
    SIGPIPE: 13, SIGALRM: 14, SIGTERM: 15, SIGCHLD: 17, SIGCONT: 18, SIGSTOP: 19,
    SIGTSTP: 20, SIGTTIN: 21, SIGTTOU: 22, SIGURG: 23, SIGXCPU: 24, SIGXFSZ: 25,
    SIGVTALRM: 26, SIGPROF: 27, SIGWINCH: 28, SIGIO: 29, SIGPWR: 30, SIGSYS: 31,
  },
};
// Struktur Node asli: constants.os.errno / constants.os.signals / constants.fs
// (dipakai ekstensi saat load, mis. ms-python.python).
constants.os = {
  errno: constants.errno,
  signals: constants.signals,
  priority: { PRIORITY_LOW: 19, PRIORITY_BELOW_NORMAL: 10, PRIORITY_NORMAL: 0, PRIORITY_ABOVE_NORMAL: -7, PRIORITY_HIGH: -14, PRIORITY_HIGHEST: -20 },
};
constants.fs = {
  O_RDONLY: 0, O_WRONLY: 1, O_RDWR: 2, O_CREAT: 64, O_EXCL: 128, O_TRUNC: 512,
  O_APPEND: 1024, O_DIRECTORY: 65536, O_NOFOLLOW: 131072, O_SYNC: 1052672,
  O_DSYNC: 4096, O_NONBLOCK: 2048, S_IFMT: 61440, S_IFREG: 32768, S_IFDIR: 16384,
  S_IFLNK: 40960, S_IRUSR: 256, S_IWUSR: 128, S_IXUSR: 64, S_IRGRP: 32,
  S_IWGRP: 16, S_IXGRP: 8, S_IROTH: 4, S_IWOTH: 2, S_IXOTH: 1,
};
constants.priority = constants.os.priority;
os.constants = constants;

var util = {
  format: function (f) {
    var args = Array.prototype.slice.call(arguments, 1);
    var i = 0;
    return String(f).replace(/%[sdjif%]/g, function (m) {
      if (m === '%%') return '%';
      var v = i < args.length ? args[i++] : m;
      if (m === '%j') { try { return JSON.stringify(v); } catch (e) { return String(v); } }
      return String(v);
    });
  },
  inspect: function (v) { return String(v); },
  debuglog: function () { return function () {}; },
  promisify: function (fn) {
    return function () {
      var a = Array.prototype.slice.call(arguments);
      return new Promise(function (res, rej) {
        a.push(function (err, val) { if (err) rej(err); else res(val); });
        try { fn.apply(null, a); } catch (e) { rej(e); }
      });
    };
  },
  inherits: function (c, s) {
    c.prototype = Object.create(s && s.prototype ? s.prototype : null);
    c.prototype.constructor = c;
  },
};

// ── setImmediate/clearImmediate — dipakai ekstensi saat aktivasi (mis.
//    vscjava.vscode-java-dependency). Worker tidak punya builtin ini.
var setImmediate = function (fn) { return setTimeout(fn, 0); };
var clearImmediate = function (id) { clearTimeout(id); };

// ── Buffer (node) — dipakai bundle saat load (mis. meta.pyrefly). ──
// Implementasi NYATA di atas Uint8Array supaya toString/write/subarray dll
// berfungsi, bukan sekadar stub yang meledak.
var Buffer = (function () {
  function toBytes(arg, enc) {
    if (arg instanceof Uint8Array) return arg;
    if (arg instanceof ArrayBuffer) return new Uint8Array(arg);
    if (typeof arg === 'string') {
      if (enc === 'base64') return fromBase64(arg);
      if (enc === 'hex') {
        var h = '';
        for (var i = 0; i < arg.length; i++) {
          var c = arg.charCodeAt(i);
          if (c !== 32 && c !== 9 && c !== 10 && c !== 13) h += arg[i];
        }
        if (h.length % 2) h = '0' + h;
        var u = new Uint8Array(h.length / 2);
        for (var i = 0; i < u.length; i++) u[i] = parseInt(h.substr(i * 2, 2), 16);
        return u;
      }
      return new TextEncoder().encode(arg);
    }
    if (Array.isArray(arg)) return Uint8Array.from(arg);
    return new Uint8Array(0);
  }
  function toBase64(u) {
    var s = '';
    for (var i = 0; i < u.length; i += 8192) {
      s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
    }
    return btoa(s);
  }
  function fromBase64(s) {
    var bin = atob(s);
    var u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  class Buf extends Uint8Array {
    constructor(arg, enc) {
      if (typeof arg === 'number') { super(arg); return; }
      var u = toBytes(arg, enc);
      super(u.length);
      this.set(u);
    }
    static from(arg, enc) { return arg instanceof Buf ? arg : new Buf(arg, enc); }
    static alloc(n, fill) { var b = new Buf(n); if (fill !== undefined) b.fill(fill); return b; }
    static allocUnsafe(n) { return new Buf(n); }
    static allocUnsafeSlow(n) { return new Buf(n); }
    static isBuffer(b) { return b instanceof Buf; }
    static byteLength(s, enc) { return toBytes(s, enc).length; }
    static concat(list) {
      var len = 0;
      for (var i = 0; i < list.length; i++) len += list[i].length;
      var out = new Buf(len);
      var o = 0;
      for (var i = 0; i < list.length; i++) { out.set(list[i], o); o += list[i].length; }
      return out;
    }
    toString(enc, start, end) {
      var u = this.subarray(start || 0, end === undefined ? this.length : end);
      if (enc === 'base64') return toBase64(u);
      if (enc === 'hex') {
        var h = '';
        for (var i = 0; i < u.length; i++) h += (u[i] < 16 ? '0' : '') + u[i].toString(16);
        return h;
      }
      return new TextDecoder().decode(u);
    }
    write(s, offset, len) {
      var u = toBytes(s);
      this.set(u.subarray(0, len === undefined ? u.length : len), offset || 0);
      return u.length;
    }
    toJSON() { return { type: 'Buffer', data: Array.from(this) }; }
    equals(o) {
      if (!o || this.length !== o.length) return false;
      for (var i = 0; i < this.length; i++) if (this[i] !== o[i]) return false;
      return true;
    }
    compare(o) {
      var n = Math.min(this.length, o.length);
      for (var i = 0; i < n; i++) if (this[i] !== o[i]) return this[i] < o[i] ? -1 : 1;
      return this.length === o.length ? 0 : this.length < o.length ? -1 : 1;
    }
    slice(b, e) { return this.subarray(b, e); }
    readUInt32BE(o) { o = o || 0; return (this[o] << 24) + (this[o+1] << 16) + (this[o+2] << 8) + this[o+3]; }
    readUInt32LE(o) { o = o || 0; return (this[o+3] << 24) + (this[o+2] << 16) + (this[o+1] << 8) + this[o]; }
    readUInt16BE(o) { o = o || 0; return (this[o] << 8) + this[o+1]; }
    readUInt16LE(o) { o = o || 0; return (this[o+1] << 8) + this[o]; }
    readUInt8(o) { return this[o || 0]; }
    writeUInt32BE(v, o) { o = o || 0; this[o] = (v >>> 24) & 255; this[o+1] = (v >>> 16) & 255; this[o+2] = (v >>> 8) & 255; this[o+3] = v & 255; return o + 4; }
    writeUInt32LE(v, o) { o = o || 0; this[o+3] = (v >>> 24) & 255; this[o+2] = (v >>> 16) & 255; this[o+1] = (v >>> 8) & 255; this[o] = v & 255; return o + 4; }
    writeUInt16BE(v, o) { o = o || 0; this[o] = (v >>> 8) & 255; this[o+1] = v & 255; return o + 2; }
    writeUInt16LE(v, o) { o = o || 0; this[o+1] = (v >>> 8) & 255; this[o] = v & 255; return o + 2; }
    writeUInt8(v, o) { this[o || 0] = v & 255; return (o || 0) + 1; }
    fill(v, s, e) { super.fill(v, s, e); return this; }
  }
  Buf.fromBase64 = fromBase64;
  return Buf;
})();
var bufferMod = {
  Buffer: Buffer,
  INSPECT_MAX_BYTES: 50,
  kMaxLength: 2147483647,
  constants: { MAX_LENGTH: 2147483647, MAX_STRING_LENGTH: 1073741799 },
};

// ── events (node) — EventEmitter nyata; banyak ekstensi men-subclass-nya. ──
function EventEmitter() { this._events = {}; }
EventEmitter.prototype.on = function (ev, fn) {
  if (!this._events[ev]) this._events[ev] = [];
  this._events[ev].push(fn);
  return this;
};
EventEmitter.prototype.addListener = EventEmitter.prototype.on;
EventEmitter.prototype.prependListener = function (ev, fn) {
  if (!this._events[ev]) this._events[ev] = [];
  this._events[ev].unshift(fn);
  return this;
};
EventEmitter.prototype.once = function (ev, fn) {
  var self = this;
  function wrap() {
    self.removeListener(ev, wrap);
    fn.apply(this, arguments);
  }
  wrap.fn = fn;
  return self.on(ev, wrap);
};
EventEmitter.prototype.emit = function (ev) {
  var args = Array.prototype.slice.call(arguments, 1);
  var ls = (this._events[ev] || []).slice();
  for (var i = 0; i < ls.length; i++) ls[i].apply(this, args);
  return ls.length > 0;
};
EventEmitter.prototype.removeListener = function (ev, fn) {
  if (!this._events[ev]) return this;
  this._events[ev] = this._events[ev].filter(function (f) { return f !== fn && f.fn !== fn; });
  return this;
};
EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
EventEmitter.prototype.removeAllListeners = function (ev) {
  if (ev === undefined) this._events = {};
  else delete this._events[ev];
  return this;
};
EventEmitter.prototype.listeners = function (ev) { return (this._events[ev] || []).slice(); };
EventEmitter.prototype.listenerCount = function (ev) { return (this._events[ev] || []).length; };
EventEmitter.prototype.eventNames = function () { return Object.keys(this._events); };
var eventsMod = {
  EventEmitter: EventEmitter,
  once: function (em, ev) {
    return new Promise(function (resolve) { em.once(ev, resolve); });
  },
};
// Node: process adalah EventEmitter — ekstensi memanggil process.on/dll.
process._events = {};
process.on = EventEmitter.prototype.on;
process.once = EventEmitter.prototype.once;
process.addListener = EventEmitter.prototype.on;
process.removeListener = EventEmitter.prototype.removeListener;
process.off = EventEmitter.prototype.off;
process.removeAllListeners = EventEmitter.prototype.removeAllListeners;
process.emit = EventEmitter.prototype.emit;
process.listeners = EventEmitter.prototype.listeners;
process.listenerCount = EventEmitter.prototype.listenerCount;
process.eventNames = EventEmitter.prototype.eventNames;
process.setMaxListeners = function () { return process; };

// ── stream (node) — minimal: Stream/Readable/Writable/Duplex/Transform. ──
function __zhStream() {
  function Stream() { EventEmitter.call(this); }
  Stream.prototype = Object.create(EventEmitter.prototype);
  Stream.prototype.constructor = Stream;
  function Readable() { Stream.call(this); this.readable = true; this._zhData = []; }
  Readable.prototype = Object.create(Stream.prototype);
  Readable.prototype.constructor = Readable;
  Readable.prototype.push = function (d) { if (d) this._zhData.push(d); return true; };
  Readable.prototype.pipe = function (dest) {
    var self = this;
    this.on('data', function (d) { if (dest.write) dest.write(d); });
    this.on('end', function () { if (dest.end) dest.end(); });
    return dest;
  };
  Readable.prototype.read = function () { return this._zhData.shift() || null; };
  Readable.prototype.resume = function () { return this; };
  Readable.prototype.pause = function () { return this; };
  function Writable() { Stream.call(this); this.writable = true; }
  Writable.prototype = Object.create(Stream.prototype);
  Writable.prototype.constructor = Writable;
  Writable.prototype.write = function () { return true; };
  Writable.prototype.end = function () { this.emit('finish'); return this; };
  function Duplex() { Readable.call(this); Writable.call(this); }
  Duplex.prototype = Object.create(Readable.prototype);
  Duplex.prototype.constructor = Duplex;
  Duplex.prototype.write = Writable.prototype.write;
  Duplex.prototype.end = Writable.prototype.end;
  function Transform() { Duplex.call(this); }
  Transform.prototype = Object.create(Duplex.prototype);
  Transform.prototype.constructor = Transform;
  function PassThrough() { Transform.call(this); }
  PassThrough.prototype = Object.create(Transform.prototype);
  PassThrough.prototype.constructor = PassThrough;
  return {
    Stream: Stream,
    Readable: Readable,
    Writable: Writable,
    Duplex: Duplex,
    Transform: Transform,
    PassThrough: PassThrough,
  };
}

// ── API vscode MINIMAL: command yang didaftarkan masuk ke palette, ──
//    pesan window.* diteruskan ke notifikasi Zephyr, sisanya no-op.
function __zhVscode() {
  function Disposable(fn) { this._fn = fn || null; }
  Disposable.prototype.dispose = function () {
    if (this._fn) { var f = this._fn; this._fn = null; f(); }
  };
  Disposable.from = function () { return new Disposable(null); };

  function Uri() {}
  Uri.parse = function (s) {
    var u = new Uri();
    u.scheme = 'file';
    u.path = String(s);
    u.fsPath = String(s).replace(/^file:\\/\\//, '');
    u.toString = function () { return String(s); };
    return u;
  };
  Uri.file = function (p) {
    var u = new Uri();
    u.scheme = 'file';
    u.path = String(p);
    u.fsPath = String(p);
    u.toString = function () { return 'file:///' + String(p); };
    return u;
  };
  Uri.joinPath = function (base) {
    var parts = [];
    for (var i = 1; i < arguments.length; i++) parts.push(String(arguments[i]));
    return Uri.file([base && base.fsPath, parts.join('/')].filter(Boolean).join('/'));
  };

  function EventEmitter() { this._l = []; }
  EventEmitter.prototype.event = function (l) {
    this._l.push(l);
    var self2 = this;
    return new Disposable(function () {
      var i = self2._l.indexOf(l);
      if (i >= 0) self2._l.splice(i, 1);
    });
  };
  EventEmitter.prototype.fire = function (d) {
    for (var i = 0; i < this._l.length; i++) {
      try { this._l[i](d); } catch (e) {}
    }
  };

  function noopDisposable() { return new Disposable(null); }

  // ── Kelas & enum vscode yang umum dipakai ekstensi ──
  // Banyak ekstensi melakukan class X extends vscode.CompletionItem (atau
  // TreeItem, CodeAction, ...) — tanpa kelas nyata itu crash saat LOAD dengan
  // "Class extends value undefined". Ini fix untuk ms-python.python dkk.
  function Position(line, character) {
    this.line = line;
    this.character = character;
  }
  Position.prototype.with = function (nl, nc) {
    return new Position(nl === undefined ? this.line : nl, nc === undefined ? this.character : nc);
  };
  Position.prototype.isBefore = function (o) { return this.line < o.line || (this.line === o.line && this.character < o.character); };
  Position.prototype.isBeforeOrEqual = function (o) { return this.isBefore(o) || this.isEqual(o); };
  Position.prototype.isAfter = function (o) { return !this.isBeforeOrEqual(o); };
  Position.prototype.isAfterOrEqual = function (o) { return !this.isBefore(o); };
  Position.prototype.isEqual = function (o) { return !!o && this.line === o.line && this.character === o.character; };
  Position.prototype.compareTo = function (o) { return this.isBefore(o) ? -1 : this.isEqual(o) ? 0 : 1; };
  Position.prototype.translate = function (dl, dc) { return new Position(this.line + (dl || 0), this.character + (dc || 0)); };

  function Range(a, b, c, d) {
    if (c === undefined && d === undefined) {
      this.start = a;
      this.end = b;
    } else {
      this.start = new Position(a, b);
      this.end = new Position(c, d);
    }
  }
  Range.prototype.contains = function (p) { return this.start.isBeforeOrEqual(p) && p.isBeforeOrEqual(this.end); };
  Range.prototype.isEqual = function (o) { return !!o && this.start.isEqual(o.start) && this.end.isEqual(o.end); };
  Range.prototype.isEmpty = function () { return this.start.isEqual(this.end); };
  Range.prototype.isSingleLine = function () { return this.start.line === this.end.line; };
  Range.prototype.intersection = function (o) {
    if (o.end.isBefore(this.start) || this.end.isBefore(o.start)) return undefined;
    return new Range(
      this.start.isAfter(o.start) ? this.start : o.start,
      this.end.isBefore(o.end) ? this.end : o.end,
    );
  };
  Range.prototype.union = function (o) {
    return new Range(
      this.start.isBefore(o.start) ? this.start : o.start,
      this.end.isAfter(o.end) ? this.end : o.end,
    );
  };

  function Selection(a, b, c, d) {
    Range.call(this, a, b, c, d);
    if (c === undefined) {
      this.anchor = a;
      this.active = b;
    } else {
      this.anchor = new Position(a, b);
      this.active = new Position(c, d);
    }
  }
  Selection.prototype = Object.create(Range.prototype);
  Selection.prototype.constructor = Selection;

  function Location(uri, range) { this.uri = uri; this.range = range; }
  function Hover(contents, range) { this.contents = contents; this.range = range; }
  function CompletionItem(label, kind) { this.label = label; if (kind !== undefined) this.kind = kind; }
  function CodeAction(title, kind) { this.title = title; if (kind !== undefined) this.kind = kind; }
  function CodeLens(range, command) { this.range = range; if (command !== undefined) this.command = command; }
  function TreeItem(label, collapsibleState) {
    this.label = label;
    if (collapsibleState !== undefined) this.collapsibleState = collapsibleState;
    this.iconPath = undefined;
    this.description = undefined;
    this.tooltip = undefined;
    this.command = undefined;
    this.contextValue = undefined;
    this.resourceUri = undefined;
  }
  function Diagnostic(range, message, severity) {
    this.range = range;
    this.message = message;
    if (severity !== undefined) this.severity = severity;
    this.source = undefined;
    this.code = undefined;
    this.relatedInformation = undefined;
    this.tags = undefined;
  }
  function DocumentHighlight(range, kind) { this.range = range; if (kind !== undefined) this.kind = kind; }
  function SnippetString(value) { this.value = value || ''; }
  SnippetString.prototype.appendText = function (s) { this.value += s; return this; };
  SnippetString.prototype.appendTabstop = function (n) { this.value += n === undefined ? '$0' : '$' + n; return this; };
  SnippetString.prototype.appendPlaceholder = function (n, s) { this.value += '\${' + n + (s !== undefined ? ':' + s : '') + '}'; return this; };
  SnippetString.prototype.appendVariable = function (name, s) { this.value += '\${' + name + (s !== undefined ? ':' + s : '') + '}'; return this; };
  SnippetString.prototype.appendSnippet = function (s) { this.value += s; return this; };

  function MarkdownString(value, supportThemeIcons) {
    this.value = value || '';
    this.isTrusted = false;
    this.supportThemeIcons = !!supportThemeIcons;
    this.supportHtml = false;
  }
  MarkdownString.prototype.appendText = function (s) { this.value += s; return this; };
  MarkdownString.prototype.appendMarkdown = function (s) { this.value += s; return this; };
  MarkdownString.prototype.appendCodeblock = function (code, language) {
    var t = String.fromCharCode(96).repeat(3);
    this.value += t + (language || '') + String.fromCharCode(10) + code + String.fromCharCode(10) + t;
    return this;
  };

  function TextEdit(range, newText) { this.range = range; this.newText = newText; }
  TextEdit.replace = function (range, newText) { return new TextEdit(range, newText); };
  TextEdit.insert = function (position, newText) { return new TextEdit(new Range(position, position), newText); };
  TextEdit.delete = function (range) { return new TextEdit(range, ''); };

  function WorkspaceEdit() { this._entries = []; }
  WorkspaceEdit.prototype.entries = function () { return this._entries.slice(); };
  WorkspaceEdit.prototype.get = function (uri) {
    return this._entries.filter(function (e) { return e.uri === uri; }).map(function (e) { return e.edit; });
  };
  WorkspaceEdit.prototype.set = function (uri, edits) {
    var self = this;
    this._entries = this._entries.filter(function (e) { return e.uri !== uri; });
    (edits || []).forEach(function (ed) { self._entries.push({ uri: uri, edit: ed }); });
  };
  WorkspaceEdit.prototype.replace = function (uri, range, newText) { this.set(uri, [TextEdit.replace(range, newText)]); };
  WorkspaceEdit.prototype.insert = function (uri, position, newText) { this.set(uri, [TextEdit.insert(position, newText)]); };
  WorkspaceEdit.prototype.delete = function (uri, range) { this.set(uri, [TextEdit.delete(range)]); };
  WorkspaceEdit.prototype.has = function (uri) { return this._entries.some(function (e) { return e.uri === uri; }); };

  function ThemeColor(id) { this.id = id; }
  function ThemeIcon(id, color) { this.id = id; if (color !== undefined) this.color = color; }
  function SignatureHelp() { this.signatures = []; this.activeSignature = -1; this.activeParameter = -1; }
  function SignatureInformation(label, documentation) {
    this.label = label;
    if (documentation !== undefined) this.documentation = documentation;
    this.parameters = [];
  }
  function ParameterInformation(label, documentation) { this.label = label; if (documentation !== undefined) this.documentation = documentation; }
  function CompletionList(items, isIncomplete) { this.items = items || []; this.isIncomplete = !!isIncomplete; }
  function SymbolInformation(name, kind, range, uri, containerName) {
    this.name = name;
    this.kind = kind;
    this.location = new Location(uri, range);
    if (containerName !== undefined) this.containerName = containerName;
  }
  function DocumentSymbol(name, detail, kind, range, selectionRange) {
    this.name = name;
    this.detail = detail;
    this.kind = kind;
    this.range = range;
    this.selectionRange = selectionRange;
    this.children = [];
  }
  function InlineCompletionItem(insertText, range) { this.insertText = insertText; if (range !== undefined) this.range = range; }
  function DocumentLink(range, target) { this.range = range; if (target !== undefined) this.target = target; }
  function CallHierarchyItem(name, kind, uri, range, selectionRange) {
    this.name = name;
    this.kind = kind;
    this.uri = uri;
    this.range = range;
    this.selectionRange = selectionRange;
    this.detail = undefined;
    this.tags = undefined;
  }
  function TypeHierarchyItem(name, kind, uri, range, selectionRange) {
    this.name = name;
    this.kind = kind;
    this.uri = uri;
    this.range = range;
    this.selectionRange = selectionRange;
    this.detail = undefined;
  }
  function CancellationError() {
    Error.call(this);
    this.name = 'CancellationError';
    this.message = 'Cancelled';
  }
  CancellationError.prototype = Object.create(Error.prototype);
  CancellationError.prototype.constructor = CancellationError;
  function FileSystemError(message) {
    Error.call(this);
    this.name = 'FileSystemError';
    this.message = message || '';
    this.code = undefined;
  }
  FileSystemError.prototype = Object.create(Error.prototype);
  FileSystemError.prototype.constructor = FileSystemError;
  FileSystemError.FileNotFound = function (m) { return new FileSystemError(m || 'File not found'); };
  FileSystemError.FileExists = function (m) { return new FileSystemError(m || 'File exists'); };
  FileSystemError.FileNotADirectory = function (m) { return new FileSystemError(m || 'Not a directory'); };
  FileSystemError.FileIsADirectory = function (m) { return new FileSystemError(m || 'Is a directory'); };
  FileSystemError.NoPermissions = function (m) { return new FileSystemError(m || 'No permissions'); };
  FileSystemError.Unavailable = function (m) { return new FileSystemError(m || 'Unavailable'); };
  function InlayHint(position, label, kind) {
    this.position = position;
    this.label = label;
    if (kind !== undefined) this.kind = kind;
    this.tooltip = undefined;
    this.textEdits = undefined;
    this.paddingLeft = undefined;
    this.paddingRight = undefined;
  }

  function CodeActionKind(value) { this.value = value; }
  CodeActionKind.Empty = new CodeActionKind('');
  CodeActionKind.QuickFix = new CodeActionKind('quickfix');
  CodeActionKind.Refactor = new CodeActionKind('refactor');
  CodeActionKind.RefactorExtract = new CodeActionKind('refactor.extract');
  CodeActionKind.RefactorInline = new CodeActionKind('refactor.inline');
  CodeActionKind.RefactorMove = new CodeActionKind('refactor.move');
  CodeActionKind.RefactorRewrite = new CodeActionKind('refactor.rewrite');
  CodeActionKind.Source = new CodeActionKind('source');
  CodeActionKind.SourceOrganizeImports = new CodeActionKind('source.organizeImports');
  CodeActionKind.SourceFixAll = new CodeActionKind('source.fixAll');
  CodeActionKind.prototype.append = function (p) { return new CodeActionKind(this.value ? this.value + '.' + p : p); };
  CodeActionKind.prototype.contains = function (o) { return this.value === o.value || (o.value || '').indexOf(this.value + '.') === 0; };
  CodeActionKind.prototype.intersects = function (o) { return this.contains(o) || o.contains(this); };

  var CompletionItemKind = Object.freeze({ Text: 0, Method: 1, Function: 2, Constructor: 3, Field: 4, Variable: 5, Class: 6, Interface: 7, Module: 8, Property: 9, Unit: 10, Value: 11, Enum: 12, Keyword: 13, Snippet: 14, Color: 15, File: 16, Reference: 17, Folder: 18, EnumMember: 19, Constant: 20, Struct: 21, Event: 22, Operator: 23, TypeParameter: 24 });
  var DiagnosticSeverity = Object.freeze({ Error: 0, Warning: 1, Information: 2, Hint: 3 });
  var SymbolKind = Object.freeze({ File: 0, Module: 1, Namespace: 2, Package: 3, Class: 4, Method: 5, Property: 6, Field: 7, Constructor: 8, Enum: 9, Interface: 10, Function: 11, Variable: 12, Constant: 13, String: 14, Number: 15, Boolean: 16, Array: 17, Object: 18, Key: 19, Null: 20, EnumMember: 21, Struct: 22, Event: 23, Operator: 24, TypeParameter: 25 });
  var TreeItemCollapsibleState = Object.freeze({ None: 0, Collapsed: 1, Expanded: 2 });
  var StatusBarAlignment = Object.freeze({ Left: 1, Right: 2 });
  var ProgressLocation = Object.freeze({ SourceControl: 1, Window: 10, Notification: 15 });
  var ViewColumn = Object.freeze({ Active: -1, Beside: -2, One: 1, Two: 2, Three: 3, Four: 4, Five: 5, Six: 6, Seven: 7, Eight: 8, Nine: 9 });
  var EndOfLine = Object.freeze({ LF: 1, CRLF: 2 });
  var FileType = Object.freeze({ Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 });
  var TextEditorRevealType = Object.freeze({ Default: 0, InCenter: 1, InCenterIfOutsideViewport: 2, AtTop: 3 });
  var ConfigurationTarget = Object.freeze({ Global: 1, Workspace: 2, WorkspaceFolder: 3 });
  var OverviewRulerLane = Object.freeze({ Left: 1, Center: 2, Right: 4, Full: 7 });
  var DiagnosticTag = Object.freeze({ Unnecessary: 1, Deprecated: 2 });
  var CompletionItemTag = Object.freeze({ Deprecated: 1 });
  var DocumentHighlightKind = Object.freeze({ Text: 0, Read: 1, Write: 2 });
  var CommentMode = Object.freeze({ Line: 0, Block: 1 });
  var InlayHintKind = Object.freeze({ Type: 1, Parameter: 2 });

  return {
    version: '1.1.7',
    Disposable: Disposable,
    Uri: Uri,
    EventEmitter: EventEmitter,
    // Kelas nyata: tanpa ini class X extends vscode.Y crash saat load.
    CompletionItem: CompletionItem,
    CodeAction: CodeAction,
    CodeLens: CodeLens,
    TreeItem: TreeItem,
    Diagnostic: Diagnostic,
    Position: Position,
    Range: Range,
    Selection: Selection,
    Location: Location,
    Hover: Hover,
    SnippetString: SnippetString,
    MarkdownString: MarkdownString,
    TextEdit: TextEdit,
    WorkspaceEdit: WorkspaceEdit,
    DocumentHighlight: DocumentHighlight,
    ThemeColor: ThemeColor,
    ThemeIcon: ThemeIcon,
    SignatureHelp: SignatureHelp,
    SignatureInformation: SignatureInformation,
    ParameterInformation: ParameterInformation,
    CompletionList: CompletionList,
    SymbolInformation: SymbolInformation,
    DocumentSymbol: DocumentSymbol,
    InlineCompletionItem: InlineCompletionItem,
    DocumentLink: DocumentLink,
    CallHierarchyItem: CallHierarchyItem,
    TypeHierarchyItem: TypeHierarchyItem,
    CancellationError: CancellationError,
    FileSystemError: FileSystemError,
    InlayHint: InlayHint,
    CodeActionKind: CodeActionKind,
    CompletionItemKind: CompletionItemKind,
    DiagnosticSeverity: DiagnosticSeverity,
    SymbolKind: SymbolKind,
    TreeItemCollapsibleState: TreeItemCollapsibleState,
    StatusBarAlignment: StatusBarAlignment,
    ProgressLocation: ProgressLocation,
    ViewColumn: ViewColumn,
    EndOfLine: EndOfLine,
    FileType: FileType,
    TextEditorRevealType: TextEditorRevealType,
    ConfigurationTarget: ConfigurationTarget,
    OverviewRulerLane: OverviewRulerLane,
    DiagnosticTag: DiagnosticTag,
    CompletionItemTag: CompletionItemTag,
    DocumentHighlightKind: DocumentHighlightKind,
    CommentMode: CommentMode,
    InlayHintKind: InlayHintKind,
    commands: {
      registerCommand: function (id, fn) {
        __zh[String(id)] = fn;
        self.postMessage({ type: 'register', id: String(id), title: String(id) });
        return new Disposable(null);
      },
      registerTextEditorCommand: function (id, fn) {
        __zh[String(id)] = fn;
        self.postMessage({ type: 'register', id: String(id), title: String(id) });
        return new Disposable(null);
      },
      executeCommand: function (id) {
        var args = Array.prototype.slice.call(arguments, 1);
        var fn = __zh[String(id)];
        if (!fn) return Promise.resolve(undefined);
        return Promise.resolve(fn.apply(null, args));
      },
      getCommands: function () { return Promise.resolve([]); },
    },
    window: {
      showInformationMessage: function (m) {
        self.postMessage({ type: 'notify', severity: 'info', message: String(m) });
        return Promise.resolve(undefined);
      },
      showWarningMessage: function (m) {
        self.postMessage({ type: 'notify', severity: 'warn', message: String(m) });
        return Promise.resolve(undefined);
      },
      showErrorMessage: function (m) {
        self.postMessage({ type: 'notify', severity: 'error', message: String(m) });
        return Promise.resolve(undefined);
      },
      // OutputChannel tiruan: append/appendLine aman, show/hide no-op.
      createOutputChannel: function (nama) {
        return {
          name: String(nama),
          append: function () {},
          appendLine: function () {},
          clear: function () {},
          show: function () {},
          hide: function () {},
          dispose: function () {},
        };
      },
      showQuickPick: function () { return Promise.resolve(undefined); },
      showInputBox: function () { return Promise.resolve(undefined); },
      showWorkspaceFolderPick: function () { return Promise.resolve(undefined); },
      createTextEditorDecorationType: function () {
        return { key: String(Math.random()), dispose: function () {} };
      },
      setStatusBarMessage: noopDisposable,
      createStatusBarItem: function () {
        return { text: '', command: '', show: function () {}, hide: function () {}, dispose: function () {} };
      },
      withProgress: function () { return Promise.resolve(undefined); },
      activeTextEditor: undefined,
      visibleTextEditors: [],
      onDidChangeActiveTextEditor: noopDisposable,
      onDidChangeVisibleTextEditors: noopDisposable,
      onDidChangeTextEditorSelection: noopDisposable,
    },
    workspace: {
      workspaceFolders: [],
      getConfiguration: function () {
        return {
          get: function () { return undefined; },
          has: function () { return false; },
          update: function () { return Promise.resolve(undefined); },
        };
      },
      onDidChangeConfiguration: noopDisposable,
      getWorkspaceFolder: function () { return undefined; },
      openTextDocument: function () {
        return Promise.resolve({
          uri: Uri.file('/'),
          getText: function () { return ''; },
          lineAt: function () { return { text: '' }; },
          positionAt: function () { return { line: 0, character: 0 }; },
          lineCount: 0,
        });
      },
      applyEdit: function () { return Promise.resolve(true); },
      findFiles: function () { return Promise.resolve([]); },
      onDidOpenTextDocument: noopDisposable,
      onDidCloseTextDocument: noopDisposable,
      onDidSaveTextDocument: noopDisposable,
      onDidChangeWorkspaceFolders: noopDisposable,
      fs: __zhUnavailable('vscode.workspace.fs'),
    },
    languages: {
      registerHoverProvider: noopDisposable,
      registerCompletionItemProvider: noopDisposable,
      registerDefinitionProvider: noopDisposable,
      registerReferencesProvider: noopDisposable,
      registerDocumentFormattingEditProvider: noopDisposable,
      registerDocumentRangeFormattingEditProvider: noopDisposable,
      registerCodeActionsProvider: noopDisposable,
      registerDocumentSymbolProvider: noopDisposable,
      registerWorkspaceSymbolProvider: noopDisposable,
      registerSignatureHelpProvider: noopDisposable,
      registerInlayHintsProvider: noopDisposable,
      registerCodeLensProvider: noopDisposable,
      registerColorProvider: noopDisposable,
      registerFoldingRangeProvider: noopDisposable,
      registerSelectionRangeProvider: noopDisposable,
      registerOnTypeFormattingEditProvider: noopDisposable,
      registerDocumentLinkProvider: noopDisposable,
      registerTypeDefinitionProvider: noopDisposable,
      registerImplementationProvider: noopDisposable,
      registerRenameProvider: noopDisposable,
      registerDocumentHighlightProvider: noopDisposable,
      registerFileDefinitionProvider: noopDisposable,
      registerInlineCompletionItemProvider: noopDisposable,
      registerFileOperations: noopDisposable,
      getLanguages: function () { return Promise.resolve([]); },
      createDiagnosticCollection: function () {
        return { set: function () {}, clear: function () {}, dispose: function () {} };
      },
    },
    l10n: {
      t: function (msg) {
        // t(msg) / t(msg, args) / t(msg, count) — ganti {placeholder} sekali
        // jalan (single pass, aman walau nilai berisi kurung kurawal).
        var args = Array.prototype.slice.call(arguments, 1);
        var s = String(msg);
        var count = args.length === 1 && typeof args[0] === 'number';
        var a = !count && args[0] && typeof args[0] === 'object' ? args[0] : {};
        var out = '';
        var i = 0;
        while (i < s.length) {
          if (s.charAt(i) === '{') {
            var j = s.indexOf('}', i + 1);
            if (j < 0) { out += s.slice(i); break; }
            var key = s.slice(i + 1, j);
            var val;
            if (count) val = String(args[0]);
            else if (Object.prototype.hasOwnProperty.call(a, key)) val = String(a[key]);
            else val = s.slice(i, j + 1);
            out += val;
            i = j + 1;
          } else {
            out += s.charAt(i);
            i++;
          }
        }
        return out;
      },
      bundle: undefined,
    },
    env: {
      language: 'id',
      appName: 'Zephyr',
      appRoot: '/',
      machineId: '',
      sessionId: '',
      remoteName: undefined,
      uiKind: 1,
      clipboard: {
        readText: function () { return Promise.resolve(''); },
        writeText: function () { return Promise.resolve(); },
      },
      openExternal: function () { return Promise.resolve(true); },
      asExternalUri: function () { return Promise.resolve(Uri.file('/')); },
      shell: undefined,
    },
  };
}
var vscode = __zhVscode();

// ── fs: objek NYATA (bukan Proxy) dengan API standar lengkap. ──
// Setiap fungsi melempar error JELAS kalau DIPANGGIL. Ini penting:
// graceful-fs/fs-extra MENG-KLONE objek fs (Object.getOwnPropertyNames +
// Object.assign) dan mengintip fs.realpath.native saat load. Kalau fs berupa
// Proxy target kosong, klon-nya tidak punya realpath → error membingungkan
// "Cannot read properties of undefined (reading 'native')" (persis kasus
// vscjava.vscode-java-dependency). Dengan objek nyata, klon & wrapper-nya
// berhasil dimuat; pemakaian fs yang sesungguhnya tetap error jelas.
function __zhFs() {
  var nama = ['access','appendFile','chmod','chown','close','copyFile','exists','fchmod','fchown','fdatasync','fstat','fsync','ftruncate','futimes','lchmod','lchown','link','lstat','mkdir','mkdtemp','open','opendir','read','readdir','readFile','readlink','realpath','rename','rm','rmdir','stat','symlink','truncate','unlink','utimes','writeFile','writev','readv','readSync','writeSync','openSync','closeSync','readFileSync','writeFileSync','mkdirSync','statSync','lstatSync','existsSync','realpathSync','readdirSync','unlinkSync','rmSync','rmdirSync','renameSync','copyFileSync','chmodSync','chownSync','symlinkSync','readlinkSync','truncateSync','fstatSync','fsyncSync','utimesSync','mkdtempSync','appendFileSync','createReadStream','createWriteStream','watch','watchFile','unwatchFile'];
  var fs = {};
  nama.forEach(function (nm) {
    fs[nm] = function () {
      throw new Error('fs.' + nm + ' tidak didukung di sandbox ekstensi Zephyr');
    };
  });
  // graceful-fs mengintip fs.realpath.native saat load — sediakan fungsi.
  fs.realpath.native = function () {
    throw new Error('fs.realpath.native tidak didukung di sandbox ekstensi Zephyr');
  };
  function Stream() {
    throw new Error('fs.Stream tidak didukung di sandbox ekstensi Zephyr');
  }
  fs.ReadStream = Stream;
  fs.WriteStream = Stream;
  fs.Stream = Stream;
  fs.constants = constants;
  fs.F_OK = 0;
  fs.R_OK = 4;
  fs.W_OK = 2;
  fs.X_OK = 1;
  fs.promises = {};
  ['access','appendFile','chmod','chown','copyFile','lstat','mkdir','mkdtemp','open','readdir','readFile','readlink','realpath','rename','rm','rmdir','stat','symlink','truncate','unlink','utimes','writeFile','read','write'].forEach(function (nm) {
    fs.promises[nm] = function () {
      throw new Error('fs.promises.' + nm + ' tidak didukung di sandbox ekstensi Zephyr');
    };
  });
  return fs;
}

// Modul sistem lain (child_process/crypto/net/http/...): TIDAK tersedia di
// sandbox. Akses properti apa pun mengembalikan fungsi yang melempar error
// JELAS — bukan ReferenceError yang membingungkan.
function __zhUnavailable(nama) {
  return new Proxy({}, {
    get: function (t, prop) {
      if (prop === 'toString' || prop === Symbol.toPrimitive) {
        return function () { return '[modul sandbox: ' + nama + ']'; };
      }
      return function () {
        throw new Error('Modul "' + nama + '" tidak didukung di sandbox ekstensi Zephyr');
      };
    },
  });
}

// ── require relatif antar file ekstensi (mis. require('./dist/bundle')) ──
// File ekstensi dibaca backend (extensions_read_files) dan dikirim sebagai
// peta __zhFiles: relpath -> isi. Setiap file dijalankan dengan module /
// exports / require sendiri (seperti Node), lengkap cache + circular-safe.
// Tanpa ini, ekstensi seperti vscjava.vscode-java-dependency gagal dengan
// "Modul ./dist/extension.bundle tidak didukung di sandbox".
var __zhRequireCache = {};

function __zhDir(rel) {
  var i = String(rel).lastIndexOf('/');
  return i < 0 ? '.' : String(rel).slice(0, i);
}

function __zhResolve(dir, id) {
  var base = __zhNorm(dir + '/' + id);
  if (base.charAt(0) === '/') base = base.slice(1);
  var cands = [
    base, base + '.js', base + '.cjs', base + '.mjs', base + '.json',
    base + '/index.js', base + '/index.cjs', base + '/index.json',
  ];
  for (var i = 0; i < cands.length; i++) {
    if (Object.prototype.hasOwnProperty.call(__zhFiles, cands[i])) return cands[i];
  }
  throw new Error('file "' + id + '" tidak ditemukan di dalam ekstensi (dicari: ' + base + ')');
}

function __zhLoadFile(rel) {
  if (__zhRequireCache[rel]) return __zhRequireCache[rel].exports;
  var code = __zhFiles[rel];
  if (code === undefined) {
    throw new Error('file "' + rel + '" tidak ditemukan di dalam ekstensi Zephyr');
  }
  var mod = { exports: {} };
  __zhRequireCache[rel] = mod;
  var req = __zhMakeRequire(__zhDir(rel));
  var of = __filename, od = __dirname;
  __filename = rel;
  __dirname = __zhDir(rel);
  try {
    if (rel.slice(-5) === '.json') {
      mod.exports = JSON.parse(code);
    } else {
      (new Function('module', 'exports', 'require', '__filename', '__dirname', code))
        .call(mod.exports, mod, mod.exports, req, rel, __zhDir(rel));
    }
  } catch (e) {
    delete __zhRequireCache[rel];
    throw e;
  } finally {
    __filename = of;
    __dirname = od;
  }
  return mod.exports;
}

function __zhMakeRequire(dir) {
  return function (id) {
    id = String(id);
    if (id === 'vscode') return vscode;
    if (id === 'path' || id === 'node:path') return path;
    if (id === 'os' || id === 'node:os') return os;
    if (id === 'util' || id === 'node:util') return util;
    if (id === 'constants' || id === 'node:constants') return constants;
    if (id === 'fs' || id === 'node:fs') return __zhFs();
    if (id === 'buffer' || id === 'node:buffer') return bufferMod;
    if (id === 'events' || id === 'node:events') return eventsMod;
    if (id === 'stream' || id === 'node:stream') return __zhStream();
    if (id === 'timers' || id === 'node:timers') {
      return { setImmediate: setImmediate, clearImmediate: clearImmediate, setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval };
    }
    if (id === 'process' || id === 'node:process') return process;
    if (id === 'assert' || id === 'node:assert') {
      return { ok: function () {}, equal: function () {}, deepEqual: function () {} };
    }
    // require relatif/sibling ('.', '..', atau absolut): file di dalam folder
    // ekstensi yang dikirim backend sebagai __zhFiles.
    if (id.charAt(0) === '.' || id.charAt(0) === '/') {
      return __zhLoadFile(__zhResolve(dir, id));
    }
    // Modul lain (fs, child_process, crypto, net, atau paket npm apa pun):
    // kembalikan stub. Error baru muncul kalau propertinya BENAR-BENAR dipakai
    // (mis. fs.readFileSync) — bukan saat require-nya sendiri. Ini membuat
    // ekstensi seperti ms-python.python tetap bisa dimuat walau memanggil
    // banyak require di level atas.
    return __zhUnavailable(id);
  };
}
`;

const TRAILER = `
} catch (err) {
  // Error saat MEMUAT kode ekstensi: dilaporkan sekali, jelas, tanpa
  // "Uncaught ReferenceError" yang membingungkan.
  self.postMessage({
    type: 'notify',
    severity: 'warn',
    message: 'tidak bisa dimuat: ' + ((err && err.message) || err),
  });
}

// Pola VS Code: panggil activate(context) kalau bundle mengekspornya.
try {
  var __zhCtx = {
    subscriptions: [],
    extensionPath: '/',
    extensionUri: vscode.Uri.file('/'),
    extensionMode: 1,
    globalState: {
      get: function () { return undefined; },
      update: function () { return Promise.resolve(undefined); },
    },
    workspaceState: {
      get: function () { return undefined; },
      update: function () { return Promise.resolve(undefined); },
    },
    secrets: {
      get: function () { return Promise.resolve(undefined); },
      store: function () { return Promise.resolve(undefined); },
    },
    asAbsolutePath: function (p) { return String(p); },
    logUri: vscode.Uri.file('/'),
    storageUri: null,
    globalStorageUri: null,
    extension: { id: 'zephyr-extension', extensionUri: vscode.Uri.file('/') },
  };
  if (module.exports && typeof module.exports.activate === 'function') {
    Promise.resolve(module.exports.activate(__zhCtx)).catch(function (err) {
      self.postMessage({
        type: 'notify',
        severity: 'warn',
        message: 'aktivasi: ' + ((err && err.message) || err),
      });
    });
  }
} catch (err) {
  self.postMessage({
    type: 'notify',
    severity: 'warn',
    message: 'aktivasi gagal: ' + ((err && err.message) || err),
  });
}
`;