import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AiClient } from './ai/client';
import { ToolExecutor, ZEPHYR_TOOLS } from './tools/executor';
import { ChatMessage, ModelProviderConfig } from './types';

export class ZephyrAgentViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'zephyr.aiView';
  private _view?: vscode.WebviewView;
  private aiClient = new AiClient();
  private toolExecutor = new ToolExecutor();
  private messages: ChatMessage[] = [];

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data: any) => {
      switch (data.type) {
        case 'sendPrompt':
          await this.handleUserPrompt(data.text, data.modelKey);
          break;
        case 'cancel':
          this.aiClient.cancel();
          break;
        case 'clearChat':
          this.messages = [];
          break;
        case 'openSettings':
          vscode.commands.executeCommand('workbench.action.openSettings', 'zephyr');
          break;
      }
    });
  }

  private async handleUserPrompt(promptText: string, modelKey: string) {
    if (!this._view) return;

    if (this.messages.length === 0) {
      this.messages.push({
        id: 'system_prompt',
        role: 'system',
        content: `You are Zephyr AI Agent, an autonomous software engineering assistant running inside VS Code / Trae.
You have access to 7 core safe tools to inspect and modify the workspace:
- read_file: read files with line numbers
- list_directory: inspect workspace structure
- glob: search files matching patterns
- grep: search text or regex across workspace files
- write_file: create or overwrite files
- multi_edit: precisely replace exact code snippets
- ask_user: ask the user when instructions are ambiguous

Rules:
1. Always explore and read relevant files before proposing edits.
2. Deliver clean, production-grade code adhering to project conventions.
3. Be concise and direct in communication.
4. When writing code, call tools immediately instead of describing code in chat.`,
        timestamp: Date.now()
      });
    }

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: promptText,
      timestamp: Date.now()
    };
    this.messages.push(userMsg);

    // Resolve Provider
    const provider = this.resolveProviderConfig(modelKey);
    const modelId = modelKey.includes(':') ? modelKey.split(':')[1] : 'kerja';

    let isAgentTurn = true;
    let turnCount = 0;
    // Dinaikkan ke 100 agar autonomous loop tidak terpotong di tengah pengerjaan tugas besar
    const MAX_TURNS = 100;

    while (isAgentTurn && turnCount < MAX_TURNS) {
      turnCount++;
      let assistantText = '';
      let currentToolCall: any = null;

      await new Promise<void>((resolve) => {
        this.aiClient.streamChat(
          provider,
          modelId,
          this.messages,
          ZEPHYR_TOOLS,
          {
            onChunk: (chunk) => {
              assistantText += chunk;
              this._view?.webview.postMessage({ type: 'chunk', text: chunk });
            },
            onReasoning: (r) => {
              this._view?.webview.postMessage({ type: 'reasoning', text: r });
            },
            onToolCall: (call) => {
              currentToolCall = call;
              this._view?.webview.postMessage({
                type: 'toolCall',
                name: call.name,
                arguments: call.arguments
              });
            },
            onError: (err) => {
              this._view?.webview.postMessage({ type: 'error', message: err.message });
              isAgentTurn = false;
              resolve();
            },
            onFinish: () => {
              resolve();
            }
          }
        );
      });

      const assistantMsg: ChatMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: assistantText,
        toolCalls: currentToolCall ? [currentToolCall] : undefined,
        timestamp: Date.now()
      };
      this.messages.push(assistantMsg);

      if (currentToolCall) {
        this._view?.webview.postMessage({
          type: 'status',
          text: `Executing tool ${currentToolCall.name}...`
        });

        const result = await this.toolExecutor.execute(
          currentToolCall.id,
          currentToolCall.name,
          currentToolCall.arguments
        );

        this._view?.webview.postMessage({
          type: 'toolResult',
          result
        });

        // Add tool result to context for next loop
        this.messages.push({
          id: `tool_${Date.now()}`,
          role: 'tool',
          content: result.content,
          toolResults: [result],
          timestamp: Date.now()
        });

        // Stop loop if it was ask_user tool
        if (currentToolCall.name === 'ask_user') {
          isAgentTurn = false;
        }
      } else {
        // No more tool calls -> Task Complete
        isAgentTurn = false;
      }
    }

    this._view?.webview.postMessage({ type: 'finish' });
  }

  private resolveProviderConfig(modelKey: string): ModelProviderConfig {
    const [pId] = modelKey.split(':');
    if (pId === 'opencode2api') {
      return {
        id: 'opencode2api',
        name: 'OpenCode2API',
        type: 'openai-compatible',
        baseURL: 'http://127.0.0.1:8792/v1',
        apiKey: '',
        models: [{ id: 'glm-5.3-flash-free', name: 'GLM 5.3' }]
      };
    }
    if (pId === 'geraikita') {
      return {
        id: 'geraikita',
        name: 'Geraikita',
        type: 'openai-compatible',
        baseURL: 'https://ai.geraikita.com/v1/claude',
        apiKey: 'gk-709431cb2bf1a16d32679e16891c7842f9cd40910047e1f9',
        models: [{ id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' }]
      };
    }
    // Default: Cartethyia Gateway
    return {
      id: 'cartethyia',
      name: 'Cartethyia',
      type: 'openai-compatible',
      baseURL: 'http://127.0.0.1:20127/v1',
      apiKey: 'pn-carte-wlHpEX7UmAalZyhG',
      models: [
        { id: 'kerja', name: 'Kerja' },
        { id: 'cepat', name: 'Cepat' },
        { id: 'best', name: 'Best' }
      ]
    };
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
    );

    const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace('{{scriptUri}}', scriptUri.toString());
    return html;
  }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new ZephyrAgentViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ZephyrAgentViewProvider.viewType, provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('zephyr.openChat', () => {
      vscode.commands.executeCommand('zephyr.aiView.focus');
    }),
    vscode.commands.registerCommand('zephyr.newSession', () => {
      vscode.commands.executeCommand('zephyr.openChat');
    })
  );
}

export function deactivate() {}
