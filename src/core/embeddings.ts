import { OpenAIEmbeddings } from "@langchain/openai";

let embeddings: OpenAIEmbeddings | null = null;

export function getEmbeddings(): OpenAIEmbeddings {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not set");
    }

    if (!embeddings) {
        embeddings = new OpenAIEmbeddings({
            apiKey,
            model: "text-embedding-3-large",
            dimensions: 1024, // Reduce from 3072 to save storage, maintain quality
            batchSize: 100,
        });
    }

    return embeddings;
}

// Cost: $0.13 per 1M tokens
// Quality: 64.6% MTEB, 54.9% MIRACL (best OpenAI option)
