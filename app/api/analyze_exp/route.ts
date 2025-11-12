import { NextResponse } from 'next/server';
import { GoogleGenAI } from "@google/genai";
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Dynamically set FFmpeg path
let ffmpegPath: string | undefined;
try {
    // First, try system ffmpeg
    ffmpegPath = execSync('which ffmpeg').toString().trim();
    console.log('Using system FFmpeg at:', ffmpegPath);
} catch (e) {
    // Fallback to static
    if (ffmpegStatic) {
        ffmpegPath = ffmpegStatic;
        console.log('Using static FFmpeg at:', ffmpegPath);
    }
}

if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
} else {
    console.warn('FFmpeg not found. Install via `brew install ffmpeg` on macOS.');
}

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Function to upload a buffer to Cloudinary
async function uploadToCloudinary(buffer: Buffer): Promise<string> {
    console.log('Uploading buffer to Cloudinary, size:', buffer.length);
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { resource_type: 'image' },
            (error, result) => {
                if (error) {
                    console.error('Cloudinary upload error:', error);
                    reject(error);
                } else if (result) {
                    resolve(result.secure_url);
                }
            }
        );
        const readable = new Readable();
        readable._read = () => {};
        readable.push(buffer);
        readable.push(null);
        readable.pipe(uploadStream);
    });
}

// Function to get video duration
async function getVideoDuration(tempPath: string): Promise<number> {
    console.log('Getting video duration for:', tempPath);
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(tempPath, (err, metadata) => {
            if (err) {
                console.error('Error getting video metadata:', err);
                reject(err);
            } else {
                const rawDuration: any = metadata && (metadata as any).format && (metadata as any).format.duration;
                if (rawDuration === undefined || rawDuration === null) {
                    reject(new Error('Could not determine video duration from metadata'));
                    return;
                }
                const duration = typeof rawDuration === 'string' ? parseFloat(rawDuration) : Number(rawDuration);
                console.log('Video duration:', duration, 'seconds');
                resolve(duration);
            }
        });
    });
}

// Function to extract a single frame at a given timestamp to a temp JPEG file
async function extractFrame(tempPath: string, timestamp: string, duration: number): Promise<Buffer | null> {
    // Convert timestamp to seconds for validation
    const tsSeconds = timestamp.split(':').reduce((acc, time) => acc * 60 + parseInt(time), 0);
    console.log(`Extracting frame from ${tempPath} at timestamp ${timestamp} (${tsSeconds}s), video duration: ${duration}s`);
    
    if (tsSeconds > duration) {
        console.warn(`Timestamp ${timestamp} exceeds video duration ${duration}s, skipping`);
        return null;
    }

    const tempImagePath = path.join(os.tmpdir(), `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`);
    console.log('Temp image path:', tempImagePath);

    return new Promise((resolve, reject) => {
        if (!ffmpegPath) {
            reject(new Error('FFmpeg not available. Please install FFmpeg.'));
            return;
        }

        const command = ffmpeg(tempPath)
            .seekInput(timestamp)
            .frames(1)
            .outputOptions('-y')
            .toFormat('image2')
            .on('start', (cmdline) => {
                console.log('FFmpeg command started:', cmdline);
            })
            .on('progress', (progress) => {
                console.log(`FFmpeg progress for ${timestamp}: ${progress.percent}%`);
            })
            .on('error', (err, stdout, stderr) => {
                console.error(`FFmpeg error for ${timestamp}:`, err.message);
                console.error('Stdout:', stdout);
                console.error('Stderr:', stderr);
                reject(err);
            })
            .save(tempImagePath);

        command.run();

        command.on('end', () => {
            console.log(`Frame extraction completed for ${timestamp}`);
            if (fs.existsSync(tempImagePath)) {
                const buffer = fs.readFileSync(tempImagePath);
                console.log(`Frame buffer size for ${timestamp}: ${buffer.length} bytes`);
                // Clean up temp image
                fs.unlinkSync(tempImagePath);
                resolve(buffer);
            } else {
                reject(new Error('Temp image file not created'));
            }
        });
    });
}

// Function to clean markdown code blocks from response
function cleanResponse(text: string): string {
    const cleaned = text.replace(/```(?:json)?\s*|\s*```/g, '').trim();
    console.log('Cleaned response:', cleaned);
    return cleaned;
}

