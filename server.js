require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { Groq } = require('groq-sdk');
const { search } = require('duck-duck-scrape');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

async function performWebSearch(query) {
    try {
        console.log(`🔍 Searching via DuckDuckGo for: "${query}"...`);
        const searchResults = await search(query, {
            safeSearch: "MODERATE",
            limit: 5
        });
        
        if (!searchResults || !searchResults.results || searchResults.results.length === 0) {
            return "No web results found.";
        }

        let formattedContext = "Real-time Verified Web Search Results:\n";
        searchResults.results.forEach((res, index) => {
            formattedContext += `\n[Result ${index + 1}]\nTitle: ${res.title}\nContent: ${res.description}\nURL: ${res.url}\n`;
        });

        return formattedContext;
    } catch (error) {
        console.error("DuckDuckGo Search Error:", error.message);
        return "Failed to fetch search results.";
    }
}

function shouldForceSearch(message, modelType) {
    if (modelType === 'deep-research') return true; // Deep Research always searches
    const lower = message.toLowerCase();
    const searchKeywords = ['who is', 'what is', 'latest', 'news', 'search', 'find', 'weather', 'price', 'tumi ki', 'ke e', 'kake bole', 'janis', 'jano ki', 'biography', 'khuje'];
    return searchKeywords.some(kw => lower.includes(kw));
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/generate-image', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ success: false, error: "Prompt is required for image generation." });
        }

        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID.trim()}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN.trim()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ prompt: prompt })
            }
        );

        if (!response.ok) {
            throw new Error(`Cloudflare API Error`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const base64Image = Buffer.from(arrayBuffer).toString('base64');
        res.json({ success: true, imageUrl: `data:image/jpeg;base64,${base64Image}` });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { messages, modelType, enableSearch } = req.body;

        let updatedMessages = [...messages];
        const lastUserMessage = messages[messages.length - 1]?.content || "";

        let systemIdentityPrompt = `You are Capella AI, an intelligent, advanced, and helpful AI assistant created and owned by Shadman Wasif Faruque (born October 9, 2014, Pabna, Bangladesh). 
- NEVER spam about your creator unless explicitly asked. 
- If asked who you are, state you are Capella AI created by Shadman Wasif Faruque.
- Use provided real-time web search results to give accurate, detailed, and deep factual answers.`;

        if (modelType === 'deep-research') {
            systemIdentityPrompt += `\nMODE: DEEP RESEARCH. Perform thorough analysis, multi-step logical breakdown, and structure your output comprehensively with detailed sections.`;
        }

        let isSearching = false;
        let searchData = "";

        if (enableSearch || shouldForceSearch(lastUserMessage, modelType)) {
            isSearching = true;
            searchData = await performWebSearch(lastUserMessage);
        }

        if (searchData) {
            updatedMessages.unshift({
                role: "system",
                content: `${systemIdentityPrompt}\n\nLive Web Search Results:\n${searchData}`
            });
        } else {
            updatedMessages.unshift({
                role: "system",
                content: systemIdentityPrompt
            });
        }

        let selectedModel = "openai/gpt-oss-20b";
        let maxTokens = 2048;
        let temperature = 0.3;

        if (modelType === 'deep-research') {
            temperature = 0.2;
            maxTokens = 4096;
        } else if (modelType === 'simple') {
            maxTokens = 1024;
        }

        const chatCompletion = await groq.chat.completions.create({
            messages: updatedMessages,
            model: selectedModel,
            temperature: temperature,
            max_tokens: maxTokens,
        });

        let reply = chatCompletion.choices[0]?.message?.content || "";

        reply = reply.replace(/ChatGPT/gi, "Capella AI");
        reply = reply.replace(/OpenAI/gi, "Shadman Wasif Faruque");

        res.json({ reply: reply, searched: isSearching });

    } catch (error) {
        res.status(500).json({ error: error.message || "Server error occurred." });
    }
});

app.listen(port, () => {
    console.log(`🚀 Capella AI Backend running on port ${port}`);
});
