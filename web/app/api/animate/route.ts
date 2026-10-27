import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({
    videoUrl: null,
    message: 'Video animation is disabled. Cloned voice audio active.',
  });
}
