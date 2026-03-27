import type {
  LLMProvider,
  ChatMessage,
  ChatCompletionOptions,
  ChatCompletionResult,
  StreamCallback,
} from '@quilltap/plugin-types';
import { createPluginLogger, parseXmlToolCalls } from '@quilltap/plugin-utils';

const logger = createPluginLogger('qtap-plugin-deepseek');

const BASE_URL = 'https://api.deepseek.com';

/** Models that use the reasoning/thinking mode */
const REASONING_MODELS = ['deepseek-reasoner'];

/** Models where system prompts are ignored (older R1) */
const SYSTEM_PROMPT_IGNORED_MODELS = ['deepseek-r1'];

/**
 * Clear reasoning_content from assistant messages when a new user turn begins.
 * DeepSeek requires reasoning_content to be passed back for multi-turn tool calls,
 * but it must be cleared when a new user message starts a fresh reasoning turn.
 */
function clearReasoningContent(messages: any[]): any[] {
  const result: any[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = { ...messages[i] };
    // If this is an assistant message with reasoning_content, check if the
    // next message is a user message (new turn) — if so, clear reasoning_content
    if (msg.role === 'assistant' && msg.reasoning_content) {
      const next = messages[i + 1];
      if (next && next.role === 'user') {
        delete msg.reasoning_content;
      }
    }
    result.push(msg);
  }
  return result;
}

/**
 * Check if a model is a reasoning model that returns reasoning_content.
 */
function isReasoningModel(model: string): boolean {
  const lower = model.toLowerCase();
  return REASONING_MODELS.some(prefix => lower.includes(prefix));
}

/**
 * Check if a model ignores system prompts (older R1 models).
 */
function isSystemPromptIgnored(model: string): boolean {
  const lower = model.toLowerCase();
  return SYSTEM_PROMPT_IGNORED_MODELS.some(prefix => lower === prefix);
}

/**
 * Add strict: true to all tool function definitions for guaranteed JSON schema compliance.
 */
function enforceStrictTools(tools: any[] | undefined): any[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map(tool => {
    if (tool.type === 'function' && tool.function) {
      return {
        ...tool,
        function: {
          ...tool.function,
          strict: true,
        },
      };
    }
    return tool;
  });
}

