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

// DuckDuckGo Live Search Function
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

// Smart Search Triggering Logic
function shouldForceSearch(message, modelType) {
    if (modelType === 'deep-research') return true; // Deep Research mode always searches
    
    const lower = message.toLowerCase().trim();
    const greetings = ['hi', 'hello', 'hey', 'sup', 'salam', 'kemon acho', 'how are you', 'hru', 'tumi ke', 'who r u', 'who are you'];
    
    if (greetings.includes(lower) || lower.split(' ').length < 2) {
        return false;
    }

    const searchKeywords = [
        'who', 'what', 'where', 'when', 'why', 'how', 'latest', 'news', 'search', 'find', 'weather', 
        'price', 'ke e', 'kake bole', 'janis', 'jano ki', 'biography', 'khuje', 'who is', 
        'tell me about', 'details', 'about', 'is', 'are'
    ];
    
    return searchKeywords.some(kw => lower.includes(kw));
}

// Serve Frontend App
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Image Generation Endpoint (Cloudflare Workers AI - FLUX.1-schnell)
app.post('/api/generate-image', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ success: false, error: "Prompt is required for image generation." });
        }

        if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
            console.error("❌ Cloudflare credentials missing!");
            return res.status(500).json({ success: false, error: "Cloudflare credentials are not set." });
        }

        console.log(`🎨 Generating image via Cloudflare Workers AI for prompt: "${prompt}"...`);

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
            const errText = await response.text();
            console.error("❌ Cloudflare API Error Response:", errText);
            throw new Error(`Cloudflare API Error: ${errText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString('base64');
        const imageUrl = `data:image/jpeg;base64,${base64Image}`;

        console.log("✅ Image generated successfully!");
        res.json({ success: true, imageUrl: imageUrl });

    } catch (error) {
        console.error("❌ Image Generation Server Error:", error.message);
        res.status(500).json({ success: false, error: error.message || "Failed to generate image" });
    }
});

// Chat Endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, modelType, enableSearch, languageInstruction } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: "Invalid messages format" });
        }

        let updatedMessages = [...messages];
        const lastUserMessage = messages[messages.length - 1]?.content || "";

        let systemIdentityPrompt = `You are Capella AI, an intelligent, helpful, and natural AI assistant created and owned by Shadman Wasif Faruque (born October 9, 2014, in Pabna, Bangladesh).
CRITICAL RULES:
1. NEVER spam or brag about your creator unless the user explicitly asks about who created you, who is your owner, or mentions Shadman Wasif Faruque.
2. For normal conversation, answering questions, or problem-solving, respond naturally without inserting creator links or names.
3. If explicitly asked about your creator/owner, state clearly that you were created by Shadman Wasif Faruque and provide his portfolio link: [Shadman web](https://shadmanwasif.github.io/Shadman-Wasif-Faruque/).
4. Use provided web search results to accurately answer facts, people, news, or general knowledge.`;

        if (modelType === 'deep-research') {
            systemIdentityPrompt += `\nMODE: DEEP RESEARCH. Perform thorough analysis, multi-step logical breakdown, and structure your output comprehensively with detailed sections.`;
        }

        if (languageInstruction) {
            systemIdentityPrompt += `\n${languageInstruction}`;
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

        console.log("🤖 Sending request to Groq AI...");

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

        // Safety fallback to prevent model hallucinating base brand identity
        reply = reply.replace(/ChatGPT/gi, "Capella AI");
        reply = reply.replace(/OpenAI/gi, "Shadman Wasif Faruque");

        res.json({ reply: reply, searched: isSearching });

    } catch (error) {
        console.error("❌ API Error:", error.message);
        res.status(500).json({ error: error.message || "Server error occurred." });
    }
});

app.listen(port, () => {
    console.log(`🚀 Capella AI Backend is running on port ${port}`);
});
