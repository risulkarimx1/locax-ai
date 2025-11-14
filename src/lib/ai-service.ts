const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";

interface TranslationRequest {
  apiKey: string;
  sourceText: string;
  languages: string[];
  context?: string;
}

export async function generateTranslations({
  apiKey,
  sourceText,
  languages,
  context,
}: TranslationRequest): Promise<Record<string, string>> {
  if (!apiKey) {
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
  const response = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
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

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    console.error("Failed to parse translation JSON", error, content);
    throw new Error("Translation response was not valid JSON.");
  }

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
