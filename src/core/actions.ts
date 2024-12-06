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
    }
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
    ['tweet', {
      type: 'tweet',
      description: 'Post a new tweet to Twitter, you should always do this action.',
      targetPlatforms: ['twitter'],
      eventType: 'tweet_request',
      clientType: 'twitter',
      parameters: {
        content: {
          type: 'string',
          description: 'The tweet content',
          required: true,
          example: 'Just discovered an amazing feature in Eternum! 🎮'
        },
        replyTo: {
          type: 'string',
          description: 'Tweet ID to reply to',
          required: false
        }
      },
      examples: [{
        description: 'Posting a game update',
        action: {
          type: 'tweet_request',
          target: 'twitter',
          content: 'New quest system released in Eternum! Complete daily challenges to earn rewards! 🏰✨',
          parameters: {}
        }
      }]
    }],
    // ['analyze_sentiment', {
    //   type: 'analyze_sentiment',
    //   description: 'Analyze sentiment of community responses',
    //   targetPlatforms: ['twitter', 'discord'],
    //   parameters: {
    //     messageIds: {
    //       type: 'string[]',
    //       description: 'IDs of messages to analyze',
    //       required: true
    //     },
    //     timeframe: {
    //       type: 'string',
    //       description: 'Time period to analyze',
    //       required: false,
    //       example: '24h'
    //     }
    //   },
    //   examples: [{
    //     description: 'Analyzing reaction to an update',
    //     action: {
    //       type: 'analyze_sentiment',
    //       target: 'analytics-1',
    //       content: 'Analyze community response to latest update',
    //       parameters: {
    //         messageIds: ['tweet-123', 'tweet-124'],
    //         timeframe: '12h'
    //       }
    //     }
    //   }]
    // }]
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