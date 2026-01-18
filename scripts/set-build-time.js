const fs = require('fs');
const path = require('path');

// Build zamanını formatla: GG.AA.YY SS:DD
const now = new Date();
const day = String(now.getDate()).padStart(2, '0');
const month = String(now.getMonth() + 1).padStart(2, '0');
const year = String(now.getFullYear()).slice(-2);
const hours = String(now.getHours()).padStart(2, '0');
const minutes = String(now.getMinutes()).padStart(2, '0');

const buildTime = `${day}.${month}.${year} ${hours}:${minutes}`;

// .env dosyasını oku veya oluştur
const envPath = path.join(__dirname, '..', '.env');
let envContent = '';

if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
}

// REACT_APP_BUILD_TIME'ı güncelle veya ekle
const buildTimeRegex = /^REACT_APP_BUILD_TIME=.*$/m;
if (buildTimeRegex.test(envContent)) {
  envContent = envContent.replace(buildTimeRegex, `REACT_APP_BUILD_TIME=${buildTime}`);
} else {
  envContent += `\nREACT_APP_BUILD_TIME=${buildTime}\n`;
}

fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');

console.log(`Build time set to: ${buildTime}`);

