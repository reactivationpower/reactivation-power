#!/usr/bin/env node
/**
 * Dev-only pre-start step: make sure nothing is still listening on $PORT
 * before a dev server tries to bind it.
 *
 * Why: a workflow restart that fails with EADDRINUSE leaves the *previous*
 * process answering on the port, so the preview silently keeps running an
 * old build while the code (and `dist/`) on disk have moved on. Terminating
 * the leftover listener first means a restart either serves the new code or
 * fails loudly — never the old code.
 *
 * Usage (from an artifact's `dev` script):  node ../../scripts/free-port.mjs
 *
 * Pure Node, no dependencies: listeners are found through /proc/net/tcp{,6}
 * and /proc/<pid>/fd, with `lsof` as a fallback when /proc is unavailable.
 * Never used by production `start` scripts.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, readlinkSync } from 'node:fs';

const rawPort = process.env.PORT;
const port = Number(rawPort);
if (!rawPort || Number.isNaN(port) || port <= 0) {
  console.error(`[free-port] PORT is not set or invalid ("${rawPort ?? ''}"); nothing to do.`);
  process.exit(0);
}
if (process.env.NODE_ENV === 'production') {
  console.error('[free-port] NODE_ENV=production; refusing to kill processes.');
  process.exit(0);
}

const LISTEN = '0A';

/** Socket inodes of every LISTEN socket bound to `port` (any address). */
function listeningInodes() {
  const inodes = new Set();
  for (const table of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let text;
    try {
      text = readFileSync(table, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n').slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 10 || cols[3] !== LISTEN) continue;
      const localPort = parseInt(cols[1].split(':').pop(), 16);
      if (localPort === port) inodes.add(cols[9]);
    }
  }
  return inodes;
}

/** PIDs owning any of the given socket inodes. */
function pidsForInodes(inodes) {
  const pids = new Set();
  if (inodes.size === 0) return pids;
  const wanted = new Set([...inodes].map((i) => `socket:[${i}]`));
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (pid === process.pid) continue;
    let fds;
    try {
      fds = readdirSync(`/proc/${pid}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      try {
        if (wanted.has(readlinkSync(`/proc/${pid}/fd/${fd}`))) {
          pids.add(pid);
          break;
        }
      } catch {
        /* fd closed under us */
      }
    }
  }
  return pids;
}

function pidsViaLsof() {
  try {
    const out = execFileSync('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return new Set(
      out
        .split('\n')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0 && n !== process.pid),
    );
  } catch {
    return new Set();
  }
}

function findListeners() {
  const viaProc = pidsForInodes(listeningInodes());
  return viaProc.size > 0 ? viaProc : pidsViaLsof();
}

function describe(pid) {
  try {
    const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim();
    return cmd.length > 120 ? `${cmd.slice(0, 117)}...` : cmd;
  } catch {
    return '(unknown command)';
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function terminate(pids, signal, timeoutMs) {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch {
      /* already gone */
    }
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (![...pids].some(alive)) return [];
    await sleep(100);
  }
  return [...pids].filter(alive);
}

const stale = findListeners();
if (stale.size === 0) {
  console.error(`[free-port] port ${port} is free.`);
  process.exit(0);
}

for (const pid of stale) {
  console.error(`[free-port] port ${port} is held by stale pid ${pid}: ${describe(pid)}`);
}

let remaining = await terminate(stale, 'SIGTERM', 5000);
if (remaining.length > 0) {
  console.error(`[free-port] pid(s) ${remaining.join(', ')} ignored SIGTERM; sending SIGKILL.`);
  remaining = await terminate(new Set(remaining), 'SIGKILL', 3000);
}
if (remaining.length > 0) {
  console.error(`[free-port] could not free port ${port} (pid(s) ${remaining.join(', ')} still alive).`);
  process.exit(1);
}

// The kernel can take a moment to release the socket after the owner dies.
for (let i = 0; i < 30 && listeningInodes().size > 0; i++) await sleep(100);
console.error(`[free-port] freed port ${port}.`);
