import "server-only";

/**
 * pdfjs-dist v5 (used directly and transitively by pdf-parse) calls
 * `Promise.withResolvers`, which only exists on Node 22+. When the deployed
 * runtime is Node 18/20, every PDF text extraction throws
 * `Promise.withResolvers is not a function`, which surfaces as the misleading
 * "PDF text extraction returned empty text" error in the live UI even though
 * the uploaded PDF is perfectly readable.
 *
 * This polyfill guarantees the method exists regardless of the deployed Node
 * version. It must be imported before any pdfjs / pdf-parse code runs.
 */
type WithResolvers = <T>() => {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

const PromiseCtor = Promise as unknown as { withResolvers?: WithResolvers };

if (typeof PromiseCtor.withResolvers !== "function") {
  PromiseCtor.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

export {};
