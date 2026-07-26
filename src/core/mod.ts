// Core public API (placeholder)

import baseMessages from './messages';
import baseValidators, { type ValidatorFunction } from './validators';

export * from './types';

// ----------------------------
// Runtime registries (extensible)
// ----------------------------

const validatorRegistry: Record<string, ValidatorFunction> = {
	...baseValidators,
};

const messagesRegistry: Record<string, Record<string, string>> = {
	...baseMessages,
};

let currentLocale: string = Object.keys(messagesRegistry)[0] || 'ja';

// ----------------------------
// Validator extension API
// ----------------------------

export function registerValidator(name: string, fn: ValidatorFunction): void {
	if (Object.hasOwn(validatorRegistry, name)) {
		throw new Error(`Validator "${name}" is already registered`);
	}
	validatorRegistry[name] = fn;
}

export function overrideValidator(name: string, fn: ValidatorFunction): void {
	if (!Object.hasOwn(validatorRegistry, name)) {
		throw new Error(`Validator "${name}" is not registered`);
	}
	validatorRegistry[name] = fn;
}

export function getValidatorMap(): Readonly<Record<string, ValidatorFunction>> {
	return validatorRegistry;
}

export function makeRule(
	name: string,
): (...params: unknown[]) => [string, ...unknown[]] {
	return (...params: unknown[]) => [name, ...params] as [string, ...unknown[]];
}

// ----------------------------
// Message/i18n extension API
// ----------------------------

export function setMessages(
	locale: string,
	messages: Record<string, string>,
): void {
	messagesRegistry[locale] = { ...messages };
}

export function mergeMessages(
	locale: string,
	partial: Record<string, string>,
): void {
	const current = messagesRegistry[locale] || {};
	messagesRegistry[locale] = { ...current, ...partial };
}

export function setLocale(locale: string): void {
	currentLocale = locale;
}

export function getLocale(): string {
	return currentLocale;
}

export function getMessages(
	locale = currentLocale,
): Readonly<Record<string, string>> {
	return messagesRegistry[locale] || {};
}

// Re-exports
export { validatorRegistry as validators };
export { messagesRegistry as localeMessages };
