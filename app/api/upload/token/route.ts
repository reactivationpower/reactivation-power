import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { type NextRequest, NextResponse } from 'next/server'

// Issues short-lived client tokens so the browser uploads files DIRECTLY to
// Blob storage. This bypasses the server entirely, which is required for
// large video files (150MB+): serverless functions reject bodies over ~4.5MB
// in production, and proxying large uploads through the server is slow and
// error-prone.
export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        // Admin area is unauthenticated for now (matches /api/upload).
        // Restrict uploads to the folders the admin UI actually uses.
        const allowedPrefixes = ['videos/', 'attachments/', 'thumbnails/']
        if (!allowedPrefixes.some((p) => pathname.startsWith(p))) {
          throw new Error('Invalid upload folder')
        }
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: 5 * 1024 * 1024 * 1024, // 5GB
        }
      },
      // No onUploadCompleted: the client saves the pathname to the database
      // itself after upload. Providing the callback without a public
      // callbackUrl causes errors in local/preview environments.
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error('Upload token error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 400 },
    )
  }
}
