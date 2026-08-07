// Installs or restarts the packaged app as a native Windows Service.
const path = require('path');
const fs = require('fs');
const { Service } = require('node-windows');

const programData = process.env.ProgramData || 'C:\\ProgramData';
const dataDir = process.env.CASH_SAVER_DATA_DIR || path.join(programData, 'Lockwood IT Services', 'CashSaver Weekly Ad Builder');
const configPath = process.env.CASH_SAVER_CONFIG || path.join(dataDir, '.env');
const bundledNode = path.join(__dirname, 'node.exe');

const svc = new Service({
  name: 'WeeklyAdBuilder',
  description: 'CashSaver Weekly Ad Builder — local flyer-building web app.',
  script: path.join(__dirname, 'server.js'),
  workingDirectory: __dirname,
  execPath: fs.existsSync(bundledNode) ? bundledNode : process.execPath,
  env: [
    { name: 'NODE_ENV', value: 'production' },
    { name: 'CASH_SAVER_DATA_DIR', value: dataDir },
    { name: 'CASH_SAVER_CONFIG', value: configPath }
  ]
});

svc.on('install', () => svc.start());
svc.on('alreadyinstalled', () => svc.start());
svc.on('start', () => console.log('Weekly Ad Builder service is running.'));
svc.on('error', err => { console.error(err); process.exitCode = 1; });
svc.install();
