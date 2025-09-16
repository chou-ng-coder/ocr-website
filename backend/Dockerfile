# Dockerfile
FROM python:3.10-slim
WORKDIR /app
RUN apt-get update && apt-get install -y netcat-traditional tesseract-ocr fonts-dejavu-core fonts-liberation && \
    python -c "import urllib.request; urllib.request.urlretrieve('https://github.com/tesseract-ocr/tessdata/raw/main/vie.traineddata', '/usr/share/tesseract-ocr/5/tessdata/vie.traineddata')" && \
    rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN chmod +x /app/wait-for-it.sh
CMD ["sh", "-c", "sleep 10 && uvicorn main:app --host 0.0.0.0 --port 8000"]
