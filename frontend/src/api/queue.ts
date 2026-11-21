const tails = new Map<string, Promise<void>>();

// Tasks with the same key run strictly one after another, even if one of them fails.
// Plans are saved whole, so two quick taps must never run at the same time and overwrite each other.
export function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.then(task);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}