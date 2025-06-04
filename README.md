# SceneFinder Apify

A Node.js service to download Instagram Reels, convert them to MP3, upload to Google Cloud Storage, and send to the SceneFinder API for further processing. Built with Express, Apify, Google Cloud Storage, FFmpeg, and Axios.

## Features
- Download Instagram Reels using Apify
- Convert video to MP3 using FFmpeg
- Upload MP3 to Google Cloud Storage
- Send MP3 to SceneFinder API
- REST API endpoint for automation
- Docker support

## Prerequisites
- Node.js 18+ (Node 22 recommended)
- FFmpeg (installed in Docker, or available on your system for local testing)
- Google Cloud service account JSON key (see below)
- Apify API token

## Installation

```bash
npm install
```

## Environment Variables

- `GOOGLE_APPLICATION_CREDENTIALS`: Path to your Google Cloud service account JSON key file (required for Google Cloud Storage access)
- `PORT`: (optional) Port for the Express server (default: 5000)

## Configuration

- The Apify API token is currently hardcoded in `index.js` as `token: 'apify_api_...'`. For production, set this via environment variable or config.
- The Google Cloud Storage bucket is hardcoded as `scene-ampify-bucket` in `index.js`. Change as needed.
- The SceneFinder API upload URL is hardcoded as `https://scenefinder-upload-backend.onrender.com/api/upload`.

## Usage

### Start the server

```bash
node index.js
```

Or with Docker:

```bash
docker build -t scenefinder-apify .
docker run -p 5000:5000 -e GOOGLE_APPLICATION_CREDENTIALS=/path/in/container/key.json -v /path/to/key.json:/usr/src/app/key.json scenefinder-apify
```

### API Endpoint

#### `POST /api/process-reel`

**Request Body:**
```json
{
  "reelUrl": "<INSTAGRAM_REEL_URL>"
}
```

**Response:**
- On success: SceneFinder API response
- On error: `{ error: 'Failed to process reel', details: <error message> }`

## Docker

The provided `dockerfile` installs FFmpeg and runs the app on port 5000.

**.dockerignore** excludes node_modules, logs, .env, credentials, and git files.

## Testing FFmpeg

A helper script `test-ffmpeg.js` is included to verify FFmpeg installation and MP3 codec availability.

## Security
- Do **not** commit your Google Cloud credentials or Apify token to public repositories.
- The file `scenefinder-apify-dd6ad5e1066b.json` is a service account key and should be kept secret.

## License
ISC

---

**Note:**
- For production, refactor to use environment variables for all secrets and configuration.
- This project is for demonstration and automation purposes only. Use responsibly and comply with all relevant terms of service. 