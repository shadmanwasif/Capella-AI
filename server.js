require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { Groq } = require('groq-sdk');
const axios = require('axios');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname)));

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

function shouldForceSearch(message, modelType) {
    if (modelType === 'deep-research') return true;
    const lower = message.toLowerCase().trim();
    const greetings = ['hi', 'hello', 'hey', 'sup', 'salam', 'kemon acho', 'how are you', 'hru', 'tumi ke', 'who r u', 'who are you', 'gm', 'gn'];
    if (greetings.includes(lower) || lower.split(' ').length < 2) {
        return false;
    }
    const searchKeywords = [
        'who is', 'what is', 'where is', 'when is', 'why', 'how to', 'latest', 'news', 'search', 'find', 'weather', 
        'price', 'biography', 'details about', 'tell me about', 'janis', 'jano ki', 'khuje', 'serch', 'chesser'
    ];
    return searchKeywords.some(kw => lower.includes(kw));
}

async function performWebSearch(query) {
    try {
        if (!TAVILY_API_KEY) return "Tavily API key is missing.";
        const response = await axios.post('https://api.tavily.com/search', {
            api_key: TAVILY_API_KEY,
            query: query,
            search_depth: "advanced",
            max_results: 5
        }, { timeout: 8000 });

        const results = response.data?.results || [];
        if (results.length === 0) return "No verified search results found.";

        let formattedContext = "Real-time Verified Web Search Results:\n";
        results.forEach((item, index) => {
            formattedContext += `\n[Source ${index + 1}]\nTitle: ${item.title}\nContent: ${item.content}\nURL: ${item.url}\n`;
        });
        return formattedContext;
    } catch (error) {
        return "Failed to fetch search results.";
    }
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// High-Quality Flux Image Generator Endpoint (No NSFW blocks, beautiful details)
app.post('/api/generate-image', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ success: false, error: "Prompt required." });

        const encodedPrompt = encodeURIComponent(prompt);
        // model=flux যোগ করার ফলে এখন ছবি অনেক শার্প এবং প্রিমিয়াম কোয়ালিটির হবে
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&model=flux&nologo=true`;

        res.json({ success: true, imageUrl: imageUrl });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { messages, modelType, enableSearch, languageInstruction } = req.body;
        if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "Invalid messages format" });

        let updatedMessages = [...messages];
        const lastUserMessage = messages[messages.length - 1]?.content || "";

        let systemIdentityPrompt = `You are Capella AI, an intelligent, helpful, friendly, and expressive AI assistant created and owned by Shadman Wasif Faruque (born October 9, 2014, in Pabna, Bangladesh).
STRICT INSTRUCTIONS:
1. Use lots of emojis (such as 😊, 🚀, 💡, 🔥, ✨, 🤖, 👍, 🌟, 🎉, etc.) generously and naturally throughout your responses to make the chat lively, fun, and engaging!
2. NEVER brag about your creator unless explicitly asked.
3. Carefully analyze all search results. If accurate search results exist, provide a detailed response.
4. Format any tabular comparisons, charts, or structured data cleanly in Markdown Tables.`;

        if (modelType === 'deep-research') {
            systemIdentityPrompt += `\nMODE: DEEP RESEARCH. Perform thorough analysis and structure your output comprehensively.`;
        }
        if (languageInstruction) {
            systemIdentityPrompt += `\n${languageInstruction}`;
        }

        let isSearching = false;
        let searchData = "";
        if (enableSearch && shouldForceSearch(lastUserMessage, modelType)) {
            isSearching = true;
            searchData = await performWebSearch(lastUserMessage);
        }

        if (searchData) {
            updatedMessages.unshift({
                role: "system",
                content: `${systemIdentityPrompt}\n\nLive Web Search Results:\n${searchData}`
            });
        } else {
            updatedMessages.unshift({ role: "system", content: systemIdentityPrompt });
        }

        const chatCompletion = await groq.chat.completions.create({
            messages: updatedMessages,
            model: "openai/gpt-oss-20b",
            temperature: 0.3,
            max_tokens: 2048,
        });

        let reply = chatCompletion.choices[0]?.message?.content || "";
        reply = reply.replace(/ChatGPT/gi, "Capella AI");
        reply = reply.replace(/OpenAI/gi, "Shadman Wasif Faruque");

        res.json({ reply: reply, searched: isSearching });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`🚀 Capella AI Backend running on port ${port}`);
});

module.exports = app;