export async function POST(request: Request) {
    try {
        console.log('Received POST to /api/analyze');
        const { videoUrl, expression } = await request.json();

        if (!videoUrl) {
            return NextResponse.json({ message: "Missing videoUrl" }, { status: 400 });
        }

        console.log('Processing video URL:', videoUrl);
        console.log('Expression:', expression);

        // Fetch the video from the URL
        console.log('Fetching video...');
        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) {
            throw new Error(`Failed to fetch video: ${videoResponse.statusText}`);
        }
        const arrayBuffer = await videoResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mimeType = videoResponse.headers.get('content-type') || 'video/mp4';
        console.log('Video fetched, size:', buffer.length, 'bytes, MIME:', mimeType);

        // Check size limit for inline data (<20MB)
        if (buffer.length > 20 * 1024 * 1024) {
            return NextResponse.json({ message: "Video too large for analysis (max 20MB)" }, { status: 400 });
        }

        const base64 = buffer.toString('base64');
        console.log('Video converted to base64');

        const model = "gemini-2.5-flash";
        const isAllExpressions = !expression || expression === "all";
        const allExpressions = ["happy", "sad", "angry", "surprised", "neutral"];

        let prompt: string;
        if (isAllExpressions) {
            prompt = `
                Analyze this video and detect the following facial expressions on the primary human subject: ${allExpressions.join(", ")}.
                For each detected expression, identify all timestamps where it occurs.
                Provide start and end timestamps for each occurrence in "HH:MM:SS" format.
                Respond ONLY with a valid JSON object where each key is an expression name from the list, and the value is an array of objects with "start" and "end" keys.
                If no occurrences for an expression, use an empty array.
                Do not include any other text.
                Example: {
                  "happy": [{"start": "00:00:10", "end": "00:00:12"}],
                  "sad": [],
                  "angry": [{"start": "00:00:25", "end": "00:00:28"}],
                  "surprised": [],
                  "neutral": [{"start": "00:01:00", "end": "00:01:05"}]
                }
            `;
        } else {
            prompt = `
                Analyze this video and identify all timestamps where the primary human subject shows the expression: "${expression}".
                Provide start and end timestamps for each occurrence in "HH:MM:SS" format.
                Respond ONLY with a JSON array of objects, where each object has "start" and "end" keys.
                Do not include any other text.
                Example: [{"start": "00:00:10", "end": "00:00:12"}, {"start": "00:00:25", "end": "00:00:28"}]
            `;
        }

        console.log('Sending to AI model:', model);
        const contents = [
            {
                inlineData: {
                    data: base64,
                    mimeType: mimeType,
                },
            },
            { text: prompt },
        ];

        const result = await genAI.models.generateContent({
            model: model,
            contents: contents,
        });

        const responseText = result.text;
        console.log('AI raw response:', responseText);
        if (!responseText) {
            return NextResponse.json({ message: "No response from AI model" }, { status: 500 });
        }

        const cleanText = cleanResponse(responseText);
        let analysis: Record<string, { start: string; end: string }[]>;
        if (isAllExpressions) {
            try {
                analysis = JSON.parse(cleanText);
                if (typeof analysis !== 'object' || analysis === null) {
                    throw new Error('Invalid JSON structure');
                }
                // Ensure all expressions have arrays, even empty
                for (const exp of allExpressions) {
                    if (!(exp in analysis)) {
                        analysis[exp] = [];
                    }
                }
            } catch (parseError) {
                console.error("Failed to parse analysis:", parseError);
                return NextResponse.json({ message: "Failed to parse analysis result" }, { status: 500 });
            }
        } else {
            let timestamps: { start: string; end: string }[];
            try {
                timestamps = JSON.parse(cleanText);
                if (!Array.isArray(timestamps)) {
                    throw new Error('Invalid JSON structure');
                }
            } catch (parseError) {
                console.error("Failed to parse timestamps:", parseError);
                return NextResponse.json({ message: "Failed to parse analysis result" }, { status: 500 });
            }
            analysis = { [expression]: timestamps };
        }
        console.log('Parsed analysis:', JSON.stringify(analysis, null, 2));

        // Create temp file for video
        const tempDir = os.tmpdir();
        const videoExt = mimeType.split('/')[1] || 'mp4';
        const tempPath = path.join(tempDir, `video_${Date.now()}.${videoExt}`);
        console.log('Writing video to temp file:', tempPath);
        fs.writeFileSync(tempPath, buffer);

        const duration = await getVideoDuration(tempPath);

        try {
            const results: Record<string, string[]> = {};

            for (const [exp, timestamps] of Object.entries(analysis)) {
                console.log(`Processing expression: ${exp} with ${timestamps.length} timestamps`);
                const frameUrls: string[] = [];
                for (const ts of timestamps) {
                    const imageBuffer = await extractFrame(tempPath, ts.start, duration);
                    if (imageBuffer) {
                        const frameUrl = await uploadToCloudinary(imageBuffer);
                        console.log(`Uploaded frame for ${exp} at ${ts.start}: ${frameUrl}`);
                        frameUrls.push(frameUrl);
                    } else {
                        console.log(`Skipped frame for ${exp} at ${ts.start} due to invalid timestamp`);
                    }
                }
                results[exp] = frameUrls;
            }

            const responseData = Object.keys(results).length > 0 
                ? { expressions: results } 
                : { expressions: {}, message: "No matching expressions found" };

            return NextResponse.json(responseData);
        } finally {
            // Clean up temp file
            console.log('Cleaning up temp file:', tempPath);
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }
        }

    } catch (error) {
        console.error("Error in /api/analyze:", error);
        return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
    }
}