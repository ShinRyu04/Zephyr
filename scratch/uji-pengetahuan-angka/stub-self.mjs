/* stub uji-pengetahuan-angka.mjs - Tauri/store untuk bundel zephyr_self.
 * Tiap jawaban IPC DIHITUNG supaya cache per sesi bisa dibuktikan dengan angka. */
/* Versi disuntikkan dari luar (1.1.14), bukan ditulis tangan.
 *
 * Sebelum ini nilainya hardcode '1.1.13'. Begitu versi app naik (1.1.14),
 * kontrol NEGATIF "versi sama -> tidak ada kata BASI" jadi mustahil lulus:
 * harness menyuntikkan versi lama sementara indeksnya dibuat untuk versi baru,
 * sehingga runtime benar-benar melihat cap yang berbeda dan menjawab BASI.
 * Yang merah adalah harness-nya, bukan produknya - dan harness yang salah
 * melaporkan produk sehat sebagai rusak lebih buruk daripada tidak ada harness. */
const G = (globalThis.__UJI = globalThis.__UJI || { ipc: 0, calls: [], versiApp: '1.1.14' });
const catat = (nama) => { G.ipc++; G.calls.push(nama); return nama; };
export const useStore = { getState: () => ({ settings: { general: { uiLang: 'en' }, agents: {}, models: {} }, workspace: undefined }), setState: () => undefined, subscribe: () => () => undefined };
export const useUpdater = { getState: () => ({ status: 'idle', version: null, message: null }) };
export const useMcp = { getState: () => ({ status: null, enabled: true }) };
export const useExtensions = { getState: () => ({ loaded: {}, extError: null }) };
export const getAppInfo = async () => { catat('getAppInfo'); return { version: G.versiApp, dataDir: 'D:/zuji/data', identifier: 'dev.zephyr', arch: 'x64', webview: 'edge', portable: false, exeDir: 'D:/zuji' }; };
export const getDiagnostics = async () => { catat('getDiagnostics'); return { version: G.versiApp, logFile: '', debug: false, panicked: false, os: 'win32', cpuCount: 4 }; };
export const getSettings = async () => { catat('getSettings'); return {}; };
export const logTail = async () => { catat('logTail'); return []; };
export const extensionsList = async () => { catat('extensionsList'); return []; };
export const extensionsBundledIds = async () => { catat('extensionsBundledIds'); return []; };
export const extensionsManifests = async () => { catat('extensionsManifests'); return []; };
export const extRegistryInstalled = async () => { catat('extRegistryInstalled'); return []; };
export const mcpStatus = async () => { catat('mcpStatus'); return { running: false }; };
