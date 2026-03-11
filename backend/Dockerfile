# Use Python 3.11 slim image
FROM python:3.11-slim

# Install system dependencies including ffmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    git \
    gcc \
    g++ \
    libegl1 \
    libgl1 \
    libgles2 \
    && rm -rf /var/lib/apt/lists/*

# Install uv package manager
RUN pip install uv

# Set working directory
WORKDIR /app

# MediaPipe face detector model (baked into image for deterministic runtime behavior)
ARG MEDIAPIPE_FACE_MODEL_URL=https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite
ARG MEDIAPIPE_FACE_MODEL_SHA256=b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f
ENV MEDIAPIPE_FACE_MODEL_PATH=/app/models/blaze_face_short_range.tflite
ENV MEDIAPIPE_FACE_MODEL_URL=${MEDIAPIPE_FACE_MODEL_URL}
ENV MEDIAPIPE_FACE_MODEL_SHA256=${MEDIAPIPE_FACE_MODEL_SHA256}
ENV MEDIAPIPE_FACE_MODEL_AUTO_DOWNLOAD=true

# Copy pyproject.toml and uv.lock for dependency installation
COPY pyproject.toml uv.lock* ./

# Create virtual environment and install dependencies using uv sync
RUN uv venv .venv && uv sync

# Force update yt-dlp to the absolute latest version to handle YouTube API changes
# Also install from git to get the very latest commits
RUN uv pip install --upgrade --force-reinstall yt-dlp
RUN uv pip install --upgrade --force-reinstall "yt-dlp[default]"

# Install Playwright Chromium browser for pycaps CssSubtitleRenderer
RUN .venv/bin/playwright install --with-deps chromium

# Fetch and verify MediaPipe face detector model
RUN mkdir -p /app/models \
    && curl -fsSL "${MEDIAPIPE_FACE_MODEL_URL}" -o "${MEDIAPIPE_FACE_MODEL_PATH}" \
    && echo "${MEDIAPIPE_FACE_MODEL_SHA256}  ${MEDIAPIPE_FACE_MODEL_PATH}" | sha256sum -c -

# Copy source code
COPY src/ ./src/

# Copy fonts and transitions directories
COPY fonts/ ./fonts/
COPY transitions/ ./transitions/

# Create necessary directories for video processing
RUN mkdir -p /app/uploads /app/clips /app/logs /tmp

# Expose the port FastAPI will run on
EXPOSE 8000

# Activate virtual environment and start the application
CMD [".venv/bin/uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
