// Core minimal interface for VufForm used by validators
export interface IVufForm {
	emit(eventName: string, ...args: unknown[]): unknown;
	getJson(): Record<string, unknown>;
	isErrorField(fieldName: string): boolean;
}
