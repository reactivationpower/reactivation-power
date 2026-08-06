import { type NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { getSession } from '@/lib/auth/session'

export const maxDuration = 300

/**
 * Streams private blobs (videos, attachments, thumbnails).
 * Learners must have a session; the admin area passes ?admin=1
 * (admin is unauthenticated for now, per requirements).
 *
 * Supports HTTP Range requests by forwarding the Range header to
 * blob storage — required for <video> playback and seeking in browsers.
 */
export async function GET(request: NextRequest) {
  const pathname = request.nextUrl.searchParams.get('pathname')
  const isAdmin = request.nextUrl.searchParams.get('admin') === '1'

  if (!pathname) {
    return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
  }

  if (!isAdmin) {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const range = request.headers.get('range')

  try {
    const result = await get(pathname, {
      access: 'private',
      ifNoneMatch: range
        ? undefined
        : (request.headers.get('if-none-match') ?? undefined),
      headers: range ? { Range: range } : undefined,
    })

    if (!result) {
      return new NextResponse('Not found', { status: 404 })
    }

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          'Cache-Control': 'private, no-cache',
        },
      })
    }

    const upstreamContentRange = result.headers.get('content-range')
    const upstreamContentLength = result.headers.get('content-length')
    const isPartial = Boolean(range && upstreamContentRange)

    const headers: Record<string, string> = {
      'Content-Type': result.blob.contentType || 'application/octet-stream',
      ETag: result.blob.etag,
      'Cache-Control': 'private, no-cache',
      'Accept-Ranges': 'bytes',
    }

    if (isPartial && upstreamContentRange) {
      headers['Content-Range'] = upstreamContentRange
      if (upstreamContentLength) {
        headers['Content-Length'] = upstreamContentLength
      }
    } else {
      headers['Content-Length'] = String(result.blob.size)
    }

    const download = request.nextUrl.searchParams.get('download')
    if (download) {
      headers['Content-Disposition'] =
        `attachment; filename="${download.replace(/"/g, '')}"`
    }

    return new NextResponse(result.stream, {
      status: isPartial ? 206 : 200,
      headers,
    })
  } catch (error) {
    console.error('Error serving media:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
