const { ApifyClient } = require('apify-client');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { Storage } = require('@google-cloud/storage');
const ffmpeg = require('fluent-ffmpeg');

// Set FFmpeg path
ffmpeg.setFfmpegPath('/usr/bin/ffmpeg'); // Cloud FFmpeg path
console.log('FFmpeg path set to:', ffmpeg.ffmpegPath);

// Initialize Apify client
const client = new ApifyClient({
  token: '//put your apify token right here'
});

// Initialize Google Cloud Storage with explicit key path
const storage = new Storage();
const bucket = storage.bucket('scene-ampify-bucket');
console.log('Service account path:', process.env.GOOGLE_APPLICATION_CREDENTIALS || 'Using keyFilename');

// SceneFinder upload API endpoint
const SCENEFINDER_UPLOAD_URL = 'https://scenefinder-upload-backend.onrender.com/api/upload';

// Function to start Apify run and get video URL
async function startReelDownload(reelUrl) {
  try {
    console.log('Input URL:', reelUrl);
    const input = {
      reelLinks: [reelUrl],
      proxyConfiguration: { useApifyProxy: true }
    };

    const run = await client.actor('presetshubham/instagram-reel-downloader').call(input);
    console.log('Run started:', run.id);

    let runStatus = await client.run(run.id).get();
    let attempts = 0;
    const maxAttempts = 30; // ~60 seconds max wait
    while (runStatus.status !== 'SUCCEEDED' && runStatus.status !== 'FAILED' && attempts < maxAttempts) {
      console.log('Run status:', runStatus.status);
      await new Promise(resolve => setTimeout(resolve, 2000));
      runStatus = await client.run(run.id).get();
      attempts++;
    }

    if (runStatus.status === 'FAILED') {
      throw new Error(`Apify run failed: ${JSON.stringify(runStatus, null, 2)}`);
    }
    if (runStatus.status !== 'SUCCEEDED') {
      throw new Error(`Apify run did not succeed: Status=${runStatus.status}`);
    }

    const { items } = await client.dataset(runStatus.defaultDatasetId).listItems();
    if (!items || items.length === 0) {
      throw new Error('No results found in dataset');
    }

    const videoUrl = items[0].video_url;
    console.log('Video URL from dataset:', videoUrl);
    if (!videoUrl) {
      throw new Error('Video URL not found in dataset item');
    }
    return videoUrl;
  } catch (error) {
    console.error('Apify Error:', error);
    throw error;
  }
}

