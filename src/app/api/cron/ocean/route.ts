import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId } = body;
    
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // OCEAN generation is pending PB migration
    return NextResponse.json({ status: "skipped", reason: "OCEAN generation not available until PB migration" });
  } catch (error: any) {
    console.error("OCEAN generation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
