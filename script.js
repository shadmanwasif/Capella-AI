let chatHistory = [];
let isGenerating = false;
let abortController = null;

const chatContainer = document.getElementById('chatContainer');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const modelSelector = document.getElementById('modelSelector');
const searchToggle = document.getElementById('searchToggle');
const langSelect = document.getElementById('langSelect');
const themeSelect = document.getElementById('themeSelect');

document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingsPanel').classList.add('active');
    document.getElementById('overlay').classList.add('active');
});
document.getElementById('closeSettingsBtn').addEventListener('click', () => {
    document.getElementById('settingsPanel').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
});
document.getElementById('menuBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('overlay').classList.add('active');
});
document.getElementById('closeBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('active');
});
document.getElementById('overlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('settingsPanel').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
});

themeSelect.addEventListener('change', (e) => {
    document.body.classList.toggle('light-mode', e.target.value === 'light');
});

document.getElementById('newChatBtn').addEventListener('click', () => {
    chatContainer.innerHTML = `<div class="message-wrapper capella-wrapper"><div class="message-header"><img src="https://i.ibb.co.com/tVR2mBp/a98ff012-7af2-4721-86c9-7ce345972666.png" class="sender-icon"><span class="sender-name">Capella</span></div><div class="message-box-outer"><div class="copy-tooltip">Copied!</div><div class="message capella-msg" onclick="copyMessageText(this)">Hi, I am Capella AI created by Shadman Wasif Faruque! How can I help you today? 😊</div></div></div>`;
    chatHistory = [];
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('active');
});

// Markdown & Code Runner Integration
function renderMessageContent(content) {
    let parsedHtml = typeof marked !== 'undefined' ? marked.parse(content) : content.replace(/\n/g, '<br>');

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = parsedHtml;

    const codeBlocks = tempDiv.querySelectorAll('pre code');
    codeBlocks.forEach((codeBlock) => {
        const pre = codeBlock.parentElement;
        const language = (codeBlock.className.match(/language-(\w+)/) || [])[1] || 'javascript';

        const runnerContainer = document.createElement('div');
        runnerContainer.className = 'code-runner-container';

        const header = document.createElement('div');
        header.className = 'code-runner-header';
        header.innerHTML = `
            <span class="code-lang">${language.toUpperCase()}</span>
            <div class="code-actions">
                <button class="btn-copy" onclick="copyCode(this)">Copy</button>
                ${(language === 'javascript' || language === 'html' || language === 'js') ? 
                  `<button class="btn-run" onclick="runCode(this)">▶ Run</button>` : ''}
            </div>
        `;

        const outputFrame = document.createElement('iframe');
        outputFrame.className = 'code-output-frame';
        outputFrame.style.display = 'none';

        pre.parentNode.insertBefore(runnerContainer, pre);
        runnerContainer.appendChild(header);
        runnerContainer.appendChild(pre);
        runnerContainer.appendChild(outputFrame);
    });

    return tempDiv.innerHTML;
}

function copyCode(button) {
    const container = button.closest('.code-runner-container');
    const code = container.querySelector('code').innerText;
    navigator.clipboard.writeText(code).then(() => {
        button.innerText = 'Copied!';
        setTimeout(() => button.innerText = 'Copy', 2000);
    });
}

