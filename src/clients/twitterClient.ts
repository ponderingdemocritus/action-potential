import { Scraper, SearchMode, type Tweet } from "agent-twitter-client";
import { type Core } from "../core/core";
import {
  type CoreEvent,
  type DMRequest,
  type TweetReceived,
  type TweetRequest,
  type TwitterOutgoingEvent,
} from "../types/events";
import { BaseClient } from "./baseClient";

interface TwitterCredentials {
  username: string;
  password: string;
  email: string;
}

export class TwitterClient extends BaseClient {
  private scraper: Scraper;
  private isInitialized: boolean = false;
  private monitorInterval: NodeJS.Timer | null = null;
  private lastCheckedTweetId: bigint | null = null;

  constructor(id: string, private credentials: TwitterCredentials, core: Core) {
    super(id, "twitter", core);
    this.scraper = new Scraper();
  }

  private async initialize() {
    if (!this.isInitialized) {
      try {
        await this.scraper.login(
          this.credentials.username,
          this.credentials.password,
          this.credentials.email
        );
        this.isInitialized = true;
        this.log("Twitter client initialized successfully");
      } catch (error) {
        this.log("Failed to initialize Twitter client", error);
        throw error;
      }
    }
  }

  public async emit(event: CoreEvent): Promise<void> {
    if (this.isTwitterOutgoingEvent(event)) {
      await this.handleTwitterEvent(event);
    }
  }

  private isTwitterOutgoingEvent(
    event: CoreEvent
  ): event is TwitterOutgoingEvent {
    return ["tweet_request", "dm_request"].includes(event.type);
  }

  private async handleTwitterEvent(event: TwitterOutgoingEvent) {
    await this.initialize();

    switch (event.type) {
      case "tweet_request":
        await this.sendTweet(event);
        break;
      case "dm_request":
        await this.sendDM(event);
        break;
    }
  }

  private async sendTweet(event: TweetRequest) {
    if (event.metadata?.inReplyTo) {
      this.log("Would send reply tweet", {
        content: event.content,
        inReplyTo: event.metadata.inReplyTo,
        conversationId: event.metadata.conversationId,
      });
    } else {
      this.log("Would send new tweet", {
        content: event.content,
      });
    }
  }

  private async sendDM(event: DMRequest) {
    this.log("Sending DM", { userId: event.userId, content: event.content });
    // TODO: Implement actual DM sending using scraper
  }

  async listen(): Promise<void> {
    if (this.isListening) return;

    await this.initialize();
    await this.loadLastCheckedId();
    this.isListening = true;

    try {
      // Set up single monitoring interval
      this.monitorInterval = setInterval(() => this.checkForUpdates(), 10000);
      this.log("Twitter stream monitoring started");
    } catch (error) {
      this.log("Failed to setup Twitter stream", error);
      this.isListening = false;
      throw error;
    }
  }

  private async checkForUpdates() {
    try {
      // Check mentions first
      await this.checkMentions();

      // Then check timeline
      const tweets = await this.fetchLatestTweets();
      for (const tweet of tweets) {
        await this.processTweet(tweet);
      }
    } catch (error) {
      this.log("Error in Twitter monitoring", error);
    }
  }

  private async fetchLatestTweets(): Promise<Tweet[]> {
    const tweets: Tweet[] = [];
    try {
      // You might want to track the last tweet ID to only fetch new ones
      for await (const tweet of this.scraper.getTweets("naval", 10)) {
        tweets.push(tweet);
      }
    } catch (error) {
      this.log("Error fetching tweets", error);
    }
    return tweets;
  }

  private async processTweet(tweet: Tweet) {
    try {
      const tweetEvent: TweetReceived = {
        type: "tweet_received",
        source: this.id,
        content: this.formatTweetContent(tweet),
        tweetId: tweet.id ?? "",
        userId: tweet.userId ?? "",
        username: tweet.username ?? "",
        timestamp: new Date(tweet.timestamp ?? ""),
        metadata: {
          metrics: {
            likes: tweet.likes,
            retweets: tweet.retweets,
            replies: tweet.replies,
          },
          isRetweet: tweet.isRetweet,
          isReply: tweet.isReply,
          hasMedia: tweet.photos.length > 0 || tweet.videos.length > 0,
          url: tweet.permanentUrl,
          conversationId: tweet.conversationId,
          inReplyToId: tweet.inReplyToStatusId,
        },
      };

      await this.core.emit(tweetEvent);
    } catch (error) {
      this.log("Error processing tweet", error);
    }
  }

