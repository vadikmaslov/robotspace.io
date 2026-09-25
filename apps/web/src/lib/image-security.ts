const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const IMAGE_TYPES = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
} as const

export { MAX_IMAGE_BYTES }

export class ImageValidationError extends Error {}

export type ValidatedImage = {
  buffer: Buffer
  extension: keyof typeof IMAGE_TYPES
  contentType: (typeof IMAGE_TYPES)[keyof typeof IMAGE_TYPES]
}

export function assertImageRequestSize(contentLength: string | null) {
  if (!contentLength) return
  const size = Number(contentLength)
  if (!Number.isFinite(size) || size < 0 || size > MAX_IMAGE_BYTES + 64 * 1024) {
    throw new ImageValidationError('Image must be 5 MB or smaller')
  }
}

export async function readValidatedImage(file: File): Promise<ValidatedImage> {
  if (!file || file.size === 0) throw new ImageValidationError('Select a non-empty image file')
  if (file.size > MAX_IMAGE_BYTES) throw new ImageValidationError('Image must be 5 MB or smaller')

  const buffer = Buffer.from(await file.arrayBuffer())
  return validateImageBuffer(buffer, file.type)
}

export function validateImageBuffer(buffer: Buffer, declaredType?: string): ValidatedImage {
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    throw new ImageValidationError('Image must be between 1 byte and 5 MB')
  }

  const detected = detectImageType(buffer)
  if (!detected) {
    throw new ImageValidationError('Only JPEG, PNG, WebP, and GIF images are accepted')
  }

  const expectedType = IMAGE_TYPES[detected]
  if (declaredType && declaredType !== expectedType) {
    throw new ImageValidationError('The file type does not match the image contents')
  }

  return { buffer, extension: detected, contentType: expectedType }
}

export function getAllowedRemoteImageUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ImageValidationError('Invalid image URL')
  }

  if (
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    !['unibot.ru', 'upload.wikimedia.org'].some(domain => hostMatches(url.hostname, domain))
  ) {
    throw new ImageValidationError('Image domain not allowed')
  }

  return url
}

export function getAllowedUnibotFeedUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ImageValidationError('Invalid Unibot feed URL')
  }

  if (url.protocol !== 'https:' || url.port || url.username || url.password || !hostMatches(url.hostname, 'unibot.ru')) {
    throw new ImageValidationError('Feed URL must use https://unibot.ru')
  }

  return url
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function hostMatches(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

function detectImageType(buffer: Buffer): keyof typeof IMAGE_TYPES | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  if (buffer.length >= 6 && (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a')) return 'gif'
  return null
}
