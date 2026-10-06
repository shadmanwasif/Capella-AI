require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Groq } = require('groq-sdk');
const { tavily } = require('@tavily/core');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const tvl = tavily({ apiKey: process.env.TAVILY_API_KEY });

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
                content: `You are Capella AI, developed by Shadman Wasif Faruque. 
CRITICAL INSTRUCTION: Real-time search data is provided below. You MUST rely EXCLUSIVELY on this search data to answer factual questions. 

${searchData}`
            });
        } else {
            updatedMessages.unshift({
                role: "system",
                content: `You are Capella AI, a friendly and intelligent assistant developed by Shadman Wasif Faruque.`
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
    console.log(`🚀 Capella AI Backend is running on http://localhost:${port}`);
    console.log(`🌐 Smart Web Search Enabled`);
});