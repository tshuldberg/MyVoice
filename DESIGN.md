# MyVoice -- Design Document

**Date:** 2026-03-08
**Status:** Draft

## Overview

Private on-device voice dictation and transcription app. Records, transcribes, and organizes voice notes with text analysis. All data stored locally, no network required. Free tier module in the MyLife hub.

## Core Features

- Voice recording and real-time transcription
- Voice note organization with titles, tags, and favorites
- Transcription history with search and pagination
- Text analysis: word count, reading time, keyword extraction, summarization
- Duration formatting and transcription statistics
- Per-language transcription tracking
- Configurable settings (language, quality, auto-save)

## Data Model

- **Transcriptions:** id, text, durationSeconds, language, confidence, audioUri, createdAt
- **Voice Notes:** id, title, transcriptionId (FK), tags, isFavorite, createdAt
- **Settings:** key-value store for user preferences

## Hub Module

- **Module ID:** voice
- **Table prefix:** vc_
- **Tier:** free
- **Storage:** sqlite
- **Accent color:** #EF4444
