import * as vscode from 'vscode';
import * as path from 'path';
import { ToolDefinition, ToolResult } from '../types';

export const ZEPHYR_TOOLS: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file in the workspace. Supports start_line and end_line for partial reading.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file from workspace root' },
        start_line: { type: 'number', description: 'Optional 1-based start line number' },
        end_line: { type: 'number', description: 'Optional 1-based end line number' }
      },
      required: ['path']
    }
  },
  {
    name: 'list_directory',
    description: 'List contents of a directory in the workspace with file names, sizes, and directory markers.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to directory (use "." or empty string for workspace root)' }
      }
    }
  },
  {
    name: 'glob',
    description: 'Find files matching a glob pattern across the workspace (e.g. "**/*.tsx", "src/**/*.ts").',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern to match file paths' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'grep',
    description: 'Search for regex pattern or text content across all files in the workspace.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Regex query or plain text to search' },
        include: { type: 'string', description: 'Optional glob filter (e.g. "*.ts")' }
      },
      required: ['query']
    }
  },
  {
    name: 'write_file',
    description: 'Create a new file or completely overwrite an existing file. Parent directories are created automatically.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file' },
        content: { type: 'string', description: 'Full text content to write' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'multi_edit',
    description: 'Precisely replace one or multiple snippets of code in a file. Each edit specifies old_string and new_string.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file' },
        edits: {
          type: 'array',
          description: 'Array of exact replacement pairs',
          items: {
            type: 'object',
            properties: {
              old_string: { type: 'string', description: 'Exact code snippet to replace' },
              new_string: { type: 'string', description: 'Replacement code snippet' }
            },
            required: ['old_string', 'new_string']
          }
        }
      },
      required: ['path', 'edits']
    }
  },
  {
    name: 'ask_user',
    description: 'Ask the user a clarifying question before proceeding, especially when user requirements are ambiguous.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Clear question to present to the user' },
        options: {
          type: 'array',
          description: 'Optional quick choices for the user to select from',
          items: { type: 'string' }
        }
      },
      required: ['question']
    }
  }
];

