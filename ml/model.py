"""LSTM model definition for stock price direction + target prediction."""
import torch
import torch.nn as nn


INPUT_FEATURES = 8  # close, volume, ma7, ma30, sentiment_score, sentiment_count, source_counts(4 collapsed to 2 = news+reddit+sec+tw)
# Actual features: [close_norm, volume_norm, ma7_norm, ma30_norm, sentiment_avg, sentiment_count_norm, news_count_norm, reddit_count_norm]
HIDDEN_SIZE = 64
NUM_LAYERS = 2
DROPOUT = 0.3
SEQUENCE_LENGTH = 30


class StockLSTM(nn.Module):
    def __init__(self, input_size: int = INPUT_FEATURES, hidden_size: int = HIDDEN_SIZE, num_layers: int = NUM_LAYERS, dropout: float = DROPOUT):
        super().__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers

        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0,
        )
        self.dropout = nn.Dropout(dropout)

        # Direction head: 3 classes (up, down, neutral)
        self.direction_head = nn.Sequential(
            nn.Linear(hidden_size, 32),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(32, 3),
        )

        # Price target head: single regression value (normalized)
        self.price_head = nn.Sequential(
            nn.Linear(hidden_size, 32),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(32, 1),
        )

    def forward(self, x: torch.Tensor):
        # x: (batch, seq_len, input_size)
        lstm_out, _ = self.lstm(x)
        last = self.dropout(lstm_out[:, -1, :])
        direction_logits = self.direction_head(last)
        price_delta = self.price_head(last).squeeze(-1)
        return direction_logits, price_delta


DIRECTION_LABELS = ["down", "neutral", "up"]
