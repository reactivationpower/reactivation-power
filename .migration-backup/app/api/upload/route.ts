import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300

// Admin upload endpoint (admin area is unauthenticated for now, per requirements)
// Accepts the file as a raw request body (not multipart form data) — large
// video uploads intermittently broke multipart parsing ("no boundary found").
// File name and kind are passed as query params instead.
export async function POST(request: NextRequest) {
  try {
    const kind = request.nextUrl.searchParams.get('kind') ?? 'video' // video | attachment | thumbnail
    const fileName = request.nextUrl.searchParams.get('name') ?? ''
    const contentType =
      request.headers.get('content-type') ?? 'application/octet-stream'

    // Backward compatibility: still handle multipart form posts
    if (contentType.startsWith('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      const formKind = String(formData.get('kind') ?? kind)
      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 })
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const blob = await put(`${formKind}s/${safeName}`, file, {
        access: 'private',
        addRandomSuffix: true,
      })
      return NextResponse.json({
        pathname: blob.pathname,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      })
    }

    if (!fileName) {
      return NextResponse.json(
        { error: 'Missing file name' },
        { status: 400 },
      )
    }

    const body = await request.blob()
    if (body.size === 0) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 })
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const blob = await put(`${kind}s/${safeName}`, body, {
      access: 'private',
      addRandomSuffix: true,
      contentType,
    })

    return NextResponse.json({
      pathname: blob.pathname,
      fileName,
      fileSize: body.size,
      fileType: contentType,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
