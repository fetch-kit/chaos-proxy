// Script to start chaos-proxy with basic config
import { exec } from 'child_process';
exec('npx chaos-proxy --config ./config.yaml', (err, stdout, stderr) => {
  if (err) throw err;
  console.log(stdout);
  console.error(stderr);
});
