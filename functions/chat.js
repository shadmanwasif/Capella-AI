export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const body = await request.json();
        const { messages, modelType, enableSearch, languageInstruction } = body;

        let updatedMessages = [...messages];
        const lastUserMessage = messages[messages.length - 1]?.content || "";

        let systemIdentityPrompt = `You are Capella AI, created by Shadman Wasif Faruque. Use lots of emojis generously! 😊🚀`;
        if (languageInstruction) {
            systemIdentityPrompt += `\n${languageInstruction}`;
        }

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
                    searchData = "Real-time Verified Web Search Results:\n" + results.map((item, i) => `[Source ${i+1}] Title: ${item.title}\nContent: ${item.content}`).join('\n');
                }
            } catch (e) {}
        }

        if (searchData) {
            updatedMessages.unshift({ role: "system", content: `${systemIdentityPrompt}\n\n${searchData}` });
        } else {
            updatedMessages.unshift({ role: "system", content: systemIdentityPrompt });
        }

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: updatedMessages,
                model: "openai/gpt-oss-20b",
                temperature: 0.3,
                max_tokens: 2048
            })
        });

        const groqData = await groqRes.json();
        let reply = groqData.choices?.[0]?.message?.content || "No response generated.";
        reply = reply.replace(/ChatGPT/gi, "Capella AI").replace(/OpenAI/gi, "Shadman Wasif Faruque");

        return new Response(JSON.stringify({ reply }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