  private formatTweetContent(tweet: Tweet): string {
    return `
      Author: @${tweet.username}
      Content: ${tweet.text}
      ${tweet.quotedStatus ? `Quoted Tweet: ${tweet.quotedStatus.text}` : ""}
      Time: ${tweet.timestamp}
      Engagement: ${tweet.likes} likes, ${tweet.retweets} RTs
    `.trim();
  }

  async stop(): Promise<void> {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    if (this.scraper) {
      try {
        // await this.scraper.close();
      } catch (error) {
        this.log("Error closing Twitter scraper", error);
      }
    }

    this.isInitialized = false;
    await super.stop();
  }

  private async checkMentions() {
    try {
      this.log("Checking for new mentions", {
        username: this.credentials.username,
      });

      const mentions = (
        await this.scraper.fetchSearchTweets(
          `@${this.credentials.username}`,
          20,
          SearchMode.Latest
        )
      ).tweets;

      // Convert AsyncGenerator to array and de-duplicate
      const mentionsArray: Tweet[] = [];
      for await (const tweet of mentions) {
        mentionsArray.push(tweet);
      }

      // De-duplicate and sort mentions
      const uniqueMentions = [...new Set(mentionsArray)]
        .sort((a: Tweet, b: Tweet) => a.id?.localeCompare(b.id ?? "") ?? 0)
        .filter((tweet: Tweet) => tweet.userId !== this.credentials.username);

      for (const tweet of uniqueMentions) {
        if (
          !this.lastCheckedTweetId ||
          BigInt(tweet.id ?? "") > this.lastCheckedTweetId
        ) {
          await this.handleMention(tweet);
          this.lastCheckedTweetId = BigInt(tweet.id ?? "");
          await this.saveLastCheckedId(); // Save checkpoint after processing
        }
      }
    } catch (error) {
      this.log("Error checking mentions", error);
    }
  }

  private async handleMention(tweet: Tweet) {
    try {
      // Get thread context
      const thread = await this.getThreadContext(tweet.id ?? "");

      // Create event for core processing
      const event: TweetReceived = {
        type: "tweet_received",
        source: this.id,
        content: this.formatTweetContent(tweet),
        tweetId: tweet.id ?? "",
        userId: tweet.userId ?? "",
        username: tweet.username ?? "",
        timestamp: new Date(tweet.timestamp ?? ""),
        metadata: {
          isRetweet: tweet.isRetweet,
          isReply: tweet.isReply,
          hasMedia: tweet.photos.length > 0 || tweet.videos.length > 0,
          url: tweet.permanentUrl,
          threadContext: thread,
          conversationId: tweet.conversationId,
          inReplyToId: tweet.inReplyToStatusId,
        },
      };

      await this.core.emit(event);
      this.log("Processed mention", { tweetId: tweet.id });
    } catch (error) {
      this.log("Error processing mention", error);
    }
  }

  private async getThreadContext(tweetId: string): Promise<string[]> {
    const thread: string[] = [];
    let currentId = tweetId;

    while (currentId && thread.length < 10) {
      // Limit thread depth
      const tweet = await this.scraper.getTweet(currentId);
      if (!tweet) break;

      thread.unshift(tweet.text ?? "");
      currentId = tweet.inReplyToStatusId ?? "";
    }

    return thread;
  }

  private async loadLastCheckedId(): Promise<void> {
    if (!this.core.vectorDb) return;

    const metadata = await this.core.vectorDb.getSystemMetadata(
      "twitter_last_checked"
    );
    if (metadata?.lastId) {
      this.lastCheckedTweetId = BigInt(metadata.lastId);
      this.log("Loaded last checked tweet ID", { id: metadata.lastId });
    }
  }

  private async saveLastCheckedId(): Promise<void> {
    if (!this.core.vectorDb || !this.lastCheckedTweetId) return;

    await this.core.vectorDb.storeSystemMetadata("twitter_last_checked", {
      lastId: this.lastCheckedTweetId.toString(),
      username: this.credentials.username,
      timestamp: new Date().toISOString(),
    });
  }
}
