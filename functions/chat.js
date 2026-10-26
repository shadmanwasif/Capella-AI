export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const body = await request.json();
        const { messages, modelType, enableSearch, languageInstruction } = body;

        if (!messages || !Array.isArray(messages)) {
            return new Response(JSON.stringify({ error: "Invalid messages format" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const GROQ_API_KEY = env.GROQ_API_KEY;
        const TAVILY_API_KEY = env.TAVILY_API_KEY;

        let updatedMessages = [...messages];
        const lastUserMessage = messages[messages.length - 1]?.content || "";

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

        const shouldForceSearch = (msg, mType) => {
            if (mType === 'deep-research') return true;
            const lower = msg.toLowerCase().trim();
            const greetings = ['hi', 'hello', 'hey', 'sup', 'salam', 'kemon acho', 'how are you', 'hru', 'tumi ke', 'who r u', 'who are you', 'gm', 'gn'];
            if (greetings.includes(lower) || lower.split(' ').length < 2) return false;
            const keywords = ['who is', 'what is', 'where is', 'when is', 'why', 'how to', 'latest', 'news', 'search', 'find', 'weather', 'price', 'biography', 'details about', 'tell me about'];
            return keywords.some(kw => lower.includes(kw));
        };

        if (enableSearch && shouldForceSearch(lastUserMessage, modelType) && TAVILY_API_KEY) {
            isSearching = true;
            try {
                const tavilyRes = await fetch('https://api.tavily.com/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        api_key: TAVILY_API_KEY,
                        query: lastUserMessage,
                        search_depth: "advanced",
                        max_results: 5
                    })
                });
                const tavilyJson = await tavilyRes.json();
                const results = tavilyJson?.results || [];
                if (results.length > 0) {
                    searchData = "Real-time Verified Web Search Results:\n";
                    results.forEach((item, idx) => {
                        searchData += `\n[Source ${idx + 1}]\nTitle: ${item.title}\nContent: ${item.content}\nURL: ${item.url}\n`;
                    });
                }
            } catch (err) {
                console.error("Tavily Error:", err);
            }
        }

        if (searchData) {
            updatedMessages.unshift({
                role: "system",
                content: `${systemIdentityPrompt}\n\nLive Web Search Results:\n${searchData}`
            });
        } else {
            updatedMessages.unshift({ role: "system", content: systemIdentityPrompt });
        }

        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: updatedMessages,
                temperature: 0.1,
                max_tokens: 2048
            })
        });

        const groqJson = await groqRes.json();
        let reply = groqJson.choices?.[0]?.message?.content || "No response generated.";

        reply = reply.replace(/ChatGPT/gi, "Capella AI");
        reply = reply.replace(/OpenAI/gi, "Shadman Wasif Faruque");

        return new Response(JSON.stringify({ reply: reply, searched: isSearching }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    }javascript catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
