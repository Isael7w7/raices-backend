import { ValidationOptions, registerDecorator, ValidationArguments } from 'class-validator'
import { esCurpValida } from '../validators/curp.validator'

/**
 * Decorador de validación para CURP mexicana.
 * Valida que la cadena tenga el formato oficial de 18 caracteres.
 *
 * @example
 * ```ts
 * @IsCurpValida({ message: 'La CURP no es válida' })
 * curp?: string
 * ```
 */
export function IsCurpValida(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isCurpValida',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (!value) return true // Los campos opcionales se validan con @IsOptional
          return esCurpValida(value)
        },
        defaultMessage(args: ValidationArguments) {
          return `${propertyName} no es una CURP válida. Debe tener el formato oficial mexicano de 18 caracteres`
        },
      },
    })
  }
}
