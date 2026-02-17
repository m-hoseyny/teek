#!/bin/bash

# Teek - Quick Start Script
# This script helps you start Teek with a single command

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "============================================"
echo "  Teek - AI Video Clipping Tool"
echo "============================================"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found!${NC}"
    echo ""
    echo "Please create a .env file with your API keys:"
    echo "  1. Copy the template: cp .env.sample .env"
    echo "  2. Or use the provided .env file"
    echo "  3. Edit .env and add your API keys:"
    echo "     - OPENAI_API_KEY or GOOGLE_API_KEY or ANTHROPIC_API_KEY or ZAI_API_KEY"
    echo "     - TRANSCRIPTION_PROVIDER=local (default) or assemblyai"
    echo "     - ASSEMBLY_AI_API_KEY (only if TRANSCRIPTION_PROVIDER=assemblyai)"
    echo "     - Optional local URL/port mappings (see docs/local-host-mappings.md)"
    echo ""
    exit 1
fi

# Check if required API keys are set
source .env

TRANSCRIPTION_PROVIDER="${TRANSCRIPTION_PROVIDER:-local}"
if [ "$TRANSCRIPTION_PROVIDER" = "assemblyai" ] && [ -z "$ASSEMBLY_AI_API_KEY" ]; then
    echo -e "${YELLOW}Warning: TRANSCRIPTION_PROVIDER=assemblyai but ASSEMBLY_AI_API_KEY is not set in .env${NC}"
    echo "Transcription will fail until ASSEMBLY_AI_API_KEY is configured."
    echo ""
fi

if [ -z "$OPENAI_API_KEY" ] && [ -z "$GOOGLE_API_KEY" ] && [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$ZAI_API_KEY" ]; then
    echo -e "${YELLOW}Warning: No AI provider API key is set in .env${NC}"
    echo "You need at least one of: OPENAI_API_KEY, GOOGLE_API_KEY, ANTHROPIC_API_KEY, or ZAI_API_KEY"
    echo ""
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running!${NC}"
    echo "Please start Docker Desktop and try again."
    echo ""
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}Error: docker-compose is not installed!${NC}"
    echo "Please install Docker Compose and try again."
    echo ""
    exit 1
fi

# Determine which docker compose command to use
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Local host mapping defaults (overridable in .env).
APP_HOST="${APP_HOST:-localhost}"
FRONTEND_HOST_PORT="${FRONTEND_HOST_PORT:-3000}"
BACKEND_HOST_PORT="${BACKEND_HOST_PORT:-8000}"
FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-http://${APP_HOST}:${FRONTEND_HOST_PORT}}"
BACKEND_ORIGIN="${BACKEND_ORIGIN:-http://${APP_HOST}:${BACKEND_HOST_PORT}}"
API_DOCS_URL="${BACKEND_ORIGIN}/docs"
ENABLE_MULTI_WORKER="${ENABLE_MULTI_WORKER:-false}"

COMPOSE_ARGS=()
if [[ "${ENABLE_MULTI_WORKER,,}" =~ ^(1|true|yes|on)$ ]]; then
    COMPOSE_ARGS+=(--profile multi-worker)
fi

echo -e "${GREEN}Starting Teek...${NC}"
if [[ "${ENABLE_MULTI_WORKER,,}" =~ ^(1|true|yes|on)$ ]]; then
    echo "Multi-worker profile enabled (worker + worker2)."
fi
echo ""

# Build and start containers
echo "Building and starting Docker containers..."
echo "(This may take a few minutes on the first run)"
echo ""

$DOCKER_COMPOSE "${COMPOSE_ARGS[@]}" up -d --build

echo ""
echo -e "${GREEN}Teek is starting up!${NC}"
echo ""
echo "Services will be available at:"
echo "  - Frontend:  ${FRONTEND_ORIGIN}"
echo "  - Backend:   ${BACKEND_ORIGIN}"
echo "  - API Docs:  ${API_DOCS_URL}"
echo ""
echo "To view logs, run:"
echo "  $DOCKER_COMPOSE ${COMPOSE_ARGS[*]} logs -f"
echo ""
echo "To stop all services, run:"
echo "  $DOCKER_COMPOSE ${COMPOSE_ARGS[*]} down"
echo ""
echo "Waiting for services to be healthy..."

# Wait for services to be healthy
sleep 5

# Check if services are running
if $DOCKER_COMPOSE ps | grep -q "Up"; then
    echo -e "${GREEN}Services are starting successfully!${NC}"
    echo ""
    echo "You can now:"
    echo "  1. Open ${FRONTEND_ORIGIN} in your browser"
    echo "  2. View logs: $DOCKER_COMPOSE ${COMPOSE_ARGS[*]} logs -f"
    echo "  3. Stop services: $DOCKER_COMPOSE ${COMPOSE_ARGS[*]} down"
else
    echo -e "${YELLOW}Services are starting... Check logs if you encounter issues:${NC}"
    echo "  $DOCKER_COMPOSE ${COMPOSE_ARGS[*]} logs -f"
fi

echo ""
echo "============================================"
