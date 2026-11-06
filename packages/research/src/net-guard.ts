import { isIP } from 'node:net';

/**
 * Address ranges a research request must never reach: loopback, private,
 * link-local (incl. cloud metadata 169.254.169.254), CGNAT, multicast,
 * reserved and their IPv6 / IPv4-mapped equivalents.
 */
const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function v4ToInt(address: string): number {
  return address.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function isBlockedV4(address: string): boolean {
  const value = v4ToInt(address);
  return BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) === (v4ToInt(base) & mask);
  });
}

/** Expands an IPv6 address into eight 16-bit groups. */
function expandV6(address: string): number[] | null {
  let input = address.toLowerCase().split('%')[0] ?? '';
  // Embedded IPv4 tail, e.g. ::ffff:127.0.0.1
  const v4Tail = input.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Tail?.[1]) {
    const v4 = v4ToInt(v4Tail[1]);
    input = input.replace(v4Tail[1], `${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`);
  }
  const [head = '', tail] = input.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail !== undefined && tail !== '' ? tail.split(':') : [];
  const missing = 8 - headParts.length - tailParts.length;
  if (tail === undefined && headParts.length !== 8) return null;
  if (missing < 0) return null;
  const groups = [...headParts, ...Array<string>(tail === undefined ? 0 : missing).fill('0'), ...tailParts].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

function isBlockedV6(address: string): boolean {
  const g = expandV6(address);
  if (!g) return true;
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, h7 = 0, h8 = 0] = g;
  const embeddedV4 = `${h7 >>> 8}.${h7 & 0xff}.${h8 >>> 8}.${h8 & 0xff}`;
  if (g.every((x) => x === 0)) return true; // ::
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0 && h7 === 0 && h8 === 1) return true; // ::1
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && (f === 0xffff || f === 0)) return isBlockedV4(embeddedV4); // v4-mapped / compatible
  if (a === 0x64 && b === 0xff9b) return isBlockedV4(embeddedV4); // NAT64
  if ((a & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((a & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((a & 0xff00) === 0xff00) return true; // multicast
  if (a === 0x2001 && b === 0x0db8) return true; // documentation
  if (a === 0x2002) return isBlockedV4(`${b >>> 8}.${b & 0xff}.${c >>> 8}.${c & 0xff}`); // 6to4
  return false;
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isBlockedV4(address);
  if (family === 6) return isBlockedV6(address);
  return true;
}

const BLOCKED_HOSTNAMES = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/i;

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (isIP(host)) return isBlockedAddress(host);
  return BLOCKED_HOSTNAMES.test(host) || !host.includes('.');
}
