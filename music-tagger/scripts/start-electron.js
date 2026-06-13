// Wrapper script to unset ELECTRON_RUN_AS_NODE before launching Electron
const { spawn } = require('child_process');
const path = require('path');

// Remove ELECTRON_RUN_AS_NODE from environment
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const electronPath = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const args = ['.'];

if (process.env.NODE_ENV === 'development') {
  // In dev mode, electron loads from vite dev server
}

const child = spawn(electronPath, args, {
  stdio: 'inherit',
  env,
  windowsHide: false,
});

child.on('close', (code) => {
  process.exit(code);
});
