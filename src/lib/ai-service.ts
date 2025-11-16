import type { AIProvider } from "@/types/locax";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";
const GEMINI_MODEL = "gemini-1.5-flash-latest";
const GEMINI_CHAT_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434";

type OpenRouterMessageChunk = string | { text?: string };
type OpenRouterResponse = {
  message?: {
    content?: string | OpenRouterMessageChunk[];
  };
};

const chunkToText = (chunk: OpenRouterMessageChunk): string => {
  if (typeof chunk === "string") {
    return chunk;
  }
  return typeof chunk?.text === "string" ? chunk.text : "";
};

const hasTextProperty = (value: unknown): value is { text: string } =>
  typeof value === "object" && value !== null && typeof (value as { text?: unknown }).text === "string";

interface TranslationRequest {
  apiKey?: string;
  sourceText: string;
  languages: string[];
  context?: string;
  provider?: AIProvider;
  model?: string;
  endpoint?: string;
}

export async function generateTranslations({
  apiKey,
  sourceText,
  languages,
  context,
  provider = "openai",
  model,
  endpoint,
}: TranslationRequest): Promise<Record<string, string>> {
  if (provider !== "ollama" && !apiKey) {
    throw new Error("Missing AI API key.");
  }

  const trimmedText = sourceText.trim();
  if (!trimmedText) {
    throw new Error("Source text is empty.");
  }

  if (!languages.length) {
    throw new Error("No target languages provided.");
  }

  const userPrompt = buildTranslationPrompt(trimmedText, languages, context);
  let responseContent: string;

  if (provider === "gemini") {
    responseContent = await requestGeminiTranslation({ apiKey: apiKey!, userPrompt });
  } else if (provider === "openrouter") {
    if (!model?.trim()) {
      throw new Error("Select an OpenRouter model before requesting translations.");
    }
    responseContent = await requestOpenRouterTranslation({ apiKey: apiKey!, userPrompt, model: model.trim() });
  } else if (provider === "ollama") {
    if (!model?.trim()) {
      throw new Error("Select an Ollama model before requesting translations.");
    }
    const resolvedEndpoint = sanitizeEndpointUrl(endpoint);
    responseContent = await requestOllamaTranslation({
      endpoint: resolvedEndpoint,
      userPrompt,
      model: model.trim(),
    });
  } else {
    responseContent = await requestOpenAITranslation({ apiKey: apiKey!, userPrompt });
  }

  const parsed = parseTranslationContent(responseContent, provider);
  return sanitizeTranslations(parsed, languages);
}

interface ProviderRequestPayload {
  apiKey: string;
  userPrompt: string;
}

interface OpenRouterRequestPayload extends ProviderRequestPayload {
  model: string;
}

interface OllamaRequestPayload {
  endpoint: string;
  userPrompt: string;
  model: string;
}

async function requestOpenAITranslation({ apiKey, userPrompt }: ProviderRequestPayload): Promise<string> {
  const response = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You are a professional game localization assistant. Translate short UI strings accurately and concisely. Return JSON only.",
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await safeReadText(response);
    throw new Error(errorText || "Translation request failed.");
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Translation response was empty.");
  }

  return content;
}

async function requestGeminiTranslation({ apiKey, userPrompt }: ProviderRequestPayload): Promise<string> {
  const response = await fetch(`${GEMINI_CHAT_URL}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.4,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await safeReadText(response);
    throw new Error(errorText || "Translation request failed.");
  }

  const data = await response.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    throw new Error("Translation response was empty.");
  }

  return content;
}

async function requestOpenRouterTranslation({ apiKey, userPrompt, model }: OpenRouterRequestPayload): Promise<string> {
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You are a professional game localization assistant. Translate short UI strings accurately and concisely. Return JSON only.",
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await safeReadText(response);
    throw new Error(errorText || "Translation request failed.");
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Translation response was empty.");
  }

  return content;
}

async function requestOllamaTranslation({ endpoint, userPrompt, model }: OllamaRequestPayload): Promise<string> {
  const response = await fetch(`${endpoint}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "You are a professional game localization assistant. Translate short UI strings accurately and concisely. Return JSON only.",
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await safeReadText(response);
    throw new Error(errorText || "Translation request failed.");
  }

  const data: OpenRouterResponse = await response.json();
  const messageContent = data.message?.content;
  let content = "";
  if (Array.isArray(messageContent)) {
    content = messageContent.map(chunkToText).join("").trim();
  } else if (typeof messageContent === "string") {
    content = messageContent;
  } else if (hasTextProperty(messageContent)) {
    content = messageContent.text;
  }

  if (!content) {
    throw new Error("Translation response was empty.");
  }

  return content;
}

function parseTranslationContent(content: string, provider: AIProvider): Record<string, unknown> {
  try {
    return JSON.parse(content);
  } catch (error) {
    console.error("Failed to parse translation JSON", { provider, content }, error);
    throw new Error("Translation response was not valid JSON.");
  }
}

function sanitizeTranslations(parsed: Record<string, unknown>, languages: string[]): Record<string, string> {
  const sanitized: Record<string, string> = {};
  languages.forEach((lang) => {
    const value = parsed[lang];
    if (typeof value === "string" && value.trim()) {
      sanitized[lang] = value.trim();
    }
  });

  return sanitized;
}

function buildTranslationPrompt(text: string, languages: string[], context?: string): string {
  const contextSection = context ? `Context: ${context}\n` : "";
  return [
    `Translate the following English string into the target language codes: ${languages.join(", ")}.`,
    "Return a JSON object shaped like { \"es\": \"...\", \"ja\": \"...\" }.",
    "Do not include explanatory text, only JSON.",
    contextSection,
    `Text: ${text}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function safeReadText(response: Response): Promise<string | undefined> {
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}

function sanitizeEndpointUrl(endpoint?: string): string {
  const normalized = endpoint?.trim() || DEFAULT_OLLAMA_ENDPOINT;
  return normalized.replace(/\/+$/, "");
}
