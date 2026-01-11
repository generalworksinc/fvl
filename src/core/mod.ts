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

// TODO(gw): registerValidator は「新規登録専用」。既存名がある場合は例外を投げて衝突を検知する実装に変更する
//  - 監査ログ（debug/info）も出力して、意図しない上書きを防止する
export function registerValidator(name: string, fn: ValidatorFunction): void {
	validatorRegistry[name] = fn;
}

// TODO(gw): overrideValidator は「上書き専用」。未登録の場合は例外を投げ、タイプミス等の意図しない新規作成を防止する
//  - 上書き時は警告ログ（warn）を出力して挙動を可視化する
export function overrideValidator(name: string, fn: ValidatorFunction): void {
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
