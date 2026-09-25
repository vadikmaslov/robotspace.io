import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

type ImageNamespace = 'articles' | 'brands' | 'companies' | 'robots' | 'sources'

type StoreImageInput = {
  namespace: ImageNamespace
  filename: string
  buffer: Buffer
  contentType: string
}

function s3Configuration() {
  const endpoint = process.env.S3_ENDPOINT
  const bucket = process.env.S3_BUCKET
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_KEY

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null

  return {
    endpoint: endpoint.replace(/\/$/, ''),
    bucket,
    client: new S3Client({
      endpoint,
      region: process.env.S3_REGION ?? 'us-east-1',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
      credentials: { accessKeyId, secretAccessKey },
    }),
  }
}

function publicUrl(endpoint: string, bucket: string, key: string) {
  const base = (process.env.S3_PUBLIC_BASE_URL ?? `${endpoint}/${bucket}`).replace(/\/$/, '')
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`
}

export async function storeImage({ namespace, filename, buffer, contentType }: StoreImageInput) {
  const s3 = s3Configuration()
  const key = `images/${namespace}/${filename}`

  if (s3) {
    await s3.client.send(new PutObjectCommand({
      Bucket: s3.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read',
      CacheControl: 'public, max-age=31536000, immutable',
    }))
    return publicUrl(s3.endpoint, s3.bucket, key)
  }

  if (process.env.NODE_ENV === 'production') throw new Error('S3 image storage is not configured')

  const uploadDir = path.join(process.cwd(), 'public', 'uploads', namespace)
  await mkdir(uploadDir, { recursive: true })
  await writeFile(path.join(uploadDir, filename), buffer)
  return `/uploads/${namespace}/${filename}`
}
