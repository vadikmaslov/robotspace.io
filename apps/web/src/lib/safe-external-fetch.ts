import dns from 'node:dns/promises'
import { isIP } from 'node:net'

const PRIVATE_RANGES: Array<[string, string]> = [
  ['0.0.0.0', '0.255.255.255'], ['10.0.0.0', '10.255.255.255'],
  ['100.64.0.0', '100.127.255.255'], ['127.0.0.0', '127.255.255.255'],
  ['169.254.0.0', '169.254.255.255'], ['172.16.0.0', '172.31.255.255'],
  ['192.168.0.0', '192.168.255.255'],
]

export async function safeExternalFetch(url: string, init: RequestInit): Promise<Response> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password) {
    throw new Error('Only credential-free HTTPS provider URLs are allowed')
  }

  const addresses = await dns.resolve4(parsed.hostname)
  if (!addresses.length || addresses.some(isPrivateAddress)) {
    throw new Error('Provider URL resolves to a blocked network address')
  }

  return fetch(parsed, { ...init, redirect: 'error' })
}

function isPrivateAddress(address: string) {
  if (!isIP(address)) return true
  const value = toInteger(address)
  return PRIVATE_RANGES.some(([start, end]) => value >= toInteger(start) && value <= toInteger(end))
}

function toInteger(address: string) {
  return address.split('.').reduce((value, octet) => (value * 256) + Number(octet), 0)
}
