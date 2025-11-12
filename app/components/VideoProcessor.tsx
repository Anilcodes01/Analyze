// src/components/VideoProcessor.tsx
"use client";

import { useState } from 'react';
import axios from 'axios';

const expressions = ["all", "happy", "sad", "angry", "surprised", "neutral"];

export interface FrameData {
  url: string;
  timestamp: string;
  confidence: number;
}

interface ExtractedExpressions {
  [key: string]: FrameData[];
}

export default function VideoProcessor() {
  const [inputMode, setInputMode] = useState<'file' | 'url'>('file');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [selectedExpression, setSelectedExpression] = useState<string>("happy");
  const [processing, setProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [extractedExpressions, setExtractedExpressions] = useState<ExtractedExpressions>({});
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const clearLogs = () => setLogs([]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);
    setError(null);
    setExtractedExpressions({});
    clearLogs();

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);

    try {
      const response = await axios.post(
        `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/video/upload`,
        formData,
        {
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setUploadProgress(percent);
              addLog(`Uploading: ${percent}%`);
            }
          },
        }
      );
      setVideoUrl(response.data.secure_url);
      addLog("Upload complete! Video ready.");
    } catch (err) {
      setError("Failed to upload video. Please try again.");
      console.error(err);
      addLog("Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleSetUrl = () => {
    if (urlInput.startsWith('http')) {
      setVideoUrl(urlInput);
      setError(null);
      setExtractedExpressions({});
      clearLogs();
      addLog("URL set successfully.");
    } else {
      setError("Please enter a valid URL starting with http or https.");
    }
  };

  const handleProcessVideo = async () => {
    if (!videoUrl) {
      setError("Please provide a video URL or upload a video first.");
      return;
    }

    setProcessing(true);
    setProcessProgress(0);
    setError(null);
    setExtractedExpressions({});
    clearLogs();
    addLog("Starting video analysis...");

    try {
      const interval = setInterval(() => {
        setProcessProgress(prev => {
          const newProgress = prev + Math.random() * 15;
          return newProgress > 95 ? 95 : newProgress;
        });
      }, 500);

      const response = await axios.post('/api/analyze', {
        videoUrl,
        expression: selectedExpression,
      }, {
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.progress || 0) * 100);
            setProcessProgress(percent);
          }
        },
      });

      clearInterval(interval);
      setProcessProgress(100);
      setExtractedExpressions(response.data.expressions || {});
      
      if (Object.keys(response.data.expressions || {}).length === 0) {
        setError(response.data.message || "No matching expressions found. Try a different video or expression!");
        addLog("No expressions detected.");
      } else {
        addLog("Analysis complete! Frames extracted.");
      }

      Object.entries(response.data.expressions || {}).forEach(([exp, frames]) => {
        (frames as FrameData[]).forEach((frame: FrameData, idx: number) => {
          addLog(`${exp} frame ${idx + 1}: ${frame.timestamp} (Confidence: ${(frame.confidence || 0.8).toFixed(2)})`);
        });
      });
    } catch (err) {
      setError("Failed to process video and extract frames. Check logs.");
      console.error(err);
      addLog("Processing failed.");
    } finally {
      setTimeout(() => setProcessProgress(0), 1000);
      setProcessing(false);
    }
  };

  const getDisplayName = (exp: string) => {
    if (exp === 'all') return 'All Expressions';
    return exp.charAt(0).toUpperCase() + exp.slice(1);
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-gray-800/80 backdrop-blur-md p-8 rounded-xl shadow-2xl border border-gray-700/50 relative">
      {uploading && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-blue-300 mb-2">Upload Progress</label>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{uploadProgress}%</p>
        </div>
      )}

      <div className="mb-6">
        <label className="block mb-2 text-sm font-medium text-gray-300">Input Method</label>
        <div className="flex space-x-4 mb-4">
          <label className="flex items-center">
            <input
              type="radio"
              name="inputMode"
              value="file"
              checked={inputMode === 'file'}
              onChange={(e) => setInputMode(e.target.value as 'file')}
              className="mr-2 text-blue-500"
            />
            <span className="text-gray-300">Upload File</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="inputMode"
              value="url"
              checked={inputMode === 'url'}
              onChange={(e) => setInputMode(e.target.value as 'url')}
              className="mr-2 text-blue-500"
            />
            <span className="text-gray-300">Enter URL</span>
          </label>
        </div>

        {inputMode === 'file' && (
          <div>
            <label htmlFor="video-upload" className="block mb-2 text-sm font-medium text-gray-300">
              Upload your video (1-2 mins, MP4 recommended)
            </label>
            <input
              id="video-upload"
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gradient-to-r file:from-blue-500 file:to-purple-600 file:text-white hover:file:from-blue-600 hover:file:to-purple-700"
              disabled={uploading || processing}
            />
          </div>
        )}

        {inputMode === 'url' && (
          <div className="space-y-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/video.mp4"
              className="block w-full text-sm text-gray-400 bg-gray-700 border border-gray-600 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              disabled={processing}
            />
            <button
              onClick={handleSetUrl}
              disabled={!urlInput || processing}
              className="w-full text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:ring-4 focus:outline-none focus:ring-blue-800 font-medium rounded-lg text-sm px-5 py-2.5 text-center disabled:bg-gray-500 transition-all"
            >
              Set Video URL
            </button>
          </div>
        )}
      </div>

      {videoUrl && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-2">Video Preview:</h3>
          <video controls src={videoUrl} className="w-full rounded-lg shadow-lg"></video>
        </div>
      )}

      <div className="mb-6">
        <label htmlFor="expression" className="block mb-2 text-sm font-medium text-gray-300">
          Select Expression to Detect
        </label>
        <select
          id="expression"
          value={selectedExpression}
          onChange={(e) => setSelectedExpression(e.target.value)}
          className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block w-full p-2.5 transition-all"
          disabled={processing}
        >
          {expressions.map((exp) => (
            <option key={exp} value={exp}>
              {getDisplayName(exp)}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleProcessVideo}
        disabled={!videoUrl || processing || uploading}
        className="w-full relative overflow-hidden text-white bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 focus:ring-4 focus:outline-none focus:ring-green-800 font-medium rounded-lg text-sm px-5 py-2.5 text-center disabled:bg-gray-500 transition-all group"
      >
        <span className={`absolute inset-0 bg-gradient-to-r from-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ${processing ? 'hidden' : ''}`}></span>
        <span className="relative z-10">
          {processing ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Analyzing Emotions...
            </span>
          ) : (
            '🔍 Find Expression Frames'
          )}
        </span>
      </button>

      {processing && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-blue-300 mb-2">Analysis Progress</label>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${processProgress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{Math.round(processProgress)}% - Extracting frames & detecting emotions...</p>
        </div>
      )}

      <div className="mt-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">Processing Logs</label>
        <div className="bg-gray-900/50 border border-gray-600 rounded-lg p-3 max-h-32 overflow-y-auto text-xs text-gray-400 space-y-1">
          {logs.length === 0 ? (
            <p className="text-gray-500 italic">Logs will appear here during processing...</p>
          ) : (
            logs.map((log, idx) => <div key={idx}>{log}</div>)
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-900/50 border border-red-600 rounded-lg text-red-300 text-sm">
          ⚠️ {error}
          {error.includes("no matching") && (
            <div className="mt-2 text-xs">
              <p>Tip: Try a video with clear facial expressions or adjust the interval in backend.</p>
            </div>
          )}
        </div>
      )}

      {Object.keys(extractedExpressions).length > 0 && (
        <div className="mt-8">
          {Object.entries(extractedExpressions)
            .filter(([_, frames]) => frames.length > 0)
            .map(([exp, frames]) => (
              <div key={exp} className="mb-8">
                <h3 className="text-2xl font-bold text-white mb-4 bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                  🎭 {getDisplayName(exp)} ({frames.length} frames found)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {(frames as FrameData[]).map((frame: FrameData, index: number) => (
                    <div key={index} className="bg-gray-900/50 rounded-lg p-3 border border-gray-600/50">
                      <img
                        src={frame.url}
                        alt={`Frame ${index + 1} - ${frame.timestamp}`}
                        className="w-full h-32 object-cover rounded-md mb-2"
                      />
                      <div className="text-xs space-y-1">
                        <p className="text-gray-300">⏱️ {frame.timestamp}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-green-400">📊 Confidence: {(frame.confidence * 100).toFixed(1)}%</span>
                          <a
                            href={frame.url}
                            download={`frame_${exp}_${index + 1}.jpg`}
                            className="text-blue-400 hover:text-blue-300 underline"
                          >
                            💾 Download
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}