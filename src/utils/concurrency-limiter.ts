/**
 * Lightweight concurrency limiter.
 *
 * Useful for bounding the number of in-flight browser/WebSocket/Db operations
 * without the overhead of p-queue or similar.
 *
 * Example with default limit of 3:
 *   const limiter = new ConcurrencyLimiter(3);
 *   await limiter.run(async () => await expensiveOp());
 */
export class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<{ resolve: (value?: any) => void }> = [];
  constructor(private readonly limit: number) {}

  /**
   * Run an async function with concurrency limiting.
   * When the limit is reached, the caller waits for a slot to free up.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push({ resolve }));
      await new Promise<void>((resolve) => {
        // Wait until a queued item signals resolve; spin with setImmediate
        const check = () => {
          if (this.running < this.limit) {
            resolve();
          } else {
            setImmediate(check);
          }
        };
        check();
      });
    }

    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      // Wake up the next waiter if any
      const next = this.queue.shift();
      if (next) {
        next.resolve();
      }
    }
  }
}