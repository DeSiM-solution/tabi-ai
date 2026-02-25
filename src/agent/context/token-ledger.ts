export interface TokenLedger {
  inputTokens: number;
  outputTokens: number;
  compressedTokens: number;
}

export function createTokenLedger(): TokenLedger {
  return {
    inputTokens: 0,
    outputTokens: 0,
    compressedTokens: 0,
  };
}

export function recordInputTokens(ledger: TokenLedger, tokens: number) {
  ledger.inputTokens += Math.max(0, Math.floor(tokens));
}

export function recordOutputTokens(ledger: TokenLedger, tokens: number) {
  ledger.outputTokens += Math.max(0, Math.floor(tokens));
}

export function recordCompressedTokens(ledger: TokenLedger, tokens: number) {
  ledger.compressedTokens += Math.max(0, Math.floor(tokens));
}
