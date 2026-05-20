import { describe, expect, it } from 'vitest';
import type { NetworkInterfaceInfo } from 'os';
import {
  getNetworkInterfacePriority,
  isVirtualNetworkInterface,
  selectLanIpFromInterfaces,
} from '@/common/utils/resolveLanIp';

function ipv4(address: string): NetworkInterfaceInfo {
  return { address, family: 'IPv4', internal: false, mac: '00:00:00:00:00:00', netmask: '255.255.255.0', cidr: null };
}

describe('resolveLanIp', () => {
  describe('isVirtualNetworkInterface', () => {
    it('flags VMware and Wi-Fi Direct adapters', () => {
      expect(isVirtualNetworkInterface('VMware Network Adapter VMnet1')).toBe(true);
      expect(isVirtualNetworkInterface('Wireless LAN adapter 本地连接* 9')).toBe(true);
      expect(isVirtualNetworkInterface('本地连接 2')).toBe(true);
    });

    it('does not flag physical WLAN or Ethernet', () => {
      expect(isVirtualNetworkInterface('WLAN')).toBe(false);
      expect(isVirtualNetworkInterface('以太网')).toBe(false);
    });
  });

  describe('selectLanIpFromInterfaces', () => {
    it('prefers WLAN over VMware on Windows-like naming', () => {
      const nets: NodeJS.Dict<NetworkInterfaceInfo[]> = {
        'VMware Network Adapter VMnet1': [ipv4('192.168.153.1')],
        'VMware Network Adapter VMnet8': [ipv4('192.168.78.1')],
        WLAN: [ipv4('172.29.128.120')],
      };
      expect(selectLanIpFromInterfaces(nets)).toBe('172.29.128.120');
    });

    it('prefers Ethernet when WLAN is absent', () => {
      const nets: NodeJS.Dict<NetworkInterfaceInfo[]> = {
        'VMware Network Adapter VMnet1': [ipv4('192.168.153.1')],
        以太网: [ipv4('10.0.0.42')],
      };
      expect(selectLanIpFromInterfaces(nets)).toBe('10.0.0.42');
    });

    it('falls back to any non-internal IPv4 when only virtual names are unknown', () => {
      const nets: NodeJS.Dict<NetworkInterfaceInfo[]> = {
        'Custom NIC': [ipv4('10.1.2.3')],
      };
      expect(selectLanIpFromInterfaces(nets)).toBe('10.1.2.3');
    });
  });

  describe('getNetworkInterfacePriority', () => {
    it('ranks WLAN above generic adapters', () => {
      expect(getNetworkInterfacePriority('WLAN')).toBeGreaterThan(getNetworkInterfacePriority('Custom NIC'));
    });
  });
});
