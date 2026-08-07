const path = require('path');
const { Service } = require('node-windows');

const svc = new Service({
  name: 'WeeklyAdBuilder',
  script: path.join(__dirname, 'server.js')
});

svc.on('uninstall', () => console.log('Weekly Ad Builder service removed.'));
svc.on('error', err => { console.error(err); process.exitCode = 1; });
svc.uninstall();
