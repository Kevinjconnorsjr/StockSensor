FROM python:3.11-slim

WORKDIR /app

# Copy ML service files
COPY ml/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy scrapers (needed by app.py at runtime)
COPY scrapers/ ./scrapers/

# Copy ML service source
COPY ml/ .

# Copy DB schema (used by db_helper.init_schema)
COPY db/schema.sql ./db/schema.sql
RUN mkdir -p db

# Pre-download FinBERT model so cold starts are fast
RUN python -c "from transformers import pipeline; pipeline('text-classification', model='ProsusAI/finbert')"

# HuggingFace Spaces uses port 7860
ENV PORT=7860
EXPOSE 7860

CMD ["python", "app.py"]
