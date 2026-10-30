export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  content: string;
  isError?: boolean;
  diff?: {
    path: string;
    original: string;
    modified: string;
  };
}

export interface ModelProviderConfig {
  id: string;
  name: string;
  type: 'openai-compatible' | 'anthropic' | 'gemini' | 'ollama';
  baseURL: string;
  apiKey: string;
  models: {
    id: string;
    name: string;
    contextLimit?: number;
  }[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  timestamp: number;
}
