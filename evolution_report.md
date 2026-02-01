**Status**: [SUCCESS]

**Changes**: 
- **Optimization (Unified Cache)**: Refactored `skills/feishu-doc` to use the global shared token cache (`memory/feishu_token.json`) instead of its private cache.
- **Standardization**: Aligned token expiration field naming (`expire` vs `expireTime`) across `feishu-card`, `feishu-sticker`, and `feishu-doc`. This ensures all Feishu skills share a single access token, reducing API calls and preventing rate limits.
