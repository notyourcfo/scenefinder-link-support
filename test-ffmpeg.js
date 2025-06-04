const ffmpeg = require('fluent-ffmpeg');

try {
  ffmpeg.setFfmpegPath('C:\\ffmpeg\\bin\\ffmpeg.exe');
  console.log('FFmpeg path set successfully');
  ffmpeg.getAvailableCodecs((err, codecs) => {
    if (err) {
      console.error('Error getting codecs:', err);
      return;
    }
    console.log('MP3 codec available:', !!codecs.libmp3lame);
  });
} catch (error) {
  console.error('Error:', error);
}