export class DeepSeekProvider implements LLMProvider {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || BASE_URL;
  }

  async chatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResult> {
    const { apiKey, model, maxTokens, temperature, tools, responseFormat } = options;

    logger.debug('Starting chat completion', { model, messageCount: messages.length });

    const formattedMessages = this.formatMessages(messages, model);
    const body: Record<string, any> = {
      model,
      messages: formattedMessages,
      max_tokens: maxTokens,
      temperature,
      tools: enforceStrictTools(tools),
    };

    if (responseFormat) {
      body.response_format = responseFormat;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Chat completion failed', { status: response.status, error });
      throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const choice = data.choices[0];
    const message = choice.message;

    // Extract tool calls — check structured tool_calls first, then fall back to XML parsing
    let toolCalls = message.tool_calls;
    if (!toolCalls?.length && message.content) {
      const xmlToolCalls = parseXmlToolCalls(message.content);
      if (xmlToolCalls.length > 0) {
        logger.debug('Extracted tool calls from XML in response content', {
          count: xmlToolCalls.length,
        });
        toolCalls = xmlToolCalls;
      }
    }

    const result: ChatCompletionResult = {
      content: message.content || '',
      toolCalls,
      finishReason: choice.finish_reason,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
    };

    // Pass through reasoning_content for multi-turn reasoning
    if (message.reasoning_content) {
      (result as any).reasoningContent = message.reasoning_content;
    }

    return result;
  }

  async streamChatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
    onChunk: StreamCallback
  ): Promise<void> {
    const { apiKey, model, maxTokens, temperature, tools, responseFormat } = options;

    logger.debug('Starting streaming chat completion', { model, messageCount: messages.length });

    const formattedMessages = this.formatMessages(messages, model);
    const body: Record<string, any> = {
      model,
      messages: formattedMessages,
      max_tokens: maxTokens,
      temperature,
      stream: true,
      tools: enforceStrictTools(tools),
    };

    if (responseFormat) {
      body.response_format = responseFormat;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Streaming chat completion failed', { status: response.status, error });
      throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedContent = '';
    let accumulatedToolCalls: any[] = [];
    let reasoningContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          // At stream end, check accumulated content for XML tool calls
          if (accumulatedToolCalls.length === 0 && accumulatedContent) {
            const xmlToolCalls = parseXmlToolCalls(accumulatedContent);
            if (xmlToolCalls.length > 0) {
              logger.debug('Extracted tool calls from XML in streamed content', {
                count: xmlToolCalls.length,
              });
              onChunk({ toolCalls: xmlToolCalls });
            }
          }
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices[0]?.delta;
          if (!delta) continue;

          // Handle reasoning_content chunks (thinking mode)
          if (delta.reasoning_content) {
            reasoningContent += delta.reasoning_content;
            onChunk({ reasoningContent: delta.reasoning_content });
          }

          // Handle content chunks
          if (delta.content) {
            accumulatedContent += delta.content;
            onChunk({ content: delta.content });
          }

          // Handle tool call chunks
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!accumulatedToolCalls[idx]) {
                accumulatedToolCalls[idx] = {
                  id: tc.id || '',
                  type: 'function',
                  function: { name: '', arguments: '' },
                };
              }
              if (tc.id) accumulatedToolCalls[idx].id = tc.id;
              if (tc.function?.name) accumulatedToolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments) accumulatedToolCalls[idx].function.arguments += tc.function.arguments;
            }
            onChunk({ toolCalls: accumulatedToolCalls });
          }

          // Handle finish reason
          const finishReason = parsed.choices[0]?.finish_reason;
          if (finishReason) {
            onChunk({ finishReason });
          }

          // Handle usage in final chunk
          if (parsed.usage) {
            onChunk({
              usage: {
                promptTokens: parsed.usage.prompt_tokens,
                completionTokens: parsed.usage.completion_tokens,
                totalTokens: parsed.usage.total_tokens,
              },
            });
          }
        } catch {
          // Skip invalid JSON chunks
        }
      }
    }
  }

  /**
   * Format messages for the DeepSeek API.
   * - For models that ignore system prompts (older R1), merge system content into the first user message.
   * - For reasoning models, apply reasoning_content passback via clearReasoningContent.
   * - Maintain consistent ordering to maximize DeepSeek's cache hit rate.
   */
  private formatMessages(messages: ChatMessage[], model: string): any[] {
    const ignoreSystemPrompts = isSystemPromptIgnored(model);
    const reasoning = isReasoningModel(model);

    let formatted = messages.map(msg => {
      const base: Record<string, any> = {
        role: msg.role,
        content: msg.content,
      };

      if (msg.name) {
        base.name = msg.name;
      }

      // Pass through tool_calls on assistant messages
      if (msg.role === 'assistant' && (msg as any).tool_calls) {
        base.tool_calls = (msg as any).tool_calls;
      }

      // Pass through tool_call_id on tool messages
      if (msg.role === 'tool' && (msg as any).tool_call_id) {
        base.tool_call_id = (msg as any).tool_call_id;
      }

      // Pass through reasoning_content on assistant messages for multi-turn reasoning
      if (msg.role === 'assistant' && (msg as any).reasoning_content) {
        base.reasoning_content = (msg as any).reasoning_content;
      }

      return base;
    });

    // For models that ignore system prompts, merge system messages into user messages
    if (ignoreSystemPrompts) {
      formatted = this.mergeSystemIntoUser(formatted);
    }

    // For reasoning models, apply the reasoning_content clearing logic
    if (reasoning) {
      formatted = clearReasoningContent(formatted);
    }

    return formatted;
  }

  /**
   * Merge system messages into the first user message for models that ignore system prompts.
   */
  private mergeSystemIntoUser(messages: any[]): any[] {
    const systemMessages: string[] = [];
    const nonSystemMessages: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMessages.push(msg.content);
      } else {
        nonSystemMessages.push(msg);
      }
    }

    if (systemMessages.length === 0) return messages;

    // Prepend system content to the first user message
    const systemPrefix = systemMessages.join('\n\n');
    const firstUserIdx = nonSystemMessages.findIndex(m => m.role === 'user');
    if (firstUserIdx >= 0) {
      nonSystemMessages[firstUserIdx] = {
        ...nonSystemMessages[firstUserIdx],
        content: `${systemPrefix}\n\n${nonSystemMessages[firstUserIdx].content}`,
      };
    } else {
      // No user message found — add system content as a user message
      nonSystemMessages.unshift({ role: 'user', content: systemPrefix });
    }

    return nonSystemMessages;
  }
}
