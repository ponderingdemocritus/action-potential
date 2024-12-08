import { Core } from "./core/core";
import { ChromaVectorDB } from "./core/vectorDb";
import { EventProcessor } from "./core/processor";
import { RoomManager } from "./core/roomManager";
import { CoreActionRegistry } from "./core/actions";
import { LLMIntentExtractor } from "./core/intent";
import { TwitterClient } from "./clients/twitterClient";
import { env } from "./core/env";
import { LogLevel } from "./core/logger";
import { LLMClient } from "./core/llm-client";
import { defaultCharacter } from "./core/character";
import { Consciousness } from "./core/consciousness";

async function main() {
  // Initialize VectorDB first
  const vectorDb = new ChromaVectorDB("memories", {
    chromaUrl: "http://localhost:8000",
    logLevel: LogLevel.DEBUG,
  });

  // Initialize RoomManager with VectorDB
  const roomManager = new RoomManager(vectorDb, {
    logLevel: LogLevel.DEBUG,
  });

  const actionRegistry = new CoreActionRegistry();

  // Initialize LLM client
  const llmClient = new LLMClient({
    provider: "anthropic",
    apiKey: env.ANTHROPIC_API_KEY,
  });

  const intentExtractor = new LLMIntentExtractor(llmClient);

  // Initialize processor with dependencies
  const processor = new EventProcessor(
    vectorDb,
    intentExtractor,
    llmClient,
    actionRegistry,
    defaultCharacter,
    LogLevel.DEBUG
  );

  // Initialize Core with all dependencies including VectorDB
  const core = new Core(
    processor,
    roomManager,
    actionRegistry,
    intentExtractor,
    vectorDb,
    {
      logging: {
        level: LogLevel.DEBUG,
        enableColors: true,
        enableTimestamp: true,
      },
    }
  );

  // Initialize consciousness after core is set up
  const consciousness = new Consciousness(core, llmClient, roomManager, {
    intervalMs: 60000, // Think every minute
    minConfidence: 0.7,
    logLevel: LogLevel.DEBUG,
  });

  // Initialize clients with core
  const twitterClient = new TwitterClient(
    "twitter",
    {
      username: env.TWITTER_USERNAME,
      password: env.TWITTER_PASSWORD,
      email: env.TWITTER_EMAIL,
    },
    core
  );

  // Register clients with core
  core.registerClient(twitterClient);

  // Start consciousness
  await consciousness.start();

  // Start listening
  await twitterClient.listen();

  // Handle shutdown
  process.on("SIGINT", async () => {
    console.log("Shutting down...");
    await consciousness.stop();
    await twitterClient.stop();
    process.exit(0);
  });
}

main().catch(console.error);
