// Mermaid and its converter both use shared rendering state and DOM nodes.
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(work: () => Promise<T>): Promise<T> {
    const task = this.tail.then(work);
    this.tail = task.catch(() => undefined);
    return task;
  }
}

export const diagramQueue = new SerialQueue();
