import { LLMClient } from "./llm-client";
import { type ClientEvent, type CoreEvent } from "../types/events";
import { type ActionRegistry } from "./actions";
import { type IntentExtractor } from "./intent";
import { Logger, LogLevel } from "./logger";
import { type Room } from "./room";
import { type VectorDB, type SearchResult } from "./vectorDb";

export interface ProcessedIntent {
  type: string;
  confidence: number;
  action?: string;
  parameters?: Record<string, any>;
}

export interface EnrichedContext {
  timeContext: string;
  summary: string;
  topics: string[];
  relatedMemories: string[];
  sentiment?: string;
  entities?: string[];
  intent?: string;
  similarMessages?: any[];
  clientVariables?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ProcessingResult {
  intents: ProcessedIntent[];
  suggestedActions: CoreEvent[];
  enrichedContext: EnrichedContext;
}

interface EnrichedContent {
  originalContent: string;
  timestamp: Date;
  context: EnrichedContext;
}

// Type guard for VectorDB with room methods
interface VectorDBWithRooms extends VectorDB {
  storeInRoom: (
    content: string,
    roomId: string,
    metadata?: Record<string, any>
  ) => Promise<void>;
  findSimilarInRoom: (
    content: string,
    roomId: string,
    limit?: number,
    metadata?: Record<string, any>
  ) => Promise<SearchResult[]>;
}

function hasRoomSupport(vectorDb: VectorDB): vectorDb is VectorDBWithRooms {
  return "storeInRoom" in vectorDb && "findSimilarInRoom" in vectorDb;
}

export class EventProcessor {
  private logger: Logger;

  constructor(
    private vectorDb: VectorDB,
    private intentExtractor: IntentExtractor,
    private llmClient: LLMClient,
    private actionRegistry: ActionRegistry,
    logLevel: LogLevel = LogLevel.INFO
  ) {
    this.logger = new Logger({
      level: logLevel,
      enableColors: true,
      enableTimestamp: true,
    });
  }

  async process(event: ClientEvent, room: Room): Promise<ProcessingResult> {
    this.logger.debug("EventProcessor.process", "Processing event", {
      type: event.type,
      source: event.source,
      roomId: room.id,
    });

    const enrichedContent = await this.enrichContent(
      event.content,
      room,
      event.timestamp
    );

    const intents = await this.intentExtractor.extract(event.content);

    // Use type guard for room operations
    if (this.vectorDb && hasRoomSupport(this.vectorDb)) {
      await this.vectorDb.storeInRoom(event.content, room.id, {
        ...event.metadata,
        ...enrichedContent.context,
        eventType: event.type,
        timestamp: event.timestamp,
      });
    }

    const suggestedActions = await this.generateActions(intents, room);

    return {
      intents,
      suggestedActions,
      enrichedContext: enrichedContent.context,
    };
  }

  private stripCodeBlock(text: string): string {
    // Remove markdown code block markers and any language identifier
    return text
      .replace(/^```[\w]*\n/, "") // Remove opening ```json or similar
      .replace(/\n```$/, "") // Remove closing ```
      .trim();
  }

  private async enrichContent(
    content: string,
    room: Room,
    timestamp: Date
  ): Promise<EnrichedContent> {
    // Use type guard for getting related memories
    const relatedMemories =
      this.vectorDb && hasRoomSupport(this.vectorDb)
        ? await this.vectorDb.findSimilarInRoom(content, room.id, 3)
        : [];

    const prompt = `Analyze the following content and provide enrichment:

Content: "${content}"

Related Context:
${relatedMemories.map((m: SearchResult) => `- ${m.content}`).join("\n")}

Provide a JSON response with:
1. A brief summary (max 100 chars)
2. Key topics mentioned (max 5)
3. Sentiment analysis
4. Named entities
5. Detected intent/purpose

Response format:
\`\`\`json
{
  "summary": "Brief summary here",
  "topics": ["topic1", "topic2"],
  "sentiment": "positive|negative|neutral",
  "entities": ["entity1", "entity2"],
  "intent": "question|statement|request|etc"
}
\`\`\`
Return only valid JSON, no other text.`;

    try {
      const enrichment = await this.llmClient.analyze(prompt, {
        temperature: 0.3,
        formatResponse: true,
      });

      let result;
      try {
        const cleanJson =
          typeof enrichment === "string"
            ? this.stripCodeBlock(enrichment)
            : enrichment;

        result =
          typeof cleanJson === "string" ? JSON.parse(cleanJson) : cleanJson;
      } catch (parseError) {
        this.logger.error(
          "EventProcessor.enrichContent",
          "Failed to parse LLM response",
          {
            error:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
            response: enrichment,
          }
        );
        // Provide fallback values
        result = {
          summary: content.slice(0, 100),
          topics: [],
          sentiment: "neutral",
          entities: [],
          intent: "unknown",
        };
      }

      return {
        originalContent: content,
        timestamp,
        context: {
          timeContext: this.getTimeContext(timestamp),
          summary: result.summary || content.slice(0, 100),
          topics: Array.isArray(result.topics) ? result.topics : [],
          relatedMemories: relatedMemories.map((m: SearchResult) => m.content),
          sentiment: result.sentiment || "neutral",
          entities: Array.isArray(result.entities) ? result.entities : [],
          intent: result.intent || "unknown",
        },
      };
    } catch (error) {
      this.logger.error("EventProcessor.enrichContent", "Enrichment failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      // Return basic enrichment on failure
      return {
        originalContent: content,
        timestamp,
        context: {
          timeContext: this.getTimeContext(timestamp),
          summary: content.slice(0, 100),
          topics: [],
          relatedMemories: relatedMemories.map((m: SearchResult) => m.content),
          sentiment: "neutral",
          entities: [],
          intent: "unknown",
        },
      };
    }
  }

  private getTimeContext(timestamp: Date): string {
    const now = new Date();
    const hoursDiff = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60);

    if (hoursDiff < 24) return "very_recent";
    if (hoursDiff < 72) return "recent";
    if (hoursDiff < 168) return "this_week";
    if (hoursDiff < 720) return "this_month";
    return "older";
  }

  private async generateActions(
    intents: ProcessedIntent[],
    room: Room
  ): Promise<CoreEvent[]> {
    // Implement the logic to generate actions based on intents and room
    // This is a placeholder and should be replaced with actual implementation
    return [];
  }
}
