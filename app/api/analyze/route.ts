import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('Proxy Request Body:', body);

    // For deploy, route to Python via Vercel (no localhost)
    const response = await fetch(`${request.headers.get('x-forwarded-proto') || 'http'}://${request.headers.get('host')}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    console.log('Python Response Status:', response.status);
    const text = await response.text();
    console.log('Raw Python Response Body:', text);

    if (!response.ok) {
      throw new Error(`Python API: ${response.status} - ${text}`);
    }

    const data = JSON.parse(text);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Proxy Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}