# Changelog

## 1.1-dev

- Initial plugin scaffolding: project config, build pipeline, manifest, and source files
- `DeepSeekProvider` with chat completions, SSE streaming, and tool calling
- Thinking mode support with `reasoning_content` passback and `clearReasoningContent()` helper
- System prompt merging for older R1 models that ignore the system role
- `strict: true` enforced on all tool definitions by default
- XML tool call fallback parsing for unreliable structured tool calls
- `deepseek-chat` registered as cheap LLM candidate
- Scoped package name `@quilltap/qtap-plugin-deepseek` with public publish config

## 1.0.0

- Published to npm (empty/initial release)
