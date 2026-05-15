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
const GEMINI_API_KEY = "";

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
You are a professional real-time interpreter.

Your job is NOT just translation.

You MUST do all steps:

1. Detect and correct speech recognition errors aggressively.
2. Convert into natural, standard English sentence.
3. Then translate to the target language.

IMPORTANT RULES:
- ALWAYS fix words that sound like pronunciation errors.
  Example:
  "to havy" → "too heavy"
  "to heavy" → "too heavy"
- Never keep incorrect grammar.
- If a word is unclear, choose the most likely natural sentence.
- Do NOT preserve original errors.

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
