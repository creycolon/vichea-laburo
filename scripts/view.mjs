// Abre una URL en Chrome con un perfil aparte y deja el proceso vivo (para capturas por CDP).
import { spawn } from 'node:child_process';

const url = process.argv[2];
const port = process.argv[3] ?? '9350';
const profile = process.argv[4] ?? 'work/browser-app';

const chrome = spawn('/usr/bin/google-chrome', [
  // --no-sandbox: /opt/google/chrome/chrome-sandbox está owned por `nobody` en este equipo.
  // --test-type: silencia el aviso de Chrome por correr sin sandbox.
  '--no-sandbox', '--test-type',
  '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${process.cwd()}/${profile}`,
  url,
], { stdio: 'ignore' });

chrome.on('exit', (c) => { console.log('chrome cerró', c); process.exit(0); });
console.log('abierto', url);
