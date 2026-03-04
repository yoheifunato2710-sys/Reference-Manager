// OneDrive 内だと "Access is denied" になるため、出力先を OneDrive 外（ローカル）に
const path = require('path');

const defaultOutput = process.env.ELECTRON_BUILDER_OUTPUT 
  || path.join(process.env.LOCALAPPDATA || require('os').homedir(), '文献管理-installer');

module.exports = {
  appId: 'com.papermanager.app',
  productName: '文献管理',
  directories: { output: defaultOutput },
  files: ['dist/**', 'electron/**'],
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    signAndEditExecutable: false, // コード署名をスキップ（シンボリックリンク権限エラーを避ける）
  },
  forceCodeSigning: false,
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    shortcutName: '文献管理',
  },
};
