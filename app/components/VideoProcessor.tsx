// src/app/components/VideoProcessor.tsx
"use client";

import { useState } from 'react';
import axios from 'axios';

const expressions = ["all", "happy", "sad", "angry", "surprised", "neutral"];

export default function VideoProcessor() {
  const [inputMode, setInputMode] = useState<'file' | 'url'>('file');
  const [uploading, setUploading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [selectedExpression, setSelectedExpression] = useState<string>("happy");
  const [processing, setProcessing] = useState(false);
  const [extractedExpressions, setExtractedExpressions] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setExtractedExpressions({});

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);

    try {
      const response = await axios.post(
        `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/video/upload`,
        formData
      );
      setVideoUrl(response.data.secure_url);
    } catch (err) {
      setError("Failed to upload video. Please try again.");
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleSetUrl = () => {
    if (urlInput.startsWith('http')) {
      setVideoUrl(urlInput);
      setError(null);
      setExtractedExpressions({});
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
    setError(null);
    setExtractedExpressions({});

    try {
      const response = await axios.post('/api/analyze_exp', {
        videoUrl,
        expression: selectedExpression,
      });
      setExtractedExpressions(response.data.expressions);
      if (Object.keys(response.data.expressions).length === 0) {
        setError(response.data.message || "No matching expressions found.");
      }
    } catch (err) {
      setError("Failed to process video and extract frames.");
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  const getDisplayName = (exp: string) => {
    if (exp === 'all') return 'All Expressions';
    return exp.charAt(0).toUpperCase() + exp.slice(1);
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-gray-800 p-8 rounded-lg shadow-md">
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
              className="mr-2"
            />
            Upload File
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="inputMode"
              value="url"
              checked={inputMode === 'url'}
              onChange={(e) => setInputMode(e.target.value as 'url')}
              className="mr-2"
            />
            Enter URL
          </label>
        </div>

        {inputMode === 'file' && (
          <div>
            <label htmlFor="video-upload" className="block mb-2 text-sm font-medium text-gray-300">
              Upload your video (1-2 mins)
            </label>
            <input
              id="video-upload"
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              disabled={uploading || processing}
            />
            {uploading && <p className="text-blue-400 mt-2">Uploading...</p>}
          </div>
        )}

        {inputMode === 'url' && (
          <div className="space-y-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/video.mp4"
              className="block w-full text-sm text-gray-400 bg-gray-700 border border-gray-600 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
              disabled={processing}
            />
            <button
              onClick={handleSetUrl}
              disabled={!urlInput || processing}
              className="w-full text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-800 font-medium rounded-lg text-sm px-5 py-2.5 text-center disabled:bg-gray-500"
            >
              Set Video URL
            </button>
          </div>
        )}
      </div>

      {videoUrl && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-2">Video ready for processing:</h3>
          <video controls src={videoUrl} className="w-full rounded"></video>
        </div>
      )}

      <div className="mb-6">
        <label htmlFor="expression" className="block mb-2 text-sm font-medium text-gray-300">
          Select an expression to find
        </label>
        <select
          id="expression"
          value={selectedExpression}
          onChange={(e) => setSelectedExpression(e.target.value)}
          className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
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
        className="w-full text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-800 font-medium rounded-lg text-sm px-5 py-2.5 text-center disabled:bg-gray-500"
      >
        {processing ? 'Processing...' : 'Find Expression Frames'}
      </button>

      {error && <p className="text-red-400 mt-4">{error}</p>}

      {Object.keys(extractedExpressions).length > 0 && (
        <div className="mt-8">
          {Object.entries(extractedExpressions)
            .filter(([_, frames]) => frames.length > 0)
            .map(([exp, frames]) => (
              <div key={exp} className="mb-8">
                <h3 className="text-2xl font-bold text-white mb-4">
                  Expression: {getDisplayName(exp)}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {frames.map((frameUrl, index) => (
                    <div key={index}>
                      <img
                        src={frameUrl}
                        alt={`Frame ${index + 1}`}
                        className="w-full h-auto rounded-lg"
                      />
                      <a
                        href={frameUrl}
                        download={`frame_${exp}_${index + 1}.jpg`}
                        className="text-blue-400 hover:underline text-sm block mt-1 text-center"
                      >
                        Download
                      </a>
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