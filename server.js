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
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

// Strict Smart Search Triggering Logic (No search on greetings/general chat)
function shouldForceSearch(message, modelType) {
    if (modelType === 'deep-research') return true;
    
    const lower = message.toLowerCase().trim();
    const greetings = ['hi', 'hello', 'hey', 'sup', 'salam', 'kemon acho', 'how are you', 'hru', 'tumi ke', 'who r u', 'who are you', 'gm', 'gn'];
    
    // Do not search for greetings or very short casual phrases
    if (greetings.includes(lower) || lower.split(' ').length < 2) {
        return false;
    }

    const searchKeywords = [
        'who is', 'what is', 'where is', 'when is', 'why', 'how to', 'latest', 'news', 'search', 'find', 'weather', 
        'price', 'biography', 'details about', 'tell me about', 'janis', 'jano ki', 'khuje', 'serch', 'chesser'
    ];
    
    return searchKeywords.some(kw => lower.includes(kw));
}

// Tavily Web Search API
async function performWebSearch(query) {
    try {
        if (!TAVILY_API_KEY) {
            return "Tavily API key is missing.";
        }

        console.log(`🔍 Searching via Tavily API for: "${query}"...`);
        const response = await axios.post('https://api.tavily.com/search', {
            api_key: TAVILY_API_KEY,
            query: query,
            search_depth: "advanced",
            max_results: 5
        }, { timeout: 8000 });

        const results = response.data?.results || [];
        if (results.length === 0) {
            return "No verified search results found.";
        }

        let formattedContext = "Real-time Verified Web Search Results:\n";
        results.forEach((item, index) => {
            formattedContext += `\n[Source ${index + 1}]\nTitle: ${item.title}\nContent: ${item.content}\nURL: ${item.url}\n`;
        });

        return formattedContext;

    } catch (error) {
        console.error("Web Search Error:", error.message);
        return "Failed to fetch search results.";
    }
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Image Generation Endpoint
app.post('/api/generate-image', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ success: false, error: "Prompt required." });

        if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
            return res.status(500).json({ success: false, error: "Cloudflare credentials missing." });
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

        if (!response.ok) throw new Error(await response.text());

        const arrayBuffer = await response.arrayBuffer();
        const base64Image = Buffer.from(arrayBuffer).toString('base64');
        res.json({ success: true, imageUrl: `data:image/jpeg;base64,${base64Image}` });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Chat Endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, modelType, enableSearch, languageInstruction } = req.body;
        if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "Invalid messages format" });

        let updatedMessages = [...messages];
        const lastUserMessage = messages[messages.length - 1]?.content || "";

        // Use ONLY the current user message for clean search query without duplication
        let searchQuery = lastUserMessage;

        let systemIdentityPrompt = `You are Capella AI, an intelligent, helpful, and natural AI assistant created and owned by Shadman Wasif Faruque (born October 9, 2014, in Pabna, Bangladesh).
STRICT INSTRUCTIONS:
1. NEVER brag about your creator unless explicitly asked.
2. Carefully analyze all search results. If accurate search results exist, provide a detailed response.
3. If search results do not contain verified or authentic information about the person/topic, state clearly that you do not have verified details, and DO NOT fabricate or hallucinate fake biographies.`;

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
            searchData = await performWebSearch(searchQuery);
        }

        if (searchData) {
            updatedMessages.unshift({
                role: "system",
                content: `${systemIdentityPrompt}\n\nLive Web Search Results:\n${searchData}`
            });
        } else {
            updatedMessages.unshift({ role: "system", content: systemIdentityPrompt });
        }

        console.log("🤖 Sending request to Groq AI...");

        const chatCompletion = await groq.chat.completions.create({
            messages: updatedMessages,
            model: "openai/gpt-oss-20b",
            temperature: 0.1, // Low temperature to completely stop fake/hallucinated answers
            max_tokens: 2048,
        });

        let reply = chatCompletion.choices[0]?.message?.content || "";

        reply = reply.replace(/ChatGPT/gi, "Capella AI");
        reply = reply.replace(/OpenAI/gi, "Shadman Wasif Faruque");

        res.json({ reply: reply, searched: isSearching });

    } catch (error) {
        console.error("❌ API Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`🚀 Capella AI Backend running on port ${port}`);
});