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

// Cloudflare Credentials from Environment Variables
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

// DuckDuckGo Web Search Function
async function performWebSearch(query) {
    try {
        console.log(`🔍 Searching via DuckDuckGo for: "${query}"...`);
        const searchResults = await search(query, {
            safeSearch: "MODERATE",
            limit: 4
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

function shouldSearch(message) {
    const lowerMsg = message.toLowerCase().trim();
    const greetings = ['hi', 'hello', 'hey', 'hi!', 'hello!', 'sup', 'salam', 'kemon acho', 'how are you', 'hru', 'what', 'who made u', 'who are you', 'who r u', 'who r u?'];
    
    if (greetings.includes(lowerMsg) || lowerMsg.split(' ').length < 2) {
        return false;
    }
    return true;
}

// Image Generation Endpoint using Cloudflare Workers AI (FLUX.1-schnell)
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

app.post('/api/chat', async (req, res) => {
    try {
        const { messages, enableSearch } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: "Invalid messages format" });
        }

        let updatedMessages = [...messages];
        const lastUserMessage = messages[messages.length - 1]?.content || "";

        const systemIdentityPrompt = `You are Capella AI, an intelligent AI assistant created and owned by Shadman Wasif Faruque (born October 9, 2014, Pabna, Bangladesh).
You are NOT ChatGPT and NOT created by OpenAI.

Only when asked about your owner/creator or Shadman Wasif Faruque, mention that you were created by him and provide his portfolio link: [Shadman web](https://shadmanwasif.github.io/Shadman-Wasif-Faruque/).
For general chatter (like "hi", "how are you", "hru"), respond naturally and friendly WITHOUT repeating your owner's link unless asked!`;

        if (enableSearch && lastUserMessage.length > 0 && shouldSearch(lastUserMessage)) {
            const searchData = await performWebSearch(lastUserMessage);
            
            updatedMessages.unshift({
                role: "system",
                content: `${systemIdentityPrompt}\n\nSearch Results:\n${searchData}`
            });
        } else {
            updatedMessages.unshift({
                role: "system",
                content: systemIdentityPrompt
            });
        }

        console.log("🤖 Sending request to Groq AI...");

        const chatCompletion = await groq.chat.completions.create({
            messages: updatedMessages,
            model: "openai/gpt-oss-20b",
            temperature: 0.3,
            max_tokens: 2048,
        });

        const reply = chatCompletion.choices[0]?.message?.content;
        res.json({ reply: reply });

    } catch (error) {
        console.error("❌ API Error:", error.message);
        res.status(500).json({ error: error.message || "Server error occurred." });
    }
});

app.listen(port, () => {
    console.log(`🚀 Capella AI Backend is running on port ${port}`);
});
