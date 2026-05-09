FROM python:3.11-slim

WORKDIR /app

# Install ML service dependencies
COPY ml/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy scrapers (imported by ml/app.py at runtime)
COPY scrapers/ ./scrapers/

# Copy ML service source
COPY ml/ .

# Copy DB schema for init_schema()
RUN mkdir -p db
COPY db/schema.sql ./db/schema.sql

# Pre-download FinBERT so first prediction isn't slow
RUN python -c "from transformers import pipeline; pipeline('text-classification', model='ProsusAI/finbert')"

# HuggingFace Spaces default port
ENV PORT=7860
EXPOSE 7860

CMD ["python", "app.py"]
