export interface ActionDefinition {
  type: string;
  description: string;
  targetPlatforms: string[];
  eventType: string;
  clientType: string;
  parameters: {
    [key: string]: {
      type: string;
      description: string;
      required: boolean;
      example?: any;
    };
  };
  examples: {
    description: string;
    action: Record<string, any>;
  }[];
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
        description:
          "Post a new tweet to Twitter, you should always do this action.",
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
          replyTo: {
            type: "string",
            description: "Tweet ID to reply to",
            required: false,
            example: "1234567890",
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
            description: "Posting a game update",
            action: {
              type: "tweet_request",
              target: "twitter",
              content:
                "New quest system released in Eternum! Complete daily challenges to earn rewards! 🏰✨",
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
          context: {
            type: "object",
            description: "Additional context about the thought",
            required: false,
            example: { mood: "contemplative", topics: ["AI"] },
          },
          replyTo: {
            type: "string",
            description: "Tweet ID to reply to",
            required: false,
            example: "1234567890",
          },
        },
        examples: [
          {
            description: "Converting a philosophical thought into a tweet",
            action: {
              type: "tweet_request",
              target: "twitter",
              content:
                "Ever notice how neural networks learn patterns like children? First simple shapes, then complex concepts. Nature repeats its learning algorithms across scales. 🧠 #AI #Learning",
              parameters: {
                mood: "contemplative",
                topics: ["AI", "learning", "patterns"],
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
