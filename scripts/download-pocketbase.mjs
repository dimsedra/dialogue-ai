import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const VERSION = '0.39.1';
const DEST_DIR = path.join(process.cwd(), 'pocketbase');
const TEMP_ZIP = path.join(process.cwd(), 'pocketbase_temp.zip');

function getPocketBaseUrl() {
  const platform = process.platform;
  let arch = process.arch;

  // Map architecture names
  if (arch === 'x64') {
    arch = 'amd64';
  } else if (arch === 'arm') {
    arch = 'armv7';
  }

  let osName = '';
  let archiveExt = 'zip';

  if (platform === 'win32') {
    osName = 'windows';
  } else if (platform === 'darwin') {
    osName = 'darwin';
  } else if (platform === 'linux') {
    osName = 'linux';
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  return `https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/pocketbase_${VERSION}_${osName}_${arch}.${archiveExt}`;
}

async function main() {
  const pbBinName = process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase';
  const pbPath = path.join(DEST_DIR, pbBinName);

  if (fs.existsSync(pbPath)) {
    console.log(`PocketBase binary already exists at ${pbPath}. Skipping download.`);
    return;
  }

  const url = getPocketBaseUrl();
  console.log(`Downloading PocketBase v${VERSION} from ${url}...`);

  // Ensure output directory exists
  if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(TEMP_ZIP, buffer);
    console.log(`Saved temporary archive to ${TEMP_ZIP} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

    console.log('Extracting archive...');
    if (process.platform === 'win32') {
      execSync(`powershell -Command "Expand-Archive -Path '${TEMP_ZIP}' -DestinationPath '${DEST_DIR}' -Force"`);
    } else {
      execSync(`unzip -o "${TEMP_ZIP}" -d "${DEST_DIR}"`);
      // Set executable permission
      fs.chmodSync(pbPath, 0o755);
    }

    console.log('🎉 PocketBase downloaded and extracted successfully!');
  } catch (error) {
    console.error('❌ Failed to set up PocketBase:', error.message);
  } finally {
    if (fs.existsSync(TEMP_ZIP)) {
      try {
        fs.unlinkSync(TEMP_ZIP);
      } catch (err) {
        // Ignore
      }
    }
  }
}

main().catch(console.error);
