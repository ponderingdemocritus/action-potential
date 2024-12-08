export interface ActionDefinition {
  type: string;
  description: string;
  targetPlatforms: string[];
  eventType: string;
  clientType: string;
  parameters: Record<
    string,
    {
      type: string;
      description: string;
      required: boolean;
      example?: any;
    }
  >;
  examples: Array<{
    description: string;
    action: Record<string, any>;
  }>;
}

export interface ActionRegistry {
  getAvailableActions(): Map<string, ActionDefinition>;
  getActionDefinition(type: string): ActionDefinition | undefined;
  registerAction(action: ActionDefinition): void;
}

export class CoreActionRegistry implements ActionRegistry {
  private actions: Map<string, ActionDefinition> = new Map([
    [
      "tweet",
      {
        type: "tweet",
        description: "Post a new tweet to Twitter",
        targetPlatforms: ["twitter"],
        eventType: "tweet_request",
        clientType: "twitter",
        parameters: {
          content: {
            type: "string",
            description: "The tweet content",
            required: true,
            example: "Just discovered an amazing feature in Eternum! 🎮",
          },
          inReplyTo: {
            type: "string",
            description: "Tweet ID to reply to",
            required: false,
            example: "1234567890",
          },
          conversationId: {
            type: "string",
            description: "ID of the conversation thread",
            required: false,
            example: "conv_123",
          },
          context: {
            type: "object",
            description: "Additional context about the tweet",
            required: false,
            example: {},
          },
        },
        examples: [
          {
            description: "Posting a tweet",
            action: {
              type: "tweet_request",
              target: "twitter",
              content: "New quest system released in Eternum! 🏰✨",
              parameters: {},
            },
          },
        ],
      },
    ],
    [
      "tweet_thought",
      {
        type: "tweet_thought",
        description: "Convert an internal thought into a tweet",
        targetPlatforms: ["twitter"],
        eventType: "tweet_request",
        clientType: "twitter",
        parameters: {
          content: {
            type: "string",
            description: "The tweet content",
            required: true,
            example: "Deep thoughts about AI...",
          },
          inReplyTo: {
            type: "string",
            description: "Tweet ID to reply to",
            required: false,
            example: "1234567890",
          },
          conversationId: {
            type: "string",
            description: "ID of the conversation thread",
            required: false,
            example: "conv_123",
          },
          context: {
            type: "object",
            description: "Additional context about the thought",
            required: false,
            example: { mood: "contemplative", topics: ["AI"] },
          },
        },
        examples: [
          {
            description: "Converting a thought into a tweet",
            action: {
              type: "tweet_request",
              target: "twitter",
              content:
                "Ever notice how neural networks learn patterns like children? 🧠",
              parameters: {
                mood: "contemplative",
                topics: ["AI", "learning"],
              },
            },
          },
        ],
      },
    ],
    [
      "tweet_reply",
      {
        type: "tweet_reply",
        description: "Reply to a tweet in the conversation",
        targetPlatforms: ["twitter"],
        eventType: "tweet_request",
        clientType: "twitter",
        parameters: {
          content: {
            type: "string",
            description: "The reply content",
            required: true,
            example: "Thanks for your thoughts!",
          },
          inReplyTo: {
            type: "string",
            description: "Tweet ID to reply to",
            required: true,
            example: "1234567890",
          },
          conversationId: {
            type: "string",
            description: "ID of the conversation thread",
            required: true,
            example: "conv_123",
          },
          context: {
            type: "object",
            description: "Additional context about the reply",
            required: false,
            example: {
              sentiment: "positive",
              topics: ["AI", "technology"],
            },
          },
        },
        examples: [
          {
            description: "Replying to a tweet",
            action: {
              type: "tweet_request",
              target: "twitter",
              content: "Interesting perspective on AI consciousness!",
              parameters: {
                inReplyTo: "1234567890",
                conversationId: "conv_123",
                context: {
                  sentiment: "thoughtful",
                  topics: ["AI", "consciousness"],
                },
              },
            },
          },
        ],
      },
    ],
  ]);

  getAvailableActions(): Map<string, ActionDefinition> {
    return this.actions;
  }

  getActionDefinition(type: string): ActionDefinition | undefined {
    return this.actions.get(type);
  }

  registerAction(action: ActionDefinition): void {
    this.actions.set(action.type, action);
  }
}
