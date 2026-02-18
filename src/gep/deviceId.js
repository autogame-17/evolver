// Stable device identifier for node identity.
// Generates a hardware-based fingerprint that persists across directory changes,
// reboots, and evolver upgrades. Used by getNodeId() and env_fingerprint.
//
// Priority chain:
//   1. EVOMAP_DEVICE_ID env var        (explicit override, recommended for containers)
//   2. ~/.evomap/device_id file        (persisted from previous run)
//   3. <project>/.evomap_device_id     (fallback persist path for containers w/o $HOME)
//   4. /etc/machine-id                 (Linux, set at OS install)
//   5. IOPlatformUUID                  (macOS hardware UUID)
//   6. Docker/OCI container ID         (from /proc/self/cgroup or /proc/self/mountinfo)
//   7. hostname + MAC addresses        (network-based fallback)
//   8. random 128-bit hex              (last resort, persisted immediately)

const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEVICE_ID_DIR = path.join(os.homedir(), '.evomap');
const DEVICE_ID_FILE = path.join(DEVICE_ID_DIR, 'device_id');
const LOCAL_DEVICE_ID_FILE = path.resolve(__dirname, '..', '..', '.evomap_device_id');

let _cachedDeviceId = null;

const DEVICE_ID_RE = /^[a-f0-9]{16,64}$/;

function isContainer() {
  try {
    if (fs.existsSync('/.dockerenv')) return true;
  } catch {}
  try {
    const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
    if (/docker|kubepods|containerd|cri-o|lxc|ecs/i.test(cgroup)) return true;
  } catch {}
  try {
    if (fs.existsSync('/run/.containerenv')) return true;
  } catch {}
  return false;
}

function readMachineId() {
  try {
    const mid = fs.readFileSync('/etc/machine-id', 'utf8').trim();
    if (mid && mid.length >= 16) return mid;
  } catch {}

  if (process.platform === 'darwin') {
    try {
      const { execFileSync } = require('child_process');
      const raw = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const match = raw.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      if (match && match[1]) return match[1];
    } catch {}
  }

  return null;
}

// Extract Docker/OCI container ID from cgroup or mountinfo.
// The container ID is 64-char hex and stable for the lifetime of the container.
// Returns null on non-container hosts or if parsing fails.
function readContainerId() {
  // Method 1: /proc/self/cgroup (works for cgroup v1 and most Docker setups)
  try {
    const cgroup = fs.readFileSync('/proc/self/cgroup', 'utf8');
    const match = cgroup.match(/[a-f0-9]{64}/);
    if (match) return match[0];
  } catch {}

  // Method 2: /proc/self/mountinfo (works for cgroup v2 / containerd)
  try {
    const mountinfo = fs.readFileSync('/proc/self/mountinfo', 'utf8');
    const match = mountinfo.match(/[a-f0-9]{64}/);
    if (match) return match[0];
  } catch {}

  // Method 3: hostname in Docker defaults to short container ID (12 hex chars)
  if (isContainer()) {
    const hostname = os.hostname();
    if (/^[a-f0-9]{12,64}$/.test(hostname)) return hostname;
  }

  return null;
}

function getMacAddresses() {
  const ifaces = os.networkInterfaces();
  const macs = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        macs.push(iface.mac);
      }
    }
  }
  macs.sort();
  return macs;
}

function generateDeviceId() {
  const machineId = readMachineId();
  if (machineId) {
    return crypto.createHash('sha256').update('evomap:' + machineId).digest('hex').slice(0, 32);
  }

  // Container ID: stable for the container's lifetime, but changes on re-create.
  // Still better than random for keeping identity within a single deployment.
  const containerId = readContainerId();
  if (containerId) {
    return crypto.createHash('sha256').update('evomap:container:' + containerId).digest('hex').slice(0, 32);
  }

  const macs = getMacAddresses();
  if (macs.length > 0) {
    const raw = os.hostname() + '|' + macs.join(',');
    return crypto.createHash('sha256').update('evomap:' + raw).digest('hex').slice(0, 32);
  }

  return crypto.randomBytes(16).toString('hex');
}

function persistDeviceId(id) {
  // Try primary path (~/.evomap/device_id)
  try {
    if (!fs.existsSync(DEVICE_ID_DIR)) {
      fs.mkdirSync(DEVICE_ID_DIR, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(DEVICE_ID_FILE, id, { encoding: 'utf8', mode: 0o600 });
    return;
  } catch {}

  // Fallback: project-local file (useful in containers where $HOME is ephemeral
  // but the project directory is mounted as a volume)
  try {
    fs.writeFileSync(LOCAL_DEVICE_ID_FILE, id, { encoding: 'utf8', mode: 0o600 });
    return;
  } catch {}

  console.error(
    '[evolver] WARN: failed to persist device_id to ' + DEVICE_ID_FILE +
    ' or ' + LOCAL_DEVICE_ID_FILE +
    ' -- node identity may change on restart.' +
    ' Set EVOMAP_DEVICE_ID env var for stable identity in containers.'
  );
}

function loadPersistedDeviceId() {
  // Try primary path
  try {
    if (fs.existsSync(DEVICE_ID_FILE)) {
      const id = fs.readFileSync(DEVICE_ID_FILE, 'utf8').trim();
      if (id && DEVICE_ID_RE.test(id)) return id;
    }
  } catch {}

  // Try project-local fallback
  try {
    if (fs.existsSync(LOCAL_DEVICE_ID_FILE)) {
      const id = fs.readFileSync(LOCAL_DEVICE_ID_FILE, 'utf8').trim();
      if (id && DEVICE_ID_RE.test(id)) return id;
    }
  } catch {}

  return null;
}

function getDeviceId() {
  if (_cachedDeviceId) return _cachedDeviceId;

  // 1. Env var override (validated)
  if (process.env.EVOMAP_DEVICE_ID) {
    const envId = String(process.env.EVOMAP_DEVICE_ID).trim().toLowerCase();
    if (DEVICE_ID_RE.test(envId)) {
      _cachedDeviceId = envId;
      return _cachedDeviceId;
    }
  }

  // 2. Previously persisted (checks both ~/.evomap/ and project-local)
  const persisted = loadPersistedDeviceId();
  if (persisted) {
    _cachedDeviceId = persisted;
    return _cachedDeviceId;
  }

  // 3. Generate from hardware / container metadata and persist
  const inContainer = isContainer();
  const generated = generateDeviceId();
  persistDeviceId(generated);
  _cachedDeviceId = generated;

  if (inContainer && !process.env.EVOMAP_DEVICE_ID) {
    console.error(
      '[evolver] NOTE: running in a container without EVOMAP_DEVICE_ID.' +
      ' A device_id was auto-generated and persisted, but for guaranteed' +
      ' cross-restart stability, set EVOMAP_DEVICE_ID as an env var' +
      ' or mount a persistent volume at ~/.evomap/'
    );
  }

  return _cachedDeviceId;
}

module.exports = { getDeviceId, isContainer };
