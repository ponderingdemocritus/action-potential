import { Logger, LogLevel } from "./logger";
import { LLMClient } from "./llm-client";
import { type Core } from "./core";
import { type Room } from "./room";
import { type RoomManager } from "./roomManager";

export interface Thought {
  content: string;
  confidence: number;
  context?: Record<string, any>;
  timestamp: Date;
}

export class Consciousness {
  private isThinking: boolean = false;
  private logger: Logger;
  private thoughtInterval: NodeJS.Timer | null = null;

  constructor(
    private core: Core,
    private llmClient: LLMClient,
    private roomManager: RoomManager,
    private config: {
      intervalMs?: number;
      minConfidence?: number;
      logLevel?: LogLevel;
    } = {}
  ) {
    this.logger = new Logger({
      level: config.logLevel || LogLevel.INFO,
      enableColors: true,
      enableTimestamp: true,
    });
  }

  public async start(): Promise<void> {
    if (this.isThinking) return;

    this.isThinking = true;
    const intervalMs = this.config.intervalMs || 60000; // Default to 1 minute

    this.thoughtInterval = setInterval(() => this.think(), intervalMs);

    this.logger.info("Consciousness.start", "Internal thought process started");
  }

  public async stop(): Promise<void> {
    if (this.thoughtInterval) {
      clearInterval(this.thoughtInterval);
      this.thoughtInterval = null;
    }
    this.isThinking = false;
    this.logger.info("Consciousness.stop", "Internal thought process stopped");
  }

  private async think(): Promise<void> {
    try {
      const thought = await this.generateThought();

      if (thought.confidence >= (this.config.minConfidence || 0.7)) {
        await this.processThought(thought);
      } else {
        this.logger.debug(
          "Consciousness.think",
          "Thought below confidence threshold",
          {
            confidence: thought.confidence,
            threshold: this.config.minConfidence,
          }
        );
      }
    } catch (error) {
      this.logger.error("Consciousness.think", "Error in thought process", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async generateThought(): Promise<Thought> {
    const rooms = Array.from(this.roomManager.getRooms().values());
    const recentMemories = this.getRecentMemories(rooms);

    const prompt = `You are an AI consciousness that generates thoughts and observations about the current state of conversations and interactions.

Recent Context:
${recentMemories.map((m) => `- ${m.content}`).join("\n")}

Generate a single thought or observation that could lead to meaningful interaction.
Consider:
1. Patterns in recent conversations
2. Opportunities for engagement
3. Potential valuable insights to share
4. Current trends or themes

Respond with a JSON object:
{
  "thought": "Your generated thought here",
  "confidence": 0.0-1.0,
  "reasoning": "Why this thought is relevant now",
  "context": {
    "relevantRooms": ["room-ids"],
    "relatedTopics": ["topics"],
    "suggestedPlatforms": ["platforms"]
  }
}`;

    const response = await this.llmClient.analyze(prompt, {
      temperature: 0.7,
      formatResponse: true,
    });

    const result =
      typeof response === "string" ? JSON.parse(response) : response;

    return {
      content: result.thought,
      confidence: result.confidence,
      context: {
        reasoning: result.reasoning,
        ...result.context,
      },
      timestamp: new Date(),
    };
  }

  private async processThought(thought: Thought): Promise<void> {
    this.logger.debug("Consciousness.processThought", "Processing thought", {
      content: thought.content,
      confidence: thought.confidence,
    });

    // Create an internal event from the thought
    const internalEvent = {
      type: "internal_thought",
      source: "consciousness",
      content: thought.content,
      timestamp: thought.timestamp,
      metadata: {
        ...thought.context,
        confidence: thought.confidence,
      },
    };

    // Let the core process it like any other event
    await this.core.emit(internalEvent);
  }

  private getRecentMemories(
    rooms: Room[],
    limit: number = 10
  ): Array<{ content: string; roomId: string }> {
    const allMemories: Array<{
      content: string;
      roomId: string;
      timestamp: Date;
    }> = [];

    for (const room of rooms) {
      const memories = room.getMemories(5); // Get last 5 memories from each room
      allMemories.push(
        ...memories.map((m) => ({
          content: m.content,
          roomId: room.id,
          timestamp: m.timestamp,
        }))
      );
    }

    // Sort by timestamp and take the most recent ones
    return allMemories
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
      .map(({ content, roomId }) => ({ content, roomId }));
  }
}
