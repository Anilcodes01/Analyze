import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

export function setupFFmpeg() {
  let ffmpegPath = ffmpegStatic;
  // Add system check if needed
  ffmpeg.setFfmpegPath(ffmpegPath!);
}