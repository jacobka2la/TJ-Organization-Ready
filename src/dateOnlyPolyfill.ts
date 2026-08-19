const NativeDate = Date;

const DateProxy = new Proxy(NativeDate, {
  construct(target, args) {
    if (
      args.length === 1 &&
      typeof args[0] === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(args[0])
    ) {
      const [year, month, day] = args[0].split("-").map(Number);
      return new target(year, month - 1, day);
    }

    return Reflect.construct(target, args);
  },
});

globalThis.Date = DateProxy as DateConstructor;
