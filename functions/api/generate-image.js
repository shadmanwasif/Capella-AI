export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const body = await request.json();
        const { prompt } = body;

        if (!prompt) {
            return new Response(JSON.stringify({ success: false, error: "Prompt required." }), { status: 400 });
        }

        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID.trim()}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN.trim()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ prompt: prompt })
            }
        );

        if (!response.ok) throw new Error(await response.text());
        const arrayBuffer = await response.arrayBuffer();
        const base64Image = Buffer.from(arrayBuffer).toString('base64');

        return new Response(JSON.stringify({ success: true, imageUrl: `data:image/jpeg;base64,${base64Image}` }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
    }
}
