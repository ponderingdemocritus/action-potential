import { z } from "zod";

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string(),
  TWITTER_USERNAME: z.string(),
  TWITTER_PASSWORD: z.string(),
  TWITTER_EMAIL: z.string(),
  OPENAI_API_KEY: z.string(),
  //   DISCORD_TOKEN: z.string(),
  CHROMA_URL: z.string().default("http://localhost:8000"),
});

export const env = envSchema.parse(process.env);
