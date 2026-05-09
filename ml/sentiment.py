"""FinBERT sentiment scoring — runs locally via Hugging Face transformers."""
import logging
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)

@lru_cache(maxsize=1)
def _load_pipeline():
    from transformers import pipeline
    logger.info("Loading FinBERT model (first load may take a minute)...")
    return pipeline("text-classification", model="ProsusAI/finbert", top_k=None)

_finbert = None

def get_sentiment(text: str) -> dict:
    """Score a text string. Returns {'label': str, 'score': float} where score is -1 to +1."""
    global _finbert
    if not text or not text.strip():
        return {"label": "neutral", "score": 0.0}

    try:
        if _finbert is None:
            _finbert = _load_pipeline()

        truncated = text[:512]
        results = _finbert(truncated)[0]
        label_scores = {r["label"].lower(): r["score"] for r in results}

        pos = label_scores.get("positive", 0.0)
        neg = label_scores.get("negative", 0.0)
        neu = label_scores.get("neutral", 0.0)

        # Collapse to a single -1..+1 float
        score = pos - neg
        dominant = max(label_scores, key=label_scores.get)

        return {"label": dominant, "score": round(score, 4)}
    except Exception as e:
        logger.error(f"FinBERT error: {e}")
        return {"label": "neutral", "score": 0.0}


def score_batch(texts: list[str]) -> list[dict]:
    return [get_sentiment(t) for t in texts]