function runCode(button) {
    const container = button.closest('.code-runner-container');
    const code = container.querySelector('code').innerText;
    const outputFrame = container.querySelector('.code-output-frame');

    outputFrame.style.display = 'block';
    const doc = outputFrame.contentDocument || outputFrame.contentWindow.document;

    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: monospace; padding: 10px; background: #050608; color: #10b981; margin: 0; font-size: 12px; }
            </style>
        </head>
        <body>
            <script>
                console.log = function(...args) {
                    document.body.innerHTML += args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ') + '<br>';
                };
                try {
                    ${code}
                } catch(err) {
                    document.body.innerHTML += '<span style="color:#ef4444;">Error: ' + err.message + '</span>';
                }
            <\/script>
        </body>
        </html>
    `);
    doc.close();
}

function copyMessageText(element) {
    const textToCopy = element.innerText || element.textContent;
    navigator.clipboard.writeText(textToCopy).then(() => {
        const tooltip = element.parentElement.querySelector('.copy-tooltip');
        if (tooltip) {
            tooltip.classList.add('show');
            setTimeout(() => tooltip.classList.remove('show'), 2000);
        }
    });
}

function isImageGenerationRequest(text) {
    const lower = text.toLowerCase();
    return ['generate image', 'create image', 'draw', 'picture of', 'pic make', 'make a pic', 'image of', 'ছবি তৈরি', 'ছবি আঁক', 'ছবি বানাও'].some(kw => lower.includes(kw));
}

function appendMessage(sender, text, type = 'text') {
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${sender === 'user' ? 'user-wrapper' : 'capella-wrapper'}`;
    
    let contentHTML = type === 'image' ? text : (sender === 'capella' ? renderMessageContent(text) : text.replace(/\n/g, '<br>'));

    if (sender === 'user') {
        wrapper.innerHTML = `
            <div class="message-header">
                <img src="https://i.ibb.co.com/tVR2mBp/a98ff012-7af2-4721-86c9-7ce345972666.png" class="sender-icon">
                <span class="sender-name">You</span>
            </div>
            <div class="message-box-outer">
                <div class="copy-tooltip">Copied!</div>
                <div class="message user-msg" onclick="copyMessageText(this)">${contentHTML}</div>
            </div>`;
    } else {
        wrapper.innerHTML = `
            <div class="message-header">
                <img src="https://i.ibb.co.com/tVR2mBp/a98ff012-7af2-4721-86c9-7ce345972666.png" class="sender-icon">
                <span class="sender-name">Capella</span>
            </div>
            <div class="message-box-outer">
                <div class="copy-tooltip">Copied!</div>
                <div class="message capella-msg">${contentHTML}</div>
            </div>`;
    }

    chatContainer.appendChild(wrapper);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function appendThinking(text = "Capella is thinking...") {
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper capella-wrapper';
    wrapper.id = 'thinkingWrapper';
    wrapper.innerHTML = `
        <div class="message-header">
            <img src="https://i.ibb.co.com/tVR2mBp/a98ff012-7af2-4721-86c9-7ce345972666.png" class="sender-icon">
            <span class="sender-name">Capella</span>
        </div>
        <div class="message capella-msg">
            <div class="thinking-indicator">
                <div class="blue-dot-pulse"></div>
                <span style="font-size:0.85rem; color:#94a3b8;">${text}</span>
            </div>
        </div>`;
    chatContainer.appendChild(wrapper);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function removeThinking() {
    const el = document.getElementById('thinkingWrapper');
    if (el) el.remove();
}

async function handleSend() {
    if (isGenerating) {
        if (abortController) abortController.abort();
        isGenerating = false;
        sendBtn.innerText = 'Send';
        sendBtn.classList.remove('stop-mode');
        removeThinking();
        return;
    }

    const text = userInput.value.trim();
    if (!text) return;

    userInput.value = '';
    appendMessage('user', text);
    chatHistory.push({ role: 'user', content: text });

    isGenerating = true;
    sendBtn.innerText = 'Stop';
    sendBtn.classList.add('stop-mode');
    abortController = new AbortController();

    const selectedModel = modelSelector.value;

    if (isImageGenerationRequest(text)) {
        appendThinking("Capella is generating image...");
        try {
            const res = await fetch('/api/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: text }),
                signal: abortController.signal
            });
            const data = await res.json();
            removeThinking();
            isGenerating = false;
            sendBtn.innerText = 'Send';
            sendBtn.classList.remove('stop-mode');

            if (data.success) {
                const imgHTML = `<img src="${data.imageUrl}" class="msg-image"><br><a href="${data.imageUrl}" download="capella.jpg" target="_blank" class="download-img-btn">⬇ Download Image</a>`;
                appendMessage('capella', imgHTML, 'image');
            } else {
                appendMessage('capella', '⚠️ Image generation failed.');
            }
        } catch (e) {
            if (e.name !== 'AbortError') {
                removeThinking();
                appendMessage('capella', '⚠️ Error generating image.');
            }
            isGenerating = false;
            sendBtn.innerText = 'Send';
            sendBtn.classList.remove('stop-mode');
        }
        return;
    }

    const isDeepResearch = selectedModel === 'deep-research';
    const thinkingMsg = isDeepResearch ? "🔍 Capella is performing Deep Research & searching the web..." : "🔍 Capella is searching the web...";
    
    appendThinking(thinkingMsg);

    try {
        const selectedLang = langSelect.value;
        let langInstruction = selectedLang !== "auto" ? `Respond STRICTLY in ${selectedLang} language.` : "";

        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: chatHistory,
                modelType: selectedModel,
                enableSearch: searchToggle.checked,
                languageInstruction: langInstruction
            }),
            signal: abortController.signal
        });

        const data = await res.json();
        removeThinking();
        isGenerating = false;
        sendBtn.innerText = 'Send';
        sendBtn.classList.remove('stop-mode');

        if (res.ok) {
            appendMessage('capella', data.reply);
            chatHistory.push({ role: 'assistant', content: data.reply });
        } else {
            appendMessage('capella', '⚠️ Error processing request.');
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            removeThinking();
            appendMessage('capella', '⚠️ Connection error.');
        }
        isGenerating = false;
        sendBtn.innerText = 'Send';
        sendBtn.classList.remove('stop-mode');
    }
}

sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});