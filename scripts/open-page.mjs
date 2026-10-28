import { spawn } from 'node:child_process';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const target = process.argv[2] ?? path.join(dir, 'index.html');
const chrome = spawn('/usr/bin/google-chrome', [
  '--no-sandbox', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9340', `--user-data-dir=${dir}/../work/browser-view`,
  `file://${target}`,
], { stdio: 'ignore' });
chrome.on('exit', c => { console.log('chrome cerró', c); process.exit(0); });
console.log('abierto:', target);
