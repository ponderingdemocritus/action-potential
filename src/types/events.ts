// Base event type
export interface BaseEvent {
  type: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  content: string;
}

// Core -> Client events
export interface CoreEvent extends BaseEvent {
  target: string; // client id
}

// Client -> Core events
export interface ClientEvent extends BaseEvent {
  source: string; // client id
}

// Twitter specific events
export interface TweetRequest extends CoreEvent {
  type: "tweet_request";
  content: string;
  metadata?: {
    inReplyTo?: string;
    conversationId?: string;
    context?: {
      sentiment?: string;
      topics?: string[];
      threadContext?: string[];
    };
  };
}

export interface DMRequest extends CoreEvent {
  type: "dm_request";
  content: string;
  userId: string;
}

export interface TweetReceived extends ClientEvent {
  type: "tweet_received";
  content: string;
  tweetId: string;
  userId: string;
  username: string;
  timestamp: Date;
  metadata?: {
    isReply?: boolean;
    isRetweet?: boolean;
    hasMedia?: boolean;
    url?: string;
    threadContext?: string[];
    conversationId?: string;
    inReplyToId?: string;
    metrics?: {
      likes?: number;
      retweets?: number;
      replies?: number;
    };
  };
}

export interface DMReceived extends ClientEvent {
  type: "dm_received";
  content: string;
  userId: string;
  username: string;
}

// Discord specific events
export interface DiscordMessageRequest extends CoreEvent {
  type: "discord_message";
  channelId: string;
  content: string;
}

export interface DiscordMessageReceived extends ClientEvent {
  type: "discord_message_received";
  channelId: string;
  content: string;
  username: string;
}

// Union types for easier handling
export type TwitterOutgoingEvent = TweetRequest | DMRequest;
export type TwitterIncomingEvent = TweetReceived | DMReceived;
export type DiscordOutgoingEvent = DiscordMessageRequest;
export type DiscordIncomingEvent = DiscordMessageReceived;

// Combined types
export type OutgoingEvent = TwitterOutgoingEvent | DiscordOutgoingEvent;
export type IncomingEvent =
  | TwitterIncomingEvent
  | DiscordIncomingEvent
  | InternalThought;

export interface InternalThought extends ClientEvent {
  type: "internal_thought";
  content: string;
}
