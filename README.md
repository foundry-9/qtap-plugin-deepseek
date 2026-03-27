# qtap-plugin-deepseek
Quilltap support for DeepSeek

## Plugin 2: DeepSeek (`qtap-plugin-deepseek`)

### Summary

Connect to DeepSeek's API at `api.deepseek.com` using the OpenAI SDK with base URL override. DeepSeek offers frontier-class reasoning at roughly 1/10th the price of comparable models, with 90% cache discounts and off-peak pricing. The direct API eliminates OpenRouter's markup and gives users access to DeepSeek-specific features like thinking mode with `reasoning_content` passback.

### API Details

| Field | Value |
|-------|-------|
| **Base URL** | `https://api.deepseek.com` (also `https://api.deepseek.com/v1`) |
| **Auth** | `Authorization: Bearer {DEEPSEEK_API_KEY}` |
| **SDK** | `openai` with `baseURL: 'https://api.deepseek.com'` |
| **API format** | Chat Completions (`/chat/completions`) |
| **Streaming** | SSE via `stream: true` |
| **Docs** | https://api-docs.deepseek.com |

### Supported Capabilities

| Capability | Support | Notes |
|------------|---------|-------|
| **Chat completions** | ✅ | Standard OpenAI chat completions format |
| **Streaming** | ✅ | SSE with `stream: true` |
| **Tool/function calling** | ✅ | OpenAI format; supports parallel calls (up to 128); `strict` mode available for guaranteed JSON schema compliance |
| **Thinking/reasoning mode** | ✅ | `deepseek-reasoner` model; toggle via request body; returns `reasoning_content` field that must be passed back for multi-turn tool calls |
| **Vision/image input** | ❌ | Not supported on current API models |
| **JSON mode** | ✅ | `response_format: { type: "json_object" }` |
| **Embeddings** | ❌ | No embedding endpoint on the direct API |
| **Image generation** | ❌ | Not available |
| **Web search** | ❌ | Not available via API |
| **File attachments** | ❌ | Not supported |
| **FIM (Fill-in-Middle)** | ✅ | Beta API at `api.deepseek.com/beta`; not needed for chat plugin |
| **Prefix completion** | ✅ | Beta API; assistant message prefilling |

### Models (current as of March 2026)

- `deepseek-chat` — maps to DeepSeek-V3.2 (128K context); unified chat model
- `deepseek-reasoner` — maps to DeepSeek-V3.2 in thinking mode (128K context, 64K max output)

Note: The API model names are stable aliases. V4 ($0.30/$0.50 per M tokens, 1M context) launched March 2026 but may use a different model string — verify at launch. V3.2 pricing: $0.28/$0.42 per M tokens; cached input: $0.028/M (90% discount).

### Plugin-Specific Implementation Notes

1. **Thinking mode handling:** This is the critical DeepSeek-specific feature. When using `deepseek-reasoner`:
   - The response includes a `reasoning_content` field alongside the standard `content`
   - For multi-turn tool calling, `reasoning_content` must be sent back to the API in the next request
   - When a new user message starts a new "turn," previous `reasoning_content` should be cleared
   - If `reasoning_content` is not correctly passed back, the API returns a 400 error
   - Implement `clear_reasoning_content()` helper matching DeepSeek's documented pattern

2. **System prompt behavior:** V3/V3.2 use system prompts normally. R1 (older reasoning model) ignores system prompts — everything must go in the user message. The plugin should detect the model and adjust message formatting accordingly. For V3.2 in thinking mode, system prompts work.

3. **Off-peak pricing:** DeepSeek offers 50-75% discounts during 16:30–00:30 GMT. The plugin can't enforce this, but the connection profile could display a note about off-peak savings. Consider a UI indicator.

4. **Cache optimization:** DeepSeek's 90% cache discount applies to repeated prompt prefixes (system prompts, tool definitions). The plugin should ensure consistent ordering of system messages and tool definitions to maximize cache hits.

5. **Tool calling reliability:** DeepSeek is known to narrate tool calls instead of executing them, especially in thinking mode. The plugin should include XML tool call detection (already in `@quilltap/plugin-utils`) as a fallback parser. Consider adding a warning in the Forge UI about tool calling reliability.

6. **`strict` mode for tools:** DeepSeek supports `strict: true` on function definitions for guaranteed JSON schema compliance. Enable by default to reduce malformed tool call arguments.

7. **Cheap LLM candidates:** `deepseek-chat` is already one of the cheapest frontier models available. Register it as a cheap LLM option.

8. **Free tier:** New accounts get 5M free tokens. The plugin's test connection flow should work within the free tier.

### Known Limitations

- No vision support (cannot send images)
- No embedding endpoint (users should pair with Ollama or another embedding provider)
- Tool calling can be unreliable — model may narrate intent instead of producing structured tool calls
- API can experience higher latency or 503 errors during peak demand (no per-user rate limits, best-effort serving)
- R1 ignores system prompts (V3.2 does not have this issue)

### Estimated Scope

- ~350 lines for `provider.ts`
- ~50 lines for `index.ts`
- No additional SDK dependency beyond `openai`
