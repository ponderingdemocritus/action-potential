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
  type: 'tweet_request';
  content: string;
  replyTo?: string;
}

export interface DMRequest extends CoreEvent {
  type: 'dm_request';
  content: string;
  userId: string;
}

export interface TweetReceived extends ClientEvent {
  type: 'tweet_received';
  content: string;
  tweetId: string;
  userId: string;
  username: string;
}

export interface DMReceived extends ClientEvent {
  type: 'dm_received';
  content: string;
  userId: string;
  username: string;
}

// Discord specific events
export interface DiscordMessageRequest extends CoreEvent {
  type: 'discord_message';
  channelId: string;
  content: string;
}

export interface DiscordMessageReceived extends ClientEvent {
  type: 'discord_message_received';
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
export type IncomingEvent = TwitterIncomingEvent | DiscordIncomingEvent;