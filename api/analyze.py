import os
import json
import io
from flask import Flask, request, jsonify
from datetime import datetime
import sys
import traceback
from math import floor

# Load .env.local for Cloudinary
from dotenv import load_dotenv
load_dotenv(dotenv_path='.env.local')  # FIXED: Specify .env.local

# Add python/ to path BEFORE imports
sys.path.insert(0, 'python')

print("Loading modules...")

try:
    import cloudinary
    import cloudinary.uploader
    print("Cloudinary loaded.")
except Exception as e:
    print(f"Cloudinary import error: {e}")
    traceback.print_exc()

try:
    import ffmpeg
    print("FFmpeg loaded.")
except Exception as e:
    print(f"FFmpeg import error: {e}")
    traceback.print_exc()

try:
    from analyze_emotions import extract_frames, analyze_emotions
    print("analyze_emotions loaded.")
except Exception as e:
    print(f"analyze_emotions import error: {e}")
    traceback.print_exc()

app = Flask(__name__)

cloudinary.config(
    cloud_name=os.environ.get('CLOUDINARY_CLOUD_NAME'),
    api_key=os.environ.get('CLOUDINARY_API_KEY'),
    api_secret=os.environ.get('CLOUDINARY_API_SECRET')
)

# FIXED: Print vars after config to confirm
print("Cloudinary vars loaded after config:")
print("CLOUD_NAME:", os.environ.get('CLOUDINARY_CLOUD_NAME'))
print("API_KEY:", os.environ.get('CLOUDINARY_API_KEY')[:5] + "..." if os.environ.get('CLOUDINARY_API_KEY') else "MISSING")
print("API_SECRET:", os.environ.get('CLOUDINARY_API_SECRET')[:5] + "..." if os.environ.get('CLOUDINARY_API_SECRET') else "MISSING")

@app.route('/', methods=['POST'])
def analyze():
    print("Request received!")
    try:
        data = request.json
        print(f"Request data: {data}")
        video_url = data.get('videoUrl')
        expression = data.get('expression', 'all')

        if not video_url:
            print("Missing videoUrl")
            return jsonify({'error': 'Missing videoUrl'}), 400

        print(f"Fetching video: {video_url}")

        # Fetch video
        import requests
        r = requests.get(video_url)
        r.raise_for_status()
        video_buffer = io.BytesIO(r.content)
        mime_type = r.headers.get('content-type', 'video/mp4')
        print("Video fetched, size:", len(video_buffer.getvalue()))

        # Temp file
        temp_dir = '/tmp'
        video_ext = mime_type.split('/')[1] or 'mp4'
        temp_path = os.path.join(temp_dir, f"video_{int(datetime.now().timestamp())}.{video_ext}")
        with open(temp_path, 'wb') as f:
            f.write(video_buffer.read())
        print(f"Temp video saved: {temp_path}")

        # Get duration
        probe = ffmpeg.probe(temp_path)
        duration = float(probe['format']['duration'])
        print(f"Duration: {duration}s")

        # Run analysis
        frames_dir = os.path.join(temp_dir, "temp_frames")
        os.makedirs(frames_dir, exist_ok=True)

        print("Calling extract_frames...")
        _, _ = extract_frames(temp_path, frames_dir, 0.5)
        print("Calling analyze_emotions...")
        emotions_data = analyze_emotions(frames_dir, 0.5)
        print(f"Emotions data length: {len(emotions_data)}")

        # Build analysis
        all_emotions = ["happy", "sad", "angry", "surprised", "neutral", "fear", "disgust"]
        analysis = {emo: [] for emo in all_emotions}
        for data in emotions_data:
            ts = data["timestamp"]
            emo = data["emotion"].lower()
            if emo in analysis and data["confidence"] > 0.5:
                end_seconds = data["seconds"] + 1
                end_str = f"{floor(end_seconds // 3600):02d}:{floor((end_seconds % 3600) // 60):02d}:{floor(end_seconds % 60):02d}"
                analysis[emo].append({
                    "start": ts,
                    "end": end_str,
                    "confidence": float(data["confidence"])
                })

        filtered_analysis = analysis if expression == "all" else {expression: analysis.get(expression, [])}
        print(f"Filtered analysis: {json.dumps(filtered_analysis, indent=2)}")

        # Extract/upload frames
        results = {}
        for exp, occurrences in filtered_analysis.items():
            print(f"Processing {exp}: {len(occurrences)} occurrences")
            frame_datas = []
            for occ in occurrences:
                try:
                    print(f"Extracting frame at {occ['start']}")
                    out, _ = (
                        ffmpeg
                        .input(temp_path, ss=occ["start"])
                        .output('pipe:', vframes=1, format='image2pipe', vcodec='mjpeg')
                        .run(capture_stdout=True, quiet=True)
                    )
                    if out:
                        print("Uploading to Cloudinary...")
                        upload_result = cloudinary.uploader.upload(out, resource_type='image')
                        frame_url = upload_result['secure_url']
                        frame_datas.append({
                            "url": frame_url,
                            "timestamp": occ["start"],
                            "confidence": occ["confidence"]
                        })
                        print(f"Uploaded {exp} frame at {occ['start']} (conf: {occ['confidence']:.2f}): {frame_url}")
                except Exception as e:
                    print(f"Frame extraction failed for {occ['start']}: {e}")
                    traceback.print_exc()
            results[exp] = frame_datas

        # Cleanup
        os.unlink(temp_path)
        if os.path.exists(frames_dir):
            for f in os.listdir(frames_dir):
                os.unlink(os.path.join(frames_dir, f))
            os.rmdir(frames_dir)
        print("Cleanup done")

        print("Returning JSON...")
        return jsonify({'expressions': results})

    except Exception as e:
        print(f"API Error: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)