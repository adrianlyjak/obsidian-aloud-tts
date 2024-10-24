export type CancellablePromise<T> = Promise<T> & {
  cancel: () => void;
  thenCancellable<O>(
    f: (result: T) => O | Promise<O> | CancellablePromise<O>,
  ): CancellablePromise<O>;
};

export const CancellablePromise = {
  from<T>(p: Promise<T> & { cancel?: () => void }): CancellablePromise<T> {
    return CancellablePromise.cancelFn(
      p.catch((ex) => {
        if (ex instanceof Error && ex.message === "WHEN_CANCELLED") {
          // ignore, mobx does this to the future when the when() is cancelled
          return new Promise<T>(() => {});
        } else {
          throw ex;
        }
      }),
      p.cancel || (() => {}),
    );
  },
  resolve<T = void>(value?: T): CancellablePromise<T> {
    return CancellablePromise.from<T>(Promise.resolve<T>(value!));
  },
  reject(reason: any): CancellablePromise<unknown> {
    return CancellablePromise.from(Promise.reject(reason));
  },
  cancelFn<T>(p: Promise<T>, cancel: () => void): CancellablePromise<T> {
    return Object.assign(p, {
      cancel,

      thenCancellable: <O>(
        fn: (result: T) => O | Promise<O> | CancellablePromise<O>,
      ) => CancellablePromise.mapCancellable(p, cancel, fn),
    });
  },
  mapCancellable<T, O>(
    p: Promise<T>,
    cancel: () => void,
    fn: (result: T) => O | Promise<O> | CancellablePromise<O>,
  ): CancellablePromise<O> {
    let downstream: { cancel: () => void } | undefined = undefined;
    const mapped = p.then((x) => {
      const result = fn(x);
      if (result && typeof (result as any)["cancel"] === "function") {
        downstream = result as any;
      }
      return result;
    });
    const comboCancel = () => {
      cancel();
      downstream?.cancel();
    };
    return CancellablePromise.cancelFn(mapped, comboCancel);
  },
  delay(duration: number): CancellablePromise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined = undefined;
    return CancellablePromise.cancelFn(
      new Promise((resolve) => {
        timer = setTimeout(resolve, duration);
      }),
      () => {
        if (timer) {
          clearTimeout(timer);
        }
      },
    );
  },
  race<T extends readonly CancellablePromise<unknown>[]>(
    values: T,
  ): CancellablePromise<Awaited<T[number]>> {
    const cancel = () => values.map((x) => x.cancel());
    const result = Promise.race(values).then((x) => {
      cancel();
      return x;
    });
    return CancellablePromise.cancelFn(result, cancel);
  },
  deferred<T>(): Deferred<T> {
    const result = {} as any as Deferred<T>;
    let cancel = () => {};
    const promise = new Promise<T>((resolve, reject) => {
      result.resolve = resolve;
      result.reject = reject;
    });
    result.promise = CancellablePromise.cancelFn(promise, cancel);
    result.cancelFn = (fn) => (cancel = fn);
    return result;
  },
  fromEvent<T extends EventTarget, E extends Event>(
    target: T,
    eventName: string,
  ): CancellablePromise<E> {
    let listener: ((event: E) => void) | undefined;

    const promise = new Promise<E>((resolve) => {
      listener = (event: E) => {
        resolve(event);
        target.removeEventListener(eventName, listener as EventListener);
      };
      target.addEventListener(eventName, listener as EventListener);
    });

    const cancel = () => {
      if (listener) {
        target.removeEventListener(eventName, listener as EventListener);
      }
    };

    return CancellablePromise.cancelFn(promise, cancel);
  },
};

export type Deferred<T> = {
  promise: CancellablePromise<T>;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  cancelFn(fn: () => void): void;
};
