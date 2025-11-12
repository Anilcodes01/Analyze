import os
import json
import io
from flask import Flask, request, jsonify
import cloudinary
import cloudinary.uploader
from datetime import datetime
import ffmpeg
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # Add root for imports
from python.analyze_emotions import extract_frames, analyze_emotions  # Import functions

app = Flask(__name__)

cloudinary.config(
    cloud_name=os.environ.get('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME'),
    api_key=os.environ.get('CLOUDINARY_API_KEY'),
    api_secret=os.environ.get('CLOUDINARY_API_SECRET')
)

@app.route('/api/analyze', methods=['POST'])
def analyze():
    try:
        data = request.json
        video_url = data.get('videoUrl')
        expression = data.get('expression', 'all')

        if not video_url:
            return jsonify({'error': 'Missing videoUrl'}), 400

        import requests
        r = requests.get(video_url)
        r.raise_for_status()
        video_buffer = io.BytesIO(r.content)
        mime_type = r.headers.get('content-type', 'video/mp4')

        temp_dir = '/tmp'
        video_ext = mime_type.split('/')[1] or 'mp4'
        temp_path = os.path.join(temp_dir, f"video_{int(datetime.now().timestamp())}.{video_ext}")
        with open(temp_path, 'wb') as f:
            f.write(video_buffer.read())

        probe = ffmpeg.probe(temp_path)
        duration = float(probe['format']['duration'])

        frames_dir = os.path.join(temp_dir, "temp_frames")
        os.makedirs(frames_dir, exist_ok=True)

        _, _ = extract_frames(temp_path, frames_dir, 0.5)
        emotions_data = analyze_emotions(frames_dir, 0.5)

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

        results = {}
        for exp, occurrences in filtered_analysis.items():
            frame_datas = []
            for occ in occurrences:
                try:
                    out, _ = (
                        ffmpeg
                        .input(temp_path, ss=occ["start"])
                        .output('pipe:', vframes=1, format='image2pipe', vcodec='mjpeg')
                        .run(capture_stdout=True, quiet=True)
                    )
                    if out:
                        upload_result = cloudinary.uploader.upload(out, resource_type='image')
                        frame_url = upload_result['secure_url']
                        frame_datas.append({
                            "url": frame_url,
                            "timestamp": occ["start"],
                            "confidence": occ["confidence"]
                        })
                except Exception as e:
                    print(f"Frame extraction failed for {occ['start']}: {e}")
            results[exp] = frame_datas

        os.unlink(temp_path)
        if os.path.exists(frames_dir):
            for f in os.listdir(frames_dir):
                os.unlink(os.path.join(frames_dir, f))
            os.rmdir(frames_dir)

        return jsonify({'expressions': results})

    except Exception as e:
        print(f"API Error: {e}")
        return jsonify({'error': 'Internal Server Error'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)