export class ToolExecutor {
  private getWorkspaceUri(): vscode.Uri {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      throw new Error('No workspace folder open.');
    }
    return folders[0].uri;
  }

  private resolveUri(relPath: string): vscode.Uri {
    const root = this.getWorkspaceUri();
    const clean = relPath.replace(/^[/\\]+/, '');
    return vscode.Uri.joinPath(root, clean);
  }

  async execute(toolCallId: string, name: string, args: Record<string, any>): Promise<ToolResult> {
    try {
      switch (name) {
        case 'read_file':
          return await this.readFile(toolCallId, args as any);
        case 'list_directory':
          return await this.listDirectory(toolCallId, args as any);
        case 'glob':
          return await this.glob(toolCallId, args as any);
        case 'grep':
          return await this.grep(toolCallId, args as any);
        case 'write_file':
          return await this.writeFile(toolCallId, args as any);
        case 'multi_edit':
          return await this.multiEdit(toolCallId, args as any);
        case 'ask_user':
          return {
            toolCallId,
            name,
            content: `Question asked to user: "${args.question}". Waiting for user response.`
          };
        default:
          return {
            toolCallId,
            name,
            isError: true,
            content: `Unknown tool: ${name}`
          };
      }
    } catch (err: any) {
      return {
        toolCallId,
        name,
        isError: true,
        content: `Tool execution failed: ${err.message || String(err)}`
      };
    }
  }

  private async readFile(toolCallId: string, args: { path: string; start_line?: number; end_line?: number }): Promise<ToolResult> {
    const uri = this.resolveUri(args.path);
    const data = await vscode.workspace.fs.readFile(uri);
    const text = new TextDecoder('utf-8').decode(data);
    const lines = text.split(/\r?\n/);

    let start = (args.start_line && args.start_line > 0) ? args.start_line - 1 : 0;
    let end = (args.end_line && args.end_line > 0) ? args.end_line : lines.length;
    start = Math.max(0, Math.min(start, lines.length));
    end = Math.max(start, Math.min(end, lines.length));

    const slice = lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join('\n');
    return {
      toolCallId,
      name: 'read_file',
      content: slice || '(Empty file or line range)'
    };
  }

  private async listDirectory(toolCallId: string, args: { path?: string }): Promise<ToolResult> {
    const rel = args.path || '.';
    const uri = this.resolveUri(rel);
    const entries = await vscode.workspace.fs.readDirectory(uri);
    
    const lines = entries.map(([entryName, entryType]: [string, vscode.FileType]) => {
      const isDir = (entryType & vscode.FileType.Directory) !== 0;
      return isDir ? `${entryName}/` : entryName;
    }).sort();

    return {
      toolCallId,
      name: 'list_directory',
      content: lines.length > 0 ? lines.join('\n') : '(Empty directory)'
    };
  }

  private async glob(toolCallId: string, args: { pattern: string }): Promise<ToolResult> {
    const uris = await vscode.workspace.findFiles(args.pattern, '**/node_modules/**', 100);
    const root = this.getWorkspaceUri();
    const relPaths = uris.map((u: vscode.Uri) => path.relative(root.fsPath, u.fsPath).replace(/\\/g, '/'));
    return {
      toolCallId,
      name: 'glob',
      content: relPaths.length > 0 ? relPaths.join('\n') : 'No matching files found.'
    };
  }

  private async grep(toolCallId: string, args: { query: string; include?: string }): Promise<ToolResult> {
    const files = await vscode.workspace.findFiles(args.include || '**/*', '**/node_modules/**', 100);
    const results: string[] = [];
    const regex = new RegExp(args.query, 'i');
    const root = this.getWorkspaceUri();

    for (const f of files) {
      if (results.length >= 50) break;
      try {
        const data = await vscode.workspace.fs.readFile(f);
        const text = new TextDecoder('utf-8').decode(data);
        const lines = text.split(/\r?\n/);
        const rel = path.relative(root.fsPath, f.fsPath).replace(/\\/g, '/');

        lines.forEach((l, idx) => {
          if (regex.test(l) && results.length < 50) {
            results.push(`${rel}:${idx + 1}: ${l.trim()}`);
          }
        });
      } catch {
        // Skip binary or unreadable files
      }
    }

    return {
      toolCallId,
      name: 'grep',
      content: results.length > 0 ? results.join('\n') : 'No matches found.'
    };
  }

  private async writeFile(toolCallId: string, args: { path: string; content: string }): Promise<ToolResult> {
    const uri = this.resolveUri(args.path);
    let original = '';
    try {
      const existing = await vscode.workspace.fs.readFile(uri);
      original = new TextDecoder('utf-8').decode(existing);
    } catch {
      original = ''; // New file
    }

    const enc = new TextEncoder().encode(args.content);
    await vscode.workspace.fs.writeFile(uri, enc);

    return {
      toolCallId,
      name: 'write_file',
      content: `File ${args.path} written successfully (${enc.length} bytes).`,
      diff: {
        path: args.path,
        original,
        modified: args.content
      }
    };
  }

  private async multiEdit(toolCallId: string, args: { path: string; edits: { old_string: string; new_string: string }[] }): Promise<ToolResult> {
    const uri = this.resolveUri(args.path);
    const data = await vscode.workspace.fs.readFile(uri);
    const original = new TextDecoder('utf-8').decode(data);
    let modified = original;

    for (const edit of args.edits) {
      if (!modified.includes(edit.old_string)) {
        return {
          toolCallId,
          name: 'multi_edit',
          isError: true,
          content: `Failed to find exact snippet:\n${edit.old_string}`
        };
      }
      modified = modified.replace(edit.old_string, edit.new_string);
    }

    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(modified));

    return {
      toolCallId,
      name: 'multi_edit',
      content: `Successfully applied ${args.edits.length} edit(s) to ${args.path}.`,
      diff: {
        path: args.path,
        original,
        modified
      }
    };
  }
}
