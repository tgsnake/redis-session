# tgsnake redis session.

This framework is Redis Session, it possible to make login session with redis for user.

> This framework required `@tgsnake/core`.

## Example use.

```typescript
import { RedisSession } from '@tgsnake/redis-session';
import { Client } from '@tgsnake/core';
const client = new Client(new RedisSession('session name'), apiHash, apiId);
client.addHandler((update) => {
  console.log(update);
});
client.start({
  botToken: '', // got it from bot father.
});
```

### Move from another session instance.

In this example, we will move from `StringSession` instance.

```typescript
import { Storages } from '@tgsnake/core';
import { RedisSession } from '@tgsnake/redis-session';
const session = new StringSession('valid string session');
session.move(new RedisSession('session name'));
```

### Redis Options.

Fill the 2nd arguments of constructor `RedisSession` with JSON object.

````typescript
interface RedisOptions {
  /**
   * How long should we keep peers in the cache. (in seconds)
   */
  peerExp?: number;
  /**
   * How long should we keep the login information in the cache. (in seconds)
   */
  sessionExp?: number;
  /**
   * separator between session name and session property. (default is ":").
   */
  sessionDelim?: string;
  /**
   * Connect to redis using url. (default is localhost).
   */
  redisUrl?: string;
  /**
   * When redis got error, this function will be called.
   */
  redisError?: { (error: any): any };interface RedisOptions {
  /**
   * How long should we keep peers in the cache. (in seconds)
   */
  peerExp?: number;
  /**
   * How long should we keep the login information in the cache. (in seconds)
   */
  sessionExp?: number;
  /**
   * separator between session name and session property. (default is ":").
   */
  sessionDelim?: string;
  /**
   * Connect to redis using url. (default is localhost).
   */
  redisUrl?: string;
  /**
   * When redis got error, this function will be called.
   */
  redisError?: { (error: any): any };
}```}
````

Example:

```typescript
new RedisSession('session name', {
  redisUrl: 'redis://',
});
```

> For more questions, ask on telegram group ([@tgsnake](https://t.me/tgsnake)) or open github issue.
