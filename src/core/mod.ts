// Core public API (placeholder)

export type ValidatorFunction = (value: unknown, form: unknown, ...params: unknown[]) => boolean;

// Validator registry (stubs)
export function registerValidator(name: string, fn: ValidatorFunction): void {
  // TODO: implement registry
}

export function overrideValidator(name: string, fn: ValidatorFunction): void {
  // TODO: implement override
}

export function makeRule(name: string) {
  return (...params: unknown[]) => [name, ...params] as [string, ...unknown[]];
}

// Messages/i18n (stubs)
export function setMessages(locale: string, messages: Record<string, string>): void {
  // TODO: implement
}

export function mergeMessages(locale: string, partial: Record<string, string>): void {
  // TODO: implement
}

export function setLocale(locale: string): void {
  // TODO: implement
}

// Re-exports (when implemented)
export type { };

