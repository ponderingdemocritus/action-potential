import { LLMClient } from "./llm-client";
import { type ClientEvent, type CoreEvent } from "../types/events";
import { type ActionRegistry } from "./actions";
import { type IntentExtractor } from "./intent";
import { Logger, LogLevel } from "./logger";
import { type Room } from "./room";
import { type VectorDB } from "./vectorDb";

export interface ProcessedIntent {
  type: string;
  confidence: number;
  action?: string;
  parameters?: Record<string, any>;
}

export interface EnrichedContext {
  similarMessages: any[];
  memories: any[];
  clientVariables: Record<string, any>;
  metadata: Record<string, any>;
}

export interface ProcessingResult {
  intents: ProcessedIntent[];
  suggestedActions: CoreEvent[];
  enrichedContext: EnrichedContext;
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

    // Regular event processing
    const intents = await this.extractIntents(event);
    this.logger.trace("EventProcessor.process", "Extracted intents", {
      intents,
    });

    const context = await this.enrichContext(event, intents, room);
    this.logger.trace("EventProcessor.process", "Enriched context", {
      memories: context.memories.length,
      similarMessages: context.similarMessages.length,
    });

    const actions = await this.determineActions(event, intents, context);
    this.logger.debug("EventProcessor.process", "Determined actions", {
      actionCount: actions.length,
    });

