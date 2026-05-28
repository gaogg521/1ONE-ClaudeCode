/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { networkInterfaces, type NetworkInterfaceInfo } from 'os';

/** Virtual / tunnel adapters that should not be shown as the WebUI LAN address. */
const VIRTUAL_INTERFACE_PATTERNS: RegExp[] = [
  /vmware/i,
  /vmnet/i,
  /virtualbox/i,
  /vboxnet/i,
  /hyper-v/i,
  /vethernet/i,
  /\bveth/i,
  /\bvirbr/i,
  /docker/i,
  /\bwsl\b/i,
  /tap-windows/i,
  /\btap\b/i,
  /npcap/i,
  /hamachi/i,
  /zerotier/i,
  /bluetooth/i,
  /蓝牙/i,
  /wi-?fi\s*direct/i,
  /wireless.*\*/i,
  /本地连接\s*[*\d]/,
  /loopback/i,
  /\bppp\d*/i,
  /\btun\d*/i,
];

/** Physical LAN adapters — higher score wins. */
const PREFERRED_INTERFACE_PATTERNS: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /^wlan$/i, score: 100 },
  { pattern: /wireless lan adapter wlan/i, score: 100 },
  { pattern: /\bwi-?fi\b/i, score: 90 },
  { pattern: /^以太网$/i, score: 85 },
  { pattern: /^ethernet$/i, score: 85 },
  { pattern: /intel.*ethernet/i, score: 80 },
  { pattern: /^en0$/i, score: 80 },
  { pattern: /^eth\d+$/i, score: 75 },
  { pattern: /tailscale/i, score: 50 },
];

export function isVirtualNetworkInterface(name: string): boolean {
  return VIRTUAL_INTERFACE_PATTERNS.some((pattern) => pattern.test(name));
}

export function getNetworkInterfacePriority(name: string): number {
  if (isVirtualNetworkInterface(name)) {
    return -1;
  }

  for (const { pattern, score } of PREFERRED_INTERFACE_PATTERNS) {
    if (pattern.test(name)) {
      return score;
    }
  }

  // Unknown name but not flagged virtual — still usable (e.g. custom VPN NIC).
  return 10;
}

type LanCandidate = { address: string; priority: number };

function collectIpv4Candidates(nets: NodeJS.Dict<NetworkInterfaceInfo[]>): LanCandidate[] {
  const candidates: LanCandidate[] = [];

  for (const [name, netInfo] of Object.entries(nets)) {
    if (!netInfo) continue;

    const priority = getNetworkInterfacePriority(name);
    if (priority < 0) continue;

    for (const net of netInfo) {
      const isIPv4 = net.family === 'IPv4' || (net.family as unknown) === 4;
      if (!isIPv4 || net.internal) continue;
      candidates.push({ address: net.address, priority });
    }
  }

  return candidates;
}

/**
 * Pick the best LAN IPv4 from a pre-fetched `os.networkInterfaces()` map (testable).
 */
export function selectLanIpFromInterfaces(nets: NodeJS.Dict<NetworkInterfaceInfo[]>): string | null {
  const ranked = collectIpv4Candidates(nets);
  if (ranked.length > 0) {
    ranked.sort((a, b) => b.priority - a.priority || a.address.localeCompare(b.address));
    return ranked[0]?.address ?? null;
  }

  // Fallback: any non-internal IPv4 (e.g. exotic NIC naming in CI).
  for (const netInfo of Object.values(nets)) {
    if (!netInfo) continue;
    for (const net of netInfo) {
      const isIPv4 = net.family === 'IPv4' || (net.family as unknown) === 4;
      if (isIPv4 && !net.internal) {
        return net.address;
      }
    }
  }

  return null;
}

/**
 * All non-virtual LAN IPv4 addresses (for CORS / bind allowlists).
 */
export function resolveAllLanIps(): string[] {
  const nets = networkInterfaces();
  const ranked = collectIpv4Candidates(nets);
  if (ranked.length > 0) {
    const seen = new Set<string>();
    const ordered: string[] = [];
    ranked.sort((a, b) => b.priority - a.priority || a.address.localeCompare(b.address));
    for (const { address } of ranked) {
      if (!seen.has(address)) {
        seen.add(address);
        ordered.push(address);
      }
    }
    return ordered;
  }

  const fallback = selectLanIpFromInterfaces(nets);
  return fallback ? [fallback] : [];
}

/**
 * Resolve the LAN IPv4 to display for WebUI remote access (WLAN / Ethernet preferred).
 */
export function resolveLanIp(): string | null {
  return selectLanIpFromInterfaces(networkInterfaces());
}
