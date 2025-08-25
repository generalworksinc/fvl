// Core minimal interface for VufForm used by validators
export interface IVufForm {
	emit(eventName: string, ...args: any[]): any;
	getJson(): Record<string, any>;
	isErrorField(fieldName: string): boolean;
}
