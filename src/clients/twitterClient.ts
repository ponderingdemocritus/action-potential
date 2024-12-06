import { Scraper, type Tweet } from "agent-twitter-client";
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
    this.log("Sending tweet", { content: event.content });
    // TODO: Implement actual tweet sending using scraper
    // For now, just log the attempt
  }

  private async sendDM(event: DMRequest) {
    this.log("Sending DM", { userId: event.userId, content: event.content });
    // TODO: Implement actual DM sending using scraper
  }

  async listen(): Promise<void> {
    if (this.isListening) return;

    await this.initialize();
    this.isListening = true;

    try {
      // Set up continuous monitoring
      this.monitorTweets();
      this.log("Twitter stream monitoring started");
    } catch (error) {
      this.log("Failed to setup Twitter stream", error);
      this.isListening = false;
      throw error;
    }
  }

  private async monitorTweets() {
    // Implement continuous monitoring using intervals to avoid rate limits
    setInterval(async () => {
      try {
        const tweets = await this.fetchLatestTweets();
        for (const tweet of tweets) {
          await this.processTweet(tweet);
        }
      } catch (error) {
        this.log("Error in tweet monitoring", error);
      }
    }, 10000); // Check every 10 seconds
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
      },
    };

    await this.core.emit(tweetEvent);
  }

  private formatTweetContent(tweet: Tweet): string {
    return `
      Author: @${tweet.username}
      Content: ${tweet.text}
      ${tweet.quotedStatus ? `Quoted Tweet: ${tweet.quotedStatus.text}` : ""}
      Time: ${new Date(tweet.timestamp ?? "").toISOString()}
      Engagement: ${tweet.likes} likes, ${tweet.retweets} RTs
    `.trim();
  }

  async stop(): Promise<void> {
    if (this.scraper) {
      // Cleanup any active scraping sessions
      try {
        // await this.scraper.close();
      } catch (error) {
        this.log("Error closing Twitter scraper", error);
      }
    }
    this.isInitialized = false;
    await super.stop();
  }
}
