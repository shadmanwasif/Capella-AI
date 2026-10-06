const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

// চ্যাট মেমরি বা হিস্ট্রি
let chatHistory = [
    { role: 'system', content: 'You are Capella AI, a highly advanced assistant created by Shadman Wasif Faruque. Speak in the language the user prefers.' }
];

// পেজ ওপেন হলে প্রাথমিক মেসেজ
window.onload = () => {
    appendMessage('bot', 'Hi, How can I help you today? 😊');
};

function appendMessage(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender);
    msgDiv.innerHTML = text;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    // ইউজার মেসেজ অ্যাড করা
    appendMessage('user', text);
    chatHistory.push({ role: 'user', content: text });
    userInput.value = '';

    // টাইপিং ইন্ডিকেটর
    const loadingId = 'loading-' + Date.now();
    const loadingDiv = document.createElement('div');
    loadingDiv.classList.add('message', 'bot');
    loadingDiv.id = loadingId;
    loadingDiv.innerText = 'Capella is typing...';
    chatBox.appendChild(loadingDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        // রেন্ডার লাইভ সার্ভারের সাথে সংযোগের জন্য শুধু '/api/chat' ব্যবহার করা হলো
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: chatHistory })
        });

        const data = await response.json();
        document.getElementById(loadingId).remove(); // টাইপিং রিমুভ

        if (!response.ok) {
            throw new Error(data.error || 'Server issue (500)');
        }

        // এআই রেসপন্স অ্যাড করা
        appendMessage('bot', data.reply);
        chatHistory.push({ role: 'assistant', content: data.reply });

    } catch (error) {
        document.getElementById(loadingId).remove();
        appendMessage('bot', `<span class="error-msg">⚠️ API Error: ${error.message}</span>`);
    }
}

sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});