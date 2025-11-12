import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('Proxy Request Body:', body);  // Log input

    const response = await fetch('http://localhost:5001/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    console.log('Python Response Status:', response.status);  // Log status

    const text = await response.text();
    console.log('Raw Python Response Body:', text);  // FIXED: Log raw body before parse

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