    return {
      intents,
      suggestedActions: actions,
      enrichedContext: context,
    };
  }

  private async extractIntents(event: ClientEvent): Promise<ProcessedIntent[]> {
    this.logger.trace("EventProcessor.extractIntents", "Extracting intents", {
      content: event.content,
    });

    try {
      const intents = await this.intentExtractor.extract(event.content);
      this.logger.debug("EventProcessor.extractIntents", "Intents extracted", {
        count: intents.length,
      });
      return intents;
    } catch (error) {
      this.logger.error(
        "EventProcessor.extractIntents",
        "Failed to extract intents",
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
      return [];
    }
  }

  private async enrichContext(
    event: ClientEvent,
    intents: ProcessedIntent[],
    room: Room
  ): Promise<EnrichedContext> {
    this.logger.trace("EventProcessor.enrichContext", "Enriching context");

    try {
      // Include room memories in context
      const memories = room.getMemories(5); // Get last 5 memories
      const similarMessages = await this.vectorDb.findSimilar(event.content);

      // Get client-specific variables and templates
      const clientVariables = await this.getClientVariables(event.source);

      this.logger.debug("EventProcessor.enrichContext", "Context enriched", {
        memoriesCount: memories.length,
        similarMessagesCount: similarMessages.length,
      });

      return {
        similarMessages,
        memories,
        clientVariables,
        metadata: {
          timestamp: event.timestamp,
          source: event.source,
          roomId: room.id,
          platform: room.platform,
          intents: intents.map((i) => i.type),
        },
      };
    } catch (error) {
      this.logger.error(
        "EventProcessor.enrichContext",
        "Failed to enrich context",
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
      throw error;
    }
  }

  private async determineActions(
    event: ClientEvent,
    intents: ProcessedIntent[],
    context: EnrichedContext
  ): Promise<CoreEvent[]> {
    this.logger.trace("EventProcessor.determineActions", "Determining actions");

    try {
      // Prepare prompt with all available context
      const prompt = this.buildPrompt(event, intents, context);

      // Get LLM response with structured analysis
      const response = await this.llmClient.analyze(prompt, {
        role: "AI agent assistant",
        temperature: 0.3,
        maxTokens: 1000,
        formatResponse: true,
      });

      // Parse LLM response into concrete actions
      const actions = this.parseActionsFromLLM(response);

      this.logger.debug(
        "EventProcessor.determineActions",
        "Actions determined",
        {
          actionCount: actions.length,
        }
      );

      return actions;
    } catch (error) {
      this.logger.error(
        "EventProcessor.determineActions",
        "Failed to determine actions",
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
      return [];
    }
  }

  private async getClientVariables(
    clientId: string
  ): Promise<Record<string, any>> {
    // Fetch client-specific variables, templates, etc.
    return {};
  }

  private buildPrompt(
    event: ClientEvent,
    intents: ProcessedIntent[],
    context: EnrichedContext
  ): string {
    this.logger.trace("EventProcessor.buildPrompt", "Building LLM prompt");

    // Get available actions and format them for the prompt
    const availableActions = Array.from(
      this.actionRegistry.getAvailableActions().values()
    ).map((action) => ({
      type: action.type,
      description: action.description,
      platforms: action.targetPlatforms,
      example: action.examples[0].action,
    }));

    return `You are an AI agent assistant responsible for determining appropriate actions based on events and context.

Current Event Context:
- Type: ${event.type}
- Source: ${event.source}
- Platform: ${context.metadata.platform}
- Room: ${context.metadata.roomId}

Available Actions:
${availableActions
  .map(
    (action) => `
- ${action.type}: ${action.description}
  Platforms: ${action.platforms.join(", ")}
  Example: ${JSON.stringify(action.example, null, 2)}
`
  )
  .join("\n")}

Recent Memory Context:
${context.memories.map((m) => `- ${m.content}`).join("\n")}

Similar Past Messages:
${context.similarMessages.map((m) => `- ${m.content}`).join("\n")}

Detected Intents:
${intents.map((i) => `- ${i.type} (confidence: ${i.confidence})`).join("\n")}

Current Message Content:
${event.content}

Determine what actions should be taken in response to this event. Consider:
1. The context and history of the conversation
2. The detected intents and their confidence levels
3. The available actions and their platform requirements
4. The potential impact of each action

Choose from the available action types listed above.

Provide your response as a structured analysis with the following format:


Respond with a JSON object in the following format:

\`\`\`json
{
  "reasoning": "Explain your thought process...",
  "confidenceLevel": 0.0-1.0,
  "actions": [
    {
      "type": "action_type",
      "target": "client_id",
      "content": "message content",
      "parameters": {},
      "justification": "Why this action is appropriate..."
    }
  ],
  "caveats": [
    "List any important considerations or limitations..."
  ]
}
\`\`\`
`;
  }

  private parseActionsFromLLM(
    response: string | Record<string, any>
  ): CoreEvent[] {
    this.logger.trace(
      "EventProcessor.parseActionsFromLLM",
      "Parsing LLM response"
    );

    try {
      let analysis: Record<string, any>;

      if (typeof response === "string") {
        try {
          // Try to clean the response string before parsing
          const cleanedResponse = response
            .replace(/\n/g, " ") // Remove newlines
            .replace(/\r/g, "") // Remove carriage returns
            .replace(/\t/g, " ") // Remove tabs
            .replace(/\\"/g, '"') // Handle escaped quotes
            .replace(/"{2,}/g, '"'); // Remove multiple quotes

          analysis = JSON.parse(cleanedResponse);
        } catch (parseError) {
          this.logger.warn(
            "EventProcessor.parseActionsFromLLM",
            "Initial parse failed, attempting cleanup",
            {
              error:
                parseError instanceof Error
                  ? parseError.message
                  : String(parseError),
            }
          );

          // If that fails, try to extract just the JSON part
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error("Could not find valid JSON in response");
          }
          analysis = JSON.parse(jsonMatch[0]);
        }
      } else {
        analysis = response;
      }

      this.logger.debug(
        "EventProcessor.parseActionsFromLLM",
        "Analysis received",
        {
          confidence: analysis.confidenceLevel,
          actionCount: analysis.actions?.length || 0,
          reasoning: analysis.reasoning?.substring(0, 100) + "...",
        }
      );

      if (!analysis.actions || !Array.isArray(analysis.actions)) {
        throw new Error(
          "Invalid response format: missing or invalid actions array"
        );
      }

      // Validate each action before transforming
      analysis.actions.forEach((action, index) => {
        if (!action.type || !action.target || !action.content) {
          throw new Error(
            `Invalid action at index ${index}: missing required fields`
          );
        }
      });

      // Transform the analyzed actions into CoreEvents
      const coreEvents = analysis.actions.map((action) => {
        const actionDef = this.actionRegistry.getActionDefinition(action.type);
        if (!actionDef) {
          throw new Error(`Unknown action type: ${action.type}`);
        }

        return {
          type: actionDef.eventType, // Use the eventType from definition
          target: action.target,
          content: action.content,
          timestamp: new Date(),
          metadata: {
            ...action.parameters,
            confidence: analysis.confidenceLevel,
            reasoning: analysis.reasoning,
            justification: action.justification,
            caveats: analysis.caveats,
            actionType: action.type, // Store original action type in metadata
          },
        };
      });

      this.logger.debug(
        "EventProcessor.parseActionsFromLLM",
        "Parsed actions",
        {
          count: coreEvents.length,
          types: coreEvents.map((e) => e.type),
        }
      );

      return coreEvents;
    } catch (error) {
      this.logger.error(
        "EventProcessor.parseActionsFromLLM",
        "Failed to parse LLM response",
        {
          error: error instanceof Error ? error.message : String(error),
          response:
            typeof response === "string"
              ? response.substring(0, 200) + "..."
              : JSON.stringify(response).substring(0, 200) + "...",
        }
      );
      return [];
    }
  }
}
