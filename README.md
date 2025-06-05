# SceneFinder link accepting api

This is a Node.js service to download Instagram Reels, convert them to MP3, upload to Google Cloud Storage, and send to the SceneFinder API for further processing. Built with Express, Apify, Google Cloud Storage, FFmpeg, and Axios.

## Features
- Download Instagram Reels using Apify actor.
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

