export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const body = await request.json();
        const { prompt } = body;

        if (!prompt) {
            return new Response(JSON.stringify({ success: false, error: "Prompt required." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const ACCOUNT_ID = env.CLOUDFLARE_ACCOUNT_ID;
        const API_TOKEN = env.CLOUDFLARE_API_TOKEN;

        if (!ACCOUNT_ID || !API_TOKEN) {
            return new Response(JSON.stringify({ success: false, error: "Cloudflare AI credentials missing." }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }

        const cfRes = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID.trim()}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${API_TOKEN.trim()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ prompt: prompt })
            }
        );

        if (!cfRes.ok) {
            const errText = await cfRes.text();
            throw new Error(errText);
        }

        const arrayBuffer = await cfRes.arrayBuffer();
        
        // Convert ArrayBuffer to Base64 safely in Cloudflare Workers
        let binary = '';
        const bytes = new Uint8Array(arrayBuffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64Image = btoa(binary);

        return new Response(JSON.stringify({ 
            success: true, 
            imageUrl: `data:image/jpeg;base64,${base64Image}` 
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
