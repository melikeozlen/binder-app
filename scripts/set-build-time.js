const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');

function git(command) {
  try {
    return execSync(command, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

// Sürüm: her commit ile artar. Git yoksa kısa bir sayı.
const commitCount = git('git rev-list --count HEAD');
const sha = git('git rev-parse --short HEAD');
const buildNumber = commitCount && /^\d+$/.test(commitCount) ? commitCount : String(Math.floor(Date.now() / 1000) % 100000);

const envFiles = ['.env.development.local', '.env.production.local'];

function upsert(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) return content.replace(re, line);
  return `${content.replace(/\s*$/, '')}\n${line}\n`;
}

for (const name of envFiles) {
  const envPath = path.join(root, name);
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  envContent = upsert(envContent, 'REACT_APP_BUILD_NUMBER', buildNumber);
  if (sha) envContent = upsert(envContent, 'REACT_APP_BUILD_SHA', sha);
  envContent = envContent.replace(/^REACT_APP_BUILD_TIME=.*\n?/m, '');
  fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
}

console.log(`[build] v${buildNumber}${sha ? ` ${sha}` : ''}`);
