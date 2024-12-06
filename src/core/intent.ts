import { LLMClient } from "./llm-client";
import { Logger, LogLevel } from "./logger";
import { type ProcessedIntent } from "./processor";

export interface Intent {
  type: string;
  confidence: number;
  parameters?: Record<string, any>;
}

export interface IntentExtractor {
  extract(content: string): Promise<Intent[]>;
  train(examples: Array<{ content: string; intents: Intent[] }>): Promise<void>;
}

export class LLMIntentExtractor implements IntentExtractor {
  private logger: Logger;

  constructor(
    private llmClient: LLMClient,
    logLevel: LogLevel = LogLevel.INFO
  ) {
    this.logger = new Logger({
      level: logLevel,
      enableColors: true,
      enableTimestamp: true,
    });
  }

  async extract(content: string): Promise<Intent[]> {
    this.logger.debug("LLMIntentExtractor.extract", "Extracting intents", {
      contentLength: content.length,
    });

    try {
      const prompt = `
        Analyze the following content and extract user intents. 
        Respond with a JSON array of intents, where each intent has:
        - type: string describing the intent
        - confidence: number between 0-1
        - parameters: optional object with relevant parameters

        Content: "${content}"

        Respond ONLY with the JSON array, no other text.
        Example format:
        [
          {
            "type": "greeting",
            "confidence": 0.95
          },
          {
            "type": "question",
            "confidence": 0.8,
            "parameters": {
              "topic": "weather",
              "location": "London"
            }
          }
        ]`;

      const response = await this.llmClient.complete(prompt);

      // Try to extract JSON from the response text
      const jsonMatch = response.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error("No JSON array found in response");
      }

      const intents = JSON.parse(jsonMatch[0]) as Intent[];

      // Validate the structure of each intent
      return intents.map((intent) => ({
        type: String(intent.type),
        confidence: Number(intent.confidence),
        parameters: intent.parameters || {},
      }));
    } catch (error) {
      this.logger.error(
        "LLMIntentExtractor.extract",
        "Failed to extract intents",
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );

      // Return a fallback intent when parsing fails
      return [
        {
          type: "unknown",
          confidence: 0.1,
          parameters: {
            originalContent: content,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        },
      ];
    }
  }

  async train(
    examples: Array<{ content: string; intents: Intent[] }>
  ): Promise<void> {
    this.logger.info("LLMIntentExtractor.train", "Training intent extractor", {
      exampleCount: examples.length,
    });

    const prompt = `
You are being trained to identify intents in messages. Study these examples:

${examples
  .map(
    (ex) => `
Message: "${ex.content}"
Intents: ${JSON.stringify(ex.intents, null, 2)}
`
  )
  .join("\n")}

Analyze the patterns and update your understanding accordingly.
`;

    try {
      this.logger.debug("LLMIntentExtractor.train", "Sending training prompt");
      await this.llmClient.analyze(prompt, {
        role: "intent analysis trainer",
        temperature: 0.2,
        formatResponse: true,
      });
      this.logger.info(
        "LLMIntentExtractor.train",
        "Training completed successfully"
      );
    } catch (error) {
      this.logger.error(
        "LLMIntentExtractor.train",
        "Failed to train intent extractor",
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }
}
