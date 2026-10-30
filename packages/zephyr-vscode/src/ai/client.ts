import { ChatMessage, ModelProviderConfig, ToolCall, ToolDefinition } from '../types';

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onReasoning?: (text: string) => void;
  onToolCall?: (call: ToolCall) => void;
  onError: (err: Error) => void;
  onFinish: () => void;
}

export class AiClient {
  private abortController: AbortController | null = null;

  cancel() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async streamChat(
    provider: ModelProviderConfig,
    modelId: string,
    messages: ChatMessage[],
    tools: ToolDefinition[],
    callbacks: StreamCallbacks
  ) {
    this.cancel();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      if (provider.type === 'anthropic') {
        await this.streamAnthropic(provider, modelId, messages, tools, callbacks, signal);
      } else if (provider.type === 'gemini') {
        await this.streamGemini(provider, modelId, messages, tools, callbacks, signal);
      } else {
        // Default: OpenAI-compatible (Cartethyia, OpenAI, Ollama, OpenCode2API)
        await this.streamOpenAiCompatible(provider, modelId, messages, tools, callbacks, signal);
      }
      callbacks.onFinish();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        callbacks.onFinish();
      } else {
        callbacks.onError(err);
      }
    } finally {
      this.abortController = null;
    }
  }

  private async streamOpenAiCompatible(
    provider: ModelProviderConfig,
    modelId: string,
    messages: ChatMessage[],
    tools: ToolDefinition[],
    callbacks: StreamCallbacks,
    signal: AbortSignal
  ) {
    const url = `${provider.baseURL.replace(/\/+$/, '')}/chat/completions`;
    const formattedMessages = messages.map(m => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          content: m.content,
          tool_call_id: m.toolResults?.[0]?.toolCallId || 'call_0'
        };
      }
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments)
            }
          }))
        };
      }
      return {
        role: m.role,
        content: m.content
      };
    });

    const formattedTools = tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

    const body: Record<string, any> = {
      model: modelId,
      messages: formattedMessages,
      stream: true,
    };
    if (formattedTools.length > 0) {
      body.tools = formattedTools;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(provider.apiKey ? { 'Authorization': `Bearer ${provider.apiKey}` } : {})
      },
      body: JSON.stringify(body),
      signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API Error (${res.status}): ${errText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('Response body is null.');

    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    const pendingToolCalls: Record<number, { id: string; name: string; argsText: string }> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta;
            if (!delta) continue;

            // Content chunk
            if (delta.content) {
              callbacks.onChunk(delta.content);
            }

            // Reasoning chunk (DeepSeek-R1 / QwQ)
            if (delta.reasoning_content || delta.reasoning) {
              callbacks.onReasoning?.(delta.reasoning_content || delta.reasoning);
            }

            // Tool call chunk
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!pendingToolCalls[idx]) {
                  pendingToolCalls[idx] = { id: tc.id || `call_${idx}`, name: tc.function?.name || '', argsText: '' };
                }
                if (tc.function?.name) pendingToolCalls[idx].name = tc.function.name;
                if (tc.function?.arguments) pendingToolCalls[idx].argsText += tc.function.arguments;
              }
            }
          } catch {
            // Partial JSON in SSE chunk, ignore
          }
        }
      }
    }

    // Emit completed tool calls
    for (const tc of Object.values(pendingToolCalls)) {
      let args = {};
      try {
        args = JSON.parse(tc.argsText || '{}');
      } catch {
        args = { raw: tc.argsText };
      }
      callbacks.onToolCall?.({
        id: tc.id,
        name: tc.name,
        arguments: args
      });
    }
  }

  private async streamAnthropic(
    provider: ModelProviderConfig,
    modelId: string,
    messages: ChatMessage[],
    tools: ToolDefinition[],
    callbacks: StreamCallbacks,
    signal: AbortSignal
  ) {
    const url = `${provider.baseURL.replace(/\/+$/, '')}/v1/messages`;
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const otherMsgs = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: modelId,
        messages: otherMsgs,
        system: systemMsg,
        max_tokens: 4096,
        stream: true
      }),
      signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API Error (${res.status}): ${errText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'content_block_delta' && data.delta?.text) {
              callbacks.onChunk(data.delta.text);
            }
          } catch {}
        }
      }
    }
  }

  private async streamGemini(
    provider: ModelProviderConfig,
    modelId: string,
    messages: ChatMessage[],
    tools: ToolDefinition[],
    callbacks: StreamCallbacks,
    signal: AbortSignal
  ) {
    const base = provider.baseURL.replace(/\/+$/, '');
    const url = `${base}/v1beta/models/${modelId}:streamGenerateContent?key=${provider.apiKey}&alt=sse`;

    const contents = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
      signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API Error (${res.status}): ${errText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) callbacks.onChunk(text);
          } catch {}
        }
      }
    }
  }
}
