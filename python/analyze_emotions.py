import sys
import json
import os
import cv2
from deepface import DeepFace
import argparse
from math import floor  # For precise timestamp calculations
import numpy as np  # For float32 handling

print("Script started - imports loading...")  # Early log for stdout

def extract_frames(video_path, output_dir, interval_seconds=0.5):
    print(f"Extracting frames from {video_path} every {interval_seconds}s...")
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video file: {video_path}")
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0
    frame_timestamps = []
    
    frame_idx = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        
        if frame_idx % int(fps * interval_seconds) == 0:
            frame_path = os.path.join(output_dir, f"frame_{len(frame_timestamps):04d}.jpg")
            success = cv2.imwrite(frame_path, frame)
            if not success:
                print(f"Warning: Failed to write frame {frame_path}")
                continue
            
            ts_seconds = frame_idx / fps
            hours = floor(ts_seconds // 3600)
            minutes = floor((ts_seconds % 3600) // 60)
            seconds = floor(ts_seconds % 60)
            ts_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
            
            frame_timestamps.append({
                "frame_path": frame_path,
                "timestamp": ts_str,
                "seconds": ts_seconds
            })
            print(f"Extracted frame at {ts_str}")
        
        frame_idx += 1
    
    cap.release()
    print(f"Extracted {len(frame_timestamps)} frames from {duration:.2f}s video.")
    return frame_timestamps, duration

def analyze_emotions(frames_dir, interval_seconds=0.5):
    print(f"Analyzing emotions in {frames_dir}...")
    results = []
    for filename in sorted(os.listdir(frames_dir)):
        if filename.endswith('.jpg'):
            frame_path = os.path.join(frames_dir, filename)
            try:
                analysis = DeepFace.analyze(
                    frame_path, 
                    actions=['emotion'], 
                    enforce_detection=False,
                    detector_backend='opencv'
                )
                dominant_emotion = analysis[0]['dominant_emotion']
                confidence = float(analysis[0]['emotion'][dominant_emotion])  # Convert to plain float early
                
                idx = int(filename.split('_')[1].split('.')[0])
                ts_seconds = idx * interval_seconds
                hours = floor(ts_seconds // 3600)
                minutes = floor((ts_seconds % 3600) // 60)
                seconds = floor(ts_seconds % 60)
                ts_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
                
                results.append({
                    "timestamp": ts_str,
                    "emotion": dominant_emotion,
                    "confidence": confidence,
                    "seconds": ts_seconds
                })
                print(f"Analyzed {filename}: {dominant_emotion} ({confidence:.2f}) at {ts_str}")
                
                os.remove(frame_path)
            except Exception as e:
                print(f"Error analyzing {filename}: {e} (skipping)")
                if os.path.exists(frame_path):
                    os.remove(frame_path)
                continue
    
    print(f"Analyzed {len(results)} frames successfully.")
    return results

if __name__ == "__main__":
    print("Parsing args...")
    parser = argparse.ArgumentParser(description="Analyze emotions in video frames using DeepFace.")
    parser.add_argument("video_path", help="Path to video file")
    parser.add_argument("output_json", help="Path to output JSON file")
    parser.add_argument("--interval", type=float, default=0.5, help="Frame extraction interval in seconds")
    args = parser.parse_args()
    print(f"Args: video={args.video_path}, output={args.output_json}, interval={args.interval}")
    
    frames_dir = os.path.join(os.path.dirname(args.output_json), "temp_frames")
    os.makedirs(frames_dir, exist_ok=True)
    
    try:
        frame_timestamps, duration = extract_frames(args.video_path, frames_dir, args.interval)
        emotions_data = analyze_emotions(frames_dir, args.interval)
        
        analysis = {}
        emotions = ["happy", "sad", "angry", "surprised", "neutral", "fear", "disgust"]
        for emo in emotions:
            analysis[emo] = []
        
        for data in emotions_data:
            ts = data["timestamp"]
            emo = data["emotion"].lower()
            if emo in analysis and data["confidence"] > 0.5:
                end_seconds = data["seconds"] + 1
                end_hours = floor(end_seconds // 3600)
                end_minutes = floor((end_seconds % 3600) // 60)
                end_seconds_final = floor(end_seconds % 60)
                end_str = f"{end_hours:02d}:{end_minutes:02d}:{end_seconds_final:02d}"
                analysis[emo].append({
                    "start": ts, 
                    "end": end_str,
                    "confidence": float(data["confidence"])  # Ensure plain float for JSON
                })
                print(f"Added {emo} occurrence: {ts} - {end_str} (conf: {data['confidence']:.2f})")
        
        output = {
            "analysis": analysis,
            "duration": duration,
            "total_frames_analyzed": len(emotions_data),
            "interval_used": args.interval
        }
        
        with open(args.output_json, "w") as f:
            json.dump(output, f, indent=2)
        
        print(f"Analysis complete. Output: {args.output_json}")
        
    except Exception as e:
        print(f"Script error: {e}")
        import traceback
        traceback.print_exc()  # Full traceback to stderr
        sys.exit(1)
    finally:
        if os.path.exists(frames_dir):
            for file in os.listdir(frames_dir):
                os.remove(os.path.join(frames_dir, file))
            os.rmdir(frames_dir)