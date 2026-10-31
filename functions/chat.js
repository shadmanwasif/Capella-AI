export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const body = await request.json();
        const { messages, modelType, enableSearch, languageInstruction } = body;

        if (!messages || !Array.isArray(messages)) {
            return new Response(JSON.stringify({ error: "Invalid messages format" }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        let updatedMessages = [...messages];
        const lastUserMessage = messages[messages.length - 1]?.content || "";

        // Capella AI System Identity Prompt
        let systemIdentityPrompt = `You are Capella AI, an intelligent, helpful, friendly, and expressive AI assistant created and owned by Shadman Wasif Faruque.
STRICT INSTRUCTIONS:
1. Use lots of emojis (such as 😊, 🚀, 💡, 🔥, ✨, 🤖, 👍, 🌟, 🎉, etc.) generously and naturally throughout your responses to make the chat lively, fun, and engaging!
2. NEVER brag about your creator unless explicitly asked.
3. Carefully analyze all search results. If accurate search results exist, provide a detailed response.
4. If search results do not contain verified or authentic information about the person/topic, state clearly that you do not have verified details, and DO NOT fabricate or hallucinate fake biographies.`;

        if (modelType === 'deep-research') {
            systemIdentityPrompt += `\nMODE: DEEP RESEARCH. Perform thorough analysis and structure your output comprehensively.`;
        }
        if (languageInstruction) {
            systemIdentityPrompt += `\n${languageInstruction}`;
        }

        // Real-time Search using Tavily API if enabled
        let searchData = "";
        if (enableSearch && env.TAVILY_API_KEY) {
            try {
                const searchRes = await fetch('https://api.tavily.com/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        api_key: env.TAVILY_API_KEY,
                        query: lastUserMessage,
                        search_depth: "advanced",
                        max_results: 5
                    })
                });
                const searchJson = await searchRes.json();
                const results = searchJson.results || [];
                if (results.length > 0) {
                    searchData = "Real-time Verified Web Search Results:\n" + results.map((item, i) => `[Source ${i+1}]\nTitle: ${item.title}\nContent: ${item.content}\nURL: ${item.url}`).join('\n\n');
                }
            } catch (e) {
                console.error("Search error:", e);
            }
        }

        if (searchData) {
            updatedMessages.unshift({ role: "system", content: `${systemIdentityPrompt}\n\nLive Web Search Results:\n${searchData}` });
        } else {
            updatedMessages.unshift({ role: "system", content: systemIdentityPrompt });
        }

        // Call Groq API via standard Fetch API
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.GROQ_API_KEY.trim()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: updatedMessages,
                model: "openai/gpt-oss-20b",
                temperature: 0.3,
                max_tokens: 2048
            })
        });

        if (!groqRes.ok) {
            const errText = await groqRes.text();
            throw new Error(`Groq API Error: ${errText}`);
        }

        const groqData = await groqRes.json();
        let reply = groqData.choices?.[0]?.message?.content || "No response generated.";
        
        reply = reply.replace(/ChatGPT/gi, "Capella AI");
        reply = reply.replace(/OpenAI/gi, "Shadman Wasif Faruque");

        return new Response(JSON.stringify({ reply: reply, searched: !!searchData }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
