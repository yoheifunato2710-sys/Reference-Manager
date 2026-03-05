/**
 * OneDrive（または任意のフォルダ）内の paper-manager-data.json を読み書きする層
 * - Electron: IPC でメインプロセスがフォルダを直接読書き
 * - ブラウザ: File System Access API または ファイル選択/ダウンロード
 */

const DATA_FILE = 'paper-manager-data.json';
const PDF_SUBDIR = 'pdfs';
const IDB_NAME = 'paper-manager-storage';
const IDB_KEY = 'dataDirHandle';

/** Electron 環境か（ブラウザでは起動時の自動読み込みで権限エラーになるため判定に使用） */
export const isElectron = () => typeof window !== 'undefined' && window.electronAPI;

/** IndexedDB にディレクトリハンドルを保存（ブラウザ用。Electron では不要） */
export async function saveDataDirHandle(handle) {
  if (isElectron() || !handle || typeof indexedDB === 'undefined') return;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('handles', 'readwrite');
      const store = tx.objectStore('handles');
      store.put(handle, IDB_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('handles');
    };
  });
}

/** 保存済みのデータフォルダハンドルをクリア（ブラウザの IndexedDB のみ。権限エラー時に起動時の再試行を防ぐ） */
export async function clearDataDirHandle() {
  if (isElectron() || typeof indexedDB === 'undefined') return;
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => resolve();
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('handles')) {
        db.close();
        return resolve();
      }
      const tx = db.transaction('handles', 'readwrite');
      const store = tx.objectStore('handles');
      store.delete(IDB_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    };
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('handles');
    };
  });
}

/** 保存済みのデータフォルダ（ハンドルまたはパス）を取得 */
export async function getDataDirHandle() {
  if (isElectron()) {
    return await window.electronAPI.getDataFolder();
  }
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('handles')) {
        db.close();
        return resolve(null);
      }
      const tx = db.transaction('handles', 'readonly');
      const store = tx.objectStore('handles');
      const getReq = store.get(IDB_KEY);
      getReq.onsuccess = () => {
        db.close();
        resolve(getReq.result ?? null);
      };
      getReq.onerror = () => { db.close(); resolve(null); };
    };
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('handles');
    };
  });
}

/** フォルダ選択（Electron: ダイアログ / ブラウザ: showDirectoryPicker） */
export async function pickDataFolder() {
  if (isElectron()) {
    return await window.electronAPI.selectDataFolder();
  }
  if (!('showDirectoryPicker' in window)) return null;
  try {
    const handle = await window.showDirectoryPicker();
    await saveDataDirHandle(handle);
    return handle;
  } catch (e) {
    if (e.name === 'AbortError') return null;
    throw e;
  }
}

/** データフォルダから JSON を読み込む */
export async function readDataFromFolder(dirHandle) {
  if (!dirHandle) return null;
  if (isElectron()) {
    return await window.electronAPI.readData();
  }
  try {
    const fileHandle = await dirHandle.getFileHandle(DATA_FILE, { create: false });
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch (e) {
    if (e.name === 'NotFoundError') return null;
    throw e;
  }
}

/** データフォルダに JSON を書き込む */
export async function writeDataToFolder(dirHandle, data) {
  if (!dirHandle) throw new Error('フォルダが選択されていません');
  if (isElectron()) {
    return await window.electronAPI.writeData(data);
  }
  const fileHandle = await dirHandle.getFileHandle(DATA_FILE, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

/** フォルダ内の PDF の表示用 URL（Blob URL または file://） */
export async function readPdfFromFolder(dirHandle, relativePath) {
  if (!dirHandle || !relativePath) return null;
  if (isElectron()) {
    return await window.electronAPI.getPdfFileUrl(relativePath);
  }
  try {
    const parts = relativePath.split('/').filter(Boolean);
    let current = dirHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i], { create: false });
    }
    const fileHandle = await current.getFileHandle(parts[parts.length - 1], { create: false });
    const file = await fileHandle.getFile();
    return URL.createObjectURL(file);
  } catch (e) {
    if (e.name === 'NotFoundError') return null;
    throw e;
  }
}

/** フォルダに PDF を書き込む。返り値は相対パス（例: pdfs/123.pdf） */
export async function writePdfToFolder(dirHandle, paperId, file) {
  if (!dirHandle || !file) return null;
  if (isElectron()) {
    const buffer = await file.arrayBuffer();
    return await window.electronAPI.writePdf(paperId, buffer);
  }
  try {
    let pdfDir;
    try {
      pdfDir = await dirHandle.getDirectoryHandle(PDF_SUBDIR, { create: false });
    } catch {
      pdfDir = await dirHandle.getDirectoryHandle(PDF_SUBDIR, { create: true });
    }
    const safeName = `${paperId}.pdf`;
    const fileHandle = await pdfDir.getFileHandle(safeName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(await file.arrayBuffer());
    await writable.close();
    return `${PDF_SUBDIR}/${safeName}`;
  } catch (e) {
    console.error('PDF save error', e);
    return null;
  }
}

/** フォルダ選択が使えるか（Electron または File System Access API） */
export function hasFolderAccess() {
  return typeof window !== 'undefined' && (window.electronAPI || 'showDirectoryPicker' in window);
}

/** Electron かどうか（ショートカット作成など） */
export function isElectronApp() {
  return typeof window !== 'undefined' && !!(window.electronAPI?.isElectron || (window.electronAPI && typeof window.electronAPI.createDesktopShortcut === 'function'));
}

/** デスクトップにショートカット作成（Electron のみ） */
export async function createDesktopShortcut() {
  if (!window.electronAPI?.createDesktopShortcut) return { ok: false, error: '未対応' };
  return await window.electronAPI.createDesktopShortcut();
}

/** データフォルダ内にショートカット作成（ダブルクリックで起動用）（Electron のみ） */
export async function createFolderShortcut() {
  if (!window.electronAPI?.createFolderShortcut) return { ok: false, error: '未対応' };
  return await window.electronAPI.createFolderShortcut();
}

/** ファイル選択で JSON を読み込む（フォールバック） */
export function readDataFromFileInput() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const text = await file.text();
        resolve(JSON.parse(text));
      } catch (e) {
        resolve({ error: e.message });
      }
    };
    input.click();
  });
}

/** データを JSON ファイルとしてダウンロード（フォールバック） */
export function downloadData(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = DATA_FILE;
  a.click();
  URL.revokeObjectURL(a.href);
}
