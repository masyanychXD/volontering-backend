import arcjet, { shield, detectBot, slidingWindow}  from "@arcjet/node";

if(!process.env.ARCJET_KEY && process.env.NODE_ENV !== 'test') {
    throw new Error("process.env.ARCJET_KEY is missing");
}

const aj = arcjet({
    key: process.env.ARCJET_KEY!,
    rules: [
        shield({ mode: "LIVE" }),
        detectBot({
            mode: "LIVE",
            allow: [
                "CATEGORY:SEARCH_ENGINE",
                "CATEGORY:PREVIEW",
            ],
        }),
    ],
});

export default aj;