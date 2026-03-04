const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { execSync } = require('child_process');

const DATA_FILE = 'paper-manager-data.json';
const PDF_SUBDIR = 'pdfs';
const CONFIG_FILE = 'data-folder.json';

function getConfigPath() {
  return path.join(app.getPath('userData'), CONFIG_FILE);
}

async function getDataFolderPath() {
  try {
    const p = await fs.readFile(getConfigPath(), 'utf8');
    const j = JSON.parse(p);
    return j.folderPath || null;
  } catch {
    return null;
  }
}

async function setDataFolderPath(folderPath) {
  await fs.mkdir(path.dirname(getConfigPath()), { recursive: true });
  await fs.writeFile(getConfigPath(), JSON.stringify({ folderPath }, null, 2));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // フォルダ内 PDF を iframe で表示するため
    },
    title: '文献管理 - Paper Manager',
  });

  if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.on('closed', () => {});
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

// ── IPC: フォルダ選択
ipcMain.handle('select-data-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'データを保存するフォルダを選択（OneDrive内を推奨）',
  });
  if (canceled || !filePaths?.length) return null;
  const folderPath = filePaths[0];
  await setDataFolderPath(folderPath);
  return folderPath;
});

// ── IPC: 保存済みフォルダパス取得
ipcMain.handle('get-data-folder', async () => {
  return await getDataFolderPath();
});

// ── IPC: データ読み込み
ipcMain.handle('read-data', async () => {
  const folderPath = await getDataFolderPath();
  if (!folderPath) return null;
  const filePath = path.join(folderPath, DATA_FILE);
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
});

// ── IPC: データ書き込み
ipcMain.handle('write-data', async (_, data) => {
  const folderPath = await getDataFolderPath();
  if (!folderPath) throw new Error('フォルダが選択されていません');
  const filePath = path.join(folderPath, DATA_FILE);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
});

// ── IPC: PDF の file:// URL 取得（表示用）
ipcMain.handle('get-pdf-file-url', async (_, relativePath) => {
  const folderPath = await getDataFolderPath();
  if (!folderPath || !relativePath) return null;
  const fullPath = path.join(folderPath, relativePath.replace(/\//g, path.sep));
  try {
    await fs.access(fullPath);
    return 'file:///' + fullPath.replace(/\\/g, '/');
  } catch {
    return null;
  }
});

// ── IPC: PDF 書き込み
ipcMain.handle('write-pdf', async (_, paperId, buffer) => {
  const folderPath = await getDataFolderPath();
  if (!folderPath) return null;
  const pdfDir = path.join(folderPath, PDF_SUBDIR);
  await fs.mkdir(pdfDir, { recursive: true });
  const filePath = path.join(pdfDir, `${paperId}.pdf`);
  await fs.writeFile(filePath, Buffer.from(buffer));
  return `${PDF_SUBDIR}/${paperId}.pdf`;
});

// ── ショートカット作成（Windows: PowerShell で .lnk）
function createShortcut(targetLnkPath, exePath, workingDir) {
  const escaped = (p) => (p || '').replace(/'/g, "''");
  const cmd = `powershell -NoProfile -Command "$WshShell = New-Object -ComObject WScript.Shell; $s = $WshShell.CreateShortcut('${escaped(targetLnkPath)}'); $s.TargetPath = '${escaped(exePath)}'; $s.WorkingDirectory = '${escaped(workingDir || path.dirname(exePath))}'; $s.Save()"`;
  execSync(cmd, { stdio: 'pipe', windowsHide: true });
}

// ── IPC: デスクトップにショートカット作成
ipcMain.handle('create-desktop-shortcut', async () => {
  const desktop = app.getPath('desktop');
  const exePath = process.execPath;
  const lnkPath = path.join(desktop, '文献管理.lnk');
  try {
    createShortcut(lnkPath, exePath);
    return { ok: true, path: lnkPath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: データフォルダ内にショートカット作成（ダブルクリックで起動用）
ipcMain.handle('create-folder-shortcut', async () => {
  const folderPath = await getDataFolderPath();
  if (!folderPath) return { ok: false, error: 'フォルダが選択されていません' };
  const exePath = process.execPath;
  const lnkPath = path.join(folderPath, '文献管理を開く.lnk');
  try {
    createShortcut(lnkPath, exePath, folderPath);
    return { ok: true, path: lnkPath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
