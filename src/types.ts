type UnasyncedParameters<T extends readonly unknown[]> = {
  [K in keyof T]: T[K] extends (...args: infer P) => infer R
    ? (...args: P) => Awaited<R>
    : T[K];
};

export type Unasynced<T extends (...args: any[]) => Promise<any>> = (
  ...args: UnasyncedParameters<Parameters<T>>
) => Awaited<ReturnType<T>>;
