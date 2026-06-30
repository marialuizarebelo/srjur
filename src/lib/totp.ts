// Gerador TOTP (RFC 6238) usando Web Crypto API — sem dependências externas

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Decode(input: string): Uint8Array {
  const clean = input.replace(/\s/g, '').toUpperCase().replace(/=+$/, '')
  let bits = ''
  for (const char of clean) {
    const val = BASE32_ALPHABET.indexOf(char)
    if (val === -1) continue
    bits += val.toString(2).padStart(5, '0')
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8))
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2)
  }
  return bytes
}

function intToBytes(num: number): Uint8Array {
  const buf = new ArrayBuffer(8)
  const view = new DataView(buf)
  // JS numbers are safe up to 2^53, counter fits in lower 32 bits for our timeframe
  view.setUint32(4, num)
  return new Uint8Array(buf)
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, message)
  return new Uint8Array(sig)
}

export async function generateTOTP(secretBase32: string, period = 30, digits = 6): Promise<string> {
  if (!secretBase32) return ''
  try {
    const key = base32Decode(secretBase32)
    const counter = Math.floor(Date.now() / 1000 / period)
    const counterBytes = intToBytes(counter)
    const hmac = await hmacSha1(key, counterBytes)
    const offset = hmac[hmac.length - 1] & 0xf
    const binCode =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)
    const otp = (binCode % 10 ** digits).toString().padStart(digits, '0')
    return otp
  } catch {
    return '------'
  }
}

export function secondsRemaining(period = 30): number {
  return period - (Math.floor(Date.now() / 1000) % period)
}
