const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static("public"));

/* =========================
   🔥 GEMINI API KEY
========================= */
const GEMINI_API_KEY = "AIzaSyDGEvrUA7tJ8eE-vOFk5pP33p2ADusHGlI";

/* =========================
   🔥 MODEL
========================= */
let MODEL_NAME = "gemini-1.5-flash";

/* =========================
   🔥 FETCH
========================= */
const fetchFn =
    global.fetch ||
    ((...args) =>
        import("node-fetch").then(({ default: fetch }) =>
            fetch(...args)
        )
    );

/* =========================
   🔥 MODEL LOAD
========================= */
async function loadModel() {

    try {

        const res = await fetchFn(
            `https://generativelanguage.googleapis.com/v1/models?key=${GEMINI_API_KEY}`
        );

        const data = await res.json();

        const preferred = [
            "gemini-1.5-flash",
            "gemini-1.5-pro"
        ];

        let found = null;

        for (const p of preferred) {

            found = data.models?.find(m =>
                m.name.includes(p)
            );

            if (found) break;
        }

        if (!found) {

            found = data.models?.find(m =>
                m.name.includes("gemini")
            );
        }

        if (found) {
            MODEL_NAME = found.name.replace("models/", "");
        }

        console.log("✅ MODEL:", MODEL_NAME);

    } catch (err) {

        console.log("⚠️ MODEL LOAD FAIL");
    }
}

/* =========================
   🔥 TRANSLATE
========================= */
async function translate(text, fromLang, toLang) {

    try {

        const prompt = `
You are a professional real-time interpreter for police, hospital, airport, and emergency situations.

Your job is NOT simple translation.

You MUST intelligently process imperfect multilingual speech.

Tasks:

1. Detect and correct speech recognition errors aggressively.
2. Understand mixed-language sentences.
3. Infer intended meaning from context.
4. Convert broken speech into a natural complete sentence.
5. Preserve original meaning accurately.
6. Then translate naturally into the target language.

IMPORTANT RULES:

- Speakers may mix multiple languages in one sentence.
- Korean words may appear inside English sentences.
- English words may appear inside Korean sentences.
- Japanese or Chinese words may appear together with Korean or English.
- You MUST understand the overall meaning across all languages.

Examples:
- "passport 어디 있어요" → understand correctly
- "지갑 lost 했어요" → understand correctly
- "병원 go 싶어요" → understand correctly

Speech may contain:
- grammar mistakes
- incomplete sentences
- pronunciation errors
- speech recognition mistakes
- repeated words
- fragmented phrases

You MUST:
- fix obvious recognition mistakes
- create the most natural intended sentence
- preserve factual meaning
- NEVER invent new facts
- NEVER change important meaning
- NEVER explain your reasoning

If a word is unclear:
- use surrounding context
- choose the most likely intended meaning

From: ${fromLang}
To: ${toLang}

Text:
${text}

Return ONLY the final translated sentence.
`;

        const res = await fetchFn(
            `https://generativelanguage.googleapis.com/v1/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    contents: [
                        {
                            role: "user",
                            parts: [
                                {
                                    text: prompt
                                }
                            ]
                        }
                    ]
                })
            }
        );

        /* =========================
           🔥 ERROR CHECK
        ========================= */

        if (!res.ok) {

            const errText = await res.text();

            console.log("❌ GEMINI ERROR");
            console.log(res.status);
            console.log(errText);

            return `API ERROR ${res.status}`;
        }

        const data = await res.json();

        return (
            data?.candidates?.[0]?.content?.parts?.[0]?.text ||
            "Translation Error"
        );

    } catch (err) {

        console.log("❌ translate error:", err);

        return "Translation Error";
    }
}

/* =========================
   🔥 SOCKET
========================= */
io.on("connection", (socket) => {

    console.log("✅ connected:", socket.id);

    socket.on("joinRoom", (roomId) => {

        socket.join(roomId);

        console.log("✅ joined:", roomId);
    });

    socket.on("sendSpeech", async (data) => {

        if (
            !data?.roomId ||
            !data?.text ||
            !data?.fromLang ||
            !data?.toLang
        ) {
            return;
        }

        console.log("🎤", data.text);

        const translated = await translate(
            data.text,
            data.fromLang,
            data.toLang
        );

        io.to(data.roomId).emit("receiveMessage", {

            original: data.text,

            translated,

            toLang: data.toLang
        });
    });
});

/* =========================
   🔥 START
========================= */
server.listen(3000, "0.0.0.0", async () => {

    console.log("🚀 SERVER START");

    await loadModel();
});
