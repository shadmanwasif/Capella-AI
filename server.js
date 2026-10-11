require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { Groq } = require('groq-sdk');
const { tavily } = require('@tavily/core');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const tvl = tavily({ apiKey: process.env.TAVILY_API_KEY });

// Cloudflare Credentials
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 'Cfut_TgRLkUDAqyW4xqApVECoQ1xU0iienhbPURYrJmUE4dbf8660';
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || 'A42f510f52506651c61fdbd6a367ce25';

async function performWebSearch(query) {
    try {
        console.log(`🔍 Searching via Tavily for: "${query}"...`);
        const response = await tvl.search(query, {
            searchDepth: "basic",
            maxResults: 4
        });
        
        if (!response || !response.results || response.results.length === 0) {
            return "No web results found.";
        }

        let formattedContext = "Real-time Verified Web Search Results:\n";
        response.results.forEach((res, index) => {
            formattedContext += `\n[Result ${index + 1}]\nTitle: ${res.title}\nContent: ${res.content}\nURL: ${res.url}\n`;
        });

        return formattedContext;
    } catch (error) {
        console.error("Tavily Search Error:", error.message);
        return "Failed to fetch search results.";
    }
}

function shouldSearch(message) {
    const lowerMsg = message.toLowerCase().trim();
    const greetings = ['hi', 'hello', 'hey', 'hi!', 'hello!', 'sup', 'salam', 'kemon acho', 'how are you', 'what', 'who made u', 'who are you'];
    
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
            return res.status(400).json({ error: "Prompt is required for image generation." });
        }

        console.log(`🎨 Generating image via Cloudflare Workers AI for prompt: "${prompt}"...`);

        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ prompt: prompt })
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Cloudflare API Error: ${errText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString('base64');
        const imageUrl = `data:image/jpeg;base64,${base64Image}`;

        res.json({ success: true, imageUrl: imageUrl });

    } catch (error) {
        console.error("Image Generation Error:", error.message);
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
        
        if (enableSearch && lastUserMessage.length > 0 && shouldSearch(lastUserMessage)) {
            const searchData = await performWebSearch(lastUserMessage);
            
            updatedMessages.unshift({
                role: "system",
                content: `You are Capella AI, developed by Shadman Wasif Faruque. Whenever anyone asks about Shadman Wasif Faruque, his personal information, bio, or details about your owner/creator, always include his official portfolio website link using the exact anchor text [Shadman web](https://shadmanwasif.github.io/Shadman-Wasif-Faruque/).

CRITICAL INSTRUCTION: Real-time search data is provided below. You MUST rely EXCLUSIVELY on this search data to answer factual questions. 

${searchData}`
            });
        } else {
            updatedMessages.unshift({
                role: "system",
                content: `You are Capella AI, a friendly and intelligent assistant created, owned, and developed by Shadman Wasif Faruque. Whenever anyone asks about Shadman Wasif Faruque, his personal information, bio, or details about your owner/creator, always include his official portfolio website link using the exact anchor text [Shadman web](https://shadmanwasif.github.io/Shadman-Wasif-Faruque/).`
            });
        }

        console.log("Sending request to Groq AI...");

        const chatCompletion = await groq.chat.completions.create({
            messages: updatedMessages,
            model: "openai/gpt-oss-20b",
            temperature: 0.3,
            max_tokens: 2048,
        });

        const reply = chatCompletion.choices[0]?.message?.content;
        res.json({ reply: reply });

    } catch (error) {
        console.error("API Error:", error.message);
        res.status(500).json({ error: error.message || "Server error occurred." });
    }
});

app.listen(port, () => {
    console.log(`🚀 Capella AI Backend is running on port ${port}`);
    console.log(`🌐 Model: openai/gpt-oss-20b & Cloudflare Image Generation Enabled`);
});
