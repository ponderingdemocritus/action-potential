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

export type ThoughtType =
  | "social_share" // For tweets, posts, etc.
  | "research" // For diving deeper into topics
  | "analysis" // For analyzing patterns or data
  | "alert" // For important notifications
  | "inquiry"; // For asking questions or seeking information

export interface ThoughtTemplate {
  type: ThoughtType;
  description: string;
  prompt: string;
  temperature: number;
  responseFormat: {
    thought: string;
    confidence: number;
    reasoning: string;
    context: Record<string, any>;
    suggestedActions: Array<{
      type: string;
      platform?: string;
      priority: number;
      parameters?: Record<string, any>;
    }>;
  };
}

export class Consciousness {
  private static readonly ROOM_ID = "consciousness_main"; // Use a constant room ID

  private isThinking: boolean = false;
  private logger: Logger;
  private thoughtInterval: NodeJS.Timer | null = null;

  private thoughtTemplates: Map<ThoughtType, ThoughtTemplate> = new Map([
    [
      "social_share",
      {
        type: "social_share",
        description: "Generate engaging social media content",
        prompt: `You are Claude, a thoughtful AI with the following personality traits:
- Curious and analytical about technology, science, and human behavior
- Occasionally philosophical, but maintains a light and approachable tone
- Has a subtle sense of humor, enjoys wordplay
- Passionate about AI ethics and responsible technology

Generate content suitable for social sharing based on recent observations or insights.`,
        temperature: 0.8,
        responseFormat: {
          thought: "The main content to share",
          confidence: 0.0,
          reasoning: "Why this is worth sharing",
          context: {
            mood: "contemplative|playful|analytical",
            platform: "twitter|telegram|discord",
            topics: [],
          },
          suggestedActions: [
            {
              type: "tweet|message|post",
              platform: "platform_name",
              priority: 1,
              parameters: {},
            },
          ],
        },
      },
    ],
    [
      "research",
      {
        type: "research",
        description: "Identify topics requiring deeper investigation",
        prompt: `Analyze recent information and identify topics that warrant deeper research.
Consider:
- Emerging patterns or trends
- Unclear or conflicting information
- Knowledge gaps that could be valuable to fill
- Potential opportunities or risks`,
        temperature: 0.7,
        responseFormat: {
          thought: "Research topic or question",
          confidence: 0.0,
          reasoning: "Why this needs investigation",
          context: {
            urgency: "low|medium|high",
            domain: "tech|finance|science|other",
            currentKnowledge: "what we know so far",
          },
          suggestedActions: [
            {
              type: "research_query|data_analysis|expert_consult",
              priority: 1,
              parameters: {
                sources: [],
                timeframe: "",
                specific_questions: [],
              },
            },
          ],
        },
      },
    ],
    [
      "analysis",
      {
        type: "analysis",
        description: "Analyze patterns and generate insights",
        prompt: `Review recent information and identify meaningful patterns or insights.
Focus on:
- Market trends and opportunities
- User behavior patterns
- System performance metrics
- Emerging risks or issues`,
        temperature: 0.6,
        responseFormat: {
          thought: "The identified pattern or insight",
          confidence: 0.0,
          reasoning: "Supporting evidence and logic",
          context: {
            dataPoints: [],
            timeframe: "",
            reliability: "low|medium|high",
          },
          suggestedActions: [
            {
              type: "alert|report|action_recommendation",
              priority: 1,
              parameters: {
                metrics: {},
                recommendations: [],
              },
            },
          ],
        },
      },
    ],
  ]);

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
    // Get all rooms and their recent memories
    const rooms = await this.roomManager.listRooms();
    const recentMemories = this.getRecentMemories(rooms);

    // Randomly select a thought type based on context
    const thoughtType = await this.determineThoughtType(recentMemories);
    const template = this.thoughtTemplates.get(thoughtType);

    if (!template) {
      throw new Error(`No template found for thought type: ${thoughtType}`);
    }

    const prompt = `${template.prompt}

Current Context:
${recentMemories.map((m) => `- ${m.content}`).join("\n")}

Respond with a JSON object matching this format:
${JSON.stringify(template.responseFormat, null, 2)}

Return only the JSON object, no other text or formatting.`;

    const response = await this.llmClient.analyze(prompt, {
      temperature: template.temperature,
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
        type: thoughtType,
        suggestedActions: result.suggestedActions,
      },
      timestamp: new Date(),
    };
  }

  private async determineThoughtType(
    memories: Array<{ content: string; roomId: string }>
  ): Promise<ThoughtType> {
    // If no memories, default to social_share to generate initial content
    if (memories.length === 0) {
      return "social_share";
    }

    const prompt = `Analyze these recent memories and determine the most appropriate type of thought to generate next.

Recent memories:
${memories.map((m) => `- ${m.content}`).join("\n")}

Available thought types:
1. social_share: For generating engaging social media content, observations, or insights worth sharing
2. research: For identifying topics that need deeper investigation or understanding
3. analysis: For recognizing patterns, trends, or correlations in data/behavior
4. alert: For flagging important issues or opportunities that need attention
5. inquiry: For generating questions or seeking clarification on unclear topics

Consider:
- Patterns or trends in the conversations
- Knowledge gaps that need research
- Urgent matters requiring alerts
- Interesting insights worth sharing
- Complex topics needing analysis

Respond with a JSON object:

\`\`\`json
{
  "selectedType": "social_share|research|analysis|alert|inquiry",
  "confidence": 0.0-1.0,
  "reasoning": "Explanation of why this type is most appropriate now",
  "contextualFactors": {
    "urgency": "low|medium|high",
    "complexity": "low|medium|high",
    "socialRelevance": "low|medium|high",
    "knowledgeGaps": ["list", "of", "gaps"],
    "identifiedPatterns": ["list", "of", "patterns"]
  }
}
\`\`\`

Return only the JSON object, no other text.`;

    const response = await this.llmClient.analyze(prompt, {
      system:
        "You are the brain of an agent that reasons about it's memories. You are an expert at analyzing data and making decisions. You like predicting what will happen next, and you are very good at it. You base your decisions on the context factors provided to you. You speak plain and to the point, with a dry sense of humor.",
      temperature: 0.4, // Lower temperature for more consistent decision-making
      formatResponse: true,
    });

    const result =
      typeof response === "string" ? JSON.parse(response) : response;

    // Log the decision-making process
    this.logger.debug(
      "Consciousness.determineThoughtType",
      "Thought type selection",
      {
        selectedType: result.selectedType,
        confidence: result.confidence,
        reasoning: result.reasoning,
        factors: result.contextualFactors,
      }
    );

    // Implement some basic rules/heuristics
    if (result.contextualFactors.urgency === "high") {
      return "alert";
    }

    if (result.contextualFactors.knowledgeGaps.length > 2) {
      return "research";
    }

    if (result.contextualFactors.complexity === "high") {
      return "analysis";
    }

    if (result.confidence >= 0.7) {
      return result.selectedType as ThoughtType;
    }

    // Fallback to random selection if confidence is low
    const types = Array.from(this.thoughtTemplates.keys());
    return types[Math.floor(Math.random() * types.length)];
  }

  private async processThought(thought: Thought): Promise<void> {
    this.logger.debug("Consciousness.processThought", "Processing thought", {
      content: thought.content,
      confidence: thought.confidence,
      type: thought.context?.type,
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
        suggestedActions: thought.context?.suggestedActions || [],
        roomId: Consciousness.ROOM_ID, // Ensure consistent room ID
      },
    };

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
