declare function acquireVsCodeApi(): {
  postMessage: (msg: any) => void;
  setState: (state: any) => void;
  getState: () => any;
};

const vscode = acquireVsCodeApi();

const promptInput = document.getElementById('promptInput') as HTMLTextAreaElement;
const btnSend = document.getElementById('btnSend') as HTMLButtonElement;
const btnStop = document.getElementById('btnStop') as HTMLButtonElement;
const btnClear = document.getElementById('btnClear') as HTMLButtonElement;
const btnSettings = document.getElementById('btnSettings') as HTMLButtonElement;
const modelSelect = document.getElementById('modelSelect') as HTMLSelectElement;
const messagesContainer = document.getElementById('messages') as HTMLDivElement;
const agentStatus = document.getElementById('agentStatus') as HTMLDivElement;

let currentAssistantCard: HTMLDivElement | null = null;
let currentReasoningBody: HTMLDivElement | null = null;

function appendUserMessage(text: string) {
  const row = document.createElement('div');
  row.className = 'msg-row';
  const el = document.createElement('div');
  el.className = 'msg-user';
  el.textContent = text;
  row.appendChild(el);
  messagesContainer.appendChild(row);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function ensureAssistantCard() {
  if (!currentAssistantCard) {
    const row = document.createElement('div');
    row.className = 'msg-row';
    currentAssistantCard = document.createElement('div');
    currentAssistantCard.className = 'msg-assistant';
    row.appendChild(currentAssistantCard);
    messagesContainer.appendChild(row);
  }
  return currentAssistantCard;
}

function appendReasoning(text: string) {
  const card = ensureAssistantCard();
  if (!currentReasoningBody) {
    const thinkCard = document.createElement('div');
    thinkCard.className = 'thinking-card';
    const thinkHeader = document.createElement('div');
    thinkHeader.className = 'thinking-header';
    thinkHeader.innerHTML = `<span>🧠 Thought Process (Reasoning)</span> <span>▾</span>`;
    
    currentReasoningBody = document.createElement('div');
    currentReasoningBody.className = 'thinking-body';

    thinkHeader.addEventListener('click', () => {
      const isHidden = currentReasoningBody!.style.display === 'none';
      currentReasoningBody!.style.display = isHidden ? 'block' : 'none';
      thinkHeader.querySelector('span:last-child')!.textContent = isHidden ? '▾' : '▸';
    });

    thinkCard.appendChild(thinkHeader);
    thinkCard.appendChild(currentReasoningBody);
    card.insertBefore(thinkCard, card.firstChild);
  }
  currentReasoningBody.textContent += text;
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendText(text: string) {
  const card = ensureAssistantCard();
  card.append(document.createTextNode(text));
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendToolCall(toolName: string, args: any) {
  const card = ensureAssistantCard();
  const box = document.createElement('div');
  box.className = 'tool-box';
  box.innerHTML = `
    <div class="tool-title">⚡ Tool Executing: ${toolName}</div>
    <div class="tool-args">${escapeHtml(JSON.stringify(args, null, 2))}</div>
  `;
  card.appendChild(box);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendToolResult(result: any) {
  const card = ensureAssistantCard();
  const box = document.createElement('div');
  box.className = 'tool-box';
  box.style.borderLeftColor = result.isError ? '#ef4444' : '#4ade80';

  let diffHtml = '';
  if (result.diff) {
    diffHtml = `
      <div class="diff-container">
        <div class="diff-header">📝 File Changed: ${escapeHtml(result.diff.path)}</div>
        <div class="diff-del">- ${escapeHtml(result.diff.original.slice(0, 400))}</div>
        <div class="diff-add">+ ${escapeHtml(result.diff.modified.slice(0, 400))}</div>
      </div>
    `;
  }

  box.innerHTML = `
    <div class="tool-title" style="color: ${result.isError ? '#ef4444' : '#4ade80'};">
      ${result.isError ? '✕ Tool Failed' : '✓ Tool Result'}: ${result.name}
    </div>
    <div class="tool-args" style="max-height: 120px; overflow-y: auto;">${escapeHtml(result.content)}</div>
    ${diffHtml}
  `;
  card.appendChild(box);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sendPrompt() {
  const text = promptInput.value.trim();
  if (!text) return;

  appendUserMessage(text);
  promptInput.value = '';
  currentAssistantCard = null;
  currentReasoningBody = null;

  btnSend.style.display = 'none';
  btnStop.style.display = 'block';
  agentStatus.innerHTML = `<span style="color: #38bdf8;">●</span> Berpikir (Planning)...`;

  vscode.postMessage({
    type: 'sendPrompt',
    text,
    modelKey: modelSelect.value
  });
}

btnSend.addEventListener('click', sendPrompt);
promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendPrompt();
  }
});

btnStop.addEventListener('click', () => {
  vscode.postMessage({ type: 'cancel' });
  btnSend.style.display = 'block';
  btnStop.style.display = 'none';
  agentStatus.innerHTML = `<span>●</span> Dibatalkan.`;
});

btnClear.addEventListener('click', () => {
  messagesContainer.innerHTML = `
    <div class="msg-row">
      <div class="msg-assistant">
        <strong>Zephyr Autonomous Agent</strong><br>
        Sesi baru dimulai. Apa yang ingin lu kerjakan selanjutnya?
      </div>
    </div>
  `;
  vscode.postMessage({ type: 'clearChat' });
});

btnSettings.addEventListener('click', () => {
  vscode.postMessage({ type: 'openSettings' });
});

window.addEventListener('message', (event) => {
  const msg = event.data;
  switch (msg.type) {
    case 'chunk':
      appendText(msg.text);
      agentStatus.innerHTML = `<span style="color: #4ade80;">●</span> Menjawab...`;
      break;
    case 'reasoning':
      appendReasoning(msg.text);
      agentStatus.innerHTML = `<span style="color: #c4b5fd;">●</span> Menalar (Reasoning)...`;
      break;
    case 'toolCall':
      appendToolCall(msg.name, msg.arguments);
      agentStatus.innerHTML = `<span style="color: #38bdf8;">●</span> Menjalankan ${msg.name}...`;
      break;
    case 'toolResult':
      appendToolResult(msg.result);
      break;
    case 'status':
      agentStatus.innerHTML = `<span>●</span> ${escapeHtml(msg.text)}`;
      break;
    case 'finish':
      btnSend.style.display = 'block';
      btnStop.style.display = 'none';
      agentStatus.innerHTML = `<span>●</span> Selesai.`;
      break;
    case 'error':
      btnSend.style.display = 'block';
      btnStop.style.display = 'none';
      agentStatus.innerHTML = `<span style="color: #ef4444;">●</span> Error.`;
      const card = ensureAssistantCard();
      const errBox = document.createElement('div');
      errBox.style.color = '#ef4444';
      errBox.style.marginTop = '8px';
      errBox.textContent = `⚠️ Error: ${msg.message}`;
      card.appendChild(errBox);
      break;
  }
});