// Function to download video, convert to MP3, and upload to SceneFinder
async function processReelToSceneFinder(reelUrl) {
  const tempVideoPath = path.join(__dirname, 'temp-reel.mp4');
  const tempAudioPath = path.join(__dirname, 'temp-reel.mp3');
  const tempUploadPath = path.join(__dirname, 'temp-upload-reel.mp3');
  let cloudFilePath;

  try {
    // Step 1: Get video URL from Apify
    const videoUrl = await startReelDownload(reelUrl);
    console.log('Attempting to download:', videoUrl);

    // Step 2: Download the video
    const downloadStart = Date.now();
    const response = await axios({
      url: videoUrl,
      method: 'GET',
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const writer = fs.createWriteStream(tempVideoPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const videoStats = fs.statSync(tempVideoPath);
    if (videoStats.size === 0) {
      throw new Error('Downloaded video file is empty');
    }
    console.log('Video downloaded successfully, size:', videoStats.size, 'bytes');
    console.log('Download took:', (Date.now() - downloadStart) / 1000, 'seconds');

    // Step 3: Convert MP4 to MP3
    await new Promise((resolve, reject) => {
      ffmpeg(tempVideoPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .output(tempAudioPath)
        .on('end', () => {
          console.log('MP4 converted to MP3 successfully');
          resolve();
        })
        .on('error', (err) => {
          console.error('FFmpeg conversion error:', err);
          reject(err);
        })
        .run();
    });

    const audioStats = fs.statSync(tempAudioPath);
    if (audioStats.size === 0) {
      throw new Error('Converted MP3 file is empty');
    }
    console.log('MP3 file created, size:', audioStats.size, 'bytes');
    if (audioStats.size > 5 * 1024 * 1024) {
      throw new Error(`MP3 file size (${audioStats.size} bytes) exceeds 5 MB limit`);
    }

    // Step 4: Upload MP3 to Cloud Storage
    cloudFilePath = 'temp-reel-' + Date.now() + '.mp3';
    console.log('Uploading to Cloud Storage:', cloudFilePath);
    await bucket.upload(tempAudioPath, { destination: cloudFilePath });
    console.log('MP3 uploaded to Cloud Storage:', cloudFilePath);

    // Step 5: Download MP3 from Cloud Storage
    console.log('Downloading from Cloud Storage to:', tempUploadPath);
    await bucket.file(cloudFilePath).download({ destination: tempUploadPath });
    console.log('MP3 downloaded from Cloud Storage to:', tempUploadPath);

    const uploadStats = fs.statSync(tempUploadPath);
    if (uploadStats.size === 0) {
      throw new Error('Downloaded MP3 from Cloud Storage is empty');
    }
    console.log('Cloud Storage MP3 verified, size:', uploadStats.size, 'bytes');

    // Step 6: Upload to SceneFinder API
    const form = new FormData();
    form.append('video', fs.createReadStream(tempUploadPath));
    console.log('Uploading to SceneFinder API:', SCENEFINDER_UPLOAD_URL);

    const uploadStart = Date.now();
    let uploadResponse;
    let retries = 3;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log('Upload attempt:', attempt);
        uploadResponse = await axios.post(
          SCENEFINDER_UPLOAD_URL,
          form,
          {
            headers: form.getHeaders(),
            timeout: 120000
          }
        );
        break;
      } catch (error) {
        console.error('Upload attempt failed:', error.message, error.response?.data || '');
        if (attempt === retries) throw error;
        console.log('Retrying in 10 seconds...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    console.log('Upload took:', (Date.now() - uploadStart) / 1000, 'seconds');
    console.log('SceneFinder Response:', uploadResponse.data);

    // Step 7: Clean up
    if (fs.existsSync(tempVideoPath)) {
      fs.unlinkSync(tempVideoPath);
      console.log('Temporary video file deleted');
    }
    if (fs.existsSync(tempAudioPath)) {
      fs.unlinkSync(tempAudioPath);
      console.log('Temporary MP3 file deleted');
    }
    if (fs.existsSync(tempUploadPath)) {
      fs.unlinkSync(tempUploadPath);
      console.log('Temporary upload MP3 deleted');
    }
    if (cloudFilePath) {
      const exists = (await bucket.file(cloudFilePath).exists())[0];
      if (exists) {
        await bucket.file(cloudFilePath).delete();
        console.log('Cloud Storage MP3 deleted');
      }
    }

    return uploadResponse.data;
  } catch (error) {
    // Clean up on error
    if (fs.existsSync(tempVideoPath)) {
      fs.unlinkSync(tempVideoPath);
      console.log('Temporary video file deleted due to error');
    }
    if (fs.existsSync(tempAudioPath)) {
      fs.unlinkSync(tempAudioPath);
      console.log('Temporary MP3 file deleted due to error');
    }
    if (fs.existsSync(tempUploadPath)) {
      fs.unlinkSync(tempUploadPath);
      console.log('Temporary upload MP3 deleted due to error');
    }
    if (cloudFilePath) {
      const exists = (await bucket.file(cloudFilePath).exists())[0];
      if (exists) {
        await bucket.file(cloudFilePath).delete();
        console.log('Cloud Storage MP3 deleted due to error');
      }
    }
    console.error('Process Error:', error);
    throw error;
  }
}

// Create Express app
const app = express();
app.use(express.json());

// API endpoint to process Reel URL
app.post('/api/process-reel', async (req, res) => {
  const { reelUrl } = req.body;
  if (!reelUrl) {
    return res.status(400).json({ error: 'Missing reelUrl in request body' });
  }

  try {
    const result = await processReelToSceneFinder(reelUrl);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to process reel', details: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
