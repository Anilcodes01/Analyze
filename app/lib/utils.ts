import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

export function setupFFmpeg() {
  let ffmpegPath = ffmpegStatic;
  ffmpeg.setFfmpegPath(ffmpegPath!);
}