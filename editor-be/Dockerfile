FROM python:3.11-slim

# System deps for OpenCV and shapely
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps
RUN pip install --no-cache-dir \
    flask \
    flask-cors \
    ultralytics \
    opencv-python-headless \
    shapely \
    numpy \
    requests \
    werkzeug

# Copy source
COPY editor-be/ ./editor-be/
COPY floor_ingestion/ ./floor_ingestion/

WORKDIR /app/editor-be

ENV PYTHONUNBUFFERED=1
ENV OUTPUT_DIR=/app/editor-be/uploads
ENV YOLO_WEIGHTS=/app/floor_ingestion/detector/yolo/runs/cubicasa_yolo26m/weights/best.pt

EXPOSE 5001

CMD ["python", "app.py"]
