# Daydream

This is a proof of concept for an event-driven agent that can respond to tweets and messages.

Traditional agents rely on traditional programming paradigms, of tightly coupled dependencies. This agent is event-driven and has multiple threads of execution with decoupled parts, along with an intent enrichment layer. We pass around generated structured data from part to part - like a brain...

By decoupling the parts from the clients, we can scale the agent horizontally with minimal complexity and less function drilling.

The endgoal is here is to slowly make the LLM do more and more and remove more and more hardcoded logic, with the end goal of having a super intelligent agent that can respond to anything, and act on anything, whilst learning it's own skills. This is the north star.

## How it works:

1. Client consumes events from a source (e.g. Twitter scraping or Discord channel) and emits events to the core.
2. Core processes the content. We process with an LLM and enrich the content with additional information, including fetching from a vector db to contextualize the content. This includes intents and actions, which are structured outputs that the client will act upon.
3. Core emits events to other parts of the system. For example, if the intent is to send a tweet, the core will emit a tweet_request event to the Twitter client.
4. The Agent will then decide to continue or stop the conversation. If it decides to continue, it will come up with a new intent and the cycle will start again.

## Parts

### Consciousness

Consciousness is the brain of the agent. It thinks based on it's own memories and the memories of the world, then decides what to do.

## Setup

To install dependencies:

```bash
bun install
```

Copy the `.env.example` file to `.env` and supply your keys.

```bash
cp .env.example .env
```

To run:

```bash
bun start
```

## TODO:

Stage 1:
We will just be focusing on Twitter for now and making it water tight.

TODO:

- [] Implement Vector DB and adapter
- [] Allow adding of arbitrary Actions
- [] Generalise Twitter client more. We need to handle all logic cleanly. DMs, Tweets, Mentions, Interactions.
