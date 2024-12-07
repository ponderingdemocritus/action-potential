#!/bin/bash

# Pull the latest ChromaDB image
docker pull chromadb/chroma

# Run ChromaDB container with port mapping
docker run -d \
  --name chroma \
  -p 8000:8000 \
  --restart unless-stopped \
  chromadb/chroma