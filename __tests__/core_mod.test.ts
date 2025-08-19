import { describe, test, expect } from "bun:test";
import {
  registerValidator,
  overrideValidator,
  getValidatorMap,
  makeRule,
  setMessages,
  mergeMessages,
  setLocale,
  getLocale,
  getMessages,
} from "../src/core/mod.ts";

// Note: registries are module-scoped singletons.
// Use unique names per test to avoid cross-test interference.

describe("core/mod - validator registry", () => {
  test("getValidatorMap exposes base validators (e.g., required)", () => {
    const validators = getValidatorMap();
    expect(typeof validators.required).toBe("function");
  });

  test("registerValidator adds a new validator", () => {
    const name = `unit_temp_validator_${Date.now()}`;
    const fn = () => true;
    registerValidator(name, fn);
    const validators = getValidatorMap();
    expect(validators[name]).toBe(fn);
  });

  test("overrideValidator replaces existing validator function", () => {
    const name = `unit_override_${Date.now()}`;
    const fn1 = () => false;
    const fn2 = () => true;
    registerValidator(name, fn1);
    overrideValidator(name, fn2);
    const validators = getValidatorMap();
    expect(validators[name]).toBe(fn2);
  });

  test("makeRule builds a tuple factory", () => {
    const maxLen = makeRule("maxLength");
    expect(maxLen(10)).toEqual(["maxLength", 10]);

    const between = makeRule("between");
    expect(between(1, 5)).toEqual(["between", 1, 5]);
  });
});

describe("core/mod - messages & locale", () => {
  test("setLocale switches current locale (to en)", () => {
    setLocale("en");
    expect(getLocale()).toBe("en");
    const en = getMessages();
    expect(en.required).toBe("Required.");
  });

  test("getMessages for unknown locale returns empty object", () => {
    const unknown = getMessages("xx-unknown-locale");
    expect(Object.keys(unknown).length).toBe(0);
  });

  test("setMessages replaces dictionary for a locale; mergeMessages augments it", () => {
    const locale = `xx-${Date.now()}`;
    setMessages(locale, { hello: "world" });
    expect(getMessages(locale)).toEqual({ hello: "world" });

    mergeMessages(locale, { foo: "bar" });
    expect(getMessages(locale)).toEqual({ hello: "world", foo: "bar" });

    setLocale(locale);
    expect(getLocale()).toBe(locale);
    expect(getMessages()).toEqual({ hello: "world", foo: "bar" });
  });
});
