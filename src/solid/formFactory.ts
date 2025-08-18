import { VufForm, type EmitFunctions, type FieldConfig } from './vufSolid';

export type VufFormPublicMethods = Pick<VufForm<any>,
  'getFieldObject' | 'getFieldValue' | 'setFieldValue' | 'getKey' |
  'addEmit' | 'removeEmit' | 'emit' | 'setData' |
  'getValueJsonStr' | 'getJson' | 'getJsonHeadUpper' | 'getValueJson' |
  'validateWatch' | 'startValid' | 'isErrorField' | 'groupIsValid'
>;

export type MethodRecord = Record<string, (...args: any[]) => any>;

export type ParentMethods = VufFormPublicMethods & { validate(): boolean };

export type MethodsFactory<M extends MethodRecord> = (parent: ParentMethods) => M;

export function createForm<
  T extends Record<string, FieldConfig<any>>,
  M extends MethodRecord
>(
  formDefinition: T,
  methodsFactory: MethodsFactory<M>
) {
  type FormValues = { [K in keyof T]: T[K]['value'] };

  class FormClass extends VufForm<T> {
    constructor(options?: { emits?: EmitFunctions }) {
      super(formDefinition, options);
      const parent = this.createParentMethods();
      const methods = methodsFactory(parent);
      Object.entries(methods).forEach(([name, method]) => { (this as any)[name] = method.bind(this); });
    }

    private createParentMethods(): ParentMethods {
      const self = this;
      return {
        getFieldObject: this.getFieldObject.bind(this),
        getFieldValue: this.getFieldValue.bind(this),
        setFieldValue: this.setFieldValue.bind(this),
        getKey: this.getKey.bind(this),
        addEmit: this.addEmit.bind(this),
        removeEmit: this.removeEmit.bind(this),
        emit: this.emit.bind(this),
        setData: this.setData.bind(this),
        getValueJsonStr: this.getValueJsonStr.bind(this),
        getJson: this.getJson.bind(this),
        getJsonHeadUpper: this.getJsonHeadUpper.bind(this),
        getValueJson: this.getValueJson.bind(this),
        validateWatch: this.validateWatch.bind(this),
        startValid: this.startValid.bind(this),
        isErrorField: this.isErrorField.bind(this),
        groupIsValid: this.groupIsValid.bind(this),
        validate(): boolean { return self.groupIsValid(); },
      };
    }
  }

  type ExtendedForm = FormValues & Omit<VufFormPublicMethods, keyof M> & M & { __valueType?: FormValues };
  const factory = (options?: { emits?: EmitFunctions }) => new FormClass(options) as unknown as ExtendedForm;
  return factory as (options?: { emits?: EmitFunctions }) => ExtendedForm;
}


